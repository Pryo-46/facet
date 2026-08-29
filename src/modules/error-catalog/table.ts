import {
  type Table,
  type TableOptions,
  UNDEFINED_TEXT,
  type VisibleRows,
} from '@/core/table-export'
import type { ErrorCatalogSchemaVersion1, ErrorEntry } from '@/types/error-catalog'
import { NO_COLUMN_LABEL } from './columns'
import { FIELD_LABELS, type ErrorField } from './fields'
import type { ErrorProfile } from './profiles'
import { resolutionLabel } from './resolution-labels'

/**
 * エラーカタログの表（モジュール規約8。M29）。
 *
 * **`markdownFields()` を使わない。** あれは `resolutionLevel` を列から落とす関数で、
 * 落とす理由は「グルーピング軸が h3 見出しになるから」（`profiles.ts` の JSDoc）。
 * 表に見出しは無いので、落とす理由も無い。**`profile.fields` をそのまま使う**——
 * プロファイルの JSDoc が「`fields` に `resolutionLevel` を含めるのは画面には列として
 * 出すため」と述べている通り、**表は画面と同じ側にいる**。
 *
 * **No はデータ配列の位置（`index + 1`）で、`visible` で絞っても振り直さない**
 *（`markdown.ts` の No の JSDoc と同じ理由。画面の No と食い違うと、口頭で指す
 *  ための目印として使えない）
 */
export function errorCatalogToTable(
  data: ErrorCatalogSchemaVersion1,
  profile: ErrorProfile,
  options: TableOptions,
  visible?: VisibleRows,
): Table {
  const header = [
    ...(options.numbering ? [NO_COLUMN_LABEL] : []),
    ...profile.fields.map((field) => FIELD_LABELS[field]),
  ]
  const rows: string[][] = []
  data.errors.forEach((entry, index) => {
    if (visible != null && !visible.has(entry.id)) return
    rows.push([
      ...(options.numbering ? [String(index + 1)] : []),
      ...profile.fields.map((field) => cellText(entry, field, options)),
    ])
  })
  return { header, rows }
}

/**
 * セルの値。**空は（未定義）と書いて負債を出力にも残す。ただし `notes` は
 * 検知対象外の自由メモなので空のまま**——`markdown.ts` の `value()` と同じ規則
 *（ここで規則を変えると、同じデータの Markdown と表で未定義の数が食い違う）
 */
function cellText(entry: ErrorEntry, field: ErrorField, options: TableOptions): string {
  // 解決レベルは enum。画面のチップ・Markdown の h3 と同じ対応表でラベルへ直す
  if (field === 'resolutionLevel') return resolutionLabel(entry.resolutionLevel)
  const raw: string = entry[field]
  if (options.showUndefined && raw === '' && field !== 'notes') return UNDEFINED_TEXT
  return raw
}
