import { describe, expect, it } from 'vitest'
import type { TreeNode } from '@/types/logic-tree'
import { buildTree, type NodeTree } from './tree'
import { COLUMN_GAP, layoutTree, SIBLING_GAP, type LayoutResult, type Size } from './layout'

const ID = (n: number): string => `node_${String(n).padStart(10, 'a')}`
const KEY = (n: number): string => `${ID(n)}#0`

/** id/parentId を数字で書けるようにする小道具 */
const flat = (spec: [number, number | null][]): TreeNode[] =>
  spec.map(([id, parent]) => ({
    id: ID(id),
    parentId: parent === null ? null : ID(parent),
    text: '',
  }))

/** すべてのノードを 100x30 とみなすサイズ表 */
function uniformSizes(nodes: TreeNode[]): Map<string, Size> {
  const out = new Map<string, Size>()
  const walk = (n: NodeTree): void => {
    out.set(n.key, { width: 100, height: 30 })
    for (const c of n.children) walk(c)
  }
  for (const r of buildTree(nodes).roots) walk(r)
  return out
}

function run(nodes: TreeNode[], sizes: ReadonlyMap<string, Size>): LayoutResult {
  return layoutTree(buildTree(nodes).roots, sizes)
}

/** どの2つのノード矩形も重ならないことを検査する（レイアウトの一番の失敗） */
function expectNoOverlap(result: LayoutResult, sizes: ReadonlyMap<string, Size>): void {
  const rects = [...result.positions].map(([key, p]) => ({
    key,
    left: p.x,
    top: p.y,
    right: p.x + (sizes.get(key)?.width ?? 0),
    bottom: p.y + (sizes.get(key)?.height ?? 0),
  }))
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]
      const b = rects[j]
      const overlaps = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      expect(overlaps, `${a.key} と ${b.key} が重なっている`).toBe(false)
    }
  }
}

describe('layoutTree', () => {
  it('ノードが無ければ空の結果を返す', () => {
    const r = layoutTree([], new Map())
    expect(r.positions.size).toBe(0)
    expect(r.width).toBe(0)
    expect(r.height).toBe(0)
  })

  it('1ノードは原点に置き、全体の大きさはそのノードの大きさになる', () => {
    const nodes = flat([[1, null]])
    const r = run(nodes, uniformSizes(nodes))
    expect(r.positions.get(KEY(1))).toEqual({ x: 0, y: 0 })
    expect(r.width).toBe(100)
    expect(r.height).toBe(30)
  })

  it('子は親の右の列に置く（列の間隔は COLUMN_GAP）', () => {
    const nodes = flat([[1, null], [2, 1]])
    expect(run(nodes, uniformSizes(nodes)).positions.get(KEY(2))?.x).toBe(100 + COLUMN_GAP)
  })

  it('同じ深さのノードは列が揃う', () => {
    const nodes = flat([[1, null], [2, 1], [3, 1]])
    const r = run(nodes, uniformSizes(nodes))
    expect(r.positions.get(KEY(2))?.x).toBe(r.positions.get(KEY(3))?.x)
  })

  it('列の幅はその深さの最大幅で決まる', () => {
    const nodes = flat([[1, null], [2, 1]])
    const sizes = uniformSizes(nodes)
    sizes.set(KEY(1), { width: 200, height: 30 })
    expect(run(nodes, sizes).positions.get(KEY(2))?.x).toBe(200 + COLUMN_GAP)
  })

  it('兄弟は SIBLING_GAP だけ空けて縦に並ぶ', () => {
    const nodes = flat([[1, null], [2, 1], [3, 1]])
    const r = run(nodes, uniformSizes(nodes))
    expect((r.positions.get(KEY(3))?.y ?? 0) - (r.positions.get(KEY(2))?.y ?? 0)).toBe(
      30 + SIBLING_GAP,
    )
  })

  it('親は最初の子と最後の子の中心に来る', () => {
    const nodes = flat([[1, null], [2, 1], [3, 1]])
    const r = run(nodes, uniformSizes(nodes))
    const first = (r.positions.get(KEY(2))?.y ?? 0) + 15
    const last = (r.positions.get(KEY(3))?.y ?? 0) + 15
    expect((r.positions.get(KEY(1))?.y ?? 0) + 15).toBeCloseTo((first + last) / 2)
  })

  it('孫を持つ兄弟部分木どうしが重ならない', () => {
    // 輪郭を持たない素朴な実装がここで必ず壊れる
    const nodes = flat([
      [1, null],
      [2, 1], [4, 2], [5, 2], [6, 2],
      [3, 1], [7, 3], [8, 3], [9, 3],
    ])
    const sizes = uniformSizes(nodes)
    expectNoOverlap(run(nodes, sizes), sizes)
  })

  it('高さがばらばらでも重ならない', () => {
    const nodes = flat([
      [1, null],
      [2, 1], [4, 2], [5, 2],
      [3, 1], [6, 3], [7, 3],
    ])
    const sizes = uniformSizes(nodes)
    sizes.set(KEY(4), { width: 100, height: 120 })
    sizes.set(KEY(3), { width: 100, height: 90 })
    expectNoOverlap(run(nodes, sizes), sizes)
  })

  it('ルートが複数あっても縦に積んで重ならない', () => {
    const nodes = flat([[1, null], [2, 1], [3, null], [4, 3]])
    const sizes = uniformSizes(nodes)
    expectNoOverlap(run(nodes, sizes), sizes)
  })

  it('すべての座標が 0 以上に正規化される', () => {
    // 親が子より高いと内部座標が負になる。描画前にここで揃える
    const nodes = flat([[1, null], [2, 1]])
    const sizes = uniformSizes(nodes)
    sizes.set(KEY(1), { width: 100, height: 200 })
    for (const p of run(nodes, sizes).positions.values()) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('全体の大きさは全ノードを含む', () => {
    const nodes = flat([[1, null], [2, 1], [3, 1]])
    const sizes = uniformSizes(nodes)
    const r = run(nodes, sizes)
    for (const [key, p] of r.positions) {
      expect(p.x + (sizes.get(key)?.width ?? 0)).toBeLessThanOrEqual(r.width)
      expect(p.y + (sizes.get(key)?.height ?? 0)).toBeLessThanOrEqual(r.height)
    }
  })

  it('同じ入力からは同じ出力が出る（純関数）', () => {
    const nodes = flat([[1, null], [2, 1], [3, 1], [4, 2]])
    const sizes = uniformSizes(nodes)
    expect([...run(nodes, sizes).positions]).toEqual([...run(nodes, sizes).positions])
  })

  it('サイズ表に無いノードでも落ちない', () => {
    const nodes = flat([[1, null], [2, 1]])
    expect(run(nodes, new Map()).positions.size).toBe(2)
  })
})
