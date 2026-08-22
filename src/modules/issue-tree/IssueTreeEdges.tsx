import { edgePath } from '@/core/canvas/edges'
import type { FlatTreeNode } from '@/core/canvas/flat-tree'
import { svgTransform, type Transform } from '@/core/canvas/viewport'
import type { IssuePlacement } from './layout'

export interface IssueTreeEdgesProps {
  roots: readonly FlatTreeNode[]
  /** `issues` と同じ添字。null＝図に位置を持たない（循環して根から到達できない） */
  placements: readonly (IssuePlacement | null)[]
  /** `issues` と同じ添字。true＝祖先（自分自身を含む）の見送りで抑制されている */
  suppressed: readonly boolean[]
  transform: Transform
}

interface Edge {
  key: string
  d: string
  suppressed: boolean
}

/**
 * エッジのレイヤ（SVG）。ノードのレイヤ（DOM）と**同一の transform** を当てる
 * ので、座標系が同じでズレは原理的に起きない。
 *
 * `pointer-events-none` を敷いているのは、下にあるこのレイヤが上の DOM の
 * 操作を奪わないため（`src/modules/logic-tree/TreeEdges.tsx` と同じ）。
 *
 * ロジックツリーとの差は2つ:
 *
 * 1. **線は課題ノードの矩形から引く。** ブロック（ノード＋ぶら下がる仮説
 *    カード）の矩形から引くと、線が課題ではなくカードの束を指す
 * 2. 抑制された枝は装飾扱いの薄い罫線（`stroke-grid`）に落とす。
 *    **`stroke-rule` を半透明にしない**——枠線に濃さ（`border-rule` の後ろに
 *    スラッシュと数字）を付けるのと同じく、検算していない濃さになる
 */
export function IssueTreeEdges({
  roots,
  placements,
  suppressed,
  transform,
}: IssueTreeEdgesProps) {
  const edges: Edge[] = []
  const walk = (node: FlatTreeNode): void => {
    const from = placements[node.index]
    for (const child of node.children) {
      const to = placements[child.index]
      if (from && to) {
        edges.push({
          key: `${node.key}->${child.key}`,
          d: edgePath(from.rect, to.rect),
          // 抑制は子で判定する。見送りを付けた当のノードも
          // `suppressedIssueIds` に入る＝そこへ入る線から薄くなり、
          // ノードの面（bg-canvas）と見え方が揃う
          suppressed: suppressed[child.index] === true,
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
          <path
            key={edge.key}
            d={edge.d}
            className={edge.suppressed ? 'fill-none stroke-grid' : 'fill-none stroke-rule'}
            strokeWidth={1}
          />
        ))}
      </g>
    </svg>
  )
}
