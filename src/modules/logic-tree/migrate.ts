import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'

/**
 * 規約6: マイグレータ。schemaVersion 1 が初版のため旧版が存在せず、
 * 恒等変換の枠だけを置く。schemaVersion 2 が生まれた時点で最初の変換を実装する。
 */
export function migrateLogicTree(data: unknown, _fromVersion: number): LogicTreeSchemaVersion1 {
  return data as LogicTreeSchemaVersion1
}
