// logic-tree/viewport.test.ts の複製（sequence M1）。core への共通化は
// 2本目完成後に別マイルストーンで判断する（scope の禁止事項）。差分を
// 作らないこと——直すときは両方を直し、open-issues の複製の項に従う

import { describe, expect, it } from 'vitest'
import { panIntoView, type Transform } from './viewport'

const VIEW = { width: 1000, height: 600 }
const MARGIN = 20
const identity: Transform = { x: 0, y: 0, k: 1 }

describe('panIntoView', () => {
  it('画面に収まっているノードでは動かさない', () => {
    expect(panIntoView(identity, { x: 100, y: 100, width: 200, height: 40 }, VIEW, MARGIN)).toEqual(
      identity,
    )
  })

  it('右にはみ出しているとき、右端が余白の内側に来るまで左へ寄せる', () => {
    const t = panIntoView(identity, { x: 900, y: 100, width: 200, height: 40 }, VIEW, MARGIN)
    expect(900 + t.x + 200).toBe(VIEW.width - MARGIN)
  })

  it('左にはみ出しているとき、左端が余白の内側に来るまで右へ寄せる', () => {
    const t = panIntoView(
      { x: -500, y: 0, k: 1 },
      { x: 100, y: 100, width: 200, height: 40 },
      VIEW,
      MARGIN,
    )
    expect(100 + t.x).toBe(MARGIN)
  })

  it('下にはみ出しているときも同じように動かす', () => {
    const t = panIntoView(identity, { x: 0, y: 700, width: 100, height: 40 }, VIEW, MARGIN)
    expect(700 + t.y + 40).toBe(VIEW.height - MARGIN)
  })

  it('表示領域より大きいノードは左上に揃える（右端優先で寄せると頭が切れる）', () => {
    const t = panIntoView(identity, { x: 0, y: 0, width: 2000, height: 40 }, VIEW, MARGIN)
    expect(0 + t.x).toBe(MARGIN)
  })

  it('倍率は変えない', () => {
    const t = panIntoView({ x: 0, y: 0, k: 2 }, { x: 900, y: 0, width: 200, height: 40 }, VIEW, MARGIN)
    expect(t.k).toBe(2)
  })

  it('拡大しているときは画面上の大きさで判定する', () => {
    // k=2 では x=400 のノードは画面上 800 にあり、幅 200 は 400 になる
    const t = panIntoView({ x: 0, y: 0, k: 2 }, { x: 400, y: 0, width: 200, height: 40 }, VIEW, MARGIN)
    expect(400 * 2 + t.x + 200 * 2).toBe(VIEW.width - MARGIN)
  })
})
