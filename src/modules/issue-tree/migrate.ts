import type { IssueTreeSchemaVersion3 } from '@/types/issue-tree'

/**
 * 規約6: マイグレータ。**旧版 → 3 は `schemaVersion` の書き換えだけ**である。
 *
 * 3 は仮説の文言を3つに割り（`title` / `detail` / `value`）、聞きたいこと（`asks`）と
 * 属性つきFB（`feedbacks`）を足し、課題に解決の旗（`resolved`）と日付（`date`）を
 * 足した改訂で、`rationale` と `pendingNotes` を落とした。**だから 2 の正しい
 * ファイルが 3 でも正しいとは限らない**——版だけ上がって検証で落ちる＝開けない。
 *
 * **これは意図した結果で、変換は用意しない**（2026-08-30 のユーザー判断。
 * 1 → 2 のときと同じ扱いである）。ここでキーを読み替えると、廃止したキーが
 * データの中に別の顔で生き残る。`migrate.test.ts` の最後の it が、この決定を
 * 「移行後の検証が落ちること」として固定している。
 *
 * 移行後の検証は呼び出し側（`src/core/load.ts`）がやる。ここでは形を
 * 見ない（見ると、検証の規則が2箇所に生える）
 */
export function migrateIssueTree(data: unknown, fromVersion: number): IssueTreeSchemaVersion3 {
  if (fromVersion >= 3) return data as IssueTreeSchemaVersion3
  return { ...(data as Record<string, unknown>), schemaVersion: 3 } as IssueTreeSchemaVersion3
}
