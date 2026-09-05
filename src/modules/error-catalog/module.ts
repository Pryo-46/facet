import { BookAlert } from 'lucide-react'
import type { JsonSchema } from '@/core/canonical'
import type { OutputProfile, ToolModule } from '@/core/registry'
import type { TableOptions, TableVariant, VisibleRows } from '@/core/table-export'
import type { ErrorCatalogSchemaVersion1 } from '@/types/error-catalog'
import errorCatalogSchema from '../../../schemas/error-catalog.schema.json'
import { checkErrorCatalogConsistency } from './consistency'
import { ErrorCatalogEditor } from './ErrorCatalogEditor'
import { errorCatalogToMarkdown } from './markdown'
import { migrateErrorCatalog } from './migrate'
import { markdownFields, PROFILES } from './profiles'
import { errorCatalogToTable } from './table'

/**
 * 規約5: 出力プロファイル。**列セットはプロファイル宣言から導出する**
 *（`markdownFields` が `resolutionLevel` を落とす）。ここに列を書き並べると
 * 画面の列と二重管理になり、片方だけ直したときに黙ってずれる
 */
const outputs: readonly OutputProfile<ErrorCatalogSchemaVersion1>[] = PROFILES.map((profile) => ({
  id: profile.id,
  label: profile.label,
  fileSuffix: profile.fileSuffix,
  toMarkdown: (data: ErrorCatalogSchemaVersion1, visible?: VisibleRows) =>
    errorCatalogToMarkdown(data, markdownFields(profile), visible),
}))

/**
 * 規約8: 表形式コピー。**`outputs` と同じく `PROFILES` から導出する**——
 * 列セットの定義が増えると、片方だけ直したときに黙ってずれる。
 *
 * **末尾の cast は安全である。** `TableExport.variants` は非空タプル型だが、
 * `Array.prototype.map` は入力がタプルでも戻り値の長さを型に残さない
 * （TS の既知の制約。`unknown` を経由しないと弾かれるのもそのため）。
 * `PROFILES`（`profiles.ts`）は `[SUPPORT_PROFILE, DEV_PROFILE]` という
 * 空にならないリテラルなので、`.map` の結果も実際には必ず1件以上——
 * ハンドリストで列を書き並べる代わりに、ここでだけ型を締め直す
 */
const tableVariants = PROFILES.map((profile) => ({
  id: profile.id,
  label: profile.label,
  toTable: (
    data: ErrorCatalogSchemaVersion1,
    options: TableOptions,
    visible?: VisibleRows,
  ) => errorCatalogToTable(data, profile, options, visible),
})) as unknown as readonly [
  TableVariant<ErrorCatalogSchemaVersion1>,
  ...TableVariant<ErrorCatalogSchemaVersion1>[],
]

export const errorCatalogModule: ToolModule<ErrorCatalogSchemaVersion1> = {
  type: 'errorCatalog',
  displayName: 'エラーカタログ',
  icon: BookAlert,
  schemaVersion: 1,
  schema: errorCatalogSchema as JsonSchema,
  idPrefixes: ['error'],
  Editor: ErrorCatalogEditor,
  checkConsistency: checkErrorCatalogConsistency,
  outputs,
  tableExport: { options: ['numbering', 'showUndefined'], variants: tableVariants },
  // エラーカタログはプロジェクトにつき1つ（rev 5章の単一性）
  singleton: true,
  migrate: migrateErrorCatalog,
  // 新規プロジェクトでは0件が正常。エラーは行追加で増える
  createEmpty: (title) => ({ schemaVersion: 1, type: 'errorCatalog', title, errors: [] }),
}
