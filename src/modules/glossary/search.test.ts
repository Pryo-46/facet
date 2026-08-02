import { describe, expect, it } from 'vitest'
import type { Term } from '@/types/glossary'
import { EMPTY_FILTER, filterTermIndices, isDerivedView } from './search'

function term(over: Partial<Term> & { id: string; name: string }): Term {
  return { kind: 'other', definition: '', aliases: [], notes: '', ...over }
}

const terms: Term[] = [
  term({ id: 'term_a', name: '受注', kind: 'event', definition: '注文を受けること', aliases: ['オーダー'] }),
  term({ id: 'term_b', name: '見積', kind: 'data', definition: '', aliases: ['ＥＳＴ'] }),
  term({ id: 'term_c', name: '担当者', kind: 'actor', definition: '案件を持つ人', aliases: [] }),
]

describe('filterTermIndices', () => {
  it('絞り込み無しなら全件を配列順で返す', () => {
    expect(filterTermIndices(terms, EMPTY_FILTER)).toEqual([0, 1, 2])
  })

  it('name を部分一致で絞る', () => {
    expect(filterTermIndices(terms, { query: '受', kinds: [] })).toEqual([0])
  })

  it('definition も横断して絞る', () => {
    expect(filterTermIndices(terms, { query: '案件', kinds: [] })).toEqual([2])
  })

  it('aliases も横断して絞る', () => {
    expect(filterTermIndices(terms, { query: 'オーダー', kinds: [] })).toEqual([0])
  })

  it('照合は重複判定と同じ正規化を使う（NFKC＋大文字小文字＋前後空白）', () => {
    expect(filterTermIndices(terms, { query: 'est', kinds: [] })).toEqual([1])
    expect(filterTermIndices(terms, { query: '  受注  ', kinds: [] })).toEqual([0])
  })

  it('種別フィルタで絞る（複数選択は OR）', () => {
    expect(filterTermIndices(terms, { query: '', kinds: ['actor'] })).toEqual([2])
    expect(filterTermIndices(terms, { query: '', kinds: ['actor', 'data'] })).toEqual([1, 2])
  })

  it('検索と種別フィルタは AND', () => {
    expect(filterTermIndices(terms, { query: '受', kinds: ['actor'] })).toEqual([])
  })

  it('notes は検索対象外（検知対象外の自由メモ。session-notes 論点2）', () => {
    const withNotes = [term({ id: 'term_x', name: '請求', notes: 'あとで確認' })]
    expect(filterTermIndices(withNotes, { query: 'あとで', kinds: [] })).toEqual([])
  })
})

describe('isDerivedView', () => {
  it('絞り込みが無ければ導出表示ではない（並び替えできる）', () => {
    expect(isDerivedView(EMPTY_FILTER)).toBe(false)
    expect(isDerivedView({ query: '   ', kinds: [] })).toBe(false)
  })

  it('検索文字列か種別フィルタがあれば導出表示（並び替えを止める）', () => {
    expect(isDerivedView({ query: '受', kinds: [] })).toBe(true)
    expect(isDerivedView({ query: '', kinds: ['actor'] })).toBe(true)
  })
})
