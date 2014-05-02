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

    if(!match || !params) return [];

    return _.map(params.split(','), function(param) {
       return param.match(argExp)[1];
    });
}

module.exports = function Tendril(config) {
    config = _.defaults(config || {}, {
        debug: false
    });

    var services = {tendril: tendril};

    // Chain is inner promise loop, used to sequence user function calls
    var chain = Promise.resolve(null);
    var debugTimer = null;

    function tendril(fn) {
        chain = chain.then(function() {
            return tendril._resolve(fn);
        });

        return tendril;
    }

    function debugThrow(args) {
        if (debugTimer) clearTimeout(debugTimer);
        debugTimer = setTimeout(function() {
            var missing = _.filter(args, function(dep) {
                return services[dep].isPending();
            });
            if (missing.length)
                console.error('MISSING DEPENDENCIES', missing);
        }, 1000);
    }

    // Inject services into a function
    tendril._resolve = function resolve(fn) {
        var args = [];
        if (Array.isArray(fn)) {
            var tmp = fn;
            fn = fn.pop();
            args = tmp;
        } else {
            args = getParams(fn);
        }

        if (config.debug) {
            debugThrow(args);
        }

        return Promise.all(_.map(args, function(name){
            return tendril.get(name);
        })).spread(fn).then(null, function(err) {
            setImmediate(function() {
                throw err;
            });
       });

    };

    // set debug config to true
    tendril.debug = function() {
        config.debug = true;
        return tendril;
    };

    tendril.tree = function(crawls) {
        var results = {};
        return Promise.all(_.map(crawls, function(crawl) {
            Promise.pomisify(fs.readdir)(crawl.path).then(function(files) {
                return Promise.all(_.map(files, function(file) {
                    var name = file.replace(/.js$/,'') + (crawl.postfix || '');
                    results[name] = getParams(require(crawl.path+'/'+file));
                }));
            });
        })).then(function(){
            return results;
        });
    };

    // crawl directory, including services
    tendril.crawl = function(crawls) {
        _.forEach(crawls, function(crawl) {
            fs.readdir(crawl.path, function(err, files) {
                if (err) throw err;

                _.forEach(files, function(file) {
                    var name = file.replace(/.js$/,'') + (crawl.postfix || '');
                    tendril.include(name, require(crawl.path+'/'+file));
                });
            });
        });

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
        inject = typeof inject !== 'undefined' ? inject : true;
        if (typeof name === 'object') {
            _.forEach(name, function(service, serviceName) {
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
            tendril._resolve(getParams(service).concat([function() {
                Promise.resolve(service.apply(null, arguments)).then(function(resolvedService) {
                    tendril.include(name, resolvedService);
                });
            }]), true);
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