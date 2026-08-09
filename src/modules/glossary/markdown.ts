import { dividerRow, escapeCell, headingText, row } from '@/core/markdown-table'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'
import { FIELD_LABELS, FIELD_ORDER } from './fields'
import { kindLabel } from './kind-labels'

/**
 * NotePM 向け Markdown 出力（モジュール規約5。glossary-session-notes 論点7）。
 *
 * - **h1 は使わない**（NotePM のページタイトルと階層が衝突する。目次は h1〜h3 収載）。
 *   `title` が h2、種別グループが h3
 * - グループ順は **kind enum の定義順で固定**。出力のたびに順が揺れると
 *   Git 上で無意味な差分になる。空の種別は見出しごと省略し、
 *   グループ内はデータ配列順（配列順＝UI の既定表示順が正。スキーマの記述）
 * - `definition` が空なら `（未定義）`、`undecided` は `未分類` として**出力にも明示する**。
 *   仕様書に貼った瞬間に未定義が見えなくなるのは文章仕様書の悪癖の再生産であり、
 *   議事録に貼った `（未定義）` は次回の宿題リストとして機能する（rev 5章）
 */

/** グループ順はスキーマの enum から実行時に導出する（ハードコードすると enum 改訂で静かにずれる） */
const KIND_ORDER: readonly string[] = glossarySchema.$defs.term.properties.kind.enum

const UNDEFINED_DEFINITION = '（未定義）'

function termRow(term: Term): string {
  return row([
    escapeCell(term.name),
    escapeCell(kindLabel(term.kind)),
    term.definition === '' ? UNDEFINED_DEFINITION : escapeCell(term.definition),
    // 別名は1行1件で持っているので、表に収めるときだけ読点で連ねる
    escapeCell(term.aliases.join('、')),
    escapeCell(term.notes),
  ])
}

export function glossaryToMarkdown(data: GlossarySchemaVersion1): string {
  // enum 順のグループを先に作っておくことで、出力順が enum の定義順に固定される
  const groups = new Map<string, Term[]>(KIND_ORDER.map((kind) => [kind, []]))
  for (const term of data.terms) {
    const group = groups.get(term.kind)
    // enum に無い kind（将来の拡張版を古いアプリで開いた等）は末尾へ足す。
    // 落とすと「出力に出ない用語」が黙って生まれる
    if (group === undefined) groups.set(term.kind, [term])
    else group.push(term)
  }

  const header = row(FIELD_ORDER.map((field) => FIELD_LABELS[field]))
  const divider = dividerRow(FIELD_ORDER.length)
  const blocks: string[] = [`## ${headingText(data.title)}`]
  for (const [kind, terms] of groups) {
    if (terms.length === 0) continue
    // kindLabel は未知の値に生値を返す（kind-labels.ts）。enum を拡張した版の
    // ファイルを古いアプリで開くと、改行入りの kind がそのまま見出しへ出て
    // 「h1 は使わない」（NotePM の階層と衝突する）が崩れる経路になる
    blocks.push(`### ${headingText(kindLabel(kind))}`)
    blocks.push([header, divider, ...terms.map(termRow)].join('\n'))
  }
  return `${blocks.join('\n\n')}\n`
}
