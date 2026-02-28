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

const BS_D16_MSB = x => (x >> 8) & BS_DATA_MASK;
const BS_D16_LSB = x => x & 0xff;
const BS_D16_MERGE = (msb5, lsb) => ((msb5 << 8) | lsb) >>> 0;

const BS_CODE_PREFIX = "__BS#";

/**
 * @param {Uint8Array} b
 * @param {Array} codes
 * @returns {Object|Array|*}
 */
export function decodeBson(buf, codes = []) {
    if (!(buf instanceof Uint8Array)) return undefined;

    const reader = {
        buf,
        offset: 0,
        decoder: new TextDecoder(),
        read(len) {
            if (this.offset + len > buf.length) {
                throw new Error("Overflow");
            }
            const res = this.buf.subarray(this.offset, this.offset + len);
            this.offset += len;
            return res;
        },
        readB() {
            return this.read(1)[0];
        }
    };

    return _decode(reader, codes);
}

function _decode(r, codes) {
    const header = r.readB();
    const data = BS_DATA(header);

    switch (BS_TYPE(header)) {
        case BS_CONTAINER:
            if (data & BS_CONT_OPEN) {
                let isArr = !!(data & BS_CONT_ARR);
                let cont = isArr ? [] : {};
                let expect = false;
                let key;

                while (true) {
                    let res = _decode(r, codes);

                    if (res && res.__close !== undefined) {
                        if (isArr === res.__close) {
                            if (!isArr && expect) throw new Error("Missed value: " + JSON.stringify(cont));
                            return cont;
                        } else {
                            throw new Error("Wrong close: " + JSON.stringify(cont));
                        }
                    }

                    if (isArr) {
                        cont.push(res);
                    } else {
                        if (expect) cont[key] = res;
                        else key = res;
                        expect = !expect;
                    }
                }
            } else if (data & BS_CONT_CLOSE) {
                return { __close: !!(data & BS_CONT_ARR) };
            } else {
                throw new Error("Unknown cont: " + JSON.stringify(cont));
            }

        case BS_CODE:
            return codes[BS_D16_MERGE(data, r.readB())];

        case BS_STRING: {
            let len = BS_D16_MERGE(data, r.readB());
            return r.decoder.decode(r.read(len));
        }

        case BS_INTEGER: {
            let size = BS_SIZE(data);
            if (!size) return 0;

            let value = 0n;
            const bytes = r.read(size);
            while (size--) value = (value << 8n) | BigInt(bytes[size]);

            if (BS_NEGATIVE(data)) value = -value;
            return (value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER) ? Number(value) : value;
        }

        case BS_BOOLEAN:
            return !!BS_BOOLV(data);

        case BS_NULL:
            return null;

        case BS_FLOAT: {
            const b = r.read(4);
            return new DataView(b.buffer, b.byteOffset, 4).getFloat32(0, true);
        }

        case BS_BINARY: {
            let len = BS_D16_MERGE(data, r.readB());
            return r.read(len).slice();
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
                arr.push(BS_FLOAT);
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
            arr.push(BS_BOOLEAN | !!val);
            break;

        default:
            arr.push(BS_NULL);
            break;
    }
}

export function getCode(name) {
    return BS_CODE_PREFIX + name;
}