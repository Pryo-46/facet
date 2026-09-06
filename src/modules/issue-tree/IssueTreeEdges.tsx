import { edgePath } from '@/core/canvas/edges'
import type { FlatTreeNode } from '@/core/canvas/flat-tree'
import { svgTransform, type Transform } from '@/core/canvas/viewport'
import type { IssuePlacement } from './layout'

export interface IssueTreeEdgesProps {
  roots: readonly FlatTreeNode[]
  /** `issues` と同じ添字。null＝図に位置を持たない（循環して根から到達できない） */
  placements: readonly (IssuePlacement | null)[]
  /**
   * `issues` と同じ添字。true＝**祖先**の見送りで抑制されている。
   *
   * **自分自身の見送りは含まない。** エディタが渡すのは `inheritedSuppressed`
   *（`IssueTreeEditor.tsx` の同名の配列）で、「親が抑制の集合に居るか」だけを
   * 見る。見送りを付けた当の課題は薄くならず、そこへ入る線も実線のまま——
   * 見送りは**そこで下した判断の表明**であって「もう見なくてよい枝」ではない
   */
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
 * 1. **線は課題の箱の矩形から引く。** 仮説は箱の中の行なので、
 *    箱はぶら下がる仮説のぶんだけ縦に伸びる＝ブロックの矩形と箱の矩形は
 *    同じものである。別に矩形を作って引くと、線が箱の縁からずれた所を指す
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
          // 抑制は子で判定する。`suppressed` は祖先由来だけを立てているので、
          // **見送りを付けた当のノードへ入る線は実線**のまま、その配下へ入る
          // 線から破線になる——箱の面と文字（ink-faint）が薄くなる位置と
          // 同じところで見え方が変わる。
          //
          // **`suppressedIssueIds`（自分自身を含む集合）をここへ直接渡さない
          // こと。** 渡すと見送り箱へ入る線まで破線になり、誰が何を落としたのかが
          // 図から読めなくなる
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
