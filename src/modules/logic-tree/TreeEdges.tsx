import type { Point, Size } from './layout'
import type { NodeTree } from './tree'
import { svgTransform, type Transform } from './viewport'

export interface TreeEdgesProps {
  roots: readonly NodeTree[]
  positions: ReadonlyMap<string, Point>
  sizes: ReadonlyMap<string, Size>
  transform: Transform
}

interface Edge {
  key: string
  d: string
}

/** 親の右辺の中央から子の左辺の中央へ。左右方向にだけ張り出す3次ベジェ */
function edgePath(from: Point, fromSize: Size, to: Point, toSize: Size): string {
  const x1 = from.x + fromSize.width
  const y1 = from.y + fromSize.height / 2
  const x2 = to.x
  const y2 = to.y + toSize.height / 2
  // 制御点の張り出しは列の間隔の半分。近すぎるときも最低限は曲げる
  const dx = Math.max(16, (x2 - x1) / 2)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

/**
 * エッジのレイヤ（SVG）。ノードのレイヤ（DOM）と**同一の transform** を当てる
 * ので、座標系が同じでズレは原理的に起きない。
 *
 * `pointer-events-none` を敷いているのは、下にあるこのレイヤが上の DOM の
 * 操作を奪わないため。エッジをクリック可能にする日が来たら、パス要素だけ
 * `auto` に戻す（tech-notes 論点3）
 */
export function TreeEdges({ roots, positions, sizes, transform }: TreeEdgesProps) {
  const edges: Edge[] = []
  const walk = (node: NodeTree): void => {
    const from = positions.get(node.key)
    const fromSize = sizes.get(node.key)
    for (const child of node.children) {
      const to = positions.get(child.key)
      const toSize = sizes.get(child.key)
      if (from && fromSize && to && toSize) {
        edges.push({ key: `${node.key}->${child.key}`, d: edgePath(from, fromSize, to, toSize) })
      }
      walk(child)
    }
  }
  for (const root of roots) walk(root)

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      data-layer="edges"
    >
      <g transform={svgTransform(transform)}>
        {edges.map((edge) => (
          <path key={edge.key} d={edge.d} className="fill-none stroke-rule" strokeWidth={1} />
        ))}
      </g>
    </svg>
  )
}
