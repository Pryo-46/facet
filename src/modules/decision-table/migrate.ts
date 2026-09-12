import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'

/**
 * 規約6: マイグレータ。schemaVersion 1 が初版のため旧版が存在せず、
 * 恒等変換の枠だけを置く。schemaVersion 2 が生まれた時点で最初の変換を実装する。
 */
export function migrateDecisionTable(
  data: unknown,
  _fromVersion: number,
): DecisionTableSchemaVersion1 {
  return data as DecisionTableSchemaVersion1
}
