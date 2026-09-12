import { describe, expect, it } from 'vitest'
import type { Condition, Outcome, Row } from '@/types/decision-table'
import {
  EMPTY_FILTER,
  clearFilterValue,
  filterRowIndices,
  isFiltered,
  outcomeFilterLabels,
  toggleFilterValue,
} from './filter'

const conditions: Condition[] = [
  { id: 'cond_a', name: '会員か', values: ['はい', 'いいえ'] },
  { id: 'cond_b', name: '5000円以上か', values: ['はい', 'いいえ'] },
]
const outcomes: Outcome[] = [{ id: 'out_a', name: '送料', choices: ['無料', '500円'] }]
const rows: Row[] = [
  { values: ['はい', 'はい'], impossible: false, results: ['無料'] },
  { values: ['はい', 'いいえ'], impossible: false, results: [''] },
  { values: ['いいえ', 'はい'], impossible: true, results: ['無料'] },
  { values: ['いいえ', 'いいえ'], impossible: false, results: ['500円'] },
]

describe('isFiltered', () => {
  it('触っていない絞り込みは掛かっていない', () => {
    expect(isFiltered(EMPTY_FILTER)).toBe(false)
  })

  it('起こりえないを隠すだけでも掛かっている', () => {
    expect(isFiltered({ ...EMPTY_FILTER, showImpossible: false })).toBe(true)
  })
})

describe('filterRowIndices', () => {
  it('絞り込みが無ければ全行を配列順で返す', () => {
    expect(filterRowIndices(conditions, outcomes, rows, EMPTY_FILTER)).toEqual([0, 1, 2, 3])
  })

  it('1つの列の中は OR で効く', () => {
    const filter = { values: { cond_a: ['はい'] }, showImpossible: true }
    expect(filterRowIndices(conditions, outcomes, rows, filter)).toEqual([0, 1])
  })

  it('列どうしは AND で効く', () => {
    const filter = { values: { cond_a: ['はい'], cond_b: ['いいえ'] }, showImpossible: true }
    expect(filterRowIndices(conditions, outcomes, rows, filter)).toEqual([1])
  })

  it('結果列は空文字を未記入として絞り込める', () => {
    const filter = { values: { out_a: [''] }, showImpossible: true }
    expect(filterRowIndices(conditions, outcomes, rows, filter)).toEqual([1])
  })

  it('起こりえないを隠すと、その行だけが落ちる', () => {
    const filter = { values: {}, showImpossible: false }
    expect(filterRowIndices(conditions, outcomes, rows, filter)).toEqual([0, 1, 3])
  })

  it('消えた列の絞り込みは残っていても効かない', () => {
    // 条件を消しても絞り込みの鍵は残る。残った鍵が行を隠すと、
    // 画面から消えた列のせいで行が出ない状態になり、原因を追えない
    const filter = { values: { cond_gone: ['はい'] }, showImpossible: true }
    expect(filterRowIndices(conditions, outcomes, rows, filter)).toEqual([0, 1, 2, 3])
  })
})

describe('toggleFilterValue', () => {
  it('触っていない列で1つ外すと、残りを選んだ形になる', () => {
    const next = toggleFilterValue(EMPTY_FILTER, 'cond_a', 'はい', ['はい', 'いいえ'])
    expect(next.values.cond_a).toEqual(['いいえ'])
  })

  it('全部選び直すと絞り込みが外れる', () => {
    const one = toggleFilterValue(EMPTY_FILTER, 'cond_a', 'はい', ['はい', 'いいえ'])
    const back = toggleFilterValue(one, 'cond_a', 'はい', ['はい', 'いいえ'])
    expect(back.values.cond_a).toBeUndefined()
    expect(isFiltered(back)).toBe(false)
  })

  it('最後の1つを外すと空集合になり、行が1本も出ない', () => {
    const one = toggleFilterValue(EMPTY_FILTER, 'cond_a', 'はい', ['はい', 'いいえ'])
    const none = toggleFilterValue(one, 'cond_a', 'いいえ', ['はい', 'いいえ'])
    expect(none.values.cond_a).toEqual([])
    expect(filterRowIndices(conditions, outcomes, rows, none)).toEqual([])
  })

  it('並びは渡した一覧の順に保つ', () => {
    // 一覧の順が入れ替わると、メニューのチェックの並びが押すたびに変わる
    const one = toggleFilterValue(EMPTY_FILTER, 'cond_a', 'はい', ['はい', 'いいえ'])
    const two = toggleFilterValue(one, 'cond_a', 'はい', ['はい', 'いいえ'])
    expect(two.values.cond_a).toBeUndefined()
    const three = toggleFilterValue(EMPTY_FILTER, 'cond_a', 'いいえ', ['はい', 'いいえ'])
    expect(three.values.cond_a).toEqual(['はい'])
  })
})

describe('clearFilterValue', () => {
  it('1つの列の絞り込みだけを外す', () => {
    const filter = { values: { cond_a: ['はい'], cond_b: ['はい'] }, showImpossible: true }
    const next = clearFilterValue(filter, 'cond_a')
    expect(next.values.cond_a).toBeUndefined()
    expect(next.values.cond_b).toEqual(['はい'])
  })
})

describe('outcomeFilterLabels', () => {
  it('未記入を先頭に置き、選択肢を配列順で続ける', () => {
    expect(outcomeFilterLabels(outcomes[0])).toEqual(['', '無料', '500円'])
  })
})
