import { edgePath } from '@/core/canvas/edges'
import type { FlatTreeNode } from '@/core/canvas/flat-tree'
import type { Point, Size } from '@/core/canvas/tree-layout'
import { svgTransform, type Transform } from '@/core/canvas/viewport'

export interface TreeEdgesProps {
  roots: readonly FlatTreeNode[]
  positions: ReadonlyMap<string, Point>
  sizes: ReadonlyMap<string, Size>
  transform: Transform
}

interface Edge {
  key: string
  d: string
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
  const walk = (node: FlatTreeNode): void => {
    const from = positions.get(node.key)
    const fromSize = sizes.get(node.key)
    for (const child of node.children) {
      const to = positions.get(child.key)
      const toSize = sizes.get(child.key)
      if (from && fromSize && to && toSize) {
        edges.push({
          key: `${node.key}->${child.key}`,
          d: edgePath({ ...from, ...fromSize }, { ...to, ...toSize }),
        })
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
