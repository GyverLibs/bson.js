const BS_STRING = (0 << 5);
const BS_BOOLEAN = (1 << 5);
const BS_INTEGER = (2 << 5);
const BS_FLOAT = (3 << 5);
const BS_CODE = (4 << 5);
const BS_BINARY = (5 << 5);
const BS_CONTAINER = (6 << 5);
const BS_NULL = (7 << 5);

const BS_CONT_OBJ = (1 << 4);
const BS_CONT_OPEN = (1 << 3);
const BS_CONT_ARR = (1 << 2);
const BS_CONT_CLOSE = (1 << 1);

const BS_MAX_LEN = 0b0001111111111111;

const BS_TYPE_MASK = 0b11100000;
const BS_TYPE = x => x & BS_TYPE_MASK;
const BS_DATA_MASK = 0b00011111;
const BS_DATA = x => x & BS_DATA_MASK;

const BS_BOOLV_MASK = 0b1;
const BS_BOOLV = x => x & BS_BOOLV_MASK;

const BS_NEG_MASK = 0b10000;
const BS_NEGATIVE = x => x & BS_NEG_MASK;
const BS_SIZE_MASK = 0b01111;
const BS_SIZE = x => x & BS_SIZE_MASK;

const BS_FLOAT_SIZE = 4;
const BS_DEC_MASK = 0b1111;
const BS_DECIMAL = x => x & BS_DEC_MASK;

const BS_D16_MSB = x => (x >> 8) & BS_DATA_MASK;
const BS_D16_LSB = x => x & 0xff;
const BS_D16_MERGE = (msb5, lsb) => ((msb5 << 8) | lsb) >>> 0;

const BS_BIN_PREFIX = "__BSON_BIN_";
const BS_CODE_PREFIX = "__BSON_CODE_";

/**
 * @param {Uint8Array} b
 * @param {Array} codes
 * @returns {Object}
 */
export function decodeBson(b, codes = []) {
    if (!b || !(b instanceof Uint8Array)) return null;
    if (!b.length) return {};

    let bins = [];
    let stack = [];
    let keyf = true;
    let s = '';

    try {
        for (let i = 0; i < b.length; i++) {
            const type = BS_TYPE(b[i]);
            const data = BS_DATA(b[i]);

            switch (type) {

                case BS_CONTAINER:
                    if (data & BS_CONT_OPEN) {
                        let t = (data & BS_CONT_OBJ) ? '{' : '[';
                        s += t;
                        stack.push(t);
                    } else {
                        if (s[s.length - 1] == ',') s = s.slice(0, -1);
                        let t = (data & BS_CONT_OBJ) ? '}' : ']';
                        s += t + ',';
                        stack.pop();
                    }
                    keyf = true;
                    continue;

                case BS_CODE:
                    s += '"' + codes[BS_D16_MERGE(data, b[++i])] + '"';
                    break;

                case BS_STRING: {
                    let len = BS_D16_MERGE(data, b[++i]);
                    s += JSON.stringify(new TextDecoder().decode(b.slice(i + 1, i + 1 + len)));
                    i += len;
                } break;

                case BS_INTEGER: {
                    if (BS_NEGATIVE(data)) s += '-';
                    let len = BS_SIZE(data);
                    let u8 = new Uint8Array(8);
                    u8.set(b.slice(i + 1, i + 1 + len));
                    s += new BigUint64Array(u8.buffer)[0];
                    i += len;
                } break;

                case BS_BOOLEAN:
                    s += BS_BOOLV(data) ? 'true' : 'false';
                    break;

                case BS_NULL:
                    s += 'null';
                    break;

                case BS_FLOAT: {
                    let f = new DataView(b.buffer, b.byteOffset + i + 1, BS_FLOAT_SIZE).getFloat32(0, true);
                    s += (isNaN(f) || !isFinite(f)) ? 'null' : f.toFixed(BS_DECIMAL(data));
                    i += BS_FLOAT_SIZE;

                } break;

                case BS_BINARY: {
                    let len = BS_D16_MERGE(data, b[++i]);
                    i++;
                    s += '"' + BS_BIN_PREFIX + bins.length + '"';
                    bins.push(b.slice(i, i + len));
                    i += len - 1;
                } break;

            }

            if (stack[stack.length - 1] === '{') {
                s += keyf ? ':' : ',';
                keyf = !keyf;
            } else {
                s += ',';
            }
        }
    } catch (e) {
        console.error(e, s);
        throw new Error("BSON decode error");
    }

    if (s[s.length - 1] == ',') s = s.slice(0, -1);

    try {
        let obj = JSON.parse(s);
        if (bins.length) _makeBins(obj, bins);
        return obj;
    } catch (e) {
        console.error(e, s);
        throw new Error("JSON parse error");
    }
}

function _makeBins(obj, bins) {
    if (typeof obj !== 'object') return;
    for (let k in obj) {
        if (typeof obj[k] === "object" && obj[k] !== null) {
            _makeBins(obj[k], bins);
        } else if (typeof obj[k] === "string" && obj[k].startsWith(BS_BIN_PREFIX)) {
            obj[k] = bins[obj[k].slice(BS_BIN_PREFIX.length)];
        }
    }
}

/**
 * @param {*} val
 * @returns {Uint8Array}
 */
export function encodeBson(val, codes = []) {
    let arr = [];
    _encode(val, arr, codes);
    return Uint8Array.from(arr);
}

function _encode(val, arr, codes) {
    if (Array.isArray(val)) {
        arr.push(BS_CONTAINER | BS_CONT_ARR | BS_CONT_OPEN);
        val.forEach(v => _encode(v, arr, codes));
        arr.push(BS_CONTAINER | BS_CONT_ARR | BS_CONT_CLOSE);
        return;
    }

    switch (typeof val) {
        case 'object':
            if (val === null) {
                arr.push(BS_NULL);
            } else if (val instanceof Uint8Array) {
                const len = Math.min(val.length, BS_MAX_LEN);
                arr.push(BS_BINARY | BS_D16_MSB(len));
                arr.push(BS_D16_LSB(len));
                arr.push(...val.slice(0, len));
            } else {
                arr.push(BS_CONTAINER | BS_CONT_OBJ | BS_CONT_OPEN);
                for (const [key, value] of Object.entries(val)) {
                    _encode(key, arr, codes);
                    _encode(value, arr, codes);
                }
                arr.push(BS_CONTAINER | BS_CONT_OBJ | BS_CONT_CLOSE);
            }
            break;

        case 'bigint':
        case 'number':
            if (Number.isInteger(val)) {
                val = BigInt(val);
                const neg = val < 0;
                if (neg) val = -val;
                let bytes = [];
                while (val) {
                    bytes.push(Number(val & 0xFFn));
                    val >>= 8n;
                }
                arr.push(BS_INTEGER | (neg ? BS_NEG_MASK : 0) | bytes.length);
                arr.push(...bytes);
            } else {
                const buffer = new ArrayBuffer(BS_FLOAT_SIZE);
                new DataView(buffer).setFloat32(0, val, true);
                arr.push(BS_FLOAT | 4);
                arr.push(...new Uint8Array(buffer));
            }
            break;

        case 'string':
            if (val.startsWith(BS_CODE_PREFIX)) {
                val = val.slice(BS_CODE_PREFIX.length);
                let code = codes.indexOf(val);
                if (code >= 0) {
                    arr.push(BS_CODE | BS_D16_MSB(code));
                    arr.push(BS_D16_LSB(code));
                } else {
                    _encode(val, arr, codes);
                }
            } else {
                const bytes = new TextEncoder().encode(val);
                const len = Math.min(bytes.length, BS_MAX_LEN);
                arr.push(BS_STRING | BS_D16_MSB(len));
                arr.push(BS_D16_LSB(len));
                arr.push(...bytes.slice(0, len));
            }
            break;

        case 'boolean':
            arr.push(BS_BOOLEAN | (val ? 1 : 0));
            break;

        default:
            arr.push(BS_NULL);
            break;
    }
}

export function getCode(name) {
    return BS_CODE_PREFIX + name;
}