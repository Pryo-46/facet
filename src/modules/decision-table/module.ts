import { Table } from 'lucide-react'
import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import decisionTableSchema from '../../../schemas/decision-table.schema.json'
import { checkDecisionTableConsistency } from './consistency'
import { DecisionTableEditor } from './DecisionTableEditor'
import { migrateDecisionTable } from './migrate'

export const decisionTableModule: ToolModule<DecisionTableSchemaVersion1> = {
  type: 'decisionTable',
  displayName: 'デシジョンテーブル',
  icon: Table,
  schemaVersion: 1,
  schema: decisionTableSchema as JsonSchema,
  idPrefixes: ['cond', 'out'],
  Editor: DecisionTableEditor,
  checkConsistency: checkDecisionTableConsistency,
  // 規約5: 出力は持たない。額縁は outputs[0] が無いと書き出し・コピーの
  // 両ボタンを押せなくする（rev 6章が認めている「0本」の状態）
  outputs: [],
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
