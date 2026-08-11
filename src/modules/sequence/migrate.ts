import type { SequenceSchemaVersion1 } from '@/types/sequence'

/** 初版につき恒等。schemaVersion 2 が生まれたらここに変換を足す（rev 5章） */
export function migrateSequence(data: unknown, _fromVersion: number): SequenceSchemaVersion1 {
  return data as SequenceSchemaVersion1
}
