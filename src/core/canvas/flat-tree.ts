import {
  buildFlatTree,
  type BuiltFlatTree,
  type FlatNode,
  type FlatTreeCoreNode,
} from '@/core/canvas/flat-tree-core'
import { computeRowKeys } from '@/core/row-keys'

export type { FlatNode } from '@/core/canvas/flat-tree-core'
export { orderFlatNodes, siblingsOf, subtreeEnd } from '@/core/canvas/flat-tree-core'

/**
 * 組み立てた木の節点。**同一性の鍵は id ではなく key**
 *（ID 重複ファイルを「受け入れて赤表示」する以上、id では一意にならず、
 *  レイアウトの戻り値 Map<キー, 座標> が2ノードで衝突する）
 */
export interface FlatTreeNode {
  index: number
  key: string
  id: string
  children: FlatTreeNode[]
}

export interface BuiltTree extends Omit<BuiltFlatTree, 'roots'> {
  roots: FlatTreeNode[]
}

/**
 * 平坦な配列を木に戻し、行の同一性の鍵を被せる。
 *
 * **木の組み立て自体は `flat-tree-core.ts` が持つ**——あちらは登録 Skill へ
 * バイト一致でコピーされるため値 import を持てず、`computeRowKeys` を
 * 使う本関数と分けてある
 */
export function buildTree(nodes: readonly FlatNode[]): BuiltTree {
  const core = buildFlatTree(nodes)
  const keys = computeRowKeys(nodes)
  const decorate = (node: FlatTreeCoreNode): FlatTreeNode => ({
    index: node.index,
    key: keys[node.index],
    id: nodes[node.index].id,
    children: node.children.map(decorate),
  })
  return { ...core, roots: core.roots.map(decorate) }
}
