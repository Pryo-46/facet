import { describe, expect, it } from 'vitest'
import { serialize, type JsonSchema } from '@/core/canonical'
import { createSchemaValidator } from '@/core/schema-validation'
import errorCatalogSchema from '../../../schemas/error-catalog.schema.json'

const validate = createSchemaValidator(errorCatalogSchema as JsonSchema)

function entry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'error_AAAAAAAAAA',
    name: 'ログインできない',
    occurrence: 'ログイン画面で送信したとき',
    resolutionLevel: 'user',
    causeForSupport: 'パスワードの入力誤り',
    causeForSpec: '認証 API が 401 を返す',
    userAction: 'パスワードを入れ直す',
    supportAction: '',
    engineerAction: '',
    notes: '',
    ...over,
  }
}

function doc(errors: unknown[] = [entry()]): Record<string, unknown> {
  return { schemaVersion: 1, type: 'errorCatalog', title: 'エラーカタログ', errors }
}

describe('error-catalog.schema.json', () => {
  it('全キーが埋まった1件を受け入れる', () => {
    expect(validate(doc()).ok).toBe(true)
  })

  it('errors が空でも受け入れる（新規作成直後の状態）', () => {
    expect(validate(doc([])).ok).toBe(true)
  })

  it('id は error_ ＋ 英数字10文字（他ツールのプレフィクスや桁足らずを拒む）', () => {
    expect(validate(doc([entry({ id: 'term_AAAAAAAAAA' })])).ok).toBe(false)
    expect(validate(doc([entry({ id: 'error_AAAAAAAAA' })])).ok).toBe(false)
    expect(validate(doc([entry({ id: 'error_AAAAAAAAAAA' })])).ok).toBe(false)
  })

  it('name の空文字を拒む（名前のないエラーは引けない）', () => {
    expect(validate(doc([entry({ name: '' })])).ok).toBe(false)
  })

  it('name 以外の散文フィールドは空文字を許す（未記入を欠損ではなく空で表す）', () => {
    const empty = entry({
      occurrence: '',
      causeForSupport: '',
      causeForSpec: '',
      userAction: '',
      supportAction: '',
      engineerAction: '',
      notes: '',
    })
    expect(validate(doc([empty])).ok).toBe(true)
  })

  it('resolutionLevel は5値の enum', () => {
    for (const level of ['user', 'support', 'engineer', 'none', 'undecided']) {
      expect(validate(doc([entry({ resolutionLevel: level })])).ok, level).toBe(true)
    }
    expect(validate(doc([entry({ resolutionLevel: 'other' })])).ok).toBe(false)
  })

  it('キーの欠損を拒む（全キー常在）', () => {
    const missing = entry()
    delete missing.notes
    expect(validate(doc([missing])).ok).toBe(false)
  })

  it('未知のキーを拒む（エンベロープ・エントリの両方）', () => {
    expect(validate(doc([entry({ severity: 'high' })])).ok).toBe(false)
    expect(validate({ ...doc(), extra: 1 }).ok).toBe(false)
  })

  it('type は errorCatalog 固定', () => {
    expect(validate({ ...doc(), type: 'glossary' }).ok).toBe(false)
  })

  it('正規形のキー順はスキーマの properties 記載順になる', () => {
    const shuffled = { errors: [], title: 'T', type: 'errorCatalog', schemaVersion: 1 }
    expect(serialize(shuffled, errorCatalogSchema as JsonSchema)).toBe(
      '{\n  "schemaVersion": 1,\n  "type": "errorCatalog",\n  "title": "T",\n  "errors": []\n}\n',
    )
  })
})
