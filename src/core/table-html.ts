import type { Table } from './table-export'

/**
 * HTML の実体参照。**`&` を先に処理する**——順序を逆にすると、実体参照で
 * 入れた `&` まで二重にエスケープされる（`markdown-table.ts` の `escapeCell` が
 * バックスラッシュを先に処理しているのと同じ罠）。
 *
 * **`"` は逃がさなくてよい。** 危険なのは属性値の中だけで、この関数が組む
 * HTML には属性が1つも無い（下の `tableToHtml` を参照）。逃がすと、貼り先に
 * `&quot;` がそのまま見えることがある
 */
function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** セル1つ。改行は `<br>`（TSV の `"` 囲みに当たる、HTML での「1セル内の改行」） */
function cell(tag: 'th' | 'td', text: string): string {
  return `<${tag}>${escapeHtmlText(text).replace(/\r\n|\r|\n/g, '<br>')}</${tag}>`
}

/**
 * 表 → 素の `<table>`。
 *
 * **罫線・背景色・フォント指定を一切付けない。** 装飾を付けると
 * 「書式なしで貼りたい」に応えられなくなる——貼り先の書式に馴染ませるのが
 * 表形式コピーの目的である。属性を1つも出さないので、`escapeHtmlText` は
 * `"` を逃がさなくてよい（上の JSDoc）。
 *
 * `<thead>` / `<tbody>` は付ける。貼り先が見出し行を見出しとして扱えるようにするため
 */
export function tableToHtml(table: Table): string {
  const head = `<thead><tr>${table.header.map((t) => cell('th', t)).join('')}</tr></thead>`
  const body = `<tbody>${table.rows
    .map((r) => `<tr>${r.map((t) => cell('td', t)).join('')}</tr>`)
    .join('')}</tbody>`
  return `<table>${head}${body}</table>`
}
