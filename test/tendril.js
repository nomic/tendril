var assert = require('assert');

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

    it('injection', function(done) {
        tendril('serviceOne').then(function(serviceOne) {
            assert.strictEqual(serviceOne.two, '2');
            assert.strictEqual(serviceOne.three, '3');

            tendril('serviceFour').then(function(serviceFour) {
                assert.strictEqual(serviceFour.one, '1');
                done();
            });

        }, done);

        tendril.input('serviceTwo', '2');
        tendril.loadDirect('serviceOne', serviceOne);
        tendril.input('serviceThree', '3');
        tendril.loadDirect('serviceFour', serviceFour);

    });

    it('loading returns a promise', function(done) {
        tendril.input('serviceTwo', '2');
        tendril.loadDirect('serviceOne', serviceOne).then(function(serviceOne) {
            assert.strictEqual(serviceOne.two, '2');
            assert.strictEqual(serviceOne.three, '3');
            done();
        });
    });

    it('load multiple services', function(done) {
        tendril.input('serviceTwo', '2');
        tendril.input('serviceThree', '3');
        tendril.loadDirect('serviceOne', serviceOne);
        tendril.loadDirect('serviceFour', serviceFour);

        tendril(['serviceOne', 'serviceFour']).spread(function(serviceOne, serviceFour) {
            assert.strictEqual(serviceOne.two, '2');
            assert.strictEqual(serviceOne.three, '3');
            assert.strictEqual(serviceFour.one, '1');
            done();
        });
    });

    // promises for services

    // wrappers for getters
});