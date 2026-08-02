import { useState } from 'react'
import { CellInput } from '@/components/CellInput'
import type { EditorProps } from '@/core/registry'
import { computeRowKeys } from '@/core/row-keys'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'
import { FIELD_LABELS, type GlossaryField } from './fields'
import { kindLabel } from './kind-labels'
import { EMPTY_FILTER, filterTermIndices, type GlossaryFilter } from './search'

// 種別の選択肢はスキーマの enum から実行時に導出する（ハードコードすると enum 改訂時に静かにずれる）
const KIND_OPTIONS = glossarySchema.$defs.term.properties.kind.enum

const cellInput =
  'w-full bg-transparent px-2 py-1 text-ink outline-none focus:bg-surface rounded-sm'
// レベル2エラー（受け入れて赤表示）と warning（undecided / 未定義）は
// どちらも同系色の面で示し、濃さで強度を区別する。
// 波線下線は表記ゆれの「指摘（suggestion）」用に予約されているため使わない
// （glossary-session-notes 論点5）。濃さの値は仮置きで、確定は M7
const errorCell = 'bg-warning/25'
const warnCell = 'bg-warning/10'

/** セルの DOM 上の識別子。フォーカス移動（Task 12）が querySelector で引く */
function cellId(rowKey: string, field: GlossaryField): string {
  return `${rowKey}:${field}`
}

export function GlossaryEditor({ data, onChange, issues }: EditorProps<GlossarySchemaVersion1>) {
  // 検索・フィルタの UI は Task 14 で足す。ここでは絞り込み無しで通す
  const [filter] = useState<GlossaryFilter>(EMPTY_FILTER)

  const rowKeys = computeRowKeys(data.terms)
  const visible = filterTermIndices(data.terms, filter)

  const updateTerm = (index: number, patch: Partial<Term>, mergeKey: string | null) => {
    const terms = data.terms.map((t, i) => (i === index ? { ...t, ...patch } : t))
    onChange({ ...data, terms }, mergeKey)
  }

  // locations を「配列位置 → 赤表示するフィールド集合」に引き直す。
  // entityId ではなく位置で引く——ID 重複時に同じ ID を持つ全行へ
  // マークが波及しないようにするため（M2 申し送り）。
  // field 'id' は ID 列が UI に無いため行全体の赤表示として扱う
  const marks = new Map<number, Set<string>>()
  for (const issue of issues) {
    for (const loc of issue.locations) {
      if (loc.entityIndex === null) continue
      const set = marks.get(loc.entityIndex) ?? new Set<string>()
      if (loc.field !== null) set.add(loc.field)
      marks.set(loc.entityIndex, set)
    }
  }
  const mark = (index: number, field: string) => (marks.get(index)?.has(field) ? ` ${errorCell}` : '')

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
            <th className="w-40 px-2 py-1 font-normal">{FIELD_LABELS.name}</th>
            <th className="w-32 px-2 py-1 font-normal">{FIELD_LABELS.kind}</th>
            <th className="px-2 py-1 font-normal">{FIELD_LABELS.definition}</th>
            <th className="w-44 px-2 py-1 font-normal">{FIELD_LABELS.aliases}</th>
            <th className="w-44 px-2 py-1 font-normal">{FIELD_LABELS.notes}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((index, visiblePos) => {
            const term = data.terms[index]
            const rowKey = rowKeys[index]
            const row = visiblePos + 1
            return (
              <tr key={rowKey} className={`border-b border-rule align-top${mark(index, 'id')}`}>
                <td className={mark(index, 'name')}>
                  <CellInput
                    className={cellInput}
                    aria-label={`${FIELD_LABELS.name}（${row}行目）`}
                    data-cell={cellId(rowKey, 'name')}
                    value={term.name}
                    // 空の名称はスキーマ違反（minLength 1）なのでデータに載せない。
                    // 空欄の間の表示は CellInput のドラフトが持ち、セルを抜けると戻る
                    sanitize={(raw) => (raw.trim() === '' ? null : raw)}
                    onValueChange={(v) => updateTerm(index, { name: v }, `${rowKey}:name`)}
                  />
                </td>
                <td className={term.kind === 'undecided' ? warnCell : ''}>
                  <select
                    className={cellInput}
                    aria-label={`${FIELD_LABELS.kind}（${row}行目）`}
                    data-cell={cellId(rowKey, 'kind')}
                    value={term.kind}
                    onChange={(e) =>
                      updateTerm(index, { kind: e.target.value as Term['kind'] }, null)
                    }
                  >
                    {KIND_OPTIONS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kindLabel(kind)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={term.definition === '' ? warnCell : ''}>
                  <CellInput
                    className={`${cellInput} placeholder:text-warning/70`}
                    aria-label={`${FIELD_LABELS.definition}（${row}行目）`}
                    data-cell={cellId(rowKey, 'definition')}
                    // 空欄は「未定義」と明示する（負債を消えなくして見せる。
                    // M6 の Markdown 出力が空定義を「（未定義）」と書く仕様と揃える）
                    placeholder="未定義"
                    value={term.definition}
                    onValueChange={(v) =>
                      updateTerm(index, { definition: v }, `${rowKey}:definition`)
                    }
                  />
                </td>
                <td className={mark(index, 'aliases')}>
                  {/* 別名パネルへの差し替えは Task 13。ここでは M1 と同じ読点区切り */}
                  <CellInput
                    className={cellInput}
                    aria-label={`${FIELD_LABELS.aliases}（${row}行目）`}
                    data-cell={cellId(rowKey, 'aliases')}
                    value={term.aliases.join('、')}
                    onValueChange={(v) =>
                      updateTerm(
                        index,
                        { aliases: v.split('、').map((s) => s.trim()).filter((s) => s !== '') },
                        `${rowKey}:aliases`,
                      )
                    }
                  />
                </td>
                <td>
                  <CellInput
                    className={cellInput}
                    aria-label={`${FIELD_LABELS.notes}（${row}行目）`}
                    data-cell={cellId(rowKey, 'notes')}
                    value={term.notes}
                    onValueChange={(v) => updateTerm(index, { notes: v }, `${rowKey}:notes`)}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
