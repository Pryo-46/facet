import { describe, expect, it } from 'vitest'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import { checkDecisionTableConsistency, locationField, sectionMarks } from './consistency'

function table(): DecisionTableSchemaVersion1 {
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
      { values: ['いいえ', 'いいえ'], impossible: false, results: ['500円'] },
    ],
  }
}

const rules = (data: DecisionTableSchemaVersion1): string[] =>
  checkDecisionTableConsistency(data).map((i) => i.rule)

describe('正常なデータ', () => {
  it('指摘が出ない', () => {
    expect(checkDecisionTableConsistency(table())).toEqual([])
  })

  it('空の表でも指摘が出ない', () => {
    expect(
      checkDecisionTableConsistency({
        schemaVersion: 1,
        type: 'decisionTable',
        title: '新しい表',
        conditions: [],
        outcomes: [],
        rows: [],
      }),
    ).toEqual([])
  })
})

describe('ID 重複', () => {
  it('条件の ID が重なると指摘が出る', () => {
    const data = table()
    data.conditions[1].id = data.conditions[0].id
    expect(rules(data)).toContain('duplicate-id')
  })

  it('結果の ID が重なると指摘が出る', () => {
    const data = table()
    data.outcomes.push({ ...data.outcomes[0], name: '通知' })
    data.rows = data.rows.map((r) => ({ ...r, results: [...r.results, '無料'] }))
    expect(rules(data)).toContain('duplicate-id')
  })

  it('条件と結果でプレフィクスが違うので混ざらない', () => {
    expect(rules(table())).not.toContain('duplicate-id')
  })
})

describe('名前の重複', () => {
  it('条件名が重なると指摘が出る', () => {
    const data = table()
    data.conditions[1].name = '会員か'
    expect(rules(data)).toContain('duplicate-name')
  })

  it('全角と半角・大小は同じ名前として扱う', () => {
    const data = table()
    data.conditions[0].name = 'VIP'
    data.conditions[1].name = 'ｖｉｐ'
    expect(rules(data)).toContain('duplicate-name')
  })

  it('空の名前どうしは重複にしない（未記入が2つあるだけ）', () => {
    const data = table()
    data.conditions[0].name = ''
    data.conditions[1].name = ''
    expect(rules(data)).not.toContain('duplicate-name')
  })
})

describe('ラベルの重複', () => {
  it('1つの条件の中で値が重なると指摘が出る', () => {
    const data = table()
    data.conditions[0].values = ['はい', 'はい']
    data.rows = data.rows.map((r) => ({ ...r, values: ['はい', r.values[1]] }))
    expect(rules(data)).toContain('duplicate-value')
  })

  it('条件をまたいだ同じ値は重複にしない', () => {
    expect(rules(table())).not.toContain('duplicate-value')
  })

  it('1つの結果の中で選択肢が重なると指摘が出る', () => {
    const data = table()
    data.outcomes[0].choices = ['無料', '無料']
    expect(rules(data)).toContain('duplicate-choice')
  })

  it('空のラベルどうしは重複にしない', () => {
    const data = table()
    data.outcomes[0].choices = ['', '']
    data.rows = data.rows.map((r) => ({ ...r, results: [''] }))
    expect(rules(data)).not.toContain('duplicate-choice')
  })
})

describe('長さの不一致', () => {
  it('values が条件の本数と違うと指摘が出る', () => {
    const data = table()
    data.rows[0].values = ['はい']
    expect(rules(data)).toContain('row-length')
  })

  it('results が結果の本数と違うと指摘が出る', () => {
    const data = table()
    data.rows[0].results = []
    expect(rules(data)).toContain('row-length')
  })
})

describe('未知の値', () => {
  it('条件に無い値を持つ行に指摘が出る', () => {
    const data = table()
    data.rows[0].values = ['不明', 'はい']
    expect(rules(data)).toContain('unknown-value')
  })

  it('選択肢に無い結果を持つ行に指摘が出る', () => {
    const data = table()
    data.rows[0].results = ['300円']
    expect(rules(data)).toContain('unknown-value')
  })

  it('空文字は未知の値にしない（未記入である）', () => {
    const data = table()
    data.rows[0].results = ['']
    expect(rules(data)).not.toContain('unknown-value')
  })
})

describe('直積との不一致', () => {
  it('行が足りないと指摘が出る', () => {
    const data = table()
    data.rows = data.rows.slice(0, 3)
    expect(rules(data)).toContain('row-set')
  })

  it('行が余ると指摘が出る', () => {
    const data = table()
    data.rows = [...data.rows, data.rows[0]]
    expect(rules(data)).toContain('row-set')
  })

  it('順序が違うと指摘が出る', () => {
    const data = table()
    data.rows = [data.rows[1], data.rows[0], data.rows[2], data.rows[3]]
    expect(rules(data)).toContain('row-set')
  })

  it('直積どおりなら指摘が出ない', () => {
    expect(rules(table())).not.toContain('row-set')
  })
})

describe('指摘の引き直し', () => {
  it('区画ごとに分かれ、条件の赤が行へ漏れない', () => {
    const data = table()
    data.conditions[1].name = '会員か'
    const issues = checkDecisionTableConsistency(data)
    expect(sectionMarks(issues, 'condition').get(1)?.has('name')).toBe(true)
    expect(sectionMarks(issues, 'row').get(1)).toBeUndefined()
  })

  it('区画の接頭辞を付けた文字列を返す', () => {
    expect(locationField('row', 'result:2')).toBe('row:result:2')
  })
})
