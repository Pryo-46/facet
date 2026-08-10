import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import sequenceSchema from '../../../schemas/sequence.schema.json'
import { checkSequenceConsistency } from './consistency'
import { migrateSequence } from './migrate'
import { SequenceEditor } from './SequenceEditor'

export const sequenceModule: ToolModule<SequenceSchemaVersion1> = {
  type: 'sequence',
  displayName: 'シーケンス',
  schemaVersion: 1,
  schema: sequenceSchema as JsonSchema,
  // zone は M2 で足す
  idPrefixes: ['actor', 'step'],
  Editor: SequenceEditor,
  checkConsistency: checkSequenceConsistency,
  // 規約5: 出力は0本で開始（rev 6章）。Markdown / Mermaid は会議で使うと確定してから
  outputs: [],
  // プロジェクトにシーケンスは何本あってもよい（機能ごとに分けるのが普通の使い方）
  singleton: false,
  migrate: migrateSequence,
  // 参加者0人で作る。最初の1人は空状態の「クリックして開始」で生まれる
  createEmpty: (title) => ({ schemaVersion: 1, type: 'sequence', title, actors: [], steps: [] }),
}
