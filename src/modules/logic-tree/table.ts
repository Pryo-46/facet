import { buildTree, type FlatTreeNode } from '@/core/canvas/flat-tree'
import { type Table, type TableOptions, UNDEFINED_TEXT } from '@/core/table-export'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'

/**
 * ロジックツリーの表（モジュール規約8）。
 *
 * **階層を列に展開し、葉ごとに1行を出す。** コンサルのロジックツリー表の定番で、
 * 貼ったまま木の形が目で追える。**中間ノードは自分の行を持たない**ので、
 * 階層番号に出るのは葉のパス（`1_2_1`）だけになる——番号は葉を指す識別子である。
 *
 * **`visible` は受け取らない。** ロジックツリーのエディタは絞り込みを持たない
 *（額縁は常に null を渡す）ので、引数に取ると「効かない設定」が型に現れる。
 *
 * **走査順は Markdown 出力と同じ**（`markdown.ts` も `buildTree` の行きがけ順で
 * 走る）。同じデータから2つの出力が違う順で出るのは、後から必ず疑われる。
 *
 * **循環で根から到達できないノードは落ちる。** `buildTree` の roots に現れない
 * ためで、Markdown 出力・Miro 出力も同じく落としている（既知の穴。`open-issues.md`）。
 * ここだけ挙動を変えると、出力によって件数が違うという新しい混乱を作る
 */

/** No 列の見出し。**ロジックツリーは表を持たない**ので、列ラベルの置き場がここしかない */
const NO_COLUMN_LABEL = 'No'

/**
 * 階層番号の区切り。**`-` は使えない。**
 *
 * Excel も Google スプレッドシートも、貼り付けたセルに型推論をかける。`1-1-1` は
 * 2001/1/1 に、`1-3` は 3月1日 に化ける——**2階層の葉でも起きる**ので、深い木に
 * 限った話ではない。**RFC 4180 の引用（`"…"`）では止まらない**（あれは区切り文字を
 * 守るだけで、型推論には効かない）。
 *
 * `.` も選べない。**ロケールによっては `1.1.1` が日付として解釈される**（`.` を
 * 日付区切りに使う地域）。`_` はどのロケールでも数値にも日付にもならないので、
 * 貼った先で文字列のまま残る唯一の確実な選択肢である。
 *
 * **通し番号（`serial`）はこの問題を持たない**——素の整数は数値になるのが正しい。
 */
const NUMBER_SEPARATOR = '_'

/** 葉1件。ルートからその葉までの経路を持つ */
interface Leaf {
  /** 各階層の文言（ルート → 葉）。長さ＝その葉の深さ */
  labels: string[]
  /** 各階層の兄弟順（1 始まり）。`1-2-1` を組むのに使う。長さは labels と同じ */
  numbers: number[]
}

function collectLeaves(data: LogicTreeSchemaVersion1, options: TableOptions): Leaf[] {
  const built = buildTree(data.nodes)
  const leaves: Leaf[] = []
  const walk = (node: FlatTreeNode, labels: string[], numbers: number[]): void => {
    const text = data.nodes[node.index].text
    const nextLabels = [...labels, text === '' && options.showUndefined ? UNDEFINED_TEXT : text]
    if (node.children.length === 0) {
      leaves.push({ labels: nextLabels, numbers })
      return
    }
    node.children.forEach((child, i) => walk(child, nextLabels, [...numbers, i + 1]))
  }
  built.roots.forEach((root, i) => walk(root, [], [i + 1]))
  return leaves
}

/** 深さ `depth` まで祖先が同じか（＝その列は前の行で既に書いてある） */
function sameAncestors(a: readonly number[], b: readonly number[], depth: number): boolean {
  for (let i = 0; i <= depth; i++) if (a[i] !== b[i]) return false
  return true
}

export function logicTreeToTable(
  data: LogicTreeSchemaVersion1,
  options: TableOptions,
): Table {
  const leaves = collectLeaves(data, options)
  // **最低1列は出す。** ノード0件（外部エディタで空にしたファイル）でも
  // 「No だけの表」にはしない
  const depth = Math.max(1, ...leaves.map((leaf) => leaf.labels.length))
  const header = [
    ...(options.numbering ? [NO_COLUMN_LABEL] : []),
    ...Array.from({ length: depth }, (_, i) => `第${i + 1}階層`),
  ]
  const rows = leaves.map((leaf, rowIndex) => {
    const prev = leaves[rowIndex - 1]
    const cells: string[] = []
    for (let d = 0; d < depth; d++) {
      if (d >= leaf.labels.length) {
        cells.push('')
        continue
      }
      // 「親は先頭行だけ」モードでは、前の行と祖先を共有する深さの列を空にする。
      // **前の行との比較で足りる**——行きがけ順なので、同じ祖先を持つ行は必ず連続する
      const alreadyShown =
        !options.repeatParent && prev !== undefined && sameAncestors(leaf.numbers, prev.numbers, d)
      cells.push(alreadyShown ? '' : leaf.labels[d])
    }
    const no = options.numberStyle === 'path' ? leaf.numbers.join(NUMBER_SEPARATOR) : String(rowIndex + 1)
    return [...(options.numbering ? [no] : []), ...cells]
  })
  return { header, rows }
}
