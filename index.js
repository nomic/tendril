'use strict';
var Promise = require('bluebird');
var _ = require('lodash');
var fs = require('fs');
var events = require('events');

var readdir = Promise.promisify(fs.readdir) ;

module.exports = Tendril;

function Tendril() {

  // function constructors
  var constructors = { tendril: tendril };

  // loaded services
  var services = { tendril: Promise.resolve(tendril) };

  // services which are not lazily loaded are loaded at the first function
  var requested = [];

  // Chain is inner promise loop, used to sequence user function calls
  var chain = Promise.resolve(null);

  // used to emit the `serviceLoad` event
  var eventEmitter = new events.EventEmitter();


  /*
   * @param {Function|Array<paramNames..,fn>} - param names are service names
   */
  function tendril(fn, error) {

    // default values
    fn = fn || _.noop;
    error = error || function (err) {
      setImmediate(function () {
        throw err;
      });
    };

    // support named parameters ['abc', function(def) {}]
    var args = [];
    if (Array.isArray(fn)) {
      var tmp = fn;
      fn = fn.pop();
      args = tmp;
    } else {
      args = getParams(fn);
    }

    // user functions must  complete in order, regardless of dependencies
    chain = chain.then(function () {

      // resolve non-lazy services
      return Promise.map(requested, getService);
    }).then(function () {

      // resolve requested services, and pass them into the function
      return Promise.map(args, getService).spread(fn);
    }).then(null, error);

    return tendril;
  }


  /*
   * @param name - event name (e.g. serviceLoad)
   * @param fn - callback fn -> { name: 'serviceName', instance: {Service} }
   */
  tendril.on = function (name, fn) {
    eventEmitter.on(name, fn);
    return tendril;
  };


  /*
   * @typedef {Object} Crawl
   *
   * @param {String} path - absolute path of directory to crawl
   * @param {String} [postfix=''] - String to append to filenames as services
   * @param {Boolean} [lazy=true] - only load if required by another service
   */

  /*
   * crawl a directory
   *
   * @param {Crawl|Array<Crawl>} crawl
   */
  tendril.crawl = function (crawl) {

    if (Array.isArray(crawl)) {
      _.each(crawl, tendril.crawl);
      return tendril;
    }

    // crawling a directory blocks the resolution chain
    chain = readdir(crawl.path).map(function (file) {
      var isDir = /^([^.]|\.\.)+$/.test(file);
      var isJsFile = /\.js$/.test(file);

      var serviceName = file.replace(/\.js$/, '') + (crawl.postfix || '');
      var requirePath = crawl.path + '/' + file;

      // verify index.js exists
      if (isDir) {
        return readdir(requirePath).then(function (files) {
          if (_.contains(files, 'index.js')) {
            return tendril.include(serviceName, require(requirePath), true, crawl.lazy);
          }
        });
      } else if (isJsFile) {
        return tendril.include(serviceName, require(requirePath), true, crawl.lazy);
      }
    }).then(chain);

    return tendril;
  };


  /*
   * @param {String|Object} name - if object, keys are names and values are services
   * @param {Anything|Function} service - the service, if function will inject
   * @param {Boolean} [shouldInject=true] - should attempt to inject function
   * @param {Boolean} [isLazy=true] - only load if required by a sub-service
   */
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
    } else if (inject && (typeof constructor === 'function' ||
        typeof constructor === 'object' &&
        typeof constructor.setup === 'function')) {

      if (typeof constructor === 'object') {
        constructor = constructor.setup;
      }

      constructors[name] = constructor;
    } else {
      services[name] = Promise.resolve(constructor);
    }

    return tendril;
  };


  /*
   * returns a service
   *
   * @param {String} name
   */
  function getService(name) {
    if (_.isArray(name)) {
      return Promise.all(_.map(name, getService));
    }

    if (services[name]) {
      return services[name];
    }

    if (!constructors[name]) {
      return Promise.reject(missingDependencyError(name));
    }

    var circle = circularDependencies(name, constructors[name]);
    if (circle) {
      return Promise.reject(new Error('Circular Dependency: ' +
                                       [name].concat(circle).join(' --> ')));
    }

    var constructor = constructors[name];
    var args = [];

    // support named parameters ['abc', function(def) {}]
    if (Array.isArray(constructor)) {
      var tmp = constructor;
      constructor = constructor.pop();
      args = tmp;
    } else {
      args = getParams(constructor);
    }

    services[name] = Promise.all(_.map(args, function (name) {
      return getService(name);
    }))
    .spread(constructor)
    .tap(function () {
      eventEmitter.emit('serviceLoad', {
        name: name,
        instance: services[name]
      });
    });

    return services[name];
  }

  function missingDependencyError(name) {
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

    return new Error(message);
  }


  /*
   * @param {String} name
   * @param {Function} constructor
   *
   * @returns {Array<String>|null} - Service names, null if no circular deps
   */
  function circularDependencies(name, constructor) {
    var containsSelf = _.contains(getParams(constructor), name);

    if (containsSelf) {
      return [name];
    }

    var innerCircularDependencies = _.reduce(getParams(constructor), function (circle, serviceName) {
      var deeper = circularDependencies(name, constructors[serviceName]);

      if (deeper) {
        return circle.concat([serviceName]).concat(deeper);
      }

      return circle;

    }, []);

    if (innerCircularDependencies.length) {
      return innerCircularDependencies;
    }

    return null;
  }

  return tendril;
}

/*
 * @param {Function|Array<Function>} fn
 *
 * @returns {Array<String>} - parameter names
 */
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
