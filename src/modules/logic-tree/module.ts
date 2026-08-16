import { Network } from 'lucide-react'
import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import logicTreeSchema from '../../../schemas/logic-tree.schema.json'
import { addRoot } from './commands'
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
  imageOutputs: [{ id: 'default', label: '画像', fileSuffix: '' }],
  // プロジェクトにロジックツリーは何本あってもよい（用語集と違いハブではない）
  singleton: false,
  migrate: migrateLogicTree,
  // **ルート1件で作る。** 空状態の「クリックして開始」を廃止したので、
  // 最初の1ノードは雛形が持つ。ID の採番は commands.ts の1箇所に保つため
  // addRoot を通す（ここで newId を直接呼ばない）
  createEmpty: (title) => addRoot({ schemaVersion: 1, type: 'logicTree', title, nodes: [] }).data,
}
