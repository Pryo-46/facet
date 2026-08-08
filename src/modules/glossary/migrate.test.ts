import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { migrateGlossary } from './migrate'

describe('migrateGlossary（schemaVersion 1 は初版）', () => {
  it('恒等変換である（同一参照をそのまま返す）', () => {
    // fixture は動作確認の遊び場ではなく、回帰テストに必須のファイル
    const data = JSON.parse(
      readFileSync(new URL('../../core/__fixtures__/glossary.canonical.json', import.meta.url), 'utf8'),
    ) as unknown
    expect(migrateGlossary(data, 1)).toBe(data)
  })
})

describe('appRegistry', () => {
  it('glossary モジュールが登録されている', async () => {
    const { appRegistry } = await import('@/modules')
    const mod = appRegistry.get('glossary')
    expect(mod?.type).toBe('glossary')
    expect(mod?.schemaVersion).toBe(1)
    expect(mod?.idPrefixes).toEqual(['term'])
  })
})
