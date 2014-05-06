'use strict';
var Promise = require('bluebird'),
  _ = require('lodash'),
  fs = require('fs');

function getParams(fn) {
  var functionExp = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
  var commentsExp = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
  var argExp = /^\s*(\S+?)\s*$/;

  var fnString = fn.toString().replace(commentsExp, '');
  var match = fnString.match(functionExp);
  var params = match && match[1];

  if (!match || !params) return [];

  return _.map(params.split(','), function (param) {
    return param.match(argExp)[1];
  });
}

module.exports = function Tendril(config) {
  config = _.defaults(config || {}, {});

  var services = {
    tendril: Promise.resolve(tendril)
  };

  var dependencies = {
      tendril: []
  };

  // Chain is inner promise loop, used to sequence user function calls
  var chain = Promise.resolve(null);
  var failHandler;
  var failure;

  function tendril(fn) {
    chain = chain.then(function () {
      return tendril._resolve(fn, true);
    });

    return tendril;
  }

  // Inject services into a function
  tendril._resolve = function resolve(fn, warn) {
    var args = [];
    if (Array.isArray(fn)) {
      var tmp = fn;
      fn = fn.pop();
      args = tmp;
    } else {
      args = getParams(fn);
    }
    
    if (warn) {
      var missing = _.filter(args, function (dep) {
        if (!services[dep]) return true;
        return false;
      });
      if (missing.length) {
        tendril._fail(new Error('Tendril: Missing dependencies ' + JSON.stringify(missing)));
      }
    }
    
    return Promise.all(_.map(args, function (name) {
      return tendril.get(name);
    })).spread(fn).then(null, function (err) {
      setImmediate(function () {
        throw err;
      });
    });

  };

  // set debug config to true
  tendril.debug = function () {
    config.debug = true;
    return tendril;
  };
  
  tendril._fail = function(err) {
    if (failHandler) {
      failHandler(err);
    } else {
      failure = err;
    }
  };
  
  tendril.fail = function(fn) {
    failHandler = fn;
    if (failure) {
      failHandler(failure);
    }
    return tendril;
  };

  tendril.tree = function (crawls) {
    var results = {};
    return Promise.all(_.map(crawls, function (crawl) {
      Promise.pomisify(fs.readdir)(crawl.path).then(function (files) {
        return Promise.all(_.map(files, function (file) {
          var name = file.replace(/.js$/, '') + (crawl.postfix || '');
          results[name] = getParams(require(crawl.path + '/' + file));
        }));
      });
    })).then(function () {
      return results;
    });
  };

  // crawl directory, including services
  tendril.crawl = function (crawls) {
    
    // crawling a directory blocks the resolution chain
    chain = new Promise(function(resolve, reject) {
    
      _.forEach(crawls, function (crawl) {
        fs.readdir(crawl.path, function (err, files) {
          if (err) return reject(err);

          _.forEach(files, function (file) {
            var name = file.replace(/.js$/, '') + (crawl.postfix || '');
            tendril.include(name, require(crawl.path + '/' + file));
          });
          
          resolve();
        });
      });
      
    }).then(chain);

    return tendril;
  };

  // returns a service
  tendril.get = function get(name) {
    if (_.isArray(name)) {
      return Promise.all(_.map(name, get));
    }

    if (!services[name]) {
      var deferred = Promise.defer();
      services[name] = deferred.promise;
      services[name].deferred = deferred;
    }

    return Promise.resolve(services[name]);
  };

  // directly include a service
  tendril.include = function include(name, service, inject) {
    if (!services[name]) {
      var deferred = Promise.defer();
      services[name] = deferred.promise;
      services[name].deferred = deferred;
    }
    
    inject = typeof inject !== 'undefined' ? inject : true;
    if (typeof name === 'object') {
      _.forEach(name, function (service, serviceName) {
        tendril.include(serviceName, service, inject);
      });

      // service is a function or has a setup function on it
    } else if ((typeof service === 'function' ||
        typeof service === 'object' &&
        typeof service.setup === 'function') &&
      inject) {
      
      if (typeof service === 'object') {
        service = service.setup;
      }
      
      var serviceDeps = getParams(service);
      dependencies[name] = serviceDeps;
      
      var circularDep = _.reduce(serviceDeps, function(circle, dep) {
        var isCircular = dependencies[dep] && _.contains(dependencies[dep], name);
        return isCircular ? dep : circle;
      }, null);

      if (circularDep) {
        tendril._fail(new Error('Tendril: Circular Dependency ' +
                                name + ' <---> ' + circularDep));
      }
      
      tendril._resolve(serviceDeps.concat([
        function () {
          Promise.resolve(service.apply(null, arguments)).then(function (resolvedService) {
            tendril.include(name, resolvedService);
          });
            }]));
    } else {
      if (services[name] && services[name].deferred) {
        services[name].deferred.resolve(Promise.resolve(service));
      } else {
        services[name] = Promise.resolve(service);
      }
    }

    return tendril;
  };
  return tendril;
};