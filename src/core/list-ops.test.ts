import { describe, expect, it } from 'vitest'
import { insertAt, moveItem, removeAt } from './list-ops'

describe('insertAt', () => {
  it('指定位置に挿入する', () => {
    expect(insertAt(['a', 'b', 'c'], 1, 'x')).toEqual(['a', 'x', 'b', 'c'])
  })

  it('末尾より後ろの位置は末尾に足す', () => {
    expect(insertAt(['a'], 5, 'x')).toEqual(['a', 'x'])
  })

  it('元の配列を書き換えない', () => {
    const src = ['a', 'b']
    insertAt(src, 0, 'x')
    expect(src).toEqual(['a', 'b'])
  })
})

describe('removeAt', () => {
  it('指定位置を取り除く', () => {
    expect(removeAt(['a', 'b', 'c'], 1)).toEqual(['a', 'c'])
  })

  it('範囲外は何も起きない', () => {
    expect(removeAt(['a'], 3)).toEqual(['a'])
    expect(removeAt(['a'], -1)).toEqual(['a'])
  })
})

describe('moveItem', () => {
  it('前に動かす', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b'])
  })

  it('後ろに動かす', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
  })

  it('範囲外への移動は何も起きない（先頭で Alt+↑ を押しても壊れない）', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 1, 2)).toEqual(['a', 'b'])
  })
})
