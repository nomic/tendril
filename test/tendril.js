var assert = require('assert'),
    Promise = require('bluebird'),
    _ = require('lodash');

describe('Tendril', function() {
    var tendril = require('../');

    function serviceOne(serviceTwo, serviceThree) {
        return {
            me: '1',
            two: serviceTwo,
            three: serviceThree,
            roar: function() {
                console.log('a');
            }
        };
    }

    function serviceFour(serviceOne) {
        return {
            one: serviceOne.me
        };
    }

    it('value injection', function(done) {
        tendril
        .include('serviceTwo', '2')
        (['serviceTwo', function(serviceTwo) {
            assert.strictEqual(serviceTwo, '2');

            tendril(function(serviceTwo) {
                assert.strictEqual(serviceTwo, '2');
                done();
            });
        }]);
    });

    it('function injection', function(done) {
        tendril
        .include('serviceTwo', '2')
        .include('serviceThree', '3')
        .include('serviceOne', serviceOne)
        (function(serviceOne) {
            assert.strictEqual(serviceOne.two, '2');
            assert.strictEqual(serviceOne.three, '3');
            done();
        });
    });

    it('nested injection', function(done) {
        tendril(function(serviceOne) {
            assert.strictEqual(serviceOne.two, '2');
            assert.strictEqual(serviceOne.three, '3');

            tendril(function(serviceFour) {
                assert.strictEqual(serviceFour.one, '1');
                done();
            });
        })
        .include('serviceTwo', '2')
        .include('serviceOne', serviceOne)
        .include('serviceThree', '3')
        .include('serviceFour', serviceFour);

    });

    it('loading async', function(done) {
        tendril
        .include('serviceTwo', '2')
        .include('serviceOne', serviceOne)(function(serviceOne) {
            assert.strictEqual(serviceOne.two, '2');
            assert.strictEqual(serviceOne.three, '3');
            done();
        });
    });

    it('load multiple services', function(done) {
        tendril.include('serviceTwo', '2')
        .include('serviceThree', '3')
        .include('serviceOne', serviceOne)
        .include('serviceFour', serviceFour)
        (function(serviceOne, serviceFour) {
            assert.strictEqual(serviceOne.two, '2');
            assert.strictEqual(serviceOne.three, '3');
            assert.strictEqual(serviceFour.one, '1');
            done();
        });
    });

    // test crawl
    it('crawls', function(done) {
        tendril.config({
            crawl: [{
                path: __dirname+'/services',
                postfix: 'Service'
            }]
        }).crawl()(function(abcService, hjkService, xyzService) {
            assert.strictEqual(abcService.abc, 'abc');
            assert.strictEqual(hjkService.abc, 'abc');
            assert.strictEqual(xyzService.abc, 'abc');
            done();
        });
    });

    it('chains', function(done) {

        var cnt = 0;
        tendril.config({
            crawl: [{
                path: __dirname+'/services',
                postfix: 'Service'
            }]
        })
        .include('testService', function(hjkService) {
            cnt++;
            return new Promise(function(resolve, reject) {
                _.delay(function() {
                    cnt++;
                    resolve('done');
                }, 10);
            });
        })
        .crawl()(function(testService, abcService, hjkService, xyzService) {
            cnt++;
        })(function() {
            assert(cnt === 3);
            done();
        });
    });


    // test optional inject params
    // test getters
    // test arrays
    // test named includes
});