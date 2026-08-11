import { describe, expect, it } from 'vitest'
import { readTokenBlock, stripCssComments } from './palette-requirements'

describe('readTokenBlock', () => {
  it('コメントを落としてから読めば、コメント内の } でブロックが切れない', () => {
    // palette.css のコメントは `{` `}` を含む説明（CSS の書き方の例など）が
    // 入りうる。**それがブロックの中（トークンの直前など）に挟まっていると、
    // コメントを落とさずに読んだ場合、コメント内の `}` でブロック抽出が
    // 早期に閉じてしまう。** 実データに今それが無いので、この前提は現在
    // どのテストも守っていない。公開関数にするついでに固定する
    const css = `
:root {
    /* 例: .dark { --x: 1 } のように書く */
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
