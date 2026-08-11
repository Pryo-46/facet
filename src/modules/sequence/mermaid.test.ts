import { describe, expect, it } from 'vitest'
import { escapeMermaidLabel } from './mermaid'

describe('escapeMermaidLabel', () => {
  it('明示改行は <br> にする（Mermaid のラベルは改行を含められない）', () => {
    expect(escapeMermaidLabel('与信を\n依頼する')).toBe('与信を<br>依頼する')
    expect(escapeMermaidLabel('a\r\nb\rc')).toBe('a<br>b<br>c')
  })

  it('# はエンティティ記法の開始文字なので #35; にする', () => {
    expect(escapeMermaidLabel('#1 の与信')).toBe('#35;1 の与信')
  })

  it('; は文の区切りに読まれうるので #59; にする', () => {
    expect(escapeMermaidLabel('確定;送信')).toBe('確定#59;送信')
  })

  it('# と ; が混ざっても二重エスケープしない（1パスで置換する）', () => {
    // **順に replace すると壊れる**: # → #35; の後に ; → #59; を掛けると
    // #35; が #35#59; になる。逆順でも #59; が #3559; になる。
    // 1回の走査で1文字ずつ置き換えることでのみ正しくなる
    expect(escapeMermaidLabel('#;')).toBe('#35;#59;')
    expect(escapeMermaidLabel('a#b;c')).toBe('a#35;b#59;c')
  })

  it('普通の日本語・英数字・コロンはそのまま（コロンは本文として通る）', () => {
    expect(escapeMermaidLabel('与信依頼: OK')).toBe('与信依頼: OK')
  })

  it('空文字は空文字のまま返す（置き換えは呼び出し側の仕事）', () => {
    expect(escapeMermaidLabel('')).toBe('')
  })
})
