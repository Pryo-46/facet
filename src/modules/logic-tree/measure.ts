import { wrapWithin, type MeasureWidth, type WrappedBlock } from '@/core/canvas/wrap'

export type { MeasureWidth }
export { createEstimateMeasurer } from '@/core/canvas/wrap'
export type WrappedText = WrappedBlock

/**
 * ノード矩形の幅。**固定。導出しない**（rev 9章 D3。M24）。
 *
 * 内容から導出していたころは長文ノードだけ幅が3倍になり、木の骨格が
 * 読めなかった。課題ツリーの箱（`src/modules/issue-tree/measure.ts` の
 * `BOX_WIDTH`）も**固定**だが、**値はもう同じではない**——あちらは
 * issue-tree m5 で旗のトグルが2つになったぶん 320 → 360 へ伸びた。
 * シーケンスの `LABEL_MAX_WIDTH` は同じ 320 だが、あちらは**上限**であって
 * 固定ではない。**3つを共有定数に束ねていないのが正しかった**ことを、
 * この食い違いそのものが示している（束ねていたら課題ツリーの都合で
 * ロジックツリーとシーケンスまで一緒に広がっていた）
 */
export const NODE_WIDTH = 320
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
    // **`maxWidth === minWidth` が「幅を導出しない」の表現である**
    //（シーケンスの答えセル `ANSWER_WRAP` と同じ形）
    maxWidth: NODE_WIDTH,
    minWidth: NODE_WIDTH,
    insetX: NODE_INSET_X,
    insetY: NODE_INSET_Y,
  })
}
