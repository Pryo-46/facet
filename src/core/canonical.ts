/**
 * 正規形シリアライザ（全ツール共通・コア）。
 * Skill 側 .claude/skills/glossary-term-register/scripts/glossary-write.mjs と
 * バイト単位で同一の出力を返すこと（canonical.test.ts の回帰テストで担保）。
 * キー順はスキーマの properties 記載順から実行時に導出する（ハードコード禁止）。
 */
export type JsonSchema = Record<string, unknown>

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export function serialize(value: unknown, schema: JsonSchema): string {
  return JSON.stringify(reorder(value, schema, schema), null, 2) + '\n'
}

function reorder(value: unknown, node: unknown, root: JsonSchema): unknown {
  const s = deref(node, root) as JsonSchema | undefined
  if (Array.isArray(value)) {
    return s?.items ? value.map((v) => reorder(v, s.items, root)) : value
  }
  if (value && typeof value === 'object') {
    const props = (s?.properties ?? {}) as Record<string, unknown>
    const record = value as Record<string, unknown>
    const inSchema = Object.keys(props).filter((k) => k in record)
    const rest = Object.keys(record).filter((k) => !(k in props))
    const out: Record<string, unknown> = {}
    for (const k of [...inSchema, ...rest]) {
      out[k] = reorder(record[k], props[k] ?? {}, root)
    }
    return out
  }
  return value
}

function deref(node: unknown, root: JsonSchema): unknown {
  let s = node as { $ref?: string } | undefined
  for (let i = 0; s && typeof s.$ref === 'string' && i < 20; i++) {
    if (!s.$ref.startsWith('#/')) return s
    s = s.$ref
      .slice(2)
      .split('/')
      .map((seg) => decodeURIComponent(seg).replace(/~1/g, '/').replace(/~0/g, '~'))
      .reduce<unknown>(
        (acc, k) => (acc == null ? acc : (acc as Record<string, unknown>)[k]),
        root,
      ) as { $ref?: string } | undefined
  }
  return s
}
