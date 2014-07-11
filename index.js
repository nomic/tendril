'use strict';
var Promise = require('bluebird/js/main/promise')();
var _ = require('lodash');
var fs = require('fs');
var events = require('events');
var readdir = Promise.promisify(fs.readdir);

module.exports = Tendril;

function Tendril() {

  // services which are not lazily loaded are loaded at the first resolve
  this.requested = [];
  this.constructors = {};
  this.services = { tendril: Promise.resolve(this).bind(this) };
  this.eventEmitter = new events.EventEmitter();
  this._isTendril = true;
}

Tendril.prototype = Object.create(Promise);

Promise.include = classToInstanceFn('include');
Promise.crawl = classToInstanceFn('crawl');
Promise.on = classToInstanceFn('on');
Promise.graph = classToInstanceFn('graph');

/*
 * @typedef {Object} IncludeConfig
 *
 * @property {Boolean} [inject=true] - should attempt to inject function
 * @property {Boolean} [lazy=true] - only load if required by a sub-service
 */

/*
 * @param {String|Object} name - if object, keys are names and values services
 * @param {Anything|Function} constructor - the service, or resolved
 * @param {IncludeConfig} config
 */
Promise.prototype.include = function include(name, constructor, config) {

  // Legacy support for include(name, constructor, inject, lazy)
  if (typeof config === 'boolean') {
    config = {
      inject: config
    };
  } else {
    config = _.defaults(config || {}, {
      inject: true,
      lazy: true
    });
  }

  if (arguments.length === 4) {
    config.lazy = arguments[3] == null ? true : arguments[3];
  }
  // end legacy support

  var self = this;
  var tendril = self._boundTo;
  return this.then(function () {
    if (name === undefined) return tendril;

    var inject = config.inject;
    var lazy = config.lazy;

    // already initialized service
    if (!inject) {
      tendril.services[name] = Promise.resolve(constructor);
    }

    if (!lazy) {
      tendril.requested.push(name);
    }

    // Including an object, where values are services and keys are names
    if (typeof name === 'object') {
      return Promise.all(_.map(name, function (constructor, serviceName) {
        return self.include(serviceName, constructor, inject);
      }));

      // constructor is a function or has a setup function on it
    } else if (inject && (typeof constructor === 'function' ||
        typeof constructor === 'object' &&
        typeof constructor.setup === 'function')) {

      if (typeof constructor === 'object') {
        constructor = constructor.setup;
      }

      tendril.constructors[name] = getConstructor(constructor);
    } else if (inject && Array.isArray(constructor)) {
      tendril.constructors[name] = getConstructor(constructor);
    } else {
      tendril.services[name] = Promise.resolve(constructor);
    }

    return tendril;
  });
};

/*
 * returns a service
 *
 * @param {String} name
 */
Promise.prototype._getService = function getService(name) {
  var self = this;
  var tendril = self._boundTo;
  return this.then(function () {
    if (_.isArray(name)) {
      return Promise.all(_.map(name, getService));
    }

    if (tendril.services[name]) {
      return tendril.services[name];
    }

    if (!tendril.constructors[name]) {
      return Promise.reject(missingDependencyError(name, tendril.constructors));
    }

    var circle = circularDependencies(name, name, tendril.constructors);
    if (circle) {
      return Promise.reject(new Error('Circular Dependency: ' +
                                       [name].concat(circle).join(' --> ')));
    }

    var constructor = tendril.constructors[name];

    tendril.services[name] = Promise.map(constructor.params, self._getService.bind(self))
    .spread(constructor.fn)
    .tap(function () {
      tendril.eventEmitter.emit('serviceLoad', {
        name: name,
        instance: tendril.services[name]
      });
    });

    return tendril.services[name];
  });
};

/*
 * @param name - event name (e.g. serviceLoad)
 * @param fn - callback fn -> { name: 'serviceName', instance: {Service} }
 */
Promise.prototype.on = function on(name, fn) {
  var self = this;
  var tendril = self._boundTo;
  return this.then(function () {
    tendril.eventEmitter.on(name, fn);
    return tendril;
  });
};

/*
 * @param {Function|Array<paramNames..,fn>} - param names are service names
 */
Promise.prototype.resolve = function resolve(fn, error) {
  var self = this;
  var tendril = self._boundTo;
  return this.then(function () {
    // default values
    fn = fn || _.noop;
    error = error || function (err) {
      setImmediate(function () {
        throw err;
      });
    };

    var constructor = getConstructor(fn);

    return self.then(function () {

      // resolve non-lazy services
      return Promise.map(tendril.requested, self._getService.bind(self));
    }).then(function () {

      // resolve requested services, and pass them into the function
      return Promise.map(constructor.params, self._getService.bind(self)).spread(constructor.fn);
    }).then(null, error)
    .then(function () {
      return tendril;
    });
  });
};

/*
 * Inspect the dependencies
 * @param fn - callback fn -> {x: ['y', 'z'], y: ['z'], z: []}
 *             where x depends on y and z, y depends on z, and z depends
 *             on nothing.
 */
Promise.prototype.dependencies = function(fn) {
  var self = this;
  var tendril = self._boundTo;

  //
  // For now, just supporting graphviz "dot" formatting.
  //
  return this.then(function() {
    var dependencies = _.extend(
      _.mapValues(tendril.constructors, function(constructor) {
        return constructor.params;
      }),
      _.mapValues(
        _.omit(tendril.services, 'tendril'),
        function() { return []; }
      )
    );
    fn(dependencies);
    return tendril;
  });
};

/*
 * @typedef {Object} Crawl
 *
 * @property {String} path - absolute path of directory to crawl
 * @property {String} [postfix=''] - String to append to filenames as services
 * @property {Boolean} [lazy=true] - only load if required by another service
 * @property {Array} order - ordered dependencies to be immediately loaded
 */

/*
 * crawl a directory
 *
 * @param {Crawl|Array<Crawl>} crawl
 */
Promise.prototype.crawl = function _crawl(crawl) {
  var self = this;
  var tendril = self._boundTo;
  return this.then(function () {

    if (Array.isArray(crawl)) {
      return Promise.all(_.map(crawl, self.crawl.bind(self)));
    }

    var ordered = _.map(crawl.order || [], function (file) {
      var serviceName = file.replace(/\.js$/, '') + (crawl.postfix || '');
      return {
        serviceName: serviceName,
        file: file
      };
    });

    return Promise.each(ordered, function (service) {
      return includeFile(service.serviceName, service.file, crawl.path, false)
        .then(function () {
          return self.resolve();
        });
    })
    .then(function () {
      return readdir(crawl.path).map(function (file) {
        var serviceName = file.replace(/\.js$/, '') + (crawl.postfix || '');
        return includeFile(serviceName, file, crawl.path, crawl.lazy);
      });
    });
  })
  .then(function () {
    return tendril;
  });

  function includeFile(serviceName, file, path, lazy) {
    var isDir = /^([^.]|\.\.)+$/.test(file);
    var isJsFile = /\.js$/.test(file);

    var requirePath = path + '/' + file;
    var service;

    // verify index.js exists
    if (isDir) {
      return readdir(requirePath).then(function (files) {
        if (_.contains(files, 'index.js')) {
          service = require(requirePath);
          return self.include(serviceName, service, {
            lazy: lazy
          });
        }
      });
    } else if (isJsFile) {
      service = require(requirePath);
      return self.include(serviceName, service, {
        lazy: lazy
      });
    }
  }
};

function classToInstanceFn(name) {
  return function () {
    var promise = Promise.resolve(this).bind(this);
    return promise[name].apply(promise, arguments);
  };
}

/*
 * @param {String} name
 * @param {Object<String, Constructor>} constructors
 *
 * @returns {Error}
 */
function missingDependencyError(name, constructors) {
  var message = 'Missing Dependency: ' + name;
  var dependencies = _.mapValues(constructors, function (constructor) {
    return constructor.params;
  });
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
 * typedef {Object} Constructor
 *
 * @property {Function} fn
 * @property {Array<String>} params
 */

/*
 * @param {String} rootName
 * @param {String} childName
 * @param {Object<String, Constructor>} constructors
 *
 * @returns {Array<String>|null} - Service names, null if no circular deps
 */
function circularDependencies(rootName, childName, constructors) {
  var constructor = constructors[childName];
  if (!rootName || !constructor) {
    return null;
  }

  var containsSelf = _.contains(constructor.params, rootName);

  if (containsSelf) {
    return [rootName];
  }

  var innerCircularDependencies = _.reduce(constructor.params,
    function (circle, serviceName) {
    var deeper = circularDependencies(rootName, serviceName, constructors);

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


/*
 * @param {Function|Array<Function>} fn
 *
 * @returns {Array<String>} - parameter names
 */
function getParams(fn) {
  if (!fn) {
    return [];
  }

  var functionExp = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
  var commentsExp = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
  var argExp = /^\s*(\S+?)\s*$/;

  var fnString = fn.toString().replace(commentsExp, '');
  var match = fnString.match(functionExp);
  var params = match && match[1];

  if (!match || !params) {
    return [];
  }

  return _.map(params.split(','), function (param) {
    return param.match(argExp)[1];
  });
}

/*
 * @param {Function|Array<...Function>} fn
 *
 * @returns {Constructor}
 */
function getConstructor(fn) {
  if (Array.isArray(fn)) {
    var func = fn.pop();
    var params = fn;
    return {
      fn: func,
      params: params
    };
  } else {
    return {
      fn: fn,
      params: getParams(fn)
    };
  }
}
