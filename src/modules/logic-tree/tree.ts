import { computeRowKeys } from '@/core/row-keys'
import type { TreeNode } from '@/types/logic-tree'

/**
 * 平坦な nodes 配列から組み立てた木。**同一性の鍵は id ではなく key**
 *（ID 重複ファイルを「受け入れて赤表示」する以上、id では一意にならず、
 *  レイアウトの戻り値 Map<キー, 座標> が2ノードで衝突する）
 */
export interface NodeTree {
  index: number
  key: string
  id: string
  text: string
  children: NodeTree[]
}

export interface BuiltTree {
  roots: NodeTree[]
  depths: number[]
  parents: (number | null)[]
  children: number[][]
  unreachable: number[]
  missingParent: number[]
}

/**
 * 平坦な配列を木に戻す（純関数・DOM 非依存）。
 *
 * **全域であること**が要件。壊れたファイル（循環・多重ルート・参照切れ）は
 * 受け入れて開くのがこのアプリの方針（rev 5章）なので、この関数の後段に
 * ある測定・レイアウト・描画には「循環の無い木」しか渡さない。循環の検出に
 * 専用のアルゴリズムは要らない——**根から到達できなかったノードが、
 * そのまま循環している集合**である（循環内のノードは必ず循環内のノードを
 * 親に持つので、根からは辿り着けない）。
 */
export function buildTree(nodes: readonly TreeNode[]): BuiltTree {
  const keys = computeRowKeys(nodes)
  // 同じ id が2件あるときは先に現れた方を親とする（曖昧さは残るが挙動は決める）
  const firstIndexById = new Map<string, number>()
  nodes.forEach((node, i) => {
    if (!firstIndexById.has(node.id)) firstIndexById.set(node.id, i)
  })

  const parents: (number | null)[] = []
  const children: number[][] = nodes.map(() => [])
  const rootIndices: number[] = []
  const missingParent: number[] = []

  nodes.forEach((node, i) => {
    if (node.parentId === null) {
      parents[i] = null
      rootIndices.push(i)
      return
    }
    const p = firstIndexById.get(node.parentId)
    if (p === undefined) {
      // 参照切れ。消さずにルートとして描き、位置を記録して赤表示に回す
      parents[i] = null
      rootIndices.push(i)
      missingParent.push(i)
      return
    }
    parents[i] = p
    children[p].push(i)
  })

  const depths: number[] = nodes.map(() => -1)
  const build = (index: number, depth: number): NodeTree => {
    depths[index] = depth
    return {
      index,
      key: keys[index],
      id: nodes[index].id,
      text: nodes[index].text,
      // 循環は根から到達できないのでここには来ないが、
      // 万一に備えて訪問済みは辿らない（depths で判定できる）
      children: children[index]
        .filter((c) => depths[c] === -1)
        .map((c) => build(c, depth + 1)),
    }
  }
  const roots = rootIndices.map((i) => build(i, 0))

  const unreachable: number[] = []
  depths.forEach((d, i) => {
    if (d === -1) {
      unreachable.push(i)
      // 到達不能＝循環の中にいる。parents を残すと「親を遡る」コードが
      // そこで無限ループする（この関数が全域である意味が消える）
      parents[i] = null
    }
  })

  return { roots, depths, parents, children, unreachable, missingParent }
}
