import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { JsonSchema } from './canonical'
import { classifyFile } from './load'
import { createRegistry, type AnyToolModule } from './registry'

const glossarySchema = JSON.parse(
  readFileSync(new URL('../../schemas/glossary.schema.json', import.meta.url), 'utf8'),
) as JsonSchema

const sampleRaw = readFileSync(
  new URL('../../sample-project/glossary.json', import.meta.url),
  'utf8',
)

function makeRegistry() {
  const registry = createRegistry()
  const mod: AnyToolModule = {
    type: 'glossary',
    schemaVersion: 1,
    schema: glossarySchema,
    idPrefixes: ['term'],
    Editor: () => null,
    migrate: (d) => d,
  }
  registry.register(mod)
  return registry
}

describe('classifyFile', () => {
  it('スキーマ検証を通るファイルは editable（title と data つき）', () => {
    const result = classifyFile(sampleRaw, makeRegistry())
    expect(result.status).toBe('editable')
    if (result.status === 'editable') {
      expect(result.type).toBe('glossary')
      expect(result.title).toBe('facet 動作確認用サンプル 用語集')
    }
  })

  it('BOM つきでも editable（読み込み時に除去）', () => {
    const result = classifyFile('﻿' + sampleRaw, makeRegistry())
    expect(result.status).toBe('editable')
  })

  it('JSON として壊れたテキストは rejected', () => {
    const result = classifyFile('{ こわれてる', makeRegistry())
    expect(result.status).toBe('rejected')
  })

  it('オブジェクトでない JSON（配列）は rejected', () => {
    expect(classifyFile('[]', makeRegistry()).status).toBe('rejected')
  })

  it('スキーマ検証に落ちるファイルは rejected でエラー理由を持つ（レベル1）', () => {
    const broken = JSON.parse(sampleRaw) as { terms: Record<string, unknown>[] }
    delete broken.terms[0].notes
    const result = classifyFile(JSON.stringify(broken), makeRegistry())
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') {
      expect(result.errors.length).toBeGreaterThan(0)
    }
  })

  it('未知の type は listOnly（クラッシュしない・前方互換）', () => {
    const text = JSON.stringify({ schemaVersion: 1, type: 'stateMachine', title: '遷移表' })
    const result = classifyFile(text, makeRegistry())
    expect(result.status).toBe('listOnly')
    if (result.status === 'listOnly') expect(result.title).toBe('遷移表')
  })

  it('未知の新しい schemaVersion は listOnly（レベル1拒否にしない）', () => {
    const data = JSON.parse(sampleRaw) as Record<string, unknown>
    data.schemaVersion = 2
    expect(classifyFile(JSON.stringify(data), makeRegistry()).status).toBe('listOnly')
  })

  it('type を持たないただの JSON は listOnly', () => {
    expect(classifyFile('{"name": "package"}', makeRegistry()).status).toBe('listOnly')
  })
})
