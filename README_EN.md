This is an automatic translation and may be incorrect in some places. See the source README and examples for authoritative information.

# bson.js
Unpacker and packer of binary JSON for the library[BSON](https://github.com/GyverLibs/BSON).

[demo](https://gyverlibs.github.io/bson.js/test/)

> **Browser**: https://gyverlibs.github.io/bson.js/bson.min.js

> **Node**: npm i @alexgyver/bson

```js
const codes = [
    'some',
    'string',
    'constants',
];

let test = {
    int: 123,
    float: 3.14,
    arr: [
        "str",
        true,
        1234,
        new Uint8Array([1, 2, 3]),
    ],
    obj: {
        str2: "str2",
        true: true,
    },
    str3: "str3",
    nul: null,
    [BSCode('constants', codes)]: BSCode('string', codes),
    bins: new Uint8Array([1, 2, 3]),
};

let enc = encodeBson(test);
let json = decodeBson(enc, codes);
console.log(json);
```
