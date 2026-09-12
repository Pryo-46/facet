import { describe, expect, it } from 'vitest'
import { tallyLine } from '@/core/missing-tally'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import { isMissingLabel, isMissingResult, tallyMissing } from './missing'

function table(): DecisionTableSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'decisionTable',
    title: '送料の決定',
    conditions: [{ id: 'cond_Aaaaaaaaa1', name: '会員か', values: ['はい', 'いいえ'] }],
    outcomes: [{ id: 'out_Aaaaaaaaa1', name: '送料', choices: ['無料', '500円'] }],
    rows: [
      { values: ['はい'], impossible: false, results: ['無料'] },
      { values: ['いいえ'], impossible: false, results: [''] },
    ],
  }
}

describe('結果セルの欠落', () => {
  it('空の結果セルは欠落', () => {
    expect(isMissingResult(table().rows[1], 0)).toBe(true)
  })

  it('埋まった結果セルは欠落ではない', () => {
    expect(isMissingResult(table().rows[0], 0)).toBe(false)
  })

  it('起こりえない行の空セルは欠落ではない（決めた上で該当なし）', () => {
    const row = { ...table().rows[1], impossible: true }
    expect(isMissingResult(row, 0)).toBe(false)
  })

  it('結果の本数より results が短くても空として扱う', () => {
    expect(isMissingResult({ values: [], impossible: false, results: [] }, 0)).toBe(true)
  })
})

describe('名前の欠落', () => {
  it('空の文字列は欠落', () => {
    expect(isMissingLabel('')).toBe(true)
    expect(isMissingLabel('会員か')).toBe(false)
  })
})

describe('集計', () => {
  it('埋まっていれば要対応0', () => {
    const data = table()
    data.rows[1].results = ['500円']
    expect(tallyMissing(data)).toEqual({ total: 0, parts: [] })
  })

  it('結果セルの空を未記入として数える', () => {
    expect(tallyMissing(table())).toEqual({
      total: 1,
      parts: [{ kind: 'result', label: '未記入', count: 1, variant: 'open' }],
    })
  })

  it('条件名・値・結果名・選択肢の空を名前なしとして数える', () => {
    const data = table()
    data.conditions[0].name = ''
    data.conditions[0].values = ['', 'いいえ']
    data.outcomes[0].name = ''
    data.outcomes[0].choices = ['無料', '']
    const tally = tallyMissing(data)
    expect(tally.parts.find((p) => p.kind === 'label')).toEqual({
      kind: 'label',
      label: '名前なし',
      count: 4,
      variant: 'open',
    })
  })

  it('起こりえない行は結果の数に入らない', () => {
    const data = table()
    data.rows[1].impossible = true
    expect(tallyMissing(data).total).toBe(0)
  })

  it('集計の1行はコアの組み立てと同じ形になる', () => {
    expect(tallyLine(tallyMissing(table()))).toBe('⚠ 要対応 1（未記入 1）')
  })
})
