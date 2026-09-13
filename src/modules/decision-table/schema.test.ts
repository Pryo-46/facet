import { describe, expect, it } from 'vitest'
import { serialize, type JsonSchema } from '@/core/canonical'
import { createSchemaValidator } from '@/core/schema-validation'
import decisionTableSchema from '../../../schemas/decision-table.schema.json'

const validate = createSchemaValidator(decisionTableSchema as JsonSchema)

/** 全フィールドが埋まった正常データ。各テストはここから1点だけ崩す */
function valid() {
  return {
    schemaVersion: 1,
    type: 'decisionTable',
    title: '送料の決定',
    conditions: [
      { id: 'cond_Aaaaaaaaa1', name: '会員か', values: ['はい', 'いいえ'] },
      { id: 'cond_Aaaaaaaaa2', name: '5000円以上か', values: ['はい', 'いいえ'] },
    ],
    outcomes: [{ id: 'out_Aaaaaaaaa1', name: '送料', choices: ['無料', '500円'] }],
    rows: [
      { values: ['はい', 'はい'], impossible: false, results: ['無料'] },
      { values: ['はい', 'いいえ'], impossible: false, results: ['無料'] },
      { values: ['いいえ', 'はい'], impossible: false, results: ['無料'] },
      { values: ['いいえ', 'いいえ'], impossible: true, results: [''] },
    ],
  }
}

describe('decisionTable スキーマ（レベル1）', () => {
  it('正常データを受け入れる', () => {
    expect(validate(valid()).ok).toBe(true)
  })

  it('空の表を受け入れる（新規作成の雛形）', () => {
    expect(
      validate({
        schemaVersion: 1,
        type: 'decisionTable',
        title: '新しい表',
        conditions: [],
        outcomes: [],
        rows: [],
      }).ok,
    ).toBe(true)
  })

  it('条件名が空でも受け入れる（空は欠落であって構造の破れではない）', () => {
    const d = valid()
    d.conditions[0].name = ''
    expect(validate(d).ok).toBe(true)
  })

  it('値ラベルの重複を受け入れる（整合性検証の担当）', () => {
    const d = valid()
    d.conditions[0].values = ['はい', 'はい']
    expect(validate(d).ok).toBe(true)
  })

  it('直積と一致しない行を受け入れる（整合性検証の担当）', () => {
    const d = valid()
    d.rows = [d.rows[0]]
    expect(validate(d).ok).toBe(true)
  })

  it('条件 ID のプレフィクス違いを拒否する', () => {
    const d = valid()
    d.conditions[0].id = 'out_Aaaaaaaaa1'
    expect(validate(d).ok).toBe(false)
  })

  it('結果 ID のプレフィクス違いを拒否する', () => {
    const d = valid()
    d.outcomes[0].id = 'cond_Aaaaaaaaa1'
    expect(validate(d).ok).toBe(false)
  })

  it('ID が11文字だと拒否する（長すぎる方向）', () => {
    const d = valid()
    d.conditions[0].id = 'cond_Aaaaaaaaa12'
    expect(validate(d).ok).toBe(false)
  })

  it('ID が9文字だと拒否する（短すぎる方向）', () => {
    const d = valid()
    d.conditions[0].id = 'cond_Aaaaaaaa1'
    expect(validate(d).ok).toBe(false)
  })

  it('schemaVersion の const 違反を拒否する', () => {
    const d = valid() as Record<string, unknown>
    d.schemaVersion = 2
    expect(validate(d).ok).toBe(false)
  })

  it('type の const 違反を拒否する', () => {
    const d = valid() as Record<string, unknown>
    d.type = 'glossary'
    expect(validate(d).ok).toBe(false)
  })

  it('impossible が無い行を拒否する（三値に開かない）', () => {
    const d = valid()
    delete (d.rows[0] as Record<string, unknown>).impossible
    expect(validate(d).ok).toBe(false)
  })

  it('impossible が文字列だと拒否する', () => {
    const d = valid()
    ;(d.rows[0] as Record<string, unknown>).impossible = 'true'
    expect(validate(d).ok).toBe(false)
  })

  it('results に文字列以外が混ざると拒否する', () => {
    const d = valid()
    ;(d.rows[0].results as unknown[])[0] = null
    expect(validate(d).ok).toBe(false)
  })

  it('トップレベルの未知キーを拒否する', () => {
    const d = valid() as Record<string, unknown>
    d.folds = []
    expect(validate(d).ok).toBe(false)
  })

  it('条件の未知キーを拒否する', () => {
    const d = valid()
    ;(d.conditions[0] as Record<string, unknown>).note = 'x'
    expect(validate(d).ok).toBe(false)
  })

  it('結果の未知キーを拒否する', () => {
    const d = valid()
    ;(d.outcomes[0] as Record<string, unknown>).color = 'red'
    expect(validate(d).ok).toBe(false)
  })

  it('行の未知キーを拒否する', () => {
    const d = valid()
    ;(d.rows[0] as Record<string, unknown>).reason = '在庫切れ'
    expect(validate(d).ok).toBe(false)
  })
})

describe('正規形', () => {
  it('キー順はスキーマの properties 記載順になる', () => {
    const shuffled = {
      rows: [],
      outcomes: [],
      conditions: [],
      title: 'T',
      type: 'decisionTable',
      schemaVersion: 1,
    }
    expect(serialize(shuffled, decisionTableSchema as JsonSchema)).toBe(
      '{\n  "schemaVersion": 1,\n  "type": "decisionTable",\n  "title": "T",\n  "conditions": [],\n  "outcomes": [],\n  "rows": []\n}\n',
    )
  })

  it('行のキー順は values・impossible・results になる', () => {
    // 保存ファイルのバイト列はこの並びで決まる。$defs.row の properties を
    // 並べ替えると、中身を1文字も変えていない全ファイルに差分が出る
    const shuffled = {
      schemaVersion: 1,
      type: 'decisionTable',
      title: 'T',
      conditions: [{ values: ['はい'], name: '会員か', id: 'cond_Aaaaaaaaa1' }],
      outcomes: [{ choices: ['無料'], name: '送料', id: 'out_Aaaaaaaaa1' }],
      rows: [{ results: ['無料'], impossible: false, values: ['はい'] }],
    }
    const text = serialize(shuffled, decisionTableSchema as JsonSchema)
    expect(text).toContain('"id": "cond_Aaaaaaaaa1",\n      "name": "会員か",\n      "values"')
    expect(text).toContain('"id": "out_Aaaaaaaaa1",\n      "name": "送料",\n      "choices"')
    expect(text).toContain('"impossible": false,\n      "results"')
  })
})
