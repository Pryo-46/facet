// logic-tree/node-font.ts の複製（sequence M1）。core/canvas への共通化は
// 2本目完成後に別マイルストーンで判断する（scope の禁止事項）。差分を
// 作らないこと——直すときは両方を直し、open-issues の複製の項に従う

import { createEstimateMeasurer, type MeasureWidth } from '../logic-tree/measure'

export interface SeqFont {
  /** canvas の ctx.font に渡す値（CSS の font 短縮形と同じ書式） */
  font: string
  fontSize: number
  lineHeight: number
}

/**
 * 測れない環境（jsdom はレイアウトを持たない）用の既定値。
 * text-sm（14px）・行間 1.65（rev 9章 M7 決定6）
 */
export const FALLBACK_SEQ_FONT: SeqFont = {
  font: 'normal 400 14px sans-serif',
  fontSize: 14,
  lineHeight: 14 * 1.65,
}

export function sameFont(a: SeqFont, b: SeqFont): boolean {
  return a.font === b.font && a.fontSize === b.fontSize && a.lineHeight === b.lineHeight
}

/**
 * 実際に解決されたフォントを DOM から読む。
 *
 * **測定と描画は同一の情報源を見る必要がある**（rev 9章）。定数で二重に
 * 持つと、トークンを変えたときに全ノードのサイズが静かに狂う。描画される
 * ノードと同じクラスを当てた見本要素から読むことで、その口を1つに保つ
 */
export function readSeqFont(el: HTMLElement | null): SeqFont {
  if (el === null || typeof getComputedStyle !== 'function') return FALLBACK_SEQ_FONT
  const style = getComputedStyle(el)
  const fontSize = Number.parseFloat(style.fontSize)
  if (!Number.isFinite(fontSize) || fontSize <= 0) return FALLBACK_SEQ_FONT
  const parsed = Number.parseFloat(style.lineHeight)
  const lineHeight = Number.isFinite(parsed) && parsed > 0 ? parsed : fontSize * 1.65
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
export function createSeqMeasurer(font: SeqFont): MeasureWidth {
  if (typeof document !== 'undefined') {
    const ctx = document.createElement('canvas').getContext('2d')
    if (ctx !== null) {
      ctx.font = font.font
      return (text) => ctx.measureText(text).width
    }
  }
  return createEstimateMeasurer(font.fontSize)
}
