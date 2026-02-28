// import { decodeBson, encodeBson, getCode } from 'https://gyverlibs.github.io/bson.js/bson.js';
import { decodeBson, encodeBson, getCode } from '../bson.js';

const url = 'http://192.168.1.54';

const codes = [
    'some',
    'string',
    'constants',
];

// =========== encode ===========
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
    [getCode('constants1')]: getCode('string1'),
    [getCode('constants')]: getCode('string'),
    bins: new Uint8Array([1, 2, 3]),
};

let enc = encodeBson(test, codes);
let json = decodeBson(enc, codes);
console.log(json);

// =========== request ===========
req.onclick = async () => {
    let res = await fetch(url + '/bson');
    try {
        let arr = new Uint8Array(await res.arrayBuffer());
        let json = decodeBson(arr, codes);
        console.log(arr);
        console.log(JSON.stringify(json), JSON.stringify(json).length);
        console.log(json);
        out.innerText = JSON.stringify(json, null, 2);
    } catch (e) {
        console.log(e);
        out.innerText = e;
    }
}