'use strict';
var TendrilPromise = require('bluebird/js/main/promise')();
var _ = require('lodash');
var fs = require('fs');
var events = require('events');
var readdir = TendrilPromise.promisify(fs.readdir);

module.exports = Tendril;

function Tendril() {

  // services which are not lazily loaded are loaded at the first resolve
  this.requested = [];
  this.constructors = {};
  this.services = { tendril: TendrilPromise.resolve(this).bind(this) };
  this.eventEmitter = new events.EventEmitter();
  this._isTendril = true;
}

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
Tendril.prototype.include = function include(name, constructor, config) {
  var self = this;

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

  return TendrilPromise.try(function () {
    config = _.defaults(config || {}, {
      inject: true,
      lazy: true
    });
    var inject = config.inject;
    var lazy = config.lazy;

    // already initialized service
    if (!inject) {
      self.services[name] = TendrilPromise.resolve(constructor);
    }

    if (!lazy) {
      self.requested.push(name);
    }

    // Including an object, where values are services and keys are names
    if (typeof name === 'object') {
      return TendrilPromise.all(_.map(name, function (constructor, serviceName) {
        return self.include(serviceName, constructor, config);
      }));

      // constructor is a function or has a setup function on it
    } else if (inject && (typeof constructor === 'function' ||
        typeof constructor === 'object' &&
        typeof constructor.setup === 'function')) {

      if (typeof constructor === 'object') {
        constructor = constructor.setup;
      }

      self.constructors[name] = getConstructor(constructor);
    } else if (inject && Array.isArray(constructor)) {
      self.constructors[name] = getConstructor(constructor);
    } else {
      self.services[name] = TendrilPromise.resolve(constructor);
    }
  })
  .then(function () {
    return self;
  }).bind(this);
};

/*
 * returns a service
 *
 * @param {String} name
 */
Tendril.prototype._getService = function getService(name) {
  var self = this;
  return TendrilPromise.try(function () {
    if (_.isArray(name)) {
      return TendrilPromise.all(_.map(name, getService));
    }

    if (self.services[name]) {
      return self.services[name];
    }

    if (!self.constructors[name]) {
      return TendrilPromise.reject(missingDependencyError(name, self.constructors));
    }

    var circle = circularDependencies(name, name, self.constructors);
    if (circle) {
      return TendrilPromise.reject(new Error('Circular Dependency: ' +
                                       [name].concat(circle).join(' --> ')));
    }

    var constructor = self.constructors[name];

    self.services[name] = TendrilPromise.map(
                            constructor.params,
                            self._getService.bind(self))
    .spread(constructor.fn)
    .tap(function () {
      self.eventEmitter.emit('serviceLoad', {
        name: name,
        instance: self.services[name]
      });
    });

    return self.services[name];
  }).bind(this);
};

/*
 * @param {Function|Array<paramNames..,fn>} - param names are service names
 */
Tendril.prototype.resolve = function resolve(fn, error) {
  var self = this;
  return TendrilPromise.try(function () {
    // default values
    fn = fn || _.noop;
    error = error || function (err) {
      setImmediate(function () {
        throw err;
      });
    };

    var constructor = getConstructor(fn);

    // resolve non-lazy services
    return TendrilPromise.each(self.requested, self._getService.bind(self))
    .then(function () {

      // resolve requested services, and pass them into the function
      return TendrilPromise.map(constructor.params, self._getService.bind(self))
        .spread(constructor.fn);
    }).then(null, error);
  })
  .then(function () {
    return self;
  }).bind(this);
};

/*
 * @param name - event name (e.g. serviceLoad)
 * @param fn - callback fn -> { name: 'serviceName', instance: {Service} }
 */
Tendril.prototype.on = function on(name, fn) {
  var self = this;
  return TendrilPromise.try(function () {
    self.eventEmitter.on(name, fn);
    return self;
  }).bind(this);
};

/*
 * @typedef {Object} Crawl
 *
 * @property {String} path - absolute path of directory to crawl
 * @property {String} [postfix=''] - String to append to filenames as services
 * @property {Boolean} [lazy=true] - only load if required by another service
 */

/*
 * crawl a directory
 *
 * @param {Crawl|Array<Crawl>} crawl
 */
Tendril.prototype.crawl = function _crawl(crawl) {
  var self = this;
  return TendrilPromise.try(function () {

    if (Array.isArray(crawl)) {
      return TendrilPromise.all(_.map(crawl, self.crawl.bind(self)));
    }

    return readdir(crawl.path).map(function (file) {
      var serviceName = file.replace(/\.js$/, '') + (crawl.postfix || '');
      return includeFile(serviceName, file, crawl.path, crawl.lazy);
    });
  })
  .then(function () {
    return self;
  }).bind(this);

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

TendrilPromise.prototype = _.assign(TendrilPromise.prototype,
                      _.transform(Object.keys(Tendril.prototype),
                      function (methods, methodName) {

  methods[methodName] = function () {
    var tendril = this._boundTo;
    var args = arguments;
    return this._then(function () {
      if (!tendril || !tendril._isTendril) {
        throw new Error('Missing tendril object binding');
      }
      return tendril[methodName].apply(tendril, args);
    });
  };
}, {}));

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
