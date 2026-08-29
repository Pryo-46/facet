import type { Table } from './table-export'

/**
 * 表 → TSV（タブ区切り）。Excel・Google スプレッドシートは貼り付けた
 * プレーンテキストをタブで列に割る。
 *
 * **セルは書き手を信用せずエスケープする。** `markdown-table.ts` の `escapeCell`
 * が警告している危険——自由記述欄に Windows パス・正規表現・外部（Skill・エディタ）が
 * 書いた複数行の値が入り、表が途中で割れて1件まるごと読めなくなる——は形式が
 * 変わっても消えない。
 *
 * **`escapeCell` は流用できない。** あれは `|`（列区切り）を逃がす Markdown の表
 * 専用の規則で、TSV では `|` は無害、代わりにタブ・改行・`"` が壊す。
 * **統合すべきなのは「エスケープするという判断」であって、置換表ではない**
 */
function escapeTsvCell(text: string): string {
  // **改行を先に LF へ揃える。** 囲みの中に CR が残ると、貼り先によっては
  // そこで行が割れる（CRLF と CR を別々に扱う貼り先がある）
  const normalized = text.replace(/\r\n|\r/g, '\n')
  if (!/[\t\n"]/.test(normalized)) return normalized
  // RFC 4180: 囲んだ中の `"` は `""` に倍化する。Excel も Google スプレッドシートも
  // クリップボードのプレーンテキストをこの規則で読む
  return `"${normalized.replace(/"/g, '""')}"`
}

/**
 * **末尾に改行を付けない。** クリップボードのテキストはファイルではなく、
 * 付けると貼り先が空行を1本余計に選択する
 */
export function tableToTsv(table: Table): string {
  return [table.header, ...table.rows]
    .map((cells) => cells.map(escapeTsvCell).join('\t'))
    .join('\n')
}
