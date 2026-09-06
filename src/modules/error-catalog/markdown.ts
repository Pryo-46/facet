import { dividerRow, documentHeading, escapeCell, headingText, row } from '@/core/markdown-table'
import type { VisibleRows } from '@/core/table-export'
import type { ErrorCatalogSchemaVersion1, ErrorEntry } from '@/types/error-catalog'
import errorCatalogSchema from '../../../schemas/error-catalog.schema.json'
import { NO_COLUMN_LABEL } from './columns'
import { FIELD_LABELS, type ErrorField } from './fields'
import { resolutionLabel } from './resolution-labels'

/**
 * エラーカタログの Markdown 出力（モジュール規約5。決定15）。
 * 用語集の出力仕様（rev 8章）をそのままなぞる。
 *
 * - **h1 は使わない**（NotePM のページタイトルと階層が衝突する）。
 *   `title` が h2、解決レベルのグループが h3
 * - グループ順は **enum の定義順**をスキーマから実行時に導出する。
 *   空のグループは見出しごと省略し、グループ内はデータ配列順
 * - 空フィールドは `（未定義）`、`undecided` は「未分類」グループとして
 *   **サポート向け出力でも省略しない**。仕様書に貼った瞬間に未定義が
 *   見えなくなるのは文章仕様書の悪癖の再生産である（rev 5章）
 * - 列は呼び出し側（`profiles.ts` の `markdownFields`）が渡す。
 *   `resolutionLevel` はグルーピング軸として h3 に出るので列には来ない
 */

/** グループ順はスキーマの enum から実行時に導出する（ハードコードすると enum 改訂で静かにずれる） */
const LEVEL_ORDER: readonly string[] =
  errorCatalogSchema.$defs.errorEntry.properties.resolutionLevel.enum

const UNDEFINED_VALUE = '（未定義）'

/**
 * セルの値。**空は「（未定義）」と書いて負債を出力にも残す。**
 * ただし `notes` は検知対象外の自由メモなので空のまま——用語集の備考と揃える。
 * エスケープはコア（`@/core/markdown-table`）が持つ
 */
function value(entry: ErrorEntry, field: ErrorField): string {
  const raw: string = entry[field]
  if (raw === '' && field !== 'notes') return UNDEFINED_VALUE
  return escapeCell(raw)
}

export function errorCatalogToMarkdown(
  data: ErrorCatalogSchemaVersion1,
  fields: readonly ErrorField[],
  visible?: VisibleRows,
): string {
  // enum 順のグループを先に作っておくことで、出力順が enum の定義順に固定される。
  // 値ではなく配列位置を持つ——No がデータ配列の位置だから
  const groups = new Map<string, number[]>(LEVEL_ORDER.map((level) => [level, []]))
  data.errors.forEach((entry, index) => {
    // **絞り込みはここで効かせる。配列位置（index）は元のまま持つ**
    // ——No を振り直すと画面の No と食い違い、口頭で指す目印として使えなくなる
    if (visible != null && !visible.has(entry.id)) return
    const group = groups.get(entry.resolutionLevel)
    // enum に無い値（将来の拡張版を古いアプリで開いた等）は末尾へ足す。
    // 落とすと「出力に出ないエラー」が黙って生まれる
    if (group === undefined) groups.set(entry.resolutionLevel, [index])
    else group.push(index)
  })

  const header = row([NO_COLUMN_LABEL, ...fields.map((f) => FIELD_LABELS[f])])
  // No 列のぶんを足す。見出しと本数がずれないよう列数から作る
  const divider = dividerRow(fields.length + 1)
  const blocks: string[] = [documentHeading(data.title)]
  for (const [level, indices] of groups) {
    if (indices.length === 0) continue
    blocks.push(`### ${headingText(resolutionLabel(level))}`)
    const rows = indices.map((index) =>
      // **No はデータ配列の位置（index + 1）。** グループごとに 1 から振り直さない
      //——画面の No と出力の No が食い違うと、口頭で指すための目印として使えない
      row([`${index + 1}`, ...fields.map((f) => value(data.errors[index], f))]),
    )
    blocks.push([header, divider, ...rows].join('\n'))
  }
  return `${blocks.join('\n\n')}\n`
}
