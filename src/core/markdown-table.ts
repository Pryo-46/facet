/**
 * Markdown の表の組み立て（全ツール共通・コア。M10 で用語集の `markdown.ts` から引き上げ）。
 *
 * **表のセルは書き手を信用せずエスケープする**（rev 8章）。定義・原因・対応は
 * 自由記述欄であり、Windows パスや正規表現、外部（Skill・エディタ）が書いた
 * 複数行の値が入ると表が途中で割れて1件まるごと読めなくなる。
 *
 * **この規則をアプリ内で2つ持たない。** ツールごとに書き直すと、エスケープの
 * 順序や改行の扱いがツールによって食い違い、「あるツールの出力だけ表が割れる」
 * という最悪の挙動になる（`normalizeForMatch` を1つに保っているのと同じ理由）
 */

/**
 * 表のセルに収める。`|` は列区切りと衝突するのでエスケープし、改行は `<br>` にする。
 * **バックスラッシュを先に処理する**——順序を逆にすると、`|` エスケープで入れた
 * `\` まで二重エスケープされる
 */
export function escapeCell(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r\n|\r|\n/g, '<br>')
}

/** セルを1行に組む。空セルも列として残す（列数が崩れない） */
export function row(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`
}

/** 見出し行の下の区切り行。列数を引数に取ることで見出しとの本数ずれを防ぐ */
export function dividerRow(count: number): string {
  return row(Array.from({ length: count }, () => '---'))
}

/**
 * 見出しに収める。エンベロープの `title` も enum の値もスキーマ上はただの
 * `string` なので、外部が書いた改行入りの値をそのまま `## ` の直後に出すと
 * Markdown 上で新しい見出し（最悪 `# ` から始まる h1）が混入しうる。
 * **`escapeCell` は表専用**（`|` をエスケープする）なので、見出しには使えない
 */
export function headingText(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ')
}
