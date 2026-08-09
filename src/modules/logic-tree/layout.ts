import type { NodeTree } from './tree'

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface LayoutResult {
  /** NodeTree.key → 座標 */
  positions: Map<string, Point>
  width: number
  height: number
}

/** 列（深さ）どうしの間隔 */
export const COLUMN_GAP = 48
/** 兄弟の部分木どうしの最小の空き */
export const SIBLING_GAP = 12

/** 部分木を配置した中間結果。y は「その部分木の内部座標」で、負の値も取る */
interface Placed {
  ys: Map<string, number>
  /** 相対深さ d における上端 */
  top: number[]
  /** 相対深さ d における下端 */
  bottom: number[]
}

function sizeOf(sizes: ReadonlyMap<string, Size>, key: string): Size {
  return sizes.get(key) ?? { width: 0, height: 0 }
}

/** 深さごとの最大幅を積み上げて、各深さの x を決める */
function columnXs(roots: readonly NodeTree[], sizes: ReadonlyMap<string, Size>): number[] {
  const maxWidth: number[] = []
  const walk = (node: NodeTree, depth: number): void => {
    maxWidth[depth] = Math.max(maxWidth[depth] ?? 0, sizeOf(sizes, node.key).width)
    for (const child of node.children) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 0)
  const xs: number[] = []
  let acc = 0
  for (let d = 0; d < maxWidth.length; d++) {
    xs[d] = acc
    acc += maxWidth[d] + COLUMN_GAP
  }
  return xs
}

function shiftPlaced(p: Placed, dy: number): void {
  if (dy === 0) return
  for (const [key, y] of p.ys) p.ys.set(key, y + dy)
  for (let d = 0; d < p.top.length; d++) {
    p.top[d] += dy
    p.bottom[d] += dy
  }
}

/** b は必ず a の下に置かれた後で呼ばれる */
function mergePlaced(a: Placed, b: Placed): Placed {
  const ys = new Map(a.ys)
  for (const [key, y] of b.ys) ys.set(key, y)
  const len = Math.max(a.top.length, b.top.length)
  const top: number[] = []
  const bottom: number[] = []
  for (let d = 0; d < len; d++) {
    if (d >= a.top.length) {
      top[d] = b.top[d]
      bottom[d] = b.bottom[d]
    } else if (d >= b.top.length) {
      top[d] = a.top[d]
      bottom[d] = a.bottom[d]
    } else {
      top[d] = Math.min(a.top[d], b.top[d])
      bottom[d] = Math.max(a.bottom[d], b.bottom[d])
    }
  }
  return { ys, top, bottom }
}

/**
 * 兄弟の並びを詰める。**次の部分木を下げる量は、重なる全深さの中で
 * 一番きつい制約で決まる**——1つの深さだけ見ると、孫の代で衝突する
 */
function packSiblings(nodes: readonly NodeTree[], sizes: ReadonlyMap<string, Size>): Placed {
  let acc: Placed | null = null
  for (const node of nodes) {
    const p = placeSubtree(node, sizes)
    if (acc !== null) {
      let shift = 0
      const overlap = Math.min(acc.bottom.length, p.top.length)
      for (let d = 0; d < overlap; d++) {
        shift = Math.max(shift, acc.bottom[d] + SIBLING_GAP - p.top[d])
      }
      shiftPlaced(p, shift)
    }
    acc = acc === null ? p : mergePlaced(acc, p)
  }
  return acc ?? { ys: new Map(), top: [], bottom: [] }
}

function placeSubtree(node: NodeTree, sizes: ReadonlyMap<string, Size>): Placed {
  const height = sizeOf(sizes, node.key).height
  if (node.children.length === 0) {
    return { ys: new Map([[node.key, 0]]), top: [0], bottom: [height] }
  }
  const inner = packSiblings(node.children, sizes)
  const first = node.children[0]
  const last = node.children[node.children.length - 1]
  const firstCenter = (inner.ys.get(first.key) ?? 0) + sizeOf(sizes, first.key).height / 2
  const lastCenter = (inner.ys.get(last.key) ?? 0) + sizeOf(sizes, last.key).height / 2
  // 親は最初の子と最後の子の中心に置く（全子の平均ではない。平均だと
  // 子の数が偏ったときに、親から出る線が束の片側に寄って見える）
  const y = (firstCenter + lastCenter) / 2 - height / 2
  const ys = new Map(inner.ys)
  ys.set(node.key, y)
  // 子の輪郭は相対深さ1以降。自分の分を先頭に足す
  return { ys, top: [y, ...inner.top], bottom: [y + height, ...inner.bottom] }
}

/**
 * ツリーのレイアウト（**完全な純関数**）。
 *
 * 入力が同じなら出力が同じ、が保たれることで「図は導出」（rev 3章）が
 * コードレベルで担保される。**ここに「前回どこにあったか」の状態を
 * 混ぜないこと**——同じデータから違う図が出るようになった時点で思想が崩れる。
 *
 * x は深さごとの列で決める。列が揃うので兄弟部分木の衝突は同じ深さでしか
 * 起きず、輪郭は深さごとの上端・下端の配列で足りる。
 */
export function layoutTree(
  roots: readonly NodeTree[],
  sizes: ReadonlyMap<string, Size>,
): LayoutResult {
  const xs = columnXs(roots, sizes)
  const depths = new Map<string, number>()
  const walk = (node: NodeTree, depth: number): void => {
    depths.set(node.key, depth)
    for (const child of node.children) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 0)

  const packed = packSiblings(roots, sizes)
  const minY = packed.top.length > 0 ? Math.min(...packed.top) : 0

  const positions = new Map<string, Point>()
  let width = 0
  let height = 0
  for (const [key, y] of packed.ys) {
    const point = { x: xs[depths.get(key) ?? 0] ?? 0, y: y - minY }
    positions.set(key, point)
    const size = sizeOf(sizes, key)
    width = Math.max(width, point.x + size.width)
    height = Math.max(height, point.y + size.height)
  }
  return { positions, width, height }
}
