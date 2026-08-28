import { buildTree, type FlatTreeNode } from '@/core/canvas/flat-tree'
import { documentHeading } from '@/core/markdown-table'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'

/**
 * ロジックツリーの Markdown 出力（モジュール規約5。logic-tree M2）。
 *
 * **プロファイルは1本で、図と箇条書きを縦に並べる。** rev 6章のプロファイルは
 * 「読み手による出し分け」の軸であり、形式（図／箇条書き）の軸を混ぜると、後から
 * 読み手の軸が要るときに掛け算になる（シーケンスの決着と同じ）。
 *
 * - **h1 は使わない**（NotePM のページタイトルと階層が衝突する）。`title` が h2
 * - 図は `flowchart LR`。**`mindmap` 記法は Mermaid 10 以降でしか描けない**ので使わない
 * - ノード ID は `n1`, `n2` … の連番。`node_xxx` は長すぎて図が読めなくなる
 * - 空文言は `（未定義）`。**仕様書に貼った瞬間に未定義が見えなくなるのは
 *   文章仕様書の悪癖の再生産である**（rev 5章。用語集・シーケンスと同じ規約）
 */

const UNDEFINED_TEXT = '（未定義）'

/** 箇条書き側の文言。空なら（未定義） */
function bulletLabel(text: string): string {
  return text === '' ? UNDEFINED_TEXT : text
}

/**
 * mermaid のラベル。`"` は実体参照へ、`[` `]` は全角へ逃がし、改行は空白に畳む。
 * **ラベルが複数行になると mermaid のパースが壊れる**ので、ここだけは改行を残せない
 */
function mermaidLabel(text: string): string {
  if (text === '') return UNDEFINED_TEXT
  return text
    .replace(/"/g, '&quot;')
    .replace(/\[/g, '［')
    .replace(/\]/g, '］')
    .replace(/\r?\n/g, ' ')
}

export function logicTreeToMarkdown(data: LogicTreeSchemaVersion1): string {
  const built = buildTree(data.nodes)

  // 図と箇条書きで同じ順に走るよう、行きがけ順の一覧を先に作る
  const ordered: { index: number; depth: number; parentOrder: number | null }[] = []
  const walk = (flat: FlatTreeNode, depth: number, parentOrder: number | null): void => {
    const order = ordered.length
    ordered.push({ index: flat.index, depth, parentOrder })
    for (const child of flat.children) walk(child, depth + 1, order)
  }
  for (const root of built.roots) walk(root, 0, null)

  // mermaid の識別子は 1 始まりの連番（n1, n2, …）
  const nodeRef = (order: number): string =>
    `n${order + 1}["${mermaidLabel(data.nodes[ordered[order].index].text)}"]`

  const lines: string[] = ['```mermaid', 'flowchart LR']
  if (ordered.length === 1) {
    // 辺が1本も無いとき、ノードだけの行を出さないと図が空になる
    lines.push(`  ${nodeRef(0)}`)
  }
  ordered.forEach((entry, order) => {
    if (entry.parentOrder === null) return
    lines.push(`  ${nodeRef(entry.parentOrder)} --> ${nodeRef(order)}`)
  })
  lines.push('```', '')

  for (const entry of ordered) {
    const indent = '  '.repeat(entry.depth)
    lines.push(`${indent}- ${bulletLabel(data.nodes[entry.index].text)}`)
  }

  return `${documentHeading(data.title)}\n\n${lines.join('\n')}\n`
}
