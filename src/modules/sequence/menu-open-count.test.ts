import { describe, expect, it } from 'vitest'
import { nextMenuOpenCount } from './menu-open-count'

describe('nextMenuOpenCount（Task 11a）', () => {
  it('open で +1、close で -1（通常の増減）', () => {
    expect(nextMenuOpenCount(0, true)).toBe(1)
    expect(nextMenuOpenCount(1, true)).toBe(2)
    expect(nextMenuOpenCount(1, false)).toBe(0)
  })

  it('カウンタは負にならない（false が余分に来ても、その後 true 1回で正しく止まる）', () => {
    // **DOM 経由では「余分な false」を再現できない**——Radix の Escape 等の
    // リスナーは開いているメニューがある間しか登録されないので、閉じたあとに
    // いくらキー入力を送っても onOpenChange(false) 相当は呼ばれない
    // （SequenceEditor.dom.test.tsx 側で確認済み）。「false が余分に来ても
    // 壊れない」という防御的な性質は、この算術を直接呼ぶことでしか検査できない
    expect(nextMenuOpenCount(0, false)).toBe(0) // 余分な false でも負にならない
    // その後 true 1回で正しく 1（＝ menuOpen = count > 0 が真になる値）に戻る
    expect(nextMenuOpenCount(nextMenuOpenCount(0, false), true)).toBe(1)
  })
})
