# Tendril
![tendril](http://upload.wikimedia.org/wikipedia/commons/1/17/Vine.jpg)

#### Fancy Dependecy Injection

### Usage:

##### Setup
```js
var config = {};
var tendril = require('tendril')(config);

tendril.crawl([{
        // where to look
        path: __dirname+'/services',

        // added to the end of module names for injection
        postfix: 'Service'
    }])(function(abcService, xyzService /* optional */) {
    // all services instantiated
})
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
(function(abcService, xyzService) {
    // services instantiated
})
.include('xyzService', function(abcService){
    return {
        hello: 'world'
    }
})
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
```

##### Include function without injecting it
```js
tendril
.include('serviceTwo', fn, true) // third optional param to include()
```

##### Error handling for missing dependencies
```js
new Tendril()
    (function(nonExistent, nonExistent2) {

    }).fail(function(err) {
      // Error: Tendril: Missing dependencies ["nonExistent","nonExistent2"]]
    });
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