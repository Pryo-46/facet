import { describe, expect, it } from 'vitest'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import {
  addChoice,
  addValue,
  newCondition,
  newOutcome,
  removeChoice,
  removeValue,
  renameChoice,
  renameCondition,
  renameValue,
  setConditions,
  setOutcomes,
  setResult,
  toggleImpossible,
} from './commands'

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

describe('採番', () => {
  it('新しい条件は名前も値も空の2値から始まる', () => {
    const c = newCondition()
    expect(c.id).toMatch(/^cond_[A-Za-z0-9]{10}$/)
    expect(c.name).toBe('')
    expect(c.values).toEqual(['', ''])
  })

  it('新しい結果は名前も選択肢も空から始まる', () => {
    const o = newOutcome()
    expect(o.id).toMatch(/^out_[A-Za-z0-9]{10}$/)
    expect(o.name).toBe('')
    expect(o.choices).toEqual([])
  })
})

describe('条件の増減', () => {
  it('条件を足すと行が倍になり、既存の結果が複製される', () => {
    const data = table()
    const added = { id: 'cond_Aaaaaaaaa3', name: '', values: ['はい', 'いいえ'] }
    const out = setConditions(data, [...data.conditions, added])
    expect(out.data.rows).toHaveLength(8)
    expect(out.data.rows[0].results).toEqual(['無料'])
    expect(out.data.rows[1].results).toEqual(['無料'])
    expect(out.lostCells).toBe(0)
  })

  it('条件を消すと食い違った結果が空欄に落ちる', () => {
    const data = table()
    const out = setConditions(data, [data.conditions[1]])
    expect(out.data.rows.map((r) => r.results[0])).toEqual(['無料', ''])
    expect(out.clearedCells).toBe(1)
    expect(out.lostCells).toBe(2)
  })

  it('条件名を変えても行は変わらない', () => {
    const data = table()
    const out = renameCondition(data, 0, '会員ランクが上位か')
    expect(out.data.conditions[0].name).toBe('会員ランクが上位か')
    expect(out.data.rows).toEqual(data.rows)
    expect(out.lostCells).toBe(0)
  })
})

describe('値の増減', () => {
  it('値を足すと行が増え、新しい値の行だけ空から始まる', () => {
    const out = addValue(table(), 0)
    expect(out.data.conditions[0].values).toEqual(['はい', 'いいえ', ''])
    expect(out.data.rows).toHaveLength(6)
    expect(out.data.rows[4].values).toEqual(['', 'はい'])
    expect(out.data.rows[4].results).toEqual([''])
    expect(out.lostCells).toBe(0)
  })

  it('値を消すとその値の行が消える', () => {
    const out = removeValue(table(), 0, 1)
    expect(out.data.conditions[0].values).toEqual(['はい'])
    expect(out.data.rows).toEqual([
      { values: ['はい', 'はい'], impossible: false, results: ['無料'] },
      { values: ['はい', 'いいえ'], impossible: false, results: ['無料'] },
    ])
    expect(out.lostCells).toBe(2)
  })

  it('最後の値は消せない（消すと行が全滅する）', () => {
    const data = removeValue(table(), 0, 1).data
    const out = removeValue(data, 0, 0)
    expect(out.data).toEqual(data)
    expect(out.lostCells).toBe(0)
  })

  it('値の名前を変えると全行のラベルが書き変わる', () => {
    const out = renameValue(table(), 0, 0, '会員')
    expect(out.data.conditions[0].values).toEqual(['会員', 'いいえ'])
    expect(out.data.rows.map((r) => r.values[0])).toEqual(['会員', '会員', 'いいえ', 'いいえ'])
    expect(out.data.rows.map((r) => r.results[0])).toEqual(['無料', '無料', '無料', '500円'])
    expect(out.lostCells).toBe(0)
  })
})

describe('結果の増減', () => {
  it('結果を足すと列が空で増える', () => {
    const data = table()
    const out = setOutcomes(data, [...data.outcomes, { id: 'out_Aaaaaaaaa2', name: '', choices: [] }])
    expect(out.data.rows.map((r) => r.results)).toEqual([
      ['無料', ''],
      ['無料', ''],
      ['無料', ''],
      ['500円', ''],
    ])
    expect(out.lostCells).toBe(0)
  })

  it('結果を消すとその列の記入済みが失われる', () => {
    const out = setOutcomes(table(), [])
    expect(out.data.rows.map((r) => r.results)).toEqual([[], [], [], []])
    expect(out.lostCells).toBe(4)
  })

  it('選択肢を足しても行は変わらない', () => {
    const data = table()
    const out = addChoice(data, 0)
    expect(out.data.outcomes[0].choices).toEqual(['無料', '500円', ''])
    expect(out.data.rows).toEqual(data.rows)
    expect(out.lostCells).toBe(0)
  })

  it('選択肢を消すと、その選択肢を選んでいた行が空欄に戻る', () => {
    const out = removeChoice(table(), 0, 0)
    expect(out.data.outcomes[0].choices).toEqual(['500円'])
    expect(out.data.rows.map((r) => r.results[0])).toEqual(['', '', '', '500円'])
    expect(out.lostCells).toBe(3)
  })

  it('選択肢の名前を変えると、その選択肢を選んでいた行も書き変わる', () => {
    const out = renameChoice(table(), 0, 0, '送料無料')
    expect(out.data.outcomes[0].choices).toEqual(['送料無料', '500円'])
    expect(out.data.rows.map((r) => r.results[0])).toEqual([
      '送料無料',
      '送料無料',
      '送料無料',
      '500円',
    ])
    expect(out.lostCells).toBe(0)
  })
})

describe('表本体', () => {
  it('結果を書き込んでも他の行は変わらない', () => {
    const data = table()
    const next = setResult(data, 3, 0, '無料')
    expect(next.rows[3].results).toEqual(['無料'])
    expect(next.rows[0]).toEqual(data.rows[0])
  })

  it('起こりえないは入り切りする', () => {
    const data = table()
    const on = toggleImpossible(data, 1)
    expect(on.rows[1].impossible).toBe(true)
    expect(toggleImpossible(on, 1).rows[1].impossible).toBe(false)
  })

  it('起こりえないにしても結果の値は消さない（戻せば元に戻る）', () => {
    const on = toggleImpossible(table(), 0)
    expect(on.rows[0].results).toEqual(['無料'])
  })
})
