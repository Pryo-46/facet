import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { serialize, stripBom, type JsonSchema } from './canonical'

const schema = JSON.parse(
  readFileSync(new URL('../../schemas/glossary.schema.json', import.meta.url), 'utf8'),
) as JsonSchema

/**
 * **この fixture は動作確認の遊び場ではない。** 最重要の回帰テスト
 *（Skill が書いたファイルのバイト一致）がこの中身に依存しているので、
 * 内容を差し替えたり消したりしないこと（M5 の実機確認で sample-project/ を
 * 触って2回テストを落とした）。実機確認にはリポジトリ外の空フォルダを使う
 */
const sampleRaw = readFileSync(
  new URL('./__fixtures__/glossary.canonical.json', import.meta.url),
  'utf8',
)

describe('serialize（正規形）', () => {
  it('Skill が書いたファイルを読み→直列化してバイト単位で不変（最重要の回帰テスト）', () => {
    expect(serialize(JSON.parse(sampleRaw), schema)).toBe(sampleRaw)
  })

  it('1フィールドの変更が該当行だけの差分になる', () => {
    const data = JSON.parse(sampleRaw) as { terms: { definition: string }[] }
    data.terms[1].definition = data.terms[1].definition + '。追記'
    const before = sampleRaw.split('\n')
    const after = serialize(data, schema).split('\n')
    expect(after.length).toBe(before.length)
    const changed = before.filter((line, i) => line !== after[i])
    expect(changed.length).toBe(1)
  })

  it('キー順が乱れた入力をスキーマの properties 記載順に並べ替える（$ref の入れ子含む）', () => {
    const scrambled = {
      terms: [
        {
          notes: '',
          aliases: [],
          definition: 'd',
          kind: 'data',
          name: 'n',
          id: 'term_AAAAAAAAAA',
        },
      ],
      title: 't',
      type: 'glossary',
      schemaVersion: 1,
    }
    const parsed = JSON.parse(serialize(scrambled, schema)) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(['schemaVersion', 'type', 'title', 'terms'])
    const term = (parsed.terms as Record<string, unknown>[])[0]
    expect(Object.keys(term)).toEqual(['id', 'name', 'kind', 'definition', 'aliases', 'notes'])
  })

  it('LF・末尾改行1つ・非ASCIIエスケープなし・空配列は1行', () => {
    const text = serialize(
      { schemaVersion: 1, type: 'glossary', title: '日本語タイトル', terms: [] },
      schema,
    )
    expect(text.includes('\r')).toBe(false)
    expect(text.endsWith('}\n')).toBe(true)
    expect(text.endsWith('}\n\n')).toBe(false)
    expect(text).toContain('"日本語タイトル"')
    expect(text).not.toContain('\\u')
    expect(text).toContain('"terms": []')
  })
})

describe('stripBom', () => {
  it('先頭の BOM を除去する（BOM なしはそのまま）', () => {
    expect(stripBom('﻿{}')).toBe('{}')
    expect(stripBom('{}')).toBe('{}')
  })
})
