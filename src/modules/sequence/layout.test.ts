import { describe, expect, it } from 'vitest'
import {
  ARROW_GAP,
  DIAGRAM_MARGIN,
  GUTTER_GAP,
  HEADER_HEIGHT,
  layoutSequence,
  MIN_COL_GAP,
  MIN_ROW_HEIGHT,
  QUESTION_LABEL_WIDTH,
  RAIL_WIDTH,
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

  it('図はレールの右から始まる（編集セル列とガターを横方向で分ける）', () => {
    const r = layoutSequence(input())
    // 先頭のライフラインの左端（actorX[0] - 幅/2）がレールの右端以上にあること。
    // ここが崩れると編集セルが図に潜り、細い図ではガターとも衝突する
    expect(r.actorX[0] - 96 / 2).toBeGreaterThanOrEqual(RAIL_WIDTH + DIAGRAM_MARGIN)
    expect(r.actorX[0]).toBeGreaterThanOrEqual(RAIL_WIDTH + DIAGRAM_MARGIN)
    // 参加者1人・ステップ1件の最も細い図でも、ガターはレールの右に来る
    const thin = layoutSequence({
      actorWidths: [96],
      domains: [undefined],
      steps: [{ fromIndex: 0, toIndex: null, metrics: metrics() }],
    })
    expect(thin.gutterX).toBeGreaterThan(RAIL_WIDTH + DIAGRAM_MARGIN)
  })

  it('列間隔は最小値を下回らない', () => {
    const r = layoutSequence(input())
    expect(r.actorX[1] - r.actorX[0]).toBeGreaterThanOrEqual(MIN_COL_GAP)
    expect(r.actorX[2] - r.actorX[1]).toBeGreaterThanOrEqual(MIN_COL_GAP)
  })

  it('ヘッダ同士がぶつからない下限: w[g]/2 + w[g+1]/2 + 16 が列幅を決める', () => {
    // ラベル要求（デフォルト labelWidth 80 → need 104）を actorWidths の下限が上回るケース。
    // gap0 = 400/2 + 400/2 + 16 = 416, gap1 = 400/2 + 96/2 + 16 = 264 のはず。
    const wideActors = input({ actorWidths: [400, 400, 96] })
    const r = layoutSequence(wideActors)
    expect(r.actorX[1] - r.actorX[0]).toBe(400 / 2 + 400 / 2 + 16)
    expect(r.actorX[2] - r.actorX[1]).toBe(400 / 2 + 96 / 2 + 16)
  })

  it('自己ループ（fromIndex === toIndex）は列幅計算をスキップする', () => {
    const self = input()
    self.steps[0] = { fromIndex: 1, toIndex: 1, metrics: metrics(999, 24) }
    const r = layoutSequence(self)
    // 自己ループのラベル(999)が列幅に影響しなければ、gap0 は MIN_COL_GAP のまま
    expect(r.actorX[1] - r.actorX[0]).toBe(MIN_COL_GAP)
    expect(Number.isFinite(r.actorX[1])).toBe(true)
  })

  it('参照切れ（範囲外の toIndex）は列幅に影響しない', () => {
    const oob = input()
    oob.steps[0] = { fromIndex: 0, toIndex: 5, metrics: metrics(999, 24) }
    const r = layoutSequence(oob)
    // toIndex(5) が actors 配列の範囲外なら、gap0 はこのステップの影響を受けない
    expect(r.actorX[1] - r.actorX[0]).toBe(MIN_COL_GAP)
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

  it('arrowY はラベル下端（top + labelHeight）から ARROW_GAP だけ離れた位置になる', () => {
    const r = layoutSequence(input())
    // 3ステップとも labelHeight は 24（metrics() のデフォルト）
    expect(r.rows[0].arrowY).toBe(r.rows[0].top + 24 + ARROW_GAP)
    expect(r.rows[1].arrowY).toBe(r.rows[1].top + 24 + ARROW_GAP)
    expect(r.rows[2].arrowY).toBe(r.rows[2].top + 24 + ARROW_GAP)
    // labelHeight を変えると arrowY も追従する
    const tall = input()
    tall.steps[0] = { fromIndex: 0, toIndex: 1, metrics: metrics(80, 60) }
    const rTall = layoutSequence(tall)
    expect(rTall.rows[0].arrowY).toBe(rTall.rows[0].top + 60 + ARROW_GAP)
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
