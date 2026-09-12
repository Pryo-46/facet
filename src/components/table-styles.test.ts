import { describe, expect, it } from 'vitest'
import { headCell } from './table-styles'

describe('表の見出しセル', () => {
  it('下罫線を border ではなく影で描く', () => {
    // border-collapse の表では罫線が表の格子に属するので、sticky で浮いた
    // 見出しは罫線を置き去りにする。影は要素が自分で塗るので付いてくる
    expect(headCell).toContain('sticky')
    expect(headCell).not.toMatch(/border-b/)
    expect(headCell).toContain('shadow-[inset_0_-1px_0_var(--rule)]')
  })
})
