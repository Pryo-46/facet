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
/**
 * ガターの行見出し（#N 文言）の1行分。スロット群はこの下から積む。
 * text-sm 1行＝14×1.3＝18.2 の切り上げ
 */
export const GUTTER_HEADING_HEIGHT = 19
/**
 * ガターの問いラベル列の幅。**いま立つ問いがすべて1行に収まる幅を採る。**
 *
 * 一番きついのは `ifExecuted` の「└ 既に実行されていたら？」——`text-sm`（14px）で
 * 概算 175px（「└ 」21 ＋ 11文字 154）＋ 字下げ 16px ＝ 191。余裕を見て 220。
 * `questions.test.ts` がこの下限を検算しているので、**問いの文言を足す／
 * 伸ばすときはここも一緒に見ること**（折り返すとその行だけ背が伸びる）。
 *
 * **この幅は reply 行の一般文言の折り返しも決める**——`gutterWidth` は
 * この値と答えセルの外形幅の和で、`SequenceEditor` はその幅で一般文言を出す。
 * 一般文言の高さは layout が知らない（行高に入らない）ので、**折り返した瞬間に
 * 次の行へ食い込む**。文言を伸ばすときは 1行に収まることを確かめること
 */
export const QUESTION_LABEL_WIDTH = 220
export const DIAGRAM_MARGIN = 8
/**
 * 行の左端に置く編集セル列（レール）の幅。**図はこの右から始まる。**
 *
 * 内訳: 左pad8 + #n24 + 隙4 + from100 + 矢印グリフ12 + to100 + 隙4 + 種別136 + 右pad8。
 *
 * 編集セルを「矢印の脇」に置くと、図が細いとき（参加者1人など）に
 * ガターの問いラベル列と横方向で衝突する（実機確認の第一報）。
 * 横の帯域を [レール][図][ガター] に分離し、衝突を構造ごと無くす
 */
export const RAIL_WIDTH = 396
/** ラベルが矢印より広いときに列間へ足す左右の逃げ */
const LABEL_SIDE_PAD = 24

export interface StepMetrics {
  labelWidth: number
  labelHeight: number
  slotHeights: number[]
}

export interface SeqLayoutInput {
  actorWidths: number[]
  /**
   * `isSelf` は文言の置き方が種別で変わるために要る（self は起点の真上、
   * 呼出／応答は from-to の中点）。**エディタ側で分岐させないこと**——
   * 置き方を知っているのがここだけだから、ガターの左端をそこから導ける
   */
  steps: {
    fromIndex: number
    toIndex: number | null
    isSelf: boolean
    metrics: StepMetrics
  }[]
}

export interface SeqRow {
  top: number
  height: number
  arrowY: number
  slotTops: number[]
  /** 文言セルの左端。描画はこれをそのまま使う（置き方の正はレイアウト） */
  labelLeft: number
}

export interface SeqLayoutResult {
  actorX: number[]
  headerTop: number
  headerHeight: number
  rows: SeqRow[]
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
  // 図の左端はレールの右。以降の導出（gap・ガター）はすべて
  // actorX からの相対なので、起点をずらすだけで帯域が分かれる
  let x = DIAGRAM_MARGIN + RAIL_WIDTH + (input.actorWidths[0] ?? 0) / 2
  for (let i = 0; i < n; i++) {
    actorX.push(x)
    x += gaps[i] ?? 0
  }

  // 参照が引けない行の逃げ場は「図の左端」＝レールの右。
  // DIAGRAM_MARGIN に置くとレールのセルの上に文言が乗る
  const diagramLeft = DIAGRAM_MARGIN + RAIL_WIDTH
  /**
   * 文言セルの左端。**self は起点の真上**（矢印が無く、線は自分へ戻るだけ）、
   * 呼出／応答は from-to の中点に文言の中心を合わせる。
   * 参照が引けないときはどちらも図の左端へ逃がす
   */
  const labelLeftOf = (step: SeqLayoutInput['steps'][number]): number => {
    const fromX = actorX[step.fromIndex]
    if (step.isSelf) return fromX ?? diagramLeft
    const toX = step.toIndex === null ? undefined : actorX[step.toIndex]
    if (fromX === undefined || toX === undefined) return diagramLeft
    return (fromX + toX) / 2 - step.metrics.labelWidth / 2
  }

  // ---- Y 軸: 行を上から積む ----
  const rows: SeqRow[] = []
  // 文言の右端の最大。**ガターの左端はこれも見る**——参加者ヘッダの右端だけで
  // 決めると、参加者が少なく文言が長い図（self の内部処理など）で
  // 文言がガターの問いラベルに重なる（実機確認で踏んだ）
  let labelsRight = 0
  let top = HEADER_HEIGHT + FIRST_ROW_GAP
  for (const step of input.steps) {
    const m = step.metrics
    const labelLeft = labelLeftOf(step)
    labelsRight = Math.max(labelsRight, labelLeft + m.labelWidth)
    const slotsHeight =
      m.slotHeights.length === 0
        ? 0
        : m.slotHeights.reduce((a, b) => a + b, 0) + SLOT_GAP * (m.slotHeights.length - 1)
    const height = Math.max(
      MIN_ROW_HEIGHT,
      m.labelHeight + ARROW_GAP * 2,
      GUTTER_HEADING_HEIGHT + slotsHeight,
    )
    const arrowY = top + m.labelHeight + ARROW_GAP
    const slotTops: number[] = []
    let slotTop = top + GUTTER_HEADING_HEIGHT
    for (const h of m.slotHeights) {
      slotTops.push(slotTop)
      slotTop += h + SLOT_GAP
    }
    rows.push({ top, height, arrowY, slotTops, labelLeft })
    top += height + ROW_GAP
  }

  // ---- ガター ----
  const lastRight = n === 0 ? DIAGRAM_MARGIN : actorX[n - 1] + input.actorWidths[n - 1] / 2
  const gutterX = Math.max(lastRight, labelsRight) + GUTTER_GAP
  const gutterWidth = QUESTION_LABEL_WIDTH + ANSWER_CONTENT_WIDTH + ANSWER_INSET_X * 2

  return {
    actorX,
    headerTop: 0,
    headerHeight: HEADER_HEIGHT,
    rows,
    gutterX,
    gutterWidth,
    totalWidth: gutterX + gutterWidth + DIAGRAM_MARGIN,
    totalHeight: top,
  }
}
