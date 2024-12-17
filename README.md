# bson.js
Распаковщик бинарного JSON для библиотеки [BSON](https://github.com/GyverLibs/BSON).

> npm i @alexgyver/bson

```js
const codes = [
    'some',
    'string',
    'constants',
];

let json;
const res = await fetch(...);

try {
    json = decodeBson(new Uint8Array(await res.arrayBuffer()), codes);
} catch (e) { }
```