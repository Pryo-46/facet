import { useRef, useState } from 'react'
import type { FieldState } from '@/components/CellInput'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { KeyHints } from '@/components/KeyHints'
import { MissingTally } from '@/components/MissingTally'
import type { KeyHint } from '@/core/keyboard/hint-text'
import { resolveCommand, toKeyEventLike, type Command } from '@/core/keyboard/keymap'
import { currentPlatform } from '@/core/keyboard/platform'
import { stepField } from '@/core/list-editor/field-step'
import { cellId, useListRows, type ListRows } from '@/core/list-editor/use-list-rows'
import { computeRowKeys } from '@/core/row-keys'
import type { EditorProps } from '@/core/registry'
import type { Condition, DecisionTableSchemaVersion1, Outcome } from '@/types/decision-table'
import {
  addChoice,
  addValue,
  newCondition,
  newOutcome,
  removeChoice,
  removeValue,
  renameChoice,
  renameCondition,
  renameOutcome,
  renameValue,
  setConditions,
  setOutcomes,
  setResult,
  toggleImpossible,
  type Applied,
} from './commands'
import { sectionMarks } from './consistency'
import { DefinitionList, type DefinitionRow } from './DefinitionList'
import { GridBody } from './GridBody'
import { IMPOSSIBLE_LABEL } from './labels'
import { isMissingLabel, isMissingResult, LABEL_KIND, RESULT_KIND, tallyMissing } from './missing'
import { MAX_ROWS, productSize } from './rows'

const PLATFORM = currentPlatform()

/** ラベルセルの `field` の接頭辞。後ろに続く数がラベルの添字になる */
const LABEL_FIELD = 'label:'

const DEFINITION_HINTS: KeyHint[] = [
  { keys: 'Enter', label: '下に追加' },
  { keys: 'Tab', label: '値へ移動・末尾で追加' },
  { keys: '←→', label: '名前と値を行き来' },
  { keys: '$alt+↑↓', label: '並び替え' },
  { keys: '空欄で Backspace', label: '削除' },
]

const GRID_HINTS: KeyHint[] = [
  { keys: 'Enter / Space', label: '選択肢を開く' },
  { keys: '↑↓←→', label: 'セルの移動' },
  { keys: 'Tab', label: '次の列へ' },
  { keys: '$mod+Enter', label: IMPOSSIBLE_LABEL },
]

/**
 * 表本体のセルの文脈。
 *
 * **`arrowsOwnedByField` を真にしないこと。** `resolveCommand`（keymap.ts）は
 * `family: 'grid'` の ↑↓←→ のどの分岐でも `arrowsOwnedByField` が真なら null を
 * 返す。真にすると行移動（↑↓）と列移動（←→）が一度に消える
 */
const gridContext = {
  editing: false,
  fieldEmpty: false,
  deletableField: false,
  caretAtStart: true,
  caretAtEnd: true,
  arrowsOwnedByField: false,
}

/** 行の鍵。行は導出物で ID を持たないので、位置がそのまま鍵になる */
const gridRowKey = (index: number): string => `row-${index}`

/**
 * 条件を1本足せるかを判定するための値。**`newCondition()` を呼ばない**
 *——描画のたびに ID を採番することになる。値を1つだけにしているのは新しい
 * 条件が直積を増やさないためで、この式が測るのは「いまの直積が上限内か」
 * である（「条件を1本足したあとの行数」ではない）
 */
const PROBE_CONDITION = { id: '', name: '', values: [''] }

/**
 * 削除や追加のあと、フォーカスを移す先。
 *
 * **行を消したときは位置が繰り上がる**ので、残った本数で丸める必要がある。
 * ラベルを消したときは行が残るので、丸めずにそのまま使う
 */
interface ConfirmFocus {
  key: 'condition' | 'outcome'
  index: number
  /** 行が残っているときに移る欄。`'name'` か `` `label:N` `` */
  field: string
  /** 行ごと消したか。真なら `index` を残りの本数で丸める */
  rowRemoved: boolean
}

interface Section {
  key: ConfirmFocus['key']
  rows: ListRows
  canAddRow: boolean
  /** ラベルを1つ足せるか。条件は行数の上限に掛かる */
  canAddLabel: (index: number) => boolean
  /** ラベルを1つ足し、足した欄へフォーカスを予約する */
  onAddLabel: (index: number) => void
  onRemoveLabel: (index: number, labelIndex: number) => void
}

/** `label:N` のラベル添字。名前セルなら null */
function labelIndexOf(field: string): number | null {
  return field.startsWith(LABEL_FIELD) ? Number(field.slice(LABEL_FIELD.length)) : null
}

export function DecisionTableEditor({
  data,
  onChange,
  issues,
  modalOpen,
}: EditorProps<DecisionTableSchemaVersion1>) {
  const [pending, setPending] = useState<{
    applied: Applied
    mergeKey: string | null
    focus: ConfirmFocus | null
  } | null>(null)

  /**
   * 確認を挟む削除を始めた位置。`deleteAt` は `onItemsChange` を同期で呼ぶので、
   * 呼ぶ直前に置けば `applyDefinition` から読める
   */
  const removingRef = useRef<ConfirmFocus | null>(null)

  /**
   * 定義部の編集の唯一の出口。**戻り値は `useListRows` の `onItemsChange` へ
   * そのまま渡す**——保留（確認ダイアログ待ち）のときは `false` を返し、行は
   * まだ画面に残っているとフックへ伝える。ここで `false` を返し忘れると、
   * ダイアログの裏でまだ消えていない行へフォーカスの予約が積まれる。
   *
   * **確認を挟むのは要素を減らすときだけ。** 名前の打鍵ごとに再構築が走るので、
   * 直積になっていないファイルを整え直す分の損失で確認が出ると、文字を打つたびに
   * ダイアログが開く
   */
  const applyDefinition = (
    applied: Applied,
    mergeKey: string | null,
    shrinking: boolean,
    focus: ConfirmFocus | null = null,
  ): boolean => {
    if (shrinking && applied.lostCells > 0) {
      setPending({ applied, mergeKey, focus })
      return false
    }
    onChange(applied.data, mergeKey)
    // 行ごと消したときはフックが予約済みなので、ここではラベルの行き先だけを積む。
    // 二重に積むと、フックの予約を上書きして移動先が入れ替わる
    if (focus !== null && !focus.rowRemoved) reserveFocusAt(focus, applied.data)
    return true
  }

  const conditionRows = useListRows<Condition>({
    items: data.conditions,
    onItemsChange: (next) =>
      applyDefinition(
        setConditions(data, next),
        null,
        next.length < data.conditions.length,
        removingRef.current,
      ),
    makeItem: newCondition,
    firstField: 'name',
  })
  const outcomeRows = useListRows<Outcome>({
    items: data.outcomes,
    onItemsChange: (next) =>
      applyDefinition(
        setOutcomes(data, next),
        null,
        next.length < data.outcomes.length,
        removingRef.current,
      ),
    makeItem: newOutcome,
    firstField: 'name',
  })

  const canAddCondition = productSize([...data.conditions, PROBE_CONDITION]) <= MAX_ROWS
  const canAddValue = (index: number): boolean =>
    productSize(
      data.conditions.map((c, i) => (i === index ? { ...c, values: [...c.values, ''] } : c)),
    ) <= MAX_ROWS
  /** どの条件にも値を足せない。上限に達していることの画面での知らせに使う */
  const atRowLimit =
    data.conditions.length > 0 && data.conditions.every((_, i) => !canAddValue(i))

  /** ラベルを1つ足し、足した欄へ移る。足す位置は行の末尾 */
  const addValueAt = (index: number): void =>
    void applyDefinition(addValue(data, index), null, false, {
      key: 'condition',
      index,
      field: `${LABEL_FIELD}${data.conditions[index].values.length}`,
      rowRemoved: false,
    })
  const addChoiceAt = (index: number): void =>
    void applyDefinition(addChoice(data, index), null, false, {
      key: 'outcome',
      index,
      field: `${LABEL_FIELD}${data.outcomes[index].choices.length}`,
      rowRemoved: false,
    })

  /** ラベルを1つ消し、一つ手前の欄へ移る。先頭を消したら名前セルへ戻る */
  const removeValueAt = (index: number, labelIndex: number) =>
    applyDefinition(removeValue(data, index, labelIndex), null, true, {
      key: 'condition',
      index,
      field: labelIndex === 0 ? 'name' : `${LABEL_FIELD}${labelIndex - 1}`,
      rowRemoved: false,
    })
  const removeChoiceAt = (index: number, labelIndex: number) =>
    applyDefinition(removeChoice(data, index, labelIndex), null, true, {
      key: 'outcome',
      index,
      field: labelIndex === 0 ? 'name' : `${LABEL_FIELD}${labelIndex - 1}`,
      rowRemoved: false,
    })

  /** 行の削除。確認を挟んだときの行き先を残してから消す */
  const removeRowAt = (key: ConfirmFocus['key'], rows: ListRows, index: number): void => {
    removingRef.current = { key, index, field: 'name', rowRemoved: true }
    rows.deleteAt(index)
    removingRef.current = null
  }

  /**
   * 削除・追加のあとの行き先を予約する。
   *
   * **`focusCell` では代われない。** 構造を変えた直後は移動先がまだ描かれていない
   */
  const reserveFocusAt = (focus: ConfirmFocus, next: DecisionTableSchemaVersion1): void => {
    const rows = focus.key === 'condition' ? conditionRows : outcomeRows
    const items = focus.key === 'condition' ? next.conditions : next.outcomes
    if (items.length === 0) {
      rows.reserveFocus('add-button')
      return
    }
    const at = focus.rowRemoved ? Math.min(focus.index, items.length - 1) : focus.index
    rows.reserveFocus({ rowKey: computeRowKeys(items)[at], field: focus.field })
  }

  const conditionSection: Section = {
    key: 'condition',
    rows: conditionRows,
    canAddRow: canAddCondition,
    canAddLabel: canAddValue,
    onAddLabel: addValueAt,
    onRemoveLabel: removeValueAt,
  }
  // 結果は行数に効かないので、上限に関わらず足せる
  const outcomeSection: Section = {
    key: 'outcome',
    rows: outcomeRows,
    canAddRow: true,
    canAddLabel: () => true,
    onAddLabel: addChoiceAt,
    onRemoveLabel: removeChoiceAt,
  }

  /** コマンドを一覧の構造へ写像する。戻り値 true＝消費した（既定動作を止める） */
  const runCommand = (
    cmd: Command,
    at: { index: number; field: string },
    section: Section,
  ): boolean => {
    const labelIndex = labelIndexOf(at.field)
    switch (cmd) {
      case 'insert-item-after':
        // 上限に達していたら消費だけして何もしない。既定動作に落とすと、
        // 押した人には「何も起きない」ではなく「改行が入った」に見える
        if (section.canAddRow) section.rows.insertAfter(at.index)
        return true
      case 'delete-item':
        if (labelIndex === null) removeRowAt(section.key, section.rows, at.index)
        else section.onRemoveLabel(at.index, labelIndex)
        return true
      case 'insert-child': {
        // 名前セルからは1つ目の値へ、値セルからは次の値へ移る。移動先が
        // 無ければ生やす——`Tab` を続けて打つだけで値が並んでいく
        const next = labelIndex === null ? 0 : labelIndex + 1
        if (section.rows.focusCell(section.rows.rowKeys[at.index], `${LABEL_FIELD}${next}`)) {
          return true
        }
        if (!section.canAddLabel(at.index)) return true
        section.onAddLabel(at.index)
        return true
      }
      case 'focus-parent': {
        // ← は値から名前へ。名前セルには親が無いので既定に落とす
        if (labelIndex === null) return false
        return section.rows.focusCell(section.rows.rowKeys[at.index], 'name')
      }
      case 'focus-child': {
        // → は名前から1つ目の値へ。値には子が無いので既定に落とす
        if (labelIndex !== null) return false
        return section.rows.focusCell(
          section.rows.rowKeys[at.index],
          `${LABEL_FIELD}0`,
        )
      }
      case 'move-item-up':
      case 'move-item-down':
        // ラベルセルは reorderEnabled: false なので、ここへは名前セルしか来ない
        if (labelIndex !== null) return false
        section.rows.moveBy(at.index, cmd === 'move-item-up' ? -1 : 1, 'name')
        return true
      case 'focus-prev':
      case 'focus-next': {
        // 行間の移動は名前セルの列だけ。ラベルは本数が行ごとに違うので列にならない
        if (labelIndex !== null) return false
        const key = section.rows.rowKeys[at.index + (cmd === 'focus-prev' ? -1 : 1)]
        return key === undefined ? false : section.rows.focusCell(key, 'name')
      }
      case 'cancel':
        // 編集の打ち切り。フォーカスを外すと CellInput が確定値に戻す
        ;(document.activeElement as HTMLElement | null)?.blur()
        return true
      default:
        // 木の家族なので Tab は insert-child に変わり、focus-next-field /
        // focus-prev-field はここへ届かない。undo / redo は額縁（App）のグローバル層が取る
        return false
    }
  }

  // エディタ内ダイアログが開いている間も操作言語を止める（rev 10章 境界規則）
  const anyModalOpen = modalOpen || pending !== null

  /** セルのキー入力。キーの判定はコアの resolveCommand に委ねる（rev 10章） */
  const cellKeyDown =
    (section: Section) =>
    (
      e: React.KeyboardEvent,
      at: { index: number; field: string },
      state: FieldState,
      deletableField: boolean,
    ): void => {
      const cmd = resolveCommand(toKeyEventLike(e), {
        platform: PLATFORM,
        modalOpen: anyModalOpen,
        // 値と選択肢の並び替えは持たないので、ラベルセルでは Alt+↑↓ を消費させない
        reorderEnabled: labelIndexOf(at.field) === null,
        // 条件と値は親子なので木の家族を使う。`Tab` が値を足し、`←→` が
        // 名前と値の間を行き来する（ロジックツリーと同じ打ち方）
        family: 'tree',
        editing: true,
        fieldEmpty: state.empty,
        deletableField,
        caretAtStart: state.caretAtStart,
        caretAtEnd: state.caretAtEnd,
        arrowsOwnedByField: false,
      })
      if (cmd === null) return
      if (runCommand(cmd, at, section)) e.preventDefault()
    }

  /** 表本体のセルを含む領域。行の増減をキーで起こさないので useListRows の予約は要らない */
  const gridRef = useRef<HTMLDivElement>(null)

  /**
   * 表本体でフォーカスのあるセルの行。**会議で「この行の場合は」と指すための面**を
   * この行に敷く。表からフォーカスが外れたら null に戻す
   */
  const [focusedRow, setFocusedRow] = useState<number | null>(null)

  /** 表本体のセルへフォーカスする。無ければ何もせず false を返す（既定動作を止めない） */
  const focusGridCell = (rowIndex: number, field: string): boolean => {
    const el = gridRef.current?.querySelector<HTMLElement>(
      `[data-cell="${cellId(gridRowKey(rowIndex), field)}"]`,
    )
    if (!el) return false
    el.focus()
    return true
  }

  /** 結果列の並び。`stepField` に渡して隣の列・行端の折り返しを引く */
  const resultFieldOrder = data.outcomes.map((_, j) => `result:${j}`)

  /** コマンドを表本体の構造へ写像する。戻り値 true＝消費した（既定動作を止める） */
  const runGridCommand = (cmd: Command, at: { index: number; field: string }): boolean => {
    switch (cmd) {
      case 'focus-prev':
        return focusGridCell(at.index - 1, at.field)
      case 'focus-next':
        return focusGridCell(at.index + 1, at.field)
      case 'focus-prev-field': {
        const step = stepField(resultFieldOrder, at.field, -1)
        return focusGridCell(at.index + step.rowDelta, step.field)
      }
      case 'focus-next-field': {
        const step = stepField(resultFieldOrder, at.field, 1)
        return focusGridCell(at.index + step.rowDelta, step.field)
      }
      case 'toggle-item-state':
        onChange(toggleImpossible(data, at.index), null)
        return true
      case 'cancel':
        ;(document.activeElement as HTMLElement | null)?.blur()
        return true
      default:
        // move-item-up/down・insert-item-after・delete-item は表本体に意味を
        // 持たない（行は導出物）。undo/redo は額縁のグローバル層が取る
        return false
    }
  }

  /** 表本体のセルのキー入力。キーの判定はコアの resolveCommand に委ねる（rev 10章） */
  const onGridCellKeyDown = (e: React.KeyboardEvent, at: { index: number; field: string }): void => {
    const cmd = resolveCommand(toKeyEventLike(e), {
      platform: PLATFORM,
      modalOpen: anyModalOpen,
      reorderEnabled: false,
      family: 'grid',
      ...gridContext,
    })
    if (cmd === null) return
    if (runGridCommand(cmd, at)) e.preventDefault()
  }

  const conditionDefinitionRows: DefinitionRow[] = data.conditions.map((c) => ({
    id: c.id,
    name: c.name,
    labels: c.values,
  }))
  const outcomeDefinitionRows: DefinitionRow[] = data.outcomes.map((o) => ({
    id: o.id,
    name: o.name,
    labels: o.choices,
  }))

  /** 帯のチップ（欠落の種類）ごとに巡る位置。kind → 直前に飛んだ順番 */
  const jumpAt = useRef<Record<string, number>>({})

  /**
   * 欠落セルへのジャンプ。**巡回 ref で数える**——テーブル側はフォーカス位置の
   * 追跡を持たないので、どこまで飛んだかを別に覚えておく必要がある
   */
  const jumpToMissing = (kind: string): void => {
    if (kind === RESULT_KIND) {
      const targets: { index: number; field: string }[] = []
      data.rows.forEach((row, index) => {
        data.outcomes.forEach((_, j) => {
          if (isMissingResult(row, j)) targets.push({ index, field: `result:${j}` })
        })
      })
      if (targets.length === 0) return
      const next = ((jumpAt.current[kind] ?? -1) + 1) % targets.length
      jumpAt.current[kind] = next
      const target = targets[next]
      focusGridCell(target.index, target.field)
      return
    }
    if (kind !== LABEL_KIND) return
    const targets: { rows: ListRows; key: string; field: string }[] = []
    const collect = (rows: ListRows, items: readonly { name: string; labels: string[] }[]): void => {
      items.forEach((item, index) => {
        const key = rows.rowKeys[index]
        if (isMissingLabel(item.name)) targets.push({ rows, key, field: 'name' })
        item.labels.forEach((label, labelIndex) => {
          if (isMissingLabel(label)) targets.push({ rows, key, field: `${LABEL_FIELD}${labelIndex}` })
        })
      })
    }
    collect(conditionRows, conditionDefinitionRows)
    collect(outcomeRows, outcomeDefinitionRows)
    if (targets.length === 0) return
    const next = ((jumpAt.current[kind] ?? -1) + 1) % targets.length
    jumpAt.current[kind] = next
    const target = targets[next]
    target.rows.focusCell(target.key, target.field)
  }

  /**
   * 失われるものの説明。**2つの数は分母が違う**ので「うち」で繋がない——
   * `lostCells` は旧の表で記入済みだったセル、`clearedCells` は新しい表で
   * 空欄になったセルを数える
   */
  const describeLoss = (applied: Applied): string =>
    `記入済みの結果 ${applied.lostCells} 件が失われます。` +
    (applied.clearedCells > 0
      ? `まとまった行で値が食い違う ${applied.clearedCells} 件は、空欄になります。`
      : '') +
    'Undo で戻せます。'

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <MissingTally tally={tallyMissing(data)} onJump={jumpToMissing} />
        <KeyHints hints={DEFINITION_HINTS} />
      </div>
      {atRowLimit && (
        <p className="mb-3 text-base text-ink-muted">
          {`行数の上限（${MAX_ROWS}行）に達しているので、値をこれ以上足せません。`}
        </p>
      )}
      {/* useListRows の focusCell は containerRef の中を querySelector で引く。
          条件と結果で別々の ref なので、包む div も2つに分ける */}
      <div ref={conditionRows.containerRef} className="mb-6">
        <DefinitionList
          heading="条件"
          nameLabel="条件名"
          itemLabel="値"
          labelsField="values"
          rows={conditionDefinitionRows}
          marks={sectionMarks(issues, 'condition')}
          minLabels={1}
          canAddRow={canAddCondition}
          canAddLabel={canAddValue}
          addRowLabel="条件を追加"
          rowKeys={conditionRows.rowKeys}
          onRenameRow={(index, name) =>
            applyDefinition(
              renameCondition(data, index, name),
              cellId(conditionRows.rowKeys[index], 'name'),
              false,
            )
          }
          onRenameLabel={(index, labelIndex, label) =>
            applyDefinition(
              renameValue(data, index, labelIndex, label),
              cellId(conditionRows.rowKeys[index], `${LABEL_FIELD}${labelIndex}`),
              false,
            )
          }
          onAddRow={() => conditionRows.insertAfter(data.conditions.length - 1)}
          onRemoveRow={(index) => removeRowAt('condition', conditionRows, index)}
          onAddLabel={addValueAt}
          onRemoveLabel={removeValueAt}
          onCellKeyDown={cellKeyDown(conditionSection)}
          addButtonRef={conditionRows.addButtonRef}
        />
      </div>
      <div ref={outcomeRows.containerRef}>
        <DefinitionList
          heading="結果"
          nameLabel="結果名"
          itemLabel="選択肢"
          labelsField="choices"
          rows={outcomeDefinitionRows}
          marks={sectionMarks(issues, 'outcome')}
          minLabels={0}
          canAddRow
          canAddLabel={() => true}
          addRowLabel="結果を追加"
          rowKeys={outcomeRows.rowKeys}
          onRenameRow={(index, name) =>
            applyDefinition(
              renameOutcome(data, index, name),
              cellId(outcomeRows.rowKeys[index], 'name'),
              false,
            )
          }
          onRenameLabel={(index, labelIndex, label) =>
            applyDefinition(
              renameChoice(data, index, labelIndex, label),
              cellId(outcomeRows.rowKeys[index], `${LABEL_FIELD}${labelIndex}`),
              false,
            )
          }
          onAddRow={() => outcomeRows.insertAfter(data.outcomes.length - 1)}
          onRemoveRow={(index) => removeRowAt('outcome', outcomeRows, index)}
          onAddLabel={addChoiceAt}
          onRemoveLabel={removeChoiceAt}
          onCellKeyDown={cellKeyDown(outcomeSection)}
          addButtonRef={outcomeRows.addButtonRef}
        />
      </div>
      <section className="mt-6">
        <h2 className="mb-2 text-base font-medium text-ink">表</h2>
        {data.conditions.length === 0 ? (
          <p className="text-base text-ink-muted">
            条件を1つ以上足すと、値の組み合わせの行が出ます。
          </p>
        ) : (
          <>
            <div className="mb-2">
              <KeyHints hints={GRID_HINTS} />
            </div>
            <div ref={gridRef}>
              <GridBody
                conditions={data.conditions}
                outcomes={data.outcomes}
                rows={data.rows}
                marks={sectionMarks(issues, 'row')}
                gridRowKey={gridRowKey}
                focusedRow={focusedRow}
                onFocusRow={setFocusedRow}
                onPickResult={(rowIndex, outIndex, value) =>
                  onChange(setResult(data, rowIndex, outIndex, value), null)
                }
                onToggleImpossible={(rowIndex) => onChange(toggleImpossible(data, rowIndex), null)}
                onCellKeyDown={onGridCellKeyDown}
              />
            </div>
          </>
        )}
      </section>
      <ConfirmDialog
        open={pending !== null}
        title="記入済みの結果が失われます"
        description={pending === null ? '' : describeLoss(pending.applied)}
        confirmLabel="続ける"
        onConfirm={() => {
          if (pending !== null) {
            onChange(pending.applied.data, pending.mergeKey)
            if (pending.focus !== null) reserveFocusAt(pending.focus, pending.applied.data)
          }
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
