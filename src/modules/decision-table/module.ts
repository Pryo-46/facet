import { Table } from 'lucide-react'
import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import decisionTableSchema from '../../../schemas/decision-table.schema.json'
import { checkDecisionTableConsistency } from './consistency'
import { DecisionTableEditor } from './DecisionTableEditor'
import { decisionTableToMarkdown, describeDecisionTableIssueEffect } from './markdown'
import { migrateDecisionTable } from './migrate'
import { decisionTableToTable } from './table'

export const decisionTableModule: ToolModule<DecisionTableSchemaVersion1> = {
  type: 'decisionTable',
  displayName: 'デシジョンテーブル',
  icon: Table,
  schemaVersion: 1,
  schema: decisionTableSchema as JsonSchema,
  idPrefixes: ['cond', 'out'],
  Editor: DecisionTableEditor,
  checkConsistency: checkDecisionTableConsistency,
  // 規約5: 判定表を含む Markdown 1本。畳んだ表を足しても形式ごとにプロファイルを割らない
  outputs: [
    {
      id: 'default',
      label: 'Markdown',
      fileSuffix: '',
      toMarkdown: decisionTableToMarkdown,
      describeIssueEffect: describeDecisionTableIssueEffect,
    },
  ],
  // 規約8: 表形式コピー。**読み手は1本**なのでダイアログに選択を出さない。
  // 階層が無いので numberStyle も、親が無いので repeatParent も宣言しない。
  // `variants` は静的な配列なので、結果列ごとに変わる表はここに載せられない
  tableExport: {
    options: ['numbering', 'showUndefined'],
    variants: [{ id: 'default', label: '判定表', toTable: decisionTableToTable }],
  },
  // 論点ごとに表を分けるのが普通の使い方なので、1プロジェクトに何本でも置ける
  singleton: false,
  migrate: migrateDecisionTable,
  // 条件も結果も無い空の表から始める。行は条件の直積なので、条件が無ければ0本
  createEmpty: (title) => ({
    schemaVersion: 1,
    type: 'decisionTable',
    title,
    conditions: [],
    outcomes: [],
    rows: [],
  }),
}
