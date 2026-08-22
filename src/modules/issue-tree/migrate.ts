import type { IssueTreeSchemaVersion2 } from '@/types/issue-tree'

/**
 * 規約6: マイグレータ。**1 → 2 は `schemaVersion` の書き換えだけ**——
 * 2 は `judgementEvent.kind` に `onHold`（保留）を足した改訂で、
 * 1 の正しいファイルはそのまま 2 の正しいファイルである。
 *
 * 移行後の検証は呼び出し側（`src/core/load.ts`）がやる。ここでは形を
 * 見ない（見ると、検証の規則が2箇所に生える）
 */
export function migrateIssueTree(data: unknown, fromVersion: number): IssueTreeSchemaVersion2 {
  if (fromVersion >= 2) return data as IssueTreeSchemaVersion2
  return { ...(data as Record<string, unknown>), schemaVersion: 2 } as IssueTreeSchemaVersion2
}
