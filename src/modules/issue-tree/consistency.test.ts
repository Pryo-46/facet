import { describe, expect, it } from 'vitest'
import type { Hypothesis, IssueTreeSchemaVersion4 } from '@/types/issue-tree'
import { checkIssueTreeConsistency } from './consistency'

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

function make(over: Partial<IssueTreeSchemaVersion4>): IssueTreeSchemaVersion4 {
  return { schemaVersion: 4, type: 'issueTree', title: 'T', issues: [], hypotheses: [], ...over }
}

/** v3 の仮説。全キー常在（date を除き空を許す） */
function hypothesis(id: string, issueId: string, title: string): Hypothesis {
  return { id, issueId, title, detail: '', value: '', asks: [], feedbacks: [], events: [] }
}

describe('checkIssueTreeConsistency', () => {
  it('健全なファイルでは何も出ない', () => {
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '根', events: [] },
        { id: I(1), parentId: I(0), text: '葉', events: [] },
      ],
      hypotheses: [hypothesis(H(1), I(1), '仮説')],
    })
    expect(checkIssueTreeConsistency(data)).toEqual([])
  })

  it('中間ノードにぶら下がる仮説は指摘しない（D1: どのノードにも付けられる）', () => {
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '根', events: [] },
        { id: I(1), parentId: I(0), text: '葉', events: [] },
      ],
      hypotheses: [hypothesis(H(1), I(0), '当たりをつける')],
    })
    expect(checkIssueTreeConsistency(data)).toEqual([])
  })

  it('課題の ID 重複を1件にまとめて指摘する', () => {
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: 'a', events: [] },
        { id: I(0), parentId: null, text: 'b', events: [] },
        { id: I(0), parentId: null, text: 'c', events: [] },
      ],
    })
    const issues = checkIssueTreeConsistency(data)
    const dup = issues.filter((i) => i.rule === 'duplicate-id')
    expect(dup).toHaveLength(1)
    expect(dup[0].message).toBe(`課題の ID が重複しています（3件）: ${I(0)}`)
    expect(dup[0].locations.map((l) => l.entityIndex)).toEqual([0, 1, 2])
  })

  it('仮説の ID 重複も指摘する（課題とは別のメッセージ）', () => {
    const h = hypothesis(H(1), I(0), '')
    const data = make({
      issues: [{ id: I(0), parentId: null, text: 'a', events: [] }],
      hypotheses: [{ ...h }, { ...h }],
    })
    const dup = checkIssueTreeConsistency(data).filter((i) => i.rule === 'duplicate-id')
    expect(dup.map((i) => i.message)).toEqual([`仮説の ID が重複しています（2件）: ${H(1)}`])
  })

  it('循環・参照切れ・多重ルートを指摘し、未記入は配列位置で呼ぶ', () => {
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '根', events: [] },
        { id: I(1), parentId: 'issue_ZZZZZZZZZZ', text: '', events: [] },
        { id: I(2), parentId: I(3), text: '循環a', events: [] },
        { id: I(3), parentId: I(2), text: '循環b', events: [] },
      ],
    })
    const byRule = new Map(checkIssueTreeConsistency(data).map((i) => [i.rule, i.message]))
    expect(byRule.get('missing-parent')).toBe('親が見つからない課題があります（1件）: （未記入・2番目）')
    expect(byRule.get('cyclic-parent')).toBe(
      '親子関係が循環している課題があります（2件。図には表示されません）: 「循環a」、「循環b」',
    )
    expect(byRule.get('multiple-root')).toBe('ルートが2件あります（1本の木にしてください）: 「根」、（未記入・2番目）')
  })

  it('ぶら下がり先が実在しない仮説を指摘する', () => {
    const data = make({
      issues: [{ id: I(0), parentId: null, text: '根', events: [] }],
      hypotheses: [hypothesis(H(1), 'issue_ZZZZZZZZZZ', '迷子')],
    })
    const found = checkIssueTreeConsistency(data).filter((i) => i.rule === 'missing-issue')
    expect(found).toHaveLength(1)
    expect(found[0].message).toBe('ぶら下がり先の課題が見つからない仮説があります（1件）: 「迷子」')
    expect(found[0].locations).toEqual([{ entityId: H(1), entityIndex: 0, field: 'issueId' }])
  })
})
