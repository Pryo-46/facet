import type { ErrorCatalogSchemaVersion1 } from '@/types/error-catalog'

/**
 * 規約6: マイグレータ。schemaVersion 1 が初版のため旧版が存在せず、
 * 恒等変換の枠だけを置く。schemaVersion 2 が生まれた時点で最初の変換を実装する
 *（occurrence を「手入力」から「参照からの導出」へ移すときが最有力候補。
 *  session-notes 3節の申し送り）
 */
export function migrateErrorCatalog(
  data: unknown,
  _fromVersion: number,
): ErrorCatalogSchemaVersion1 {
  return data as ErrorCatalogSchemaVersion1
}
