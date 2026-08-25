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
import { stepField } from '@/core/list-editor/field-step'
import { cellId, useListRows } from '@/core/list-editor/use-list-rows'
import { newId } from '@/core/new-id'
import type { EditorProps } from '@/core/registry'
import type { ErrorCatalogSchemaVersion1, ErrorEntry } from '@/types/error-catalog'
import errorCatalogSchema from '../../../schemas/error-catalog.schema.json'
import {
  CAUSE_MIN_WIDTH,
  errorColumnWidths,
  MIN_COLUMN_WIDTH,
  RESIZE_STEP,
} from './column-widths'
import { NO_COLUMN_LABEL, PROFILE_COLUMNS } from './columns'
import { FIELD_LABELS, type ErrorField, type ProseField } from './fields'
import { isMissingCell, TALLIED_FIELDS, tallyMissing } from './missing'
import { PROFILES, SUPPORT_PROFILE, type ErrorProfile } from './profiles'
import { resolutionLabel } from './resolution-labels'
import { EMPTY_FILTER, filterErrorIndices, isDerivedView, type ErrorFilter } from './search'

// 解決レベルの選択肢はスキーマの enum から実行時に導出する（ハードコードすると enum 改訂時に静かにずれる）
const LEVEL_OPTIONS = errorCatalogSchema.$defs.errorEntry.properties.resolutionLevel.enum

// フォーカスは面の塗り替えではなくリングで示す（M8 修正3）。エラー・未記入セルは
// 輪郭（CELL_FACE_CLASS）で示す。フォーカスで背景を塗り替えても消えないが、
// リングで示す方針は変えない
const cellInput =
  'w-full resize-none overflow-y-auto bg-transparent px-2 py-1 text-ink outline-none rounded-sm align-middle focus:ring-2 focus:ring-inset focus:ring-ring'

/** 列の境界の縦罫。先頭列（No）には引かない（M8 決定2） */
const colBorder = 'border-l border-rule-muted'

const PLATFORM = currentPlatform()

/**
 * 新規行の既定のエラー名。空文字はスキーマ違反（minLength 1）なので置けない——
 * 空のまま自動保存が走ると、次に開けないファイルを自分で作ることになる
 */
const NEW_ERROR_NAME = '新しいエラー'

function newEntry(): ErrorEntry {
  return {
    id: newId('error'),
    name: NEW_ERROR_NAME,
    // 未記入は「まだ決めていない」であって「誰にも解決できない（none）」ではない
    resolutionLevel: 'undecided',
    occurrence: '',
    causeForSupport: '',
    causeForSpec: '',
    userAction: '',
    supportAction: '',
    engineerAction: '',
    notes: '',
  }
}

export function ErrorCatalogEditor({
  data,
  onChange,
  issues,
  modalOpen,
}: EditorProps<ErrorCatalogSchemaVersion1>) {
  // 表示プロファイルはエディタの state。切り替えてもデータは動かない（履歴も積まない）。
  // App は key={selected.path} でエディタを作り直すので、ファイルを切り替えると既定へ戻る
  const [profile, setProfile] = useState<ErrorProfile>(SUPPORT_PROFILE)
  const [filter, setFilter] = useState<ErrorFilter>(EMPTY_FILTER)

  const rows = useListRows<ErrorEntry>({
    items: data.errors,
    onItemsChange: (errors, mergeKey) => onChange({ ...data, errors }, mergeKey),
    makeItem: newEntry,
    firstField: 'name',
    // 0件の一覧に絞り込みを残す意味は無く、残すと導出表示扱いで
    //「エラーを追加」が出ずフォーカスの行き先が消える
    onEmptied: () => setFilter(EMPTY_FILTER),
  })
  const { rowKeys } = rows

  // 列と列幅ストアはプロファイルごとに引き分ける（列数が変わるので1本では持てない）
  const cols = PROFILE_COLUMNS[profile.id]
  const tableRef = useRef<HTMLDivElement>(null)
  const { widths, getHandleProps } = useColumnResize({
    store: errorColumnWidths[profile.id],
    minWidth: MIN_COLUMN_WIDTH,
    flexMinWidth: CAUSE_MIN_WIDTH,
    step: RESIZE_STEP,
    containerRef: tableRef,
  })

  const visible = filterErrorIndices(data.errors, filter)

  /** 散文フィールドの更新。resolutionLevel だけは enum なので別口 */
  const updateProse = (
    index: number,
    field: ProseField,
    value: string,
    mergeKey: string | null,
  ) => {
    const errors = data.errors.map((e, i) => {
      if (i !== index) return e
      const next: ErrorEntry = { ...e }
      next[field] = value
      return next
    })
    onChange({ ...data, errors }, mergeKey)
  }

  const updateLevel = (index: number, level: ErrorEntry['resolutionLevel']) => {
    const errors = data.errors.map((e, i) => (i === index ? { ...e, resolutionLevel: level } : e))
    onChange({ ...data, errors }, null)
  }

  // 導出表示中（検索・フィルタ適用中）は並び替えを止める（session-notes 2-5）
  const derivedView = isDerivedView(filter)
  const reorderEnabled = !derivedView

  /** 表示中の並びで n 番目の行の指定セルへフォーカスする */
  const focusVisible = (visiblePos: number, field: ErrorField): boolean => {
    const index = visible[visiblePos]
    if (index === undefined) return false
    return rows.focusCell(rowKeys[index], field)
  }

  /** 帯のチップ（欠落の種類）ごとに巡る位置。kind → 直前に飛んだ表示中の順番 */
  const jumpAt = useRef<Record<string, number>>({})

  /**
   * 欠落セルへのジャンプ（M22）。**集計は全行、ジャンプは表示中**——絞り込み中は
   * 集計と巡回先がずれうる（用語集 GlossaryEditor と同じ理由・同じ形）。
   * `'undecided'` は resolutionLevel セルへ、`'blank'` はその行の
   * TALLIED_FIELDS 順で最初に isMissingCell が真になるフィールドへ飛ぶ
   */
  const jumpToMissing = (kind: string): void => {
    if (kind === 'undecided') {
      const targets = visible.filter((i) => isMissingCell(data.errors[i], 'resolutionLevel'))
      if (targets.length === 0) return
      const next = ((jumpAt.current[kind] ?? -1) + 1) % targets.length
      jumpAt.current[kind] = next
      rows.focusCell(rowKeys[targets[next]], 'resolutionLevel')
      return
    }
    const targets = visible.filter((i) =>
      TALLIED_FIELDS.some((f) => isMissingCell(data.errors[i], f)),
    )
    if (targets.length === 0) return
    const next = ((jumpAt.current[kind] ?? -1) + 1) % targets.length
    jumpAt.current[kind] = next
    const index = targets[next]
    const field = TALLIED_FIELDS.find((f) => isMissingCell(data.errors[index], f))
    if (field === undefined) return
    rows.focusCell(rowKeys[index], field)
  }

  /** コマンドをエラーカタログの構造へ写像する。戻り値 true＝消費した */
  const runCommand = (
    cmd: Command,
    at: { index: number; visiblePos: number; field: ErrorField },
  ): boolean => {
    switch (cmd) {
      case 'insert-item-after':
        // 導出表示中に挿入すると、絞り込みに掛からない行が見えないまま増える
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
        // 移動先はプロファイルの列順で決まる（サポート向けでは causeForSpec を飛ばす）
        const step = stepField(profile.fields, at.field, 1)
        return focusVisible(at.visiblePos + step.rowDelta, step.field)
      }
      case 'focus-prev-field': {
        const step = stepField(profile.fields, at.field, -1)
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
    at: { index: number; visiblePos: number; field: ErrorField },
    field: Pick<
      KeyContext,
      | 'editing'
      | 'fieldEmpty'
      | 'deletableField'
      | 'caretAtStart'
      | 'caretAtEnd'
      | 'arrowsOwnedByField'
    >,
  ) => {
    const cmd = resolveCommand(toKeyEventLike(e), {
      platform: PLATFORM,
      modalOpen,
      reorderEnabled,
      // エラーカタログはフラットなリストで「子」が存在しない（rev 10章の適用例）
      hierarchical: false,
      horizontal: false,
      ...field,
    })
    if (cmd === null) return
    if (runCommand(cmd, at)) e.preventDefault()
  }

  /** テキストセル共通の文脈。空欄 Backspace の行削除はエラー名セルだけ認める */
  const textFieldContext = (state: FieldState, deletableField: boolean) => ({
    editing: true,
    fieldEmpty: state.empty,
    deletableField,
    caretAtStart: state.caretAtStart,
    caretAtEnd: state.caretAtEnd,
    arrowsOwnedByField: false,
  })

  // locations を「配列位置 → 赤表示するフィールド集合」に引き直す（コアの純関数）
  const marks = buildErrorMarks(issues)

  /** セルの輪郭のクラス名。判定そのものは cell-face.ts の cellFace（純関数）が持つ。
      No 列は profile.fields に含まれないので rowAnchor はここでは常に false */
  const cellClass = (index: number, field: ErrorField, warn: boolean): string =>
    CELL_FACE_CLASS[cellFace(marks, index, field, warn)]

  /** セルの中身。列ごとの違いはここ1箇所に閉じる */
  const cellNode = (
    at: { index: number; visiblePos: number; field: ErrorField },
    entry: ErrorEntry,
    rowKey: string,
  ) => {
    const field = at.field
    const label = `${FIELD_LABELS[field]}（No.${at.index + 1}）`
    if (field === 'resolutionLevel') {
      return (
        <>
          <CellSelect
            className={`${cellInput} appearance-none pr-6`}
            aria-label={label}
            data-cell={cellId(rowKey, field)}
            value={entry.resolutionLevel}
            options={LEVEL_OPTIONS}
            labelOf={resolutionLabel}
            onPick={(level) => updateLevel(at.index, level as ErrorEntry['resolutionLevel'])}
            onKeyDown={(e) =>
              onCellKeyDown(e, at, {
                editing: false,
                fieldEmpty: false,
                deletableField: false,
                caretAtStart: true,
                caretAtEnd: true,
                // 素の↑↓は CellSelect が値切り替えに消費する（ここへ届かない）
                arrowsOwnedByField: true,
              })
            }
          />
          {/* appearance-none で消えた矢印を描き直す。背景画像の data URI は
              使わない——色値を書くことになり conventions.test.ts が弾く */}
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 fill-none stroke-current stroke-2 text-ink-muted"
          >
            <path d="M3 4.5 L6 7.5 L9 4.5" />
          </svg>
        </>
      )
    }
    if (field === 'name') {
      return (
        <CellInput
          className={cellInput}
          aria-label={label}
          data-cell={cellId(rowKey, field)}
          value={entry.name}
          // 空のエラー名はスキーマ違反（minLength 1）なのでデータに載せない
          sanitize={(raw) => (raw.trim() === '' ? null : raw)}
          onValueChange={(v) => updateProse(at.index, 'name', v, `${rowKey}:name`)}
          // エラー名セルだけが空欄 Backspace で行を消せる。他のセルは空が常態なので
          // そこで消えると事故になる
          onFieldKeyDown={(e, s) => onCellKeyDown(e, at, textFieldContext(s, true))}
        />
      )
    }
    // 選定基準は列幅ではなく描画機構（D11「textarea で複数行が入る列」）。
    // ここに来る ErrorField（name・resolutionLevel を除く全部）は
    // 例外なく `multiline`＝本物の textarea（CellInput.tsx の分岐）を
    // 通るので、leading-normal は分岐なしで全部に足す
    return (
      <CellInput
        multiline
        className={`${cellInput} leading-normal`}
        aria-label={label}
        data-cell={cellId(rowKey, field)}
        // 空は空のまま。欠落は cellClass の面（missing-face）が示す
        // （D1。placeholder に欠落の語を使わない——IssueBox と同じ判断）
        value={entry[field]}
        onValueChange={(v) => updateProse(at.index, field, v, `${rowKey}:${field}`)}
        onFieldKeyDown={(e, s) => onCellKeyDown(e, at, textFieldContext(s, false))}
      />
    )
  }

  return (
    <div ref={rows.containerRef} className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="エラーを検索"
          className="w-64 rounded-sm border border-rule bg-canvas px-2 py-1 text-base text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
          placeholder="エラー名・原因・対応を検索"
          value={filter.query}
          onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
        />
        <span className="text-sm text-ink-muted">表示</span>
        <div role="group" aria-label="表示プロファイル" className="flex items-center gap-1">
          {PROFILES.map((p) => {
            const active = p.id === profile.id
            return (
              <Chip key={p.id} selected={active} onClick={() => setProfile(p)}>
                {p.label}
              </Chip>
            )
          })}
        </div>
        <span className="text-sm text-ink-muted">絞り込み</span>
        <div
          role="group"
          aria-label="解決レベルで絞り込む"
          className="flex flex-wrap items-center gap-1"
        >
          {LEVEL_OPTIONS.map((level) => {
            const active = filter.levels.includes(level)
            return (
              <Chip
                key={level}
                selected={active}
                onClick={() =>
                  setFilter((f) => ({
                    ...f,
                    levels: active ? f.levels.filter((l) => l !== level) : [...f.levels, level],
                  }))
                }
              >
                {resolutionLabel(level)}
              </Chip>
            )
          })}
        </div>
        <span className="text-sm text-ink-muted">
          {visible.length} / {data.errors.length} 件
        </span>
        <MissingTally tally={tallyMissing(data.errors)} onJump={jumpToMissing} />
        {!reorderEnabled && (
          <span className="text-sm text-ink-muted">
            検索・フィルタ中は行の追加（Enter）と並び替え（{altModifierLabel(PLATFORM)}+↑↓）を使えません
          </span>
        )}
      </div>
      {/* 指摘の一覧は額縁が出す（rev 6章）。ここで `issues` を使うのは
          セル・行の赤表示だけ */}
      {/* テーブルは surface の面に載せ、外枠だけ rule で締める（M8 決定2）。
          **overflow を掛けない**——既定幅は横スクロールが出ない前提で決めてあり
          （columns.test.ts が検査）、overflow を足すと sticky の親が変わって
          見出しの固定が静かに壊れる */}
      <div ref={tableRef} className="border border-rule bg-surface">
        <table className="w-full table-fixed border-collapse text-base">
          <colgroup>
            {cols.columns.map((col, i) => {
              const w = cols.widthIndex[i]
              return <col key={col.field} style={w === null ? undefined : { width: widths[w] }} />
            })}
          </colgroup>
          <thead>
            <tr className="text-left">
              {cols.columns.map((col, i) => {
                const w = cols.widthIndex[i]
                const label = col.field === 'no' ? NO_COLUMN_LABEL : FIELD_LABELS[col.field]
                const next = cols.nextWidthIndex(i)
                return (
                  <th
                    key={col.field}
                    // sticky 自体が絶対配置の包含ブロックになるので relative は要らない
                    className={`sticky top-0 z-10 border-b border-rule bg-surface-muted px-2 py-1 text-base font-medium tracking-wide text-ink-muted${col.field === 'no' ? ' text-right' : ''}${i === 0 ? '' : ` ${colBorder}`}`}
                  >
                    {label}
                    {/* No 列は導出（データ配列の index+1）なのでハンドルを出さない。
                        幅を持たない原因（業務）列は、右隣の固定幅列を反転して掴む */}
                    {col.field === 'no' ? null : w !== null ? (
                      <span
                        {...getHandleProps(w)}
                        aria-label={`${label}の列幅を変更`}
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-rule"
                      />
                    ) : (
                      next !== null && (
                        <span
                          {...getHandleProps(next, { invert: true })}
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
              const entry = data.errors[index]
              const rowKey = rowKeys[index]
              return (
                <tr key={rowKey} className="border-b border-rule-muted align-middle">
                  {/* No は編集対象ではない。データ配列の位置なので絞り込んでも動かない。
                      右揃え（UI ノート D9）。'no' は ErrorField ではないが cellFace の
                      field は string なので通る。hasError(marks, index, 'no') は常に
                      false で、rowAnchor だけが効く */}
                  <td
                    className={`px-2 py-1 text-right text-ink-muted ${CELL_FACE_CLASS[cellFace(marks, index, 'no', false, true)]}`}
                  >
                    {index + 1}
                  </td>
                  {profile.fields.map((field) => (
                    <td
                      key={field}
                      className={`${colBorder}${field === 'resolutionLevel' ? ' relative' : ''} ${cellClass(index, field, isMissingCell(entry, field))}`}
                    >
                      {cellNode({ index, visiblePos, field }, entry, rowKey)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {data.errors.length > 0 && visible.length === 0 && (
        <p className="mt-3 text-base text-ink-muted">該当するエラーがありません。</p>
      )}
      {!derivedView && (
        // **0件のときだけでなく常に出す。** 行の追加が Enter だけだと、
        // マウスで操作する人に手段が無い（rev 10章）
        <button
          ref={rows.addButtonRef}
          type="button"
          className={`${buttonBase} mt-3 gap-1 border border-rule bg-surface px-3 py-1 text-base text-ink hover:bg-canvas`}
          onClick={() => rows.insertAfter(data.errors.length - 1)}
        >
          <Plus aria-hidden className="size-4" />
          エラーを追加
        </button>
      )}
    </div>
  )
}
