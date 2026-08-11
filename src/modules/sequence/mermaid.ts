/**
 * Mermaid `sequenceDiagram` の組み立て（design-notes 論点8・11）。
 *
 * **置き場はモジュール内。** 論点11 は「先に出力を実装した側が正規化関数を
 * 1本立て、後発がそれに乗る」としているが、コアの `markdown-table.ts` 自身が
 * 用語集で生まれて M10 の2本目で引き上げられた経緯があり、このリポジトリは
 * 「1本目では抽象を作らない」で通っている。logic-tree の出力を作るときに
 * `core/mermaid.ts` へ引き上げる（open-issues に記録）
 */

/**
 * Mermaid のラベルに収める。
 *
 * - 改行は含められないので `<br>` にする（Mermaid はラベル内の `<br>` を解釈する）
 * - `#` はエンティティ記法（`#35;`）の開始文字、`;` は文の区切りに読まれうる
 *
 * **1回の走査で置き換える。** `replace` を順に掛けると、後の置換が前の置換で
 * 入れた文字を食う（`escapeCell` がバックスラッシュを先に処理しているのと
 * 同じ問題だが、こちらは順序では解けない——どちらを先にしても壊れる）
 */
export function escapeMermaidLabel(text: string): string {
  return text
    .replace(/[#;]/g, (ch) => (ch === '#' ? '#35;' : '#59;'))
    .replace(/\r\n|\r|\n/g, '<br>')
}
