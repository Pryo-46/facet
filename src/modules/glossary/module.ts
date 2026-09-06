import { BookA } from 'lucide-react'
import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { GlossarySchemaVersion1 } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'
import { checkGlossaryConsistency } from './consistency'
import { GlossaryEditor } from './GlossaryEditor'
import { glossaryToMarkdown } from './markdown'
import { migrateGlossary } from './migrate'
import { glossaryToTable } from './table'

export const glossaryModule: ToolModule<GlossarySchemaVersion1> = {
  type: 'glossary',
  displayName: '用語集',
  icon: BookA,
  schemaVersion: 1,
  schema: glossarySchema as JsonSchema,
  idPrefixes: ['term'],
  Editor: GlossaryEditor,
  checkConsistency: checkGlossaryConsistency,
  // 規約5: NotePM 向け Markdown（session-notes 論点7）。Mermaid は無い。
  // 用語集は1プロファイル。fileSuffix が '' なので書き出し名は固定される
  outputs: [
    { id: 'default', label: 'Markdown', fileSuffix: '', toMarkdown: glossaryToMarkdown },
  ],
  // 規約8: 表形式コピー。**読み手は1本**なのでダイアログに選択を出さない。
  // 階層が無いので numberStyle も、親が無いので repeatParent も宣言しない
  tableExport: {
    options: ['numbering', 'showUndefined'],
    variants: [{ id: 'default', label: '用語集', toTable: glossaryToTable }],
  },
  // 用語集はハブなのでプロジェクトにつき1つ（rev 5章の単一性）
  singleton: true,
  migrate: migrateGlossary,
  // 用語集0個は正常な状態（新規プロジェクト）。空の terms で作り、
  // 用語は行追加または将来のインライン登録で増える（rev 5章）
  createEmpty: (title) => ({ schemaVersion: 1, type: 'glossary', title, terms: [] }),
}
