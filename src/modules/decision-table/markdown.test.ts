import { describe, expect, it } from 'vitest'
import type { ConsistencyIssue } from '@/core/consistency'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import { decisionTableToMarkdown, describeDecisionTableIssueEffect } from './markdown'
import { decisionTableModule } from './module'
import { rowKeyOf } from './rows'

/** #2 の通知メールが空、#4 が起こりえない（結果は記入済みのまま） */
const data: DecisionTableSchemaVersion1 = {
  schemaVersion: 1,
  type: 'decisionTable',
  title: '送料の決定',
  conditions: [
    { id: 'cond_AAAAAAAAAA', name: '会員か', values: ['はい', 'いいえ'] },
    { id: 'cond_BBBBBBBBBB', name: '5000円以上か', values: ['はい', 'いいえ'] },
  ],
  outcomes: [
    { id: 'out_AAAAAAAAAA', name: '送料', choices: ['無料', '500円'] },
    { id: 'out_BBBBBBBBBB', name: '通知メール', choices: ['出す', '出さない'] },
  ],
  rows: [
    { values: ['はい', 'はい'], impossible: false, results: ['無料', '出す'] },
    { values: ['はい', 'いいえ'], impossible: false, results: ['無料', ''] },
    { values: ['いいえ', 'はい'], impossible: false, results: ['無料', '出す'] },
    { values: ['いいえ', 'いいえ'], impossible: true, results: ['500円', ''] },
  ],
}

/** 判定表の節だけを取り出す */
const judgementOf = (md: string): string => md.slice(md.indexOf('### 判定表'))

describe('decisionTableToMarkdown', () => {
  it('条件・結果・判定表の3節を h3 で並べる（全体のバイト一致）', () => {
    expect(decisionTableToMarkdown(data)).toBe(
      [
        '## 送料の決定',
        '',
        '### 条件',
        '',
        '| No | 条件名 | 値 |',
        '| --- | --- | --- |',
        '| 1 | 会員か | はい、いいえ |',
        '| 2 | 5000円以上か | はい、いいえ |',
        '',
        '### 結果',
        '',
        '| No | 結果名 | 選択肢 |',
        '| --- | --- | --- |',
        '| 1 | 送料 | 無料、500円 |',
        '| 2 | 通知メール | 出す、出さない |',
        '',
        '### 判定表',
        '',
        '| No | 会員か | 5000円以上か | 送料 | 通知メール |',
        '| --- | --- | --- | --- | --- |',
        '| 1 | はい | はい | 無料 | 出す |',
        '| 2 | はい | いいえ | 無料 | （未定義） |',
        '| 3 | いいえ | はい | 無料 | 出す |',
        '| 4 | いいえ | いいえ | 起こりえない | 起こりえない |',
        '',
      ].join('\n'),
    )
  })

  it('空の表でも3節の見出しと列見出しを出す', () => {
    expect(decisionTableToMarkdown(decisionTableModule.createEmpty('t'))).toBe(
      [
        '## t',
        '',
        '### 条件',
        '',
        '| No | 条件名 | 値 |',
        '| --- | --- | --- |',
        '',
        '### 結果',
        '',
        '| No | 結果名 | 選択肢 |',
        '| --- | --- | --- |',
        '',
        '### 判定表',
        '',
        '| No |',
        '| --- |',
        '',
      ].join('\n'),
    )
  })

  it('空の条件名と値ラベルは（未定義）、値を1つも持たない条件は空のセル', () => {
    const blank: DecisionTableSchemaVersion1 = {
      ...data,
      conditions: [
        { id: 'cond_AAAAAAAAAA', name: '', values: ['はい', ''] },
        { id: 'cond_BBBBBBBBBB', name: '値なし', values: [] },
      ],
      rows: [],
    }
    const md = decisionTableToMarkdown(blank)
    expect(md).toContain('| 1 | （未定義） | はい、（未定義） |')
    expect(md).toContain('| 2 | 値なし |  |')
  })

  it('セルの | と改行をエスケープする（定義の節にも判定表にも効く）', () => {
    const tricky: DecisionTableSchemaVersion1 = {
      ...data,
      conditions: [{ id: 'cond_AAAAAAAAAA', name: '区分\nA|B', values: ['x|y'] }],
      outcomes: [{ id: 'out_AAAAAAAAAA', name: '送料', choices: ['無料'] }],
      rows: [{ values: ['x|y'], impossible: false, results: ['無料'] }],
    }
    const md = decisionTableToMarkdown(tricky)
    expect(md).toContain('| 1 | 区分<br>A\\|B | x\\|y |')
    expect(md).toContain('| No | 区分<br>A\\|B | 送料 |')
    expect(md).toContain('| 1 | x\\|y | 無料 |')
  })

  it('絞り込みは判定表にだけ効き、No を振り直さない', () => {
    const md = decisionTableToMarkdown(data, new Set([rowKeyOf(data.rows[1])]))
    expect(md).toContain('| 2 | 5000円以上か | はい、いいえ |')
    expect(md).toContain('| 2 | 通知メール | 出す、出さない |')
    expect(judgementOf(md)).toContain('| 2 | はい | いいえ | 無料 | （未定義） |')
    expect(judgementOf(md)).not.toContain('| 1 | はい | はい |')
  })

  it('visible を渡さなければ全行を出す', () => {
    const md = decisionTableToMarkdown(data)
    expect(md).toBe(decisionTableToMarkdown(data, null))
    expect(judgementOf(md).split('\n').filter((l) => /^\| \d/.test(l))).toHaveLength(4)
  })
})

describe('describeDecisionTableIssueEffect', () => {
  const issue = (rule: string): ConsistencyIssue => ({ rule, message: '', locations: [] })

  it('行の集合が直積とずれていると、欠けた組み合わせが表に現れないことを述べる', () => {
    const text = describeDecisionTableIssueEffect([issue('row-set')])
    expect(text).toContain('欠けた組み合わせ')
    expect(text).toContain('その順のまま')
    expect(text).not.toContain('列数')
  })

  it('列数の合わない行があると、（未定義）で埋めて余りを落とすことを述べる', () => {
    const text = describeDecisionTableIssueEffect([issue('row-length')])
    expect(text).toContain('（未定義）')
    expect(text).not.toContain('欠けた組み合わせ')
  })

  it('両方あれば両方を述べる', () => {
    const text = describeDecisionTableIssueEffect([issue('row-length'), issue('row-set')])
    expect(text).toContain('欠けた組み合わせ')
    expect(text).toContain('列数')
  })

  it('行の形を壊さない指摘だけなら、欠けた組み合わせにも列数にも触れない', () => {
    const text = describeDecisionTableIssueEffect([issue('duplicate-name'), issue('unknown-value')])
    expect(text).toBe('このまま出力すると、指摘のある箇所もそのまま表に出ます。')
  })
})
