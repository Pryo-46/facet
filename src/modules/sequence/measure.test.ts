import { describe, expect, it } from 'vitest'
import { createEstimateMeasurer, wrapWithin, LABEL_MAX_WIDTH, LABEL_INSET_X } from './measure'

const measure = createEstimateMeasurer(14)
const LH = 23.1

describe('wrapWithin', () => {
  it('収まる文言は1行', () => {
    const w = wrapWithin('注文', measure, LH, { maxWidth: LABEL_MAX_WIDTH, minWidth: 64, insetX: LABEL_INSET_X, insetY: 4 })
    expect(w.lines).toEqual(['注文'])
  })

  it('最大幅を超えると折り返す（測定と同じ規則で行が確定する）', () => {
    const long = 'あ'.repeat(40)
    const w = wrapWithin(long, measure, LH, { maxWidth: LABEL_MAX_WIDTH, minWidth: 64, insetX: LABEL_INSET_X, insetY: 4 })
    expect(w.lines.length).toBeGreaterThan(1)
    expect(w.lines.join('')).toBe(long)
    expect(w.width).toBeLessThanOrEqual(LABEL_MAX_WIDTH)
  })

  it('明示改行は折り返しと別に効く', () => {
    const w = wrapWithin('a\nb', measure, LH, { maxWidth: LABEL_MAX_WIDTH, minWidth: 64, insetX: LABEL_INSET_X, insetY: 4 })
    expect(w.lines).toEqual(['a', 'b'])
  })

  it('最小幅を下回らない', () => {
    const w = wrapWithin('', measure, LH, { maxWidth: LABEL_MAX_WIDTH, minWidth: 64, insetX: LABEL_INSET_X, insetY: 4 })
    expect(w.width).toBe(64)
  })

  it('高さ＝行数×行高＋上下の余白', () => {
    const w = wrapWithin('a\nb\nc', measure, LH, { maxWidth: LABEL_MAX_WIDTH, minWidth: 64, insetX: LABEL_INSET_X, insetY: 4 })
    expect(w.height).toBe(Math.ceil(3 * LH) + 8)
  })
})
