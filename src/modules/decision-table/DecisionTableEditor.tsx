import { useRef, useState } from 'react'
import type { FieldState } from '@/components/CellInput'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { KeyHints } from '@/components/KeyHints'
import { MissingTally } from '@/components/MissingTally'
import type { KeyHint } from '@/core/keyboard/hint-text'
import { resolveCommand, toKeyEventLike, type Command } from '@/core/keyboard/keymap'
import { currentPlatform } from '@/core/keyboard/platform'
import { cellId, useListRows, type ListRows } from '@/core/list-editor/use-list-rows'
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
  type Applied,
} from './commands'
import { sectionMarks } from './consistency'
import { DefinitionList, type DefinitionRow } from './DefinitionList'
import { isMissingLabel, LABEL_KIND, tallyMissing } from './missing'
import { MAX_ROWS, productSize } from './rows'

const PLATFORM = currentPlatform()

/** ラベルセルの `field` の接頭辞。後ろに続く数がラベルの添字になる */
const LABEL_FIELD = 'label:'

const DEFINITION_HINTS: KeyHint[] = [
  { keys: 'Enter', label: '下に追加' },
  { keys: '$alt+↑↓', label: '並び替え' },
  { keys: '空欄で Backspace', label: '削除' },
]

/**
 * 条件を1本足したあとの行数。**`newCondition()` を呼ばないこと**——
 * 描画のたびに ID を採番することになる。数えるのに要るのは値の本数だけである
 */
const PROBE_CONDITION = { id: '', name: '', values: ['はい', 'いいえ'] }

/** 一覧1つ分の、コマンドの行き先。条件と結果で同じ写像を使うためにまとめる */
interface Section {
  rows: ListRows
  canAddRow: boolean
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
  const [pending, setPending] = useState<{ applied: Applied; mergeKey: string | null } | null>(null)

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
  ): boolean => {
    if (shrinking && applied.lostCells > 0) {
      setPending({ applied, mergeKey })
      return false
    }
    onChange(applied.data, mergeKey)
    return true
  }

  const conditionRows = useListRows<Condition>({
    items: data.conditions,
    onItemsChange: (next) =>
      applyDefinition(setConditions(data, next), null, next.length < data.conditions.length),
    makeItem: newCondition,
    firstField: 'name',
  })
  const outcomeRows = useListRows<Outcome>({
    items: data.outcomes,
    onItemsChange: (next) =>
      applyDefinition(setOutcomes(data, next), null, next.length < data.outcomes.length),
    makeItem: newOutcome,
    firstField: 'name',
  })

  const canAddCondition = productSize([...data.conditions, PROBE_CONDITION]) <= MAX_ROWS
  const canAddValue = (index: number): boolean =>
    productSize(
      data.conditions.map((c, i) => (i === index ? { ...c, values: [...c.values, ''] } : c)),
    ) <= MAX_ROWS

  const removeValueAt = (index: number, labelIndex: number) =>
    applyDefinition(removeValue(data, index, labelIndex), null, true)
  const removeChoiceAt = (index: number, labelIndex: number) =>
    applyDefinition(removeChoice(data, index, labelIndex), null, true)

  const conditionSection: Section = {
    rows: conditionRows,
    canAddRow: canAddCondition,
    onRemoveLabel: removeValueAt,
  }
  // 結果は行数に効かないので、上限に関わらず足せる
  const outcomeSection: Section = {
    rows: outcomeRows,
    canAddRow: true,
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
        if (labelIndex === null) section.rows.deleteAt(at.index)
        else section.onRemoveLabel(at.index, labelIndex)
        return true
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
        // focus-next-field / focus-prev-field は消費しない——ラベルの本数が行ごとに
        // 違うので写せる列の並びが無い。ブラウザの Tab 順がそのまま生きる。
        // undo / redo は額縁（App）のグローバル層が取る
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
        family: 'list',
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

  const describeLoss = (applied: Applied): string =>
    `記入済みの結果 ${applied.lostCells} 件が失われます。` +
    (applied.clearedCells > 0
      ? `うち ${applied.clearedCells} 件は、まとまった行で値が食い違うため空欄になります。`
      : '') +
    'Undo で戻せます。'

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <MissingTally tally={tallyMissing(data)} onJump={jumpToMissing} />
        <KeyHints hints={DEFINITION_HINTS} />
      </div>
      {!canAddCondition && (
        <p className="mb-3 text-base text-ink-muted">
          {`行数の上限（${MAX_ROWS}行）に達しているので、条件と値をこれ以上足せません。`}
        </p>
      )}
      {/* useListRows の focusCell は containerRef の中を querySelector で引く。
          条件と結果で別々の ref なので、包む div も2つに分ける */}
      <div ref={conditionRows.containerRef} className="mb-6">
        <DefinitionList
          heading="条件"
          nameLabel="条件名"
          itemLabel="値"
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
          onRemoveRow={(index) => conditionRows.deleteAt(index)}
          onAddLabel={(index) => applyDefinition(addValue(data, index), null, false)}
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
          onRemoveRow={(index) => outcomeRows.deleteAt(index)}
          onAddLabel={(index) => applyDefinition(addChoice(data, index), null, false)}
          onRemoveLabel={removeChoiceAt}
          onCellKeyDown={cellKeyDown(outcomeSection)}
          addButtonRef={outcomeRows.addButtonRef}
        />
      </div>
      <ConfirmDialog
        open={pending !== null}
        title="記入済みの結果が失われます"
        description={pending === null ? '' : describeLoss(pending.applied)}
        confirmLabel="続ける"
        onConfirm={() => {
          if (pending !== null) onChange(pending.applied.data, pending.mergeKey)
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
