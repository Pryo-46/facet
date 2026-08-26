import { ArrowLeftRight } from 'lucide-react'
import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import sequenceSchema from '../../../schemas/sequence.schema.json'
import { addFirstActor } from './commands'
import { checkSequenceConsistency } from './consistency'
import { describeSequenceIssueEffect, sequenceToMarkdown } from './markdown'
import { migrateSequence } from './migrate'
import { SequenceEditor } from './SequenceEditor'

export const sequenceModule: ToolModule<SequenceSchemaVersion1> = {
  type: 'sequence',
  displayName: 'シーケンス',
  icon: ArrowLeftRight,
  schemaVersion: 1,
  schema: sequenceSchema as JsonSchema,
  // zone は M4 で足す
  idPrefixes: ['actor', 'step'],
  Editor: SequenceEditor,
  checkConsistency: checkSequenceConsistency,
  // 規約5: 図（Mermaid）と失敗考慮の表を1本の Markdown にまとめる（sequence M3）。
  // fileSuffix は ''（プロファイル1本なので用語集と同形。書き出し名は
  // <ファイル名>.md になる）
  outputs: [
    {
      id: 'default',
      label: 'Markdown',
      fileSuffix: '',
      toMarkdown: sequenceToMarkdown,
      describeIssueEffect: describeSequenceIssueEffect,
    },
  ],
  // プロジェクトにシーケンスは何本あってもよい（機能ごとに分けるのが普通の使い方）
  singleton: false,
  migrate: migrateSequence,
  // **アクター1人で作る。** 空状態の「クリックして開始」を廃止したので、
  // 最初の1人は雛形が持つ。ID の採番は commands.ts の1箇所に保つため
  // addFirstActor を通す（ここで newId を直接呼ばない）
  createEmpty: (title) =>
    addFirstActor({ schemaVersion: 1, type: 'sequence', title, actors: [], steps: [] }).data,
}
