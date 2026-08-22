import { describe, expect, it } from 'vitest'
import type { JsonSchema } from '@/core/canonical'
import { createSchemaValidator } from '@/core/schema-validation'
import issueTreeSchema from '../../../schemas/issue-tree.schema.json'

const validate = createSchemaValidator(issueTreeSchema as JsonSchema)

const ISSUE_A = 'issue_aB3xY9kLm2'
const ISSUE_B = 'issue_Qw7zR1nP4t'
const HYP_A = 'hypothesis_Kd4hR6yU1c'

const base = {
  schemaVersion: 2,
  type: 'issueTree',
  title: '適性検査サービス連携PoC',
  issues: [
    { id: ISSUE_A, parentId: null, text: '適性検査サービス連携（PoCテーマ）', events: [] },
    { id: ISSUE_B, parentId: ISSUE_A, text: '結果取得を画面遷移の中で待てるか', events: [] },
  ],
  hypotheses: [
    {
      id: HYP_A,
      issueId: ISSUE_B,
      text: 'webhook受信＋非同期表示に切り替えれば体験が成立する',
      rationale: '類似連携の実測が3〜8秒だったため',
      events: [{ kind: 'supported', note: 'スパイクで受信まで中央値4.2秒（n=50）' }],
      pendingNotes: [],
    },
  ],
}

describe('issueTree のスキーマ検証（レベル1）', () => {
  it('最小の正しいファイルを受け入れる', () => {
    expect(validate(base).ok).toBe(true)
  })

  it('課題0件・仮説0件（新規作成直後）を受け入れる', () => {
    expect(validate({ ...base, issues: [], hypotheses: [] }).ok).toBe(true)
  })

  it('空の文言・空の由来を受け入れる', () => {
    // 追加した直後の状態がそのまま自動保存されうる。ここを弾くと
    // 打ち終わる前の保存が「自分で作った開けないファイル」になる
    const issues = [{ id: ISSUE_A, parentId: null, text: '', events: [] }]
    const hypotheses = [
      { id: HYP_A, issueId: ISSUE_A, text: '', rationale: '', events: [], pendingNotes: [] },
    ]
    expect(validate({ ...base, issues, hypotheses }).ok).toBe(true)
  })

  it('イベントの note が空文字でも受け入れる', () => {
    const hypotheses = [{ ...base.hypotheses[0], events: [{ kind: 'deferred', note: '' }] }]
    expect(validate({ ...base, hypotheses }).ok).toBe(true)
  })

  it('pendingNotes を持つ仮説を受け入れる', () => {
    const hypotheses = [{ ...base.hypotheses[0], pendingNotes: ['SHが「分単位窓では？」と発言'] }]
    expect(validate({ ...base, hypotheses }).ok).toBe(true)
  })

  it('課題ノードに支持・棄却のイベントを付けたものを拒否する', () => {
    // 課題は「支持・棄却を判定される主張」ではない。付けられるのは見送り系2種だけ
    const issues = [{ id: ISSUE_A, parentId: null, text: 'x', events: [{ kind: 'supported', note: '' }] }]
    expect(validate({ ...base, issues }).ok).toBe(false)
  })

  it('課題ノードに見送り系2種のイベントを付けたものは受け入れる', () => {
    for (const kind of ['deferred', 'deferredToMainDev']) {
      const issues = [{ id: ISSUE_A, parentId: null, text: 'x', events: [{ kind, note: '理由' }] }]
      expect(validate({ ...base, issues }).ok, kind).toBe(true)
    }
  })

  it('仮説のイベント種別をすべて受け入れる（7種目の onHold は次のケース）', () => {
    for (const kind of [
      'supported',
      'rejected',
      'supportedWithoutTest',
      'rejectedWithoutTest',
      'deferred',
      'deferredToMainDev',
    ]) {
      const hypotheses = [{ ...base.hypotheses[0], events: [{ kind, note: '' }] }]
      expect(validate({ ...base, hypotheses }).ok, kind).toBe(true)
    }
  })

  it('仮説の判断に onHold（保留）を受け入れる', () => {
    const h = { ...base.hypotheses[0], events: [{ kind: 'onHold', note: '「楽」の定義が決まらず判断できない' }] }
    expect(validate({ ...base, hypotheses: [h] }).ok).toBe(true)
  })

  it('課題の見送りに onHold は付けられない（保留は仮説だけ）', () => {
    const node = { ...base.issues[1], events: [{ kind: 'onHold', note: '' }] }
    expect(validate({ ...base, issues: [base.issues[0], node] }).ok).toBe(false)
  })

  it('schemaVersion 1 はレベル1で弾く（移行は load.ts の仕事。スキーマは現行版しか受けない）', () => {
    expect(validate({ ...base, schemaVersion: 1 }).ok).toBe(false)
  })

  it('未知のイベント種別を拒否する（enum の拡張は schemaVersion の改訂）', () => {
    const hypotheses = [{ ...base.hypotheses[0], events: [{ kind: 'memo', note: 'x' }] }]
    expect(validate({ ...base, hypotheses }).ok).toBe(false)
  })

  it('ID のプレフィクス・長さが違うものを拒否する', () => {
    expect(validate({ ...base, issues: [{ id: 'node_aB3xY9kLm2', parentId: null, text: 'x', events: [] }] }).ok).toBe(false)
    expect(validate({ ...base, issues: [{ id: 'issue_aB3xY9kLm', parentId: null, text: 'x', events: [] }] }).ok).toBe(false)
    expect(validate({ ...base, hypotheses: [{ ...base.hypotheses[0], id: 'issue_aB3xY9kLm2' }] }).ok).toBe(false)
  })

  it('未知のキーを拒否する（座標をデータに入れる経路を塞ぐ）', () => {
    const issues = [{ id: ISSUE_A, parentId: null, text: 'x', events: [], x: 10 }]
    expect(validate({ ...base, issues }).ok).toBe(false)
    const hypotheses = [{ ...base.hypotheses[0], status: 'supported' }]
    expect(validate({ ...base, hypotheses }).ok).toBe(false)
  })

  it('キーの欠損を拒否する（全キー常在）', () => {
    expect(validate({ ...base, issues: [{ id: ISSUE_A, parentId: null, text: 'x' }] }).ok).toBe(false)
    const { rationale: _r, ...withoutRationale } = base.hypotheses[0]
    expect(validate({ ...base, hypotheses: [withoutRationale] }).ok).toBe(false)
    const { pendingNotes: _p, ...withoutNotes } = base.hypotheses[0]
    expect(validate({ ...base, hypotheses: [withoutNotes] }).ok).toBe(false)
  })

  it('循環・多重ルート・参照切れのファイルはスキーマ検証を通る（レベル2の担当）', () => {
    // 「拒否は解釈不能な場合に限る」（rev 5章）。構造は読めるので開ける
    const cyclic = [
      { id: ISSUE_A, parentId: ISSUE_B, text: 'a', events: [] },
      { id: ISSUE_B, parentId: ISSUE_A, text: 'b', events: [] },
    ]
    expect(validate({ ...base, issues: cyclic, hypotheses: [] }).ok).toBe(true)
    const dangling = [{ ...base.hypotheses[0], issueId: 'issue_ZZZZZZZZZZ' }]
    expect(validate({ ...base, hypotheses: dangling }).ok).toBe(true)
  })
})
