import { describe, expect, it } from 'vitest'
import { canRedo, canUndo, createHistory, record, redo, undo, HISTORY_LIMIT } from './history'

describe('history', () => {
  it('初期状態は undo も redo もできない', () => {
    const h = createHistory('a')
    expect(h.present).toBe('a')
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })

  it('record したら undo で1つ前に戻り、redo で進む', () => {
    let h = createHistory('a')
    h = record(h, 'b', null, 1000)
    expect(canUndo(h)).toBe(true)
    h = undo(h)
    expect(h.present).toBe('a')
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(h.present).toBe('b')
  })

  it('同じ mergeKey の連続入力は1つの履歴にまとめる', () => {
    let h = createHistory('')
    h = record(h, '受', 'row1:name', 1000)
    h = record(h, '受注', 'row1:name', 1200)
    h = record(h, '受注書', 'row1:name', 1400)
    h = undo(h)
    // 1打鍵ずつではなく、入力を始める前まで戻る
    expect(h.present).toBe('')
  })

  it('間が空いたら別の履歴になる', () => {
    let h = createHistory('')
    h = record(h, '受', 'row1:name', 1000)
    h = record(h, '受注', 'row1:name', 3000)
    h = undo(h)
    expect(h.present).toBe('受')
  })

  it('別のセルへ移ったら別の履歴になる', () => {
    let h = createHistory('a')
    h = record(h, 'b', 'row1:name', 1000)
    h = record(h, 'c', 'row2:name', 1100)
    h = undo(h)
    expect(h.present).toBe('b')
  })

  it('mergeKey が null（構造操作）は常に別の履歴', () => {
    let h = createHistory('a')
    h = record(h, 'b', null, 1000)
    h = record(h, 'c', null, 1001)
    h = undo(h)
    expect(h.present).toBe('b')
  })

  it('undo の直後の入力は、戻る前の状態にまとめられない', () => {
    let h = createHistory('a')
    h = record(h, 'b', 'row1:name', 1000)
    h = undo(h)
    h = record(h, 'c', 'row1:name', 1050)
    h = undo(h)
    expect(h.present).toBe('a')
  })

  it('record すると redo 先は捨てられる', () => {
    let h = createHistory('a')
    h = record(h, 'b', null, 1000)
    h = undo(h)
    h = record(h, 'c', null, 2000)
    expect(canRedo(h)).toBe(false)
    expect(h.present).toBe('c')
  })

  it('戻れないときの undo / 進めないときの redo は同じ状態を返す', () => {
    const h = createHistory('a')
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })

  it('履歴は上限で古いほうから捨てる（メモリ内なので無限に伸ばさない）', () => {
    let h = createHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h = record(h, i, null, i * 10_000)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.past[0]).toBe(10)
  })
})
