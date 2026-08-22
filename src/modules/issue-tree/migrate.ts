import type { IssueTreeSchemaVersion1 } from '@/types/issue-tree'

/**
 * 規約6: マイグレータ。schemaVersion 1 が初版のため旧版が存在せず、
 * 恒等変換の枠だけを置く。schemaVersion 2 が生まれた時点で最初の変換を実装する
 */
export function migrateIssueTree(data: unknown, _fromVersion: number): IssueTreeSchemaVersion1 {
  return data as IssueTreeSchemaVersion1
}
