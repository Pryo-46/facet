import { describe, expect, it } from 'vitest'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import { applyBulk } from './bulk'

const base: DecisionTableSchemaVersion1 = {
  schemaVersion: 1,
  type: 'decisionTable',
  title: '送料',
  conditions: [{ id: 'cond_a', name: '会員か', values: ['はい', 'いいえ'] }],
  outcomes: [
    { id: 'out_a', name: '送料', choices: ['無料', '500円'] },
    { id: 'out_b', name: '通知', choices: ['出す'] },
  ],
  rows: [
    { values: ['はい'], impossible: false, results: ['無料', ''] },
    { values: ['いいえ'], impossible: false, results: ['', ''] },
  ],
}

describe('applyBulk', () => {
  it('選んだ結果列だけを書き換える', () => {
    const out = applyBulk(base, [0, 1], { kind: 'result', outcomeIndex: 0, value: '500円' })
    expect(out.data.rows.map((r) => r.results)).toEqual([
      ['500円', ''],
      ['500円', ''],
    ])
  })

  it('対象に入っていない行は触らない', () => {
    const out = applyBulk(base, [1], { kind: 'result', outcomeIndex: 0, value: '500円' })
    expect(out.data.rows[0].results[0]).toBe('無料')
  })

  it('空文字を書き込むと結果が空に戻る', () => {
    const out = applyBulk(base, [0], { kind: 'result', outcomeIndex: 0, value: '' })
    expect(out.data.rows[0].results[0]).toBe('')
  })

  it('変更した行だけを数える', () => {
    // ボタンに出す対象行数とは分母が違う。対象2行のうち、値が変わるのは1行だけ
    const out = applyBulk(base, [0, 1], { kind: 'result', outcomeIndex: 0, value: '無料' })
    expect(out.changed).toBe(1)
  })

  it('結果の書き込みは起こりえない行を飛ばす', () => {
    const withImpossible: DecisionTableSchemaVersion1 = {
      ...base,
      rows: [base.rows[0], { ...base.rows[1], impossible: true }],
    }
    const out = applyBulk(withImpossible, [0, 1], {
      kind: 'result',
      outcomeIndex: 0,
      value: '500円',
    })
    expect(out.data.rows.map((r) => r.results[0])).toEqual(['500円', ''])
    expect(out.changed).toBe(1)
  })

  it('起こりえないの入り切りは起こりえない行にも効く', () => {
    const withImpossible: DecisionTableSchemaVersion1 = {
      ...base,
      rows: [base.rows[0], { ...base.rows[1], impossible: true }],
    }
    const out = applyBulk(withImpossible, [0, 1], { kind: 'impossible', on: false })
    expect(out.data.rows.map((r) => r.impossible)).toEqual([false, false])
  })

  it('起こりえないを入れても結果の値を消さない', () => {
    // 戻せば元の値が見える（シーケンスの考慮不要と同じ扱い）
    const out = applyBulk(base, [0], { kind: 'impossible', on: true })
    expect(out.data.rows[0].impossible).toBe(true)
    expect(out.data.rows[0].results[0]).toBe('無料')
  })

  it('すでにその状態の行は変更に数えない', () => {
    const out = applyBulk(base, [0, 1], { kind: 'impossible', on: false })
    expect(out.changed).toBe(0)
  })

  it('1行も変わらないときは元のデータをそのまま返す', () => {
    // 参照が変わると Undo 履歴に空の1手が積まれる
    const out = applyBulk(base, [], { kind: 'result', outcomeIndex: 0, value: '無料' })
    expect(out.data).toBe(base)
  })

  it('結果の本数より大きい添字を渡しても行を壊さない', () => {
    // 結果を消した直後の描画が古い添字で押されうる
    const out = applyBulk(base, [0], { kind: 'result', outcomeIndex: 9, value: '無料' })
    expect(out.data).toBe(base)
    expect(out.changed).toBe(0)
  })
})
