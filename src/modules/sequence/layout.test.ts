import { describe, expect, it } from 'vitest'
import {
  ARROW_GAP,
  GUTTER_GAP,
  HEADER_HEIGHT,
  layoutSequence,
  MIN_COL_GAP,
  MIN_ROW_HEIGHT,
  QUESTION_LABEL_WIDTH,
  SLOT_GAP,
  type SeqLayoutInput,
} from './layout'
import { ANSWER_CONTENT_WIDTH, ANSWER_INSET_X } from './measure'

const metrics = (labelWidth = 80, labelHeight = 24, slotHeights: number[] = []) => ({
  labelWidth,
  labelHeight,
  slotHeights,
})

function input(over: Partial<SeqLayoutInput> = {}): SeqLayoutInput {
  return {
    actorWidths: [96, 96, 96],
    domains: [undefined, undefined, undefined],
    steps: [
      { fromIndex: 0, toIndex: 1, metrics: metrics() },
      { fromIndex: 1, toIndex: 2, metrics: metrics(80, 24, [28, 28, 28]) },
      { fromIndex: 2, toIndex: null, metrics: metrics() },
    ],
    ...over,
  }
}

describe('layoutSequence', () => {
  it('純粋関数: 同じ入力から同じ出力（2回呼んで一致）', () => {
    expect(layoutSequence(input())).toEqual(layoutSequence(input()))
  })

  it('列間隔は最小値を下回らない', () => {
    const r = layoutSequence(input())
    expect(r.actorX[1] - r.actorX[0]).toBeGreaterThanOrEqual(MIN_COL_GAP)
    expect(r.actorX[2] - r.actorX[1]).toBeGreaterThanOrEqual(MIN_COL_GAP)
  })

  it('長いラベルが跨ぐ区間は広がる（3列のうち中央の区間だけ）', () => {
    const wide = input()
    wide.steps[1] = { fromIndex: 1, toIndex: 2, metrics: metrics(300, 24) }
    const r = layoutSequence(wide)
    const base = layoutSequence(input())
    expect(r.actorX[2] - r.actorX[1]).toBeGreaterThan(base.actorX[2] - base.actorX[1])
    expect(r.actorX[1] - r.actorX[0]).toBe(base.actorX[1] - base.actorX[0])
  })

  it('複数区間を跨ぐ矢印は各区間に分配される（両区間が均等に広がる）', () => {
    const span = input()
    span.steps[0] = { fromIndex: 0, toIndex: 2, metrics: metrics(500, 24) }
    const r = layoutSequence(span)
    const gap01 = r.actorX[1] - r.actorX[0]
    const gap12 = r.actorX[2] - r.actorX[1]
    expect(gap01).toBeGreaterThan(MIN_COL_GAP)
    expect(gap01).toBe(gap12)
    // LABEL_SIDE_PAD は非公開だがレイアウト計画の定数表に載っている値（24）。
    // 分配後の区間幅は (labelWidth + LABEL_SIDE_PAD) / 区間数 になるはず。
    // ここで割り算そのものを検証する（割り算を消しても gap01 === gap12 は崩れないため、
    // 等値性だけでは変異を検出できない）。
    const labelSidePad = 24
    expect(gap01).toBe((500 + labelSidePad) / 2)
  })

  it('行の高さ: ガターのスロット群がラベルより高い行は、スロット群に合わせて伸びる', () => {
    const r = layoutSequence(input())
    const slots = 28 * 3 + SLOT_GAP * 2
    expect(r.rows[1].height).toBeGreaterThanOrEqual(slots)
    expect(r.rows[0].height).toBe(Math.max(MIN_ROW_HEIGHT, 24 + ARROW_GAP * 2))
  })

  it('行は上から順に積まれ、重ならない', () => {
    const r = layoutSequence(input())
    expect(r.rows[0].top).toBeGreaterThanOrEqual(HEADER_HEIGHT)
    expect(r.rows[1].top).toBeGreaterThanOrEqual(r.rows[0].top + r.rows[0].height)
    expect(r.rows[2].top).toBeGreaterThanOrEqual(r.rows[1].top + r.rows[1].height)
  })

  it('slotTops はスロットの数だけ、行の中で上から積まれる', () => {
    const r = layoutSequence(input())
    expect(r.rows[1].slotTops).toHaveLength(3)
    expect(r.rows[1].slotTops[0]).toBe(r.rows[1].top)
    expect(r.rows[1].slotTops[1]).toBe(r.rows[1].top + 28 + SLOT_GAP)
  })

  it('境界線: 双方が指定済みかつ異なる隣接間だけに出る', () => {
    const r = layoutSequence(input({ domains: ['自社', '自社', '決済会社'] }))
    expect(r.boundaries).toHaveLength(1)
    expect(r.boundaries[0]).toBeGreaterThan(r.actorX[1])
    expect(r.boundaries[0]).toBeLessThan(r.actorX[2])
    // 片方未指定は境界にしない
    expect(layoutSequence(input({ domains: [undefined, '自社', '自社'] })).boundaries).toHaveLength(0)
  })

  it('ガターは最後のライフラインの右', () => {
    const r = layoutSequence(input())
    expect(r.gutterX).toBeGreaterThanOrEqual(r.actorX[2] + 96 / 2 + GUTTER_GAP)
    expect(r.gutterWidth).toBe(QUESTION_LABEL_WIDTH + ANSWER_CONTENT_WIDTH + ANSWER_INSET_X * 2)
  })

  it('参加者0人・ステップ0件でも壊れない', () => {
    const r = layoutSequence({ actorWidths: [], domains: [], steps: [] })
    expect(r.rows).toEqual([])
    expect(r.actorX).toEqual([])
  })
})
