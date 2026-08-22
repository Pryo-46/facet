import { describe, expect, it } from 'vitest'
import { createEstimateMeasurer, wrapWithin, type WrapOptions } from './wrap'

// 移設元: src/modules/sequence/measure.ts の wrapWithin テスト。
// LABEL_MAX_WIDTH（320）／LABEL_INSET_X（6）は元のツール定数の値をそのまま
// リテラルに写している（この定数自体は sequence 側に残るため、コア側では
// 値だけ引き継ぐ）
const seqMeasure = createEstimateMeasurer(14)
const SEQ_LH = 23.1
const SEQ_OPTS: WrapOptions = { maxWidth: 320, minWidth: 64, insetX: 6, insetY: 4 }

describe('wrapWithin', () => {
  it('収まる文言は1行', () => {
    const w = wrapWithin('注文', seqMeasure, SEQ_LH, SEQ_OPTS)
    expect(w.lines).toEqual(['注文'])
  })

  it('最大幅を超えると折り返す（測定と同じ規則で行が確定する）', () => {
    const long = 'あ'.repeat(40)
    const w = wrapWithin(long, seqMeasure, SEQ_LH, SEQ_OPTS)
    expect(w.lines.length).toBeGreaterThan(1)
    expect(w.lines.join('')).toBe(long)
    expect(w.width).toBeLessThanOrEqual(SEQ_OPTS.maxWidth)
  })

  it('明示改行は折り返しと別に効く', () => {
    const w = wrapWithin('a\nb', seqMeasure, SEQ_LH, SEQ_OPTS)
    expect(w.lines).toEqual(['a', 'b'])
  })

  it('最小幅を下回らない', () => {
    const w = wrapWithin('', seqMeasure, SEQ_LH, SEQ_OPTS)
    expect(w.width).toBe(64)
  })

  it('高さ＝行数×行高＋上下の余白', () => {
    const w = wrapWithin('a\nb\nc', seqMeasure, SEQ_LH, SEQ_OPTS)
    expect(w.height).toBe(Math.ceil(3 * SEQ_LH) + 8)
  })
})

// 移設元: src/modules/logic-tree/measure.ts の wrapText テストのうち、
// 上の sequence 由来のテストにない観点を補う。NODE_MAX_WIDTH（320）／
// NODE_INSET_X（11）／NODE_MIN_WIDTH（96）／NODE_INSET_Y（7）の値をそのまま
// リテラルに写している
describe('wrapWithin（logic-tree 由来の観点）', () => {
  const measure = createEstimateMeasurer(10)
  const LH = 20
  const OPTS: WrapOptions = { maxWidth: 320, minWidth: 96, insetX: 11, insetY: 7 }
  const CONTENT_MAX = OPTS.maxWidth - OPTS.insetX * 2

  it('空文字は1行・最小幅になる', () => {
    const r = wrapWithin('', measure, LH, OPTS)
    expect(r.lines).toEqual([''])
    expect(r.width).toBe(OPTS.minWidth)
    expect(r.height).toBe(LH + OPTS.insetY * 2)
  })

  it('幅は文言から算出し、最小幅を下回らない', () => {
    // 全角5文字 = 50px < minWidth(96)
    expect(wrapWithin('あいうえお', measure, LH, OPTS).width).toBe(OPTS.minWidth)
  })

  it('折り返した各行は、内容の幅の上限に収まる', () => {
    const r = wrapWithin('あ'.repeat(80), measure, LH, OPTS)
    for (const line of r.lines) expect(measure(line)).toBeLessThanOrEqual(CONTENT_MAX)
  })

  it('連続した改行は空行として残す', () => {
    expect(wrapWithin('あ\n\nい', measure, LH, OPTS).lines).toEqual(['あ', '', 'い'])
  })

  it('単語の途中でも折り返す（日本語向けの break-all と同じ規則）', () => {
    const perLine = Math.floor(CONTENT_MAX / 5)
    expect(wrapWithin('a'.repeat(perLine + 2), measure, LH, OPTS).lines.length).toBe(2)
  })

  it('1文字で最大幅を超えても、その1文字だけの行を作る（無限ループしない）', () => {
    const huge = (t: string): number => t.length * (CONTENT_MAX + 50)
    expect(wrapWithin('あい', huge, LH, OPTS).lines).toEqual(['あ', 'い'])
  })

  it('サロゲートペアを割らない', () => {
    expect(wrapWithin('𩸽', measure, LH, OPTS).lines).toEqual(['𩸽'])
  })

  it('同じ入力からは同じ結果が出る（純関数）', () => {
    expect(wrapWithin('あ'.repeat(50), measure, LH, OPTS)).toEqual(
      wrapWithin('あ'.repeat(50), measure, LH, OPTS),
    )
  })
})

describe('createEstimateMeasurer', () => {
  it('半角は全角の半分の幅にする', () => {
    const m = createEstimateMeasurer(14)
    expect(m('ab')).toBe(14)
    expect(m('あい')).toBe(28)
  })
})
