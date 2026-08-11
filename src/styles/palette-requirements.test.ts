import { describe, expect, it } from 'vitest'
import { readTokenBlock, stripCssComments } from './palette-requirements'

describe('readTokenBlock', () => {
  it('コメントを落としてから読めば、コメント内の } でブロックが切れない', () => {
    // palette.css のヘッダコメントは長く、将来 `{` `}` を含む説明
    // （CSS の書き方の例など）が入りうる。**実データに今それが無いので、
    // この前提は現在どのテストも守っていない。** 公開関数にする
    // ついでに固定する
    const css = `
/* 例: .dark { --x: 1 } のように書く */
:root {
    --canvas: oklch(0.921 0.012 96.4);
    --ink: oklch(0.205 0 89.9);
}
`
    const block = readTokenBlock(stripCssComments(css), ':root', 'ライト')
    expect(block.canvas).toBe('oklch(0.921 0.012 96.4)')
    expect(block.ink).toBe('oklch(0.205 0 89.9)')
  })

  it('ブロックが無ければ投げる', () => {
    expect(() => readTokenBlock(':root { --canvas: red; }', '\\.dark', 'ダーク')).toThrow()
  })
})
