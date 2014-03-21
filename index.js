var Promise = require('bluebird'),
    _ = require('lodash');

/*
    The Idea:
    Modules can be loaded in any order
    Their dependencies are specified in their function signature

    As modules are loaded that can be fully resolved of dependencies
    their dependents will get resolved

    injected modules also fulful the resolution on dependents

    All returned services are promises, but will not be at time of injection
*/

module.exports = (function() {

    var services = {};
    var pending = [];
    var requestQueue = [];
    var config = {};

    /*
     * @param cfg {Object} - optional
     * @param fn {Function}
     */
    function tendril(cfg, fn) {
        return tendril.get(cfg)
        if (!fn) {
            fn = cfg
        } else {
            tendril.config(config)
        }
    }

    tendril.config = function(cfg) {
        config = _.extend(config, cfg)
    }

    tendril.get = function get(service) {
        if (_.isArray(service)) {
            return Promise.all(_.map(service, function(service) {
                return tendril.get(service)
            }));
        }

        if (services[service]) {
            return Promise.resolve(services[service]);
        }

        var deferred = Promise.defer();
        requestQueue.push({
            service: service,
            deferred: deferred
        });

        resolve();

        return deferred.promise;
    }

    function getParams(fn) {
        var functionExp = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
        var commentsExp = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
        var argExp = /^\s*(\S+?)\s*$/;

        var fnString = fn.toString().replace(commentsExp, '');
        var match = fnString.match(functionExp);
        var params = match && match[1];

        if(!match || !params) return [];

        return _.map(params.split(','), function(param) {
           return param.match(argExp)[1];
        });
    }

    function isFinishedFn(fn) {
        // count number of remaining injectable parameters
        return getParams(fn).length === 0;
    }

    function updateFn(fn) {
        // if all injectable params available, return a curried function
        // otherwise return original

        var filledParams = _.map(getParams(fn), function(param) {
            return services[param];
        });

        if(_.every(filledParams)) {
            return function() {
                return fn.apply(null, filledParams);
            };
        }

        return fn;
    }

    function resolve() {
        // update pending functions
        var updated = false;
        pending = _.reduce(pending, function(arr, pender) {
            pender.fn = updateFn(pender.fn);

            if (isFinishedFn(pender.fn)) {
                services[pender.name] = pender.fn();
                updated = true;
            } else {
                arr.push(pender);
            }

            return arr;
        }, []);

        if(updated) return resolve();

        // reply to waiting queue
        requestQueue = _.reduce(requestQueue, function(arr, request) {
            var service = services[request.service];
            if (service) {
                request.deferred.resolve(service);
            } else {
                arr.push(request);
            }

            return arr;
        }, []);

    }

    // Read the module directory, figure out dependencies
    // This will eventually not be necessary
    //   as all modules in the directory will be loaded
    tendril.loadRoutes = function loadRoutes(service) {
        var name = service+'|routes';
        return this.loadDirect(name, require('./modules/'+service+'/routes'));
    };

    tendril.loadModule = function loadModule(service) {
        return this.loadDirect(service, require('./modules/'+service));
    };

    tendril.loadDirect = function loadDirect(name, service) {
        pending.push({
            fn: service,
            name: name
        });

        resolve();
        return tendril(name);
    };

    // Inject a built service
    tendril.input = function inject(name, service) {
        services[name] = service;
        resolve();
    };

    return tendril;
})();