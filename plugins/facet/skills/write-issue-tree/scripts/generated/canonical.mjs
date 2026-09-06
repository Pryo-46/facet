export function stripBom(text) {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
export function serialize(value, schema) {
    return JSON.stringify(reorder(value, schema, schema), null, 2) + '\n';
}
function reorder(value, node, root) {
    const s = deref(node, root);
    if (Array.isArray(value)) {
        return s?.items ? value.map((v) => reorder(v, s.items, root)) : value;
    }
    if (value && typeof value === 'object') {
        const props = (s?.properties ?? {});
        const record = value;
        const inSchema = Object.keys(props).filter((k) => k in record);
        const rest = Object.keys(record).filter((k) => !(k in props));
        const out = {};
        for (const k of [...inSchema, ...rest]) {
            out[k] = reorder(record[k], props[k] ?? {}, root);
        }
        return out;
    }
    return value;
}
function deref(node, root) {
    let s = node;
    for (let i = 0; s && typeof s.$ref === 'string' && i < 20; i++) {
        if (!s.$ref.startsWith('#/'))
            return s;
        s = s.$ref
            .slice(2)
            .split('/')
            .map((seg) => decodeURIComponent(seg).replace(/~1/g, '/').replace(/~0/g, '~'))
            .reduce((acc, k) => (acc == null ? acc : acc[k]), root);
    }
    return s;
}
