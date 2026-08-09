import type { JsonSchema } from '@/core/canonical'
import type { OutputProfile, ToolModule } from '@/core/registry'
import type { ErrorCatalogSchemaVersion1 } from '@/types/error-catalog'
import errorCatalogSchema from '../../../schemas/error-catalog.schema.json'
import { checkErrorCatalogConsistency } from './consistency'
import { ErrorCatalogEditor } from './ErrorCatalogEditor'
import { errorCatalogToMarkdown } from './markdown'
import { migrateErrorCatalog } from './migrate'
import { markdownFields, PROFILES } from './profiles'

/**
 * 規約5: 出力プロファイル。**列セットはプロファイル宣言から導出する**
 *（`markdownFields` が `resolutionLevel` を落とす）。ここに列を書き並べると
 * 画面の列と二重管理になり、片方だけ直したときに黙ってずれる
 */
const outputs: readonly OutputProfile<ErrorCatalogSchemaVersion1>[] = PROFILES.map((profile) => ({
  id: profile.id,
  label: profile.label,
  fileSuffix: profile.fileSuffix,
  toMarkdown: (data: ErrorCatalogSchemaVersion1) =>
    errorCatalogToMarkdown(data, markdownFields(profile)),
}))

export const errorCatalogModule: ToolModule<ErrorCatalogSchemaVersion1> = {
  type: 'errorCatalog',
  displayName: 'エラーカタログ',
  schemaVersion: 1,
  schema: errorCatalogSchema as JsonSchema,
  idPrefixes: ['error'],
  Editor: ErrorCatalogEditor,
  checkConsistency: checkErrorCatalogConsistency,
  outputs,
  // エラーカタログはプロジェクトにつき1つ（rev 5章の単一性）
  singleton: true,
  migrate: migrateErrorCatalog,
  // 新規プロジェクトでは0件が正常。エラーは行追加で増える
  createEmpty: (title) => ({ schemaVersion: 1, type: 'errorCatalog', title, errors: [] }),
}
