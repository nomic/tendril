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

module.exports = function Tendril() {

  var constructors = {
    tendril: tendril
  };

  var services = {
      tendril: Promise.resolve(tendril)
  }

  function nameToConstructor(name) {
    if (typeof services[name] === 'string') {
      return require(services[name]);
    }

    return services[name];
  }

  // Chain is inner promise loop, used to sequence user function calls
  var chain = Promise.resolve(null);

  function tendril(fn, errorHandler) {
    errorHandler = errorHandler || _.noop;

    chain = chain.then(function () {
      var args = [];
      if (Array.isArray(fn)) {
        var tmp = fn;
        fn = fn.pop();
        args = tmp;
      } else {
        args = getParams(fn);
      }

      return Promise.all(_.map(args, function (serviceName) {
        return tendril.get(serviceName);
      })).spread(fn).then(null, errorHandler);
    });

    return tendril;
  }

  // Inject services into a function
  tendril._resolve = function resolve(fn, name) {
    if (services[name]) {
      return services[name];
    }

    var args = [];
    if (Array.isArray(fn)) {
      var tmp = fn;
      fn = fn.pop();
      args = tmp;
    } else {
      args = getParams(fn);
    }

    return Promise.all(_.map(args, function (name) {
      return tendril.get(name);
    }))
    .spread(fn)
    .then(function (service) {
        services[name] = Promise.resolve(service);
        return service;
    });

  };

  function circularDependency(name, constructor) {
    var containsSelf = _.contains(getParams(constructor), name);

    if (containsSelf) {
      return name;
    }

    var containedDependency = _.any(_.map(getParams(constructor), function (serviceName) {
      if (services[serviceName]) {
        return false;
      }
      return circularDependency(name, constructors[serviceName]);
    }));

    if (containedDependency) {
      return containedDependency;
    }

    return null;
  }

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

    if (services[name]) {
      return services[name];
    }

    if (!constructors[name]) {
      return Promise.reject(new Error('Missing Dependency'));
    }

    var circle = circularDependency(name, constructors[name]);
    if (circle) {
      return Promise.reject(new Error('Circular Dependency: ' + name));
    }

    return tendril._resolve(constructors[name], name);
  };

  // directly include a service
  tendril.include = function include(name, constructor, inject) {

    inject = typeof inject !== 'undefined' ? inject : true;
    if (!inject) {
      services[name] = Promise.resolve(constructor);
    }

    if (typeof name === 'object') {
      _.forEach(name, function (constructor, serviceName) {
        tendril.include(serviceName, constructor, inject);
      });

      // constructor is a function or has a setup function on it
    } else if ((typeof constructor === 'function' ||
        typeof constructor === 'object' &&
        typeof constructor.setup === 'function') &&
      inject) {

      if (typeof constructor === 'object') {
        constructor = constructor.setup;
      }

      constructors[name] = constructor;
    } else {
      services[name] = Promise.resolve(constructor);
    }


    return tendril;
  };
  return tendril;
};
