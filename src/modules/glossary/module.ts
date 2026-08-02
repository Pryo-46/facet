import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { GlossarySchemaVersion1 } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'
import { checkGlossaryConsistency } from './consistency'
import { GlossaryEditor } from './GlossaryEditor'
import { migrateGlossary } from './migrate'

export const glossaryModule: ToolModule<GlossarySchemaVersion1> = {
  type: 'glossary',
  displayName: '用語集',
  schemaVersion: 1,
  schema: glossarySchema as JsonSchema,
  idPrefixes: ['term'],
  Editor: GlossaryEditor,
  checkConsistency: checkGlossaryConsistency,
  // 用語集はハブなのでプロジェクトにつき1つ（rev 5章の単一性）
  singleton: true,
  migrate: migrateGlossary,
}
