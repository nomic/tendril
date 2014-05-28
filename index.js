'use strict';
var Promise = require('bluebird');
var _ = require('lodash');
var fs = require('fs');

var readdir = Promise.promisify(fs.readdir) ;

module.exports = Tendril;

function Tendril() {
  var constructors = { tendril: tendril };
  var services = { tendril: Promise.resolve(tendril) };
  var requested = [];

  // Chain is inner promise loop, used to sequence user function calls
  var chain = Promise.resolve(null);

  function tendril(fn, error) {
    fn = fn || _.noop;
    error = error || function (err) {
      setImmediate(function () {
        throw err;
      });
    };

    chain = chain.then(function () {

      // resolve non-lazy services
      return Promise.all(_.map(requested, tendril.get.bind(tendril)));
    }).then(function () {
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
      })).spread(fn);
    }).then(null, error);

    return tendril;
  }

  // crawl directory, including services
  tendril.crawl = function (crawls) {

    // crawling a directory blocks the resolution chain
    chain = Promise.all(_.map(crawls, function (crawl) {
        var lazy = crawl.lazy == null ? true : crawl.lazy;

        return readdir(crawl.path).then(function (files) {
          return Promise.all(_.map(files, function (file) {

            // only crawl .js files or directories with index.js
            var isJsFile = /\.js$/.test(file);
            var isDir = /^([^.]|\.\.)+$/.test(file);
            if (!isJsFile && !isDir) {
              return;
            }

            var name = file.replace(/\.js$/, '') + (crawl.postfix || '');

            var include = function() {
              tendril.include(name, require(crawl.path + '/' + file));

              if (!lazy) {
                requested.push(name);
              }
            };

            if (isDir) {

              // verify index.js exists
              return readdir(crawl.path + '/' + file).then(function (files) {
                if (_.contains(files, 'index.js')) {
                  include();
                }
              });
            } else {
              include();
              return;
            }

          }));
        });
      }))
      .then(chain);

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
      var message = 'Missing Dependency: ' + name;
      var dependencies = _.mapValues(constructors, getParams);
      var missing = _.reduce(dependencies, function (missing, dep, service) {
        if (_.contains(dep, name)) {
          return missing.concat(service);
        }
        return missing;
      }, []);
      if (missing.length) {
        message += '\nDepended on by: ' + missing.join(', ');
      }
      return Promise.reject(new Error(message));
    }

    var circle = circularDependency(name, constructors[name]);
    if (circle.length) {
      return Promise.reject(new Error('Circular Dependency: ' +
                                       [name].concat(circle).join(' --> ')));
    }

    var constructor = constructors[name];
    var args = [];
    if (Array.isArray(constructor)) {
      var tmp = constructor;
      constructor = constructor.pop();
      args = tmp;
    } else {
      args = getParams(constructor);
    }

    services[name] = Promise.all(_.map(args, function (name) {
      return tendril.get(name);
    }))
    .spread(constructor);

    return services[name];
  };

  // directly include a service
  tendril.include = function include(name, constructor, inject, lazy) {

    inject = inject == null ? true : inject;
    lazy = lazy == null ? true : lazy;

    if (!inject) {
      services[name] = Promise.resolve(constructor);
    }

    if (!lazy) {
      requested.push(name);
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

  function circularDependency(name, constructor) {
    var containsSelf = _.contains(getParams(constructor), name);

    if (containsSelf) {
      return [name];
    }

    var containedDependency = _.reduce(getParams(constructor), function (circle, serviceName) {
      if (services[serviceName]) {
        return circle;
      }
      var deeper = circularDependency(name, constructors[serviceName]);
      if (deeper.length) {
        return circle.concat([serviceName]).concat(deeper);
      }
      return circle;

    }, []);

    if (containedDependency.length) {
      return containedDependency;
    }

    return [];
  }

  return tendril;
}

function getParams(fn) {
  if (!fn) return [];

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
