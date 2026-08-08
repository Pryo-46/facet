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

/**
 * 表のセルに収める。`|` は列区切りと衝突するのでエスケープし、改行は `<br>` にする。
 * UI の入力欄は1行だが、外部（Skill・エディタ）が複数行の定義を書きうる——
 * そのまま出すと表が途中で割れて、貼った先で1件まるごと読めなくなる
 */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, '<br>')
}

function row(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`
}

function termRow(term: Term): string {
  return row([
    cell(term.name),
    cell(kindLabel(term.kind)),
    term.definition === '' ? UNDEFINED_DEFINITION : cell(term.definition),
    // 別名は1行1件で持っているので、表に収めるときだけ読点で連ねる
    cell(term.aliases.join('、')),
    cell(term.notes),
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
  const divider = row(FIELD_ORDER.map(() => '---'))
  const blocks: string[] = [`## ${data.title}`]
  for (const [kind, terms] of groups) {
    if (terms.length === 0) continue
    blocks.push(`### ${kindLabel(kind)}`)
    blocks.push([header, divider, ...terms.map(termRow)].join('\n'))
  }
  return `${blocks.join('\n\n')}\n`
}
