import type { IssueTreeSchemaVersion2 } from '@/types/issue-tree'

/**
 * 規約6: マイグレータ。**1 → 2 は `schemaVersion` の書き換えだけ**である。
 *
 * 2 は判断の語彙を確定した改訂で、`onHold`（保留）が足された一方、検証したか
 * 否かの区別（`supportedWithoutTest` / `rejectedWithoutTest`）と `deferredToMainDev`
 * が落ちた。**だから 1 の正しいファイルが 2 でも正しいとは限らない**——
 * 廃止した種別を持つファイルは版だけ上がって検証で落ちる＝開けない。
 * これは意図した結果で、**変換は用意しない**（2 は未公開のまま再定義した版であり、
 * 手元にそういうファイルは無い）。ここで種別を読み替えると、
 * 「もう無い区別」がデータの中に別の顔で生き残る。
 *
 * 移行後の検証は呼び出し側（`src/core/load.ts`）がやる。ここでは形を
 * 見ない（見ると、検証の規則が2箇所に生える）
 */
export function migrateIssueTree(data: unknown, fromVersion: number): IssueTreeSchemaVersion2 {
  if (fromVersion >= 2) return data as IssueTreeSchemaVersion2
  return { ...(data as Record<string, unknown>), schemaVersion: 2 } as IssueTreeSchemaVersion2
}
