import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { GlossarySchemaVersion1 } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'
import { GlossaryEditor } from './GlossaryEditor'
import { migrateGlossary } from './migrate'

export const glossaryModule: ToolModule<GlossarySchemaVersion1> = {
  type: 'glossary',
  schemaVersion: 1,
  schema: glossarySchema as JsonSchema,
  idPrefixes: ['term'],
  Editor: GlossaryEditor,
  migrate: migrateGlossary,
}
