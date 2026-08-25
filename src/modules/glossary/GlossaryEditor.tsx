import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { CellInput, type FieldState } from '@/components/CellInput'
import { CellSelect } from '@/components/CellSelect'
import { buttonBase } from '@/components/button-styles'
import { Chip } from '@/components/Chip'
import { MissingTally } from '@/components/MissingTally'
import { useColumnResize } from '@/core/column-resize'
import {
  resolveCommand,
  toKeyEventLike,
  type Command,
  type KeyContext,
} from '@/core/keyboard/keymap'
import { altModifierLabel, currentPlatform } from '@/core/keyboard/platform'
import { buildErrorMarks, cellFace, CELL_FACE_CLASS } from '@/core/list-editor/cell-face'
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
import { COLUMNS, NO_COLUMN_LABEL, nextWidthIndex, WIDTH_INDEX } from './columns'
import { FIELD_LABELS, stepField, type GlossaryField } from './fields'
import { kindLabel } from './kind-labels'
import { isMissingCell, tallyMissing } from './missing'
import { EMPTY_FILTER, filterTermIndices, isDerivedView, type GlossaryFilter } from './search'

// 種別の選択肢はスキーマの enum から実行時に導出する（ハードコードすると enum 改訂時に静かにずれる）
const KIND_OPTIONS = glossarySchema.$defs.term.properties.kind.enum

// フォーカスは面の塗り替えではなくリングで示す（M8 修正3）。テーブルの面が
// bg-surface になった今、focus:bg-surface はコントラスト比 1.00:1 で見えない。
// エラー・未定義セルは輪郭（CELL_FACE_CLASS）で警告を示しているので、
// フォーカスで背景を塗り替えても輪郭は消えない——リングは輪郭とは別の見た目
// なので、どちらも潰さずに重ねられる。色は役割トークンの --ring から取る
// （既に --ink に紐づいている。palette.css は変更していない）
const cellInput =
  'w-full resize-none overflow-y-auto bg-transparent px-2 py-1 text-ink outline-none rounded-sm align-middle focus:ring-2 focus:ring-inset focus:ring-ring'

/** 列の境界の縦罫。先頭列（No）には引かない（M8 決定2） */
const colBorder = 'border-l border-rule-muted'

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

  /** 帯のチップ（欠落の種類）ごとに巡る位置。kind → 直前に飛んだ表示中の順番 */
  const jumpAt = useRef<Record<string, number>>({})

  /**
   * 欠落セルへのジャンプ（M22）。**集計は全行、ジャンプは表示中**——
   * 絞り込み中は集計と巡回先がずれうる（テーブル側はフォーカス位置追跡を
   * 持たないので、課題ツリーの nextOpenTarget とは違い巡回 ref で数える。
   * 物足りなければ open-issues 行き）
   */
  const jumpToMissing = (kind: string): void => {
    const field: GlossaryField = kind === 'kind' ? 'kind' : 'definition'
    const targets = visible.filter((i) => isMissingCell(data.terms[i], field))
    if (targets.length === 0) return
    const next = ((jumpAt.current[kind] ?? -1) + 1) % targets.length
    jumpAt.current[kind] = next
    rows.focusCell(rowKeys[targets[next]], field)
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
  // ロジック（優先順位・行アンカー）とあわせて cell-face.ts の純関数へ
  // 切り出してある。DOM テストは role・アクセシブル名で引きクラス名を見ないため、
  // この振る舞いを固定する場所が別に要る（M8 でつぶした残件2の裏付け）
  const marks = buildErrorMarks(issues)

  /** セルの輪郭のクラス名。判定そのものは cell-face.ts の cellFace（純関数）が持つ。
      行全体の指摘は No セルの輪郭で示す（M22。UI ノート D5）。No は GlossaryField
      ではないので、ここでは rowAnchor は常に false——No セル自身は tbody の中で
      cellFace を直接呼んで別に組み立てる */
  const cellClass = (index: number, field: GlossaryField, warn = false): string =>
    CELL_FACE_CLASS[cellFace(marks, index, field, warn, false)]

  return (
    <div ref={rows.containerRef} className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="用語を検索"
          className="w-64 rounded-sm border border-rule bg-canvas px-2 py-1 text-base text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
          placeholder="名称・別名・定義を検索"
          value={filter.query}
          onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
        />
        {KIND_OPTIONS.map((kind) => {
          const active = filter.kinds.includes(kind)
          return (
            <Chip
              key={kind}
              selected={active}
              onClick={() =>
                setFilter((f) => ({
                  ...f,
                  kinds: active ? f.kinds.filter((k) => k !== kind) : [...f.kinds, kind],
                }))
              }
            >
              {kindLabel(kind)}
            </Chip>
          )
        })}
        <span className="text-sm text-ink-muted">
          {visible.length} / {data.terms.length} 件
        </span>
        <MissingTally tally={tallyMissing(data.terms)} onJump={jumpToMissing} />
        {!reorderEnabled && (
          // データ順と表示順が食い違う状態での並び替えは結果が予測不能になる
          // （session-notes 論点4）。無効であることを画面でも示す
          <span className="text-sm text-ink-muted">
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
        <table className="w-full table-fixed border-collapse text-base">
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
            <tr className="text-left">
              {COLUMNS.map((col, i) => {
                const w = WIDTH_INDEX[i]
                // 'no' は GlossaryField ではないので FIELD_LABELS が引けない
                // （エラーカタログ columns.ts の NO_COLUMN_LABEL と同じ形）
                const label = col.field === 'no' ? NO_COLUMN_LABEL : FIELD_LABELS[col.field]
                return (
                  <th
                    key={col.field}
                    className={`sticky top-0 z-10 relative border-b border-rule bg-surface-muted px-2 py-1 text-base font-medium tracking-wide text-ink-muted${col.field === 'no' ? ' text-right' : ''}${i === 0 ? '' : ` ${colBorder}`}`}
                  >
                    {label}
                    {/* No 列は導出（データ配列の index+1）なのでハンドルを出さない。
                        幅を持たない定義列は自分ではハンドルを出さないが、右隣に
                        固定幅の列があればそこにハンドルを出す。掴めるのは
                        右隣（別名）の幅なので反転して渡す（見た目どおり、
                        右へ引くと定義が広がる＝別名が狭まる）。掴み代が見えるように
                        列の境界へ grid の縦罫を引いてある（M8 決定2） */}
                    {col.field === 'no' ? null : w !== null ? (
                      <span
                        {...getHandleProps(w)}
                        aria-label={`${label}の列幅を変更`}
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-rule"
                      />
                    ) : (
                      nextWidthIndex(i) !== null && (
                        <span
                          {...getHandleProps(nextWidthIndex(i) as number, { invert: true })}
                          aria-label={`${label}の列幅を変更`}
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
                <tr key={rowKey} className="border-b border-rule-muted align-middle">
                  {/* No は編集対象ではない。データ配列の位置なので絞り込んでも動かない
                      （表示中の行番号 `row` とは役割が違う——row は表示位置、
                      No はデータ位置。エラーカタログ :416-422 の写し）。
                      行全体の指摘（field: 'id'。ID 重複など欄を特定できない指摘）は
                      ここへ出す（cellFace の rowAnchor 引数） */}
                  <td
                    className={`px-2 py-1 text-right text-ink-muted ${CELL_FACE_CLASS[cellFace(marks, index, 'no', false, true)]}`}
                  >
                    {index + 1}
                  </td>
                  <td className={`${colBorder} ${cellClass(index, 'name')}`}>
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
                  <td className={`relative ${colBorder} ${cellClass(index, 'kind', isMissingCell(term, 'kind'))}`}>
                    <CellSelect
                      className={`${cellInput} appearance-none pr-6`}
                      aria-label={`${FIELD_LABELS.kind}（${row}行目）`}
                      data-cell={cellId(rowKey, 'kind')}
                      value={term.kind}
                      options={KIND_OPTIONS}
                      labelOf={kindLabel}
                      onPick={(kind) => updateTerm(index, { kind: kind as Term['kind'] }, null)}
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
                            // 素の↑↓は CellSelect が値切り替えに消費する（ここへ届かない）
                            arrowsOwnedByField: true,
                          },
                        )
                      }
                    />
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
                  <td className={`${colBorder} ${cellClass(index, 'definition', isMissingCell(term, 'definition'))}`}>
                    <CellInput
                      multiline
                      className={`${cellInput} leading-normal`}
                      aria-label={`${FIELD_LABELS.definition}（${row}行目）`}
                      data-cell={cellId(rowKey, 'definition')}
                      // 空は空のまま。欠落は cellClass の面（missing-face）が示す
                      // （D1。placeholder に欠落の語を使わない——IssueBox と同じ判断）
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
                      className={`${cellInput} leading-normal`}
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
        <p className="mt-3 text-base text-ink-muted">該当する用語がありません。</p>
      )}
      {!derivedView && (
        // **0件のときだけでなく常に出す。** 行の追加が Enter だけだと、
        // マウスで操作する人に手段が無い（rev 10章「マウス＝構造を操作する
        // 自然さ」）。導出表示中に出さないのは、挿入した行が絞り込みに
        // 掛からず見えないまま増えるため（Enter を止めているのと同じ理由）
        <button
          ref={rows.addButtonRef}
          type="button"
          className={`${buttonBase} mt-3 gap-1 border border-rule bg-surface px-3 py-1 text-base text-ink hover:bg-canvas`}
          onClick={() => rows.insertAfter(data.terms.length - 1)}
        >
          <Plus aria-hidden className="size-4" />
          用語を追加
        </button>
      )}
    </div>
  )
}
