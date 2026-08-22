// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { FALLBACK_CANVAS_FONT, readCanvasFont, sameFont } from './canvas-font'

describe('readCanvasFont', () => {
  it('el が null なら FALLBACK_CANVAS_FONT（14px）に落ちる', () => {
    expect(sameFont(readCanvasFont(null), FALLBACK_CANVAS_FONT)).toBe(true)
  })

  it('fontSize が読めない要素でも FALLBACK_CANVAS_FONT（14px）に落ちる', () => {
    // jsdom はスタイルシートを解決しないので、素の div の
    // getComputedStyle().fontSize は空文字になる（Number.parseFloat が NaN）。
    // 小さい方の見本要素（text-xs）に対して呼んでも FALLBACK_SMALL_FONT には
    // ならないこと——読者が混乱しやすい据え置きの挙動を、ここで固定する
    const el = document.createElement('div')
    expect(sameFont(readCanvasFont(el), FALLBACK_CANVAS_FONT)).toBe(true)
  })
})
