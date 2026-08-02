import { describe, expect, it } from 'vitest'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import { checkGlossaryConsistency } from './consistency'

function term(over: Partial<Term> & { id: string; name: string }): Term {
  return { kind: 'other', definition: '定義あり', aliases: [], notes: '', ...over }
}

function glossary(terms: Term[]): GlossarySchemaVersion1 {
  return { schemaVersion: 1, type: 'glossary', title: 'テスト用語集', terms }
}

describe('checkGlossaryConsistency', () => {
  it('問題のないデータは issue なし', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: ['オーダー'] }),
      term({ id: 'term_bbbbbbbbbb', name: '発注' }),
    ])
    expect(checkGlossaryConsistency(data)).toEqual([])
  })

  it('ID 重複を検出する（行全体の赤表示として field は id）', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '受注' }),
      term({ id: 'term_aaaaaaaaaa', name: '発注' }),
    ])
    const issues = checkGlossaryConsistency(data)
    expect(issues).toHaveLength(1)
    expect(issues[0].rule).toBe('duplicate-id')
    expect(issues[0].locations).toEqual([
      { entityId: 'term_aaaaaaaaaa', entityIndex: 0, field: 'id' },
      { entityId: 'term_aaaaaaaaaa', entityIndex: 1, field: 'id' },
    ])
  })

  it('name 重複を NFKC＋大文字小文字同一視で検出する', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: 'API連携' }),
      term({ id: 'term_bbbbbbbbbb', name: 'ＡＰＩ連携' }),
    ])
    const issues = checkGlossaryConsistency(data)
    expect(issues).toHaveLength(1)
    expect(issues[0].rule).toBe('duplicate-name')
    expect(issues[0].locations).toEqual([
      { entityId: 'term_aaaaaaaaaa', entityIndex: 0, field: 'name' },
      { entityId: 'term_bbbbbbbbbb', entityIndex: 1, field: 'name' },
    ])
  })

  it('前後の空白違いは name 重複として検出する（スペースですり抜けられない）', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '受注' }),
      term({ id: 'term_bbbbbbbbbb', name: '受注 ' }),
    ])
    const issues = checkGlossaryConsistency(data)
    expect(issues).toHaveLength(1)
    expect(issues[0].rule).toBe('duplicate-name')
  })

  it('前後の空白違いは alias 重複としても検出する', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '案件', aliases: ['取引'] }),
      term({ id: 'term_bbbbbbbbbb', name: '商談', aliases: ['　取引'] }),
    ])
    const issues = checkGlossaryConsistency(data)
    expect(issues).toHaveLength(1)
    expect(issues[0].rule).toBe('duplicate-alias')
  })

  it('表記が完全一致しない name は重複にしない', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '受注' }),
      term({ id: 'term_bbbbbbbbbb', name: '受注データ' }),
    ])
    expect(checkGlossaryConsistency(data)).toEqual([])
  })

  it('同一用語内の alias 重複を検出する', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '顧客', aliases: ['クライアント', 'クライアント'] }),
    ])
    const issues = checkGlossaryConsistency(data)
    expect(issues).toHaveLength(1)
    expect(issues[0].rule).toBe('duplicate-alias')
    expect(issues[0].locations).toEqual([
      { entityId: 'term_aaaaaaaaaa', entityIndex: 0, field: 'aliases' },
    ])
  })

  it('用語間の alias 重複を検出する', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '案件', aliases: ['取引'] }),
      term({ id: 'term_bbbbbbbbbb', name: '商談', aliases: ['取引'] }),
    ])
    const issues = checkGlossaryConsistency(data)
    expect(issues).toHaveLength(1)
    expect(issues[0].rule).toBe('duplicate-alias')
    expect(issues[0].locations).toEqual([
      { entityId: 'term_aaaaaaaaaa', entityIndex: 0, field: 'aliases' },
      { entityId: 'term_bbbbbbbbbb', entityIndex: 1, field: 'aliases' },
    ])
  })

  it('alias と他用語の name の衝突を検出する（両側の箇所を指す）', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '受注' }),
      term({ id: 'term_bbbbbbbbbb', name: '見積', aliases: ['受注'] }),
    ])
    const issues = checkGlossaryConsistency(data)
    expect(issues).toHaveLength(1)
    expect(issues[0].rule).toBe('alias-name-collision')
    expect(issues[0].locations).toEqual([
      { entityId: 'term_bbbbbbbbbb', entityIndex: 1, field: 'aliases' },
      { entityId: 'term_aaaaaaaaaa', entityIndex: 0, field: 'name' },
    ])
  })

  it('自用語の name と同じ alias は衝突にしない', () => {
    const data = glossary([term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: ['受注'] })])
    expect(checkGlossaryConsistency(data)).toEqual([])
  })

  it('複数種類の問題は全部まとめて返す', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '受注' }),
      term({ id: 'term_aaaaaaaaaa', name: '受注' }),
    ])
    const rules = checkGlossaryConsistency(data).map((i) => i.rule)
    expect(rules).toContain('duplicate-id')
    expect(rules).toContain('duplicate-name')
  })

  it('ID が重複していても name 重複は該当の行だけを指す', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '受注' }),
      term({ id: 'term_aaaaaaaaaa', name: '見積' }),
      term({ id: 'term_bbbbbbbbbb', name: '見積' }),
    ])
    const nameIssue = checkGlossaryConsistency(data).find((i) => i.rule === 'duplicate-name')
    expect(nameIssue?.locations).toEqual([
      { entityId: 'term_aaaaaaaaaa', entityIndex: 1, field: 'name' },
      { entityId: 'term_bbbbbbbbbb', entityIndex: 2, field: 'name' },
    ])
  })
})
