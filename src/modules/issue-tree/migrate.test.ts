import { describe, expect, it } from 'vitest'
import { migrateIssueTree } from './migrate'

const v1 = {
  schemaVersion: 1,
  type: 'issueTree',
  title: '旧版',
  issues: [{ id: 'issue_AAAAAAAAAA', parentId: null, text: '根', events: [] }],
  hypotheses: [
    {
      id: 'hypothesis_AAAAAAAAAA',
      issueId: 'issue_AAAAAAAAAA',
      text: '仮説',
      rationale: '',
      events: [{ kind: 'rejected', note: '一度棄却' }],
      pendingNotes: ['SH の指摘'],
    },
  ],
}

describe('migrateIssueTree', () => {
  it('1 → 2 は schemaVersion だけを書き換え、他のキーと配列順を保つ', () => {
    const out = migrateIssueTree(v1, 1)
    expect(out.schemaVersion).toBe(2)
    expect({ ...out, schemaVersion: 1 }).toEqual(v1)
  })

  it('現行版（2）を渡しても同じ内容が返る（冪等）', () => {
    const once = migrateIssueTree(v1, 1)
    expect(migrateIssueTree(once, 2)).toEqual(once)
  })

  it('入力を破壊しない', () => {
    const before = JSON.stringify(v1)
    migrateIssueTree(v1, 1)
    expect(JSON.stringify(v1)).toBe(before)
  })
})
