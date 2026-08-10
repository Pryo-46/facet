/**
 * レイアウト層（完全な純粋関数。design-notes 論点8）。
 * X＝actors 配列順（列間隔は区間を跨ぐ矢印ラベルの最大要求から導出）、
 * Y＝steps 配列順（行高＝max(ラベル, ガターのスロット群)）。
 * ここに「前回どこにあったか」を持ち込まないこと——同じデータから
 * 同じ図が出ることが「図は導出」のコードレベルの担保である
 */
import { ANSWER_CONTENT_WIDTH, ANSWER_INSET_X } from './measure'

export const MIN_COL_GAP = 160
export const HEADER_HEIGHT = 36
export const FIRST_ROW_GAP = 16
export const MIN_ROW_HEIGHT = 44
export const ARROW_GAP = 8
export const SLOT_GAP = 4
export const ROW_GAP = 8
export const GUTTER_GAP = 48
export const QUESTION_LABEL_WIDTH = 104
export const DIAGRAM_MARGIN = 8
/** ラベルが矢印より広いときに列間へ足す左右の逃げ */
const LABEL_SIDE_PAD = 24

export interface StepMetrics {
  labelWidth: number
  labelHeight: number
  slotHeights: number[]
}

export interface SeqLayoutInput {
  actorWidths: number[]
  domains: (string | undefined)[]
  steps: { fromIndex: number; toIndex: number | null; metrics: StepMetrics }[]
}

export interface SeqRow {
  top: number
  height: number
  arrowY: number
  slotTops: number[]
}

export interface SeqLayoutResult {
  actorX: number[]
  headerTop: number
  headerHeight: number
  rows: SeqRow[]
  boundaries: number[]
  gutterX: number
  gutterWidth: number
  totalWidth: number
  totalHeight: number
}

export function layoutSequence(input: SeqLayoutInput): SeqLayoutResult {
  const n = input.actorWidths.length

  // ---- X 軸: 隣接区間ごとの必要幅を集め、跨ぐ矢印は区間数で均等割り ----
  const gaps = new Array<number>(Math.max(0, n - 1)).fill(MIN_COL_GAP)
  for (const step of input.steps) {
    if (step.toIndex === null || step.toIndex === step.fromIndex) continue
    const lo = Math.min(step.fromIndex, step.toIndex)
    const hi = Math.max(step.fromIndex, step.toIndex)
    if (lo < 0 || hi >= n) continue
    const need = (step.metrics.labelWidth + LABEL_SIDE_PAD) / (hi - lo)
    for (let g = lo; g < hi; g++) gaps[g] = Math.max(gaps[g], need)
  }
  // ヘッダ同士がぶつからない下限も足す
  for (let g = 0; g < gaps.length; g++) {
    const need = input.actorWidths[g] / 2 + input.actorWidths[g + 1] / 2 + 16
    gaps[g] = Math.max(gaps[g], need)
  }
  const actorX: number[] = []
  let x = DIAGRAM_MARGIN + (input.actorWidths[0] ?? 0) / 2
  for (let i = 0; i < n; i++) {
    actorX.push(x)
    x += gaps[i] ?? 0
  }

  // ---- 境界線: 双方が指定済みかつ異なる隣接間の中点 ----
  const boundaries: number[] = []
  for (let i = 0; i + 1 < n; i++) {
    const a = input.domains[i]
    const b = input.domains[i + 1]
    if (a !== undefined && b !== undefined && a !== b) {
      boundaries.push((actorX[i] + actorX[i + 1]) / 2)
    }
  }

  // ---- Y 軸: 行を上から積む ----
  const rows: SeqRow[] = []
  let top = HEADER_HEIGHT + FIRST_ROW_GAP
  for (const step of input.steps) {
    const m = step.metrics
    const slotsHeight =
      m.slotHeights.length === 0
        ? 0
        : m.slotHeights.reduce((a, b) => a + b, 0) + SLOT_GAP * (m.slotHeights.length - 1)
    const height = Math.max(MIN_ROW_HEIGHT, m.labelHeight + ARROW_GAP * 2, slotsHeight)
    const arrowY = top + m.labelHeight + ARROW_GAP
    const slotTops: number[] = []
    let slotTop = top
    for (const h of m.slotHeights) {
      slotTops.push(slotTop)
      slotTop += h + SLOT_GAP
    }
    rows.push({ top, height, arrowY, slotTops })
    top += height + ROW_GAP
  }

  // ---- ガター ----
  const lastRight = n === 0 ? DIAGRAM_MARGIN : actorX[n - 1] + input.actorWidths[n - 1] / 2
  const gutterX = lastRight + GUTTER_GAP
  const gutterWidth = QUESTION_LABEL_WIDTH + ANSWER_CONTENT_WIDTH + ANSWER_INSET_X * 2

  return {
    actorX,
    headerTop: 0,
    headerHeight: HEADER_HEIGHT,
    rows,
    boundaries,
    gutterX,
    gutterWidth,
    totalWidth: gutterX + gutterWidth + DIAGRAM_MARGIN,
    totalHeight: top,
  }
}
