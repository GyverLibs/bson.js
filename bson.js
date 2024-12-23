/**
 * @param {Uint8Array} b
 * @param {Array} codes
 * @returns {Object}
 */
export default function decodeBson(b, codes = []) {
    if (!b || !(b instanceof Uint8Array)) return null;
    if (!b.length) return {};

    const BS_STRING = (0 << 5);
    const BS_BOOLEAN = (1 << 5);
    const BS_INTEGER = (2 << 5);
    const BS_FLOAT = (3 << 5);
    const BS_CODE = (4 << 5);
    const BS_BINARY = (5 << 5);
    const BS_CONTAINER = (6 << 5);

    const BS_CONT_OBJ = (1 << 4);
    const BS_CONT_OPEN = (1 << 3);
    const BS_NEGATIVE = (1 << 4);
    const BS_BIN_PREFIX = "__BSON_BINARY";

    function unpack5(msb5, lsb) {
        return ((msb5 << 8) | lsb) >>> 0;
    }
    function makeBins(obj, bins) {
        if (typeof obj !== 'object') return;
        for (let k in obj) {
            if (typeof obj[k] === "object" && obj[k] !== null) {
                makeBins(obj[k], bins);
            } else if (typeof obj[k] === "string" && obj[k].startsWith(BS_BIN_PREFIX)) {
                obj[k] = bins[obj[k].split('#')[1]];
            }
        }
    }

    let bins = [];
    let stack = [];
    let keyf = true;
    let s = '';

    try {
        for (let i = 0; i < b.length; i++) {
            const type = b[i] & 0b11100000;
            const data = b[i] & 0b00011111;

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
                    s += '"' + codes[unpack5(data, b[++i])] + '"';
                    break;

                case BS_STRING: {
                    let len = unpack5(data, b[++i]);
                    i++;
                    let txt = new TextDecoder().decode(b.slice(i, i + len));
                    txt = txt.replaceAll(/([^\\])\\([^\"\\nrt])/ig, "$1\\\\$2")
                        .replaceAll(/\t/ig, "\\t")
                        .replaceAll(/\n/ig, "\\n")
                        .replaceAll(/\r/ig, "\\r")
                        .replaceAll(/([^\\])(")/ig, '$1\\"');
                    s += '"' + txt + '"';
                    i += len - 1;
                } break;

                case BS_INTEGER: {
                    if (data & BS_NEGATIVE) s += '-';
                    let len = data & 0b1111;
                    let v = BigInt(0);
                    for (let j = 0; j < len; j++) {
                        v |= BigInt(b[++i]) << BigInt(j * 8);
                    }
                    s += v;
                } break;

                case BS_BOOLEAN:
                    s += (data & 0b1) ? 'true' : 'false';
                    break;

                case BS_FLOAT: {
                    let v = 0;
                    for (let j = 0; j < 4; j++) {
                        v |= b[++i] << (j * 8);
                    }
                    let f = new Float32Array(new Uint32Array([v]).buffer)[0];
                    s += (isNaN(f) || !isFinite(f)) ? 'null' : f.toFixed(data);
                } break;

                case BS_BINARY: {
                    let len = unpack5(data, b[++i]);
                    i++;
                    s += '"' + BS_BIN_PREFIX + '#' + bins.length + '"';
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
        console.log(s);
        throw new Error("BSON decode error");
    }

    if (s[s.length - 1] == ',') s = s.slice(0, -1);

    try {
        let obj = JSON.parse(s);
        if (bins.length) makeBins(obj, bins);
        return obj;
    } catch (e) {
        console.log(s);
        throw new Error("JSON parse error");
    }
}