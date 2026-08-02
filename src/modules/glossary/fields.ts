/**
 * 用語集エディタの列（session-notes 論点6）。
 * 名称／種別／定義／別名／備考の5列。ID は列に出さない
 *（機械用の参照キーであり、人間が常時見る情報ではない）。
 */
export const FIELD_ORDER = ['name', 'kind', 'definition', 'aliases', 'notes'] as const

export type GlossaryField = (typeof FIELD_ORDER)[number]

export const FIELD_LABELS: Record<GlossaryField, string> = {
  name: '名称',
  kind: '種別',
  definition: '定義',
  aliases: '別名',
  notes: '備考',
}

export interface FieldStep {
  field: GlossaryField
  /** 行の移動量。1＝次の行の先頭列へ、-1＝前の行の末尾列へ */
  rowDelta: -1 | 0 | 1
}

/**
 * Tab / Shift+Tab の移動先。行端では隣の行へ折り返す。
 * 移動先の行が無い場合は呼び出し側が何もしない（既定の Tab 動作を止めない）
 */
export function stepField(field: GlossaryField, direction: 1 | -1): FieldStep {
  const index = FIELD_ORDER.indexOf(field)
  const next = index + direction
  if (next < 0) return { field: FIELD_ORDER[FIELD_ORDER.length - 1], rowDelta: -1 }
  if (next >= FIELD_ORDER.length) return { field: FIELD_ORDER[0], rowDelta: 1 }
  return { field: FIELD_ORDER[next], rowDelta: 0 }
}
