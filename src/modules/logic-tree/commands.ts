import { buildTree, orderFlatNodes, siblingsOf, subtreeEnd, type BuiltTree } from '@/core/canvas/flat-tree'
import { insertAt } from '@/core/list-ops'
import { newId } from '@/core/new-id'
import type { LogicTreeSchemaVersion1, TreeNode } from '@/types/logic-tree'

export interface EditResult {
  data: LogicTreeSchemaVersion1
  /** 操作後に編集させたいノードの配列位置。行き先が無いときは null */
  focusIndex: number | null
}

function withNodes(
  data: LogicTreeSchemaVersion1,
  nodes: TreeNode[],
): LogicTreeSchemaVersion1 {
  return { ...data, nodes }
}

function newNode(parentId: string | null): TreeNode {
  return { id: newId('node'), parentId, text: '' }
}

/** 配列を DFS 行きがけ順に整える（規則はコアの orderFlatNodes が持つ） */
export const orderNodes = (nodes: readonly TreeNode[]): TreeNode[] => orderFlatNodes(nodes)

/**
 * 並べ替えた配列の上で作業するための下ごしらえ。
 * **位置は参照の同一性で引き直す**——orderNodes で配列位置が動くため、
 * 呼び出し元が渡した index をそのまま使うと別のノードを操作する
 */
function prepare(
  data: LogicTreeSchemaVersion1,
  index: number,
): { nodes: TreeNode[]; built: BuiltTree; i: number } | null {
  const ref = data.nodes[index]
  if (ref === undefined) return null
  const nodes = orderNodes(data.nodes)
  return { nodes, built: buildTree(nodes), i: nodes.indexOf(ref) }
}

/** 最初のノードを作る。空状態からの開始(マウスでもキーボードでもここを通る) */
export function addRoot(data: LogicTreeSchemaVersion1): EditResult {
  const nodes = [...orderNodes(data.nodes), newNode(null)]
  return { data: withNodes(data, nodes), focusIndex: nodes.length - 1 }
}

/** 末尾の子を足す（Tab／将来の「+」ハンドルが呼ぶのはこの関数） */
export function addChild(data: LogicTreeSchemaVersion1, parentIndex: number): EditResult {
  const p = prepare(data, parentIndex)
  if (p === null) return { data, focusIndex: null }
  // 行きがけ順では「部分木の直後」がそのまま「末尾の子の位置」になる
  const at = subtreeEnd(p.built, p.i)
  const node = newNode(p.nodes[p.i].id)
  return { data: withNodes(data, insertAt(p.nodes, at, node)), focusIndex: at }
}

/**
 * 直後に兄弟を足す（Enter）。
 * **ルートの上では子を足す**——ルートに兄弟を作ると多重ルートになり、
 * 単一ルートの木という制約と両立しない
 */
export function addSiblingAfter(data: LogicTreeSchemaVersion1, index: number): EditResult {
  const p = prepare(data, index)
  if (p === null) return { data, focusIndex: null }
  if (p.built.parents[p.i] === null) return addChild(withNodes(data, p.nodes), p.i)
  const at = subtreeEnd(p.built, p.i)
  const node = newNode(p.nodes[p.i].parentId)
  return { data: withNodes(data, insertAt(p.nodes, at, node)), focusIndex: at }
}

/**
 * 部分木ごと消す（空欄 Backspace）。
 *
 * 確認ダイアログは挟まない（rev 5章。会議中の入力速度を削ぐため）。
 * 1操作1コミットの Undo で戻せる。葉だけに限らないのは、
 * ドラッグも右クリックも無いため、限ると誤った枝を消す手段が消えるから
 */
export function deleteSubtree(data: LogicTreeSchemaVersion1, index: number): EditResult {
  const p = prepare(data, index)
  if (p === null) return { data, focusIndex: null }
  const end = subtreeEnd(p.built, p.i)
  // 行き先は削除前の位置で決める: 前の兄弟 → 親 → 無し
  const siblings = siblingsOf(p.built, p.i)
  const pos = siblings.indexOf(p.i)
  const target = pos > 0 ? siblings[pos - 1] : p.built.parents[p.i]
  const kept = [...p.nodes.slice(0, p.i), ...p.nodes.slice(end)]
  const focusIndex = target === null ? -1 : kept.indexOf(p.nodes[target])
  return { data: withNodes(data, kept), focusIndex: focusIndex < 0 ? null : focusIndex }
}

/**
 * 兄弟の中で1つ動かす（Alt+↑↓）。**部分木ごと動く。**
 *
 * 挿入位置は「削除前の位置」で決めてから、自分を抜いた分だけ補正する
 *——先に削除すると後続が前へずれ、下方向への移動が1つ手前に着地する
 */
export function moveSibling(
  data: LogicTreeSchemaVersion1,
  index: number,
  delta: -1 | 1,
): EditResult {
  const p = prepare(data, index)
  if (p === null) return { data, focusIndex: null }
  const siblings = siblingsOf(p.built, p.i)
  const pos = siblings.indexOf(p.i)
  const to = pos + delta
  if (pos < 0 || to < 0 || to >= siblings.length) return { data, focusIndex: null }

  const start = p.i
  const end = subtreeEnd(p.built, p.i)
  const block = p.nodes.slice(start, end)
  const rest = [...p.nodes.slice(0, start), ...p.nodes.slice(end)]

  const other = siblings[to]
  const at =
    delta === -1
      ? other // 前の兄弟は自分より前にあるので、抜いてもその位置は動かない
      : subtreeEnd(p.built, other) - block.length // 後ろの兄弟は自分の分だけ前へずれる

  const next = [...rest.slice(0, at), ...block, ...rest.slice(at)]
  return { data: withNodes(data, next), focusIndex: at }
}

/**
 * 文言を置き換える。**並べ替えない**——打鍵のたびに配列が動くと、
 * 入力中のノードの配列位置がずれてフォーカスを見失う
 */
export function setText(
  data: LogicTreeSchemaVersion1,
  index: number,
  text: string,
): LogicTreeSchemaVersion1 {
  return { ...data, nodes: data.nodes.map((n, i) => (i === index ? { ...n, text } : n)) }
}
