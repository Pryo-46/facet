import { useEffect, useRef, useState } from 'react'
import { CellInput, type FieldState } from '@/components/CellInput'
import {
  resolveCommand,
  toKeyEventLike,
  type Command,
  type KeyContext,
} from '@/core/keyboard/keymap'
import { currentPlatform } from '@/core/keyboard/platform'
import { insertAt, moveItem, removeAt } from '@/core/list-ops'
import { newId } from '@/core/new-id'
import type { EditorProps } from '@/core/registry'
import { computeRowKeys } from '@/core/row-keys'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'
import { AliasCell } from './AliasCell'
import { FIELD_LABELS, stepField, type GlossaryField } from './fields'
import { kindLabel } from './kind-labels'
import { EMPTY_FILTER, filterTermIndices, isDerivedView, type GlossaryFilter } from './search'

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

const PLATFORM = currentPlatform()

/**
 * 新規行の既定の名称。空文字はスキーマ違反（minLength 1）なので置けない——
 * 空のまま自動保存が走ると、次に開けないファイルを自分で作ることになる。
 * 放置すると2件目から名称重複で赤くなるが、それは「名前を付けていない用語が
 * 2つある」という正しい指摘（未定義を消せなくする、という設計思想の適用）
 */
const NEW_TERM_NAME = '新しい用語'

function newTerm(): Term {
  return {
    id: newId('term'),
    name: NEW_TERM_NAME,
    kind: 'undecided',
    definition: '',
    aliases: [],
    notes: '',
  }
}

/** セルにフォーカスを移す。data-cell 属性で引く */
function focusCell(container: HTMLElement | null, rowKey: string, field: GlossaryField): boolean {
  const el = container?.querySelector<HTMLElement>(`[data-cell="${cellId(rowKey, field)}"]`)
  if (!el) return false
  el.focus()
  return true
}

export function GlossaryEditor({ data, onChange, issues }: EditorProps<GlossarySchemaVersion1>) {
  const [filter, setFilter] = useState<GlossaryFilter>(EMPTY_FILTER)

  const containerRef = useRef<HTMLDivElement>(null)
  // 構造操作の後、新しい DOM が出てからフォーカスを移すための予約
  const [pendingFocus, setPendingFocus] = useState<{
    rowKey: string
    field: GlossaryField
  } | null>(null)

  useEffect(() => {
    if (pendingFocus === null) return
    focusCell(containerRef.current, pendingFocus.rowKey, pendingFocus.field)
    setPendingFocus(null)
  }, [pendingFocus])

  const rowKeys = computeRowKeys(data.terms)
  const visible = filterTermIndices(data.terms, filter)

  const updateTerm = (index: number, patch: Partial<Term>, mergeKey: string | null) => {
    const terms = data.terms.map((t, i) => (i === index ? { ...t, ...patch } : t))
    onChange({ ...data, terms }, mergeKey)
  }

  // 導出表示中（検索・フィルタ適用中）は並び替えを止める（session-notes 論点4）
  const reorderEnabled = !isDerivedView(filter)

  const insertRowAfter = (index: number) => {
    const term = newTerm()
    onChange({ ...data, terms: insertAt(data.terms, index + 1, term) }, null)
    // 採番したての ID は重複しないので出現順は 0
    setPendingFocus({ rowKey: `${term.id}#0`, field: 'name' })
  }

  const deleteRow = (index: number) => {
    onChange({ ...data, terms: removeAt(data.terms, index) }, null)
    if (index - 1 >= 0) setPendingFocus({ rowKey: rowKeys[index - 1], field: 'name' })
  }

  const moveRow = (index: number, delta: -1 | 1, field: GlossaryField) => {
    const to = index + delta
    if (to < 0 || to >= data.terms.length) return
    const terms = moveItem(data.terms, index, to)
    onChange({ ...data, terms }, null)
    // 移動後の配列から鍵を引く。ID が重複していると入れ替えで出現順が変わり、
    // 移動前の rowKeys[index] は別の行を指しうる
    setPendingFocus({ rowKey: computeRowKeys(terms)[to], field })
  }

  /** 表示中の並びで n 番目の行の指定セルへフォーカスする */
  const focusVisible = (visiblePos: number, field: GlossaryField): boolean => {
    const index = visible[visiblePos]
    if (index === undefined) return false
    return focusCell(containerRef.current, rowKeys[index], field)
  }

  /** コマンドを用語集の構造へ写像する。戻り値 true＝消費した（既定動作を止める） */
  const runCommand = (
    cmd: Command,
    at: { index: number; visiblePos: number; field: GlossaryField },
  ): boolean => {
    switch (cmd) {
      case 'insert-item-after':
        insertRowAfter(at.index)
        return true
      case 'delete-item':
        deleteRow(at.index)
        return true
      case 'move-item-up':
        moveRow(at.index, -1, at.field)
        return true
      case 'move-item-down':
        moveRow(at.index, 1, at.field)
        return true
      case 'focus-prev':
        return focusVisible(at.visiblePos - 1, at.field)
      case 'focus-next':
        return focusVisible(at.visiblePos + 1, at.field)
      case 'focus-next-field': {
        const step = stepField(at.field, 1)
        return focusVisible(at.visiblePos + step.rowDelta, step.field)
      }
      case 'focus-prev-field': {
        const step = stepField(at.field, -1)
        return focusVisible(at.visiblePos + step.rowDelta, step.field)
      }
      case 'cancel':
        // 編集の打ち切り。フォーカスを外すと CellInput が確定値に戻す
        ;(document.activeElement as HTMLElement | null)?.blur()
        return true
      default:
        // undo / redo は額縁（App）のグローバル層が取る。ここでは消費しない
        return false
    }
  }

  /** セルのキー入力。キーの判定はコアの resolveCommand に委ねる（rev 10章） */
  const onCellKeyDown = (
    e: React.KeyboardEvent,
    at: { index: number; visiblePos: number; field: GlossaryField },
    field: Pick<
      KeyContext,
      'editing' | 'fieldEmpty' | 'deletableField' | 'caretAtStart' | 'caretAtEnd' | 'arrowsOwnedByField'
    >,
  ) => {
    const cmd = resolveCommand(toKeyEventLike(e), {
      platform: PLATFORM,
      // M4 の削除確認・M5 の二択ダイアログを出すときにここへ渡す
      modalOpen: false,
      reorderEnabled,
      ...field,
    })
    if (cmd === null) return
    if (runCommand(cmd, at)) e.preventDefault()
  }

  /** テキストセル共通の文脈。空欄 Backspace の行削除は名称セルだけ認める */
  const textFieldContext = (state: FieldState, deletableField: boolean) => ({
    editing: true,
    fieldEmpty: state.empty,
    deletableField,
    caretAtStart: state.caretAtStart,
    caretAtEnd: state.caretAtEnd,
    arrowsOwnedByField: false,
  })

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
    <div ref={containerRef} className="p-4">
      <h2 className="mb-3 text-base font-bold text-ink">{data.title}</h2>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="用語を検索"
          className="w-64 rounded-sm border border-rule bg-canvas px-2 py-1 text-sm text-ink outline-none focus:bg-surface"
          placeholder="名称・別名・定義を検索"
          value={filter.query}
          onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
        />
        {KIND_OPTIONS.map((kind) => {
          const active = filter.kinds.includes(kind)
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              className={`rounded-sm border border-rule px-2 py-1 text-xs ${
                active ? 'bg-ink text-canvas' : 'text-ink-muted hover:bg-surface'
              }`}
              onClick={() =>
                setFilter((f) => ({
                  ...f,
                  kinds: active ? f.kinds.filter((k) => k !== kind) : [...f.kinds, kind],
                }))
              }
            >
              {kindLabel(kind)}
            </button>
          )
        })}
        <span className="text-xs text-ink-muted">
          {visible.length} / {data.terms.length} 件
        </span>
        {!reorderEnabled && (
          // データ順と表示順が食い違う状態での並び替えは結果が予測不能になる
          // （session-notes 論点4）。無効であることを画面でも示す
          <span className="text-xs text-ink-muted">
            検索・フィルタ中は並び替え（Alt+↑↓）を使えません
          </span>
        )}
      </div>
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
                    onFieldKeyDown={(e, s) =>
                      onCellKeyDown(
                        e,
                        { index, visiblePos, field: 'name' },
                        // 名称セルだけが空欄 Backspace で行を消せる。定義セルは
                        // 空（未定義 warning）が常態なので、そこで消えると事故になる
                        textFieldContext(s, true),
                      )
                    }
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
                    onKeyDown={(e) =>
                      onCellKeyDown(
                        e,
                        { index, visiblePos, field: 'kind' },
                        {
                          editing: false,
                          fieldEmpty: false,
                          deletableField: false,
                          caretAtStart: true,
                          caretAtEnd: true,
                          // 素の↑↓は select の選択肢切り替えに使う（Alt+↑↓ は有効）
                          arrowsOwnedByField: true,
                        },
                      )
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
                    onFieldKeyDown={(e, s) =>
                      onCellKeyDown(e, { index, visiblePos, field: 'definition' }, textFieldContext(s, false))
                    }
                  />
                </td>
                <td className={mark(index, 'aliases')}>
                  <AliasCell
                    aliases={term.aliases}
                    onAliasesChange={(next) => updateTerm(index, { aliases: next }, null)}
                    cellId={cellId(rowKey, 'aliases')}
                    label={`${FIELD_LABELS.aliases}（${row}行目）`}
                    reorderEnabled={reorderEnabled}
                    onClosedKeyDown={(e) =>
                      onCellKeyDown(
                        e,
                        { index, visiblePos, field: 'aliases' },
                        {
                          editing: false,
                          fieldEmpty: false,
                          deletableField: false,
                          caretAtStart: true,
                          caretAtEnd: true,
                          arrowsOwnedByField: false,
                        },
                      )
                    }
                    onLeave={(direction) => {
                      const step = stepField('aliases', direction)
                      focusVisible(visiblePos + step.rowDelta, step.field)
                    }}
                  />
                </td>
                <td>
                  <CellInput
                    className={cellInput}
                    aria-label={`${FIELD_LABELS.notes}（${row}行目）`}
                    data-cell={cellId(rowKey, 'notes')}
                    value={term.notes}
                    onValueChange={(v) => updateTerm(index, { notes: v }, `${rowKey}:notes`)}
                    onFieldKeyDown={(e, s) =>
                      onCellKeyDown(e, { index, visiblePos, field: 'notes' }, textFieldContext(s, false))
                    }
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {data.terms.length > 0 && visible.length === 0 && (
        <p className="mt-3 text-sm text-ink-muted">該当する用語がありません。</p>
      )}
      {data.terms.length === 0 && (
        <button
          type="button"
          className="mt-3 rounded-sm border border-rule px-3 py-1 text-sm text-ink hover:bg-surface"
          onClick={() => insertRowAfter(-1)}
        >
          用語を追加
        </button>
      )}
    </div>
  )
}
