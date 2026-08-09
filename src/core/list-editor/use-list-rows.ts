import { useEffect, useRef, useState } from 'react'
import { insertAt, moveItem, removeAt } from '../list-ops'
import { computeRowKeys } from '../row-keys'

/**
 * 行の構造操作とフォーカス予約（全ツール共通・コア。M9 で用語集エディタから引き上げ）。
 *
 * **構造操作の後、新しい DOM が出てからでないとフォーカスを移せない。** だから
 * 直接 focus せず予約（state）に積み、effect で消化する。ここを各エディタで
 * 書き直すと、M8 でつぶした「削除後にフォーカスが body へ落ちて操作不能になる」
 * 種のバグが、ツールごとに別々に再発する。
 *
 * **フィルタや導出表示は関知しない。** 0件になったことを `onEmptied` で
 * 知らせるだけで、何をするかはエディタが決める——フィルタを持たないツールが
 * 出た時点で引数が無意味に残るのを避けるため（M9 決定2）
 */

export interface ListRowsOptions<T extends { id: string }> {
  items: readonly T[]
  /** mergeKey は Undo 履歴のまとめ単位。構造操作は常に null を渡す */
  onItemsChange: (next: T[], mergeKey: string | null) => void
  makeItem: () => T
  /** 挿入・削除の後にフォーカスするフィールド */
  firstField: string
  /** 0件になったときの通知。フィルタの解除など、エディタ側の後始末に使う */
  onEmptied?: () => void
}

export interface ListRows {
  containerRef: React.RefObject<HTMLDivElement | null>
  addButtonRef: React.RefObject<HTMLButtonElement | null>
  rowKeys: string[]
  focusCell: (rowKey: string, field: string, select?: boolean) => boolean
  insertAfter: (index: number) => void
  deleteAt: (index: number) => void
  moveBy: (index: number, delta: -1 | 1, field: string) => void
}

/** セルの DOM 上の識別子。フォーカス移動が querySelector で引く */
export function cellId(rowKey: string, field: string): string {
  return `${rowKey}:${field}`
}

/** セルにフォーカスを移す。select＝既定値を打ち替えられるよう全選択する */
function focusIn(
  container: HTMLElement | null,
  rowKey: string,
  field: string,
  select: boolean,
): boolean {
  const el = container?.querySelector<HTMLElement>(`[data-cell="${cellId(rowKey, field)}"]`)
  if (!el) return false
  el.focus()
  if (select && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) el.select()
  return true
}

export function useListRows<T extends { id: string }>(
  options: ListRowsOptions<T>,
): ListRows {
  const { items, onItemsChange, makeItem, firstField, onEmptied } = options

  const containerRef = useRef<HTMLDivElement>(null)
  // 構造操作の後、新しい DOM が出てからフォーカスを移すための予約
  const [pendingFocus, setPendingFocus] = useState<{
    rowKey: string
    field: string
    select?: boolean
  } | null>(null)

  // 0件になったときの移動先。行が無いのでセルの鍵では指せない
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const [focusAddButton, setFocusAddButton] = useState(false)

  useEffect(() => {
    if (pendingFocus === null) return
    focusIn(containerRef.current, pendingFocus.rowKey, pendingFocus.field, pendingFocus.select === true)
    setPendingFocus(null)
  }, [pendingFocus])

  useEffect(() => {
    if (!focusAddButton) return
    addButtonRef.current?.focus()
    setFocusAddButton(false)
  }, [focusAddButton])

  const rowKeys = computeRowKeys(items)

  const insertAfter = (index: number): void => {
    const item = makeItem()
    onItemsChange(insertAt(items, index + 1, item), null)
    // 採番したての ID は重複しないので出現順は 0
    setPendingFocus({ rowKey: `${item.id}#0`, field: firstField, select: true })
  }

  const deleteAt = (index: number): void => {
    const next = removeAt(items, index)
    onItemsChange(next, null)
    if (next.length === 0) {
      onEmptied?.()
      setFocusAddButton(true)
      return
    }
    // 削除後の配列から鍵を引く。先頭行を消したときは新しい先頭行へ移る
    // （前の行が無いからとフォーカスを放置すると body に落ちて操作不能になる）
    setPendingFocus({
      rowKey: computeRowKeys(next)[Math.min(index, next.length - 1)],
      field: firstField,
    })
  }

  const moveBy = (index: number, delta: -1 | 1, field: string): void => {
    const to = index + delta
    if (to < 0 || to >= items.length) return
    const next = moveItem(items, index, to)
    onItemsChange(next, null)
    // 移動後の配列から鍵を引く。ID が重複していると入れ替えで出現順が変わり、
    // 移動前の rowKeys[index] は別の行を指しうる
    setPendingFocus({ rowKey: computeRowKeys(next)[to], field })
  }

  return {
    containerRef,
    addButtonRef,
    rowKeys,
    focusCell: (rowKey, field, select = false) =>
      focusIn(containerRef.current, rowKey, field, select),
    insertAfter,
    deleteAt,
    moveBy,
  }
}
