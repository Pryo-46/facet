import { describe, expect, it } from 'vitest'
import type { Term } from '@/types/glossary'
import { isMissingCell, tallyMissing } from './missing'

function term(patch: Partial<Term>): Term {
  return { id: 'term_0000000000', name: '受注', kind: 'actor', definition: '説明', aliases: [], notes: '', ...patch }
}

describe('isMissingCell', () => {
  it('定義が空は欠落、埋まっていれば欠落でない', () => {
    expect(isMissingCell(term({ definition: '' }), 'definition')).toBe(true)
    expect(isMissingCell(term({}), 'definition')).toBe(false)
  })
  it('kind の undecided は欠落、other は確定なので欠落でない', () => {
    expect(isMissingCell(term({ kind: 'undecided' }), 'kind')).toBe(true)
    expect(isMissingCell(term({ kind: 'other' }), 'kind')).toBe(false)
  })
  it('別名と備考の空は欠落でない（reading-guide: 検知対象外）', () => {
    expect(isMissingCell(term({ aliases: [] }), 'aliases')).toBe(false)
    expect(isMissingCell(term({ notes: '' }), 'notes')).toBe(false)
  })
})

describe('tallyMissing', () => {
  it('未定義と未分類を別の part で数える', () => {
    const t = tallyMissing([term({ definition: '' }), term({ kind: 'undecided', definition: '' }), term({})])
    expect(t.total).toBe(3)
    expect(t.parts).toEqual([
      { kind: 'definition', label: '未定義', count: 2, variant: 'open' },
      { kind: 'kind', label: '未分類', count: 1, variant: 'open' },
    ])
  })
  it('0 件の part は入れない', () => {
    expect(tallyMissing([term({})]).parts).toEqual([])
  })
})
