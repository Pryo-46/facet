import { Network } from 'lucide-react'
import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import logicTreeSchema from '../../../schemas/logic-tree.schema.json'
import { addRoot } from './commands'
import { checkLogicTreeConsistency } from './consistency'
import { LogicTreeEditor } from './LogicTreeEditor'
import { logicTreeToMarkdown } from './markdown'
import { migrateLogicTree } from './migrate'
import { miroMindmapExchange } from './miro'
import { logicTreeToTable } from './table'

export const logicTreeModule: ToolModule<LogicTreeSchemaVersion1> = {
  type: 'logicTree',
  displayName: 'ロジックツリー',
  icon: Network,
  schemaVersion: 1,
  schema: logicTreeSchema as JsonSchema,
  idPrefixes: ['node'],
  Editor: LogicTreeEditor,
  checkConsistency: checkLogicTreeConsistency,
  // 規約5: M1 で 0 本だった出力を M2 で1本にした。
  // **図と箇条書きを1本にまとめる**——形式の軸でプロファイルを割らない（rev 6章）
  outputs: [
    { id: 'default', label: 'Markdown', fileSuffix: '', toMarkdown: logicTreeToMarkdown },
  ],
  // 規約7（任意）: Miro のマインドマップとのクリップボード交換（M2）。
  // **他のツールは宣言しない**——額縁はこの有無でボタンの活性を決める
  clipboardExchanges: [miroMindmapExchange],
  // 規約8: 表形式コピー（M29）。**読み手は1本**。木なので numberStyle と
  // repeatParent を宣言する——階層を列に展開する唯一のツールである
  tableExport: {
    options: ['numbering', 'numberStyle', 'repeatParent', 'showUndefined'],
    variants: [{ id: 'default', label: 'ロジックツリー', toTable: logicTreeToTable }],
  },
  // プロジェクトにロジックツリーは何本あってもよい（用語集と違いハブではない）
  singleton: false,
  migrate: migrateLogicTree,
  // **ルート1件で作る。** 空状態の「クリックして開始」を廃止したので、
  // 最初の1ノードは雛形が持つ。ID の採番は commands.ts の1箇所に保つため
  // addRoot を通す（ここで newId を直接呼ばない）
  createEmpty: (title) => addRoot({ schemaVersion: 1, type: 'logicTree', title, nodes: [] }).data,
}
