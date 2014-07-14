# Tendril
![tendril](http://upload.wikimedia.org/wikipedia/commons/1/17/Vine.jpg)

#### Fancy Dependecy Injection

#### Methods:
```js
/*
 * @param {Function|Array<paramNames..,fn>} - param names are service names
 */
tendril.resolve(function (a, b, c) {

})
```
```js
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
tendril.include(name, service, config)
```
```js
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
 * @param {Array<Crawl>|Crawl} crawls
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
```js
/*
 * Inspect the dependencies
 * @param fn - callback fn -> {x: ['y', 'z'], y: ['z'], z: []}
 *             where x depends on y and z, y depends on z, and z depends
 *             on nothing.
 */
tendril.dependencies(fn)
```

### Examples:

##### Setup
```js
var Tendril = require('tendril');

new Tendril()
  .crawl([{
    // where to look
    path: __dirname+'/services',

    // added to the end of module names for injection
    postfix: 'Service',

    lazy: true // default
  }])
  .resolve(function(abcService, xyzService) {
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
new Tendril()
  .include('abcService', {hello: 'world'})
  .include('xyzService', function(abcService){
    return {
      hello: 'world'
    }
  })
  .resolve(function(abcService, xyzService) {
      // services instantiated
  });

```

##### Named parameter injection
```js
new Tendril()
  .include('serviceTwo', '2')
  .resolve(['serviceTwo', 'tendril', function(serviceTwo____, ____tendril) {

  }]);
```

##### Nested Injection
```js
new Tendril()
  .include('serviceTwo', '2')
  .include('serviceThree', '3')
  // The current tendril instance can be injected, just like any other service
  .resolve(function(serviceTwo, tendril) {
    tendril(function(serviceThree) {

    });
  });
```

##### Inject object
```js
new Tendril()
  .include({
    serviceOneX: serviceOne,
    serviceTwo: '2',
    serviceThree: '3'
  })
  .resolve(function(serviceOneX) {
    expect(serviceOneX.two).to.equal('2');
    expect(serviceOneX.three).to.equal('3');
    done();
  });
```

##### Include function without injecting it
```js
new Tendril()
  .include('serviceTwo', fn, true) // third optional param to include()
```

##### Include function non-lazily
```js
new Tendril()
  .include('serviceTwo', fn, null, false)
```

##### Error handling for missing dependencies
```js
new Tendril()
  .include('null')
  .resolve(function(nonExistent, nonExistent2) {

  }, function(err) {
    // Error: Tendril: Missing dependencies ["nonExistent","nonExistent2"]]
  });
```

##### Events
```js
new Tendril()
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
new Tendril()
  .include('xyzService/oooService', function(abcService) {
    return {
      hello: 'world'
    }
})
```
