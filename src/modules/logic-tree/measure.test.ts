import { describe, expect, it } from 'vitest'
import {
  createEstimateMeasurer,
  NODE_INSET_X,
  NODE_INSET_Y,
  NODE_WIDTH,
  wrapText,
} from './measure'

/** 半角=5px / 全角=10px の測定器。境界の計算を暗算できる値にする */
const measure = createEstimateMeasurer(10)
const LH = 20
const CONTENT_MAX = NODE_WIDTH - NODE_INSET_X * 2

describe('wrapText', () => {
  it('空文字は1行・固定幅になる', () => {
    const r = wrapText('', measure, LH)
    expect(r.lines).toEqual([''])
    expect(r.width).toBe(NODE_WIDTH)
    expect(r.height).toBe(LH + NODE_INSET_Y * 2)
  })

  /**
   * ノード幅を内容から導出すると長文ノードだけ幅が3倍になり、
   * 木の骨格が読めなくなる（rev 9章 D3）ので、幅は導出しない
   */
  it('短い文言でも幅は固定（自然幅へ縮まない）', () => {
    expect(wrapText('あいうえお', measure, LH).width).toBe(NODE_WIDTH)
  })

  it('最大幅に収まる文言は折り返さない', () => {
    const r = wrapText('あいうえお', measure, LH)
    expect(r.lines).toEqual(['あいうえお'])
    expect(r.height).toBe(LH + NODE_INSET_Y * 2)
  })

  it('内容幅を超えたら折り返し、幅は固定のまま', () => {
    const perLine = Math.floor(CONTENT_MAX / 10)
    const r = wrapText('あ'.repeat(perLine + 3), measure, LH)
    expect(r.lines.length).toBe(2)
    expect(r.lines[0].length).toBe(perLine)
    expect(r.lines[1].length).toBe(3)
    expect(r.width).toBe(NODE_WIDTH)
    expect(r.height).toBe(LH * 2 + NODE_INSET_Y * 2)
  })

  it('折り返した各行は、内容の幅の上限に収まる', () => {
    const r = wrapText('あ'.repeat(80), measure, LH)
    for (const line of r.lines) expect(measure(line)).toBeLessThanOrEqual(CONTENT_MAX)
  })

  it('明示改行で行を分ける', () => {
    const r = wrapText('承認\n却下\n差し戻し', measure, LH)
    expect(r.lines).toEqual(['承認', '却下', '差し戻し'])
    expect(r.height).toBe(LH * 3 + NODE_INSET_Y * 2)
  })

  it('単語の途中でも折り返す（日本語向けの break-all と同じ規則）', () => {
    const perLine = Math.floor(CONTENT_MAX / 5)
    expect(wrapText('a'.repeat(perLine + 2), measure, LH).lines.length).toBe(2)
  })

  it('1文字が内容幅を超えても、その1文字で1行を作る（無限ループにしない）', () => {
    const huge = createEstimateMeasurer(1000)
    expect(wrapText('あい', huge, LH).lines).toEqual(['あ', 'い'])
  })
})
