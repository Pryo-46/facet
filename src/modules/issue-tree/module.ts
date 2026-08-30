import { FlaskConical } from 'lucide-react'
import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { IssueTreeSchemaVersion4 } from '@/types/issue-tree'
import issueTreeSchema from '../../../schemas/issue-tree.schema.json'
import { addRootIssue } from './commands'
import { checkIssueTreeConsistency } from './consistency'
import { IssueTreeEditor } from './IssueTreeEditor'
import { migrateIssueTree } from './migrate'

export const issueTreeModule: ToolModule<IssueTreeSchemaVersion4> = {
  type: 'issueTree',
  displayName: '課題ツリー',
  icon: FlaskConical,
  schemaVersion: 4,
  schema: issueTreeSchema as JsonSchema,
  // プレフィクスはエンティティ単位（rev 5章）。ツール単位で1つに統一しない。
  // **ask は v3 で増えた3つ目**——聞きたいこと（asks）は feedbacks から
  // 指されるので id を持つ（判断イベントや FB は指されないので持たない）
  idPrefixes: ['issue', 'hypothesis', 'ask'],
  Editor: IssueTreeEditor,
  checkConsistency: checkIssueTreeConsistency,
  // 規約5: 出力プロファイルは0本。**Markdown 出力は設計ノートの OUT** で、
  // 本当に必要になるのは PoC 終盤（結果を意思決定の場に持ち込むとき）。
  // それまでが観察期間である
  outputs: [],
  // PoC のテーマごとに1本作るのが普通の使い方。用語集と違いハブではない
  singleton: false,
  migrate: migrateIssueTree,
  // **ルートの課題1件で作る。** ID の採番を commands.ts の1箇所に保つため
  // addRootIssue を通す（ここで newId を直接呼ばない）
  createEmpty: (title) =>
    addRootIssue({ schemaVersion: 4, type: 'issueTree', title, issues: [], hypotheses: [] }).data,
}
