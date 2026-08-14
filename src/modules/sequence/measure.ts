/**
 * 測定層（DOM 非依存・純関数）。logic-tree/measure.ts と同じ1パス方針:
 * 「入力 → サイズ計算 → レイアウト → 一度だけ描画」。
 * 折り返しはコードポイント単位のグリーディで、CSS の break-all と同じ規則。
 * （複製の記録: 共通化は2本目完成後に別マイルストーンで判断）
 */

/** ステップ文言の最大幅。logic-tree のノードと同じ値（tech-notes 論点4の根拠を引き継ぐ） */
export const LABEL_MAX_WIDTH = 320
export const LABEL_MIN_WIDTH = 64
export const LABEL_PADDING_X = 6
export const LABEL_PADDING_Y = 2
export const LABEL_BORDER = 0
export const LABEL_INSET_X = LABEL_PADDING_X + LABEL_BORDER
export const LABEL_INSET_Y = LABEL_PADDING_Y + LABEL_BORDER
/** 上の定数に対応する Tailwind クラス。片方だけ変えないこと */
export const LABEL_BOX_CLASS = 'px-1.5 py-0.5'

/** self ボックス。枠線があるぶん inset が違う */
export const SELF_PADDING_X = 10
export const SELF_PADDING_Y = 6
export const SELF_BORDER = 1
export const SELF_INSET_X = SELF_PADDING_X + SELF_BORDER
export const SELF_INSET_Y = SELF_PADDING_Y + SELF_BORDER
export const SELF_MIN_WIDTH = 96
export const SELF_BOX_CLASS = 'border px-2.5 py-1.5'

/** 参加者ヘッダ */
export const ACTOR_MIN_WIDTH = 96
export const ACTOR_MAX_WIDTH = 240
export const ACTOR_PADDING_X = 12
export const ACTOR_BORDER = 1
export const ACTOR_INSET_X = ACTOR_PADDING_X + ACTOR_BORDER
export const ACTOR_BOX_CLASS = 'border px-3 py-1'

/** ガターの答えセル。内容幅は固定（design-notes 論点7: ガター幅は導出しない） */
export const ANSWER_CONTENT_WIDTH = 240
export const ANSWER_PADDING_X = 8
export const ANSWER_PADDING_Y = 4
export const ANSWER_BORDER = 1
export const ANSWER_INSET_X = ANSWER_PADDING_X + ANSWER_BORDER
export const ANSWER_INSET_Y = ANSWER_PADDING_Y + ANSWER_BORDER
export const ANSWER_BOX_CLASS = 'border px-2 py-1'

/**
 * ラベル列に実際に描画される文字列（ifExecuted の「└ 」接頭を含む）。
 * **測る文字列と描く文字列を同じにするため**、GutterSlot の描画も
 * SequenceEditor の questionHeight もこの戻り値だけを見る。素の問い文言を
 * 測ると接頭辞のぶん短く出て、折り返しが1行足りず下の行へ食い込む。
 * ANSWER_BOX_CLASS と同じ理由でこの純粋層に置く——描画と測定の共通語彙は、
 * 部品側に置くと測定側から見えず二重定義になる
 */
export function gutterLabelText(question: string, indent: boolean): string {
  return indent ? `└ ${question}` : question
}

export type MeasureWidth = (text: string) => number

export interface WrapOptions {
  maxWidth: number
  minWidth: number
  insetX: number
  insetY: number
}

export interface WrappedBlock {
  lines: string[]
  width: number
  height: number
}

export function wrapWithin(
  text: string,
  measure: MeasureWidth,
  lineHeight: number,
  opts: WrapOptions,
): WrappedBlock {
  const maxContent = opts.maxWidth - opts.insetX * 2
  const lines: string[] = []
  for (const segment of text.split('\n')) {
    let line = ''
    for (const ch of segment) {
      if (line === '') {
        line = ch
        continue
      }
      if (measure(line + ch) > maxContent) {
        lines.push(line)
        line = ch
      } else {
        line += ch
      }
    }
    lines.push(line)
  }
  const contentWidth = lines.reduce((w, line) => Math.max(w, measure(line)), 0)
  const width = Math.min(
    opts.maxWidth,
    Math.max(opts.minWidth, Math.ceil(contentWidth) + opts.insetX * 2),
  )
  const height = Math.ceil(lines.length * lineHeight) + opts.insetY * 2
  return { lines, width, height }
}

/** jsdom 用の概算器（logic-tree/measure.ts と同じ。本番では使わない） */
export function createEstimateMeasurer(fontSize: number): MeasureWidth {
  return (text) => {
    let width = 0
    for (const ch of text) {
      width += ((ch.codePointAt(0) ?? 0) < 0x80 ? 0.5 : 1) * fontSize
    }
    return width
  }
}
