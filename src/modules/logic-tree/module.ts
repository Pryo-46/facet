import { Network } from 'lucide-react'
import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import logicTreeSchema from '../../../schemas/logic-tree.schema.json'
import { checkLogicTreeConsistency } from './consistency'
import { LogicTreeEditor } from './LogicTreeEditor'
import { migrateLogicTree } from './migrate'

export const logicTreeModule: ToolModule<LogicTreeSchemaVersion1> = {
  type: 'logicTree',
  displayName: 'ロジックツリー',
  icon: Network,
  schemaVersion: 1,
  schema: logicTreeSchema as JsonSchema,
  idPrefixes: ['node'],
  Editor: LogicTreeEditor,
  checkConsistency: checkLogicTreeConsistency,
  // 規約5: 出力プロファイルは0本。Markdown / Mermaid 出力は M2 で足す——
  // それまで額縁（ExportMenu）は出力ボタンを押せない状態で出す
  outputs: [],
  // プロジェクトにロジックツリーは何本あってもよい（用語集と違いハブではない）
  singleton: false,
  migrate: migrateLogicTree,
  // ノード0件で作る。最初の1ノードは空状態の「クリックして開始」で生まれる
  createEmpty: (title) => ({ schemaVersion: 1, type: 'logicTree', title, nodes: [] }),
}
