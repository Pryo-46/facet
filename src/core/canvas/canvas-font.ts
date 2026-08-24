import { createEstimateMeasurer, type MeasureWidth } from './wrap'

export interface CanvasFont {
  /** canvas の ctx.font に渡す値（CSS の font 短縮形と同じ書式） */
  font: string
  fontSize: number
  lineHeight: number
}

/**
 * 測れない環境（jsdom はレイアウトを持たない）用の既定値。
 * text-base + leading-normal（16px・行間 1.5。rev 9章 M23 決定1）
 * ——キャンバスの折り返しテキストは複数行段
 */
export const FALLBACK_CANVAS_FONT: CanvasFont = {
  font: 'normal 400 16px sans-serif',
  fontSize: 16,
  lineHeight: 16 * 1.5,
}

/**
 * 問いラベル列（text-sm）用の既定値。**FALLBACK_CANVAS_FONT を使い回さないこと**
 * ——text-sm は 14px・行間 1.3 で、複数行段（16px・1.5）とはサイズも行間も違う
 * （src/index.css の --text-sm--line-height）。
 * 揃えてしまうと、ラベル用の測定器が本文相当の高さを返し続け、
 * jsdom のテストでは両者の違いを検出できなくなる
 */
export const FALLBACK_SMALL_FONT: CanvasFont = {
  font: 'normal 400 14px sans-serif',
  fontSize: 14,
  lineHeight: 14 * 1.3,
}

export function sameFont(a: CanvasFont, b: CanvasFont): boolean {
  return a.font === b.font && a.fontSize === b.fontSize && a.lineHeight === b.lineHeight
}

/**
 * 実際に解決されたフォントを DOM から読む。
 *
 * **測定と描画は同一の情報源を見る必要がある**（rev 9章）。定数で二重に
 * 持つと、トークンを変えたときに全ノードのサイズが静かに狂う。描画される
 * ノードと同じクラスを当てた見本要素から読むことで、その口を1つに保つ
 *
 * **`el === null` のとき（および fontSize が読めないとき）返るのは常に
 * `FALLBACK_CANVAS_FONT`（16px）である。小さい方の見本要素（text-sm）に
 * 対して呼んでも `FALLBACK_SMALL_FONT` にはならない。** これは logic-tree
 * M1 以来の既存の挙動で、据え置いている——変えると sequence の行高が静かに
 * ずれる
 */
export function readCanvasFont(el: HTMLElement | null): CanvasFont {
  if (el === null || typeof getComputedStyle !== 'function') return FALLBACK_CANVAS_FONT
  const style = getComputedStyle(el)
  const fontSize = Number.parseFloat(style.fontSize)
  if (!Number.isFinite(fontSize) || fontSize <= 0) return FALLBACK_CANVAS_FONT
  const parsed = Number.parseFloat(style.lineHeight)
  const lineHeight = Number.isFinite(parsed) && parsed > 0 ? parsed : fontSize * 1.5
  const family = style.fontFamily === '' ? 'sans-serif' : style.fontFamily
  const weight = style.fontWeight === '' ? '400' : style.fontWeight
  const fontStyle = style.fontStyle === '' ? 'normal' : style.fontStyle
  return { font: `${fontStyle} ${weight} ${fontSize}px ${family}`, fontSize, lineHeight }
}

/**
 * 幅の測定器を作る。**canvas の measureText は DOM に触れずリフローも
 * 起こさない**ので、入力のたびに同期的に呼んでよい。
 * canvas が使えない環境（jsdom）では概算に落ちる
 */
export function createCanvasMeasurer(font: CanvasFont): MeasureWidth {
  if (typeof document !== 'undefined') {
    const ctx = document.createElement('canvas').getContext('2d')
    if (ctx !== null) {
      ctx.font = font.font
      return (text) => ctx.measureText(text).width
    }
  }
  return createEstimateMeasurer(font.fontSize)
}
