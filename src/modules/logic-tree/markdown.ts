import { buildTree, type FlatTreeNode } from '@/core/canvas/flat-tree'
import { documentHeading } from '@/core/markdown-table'
import { escapeMermaidLabel } from '@/core/mermaid'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'

/**
 * ロジックツリーの Markdown 出力（モジュール規約5。logic-tree M3）。
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

/**
 * 箇条書き側の文言。空なら（未定義）。改行は `<br>` に変える。
 *
 * **改行は異常な入力ではない。** `NodeBox.tsx` は `multiline` の `CellInput` で
 * Shift+Enter による改行を許しており、スキーマも「ユーザーが明示的に入れた
 * 改行だけが文言の一部」として認めている。Miro から取り込んだ複数段落ノードも
 * `stripMiroText` が `\n` に変換して持ち込む——踏んで当然の値である。
 *
 * **そのまま出すと箇条書きの構造が壊れる。** 改行の直後は `- ` を持たない
 * 生の Markdown 行になり、最悪 `## ` から始まる見出しが注入される
 * （`markdown-table.ts` の `escapeCell` / `headingText` が警告している危険と同じ）。
 *
 * **空白へは畳まない。** mermaid のラベル（`mermaidLabel`）は1行制約があるので
 * 空白に畳むしかないが、箇条書き側にその制約は無い。`escapeCell`（表のセル）が
 * 同じ理由で `<br>` を選んでいるのに倣い、段落の区切りという情報を失わずに残す
 */
function bulletLabel(text: string): string {
  if (text === '') return UNDEFINED_TEXT
  return text.replace(/\r\n|\r|\n/g, '<br>')
}

/**
 * mermaid のラベル。`"` は実体参照へ、`[` `]` は全角へ逃がし、改行は空白に畳む。
 * **ラベルが複数行になると mermaid のパースが壊れる**ので、ここだけは改行を残せない。
 *
 * **共通の `escapeMermaidLabel`（`@/core/mermaid`）と2段構え。** 共通版は sequence
 * の吹き出し向けに改行を `<br>` へ変える（複数行の Mermaid ラベルとして許される
 * 書き方）が、flowchart の角丸ノード `n1["…"]` は `<br>` を挟んでも1行制約が
 * 壊れたままなので、**先に自前で改行を空白へ畳んでから**共通版へ渡す（`#` `;`
 * のエスケープだけ共通版に任せる）。渡した後は改行が残っていないので、共通版の
 * `\n` → `<br>` は素通りになる。`"` `[` `]` は flowchart のラベル記法
 * （`["…"]`）特有の衝突なので、共通版には無い自前の処理として残す
 */
function mermaidLabel(text: string): string {
  if (text === '') return UNDEFINED_TEXT
  const folded = text.replace(/\r?\n/g, ' ')
  return escapeMermaidLabel(folded)
    .replace(/"/g, '&quot;')
    .replace(/\[/g, '［')
    .replace(/\]/g, '］')
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

  // 辺（= 親を持つノード）の親側に現れる order の集合。「子を持つルート」を
  // 見分けるのに使う（多重ルートは受け入れて赤表示する方針なので、
  // 子を持たないルートが他のノードと共存しうる——単一ノードはその特殊形）
  const hasChild = new Set<number>()
  ordered.forEach((entry) => {
    if (entry.parentOrder !== null) hasChild.add(entry.parentOrder)
  })

  const lines: string[] = ['```mermaid', 'flowchart LR']
  ordered.forEach((entry, order) => {
    // **親も子も持たない（辺を1本も持たない）ノードは単独の行で出す。**
    // 出さないと、辺だけを列挙する下のループでは触れられないまま図から
    // 消える——箇条書きには出るのに図には出ない食い違いになる
    // （多重ルートファイルで子を持たないルートが他ノードと共存するときに実際に踏んだ）
    if (entry.parentOrder === null && !hasChild.has(order)) {
      lines.push(`  ${nodeRef(order)}`)
    }
  })
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
