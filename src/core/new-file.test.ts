import { describe, expect, it } from 'vitest'
import { serialize } from './canonical'
import { buildNewFile } from './new-file'
import { createSchemaValidator } from './schema-validation'
import { glossaryModule } from '@/modules/glossary/module'

describe('buildNewFile', () => {
  it('衝突が無ければ displayName をそのままファイル名にする', () => {
    expect(buildNewFile(glossaryModule, []).name).toBe('用語集.json')
  })

  it('title は拡張子を除いたファイル名と一致する', () => {
    const file = buildNewFile(glossaryModule, ['用語集.json'])
    expect(file.name).toBe('用語集-2.json')
    expect((file.data as { title: string }).title).toBe('用語集-2')
  })

  it('作ったテキストはスキーマ検証を通る（＝作った直後に開ける）', () => {
    const file = buildNewFile(glossaryModule, [])
    const validate = createSchemaValidator(glossaryModule.schema)
    expect(validate(JSON.parse(file.text))).toEqual({ ok: true, errors: [] })
  })

  it('作ったテキストは正規形（読み直して書き直してもバイト一致）', () => {
    const file = buildNewFile(glossaryModule, [])
    expect(serialize(JSON.parse(file.text), glossaryModule.schema)).toBe(file.text)
  })

  it('キー順はスキーマの properties 記載順・インデント2・末尾改行あり', () => {
    expect(buildNewFile(glossaryModule, []).text).toBe(
      '{\n  "schemaVersion": 1,\n  "type": "glossary",\n  "title": "用語集",\n  "terms": []\n}\n',
    )
  })
})
