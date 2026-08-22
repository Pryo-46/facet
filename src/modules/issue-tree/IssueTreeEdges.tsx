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
 * 抑制された枝の破線パターン（4px の線と 3px の空き）。
 *
 * **色は変えない。** `--grid`（`stroke-grid`）は方眼紙の線＝地の模様の
 * トークンで、`bg-grid-paper` がキャンバスの升目を同じ値で塗っている
 *（`src/styles/palette.css` は canvas 上 1.17:1 まで薄めたと書いている）。
 * 抑制された枝をその色で引くと、**線が地の方眼と見分けられなくなる**
 * ——抑制された課題の箱は `bg-canvas` になっても描かれ続けるので、
 * 親との線だけが消えると「見送った枝」ではなく「親を持たない箱の群れ」に
 * 見える。`stroke-rule` を半透明にする案も採らない——枠線に濃さ
 *（`border-rule` の後ろにスラッシュと数字）を付けるのと同じく、検算して
 * いない濃さになる。**濃さも色も動かさず、線の切れ方だけで区別する。**
 *
 * 4/3 にしてあるのは既定倍率（1.0）で読める最小の刻みだから。これより
 * 細かくすると縮小時に実線と区別が付かなくなる
 */
const SUPPRESSED_DASH = '4 3'

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
 * 2. 抑制された枝は**破線**にする。色は `stroke-rule` のまま変えない
 *    （下の {@link SUPPRESSED_DASH} を見よ）
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
          // `suppressedIssueIds` に入る＝そこへ入る線から破線になり、
          // ノードの面（bg-canvas）の切り替わりと同じ位置で見え方が変わる
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
            // `data-edge` は「どの親からどの子への線か」を DOM から引くための
            // 鍵（テストが1本の線を名指しできるようにする）
            data-edge={edge.key}
            d={edge.d}
            className="fill-none stroke-rule"
            strokeWidth={1}
            strokeDasharray={edge.suppressed ? SUPPRESSED_DASH : undefined}
          />
        ))}
      </g>
    </svg>
  )
}
