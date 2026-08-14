import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { JsonSchema } from './canonical'
import { classifyFile, titleOf, UNTITLED, withTitle } from './load'
import { createRegistry, type AnyToolModule } from './registry'

const glossarySchema = JSON.parse(
  readFileSync(new URL('../../schemas/glossary.schema.json', import.meta.url), 'utf8'),
) as JsonSchema

const sampleRaw = readFileSync(
  new URL('./__fixtures__/glossary.canonical.json', import.meta.url),
  'utf8',
)

function makeRegistry() {
  const registry = createRegistry()
  const mod: AnyToolModule = {
    type: 'glossary',
    displayName: 'glossary',
    schemaVersion: 1,
    schema: glossarySchema,
    idPrefixes: ['term'],
    Editor: () => null,
    checkConsistency: () => [],
    outputs: [{ id: 'default', label: 'Markdown', fileSuffix: '', toMarkdown: () => '' }],
    singleton: false,
    migrate: (d) => d,
    createEmpty: () => ({}),
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

  it('type が非文字列なら「文字列ではありません」の文言で listOnly', () => {
    const result = classifyFile('{"type": 42, "title": "数値type"}', makeRegistry())
    expect(result.status).toBe('listOnly')
    if (result.status === 'listOnly') {
      expect(result.reason).toContain('文字列ではありません')
    }
  })

  it('schemaVersion 欠落は「ありません」の文言で listOnly（新版とは区別）', () => {
    const result = classifyFile('{"type": "glossary", "title": "版なし"}', makeRegistry())
    expect(result.status).toBe('listOnly')
    if (result.status === 'listOnly') {
      expect(result.reason).toContain('schemaVersion がありません')
    }
  })

  it('スキーマ違反の rejected も type を保持する（単一性検査が数えるため）', () => {
    const broken = JSON.parse(sampleRaw) as { terms: Record<string, unknown>[] }
    delete broken.terms[0].notes
    const result = classifyFile(JSON.stringify(broken), makeRegistry())
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') expect(result.type).toBe('glossary')
  })
})

describe('titleOf', () => {
  it('title が文字列ならそのまま返す', () => {
    expect(titleOf({ title: '受注フロー' })).toBe('受注フロー')
  })

  it('空文字もそのまま返す（空欄は未決の意思表示。潰さない）', () => {
    expect(titleOf({ title: '' })).toBe('')
  })

  it('title が無い・文字列でない・レコードでないなら (無題)', () => {
    expect(titleOf({})).toBe(UNTITLED)
    expect(titleOf({ title: 42 })).toBe(UNTITLED)
    expect(titleOf(null)).toBe(UNTITLED)
    expect(titleOf('文字列')).toBe(UNTITLED)
  })
})

describe('withTitle', () => {
  it('title だけを差し替え、他のキーは保つ', () => {
    const before = { schemaVersion: 1, type: 'sequence', title: '旧', steps: [] }
    expect(withTitle(before, '受注フロー')).toEqual({
      schemaVersion: 1,
      type: 'sequence',
      title: '受注フロー',
      steps: [],
    })
  })

  it('元のオブジェクトを破壊しない', () => {
    const before = { title: '旧' }
    withTitle(before, '新')
    expect(before.title).toBe('旧')
  })
})
