import { describe, expect, it } from 'vitest'
import { buildTree, orderFlatNodes, siblingsOf, subtreeEnd, type FlatNode } from './flat-tree'

const n = (id: string, parentId: string | null): FlatNode => ({ id, parentId })

const ID = {
  a: 'node_aaaaaaaaaa',
  b: 'node_bbbbbbbbbb',
  c: 'node_cccccccccc',
  d: 'node_dddddddddd',
}

describe('buildTree', () => {
  it('空の配列から空の結果を返す', () => {
    const t = buildTree([])
    expect(t.roots).toEqual([])
    expect(t.unreachable).toEqual([])
  })

  it('親子を組み立てる', () => {
    const t = buildTree([n(ID.a, null), n(ID.b, ID.a), n(ID.c, ID.a)])
    expect(t.roots.map((r) => r.id)).toEqual([ID.a])
    expect(t.roots[0].children.map((c) => c.id)).toEqual([ID.b, ID.c])
    expect(t.depths).toEqual([0, 1, 1])
    expect(t.parents).toEqual([null, 0, 0])
    expect(t.children).toEqual([[1, 2], [], []])
  })

  it('兄弟の順は配列の出現順で決まる（配列順が正）', () => {
    // 親より後ろに並んでいなくても、同じ親を持つ2件の相対順だけが効く
    const t = buildTree([n(ID.c, ID.a), n(ID.a, null), n(ID.b, ID.a)])
    expect(t.roots[0].children.map((c) => c.id)).toEqual([ID.c, ID.b])
  })

  it('循環しているノードは到達不能として分離する（無限ループしない）', () => {
    const t = buildTree([n(ID.a, ID.b), n(ID.b, ID.a)])
    expect(t.roots).toEqual([])
    expect(t.unreachable).toEqual([0, 1])
    expect(t.depths).toEqual([-1, -1])
    expect(t.parents).toEqual([null, null])
  })

  it('自分自身を親にしているノードも到達不能になる', () => {
    const t = buildTree([n(ID.a, null), n(ID.b, ID.b)])
    expect(t.roots.map((r) => r.id)).toEqual([ID.a])
    expect(t.unreachable).toEqual([1])
    expect(t.parents).toEqual([null, null])
  })

  it('parentId が実在しないノードはルートとして扱い、位置を記録する', () => {
    // 消えると原因が画面から読み取れなくなるので、握りつぶさず必ず描く
    const t = buildTree([n(ID.a, null), n(ID.b, ID.d)])
    expect(t.roots.map((r) => r.id)).toEqual([ID.a, ID.b])
    expect(t.missingParent).toEqual([1])
  })

  it('ルートが複数あってもすべて返す', () => {
    const t = buildTree([n(ID.a, null), n(ID.b, null)])
    expect(t.roots.map((r) => r.id)).toEqual([ID.a, ID.b])
  })

  it('ID が重複していても key で区別できる', () => {
    const t = buildTree([n(ID.a, null), n(ID.a, null)])
    expect(t.roots.map((r) => r.key)).toEqual([`${ID.a}#0`, `${ID.a}#1`])
  })

  it('ID が重複しているとき、その ID を親に指すノードは先に現れた方に付く', () => {
    // 曖昧さは残るが挙動は決めておく（重複自体は整合性検証が赤で見せる）
    const t = buildTree([n(ID.a, null), n(ID.a, null), n(ID.b, ID.a)])
    expect(t.roots[0].children.map((c) => c.id)).toEqual([ID.b])
    expect(t.roots[1].children).toEqual([])
  })
})

describe('subtreeEnd / siblingsOf / orderFlatNodes', () => {
  const num = (n: number): string => `node_${String(n).padStart(10, 'a')}`
  const f = (id: number, parent: number | null): FlatNode => ({
    id: num(id),
    parentId: parent === null ? null : num(parent),
  })

  // 1 -(2 -(5, 6, 7), 3, 4)   兄弟3つ以上・深さ2以上の入力
  const nodes: FlatNode[] = [
    f(1, null),
    f(2, 1),
    f(5, 2),
    f(6, 2),
    f(7, 2),
    f(3, 1),
    f(4, 1),
  ]

  it('subtreeEnd は部分木の直後の位置を返す', () => {
    const built = buildTree(nodes)
    // 2 の部分木 (2,5,6,7) は index1..4。直後は index5 (3)
    expect(subtreeEnd(built, 1)).toBe(5)
    // 5 は葉。直後は index3 (6)
    expect(subtreeEnd(built, 2)).toBe(3)
    // 4 は配列の末尾。直後は配列長
    expect(subtreeEnd(built, 6)).toBe(7)
  })

  it('siblingsOf はルート直下・孫の代いずれでも並び順で兄弟を返す', () => {
    const built = buildTree(nodes)
    // ルート直下: 2, 3, 4 (index 1, 5, 6)
    expect(siblingsOf(built, 1)).toEqual([1, 5, 6])
    // 2 の子: 5, 6, 7 (index 2, 3, 4)
    expect(siblingsOf(built, 2)).toEqual([2, 3, 4])
  })

  it('orderFlatNodes は乱れた配列を DFS 行きがけ順に戻す', () => {
    // 兄弟3つ以上・深さ2以上の木を、兄弟の相対順は保ったまま乱して与える
    const shuffled: FlatNode[] = [
      f(5, 2),
      f(2, 1),
      f(6, 2),
      f(3, 1),
      f(7, 2),
      f(4, 1),
      f(1, null),
    ]
    expect(orderFlatNodes(shuffled).map((x) => x.id)).toEqual(nodes.map((x) => x.id))
  })
})
