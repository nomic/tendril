'use strict';
/* jshint -W098 */
var chai = require('chai'),
  expect = chai.expect,
  Promise = require('bluebird'),
  _ = require('lodash'),
  domain = require('domain');

describe('Tendril', function () {
  this.timeout(200);

  var Tendril = require('../');

  function serviceOne(serviceTwo, serviceThree) {
    return {
      me: '1',
      two: serviceTwo,
      three: serviceThree,
      roar: function () {
        console.log('a');
      }
    };
  }

  function serviceFour(serviceOne) {
    return {
      one: serviceOne.me
    };
  }

  it('doesn\' touch bluebird', function () {
    expect(require('bluebird').include).to.equal(undefined);
  });

  it('value injection', function () {
    return new Tendril()
      .include('serviceTwo', '2')
      .resolve(['serviceTwo', 'tendril',
      function (serviceTwo, tendril) {
        expect(serviceTwo).to.equal('2');

        return tendril.resolve(function (serviceTwo, tendril) {
          expect(serviceTwo).to.equal('2');
        });
      }]);
  });

  it('function injection', function () {
    return new Tendril()
      .include('serviceTwo', '2')
      .include('serviceThree', '3')
      .then(function (tendril) {
        expect(tendril._isTendril).to.equal(true);
      })
      .include('serviceOne', serviceOne)
      .resolve(function (serviceOne) {
        expect(serviceOne.two).to.equal('2');
        expect(serviceOne.three).to.equal('3');
      });
  });

  it('nested injection', function () {
    return new Tendril()
      .include('serviceTwo', '2')
      .include('serviceOne', serviceOne)
      .include('serviceThree', '3')
      .include('serviceFour', serviceFour)
      .resolve(function (serviceOne, tendril) {
        expect(serviceOne.two).to.equal('2');
        expect(serviceOne.three).to.equal('3');
        return tendril.resolve(function (serviceFour) {
          expect(serviceFour.one).to.equal('1');
        });
    });

  });

  it('object property injection', function () {
    return new Tendril()
      .include({
        serviceOneX: serviceOne,
        serviceTwo: '2',
        serviceThree: '3'
      })
      .resolve(function (serviceOneX) {
        expect(serviceOneX.two).to.equal('2');
        expect(serviceOneX.three).to.equal('3');
      });
  });

  it('object .setup function injection', function () {
    return new Tendril()
      .include('serviceTwo', '2')
      .include('serviceThree', '3')
      .include('serviceOne', serviceOne)
      .include('setupService', {
        setup: function (serviceOne) {
          return {
            one: serviceOne,
            setup: true
          };
        }
      })
    .resolve(function (setupService) {
      expect(setupService.setup).to.equal(true);
    });
  });

  it('loading async', function () {
    return new Tendril()
      .include('serviceThree', '3')
      .include('serviceTwo', '2')
      .include('serviceOne', serviceOne)
      .resolve(function (serviceOne) {
      expect(serviceOne.two).to.equal('2');
      expect(serviceOne.three).to.equal('3');
    });
  });

  it('lazy', function () {
    return new Tendril()
        .include('aaa', function () {
            throw new Error('NOT LAZY?!');
        })
        .include('serviceTwo', '2')
        .resolve(function (serviceTwo) {
            expect(serviceTwo).to.equal('2');
        });
  });

  it('load multiple services', function () {
    return new Tendril()
      .include('serviceTwo', '2')
      .include('serviceThree', '3')
      .include('serviceOne', serviceOne)
      .include('serviceFour', serviceFour)
      .resolve(function (serviceOne, serviceFour) {
        expect(serviceOne.two).to.equal('2');
        expect(serviceOne.three).to.equal('3');
        expect(serviceFour.one).to.equal('1');
    });
  });

  // test crawl
  it('crawls', function () {
    return new Tendril()
      .crawl({
        path: __dirname + '/services',
        postfix: 'Service'
      })
      .resolve(function (abcService, hjkService, xyzService) {
        expect(abcService.abc).to.equal('abc');
        expect(hjkService.abc).to.equal('abc');
        expect(xyzService.abc).to.equal('abc');
      });
  });

  it('optional lazy include', function () {
    return new Tendril()
      .include('counter', function () {
        return {
          cnt: 0
        };
      })
      .include('unlazy', function (counter) {
        counter.cnt = 1;
      }, {
        lazy: false
      })
      .resolve(function (counter) {
        expect(counter.cnt).to.equal(1);
      });
  });

  it('optional lazy crawl', function () {
    return new Tendril()
      .include('counter', function () {
        return {
          cnt: 0
        };
      })
      .crawl([{
        path: __dirname + '/services',
        postfix: 'Service',
        lazy: false
      }])
      .resolve(function (counter) {
        expect(counter.cnt).to.equal(6);
      });
  });


  it('chains', function () {
    var cnt = 0;
    return new Tendril()
      .include('testService', function (hjkService) {
        cnt++;
        return new Promise(function (resolve) {
          _.delay(function () {
            cnt++;
            resolve('done');
          }, 10);
        });
      })
      .crawl([{
        path: __dirname + '/services',
        postfix: 'Service'

        }])
      .resolve(function (testService, abcService, hjkService, xyzService) {
        cnt++;
      })
      .resolve(function () {
        expect(cnt).to.equal(3);
      });
  });

  it('errors if missing dependencies', function(done) {
    return new Tendril()
    .include('null0')
    .resolve(function(nonExistent) {
      done(new Error('Called function within nonExistent service'));
    }, function(err) {
      try {
        expect(err.message).to.equal('Missing Dependency: nonExistent');
      } catch(e) {
        return done(e);
      }
    })
    .include('null1', function (abc) {})
    .include('null2', function (abc) {})
    .resolve(function(null1, null2) {
      done(new Error('Called function within null service'));
    }, function(err) {
      try {
        expect(err.message).to.equal('Missing Dependency: abc\n' +
                                     'Depended on by: null1, null2');
      } catch(e) {
        return done(e);
      }

      done();
    });
  });

  it('detects circular dependencies', function() {
    return new Tendril()
    .include('A', function(A) {
      return 'A';
    })
    .resolve(function (A) {
      throw new Error('Should not resolve');
    }, function(err) {
      expect(err.message).to.equal('Circular Dependency: A --> A');
    });
  });

  it('detects deep circular dependencies', function() {
    return new Tendril()
    .include('A', function(B) {
      return 'A';
    })
    .include('B', function (C) {
      return 'B';
    })
    .include('C', ['A', function (A) {
      return 'C';
    }])
    .resolve(function (A) {
      throw new Error('Should not resolve');
    }, function(err) {
      expect(err.message).to.equal('Circular Dependency: A --> B --> C --> A');
    });
  });

  it('Single service instantiation', function () {
    var abc = 0;
    return new Tendril()
      .include('serviceTwo', function () {
        abc += 1;
      })
      .include('serviceThree', function (serviceTwo) {
        abc += 1;
      }, {
        lazy: false
      })
      .include('serviceFour', function (serviceTwo) {
        abc += 1;
      }, {
        lazy: false
      })
      .include('serviceNever', function (serviceTwo) {
        abc += 1;
      })
      .resolve(['serviceTwo', 'serviceTwo', function (serviceTwo, two, serviceThree) {
        expect(abc).to.equal(3);
      }])
      .resolve(function (serviceTwo) {
        expect(abc).to.equal(3);
      })
      .resolve(function (serviceTwo) {
        expect(abc).to.equal(3);
      });
  });

  it('throws if no error handler', function (done) {
    var d = domain.create();
    d.on('error', function (err) {
      expect(err.message).not.to.equal(undefined);
      done();
    });

    d.run(function () {
      new Tendril()
      .include('A', function(A) {
        return 'A';
      }, {
        lazy: false
      })
      .resolve(function () {
        throw new Error('Should not resolve');
      });

    });

  });

  it('emits events', function () {
    var loaded = [];

    return new Tendril()
    .on('serviceLoad', function (service) {
      loaded.push(service);
    })
    .include('A', function (B) {

    })
    .include('B', function () {

    })
    .include('C', function () {

    })
    .resolve(function (A) {
      expect(loaded.length).to.equal(2);

      expect(typeof loaded[0].instance).to.equal('object');
      expect(loaded[0].name).to.equal('B');

      expect(typeof loaded[1].instance).to.equal('object');
      expect(loaded[1].name).to.equal('A');
    });
  });

  it('nested with constructor', function () {
    return new Tendril()
      .include('router', _.noop, false)
      .include('a', function (router) {
        return 'a';
      })
      .resolve(function (tendril) {
        return tendril
          .include('b', 'b')
          .resolve(function (router, a, b) {
            expect(router()).to.equal(undefined);
          }).then(null, function (err) {
            console.log(err);
          });
      }).then(null, function (err) {
        console.log(err);
      });

  });

  it('crawls with order', function () {
    return new Tendril()
      .include('counter', {cnt: 0})
      .crawl({
        path: __dirname + '/services',
        postfix: 'Service',
        order: ['notlazy.js']
      })
      .then(function (tendril) {
        return tendril.services.counter.then(function (counter) {
          expect(counter.cnt).to.equal(2);
        });
      })
      .resolve(function (counter, addCountFourService) {
        expect(counter.cnt).to.equal(6);
      });
  });

  it('returns from promises unresolved', function () {
    var resolved = false;

    return Promise.resolve(null).then(function () {
      return new Tendril()
        .include('resolved', function () {
          resolved = true;
        }, {
          lazy: false
        });
    })
    .then(function (tendril) {
      return tendril
        .include('resolved', function () {
          resolved = true;
        });
    })
    .then(function () {
      expect(resolved).to.equal(false);
    });


  });

  // test optional inject params
  // test getters
  // test arrays
  // test named includes
});
