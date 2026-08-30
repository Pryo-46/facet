import { describe, expect, it } from 'vitest'
import type { JsonSchema } from '@/core/canonical'
import { createSchemaValidator } from '@/core/schema-validation'
import issueTreeSchema from '../../../schemas/issue-tree.schema.json'
import { migrateIssueTree } from './migrate'

const validate = createSchemaValidator(issueTreeSchema as JsonSchema)

/** v2 の形（title/detail/value も asks も feedbacks も date も無い） */
const v2 = {
  schemaVersion: 2,
  type: 'issueTree',
  title: '旧版',
  issues: [{ id: 'issue_AAAAAAAAAA', parentId: null, text: '根', events: [] }],
  hypotheses: [
    {
      id: 'hypothesis_AAAAAAAAAA',
      issueId: 'issue_AAAAAAAAAA',
      text: '仮説',
      rationale: '由来',
      events: [{ kind: 'rejected', note: '一度棄却' }],
      pendingNotes: ['SH の指摘'],
    },
  ],
}

describe('migrateIssueTree', () => {
  it('2 → 3 は schemaVersion だけを書き換え、他のキーと配列順を保つ', () => {
    const out = migrateIssueTree(v2, 2)
    expect(out.schemaVersion).toBe(3)
    expect({ ...out, schemaVersion: 2 }).toEqual(v2)
  })

  it('1 → 3 も同じ（間の版を経由しない）', () => {
    const v1 = { ...v2, schemaVersion: 1 }
    expect(migrateIssueTree(v1, 1).schemaVersion).toBe(3)
  })

  it('現行版（3）を渡しても同じ内容が返る（冪等）', () => {
    const once = migrateIssueTree(v2, 2)
    expect(migrateIssueTree(once, 3)).toEqual(once)
  })

  it('入力を破壊しない', () => {
    const before = JSON.stringify(v2)
    migrateIssueTree(v2, 2)
    expect(JSON.stringify(v2)).toBe(before)
  })

  /**
   * **移行しないと決めた（2026-08-30 のユーザー判断）ことの実効を、ここで固定する。**
   * 版番号だけが上がった v2 のファイルはスキーマ検証で落ちる＝アプリは開けない。
   * この it が緑であるかぎり、「気を利かせて値を動かす変換」が後から入っても
   * ここが赤くなって気づける
   */
  it('移行しても v2 の形はスキーマ検証を通らない（＝開けない。互換の変換は用意しない）', () => {
    const out = migrateIssueTree(v2, 2)
    expect(validate(out).ok).toBe(false)
  })
})
