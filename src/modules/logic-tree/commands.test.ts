import { describe, expect, it } from 'vitest'
import type { LogicTreeSchemaVersion1, TreeNode } from '@/types/logic-tree'
import {
  addChild,
  addRoot,
  addSiblingAfter,
  deleteSubtree,
  moveSibling,
  orderNodes,
  setText,
} from './commands'

const ID = (n: number): string => `node_${String(n).padStart(10, 'a')}`

const flat = (spec: [number, number | null][]): TreeNode[] =>
  spec.map(([id, parent]) => ({
    id: ID(id),
    parentId: parent === null ? null : ID(parent),
    text: `n${id}`,
  }))

const file = (spec: [number, number | null][]): LogicTreeSchemaVersion1 => ({
  schemaVersion: 1,
  type: 'logicTree',
  title: 'テスト',
  nodes: flat(spec),
})

/** 配列を [id, 親id] の数字の組で読み出す（期待値を目で追えるようにする） */
const shape = (data: LogicTreeSchemaVersion1): string[] =>
  data.nodes.map((n) => `${n.id}<-${n.parentId ?? 'root'}`)

const at = (data: LogicTreeSchemaVersion1, index: number): TreeNode => data.nodes[index]

describe('orderNodes', () => {
  it('DFS 行きがけ順に並べ替える', () => {
    // 1 -(2 -(4), 3)
    const nodes = flat([[4, 2], [3, 1], [1, null], [2, 1]])
    // 兄弟の相対順は元の配列順（3 が先、2 が後）を保つ
    expect(orderNodes(nodes).map((n) => n.id)).toEqual([ID(1), ID(3), ID(2), ID(4)])
  })

  it('すでに整っている配列は変えない', () => {
    const nodes = flat([[1, null], [2, 1], [3, 1]])
    expect(orderNodes(nodes).map((n) => n.id)).toEqual([ID(1), ID(2), ID(3)])
  })

  it('循環して到達できないノードは末尾に元の順で残す（消さない）', () => {
    const nodes = flat([[2, 3], [1, null], [3, 2]])
    const out = orderNodes(nodes)
    expect(out.map((n) => n.id)).toEqual([ID(1), ID(2), ID(3)])
    expect(out.length).toBe(3)
  })

  it('ノードを取りこぼさない', () => {
    const nodes = flat([[1, null], [2, 1], [3, 2], [4, null]])
    expect(orderNodes(nodes).length).toBe(4)
  })
})

describe('addRoot', () => {
  it('空のファイルに最初のノードを作る', () => {
    const r = addRoot(file([]))
    expect(r.data.nodes.length).toBe(1)
    expect(r.data.nodes[0].parentId).toBe(null)
    expect(r.data.nodes[0].text).toBe('')
    expect(r.focusIndex).toBe(0)
  })

  it('採番した ID は ID 規約に従う', () => {
    expect(addRoot(file([])).data.nodes[0].id).toMatch(/^node_[A-Za-z0-9]{10}$/)
  })
})

describe('addChild', () => {
  it('子を末尾に足す', () => {
    const r = addChild(file([[1, null], [2, 1]]), 0)
    expect(r.data.nodes.length).toBe(3)
    // 末尾の子なので、既存の子 2 より後ろに入る
    expect(r.focusIndex).toBe(2)
    expect(at(r.data, 2).parentId).toBe(ID(1))
    expect(shape(r.data).slice(0, 2)).toEqual([`${ID(1)}<-root`, `${ID(2)}<-${ID(1)}`])
  })

  it('孫がいる子の後ろに入る（部分木の直後）', () => {
    // 1 -(2 -(3))
    const r = addChild(file([[1, null], [2, 1], [3, 2]]), 0)
    expect(r.focusIndex).toBe(3)
    expect(at(r.data, 3).parentId).toBe(ID(1))
  })

  it('葉に子を足すと直後に入る', () => {
    const r = addChild(file([[1, null], [2, 1], [3, 1]]), 1)
    expect(r.focusIndex).toBe(2)
    expect(at(r.data, 2).parentId).toBe(ID(2))
  })

  it('範囲外の位置では何も起きない', () => {
    const before = file([[1, null]])
    const r = addChild(before, 5)
    expect(r.data).toBe(before)
    expect(r.focusIndex).toBe(null)
  })
})

describe('addSiblingAfter', () => {
  it('直後に兄弟を足す', () => {
    const r = addSiblingAfter(file([[1, null], [2, 1], [3, 1]]), 1)
    expect(r.focusIndex).toBe(2)
    expect(at(r.data, 2).parentId).toBe(ID(1))
    expect(at(r.data, 3).id).toBe(ID(3))
  })

  it('部分木を飛び越えて直後に入る', () => {
    // 1 -(2 -(4), 3)。2 の直後の兄弟は 4 の後ろ
    const r = addSiblingAfter(file([[1, null], [2, 1], [4, 2], [3, 1]]), 1)
    expect(r.focusIndex).toBe(3)
    expect(at(r.data, 3).parentId).toBe(ID(1))
    expect(at(r.data, 4).id).toBe(ID(3))
  })

  it('ルートの上では兄弟ではなく子を足す（多重ルートを作らない）', () => {
    const r = addSiblingAfter(file([[1, null]]), 0)
    expect(r.data.nodes.length).toBe(2)
    expect(at(r.data, 1).parentId).toBe(ID(1))
    expect(r.data.nodes.filter((n) => n.parentId === null).length).toBe(1)
  })
})

describe('deleteSubtree', () => {
  it('子ごと消す', () => {
    // 1 -(2 -(4), 3)
    const r = deleteSubtree(file([[1, null], [2, 1], [4, 2], [3, 1]]), 1)
    expect(r.data.nodes.map((n) => n.id)).toEqual([ID(1), ID(3)])
  })

  it('消したら前の兄弟へフォーカスを移す', () => {
    const r = deleteSubtree(file([[1, null], [2, 1], [3, 1]]), 2)
    expect(at(r.data, r.focusIndex ?? -1).id).toBe(ID(2))
  })

  it('前の兄弟が無ければ親へ移す', () => {
    const r = deleteSubtree(file([[1, null], [2, 1], [3, 1]]), 1)
    expect(at(r.data, r.focusIndex ?? -1).id).toBe(ID(1))
  })

  it('最後の1件を消したら行き先は無い', () => {
    const r = deleteSubtree(file([[1, null]]), 0)
    expect(r.data.nodes).toEqual([])
    expect(r.focusIndex).toBe(null)
  })

  it('範囲外の位置では何も起きない', () => {
    const before = file([[1, null]])
    expect(deleteSubtree(before, 9).data).toBe(before)
  })
})

describe('moveSibling', () => {
  it('上へ動かす', () => {
    const r = moveSibling(file([[1, null], [2, 1], [3, 1]]), 2, -1)
    expect(r.data.nodes.map((n) => n.id)).toEqual([ID(1), ID(3), ID(2)])
    expect(at(r.data, r.focusIndex ?? -1).id).toBe(ID(3))
  })

  it('上へ動かすとき、相手の部分木の手前に着地する', () => {
    // 1 -(2 -(4), 3)。3 を上へ ⇒ 2 の部分木ごと飛び越えて手前に来る。
    // 下方向と同じ補正を掛けると 2 の部分木の内側に潜り込み、行きがけ順が壊れる
    const r = moveSibling(file([[1, null], [2, 1], [4, 2], [3, 1]]), 3, -1)
    expect(r.data.nodes.map((n) => n.id)).toEqual([ID(1), ID(3), ID(2), ID(4)])
    expect(r.focusIndex).toBe(1)
  })

  it('下へ動かす', () => {
    const r = moveSibling(file([[1, null], [2, 1], [3, 1]]), 1, 1)
    expect(r.data.nodes.map((n) => n.id)).toEqual([ID(1), ID(3), ID(2)])
    expect(at(r.data, r.focusIndex ?? -1).id).toBe(ID(2))
  })

  it('下へ動かすとき、部分木ごと相手を飛び越える', () => {
    // 1 -(2, 3 -(4))。2 を下へ ⇒ 3 とその子 4 の後ろに来る
    const r = moveSibling(file([[1, null], [2, 1], [3, 1], [4, 3]]), 1, 1)
    expect(r.data.nodes.map((n) => n.id)).toEqual([ID(1), ID(3), ID(4), ID(2)])
    expect(at(r.data, r.focusIndex ?? -1).id).toBe(ID(2))
  })

  it('自分の部分木ごと動く', () => {
    // 1 -(2 -(4), 3)。2 を下へ ⇒ 3 の後ろに 2 と 4 が並ぶ
    const r = moveSibling(file([[1, null], [2, 1], [4, 2], [3, 1]]), 1, 1)
    expect(r.data.nodes.map((n) => n.id)).toEqual([ID(1), ID(3), ID(2), ID(4)])
  })

  it('端では何も起きない', () => {
    const before = file([[1, null], [2, 1], [3, 1]])
    expect(moveSibling(before, 1, -1).data).toBe(before)
    expect(moveSibling(before, 2, 1).data).toBe(before)
  })

  it('親が違うノードとは入れ替わらない', () => {
    // 1 -(2 -(3))。3 は一人っ子なので上にも下にも動かない
    const before = file([[1, null], [2, 1], [3, 2]])
    expect(moveSibling(before, 2, -1).data).toBe(before)
  })

  it('兄弟が3つ以上でも隣とだけ入れ替わる（上）', () => {
    const r = moveSibling(file([[1, null], [2, 1], [3, 1], [4, 1]]), 3, -1)
    expect(r.data.nodes.map((n) => n.id)).toEqual([ID(1), ID(2), ID(4), ID(3)])
    expect(r.focusIndex).toBe(2)
  })

  it('兄弟が3つ以上でも隣とだけ入れ替わる（下）', () => {
    const r = moveSibling(file([[1, null], [2, 1], [3, 1], [4, 1]]), 1, 1)
    expect(r.data.nodes.map((n) => n.id)).toEqual([ID(1), ID(3), ID(2), ID(4)])
    expect(r.focusIndex).toBe(2)
  })
})

describe('setText', () => {
  it('文言を置き換える', () => {
    const r = setText(file([[1, null], [2, 1]]), 1, '導線が分からない')
    expect(r.nodes[1].text).toBe('導線が分からない')
  })

  it('配列の並びを動かさない（入力中に位置がずれない）', () => {
    const before = file([[1, null], [2, 1], [3, 1]])
    expect(setText(before, 1, 'x').nodes.map((n) => n.id)).toEqual(
      before.nodes.map((n) => n.id),
    )
  })

  it('元のデータを書き換えない', () => {
    const before = file([[1, null]])
    setText(before, 0, 'x')
    expect(before.nodes[0].text).toBe('n1')
  })
})
