import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { CellInput, type FieldState } from '@/components/CellInput'
import { buttonBase } from '@/components/button-styles'
import { useColumnResize } from '@/core/column-resize'
import {
  resolveCommand,
  toKeyEventLike,
  type Command,
  type KeyContext,
} from '@/core/keyboard/keymap'
import { altModifierLabel, currentPlatform } from '@/core/keyboard/platform'
import { buildErrorMarks, cellFace, hasError } from '@/core/list-editor/cell-face'
import { cellId, useListRows } from '@/core/list-editor/use-list-rows'
import { newId } from '@/core/new-id'
import type { EditorProps } from '@/core/registry'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'
import { AliasCell } from './AliasCell'
import {
  DEFINITION_MIN_WIDTH,
  glossaryColumnWidths,
  MIN_COLUMN_WIDTH,
  RESIZE_STEP,
} from './column-widths'
import { COLUMNS, nextWidthIndex, WIDTH_INDEX } from './columns'
import { FIELD_LABELS, stepField, type GlossaryField } from './fields'
import { kindLabel } from './kind-labels'
import { EMPTY_FILTER, filterTermIndices, isDerivedView, type GlossaryFilter } from './search'

// 種別の選択肢はスキーマの enum から実行時に導出する（ハードコードすると enum 改訂時に静かにずれる）
const KIND_OPTIONS = glossarySchema.$defs.term.properties.kind.enum

// フォーカスは面の塗り替えではなくリングで示す（M8 修正3）。テーブルの面が
// bg-surface になった今、focus:bg-surface はコントラスト比 1.00:1 で見えない。
// エラー・未定義セルは bg-warning/20・/10 の面を警告として持っているので、
// フォーカスで背景を塗り替えるとその警告表示が消えてしまう——リングなら
// 面の色を潰さずに重ねられる。色は役割トークンの --ring から取る（既に
// --ink に紐づいている。palette.css は変更していない）
const cellInput =
  'w-full resize-none overflow-y-auto bg-transparent px-2 py-1 text-ink outline-none rounded-sm align-middle focus:ring-2 focus:ring-inset focus:ring-ring'
// レベル2エラー（受け入れて赤表示）と warning（undecided / 未定義）は
// どちらも同系色の面で示し、濃さで強度を区別する。
// 波線下線は表記ゆれの「指摘（suggestion）」用に予約されているため使わない
// （glossary-session-notes 論点5）。
//
// **濃さは M8 で確定した**（設計スペック 決定13）。合成後のコントラストは
// src/styles/palette.test.ts が機械検査しており、値を変えるとそちらが落ちる。
// /25 はダークの surface 上で ink-muted が 4.58:1 に落ちるため使えない
const errorCell = 'bg-warning/20'
const warnCell = 'bg-warning/10'

/** 列の境界の縦罫。先頭列には引かない（M8 決定2） */
const colBorder = 'border-l border-grid'

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

export function GlossaryEditor({
  data,
  onChange,
  issues,
  modalOpen,
}: EditorProps<GlossarySchemaVersion1>) {
  const [filter, setFilter] = useState<GlossaryFilter>(EMPTY_FILTER)

  const rows = useListRows<Term>({
    items: data.terms,
    onItemsChange: (terms, mergeKey) => onChange({ ...data, terms }, mergeKey),
    makeItem: newTerm,
    firstField: 'name',
    // 0件の一覧に絞り込みを残す意味は無く、残すと導出表示扱いで
    //「用語を追加」が出ずフォーカスの行き先が消える
    onEmptied: () => setFilter(EMPTY_FILTER),
  })
  const { rowKeys } = rows

  // 幅を測る対象はテーブルを包む div（M8 決定9）
  const tableRef = useRef<HTMLDivElement>(null)
  const { widths, getHandleProps } = useColumnResize({
    store: glossaryColumnWidths,
    minWidth: MIN_COLUMN_WIDTH,
    flexMinWidth: DEFINITION_MIN_WIDTH,
    step: RESIZE_STEP,
    containerRef: tableRef,
  })

  const visible = filterTermIndices(data.terms, filter)

  const updateTerm = (index: number, patch: Partial<Term>, mergeKey: string | null) => {
    const terms = data.terms.map((t, i) => (i === index ? { ...t, ...patch } : t))
    onChange({ ...data, terms }, mergeKey)
  }

  // 導出表示中（検索・フィルタ適用中）は並び替えを止める（session-notes 論点4）
  const derivedView = isDerivedView(filter)
  const reorderEnabled = !derivedView

  /** 表示中の並びで n 番目の行の指定セルへフォーカスする */
  const focusVisible = (visiblePos: number, field: GlossaryField): boolean => {
    const index = visible[visiblePos]
    if (index === undefined) return false
    return rows.focusCell(rowKeys[index], field)
  }

  /** コマンドを用語集の構造へ写像する。戻り値 true＝消費した（既定動作を止める） */
  const runCommand = (
    cmd: Command,
    at: { index: number; visiblePos: number; field: GlossaryField },
  ): boolean => {
    switch (cmd) {
      case 'insert-item-after':
        // 導出表示中に挿入すると、絞り込みに掛からない行が見えないまま増える
        // （並び替えを止めるのと同じ理由）。キーは消費して何もしない
        if (derivedView) return true
        rows.insertAfter(at.index)
        return true
      case 'delete-item':
        rows.deleteAt(at.index)
        return true
      case 'move-item-up':
        rows.moveBy(at.index, -1, at.field)
        return true
      case 'move-item-down':
        rows.moveBy(at.index, 1, at.field)
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
      modalOpen,
      reorderEnabled,
      // 用語集はフラットなリストで「子」が存在しない（rev 10章の適用例）
      hierarchical: false,
      horizontal: false,
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

  // locations を「配列位置 → 赤表示するフィールド集合」に引き直す。判定
  // ロジック（優先順位・二重塗り防止）とあわせて cell-face.ts の純関数へ
  // 切り出してある。DOM テストは role・アクセシブル名で引きクラス名を見ないため、
  // この振る舞いを固定する場所が別に要る（M8 でつぶした残件2の裏付け）
  const marks = buildErrorMarks(issues)

  /** セルの面のクラス名。判定そのものは cell-face.ts の cellFace（純関数）が持つ */
  const cellClass = (index: number, field: GlossaryField, warn = false): string => {
    const face = cellFace(marks, index, field, warn)
    return face === 'error' ? errorCell : face === 'warn' ? warnCell : ''
  }

  return (
    <div ref={rows.containerRef} className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="用語を検索"
          className="w-64 rounded-sm border border-rule bg-canvas px-2 py-1 text-sm text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
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
              className={`${buttonBase} border border-rule px-2 py-1 text-xs ${
                active ? 'bg-ink text-canvas' : 'bg-canvas text-ink hover:bg-surface'
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
            検索・フィルタ中は行の追加（Enter）と並び替え（{altModifierLabel(PLATFORM)}+↑↓）を使えません
          </span>
        )}
      </div>
      {/* 指摘の一覧は額縁が出す（rev 6章）。ここで `issues` を使うのは
          セル・行の赤表示だけ（下の cellClass / marks） */}
      {/* テーブルは surface の面に載せ、外枠だけ rule で締める。内側の罫は
          grid（装飾）に落とす——M7 が rule と grid を2トークンに分けた理由が
          そのまま効く階層である（M8 決定2）。
          **角丸のための overflow-hidden はあえて置かない。** 別名セル
          （AliasCell）のパネルはこの div を包含ブロックとする absolute 配置で、
          パネルの高さ（別名の行＋操作ヒントで60px強）は行の高さ（約31px）を
          必ず上回る。overflow-hidden を掛けると最終行で開いたパネルが
          下端で切れて到達不能になる（横方向も同様——別名列と備考列を両方
          最小幅まで狭めると w-56 が右端を越える）。角丸は装飾だが別名パネルは
          機能なので、角丸をあきらめて直角にする。外枠と面（border-rule /
          bg-surface）はそのまま残す */}
      <div ref={tableRef} className="border border-rule bg-surface">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            {COLUMNS.map((col, i) => {
              const w = WIDTH_INDEX[i]
              return (
                <col
                  key={col.field}
                  style={w === null ? undefined : { width: widths[w] }}
                />
              )
            })}
          </colgroup>
          <thead>
            <tr className="text-left text-ink">
              {COLUMNS.map((col, i) => {
                const w = WIDTH_INDEX[i]
                return (
                  <th
                    key={col.field}
                    className={`sticky top-0 z-10 relative border-b border-rule bg-surface-accent px-2 py-1 font-bold${i === 0 ? '' : ` ${colBorder}`}`}
                  >
                    {FIELD_LABELS[col.field]}
                    {/* 幅を持たない定義列は自分ではハンドルを出さないが、右隣に
                        固定幅の列があればそこにハンドルを出す。掴めるのは
                        右隣（別名）の幅なので反転して渡す（見た目どおり、
                        右へ引くと定義が広がる＝別名が狭まる）。掴み代が見えるように
                        列の境界へ grid の縦罫を引いてある（M8 決定2） */}
                    {w !== null ? (
                      <span
                        {...getHandleProps(w)}
                        aria-label={`${FIELD_LABELS[col.field]}の列幅を変更`}
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-rule"
                      />
                    ) : (
                      nextWidthIndex(i) !== null && (
                        <span
                          {...getHandleProps(nextWidthIndex(i) as number, { invert: true })}
                          aria-label={`${FIELD_LABELS[col.field]}の列幅を変更`}
                          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-rule"
                        />
                      )
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((index, visiblePos) => {
              const term = data.terms[index]
              const rowKey = rowKeys[index]
              const row = visiblePos + 1
              return (
                <tr key={rowKey} className={`border-b border-grid align-middle${hasError(marks, index, 'id') ? ` ${errorCell}` : ''}`}>
                  <td className={cellClass(index, 'name')}>
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
                  <td className={`relative ${colBorder} ${cellClass(index, 'kind', term.kind === 'undecided')}`}>
                    <select
                      className={`${cellInput} appearance-none pr-6`}
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
                    {/* appearance-none で消えた矢印を描き直す。**背景画像の
                        data URI は使わない**——色値を書くことになり
                        conventions.test.ts が弾く（M8 決定14） */}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 12 12"
                      className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 fill-none stroke-current stroke-2 text-ink-muted"
                    >
                      <path d="M3 4.5 L6 7.5 L9 4.5" />
                    </svg>
                  </td>
                  <td className={`${colBorder} ${cellClass(index, 'definition', term.definition === '')}`}>
                    <CellInput
                      multiline
                      className={`${cellInput} placeholder:text-ink-muted`}
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
                  <td className={`${colBorder} ${cellClass(index, 'aliases')}`}>
                    <AliasCell
                      aliases={term.aliases}
                      onAliasesChange={(next, mergeKey) =>
                        updateTerm(index, { aliases: next }, mergeKey ?? null)
                      }
                      cellId={cellId(rowKey, 'aliases')}
                      label={`${FIELD_LABELS.aliases}（${row}行目）`}
                      reorderEnabled={reorderEnabled}
                      modalOpen={modalOpen}
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
                      onLeaveVertical={(direction) => focusVisible(visiblePos + direction, 'aliases')}
                    />
                  </td>
                  <td className={`${colBorder} ${cellClass(index, 'notes')}`}>
                    <CellInput
                      multiline
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
      </div>
      {data.terms.length > 0 && visible.length === 0 && (
        <p className="mt-3 text-sm text-ink-muted">該当する用語がありません。</p>
      )}
      {!derivedView && (
        // **0件のときだけでなく常に出す。** 行の追加が Enter だけだと、
        // マウスで操作する人に手段が無い（rev 10章「マウス＝構造を操作する
        // 自然さ」）。導出表示中に出さないのは、挿入した行が絞り込みに
        // 掛からず見えないまま増えるため（Enter を止めているのと同じ理由）
        <button
          ref={rows.addButtonRef}
          type="button"
          className={`${buttonBase} mt-3 gap-1 border border-rule bg-surface px-3 py-1 text-sm text-ink hover:bg-canvas`}
          onClick={() => rows.insertAfter(data.terms.length - 1)}
        >
          <Plus aria-hidden className="size-4" />
          用語を追加
        </button>
      )}
    </div>
  )
}
