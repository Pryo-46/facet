import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { JsonSchema } from './canonical'
import { createSchemaValidator } from './schema-validation'

const schema = JSON.parse(
  readFileSync(new URL('../../schemas/glossary.schema.json', import.meta.url), 'utf8'),
) as JsonSchema

const validate = createSchemaValidator(schema)

// fixture は動作確認の遊び場ではなく、回帰テストに必須のファイル
const validData = JSON.parse(
  readFileSync(new URL('./__fixtures__/glossary.canonical.json', import.meta.url), 'utf8'),
) as Record<string, unknown>

function withTermPatch(patch: Record<string, unknown>, remove?: string) {
  const clone = structuredClone(validData) as { terms: Record<string, unknown>[] }
  Object.assign(clone.terms[0], patch)
  if (remove) delete clone.terms[0][remove]
  return clone
}

describe('createSchemaValidator', () => {
  it('Skill 生成のサンプルは合格する', () => {
    expect(validate(validData).ok).toBe(true)
  })

  it('必須キー欠落（notes なし）は不合格になり、理由が読める', () => {
    const result = validate(withTermPatch({}, 'notes'))
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('notes')
  })

  it('ID 規約違反（パターン不一致）は不合格', () => {
    expect(validate(withTermPatch({ id: 'term_abc' })).ok).toBe(false)
  })

  it('enum 外の kind は不合格', () => {
    expect(validate(withTermPatch({ kind: 'unknown-kind' })).ok).toBe(false)
  })

  it('未知キー（additionalProperties）は不合格', () => {
    expect(validate(withTermPatch({ tags: [] })).ok).toBe(false)
  })

  it('name の空文字（minLength: 1）は不合格', () => {
    expect(validate(withTermPatch({ name: '' })).ok).toBe(false)
  })
})
