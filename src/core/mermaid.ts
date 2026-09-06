/**
 * Mermaid のラベルに共通するエスケープ（全ツール共通・コア）。
 *
 * **置き場はここ1つに保つ。** design-notes 論点11 の「先に出力を実装した側が
 * 正規化関数を1本立て、後発がそれに乗る」という原則どおり、sequence と
 * logic-tree の両方がこれを使う。`markdown-table.ts` が用語集→コアと辿った道と同じ
 */

/**
 * Mermaid のラベルに収める共通処理。
 *
 * - 改行は含められないので `<br>` にする（Mermaid はラベル内の `<br>` を解釈する）
 * - `#` はエンティティ記法（`#35;`）の開始文字、`;` は文の区切りに読まれうる
 *
 * **1回の走査で置き換える。** `replace` を順に掛けると、後の置換が前の置換で
 * 入れた文字を食う（`escapeCell` がバックスラッシュを先に処理しているのと
 * 同じ問題だが、こちらは順序では解けない——どちらを先にしても壊れる）
 *
 * **改行を `<br>` にする形は sequence の吹き出し（`a1->>a2: ラベル`）向け。**
 * flowchart の角丸ノード（`n1["ラベル"]`）は改行そのものが1行制約を壊すため、
 * logic-tree（`modules/logic-tree/markdown.ts`）はこの関数を呼ぶ前に自前で
 * 改行を空白へ畳んでから通す（この関数の `\n` → `<br>` は畳んだ後は素通りする）
 */
export function escapeMermaidLabel(text: string): string {
  return text
    .replace(/[#;]/g, (ch) => (ch === '#' ? '#35;' : '#59;'))
    .replace(/\r\n|\r|\n/g, '<br>')
}
