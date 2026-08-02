import type { GlossarySchemaVersion1 } from '@/types/glossary'

/**
 * 規約6: マイグレータ。schemaVersion 1 が初版のため旧版が存在せず、
 * 恒等変換の枠だけを置く。schemaVersion 2 が生まれた時点で最初の変換を実装する。
 */
export function migrateGlossary(data: unknown, _fromVersion: number): GlossarySchemaVersion1 {
  return data as GlossarySchemaVersion1
}
