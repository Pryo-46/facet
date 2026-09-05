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

/**
 * **v3 の正しい形のうち、v4 で開けなくなるもの**——判断が2件ある仮説。
 * v3 では `events` が追記専用だったので、これは「棄却したあとに支持へ覆った」
 * 正常なファイルだった
 */
const v3WithHistory = {
  schemaVersion: 3,
  type: 'issueTree',
  title: '覆った判断を持つ v3',
  issues: [{ id: 'issue_AAAAAAAAAA', parentId: null, text: '根', events: [] }],
  hypotheses: [
    {
      id: 'hypothesis_AAAAAAAAAA',
      issueId: 'issue_AAAAAAAAAA',
      title: '仮説',
      detail: '',
      value: '',
      asks: [],
      feedbacks: [],
      events: [
        { kind: 'rejected', note: '一度棄却', date: '2026-08-01' },
        { kind: 'supported', note: '実測で覆った', date: '2026-08-30' },
      ],
    },
  ],
}

describe('migrateIssueTree', () => {
  it('2 → 4 は schemaVersion だけを書き換え、他のキーと配列順を保つ', () => {
    const out = migrateIssueTree(v2, 2)
    expect(out.schemaVersion).toBe(4)
    expect({ ...out, schemaVersion: 2 }).toEqual(v2)
  })

  it('1 → 4 も同じ（間の版を経由しない）', () => {
    const v1 = { ...v2, schemaVersion: 1 }
    expect(migrateIssueTree(v1, 1).schemaVersion).toBe(4)
  })

  it('現行版（4）を渡しても同じ内容が返る（冪等）', () => {
    const once = migrateIssueTree(v2, 2)
    expect(migrateIssueTree(once, 4)).toEqual(once)
  })

  it('入力を破壊しない', () => {
    const before = JSON.stringify(v2)
    migrateIssueTree(v2, 2)
    expect(JSON.stringify(v2)).toBe(before)
  })

  /**
   * **移行しないことの実効を、ここで固定する。**
   * 版番号だけが上がった v2 のファイルはスキーマ検証で落ちる＝アプリは開けない。
   * この it が緑であるかぎり、「気を利かせて値を動かす変換」が後から入っても
   * ここが赤くなって気づける
   */
  it('移行しても v2 の形はスキーマ検証を通らない（＝開けない。互換の変換は用意しない）', () => {
    const out = migrateIssueTree(v2, 2)
    expect(validate(out).ok).toBe(false)
  })

  /**
   * **3 → 4 にも同じ扱いを適用したことの番人。**
   *
   * `v3WithHistory` は **v3 のスキーマでは正しいファイル**である（追記専用の
   * 列に2件並んでいるだけ）。v4 は `maxItems: 1` を課したので、版だけ上がった
   * この形は検証で落ちる＝開けない。**切り詰める変換を書かない**
   * ——書くと、**どの1件を残すかをアプリが黙って決める**ことになる。
   *
   * 後から `events` を1件へ切り詰める変換が入れば、ここが `true` になって赤くなる
   */
  it('判断が2件ある v3 は移行後の検証を通らない（＝開けない。切り詰める変換は書かない）', () => {
    // 前提: 版番号を除けば v3 のスキーマ上は正しい形である
    //（ここが崩れると「2件だから落ちた」ではなく別の理由で落ちる）
    expect(migrateIssueTree(v3WithHistory, 3).schemaVersion).toBe(4)
    expect(validate(migrateIssueTree(v3WithHistory, 3)).ok).toBe(false)
    // **落ちた理由が判断の件数であること**を見る——1件に減らせば通る
    const trimmed = {
      ...v3WithHistory,
      schemaVersion: 4,
      hypotheses: [{ ...v3WithHistory.hypotheses[0], events: [v3WithHistory.hypotheses[0].events[1]] }],
    }
    expect(validate(trimmed).ok).toBe(true)
  })
})
