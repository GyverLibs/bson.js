# bson.js
Распаковщик и запаковщик бинарного JSON для библиотеки [BSON](https://github.com/GyverLibs/BSON).

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
    [getCode('constants', codes)]: getCode('string', codes),
    bins: new Uint8Array([1, 2, 3]),
};

let enc = encodeBson(test);
let json = decodeBson(enc, codes);
console.log(json);
```