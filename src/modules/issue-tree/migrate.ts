import type { IssueTreeSchemaVersion4 } from '@/types/issue-tree'

/**
 * 規約6: マイグレータ。**旧版 → 4 は `schemaVersion` の書き換えだけ**である。
 *
 * 4 は仮説の `events` から追記専用をやめ、**課題と仮説の両方の `events` に
 * `maxItems: 1` を課した**改訂である。3 は仮説の文言を3つに割り
 *（`title` / `detail` / `value`）、聞きたいこと（`asks`）と属性つきFB
 *（`feedbacks`）を足し、課題に解決の旗（`resolved`）と日付（`date`）を足した
 * 改訂で、`rationale` と `pendingNotes` を落とした。**だから 3 の正しい
 * ファイルが 4 でも正しいとは限らない**——判断が2件以上あるファイルは版だけ
 * 上がって検証で落ちる＝開けない（2 → 3 も同じである）。
 *
 * **これは意図した結果で、変換は用意しない。** ここで列を切り詰めると、
 * **どの1件を残すかをアプリが黙って決めることになる**——キーを読み替えると
 * 廃止したキーが別の顔で生き残るのと同じ形である。`migrate.test.ts` の
 * 最後の it が、この決定を「移行後の検証が落ちること」として固定している。
 *
 * 移行後の検証は呼び出し側（`src/core/load.ts`）がやる。ここでは形を
 * 見ない（見ると、検証の規則が2箇所に生える）
 */
export function migrateIssueTree(data: unknown, fromVersion: number): IssueTreeSchemaVersion4 {
  if (fromVersion >= 4) return data as IssueTreeSchemaVersion4
  return { ...(data as Record<string, unknown>), schemaVersion: 4 } as IssueTreeSchemaVersion4
}
