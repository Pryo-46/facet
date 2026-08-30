import { describe, expect, it } from 'vitest'
import type { JsonSchema } from '@/core/canonical'
import { createSchemaValidator } from '@/core/schema-validation'
import issueTreeSchema from '../../../schemas/issue-tree.schema.json'

const validate = createSchemaValidator(issueTreeSchema as JsonSchema)

const ISSUE_A = 'issue_aB3xY9kLm2'
const ISSUE_B = 'issue_Qw7zR1nP4t'
const HYP_A = 'hypothesis_Kd4hR6yU1c'
const ASK_A = 'ask_Zx8vN2bM6q'

const base = {
  schemaVersion: 3,
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
      title: 'webhook受信＋非同期表示に切り替える',
      detail: '受信を待たずに画面を返し、届いた時点で結果欄を差し替える',
      value: '応募者を待たせずに済み、離脱が減る',
      asks: [{ id: ASK_A, text: '待ち画面のまま離脱しないか' }],
      feedbacks: [
        { askId: ASK_A, text: '待ち表示があるなら離脱はしない', by: '採用担当', sentiment: 'like', date: '2026-08-30' },
      ],
      events: [{ kind: 'supported', note: 'スパイクで受信まで中央値4.2秒（n=50）', date: '2026-08-30' }],
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

  it('空の文言・空の詳細・空の価値・問い0件・FB0件を受け入れる', () => {
    // 追加した直後の状態がそのまま自動保存されうる。ここを弾くと
    // 打ち終わる前の保存が「自分で作った開けないファイル」になる
    const issues = [{ id: ISSUE_A, parentId: null, text: '', events: [] }]
    const hypotheses = [
      { id: HYP_A, issueId: ISSUE_A, title: '', detail: '', value: '', asks: [], feedbacks: [], events: [] },
    ]
    expect(validate({ ...base, issues, hypotheses }).ok).toBe(true)
  })

  it('問いの文言が空でも受け入れる（「＋ 聞きたいこと」を押した直後の状態）', () => {
    const h = { ...base.hypotheses[0], asks: [{ id: ASK_A, text: '' }], feedbacks: [] }
    expect(validate({ ...base, hypotheses: [h] }).ok).toBe(true)
  })

  it('どの問いにも紐づかない FB（askId: null）を受け入れる', () => {
    // 用意した問いの外から来る指摘こそ重い。紐づけを強制しない
    const h = {
      ...base.hypotheses[0],
      asks: [],
      feedbacks: [{ askId: null, text: '表示が遅い気がする', by: '', sentiment: 'concern', date: '2026-08-30' }],
    }
    expect(validate({ ...base, hypotheses: [h] }).ok).toBe(true)
  })

  it('sentiment の4語をすべて受け入れ、未知の語を拒否する', () => {
    for (const sentiment of ['like', 'concern', 'question', 'note']) {
      const h = {
        ...base.hypotheses[0],
        asks: [],
        feedbacks: [{ askId: null, text: 'x', by: '', sentiment, date: '2026-08-30' }],
      }
      expect(validate({ ...base, hypotheses: [h] }).ok, sentiment).toBe(true)
    }
    const bad = {
      ...base.hypotheses[0],
      asks: [],
      feedbacks: [{ askId: null, text: 'x', by: '', sentiment: 'praise', date: '2026-08-30' }],
    }
    expect(validate({ ...base, hypotheses: [bad] }).ok).toBe(false)
  })

  it('date は空文字を許さない（アプリと Skill が追記時に必ず入れる）', () => {
    const emptyEventDate = { ...base.hypotheses[0], events: [{ kind: 'supported', note: '', date: '' }] }
    expect(validate({ ...base, hypotheses: [emptyEventDate] }).ok).toBe(false)

    const emptyFeedbackDate = {
      ...base.hypotheses[0],
      asks: [],
      feedbacks: [{ askId: null, text: 'x', by: '', sentiment: 'note', date: '' }],
    }
    expect(validate({ ...base, hypotheses: [emptyFeedbackDate] }).ok).toBe(false)

    const issues = [{ id: ISSUE_A, parentId: null, text: 'x', events: [{ kind: 'deferred', note: '', date: '' }] }]
    expect(validate({ ...base, issues, hypotheses: [] }).ok).toBe(false)
  })

  it('date の形が YYYY-MM-DD でないものを拒否する', () => {
    for (const date of ['2026-8-30', '26-08-30', '2026/08/30', '2026-08-30T12:00:00Z']) {
      const h = { ...base.hypotheses[0], events: [{ kind: 'supported', note: '', date }] }
      expect(validate({ ...base, hypotheses: [h] }).ok, date).toBe(false)
    }
  })

  it('イベントの note が空文字でも受け入れる（date は必須のまま）', () => {
    const h = { ...base.hypotheses[0], events: [{ kind: 'deferred', note: '', date: '2026-08-30' }] }
    expect(validate({ ...base, hypotheses: [h] }).ok).toBe(true)
  })

  it('課題ノードに見送り・解決のイベントを付けたものは受け入れる', () => {
    for (const kind of ['deferred', 'resolved']) {
      const issues = [{ id: ISSUE_A, parentId: null, text: 'x', events: [{ kind, note: '理由', date: '2026-08-30' }] }]
      expect(validate({ ...base, issues, hypotheses: [] }).ok, kind).toBe(true)
    }
  })

  it('課題ノードに支持・棄却・保留のイベントを付けたものを拒否する', () => {
    // 課題は「支持・棄却を判定される主張」ではない。付けられるのは旗2種だけ
    for (const kind of ['supported', 'rejected', 'onHold']) {
      const issues = [{ id: ISSUE_A, parentId: null, text: 'x', events: [{ kind, note: '', date: '2026-08-30' }] }]
      expect(validate({ ...base, issues, hypotheses: [] }).ok, kind).toBe(false)
    }
  })

  it('仮説の判断イベント種別4つをすべて受け入れ、resolved は拒否する', () => {
    for (const kind of ['supported', 'rejected', 'onHold', 'deferred']) {
      const h = { ...base.hypotheses[0], events: [{ kind, note: '', date: '2026-08-30' }] }
      expect(validate({ ...base, hypotheses: [h] }).ok, kind).toBe(true)
    }
    // 「解決」は課題の旗であって、仮説の判断ではない
    const resolved = { ...base.hypotheses[0], events: [{ kind: 'resolved', note: '', date: '2026-08-30' }] }
    expect(validate({ ...base, hypotheses: [resolved] }).ok).toBe(false)
  })

  /**
   * v2 のファイルは移行しないと決めた（2026-08-30 のユーザー判断）。migrate は
   * schemaVersion を 3 に書き換えるだけなので、v2 の形はここで落ちる＝開けない。
   * **これがその決定を固定する契約である。** 読み替えを足すと「もう無いキー」が
   * データの中に別の顔で生き残る
   */
  it('v2 の形（text / rationale / pendingNotes・date 無しのイベント）を拒否する', () => {
    const v2Hypothesis = {
      id: HYP_A,
      issueId: ISSUE_B,
      text: '仮説',
      rationale: '由来',
      events: [{ kind: 'supported', note: '' }],
      pendingNotes: ['SH の指摘'],
    }
    expect(validate({ ...base, hypotheses: [v2Hypothesis] }).ok).toBe(false)
    const v2Issue = { id: ISSUE_A, parentId: null, text: 'x', events: [{ kind: 'deferred', note: '' }] }
    expect(validate({ ...base, issues: [v2Issue], hypotheses: [] }).ok).toBe(false)
  })

  it('schemaVersion 2 はレベル1で弾く（移行は load.ts の仕事。スキーマは現行版しか受けない）', () => {
    expect(validate({ ...base, schemaVersion: 2 }).ok).toBe(false)
  })

  it('未知のイベント種別を拒否する（enum の拡張は schemaVersion の改訂）', () => {
    const h = { ...base.hypotheses[0], events: [{ kind: 'memo', note: 'x', date: '2026-08-30' }] }
    expect(validate({ ...base, hypotheses: [h] }).ok).toBe(false)
  })

  it('ID のプレフィクス・長さが違うものを拒否する', () => {
    const wrongPrefix = [{ id: 'node_aB3xY9kLm2', parentId: null, text: 'x', events: [] }]
    expect(validate({ ...base, issues: wrongPrefix, hypotheses: [] }).ok).toBe(false)
    const wrongLength = [{ id: 'issue_aB3xY9kLm', parentId: null, text: 'x', events: [] }]
    expect(validate({ ...base, issues: wrongLength, hypotheses: [] }).ok).toBe(false)
    expect(validate({ ...base, hypotheses: [{ ...base.hypotheses[0], id: 'issue_aB3xY9kLm2' }] }).ok).toBe(false)
    const badAsk = { ...base.hypotheses[0], asks: [{ id: 'hypothesis_Zx8vN2bM6q', text: 'x' }], feedbacks: [] }
    expect(validate({ ...base, hypotheses: [badAsk] }).ok).toBe(false)
    const badAskRef = {
      ...base.hypotheses[0],
      asks: [],
      feedbacks: [{ askId: 'issue_Zx8vN2bM6q', text: 'x', by: '', sentiment: 'note', date: '2026-08-30' }],
    }
    expect(validate({ ...base, hypotheses: [badAskRef] }).ok).toBe(false)
  })

  it('未知のキーを拒否する（座標をデータに入れる経路を塞ぐ）', () => {
    const issues = [{ id: ISSUE_A, parentId: null, text: 'x', events: [], x: 10 }]
    expect(validate({ ...base, issues, hypotheses: [] }).ok).toBe(false)
    expect(validate({ ...base, hypotheses: [{ ...base.hypotheses[0], status: 'supported' }] }).ok).toBe(false)
    // 廃止した rationale が「ついでに」戻ってこないこと
    expect(validate({ ...base, hypotheses: [{ ...base.hypotheses[0], rationale: '由来' }] }).ok).toBe(false)
  })

  it('キーの欠損を拒否する（全キー常在）', () => {
    const noEvents = [{ id: ISSUE_A, parentId: null, text: 'x' }]
    expect(validate({ ...base, issues: noEvents, hypotheses: [] }).ok).toBe(false)
    for (const key of ['title', 'detail', 'value', 'asks', 'feedbacks', 'events'] as const) {
      // 計算キーの分割代入（`const { [key]: _d, ...rest }`）は、`key` がユニオン型の
      // とき TS が rest 型を解決できないことがある。**通らなければリテラルキーの
      // 列挙に落としてよい**（`it` の主張——6キーそれぞれの欠損を拒否する——は変えない）
      const without: Record<string, unknown> = { ...base.hypotheses[0] }
      delete without[key]
      expect(validate({ ...base, hypotheses: [without] }).ok, key).toBe(false)
    }
    const { by: _by, ...feedbackWithoutBy } = base.hypotheses[0].feedbacks[0]
    expect(validate({ ...base, hypotheses: [{ ...base.hypotheses[0], feedbacks: [feedbackWithoutBy] }] }).ok).toBe(false)
    const { text: _t, ...askWithoutText } = base.hypotheses[0].asks[0]
    expect(validate({ ...base, hypotheses: [{ ...base.hypotheses[0], asks: [askWithoutText] }] }).ok).toBe(false)
  })

  it('循環・多重ルート・参照切れのファイルはスキーマ検証を通る（レベル2の担当）', () => {
    // 「拒否は解釈不能な場合に限る」（rev 5章）。構造は読めるので開ける
    const cyclic = [
      { id: ISSUE_A, parentId: ISSUE_B, text: 'a', events: [] },
      { id: ISSUE_B, parentId: ISSUE_A, text: 'b', events: [] },
    ]
    expect(validate({ ...base, issues: cyclic, hypotheses: [] }).ok).toBe(true)
    expect(validate({ ...base, hypotheses: [{ ...base.hypotheses[0], issueId: 'issue_ZZZZZZZZZZ' }] }).ok).toBe(true)
    // 存在しない ask を指す FB も通る（レベル2でも今は見ない。open-issues に足す）
    const danglingAsk = {
      ...base.hypotheses[0],
      asks: [],
      feedbacks: [{ askId: ASK_A, text: 'x', by: '', sentiment: 'note', date: '2026-08-30' }],
    }
    expect(validate({ ...base, hypotheses: [danglingAsk] }).ok).toBe(true)
  })
})
