# Tendril
![tendril](http://upload.wikimedia.org/wikipedia/commons/1/17/Vine.jpg)

#### Fancy Dependecy Injection

### Usage:

##### Setup
```js
var tendril = require('tendril');

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
tendril.include('abcService', {hello: 'world'})(function(abcService, xyzService) {
    // services instantiated
})
.include('xyzService', function(abcService){
    return {
        hello: 'world'
    }
})
```

### Submodules
All subfolders in a module (with an index.js) are considered submodules and will attempt to be loaded

##### Overriding submodules
```js
tendril.include('xyzService/oooService', function(abcService) {
    return {
        hello: 'world'
    }
})
```

##### Lazy loading
Only load modules if required by an 'edge' module
Simply exclude the crawl function
```js
tendril.crawl([
        path: __dirname+'/services',
        postfix: 'Service'
    ])(function(qweService, abcService, xyzService){
    // services loaded
})
```
