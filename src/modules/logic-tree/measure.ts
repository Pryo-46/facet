import { wrapWithin, type MeasureWidth, type WrappedBlock } from '@/core/canvas/wrap'

export type { MeasureWidth }
export { createEstimateMeasurer } from '@/core/canvas/wrap'
export type WrappedText = WrappedBlock

/** ノード矩形の最大幅。日本語で全角20文字前後（tech-notes 論点4） */
export const NODE_MAX_WIDTH = 320
/** ノード矩形の最小幅。空のノードが点にならないための下限 */
export const NODE_MIN_WIDTH = 96
export const NODE_PADDING_X = 10
export const NODE_PADDING_Y = 6
export const NODE_BORDER = 1

/**
 * 測定が使う内側の余白。**CSS の padding と border の合計と必ず一致させること。**
 * ここが実際より小さいと、ブラウザに与えられる幅が測定の前提より狭くなり、
 * 測定より多い行数に折り返して文字が切れる
 */
export const NODE_INSET_X = NODE_PADDING_X + NODE_BORDER
export const NODE_INSET_Y = NODE_PADDING_Y + NODE_BORDER

/**
 * 上の定数に対応する Tailwind クラス。**片方だけ変えないこと。**
 * px-2.5 = 10px ／ py-1.5 = 6px ／ border = 1px
 */
export const NODE_BOX_CLASS = 'border px-2.5 py-1.5'

/** ノード矩形の寸法。折り返しの規則そのものは core/canvas/wrap.ts が持つ */
export function wrapText(text: string, measure: MeasureWidth, lineHeight: number): WrappedText {
  return wrapWithin(text, measure, lineHeight, {
    maxWidth: NODE_MAX_WIDTH,
    minWidth: NODE_MIN_WIDTH,
    insetX: NODE_INSET_X,
    insetY: NODE_INSET_Y,
  })
}
