import type { EditorProps } from '@/core/registry'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'

// 種別の選択肢はスキーマの enum から実行時に導出する（ハードコードすると enum 改訂時に静かにずれる）
const KIND_OPTIONS = glossarySchema.$defs.term.properties.kind.enum

// M1 の別名セルは読点・カンマ区切りの1入力欄（暫定）。M3 で操作性ごと作り直す
function parseAliases(raw: string): string[] {
  return raw
    .split(/[、,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

const cellInput =
  'w-full bg-transparent px-2 py-1 text-ink outline-none focus:bg-surface rounded-sm'
// レベル2エラー（受け入れて赤表示）はセルの面で示す
const errorCell = 'bg-warning/15'
// warning（undecided / 未定義）はエラーより弱い点線下線。見た目の確定は M7
const warnInput = 'border-b border-dashed border-warning'

export function GlossaryEditor({ data, onChange, issues }: EditorProps<GlossarySchemaVersion1>) {
  const updateTerm = (index: number, patch: Partial<Term>) => {
    const terms = data.terms.map((t, i) => (i === index ? { ...t, ...patch } : t))
    onChange({ ...data, terms })
  }

  // locations を「entityId → 赤表示するフィールド集合」に引き直す。
  // field 'id' は ID 列が UI に無いため行全体の赤表示として扱う
  const marks = new Map<string, Set<string>>()
  for (const issue of issues) {
    for (const loc of issue.locations) {
      const set = marks.get(loc.entityId) ?? new Set<string>()
      if (loc.field !== null) set.add(loc.field)
      marks.set(loc.entityId, set)
    }
  }
  const mark = (id: string, field: string) => (marks.get(id)?.has(field) ? ` ${errorCell}` : '')

  return (
    <div className="p-4">
      <h2 className="mb-3 text-base font-bold text-ink">{data.title}</h2>
      {issues.length > 0 && (
        <ul className="mb-3 list-disc pl-5 text-sm text-warning">
          {issues.map((issue, i) => (
            <li key={`${issue.rule}-${i}`}>{issue.message}</li>
          ))}
        </ul>
      )}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-ink-muted">
            <th className="w-40 px-2 py-1 font-normal">名称</th>
            <th className="w-32 px-2 py-1 font-normal">種別</th>
            <th className="px-2 py-1 font-normal">定義</th>
            <th className="w-44 px-2 py-1 font-normal">別名</th>
            <th className="w-44 px-2 py-1 font-normal">備考</th>
          </tr>
        </thead>
        <tbody>
          {data.terms.map((term, i) => (
            // 行キーは index。ID 重複ファイルを「受け入れて赤表示」するため term.id は
            // キーに使えない（重複キーで描画が壊れる）。並び替え導入時（M3）に再検討する
            <tr
              key={i}
              className={`border-b border-rule align-top${mark(term.id, 'id')}`}
            >
              <td className={mark(term.id, 'name')}>
                <input
                  className={cellInput}
                  defaultValue={term.name}
                  onChange={(e) => {
                    // 空名称は保存対象にしない（スキーマ minLength: 1。空のまま
                    // 書き込むとレベル1違反ファイルを自分で作ることになる）。
                    // 空の間は直前の name がデータ側に残る
                    const v = e.target.value
                    if (v.trim() !== '') updateTerm(i, { name: v })
                  }}
                />
              </td>
              <td>
                <select
                  className={
                    cellInput + (term.kind === 'undecided' ? ` ${warnInput}` : '')
                  }
                  defaultValue={term.kind}
                  onChange={(e) => updateTerm(i, { kind: e.target.value as Term['kind'] })}
                >
                  {KIND_OPTIONS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  className={
                    cellInput + (term.definition === '' ? ` ${warnInput}` : '')
                  }
                  defaultValue={term.definition}
                  onChange={(e) => updateTerm(i, { definition: e.target.value })}
                />
              </td>
              <td className={mark(term.id, 'aliases')}>
                <input
                  className={cellInput}
                  defaultValue={term.aliases.join('、')}
                  onChange={(e) => updateTerm(i, { aliases: parseAliases(e.target.value) })}
                />
              </td>
              <td>
                <input
                  className={cellInput}
                  defaultValue={term.notes}
                  onChange={(e) => updateTerm(i, { notes: e.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
