import { stepField as stepFieldOf, type FieldStep } from '@/core/list-editor/field-step'

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

/**
 * Tab / Shift+Tab の移動先。実装は `@/core/list-editor/field-step` にある。
 * ここは用語集の列順を束ねるだけ——呼び出し側が毎回 FIELD_ORDER を渡さずに済む
 */
export function stepField(field: GlossaryField, direction: 1 | -1): FieldStep<GlossaryField> {
  return stepFieldOf(FIELD_ORDER, field, direction)
}
