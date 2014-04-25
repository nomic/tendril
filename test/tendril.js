var chai = require('chai'),
    expect = chai.expect,
    Promise = require('bluebird'),
    _ = require('lodash');

describe('Tendril', function() {
    var Tendril = require('../');
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
        Tendril()
        .include('serviceTwo', '2')
        (['serviceTwo', 'tendril', function(serviceTwo, tendril) {
            expect(serviceTwo).to.equal('2');

            tendril(function(serviceTwo) {
                expect(serviceTwo).to.equal('2');
                done();
            });
        }]);
    });

    it('function injection', function(done) {
        Tendril()
        .include('serviceTwo', '2')
        .include('serviceThree', '3')
        .include('serviceOne', serviceOne)
        (function(serviceOne) {
            expect(serviceOne.two).to.equal('2');
            expect(serviceOne.three).to.equal('3');
            done();
        });
    });

    it('nested injection', function(done) {
        Tendril()
        .include('serviceTwo', '2')
        .include('serviceOne', serviceOne)
        .include('serviceThree', '3')
        .include('serviceFour', serviceFour)
        (function(serviceOne, tendril) {
            expect(serviceOne.two).to.equal('2');
            expect(serviceOne.three).to.equal('3');

            tendril(function(serviceFour) {
                expect(serviceFour.one).to.equal('1');
                done();
            });
        });

    });

    it('object property injection', function(done) {
       Tendril()
       .include({
           serviceOneX: serviceOne,
           serviceTwo: '2',
           serviceThree: '3'
       })(function(serviceOneX) {
           expect(serviceOneX.two).to.equal('2');
           expect(serviceOneX.three).to.equal('3');
           done();
       });
    });

    it('object .setup function injection', function(done) {
        Tendril()
        .include('serviceTwo', '2')
        .include('serviceThree', '3')
        .include('serviceOne', serviceOne)
        .include('setupService', {
            setup: function(serviceOne) {
                return {
                    setup: true
                };
            }
        })
        (function(setupService) {
            expect(setupService.setup).to.equal(true);
            done();
        });
    });

    it('loading async', function(done) {
        Tendril()
        .include('serviceThree', '3')
        .include('serviceTwo', '2')
        .include('serviceOne', serviceOne)
        (function(serviceOne) {
            expect(serviceOne.two).to.equal('2');
            expect(serviceOne.three).to.equal('3');
            done();
        });
    });

    it('load multiple services', function(done) {
        Tendril()
        .include('serviceTwo', '2')
        .include('serviceThree', '3')
        .include('serviceOne', serviceOne)
        .include('serviceFour', serviceFour)
        (function(serviceOne, serviceFour) {
            expect(serviceOne.two).to.equal('2');
            expect(serviceOne.three).to.equal('3');
            expect(serviceFour.one).to.equal('1');
            done();
        });
    });

    // test crawl
    it('crawls', function(done) {
        Tendril()
        .crawl([{
                path: __dirname+'/services',
                postfix: 'Service'
            }])(function(abcService, hjkService, xyzService) {
            expect(abcService.abc).to.equal('abc');
            expect(hjkService.abc).to.equal('abc');
            expect(xyzService.abc).to.equal('abc');
            done();
        });
    });

    it('chains', function(done) {

        var cnt = 0;
        Tendril()
        .include('testService', function(hjkService) {
            cnt++;
            return new Promise(function(resolve, reject) {
                _.delay(function() {
                    cnt++;
                    resolve('done');
                }, 10);
            });
        })
        .crawl([{
            path: __dirname+'/services',
            postfix: 'Service'
        }])(function(testService, abcService, hjkService, xyzService) {
            cnt++;
        })(function() {
            expect(cnt).to.equal(3);
            done();
        });
    });


    // test optional inject params
    // test getters
    // test arrays
    // test named includes
});