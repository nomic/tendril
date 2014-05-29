# Tendril
![tendril](http://upload.wikimedia.org/wikipedia/commons/1/17/Vine.jpg)

#### Fancy Dependecy Injection

#### Methods:
```js
/*
 * @param {Function|Array<paramNames..,fn>} - param names are service names
 */
tendril(function (a, b, c) {

})
```
```js
/*
 * @param {String|Object} name - if object, keys are names and values are services
 * @param {Anything|Function} service - the service, if function will inject
 * @param {Boolean} [shouldInject=true] - should attempt to inject function
 * @param {Boolean} [isLazy=true] - only load if required by a sub-service
 */
tendril.include(name, service, shouldInject, isLazy)
```
```js
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
 * @param {Array<Crawl>} crawls
 */
tendril.crawl(crawls)

```
```js
/*
 * @param name - event name (e.g. serviceLoad)
 * @param fn - callback fn -> { name: 'serviceName', instance: {Service} }
 */
tendril.on(name, fn)
```

### Examples:

##### Setup
```js
var tendril = require('tendril')();

tendril
  .crawl([{
    // where to look
    path: __dirname+'/services',

    // added to the end of module names for injection
    postfix: 'Service',

    lazy: true // default
  }])(function(abcService, xyzService) {
    /* only named services loaded because of lazy flag */
  });
```

```js
// services/abc.js
module.exports = function(xyzService) {
  return {
    hello: 'world'
  }
}
```

##### Include/Override
```js
tendril
  .include('abcService', {hello: 'world'})
  .include('xyzService', function(abcService){
    return {
      hello: 'world'
    }
  })
  (function(abcService, xyzService) {
      // services instantiated
  });

```

##### Named parameter injection
```js
tendril
  .include('serviceTwo', '2')
  (['serviceTwo', 'tendril', function(serviceTwo____, ____tendril) {

  }]);
```

##### Nested Injection
```js
tendril
  .include('serviceTwo', '2')
  .include('serviceThree', '3')
  // The current tendril instance can be injected, just like any other service
  (function(serviceTwo, tendril) {
    tendril(function(serviceThree) {

    });
  });
```

##### Inject object
```js
tendril()
  .include({
    serviceOneX: serviceOne,
    serviceTwo: '2',
    serviceThree: '3'
  })(function(serviceOneX) {
    expect(serviceOneX.two).to.equal('2');
    expect(serviceOneX.three).to.equal('3');
    done();
  });
```

##### Include function without injecting it
```js
tendril
  .include('serviceTwo', fn, true) // third optional param to include()
```

##### Include function non-lazily
```js
tendril
  .include('serviceTwo', fn, null, false)
```

##### Error handling for missing dependencies
```js
tendril()
  (function(nonExistent, nonExistent2) {

  }, function(err) {
    // Error: Tendril: Missing dependencies ["nonExistent","nonExistent2"]]
  });
```

##### Events
```js
tendril()
  .on('serviceLoad', function (service) {
    /*
     * {
     *   name: 'A',
     *   instance: {Object}
     * }
     */
  })
  .include('A', 'a')
```

### Submodules - TODO
All subfolders in a module (with an index.js) are considered submodules and will attempt to be loaded

##### Overriding submodules - TODO
```js
tendril.include('xyzService/oooService', function(abcService) {
  return {
    hello: 'world'
  }
})
```
