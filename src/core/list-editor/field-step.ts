/**
 * Tab / Shift+Tab のセル移動先（全ツール共通・コア）。
 * 行端では隣の行へ折り返す。移動先の行が無い場合は呼び出し側が何もしない
 *（既定の Tab 動作を止めない）
 */
export interface FieldStep<TField extends string> {
  field: TField
  /** 行の移動量。1＝次の行の先頭列へ、-1＝前の行の末尾列へ */
  rowDelta: -1 | 0 | 1
}

export function stepField<TField extends string>(
  order: readonly TField[],
  field: TField,
  direction: 1 | -1,
): FieldStep<TField> {
  const index = order.indexOf(field)
  const next = index + direction
  if (next < 0) return { field: order[order.length - 1], rowDelta: -1 }
  if (next >= order.length) return { field: order[0], rowDelta: 1 }
  return { field: order[next], rowDelta: 0 }
}
