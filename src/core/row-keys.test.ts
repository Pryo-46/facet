import { describe, expect, it } from 'vitest'
import { computeRowKeys } from './row-keys'

describe('computeRowKeys', () => {
  it('ID が一意なら ID 由来の安定したキーになる', () => {
    expect(computeRowKeys([{ id: 'term_a' }, { id: 'term_b' }])).toEqual([
      'term_a#0',
      'term_b#0',
    ])
  })

  it('ID が重複していても一意なキーになる（重複キーで描画が壊れない）', () => {
    const keys = computeRowKeys([{ id: 'term_a' }, { id: 'term_a' }, { id: 'term_b' }])
    expect(keys).toEqual(['term_a#0', 'term_a#1', 'term_b#0'])
    expect(new Set(keys).size).toBe(3)
  })

  it('他の行を並び替えてもキーは変わらない（行の同一性が保てる）', () => {
    const before = computeRowKeys([{ id: 'term_a' }, { id: 'term_b' }, { id: 'term_c' }])
    const after = computeRowKeys([{ id: 'term_b' }, { id: 'term_a' }, { id: 'term_c' }])
    expect(after).toEqual([before[1], before[0], before[2]])
  })
})
