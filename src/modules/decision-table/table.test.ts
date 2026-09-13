import { describe, expect, it } from 'vitest'
import { DEFAULT_TABLE_OPTIONS, type TableOptions } from '@/core/table-export'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import { rowKeyOf } from './rows'
import { decisionTableToTable } from './table'

const opts = (patch: Partial<TableOptions> = {}): TableOptions => ({
  ...DEFAULT_TABLE_OPTIONS,
  ...patch,
})

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

describe('decisionTableToTable', () => {
  it('列は No・条件名・結果名の順（画面の表本体と同じ並び）', () => {
    expect(decisionTableToTable(data, opts()).header).toEqual([
      'No',
      '会員か',
      '5000円以上か',
      '送料',
      '通知メール',
    ])
  })

  it('行は値と結果をそのまま並べ、No は行の配列位置', () => {
    expect(decisionTableToTable(data, opts()).rows[0]).toEqual(['1', 'はい', 'はい', '無料', '出す'])
  })

  it('numbering オフなら No 列が出ない', () => {
    const table = decisionTableToTable(data, opts({ numbering: false }))
    expect(table.header[0]).toBe('会員か')
    expect(table.rows[0]).toEqual(['はい', 'はい', '無料', '出す'])
  })

  it('showUndefined オンなら空の結果を（未定義）にする', () => {
    expect(decisionTableToTable(data, opts()).rows[1][4]).toBe('（未定義）')
  })

  it('showUndefined オフなら空の結果は空のまま', () => {
    expect(decisionTableToTable(data, opts({ showUndefined: false })).rows[1][4]).toBe('')
  })

  it('空の条件名・結果名・値ラベルも showUndefined に従う', () => {
    const blank: DecisionTableSchemaVersion1 = {
      ...data,
      conditions: [{ id: 'cond_AAAAAAAAAA', name: '', values: [''] }],
      outcomes: [{ id: 'out_AAAAAAAAAA', name: '', choices: [] }],
      rows: [{ values: [''], impossible: false, results: [''] }],
    }
    expect(decisionTableToTable(blank, opts())).toEqual({
      header: ['No', '（未定義）', '（未定義）'],
      rows: [['1', '（未定義）', '（未定義）']],
    })
    expect(decisionTableToTable(blank, opts({ showUndefined: false }))).toEqual({
      header: ['No', '', ''],
      rows: [['1', '', '']],
    })
  })

  it('起こりえない行は結果列すべてに起こりえないと書く（記入済みの結果も showUndefined も効かない）', () => {
    expect(decisionTableToTable(data, opts()).rows[3]).toEqual([
      '4',
      'いいえ',
      'いいえ',
      '起こりえない',
      '起こりえない',
    ])
    expect(decisionTableToTable(data, opts({ showUndefined: false })).rows[3][4]).toBe('起こりえない')
  })

  it('visible は rowKeyOf の鍵で行を引く', () => {
    const table = decisionTableToTable(data, opts(), new Set([rowKeyOf(data.rows[2])]))
    expect(table.rows).toEqual([['3', 'いいえ', 'はい', '無料', '出す']])
  })

  it('visible で絞っても No は振り直さない', () => {
    const table = decisionTableToTable(
      data,
      opts(),
      new Set([rowKeyOf(data.rows[1]), rowKeyOf(data.rows[3])]),
    )
    expect(table.rows.map((r) => r[0])).toEqual(['2', '4'])
  })

  it('visible が null なら全行、空集合なら見出しだけ', () => {
    expect(decisionTableToTable(data, opts(), null).rows).toHaveLength(4)
    const none = decisionTableToTable(data, opts(), new Set())
    expect(none.rows).toEqual([])
    expect(none.header).toHaveLength(5)
  })

  it('列数の合わない行も見出しと同じ列数に揃える（足りない欄は空、余った欄は落とす）', () => {
    const ragged: DecisionTableSchemaVersion1 = {
      ...data,
      rows: [{ values: ['はい'], impossible: false, results: ['無料', '出す', '余り'] }],
    }
    const table = decisionTableToTable(ragged, opts())
    expect(table.rows).toEqual([['1', 'はい', '（未定義）', '無料', '出す']])
  })

  it('条件が0本なら行も0本で、見出しは No と結果名だけ', () => {
    const empty: DecisionTableSchemaVersion1 = { ...data, conditions: [], rows: [] }
    expect(decisionTableToTable(empty, opts())).toEqual({
      header: ['No', '送料', '通知メール'],
      rows: [],
    })
  })
})
