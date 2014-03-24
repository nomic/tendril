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

module.exports = (function() {

    var services = {};
    var config = {
        crawl:[]
    };

    function tendril(fn) {
        var args = [];
        if (Array.isArray(fn)) {
            var tmp = fn;
            fn = fn.pop();
            args = tmp;
        } else {
            args = getParams(fn);
        }

        Promise.all(_.map(args, function(name){
            return tendril.get(name);
        })).spread(fn).done();

        return tendril;
    }

    // set config
    tendril.config = function conf(cfg) {
        config = _.assign(config, cfg);
        return tendril;
    };

    tendril.crawl = function() {
        _.forEach(config.crawl, function(crawl) {
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

    tendril.include = function include(name, service) {
        if (typeof service === 'function') {
            tendril(getParams(service).concat([function() {
                Promise.resolve(service.apply(null, arguments)).then(function(resolvedService) {
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
})();