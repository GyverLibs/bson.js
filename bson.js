//#region Const
// type
const BS_TYPE_MASK = 0b11000000;
const BS_SUBT = 0 << 6;
const BS_INT = 1 << 6;
const BS_STR = 2 << 6;
const BS_CODE = 3 << 6;

// subtype
const BS_SUBT_MASK = 0b00111000;
const BS_NULL = 0 << 3;
const BS_BOOL = 1 << 3;
const BS_CONT = 2 << 3;
const BS_FLOAT = 3 << 3;
const BS_BIN = 4 << 3;

// type int
const BS_INT_SMALL = 1 << 5;
const BS_INT_NEG = 1 << 4;
const BS_GET_SMALLV = x => x & 0b11111;
const BS_GET_INT_LEN = x => x & 0b1111;

// type string
// type code
const BS_EXT_BITS = 5;
const BS_EXT_FLAG = 1 << BS_EXT_BITS;
const BS_EXT_MASK = BS_EXT_FLAG - 1;
const BS_MAX_EXT_LEN = (1 << (BS_EXT_BITS + 8)) - 1;
const BS_GET_LSB = x => x & BS_EXT_MASK;
const BS_GET_MSB = x => x >> BS_EXT_BITS;
const BS_CODE_PREFIX = "__BS#";

// subtype cont
const BS_CONT_ARR = 0 << 0;
const BS_CONT_OBJ = 1 << 0;
const BS_CONT_CLOSE = 0 << 1;
const BS_CONT_OPEN = 1 << 1;

// subtype float
const BS_FLOAT_ZERO = 1;
const BS_FLOAT_SIZE = 4;

// subtype bin
const BS_GET_BIN_LEN = x => x & 0b111;

//#region BSDecoder
export class BSDecoder {
    offset = 0;
    cont = 'root';
    tdec = new TextDecoder();

    constructor(buf, codes) {
        this.buf = buf;
        this.codes = codes;
    }

    /**
     * @returns {Object}
     */
    decode() {
        if (!(this.buf instanceof Uint8Array) || !this.buf.length) return undefined;

        let res = this._decode();
        if (this.offset != this.buf.length) throw this._err("Broken packet");
        return res;
    }
    read(len) {
        if (this.offset + len > this.buf.length) {
            throw this._err("Overflow");
        }
        let res = this.buf.subarray(this.offset, this.offset + len);
        this.offset += len;
        return res;
    }
    readB() {
        return this.read(1)[0];
    }
    readInt(len) {
        let val = 0n;
        let bytes = this.read(len);
        while (len--) val = (val << 8n) | BigInt(bytes[len]);
        return val <= Number.MAX_SAFE_INTEGER ? Number(val) : val;
    }
    _ext(hdr) {
        return BS_GET_LSB(hdr) | ((hdr & BS_EXT_FLAG) ? (this.readB() << BS_EXT_BITS) : 0);
    }
    _close(res, isObj) {
        if (res && res.__close !== undefined) {
            if (isObj === res.__close) return true;
            throw this._err("Wrong close");
        }
        return false;
    }
    _err(e) {
        return new Error(e + ' in ' + JSON.stringify(this.cont));
    }
    _decode() {
        const header = this.readB();

        let type = header & BS_TYPE_MASK;
        if (type == BS_SUBT) type = header & BS_SUBT_MASK;

        switch (type) {
            case BS_CONT:
                if (header & BS_CONT_OPEN) {
                    let isObj = !!(header & BS_CONT_OBJ);
                    let cont = isObj ? {} : [];

                    while (true) {
                        this.cont = cont;

                        let res = this._decode();
                        if (this._close(res, isObj)) return cont;

                        if (isObj) {
                            let val = this._decode();
                            if (this._close(val, isObj)) throw this._err("Missed value");

                            cont[String(res)] = val;
                        } else {
                            cont.push(res);
                        }
                    }
                }
                return { __close: !!(header & BS_CONT_OBJ) };

            case BS_INT:
                if (header & BS_INT_SMALL) {
                    return BS_GET_SMALLV(header);
                } else {
                    let val = this.readInt(BS_GET_INT_LEN(header));
                    return (header & BS_INT_NEG) ? -val : val;
                }

            case BS_STR:
                return this.tdec.decode(this.read(this._ext(header)));

            case BS_CODE:
                return this.codes[this._ext(header)];

            case BS_NULL:
                return null;

            case BS_BOOL:
                return !!(header & 1);

            case BS_FLOAT:
                if (header & BS_FLOAT_ZERO) return 0.0;
                else {
                    const b = this.read(BS_FLOAT_SIZE);
                    return new DataView(b.buffer, b.byteOffset, BS_FLOAT_SIZE).getFloat32(0, true);
                }

            case BS_BIN:
                return this.read(this.readInt(BS_GET_BIN_LEN(header))).slice();
        }
    }
}

//#region BSEncoder
export class BSEncoder {
    arr = [];
    tenc = new TextEncoder();

    constructor(codes = []) {
        this.codes = codes;
    }

    /**
     * @returns {Uint8Array}
     */
    getArray() {
        return Uint8Array.from(this.arr);
    }

    /**
     * @returns {Uint8Array}
     */
    encodeSingle(val) {
        return this.encode(val).getArray();
    }

    /**
     * @param {*} val 
     * @returns {BSEncoder}
     */
    encode(val) {
        let a = this.arr;

        if (Array.isArray(val)) {
            a.push(BS_SUBT | BS_CONT | BS_CONT_ARR | BS_CONT_OPEN);
            val.forEach(v => this.encode(v));
            a.push(BS_SUBT | BS_CONT | BS_CONT_ARR | BS_CONT_CLOSE);
        } else {
            switch (typeof val) {
                case 'object':
                    if (val === null) {
                        a.push(BS_SUBT | BS_NULL);
                    } else if (val instanceof Uint8Array) {
                        let lenb = this._int(val.length);
                        a.push(BS_SUBT | BS_BIN | lenb.length);
                        a.push(...lenb);
                        a.push(...val);
                    } else {
                        a.push(BS_SUBT | BS_CONT | BS_CONT_OBJ | BS_CONT_OPEN);
                        for (let key in val) {
                            this.encode(key);
                            this.encode(val[key]);
                        }
                        a.push(BS_SUBT | BS_CONT | BS_CONT_OBJ | BS_CONT_CLOSE);
                    }
                    break;

                case 'bigint':
                    val = Number(val);

                case 'number':
                    if (Number.isInteger(val)) {
                        if (val >= 0 && val < BS_INT_SMALL) {
                            a.push(BS_INT | BS_INT_SMALL | val);
                        } else {
                            let neg = val < 0;
                            if (neg) val = -val;
                            let bytes = this._int(val);
                            a.push(BS_INT | (neg ? BS_INT_NEG : 0) | bytes.length);
                            a.push(...bytes);
                        }
                    } else {
                        // 0.0 is integer
                        const buffer = new ArrayBuffer(BS_FLOAT_SIZE);
                        new DataView(buffer).setFloat32(0, val, true);
                        a.push(BS_SUBT | BS_FLOAT);
                        a.push(...new Uint8Array(buffer));
                    }
                    break;

                case 'string':
                    if (val.startsWith(BS_CODE_PREFIX)) {
                        val = val.slice(BS_CODE_PREFIX.length);
                        let code = this.codes.indexOf(val);
                        if (code >= 0) this._ext(BS_CODE, code);
                        else this.encode(val);
                    } else {
                        const bytes = this.tenc.encode(val);
                        const len = Math.min(bytes.length, BS_MAX_EXT_LEN);
                        this._ext(BS_STR, len);
                        a.push(...bytes.slice(0, len));
                    }
                    break;

                case 'boolean':
                    a.push(BS_SUBT | BS_BOOL | !!val);
                    break;

                default:
                    a.push(BS_SUBT | BS_NULL);
                    break;
            }
        }

        return this;
    }

    _int(v) {
        let t = [];
        v = BigInt(v);
        while (v) {
            t.push(Number(v & 0xFFn));
            v >>= 8n;
        }
        return t;
    }

    _ext(t, v) {
        let a = this.arr;
        if (v < BS_EXT_FLAG) {
            a.push(t | v);
        } else {
            a.push(t | BS_EXT_FLAG | BS_GET_LSB(v));
            a.push(BS_GET_MSB(v));
        }
    }
}

//#region helper

/**
 * @param {Uint8Array} buf
 * @param {Array} codes
 * @returns {Object|Array|*}
 */
export function decodeBson(buf, codes = []) {
    return new BSDecoder(buf, codes).decode();
}

/**
 * @param {*} val
 * @param {Array} codes
 * @returns {Uint8Array}
 */
export function encodeBson(val, codes = []) {
    return new BSEncoder(codes).encodeSingle(val);
}

export function BSCode(name) {
    return BS_CODE_PREFIX + name;
}