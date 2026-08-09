import { describe, expect, it } from 'vitest'
import { dividerRow, escapeCell, headingText, row } from './markdown-table'

describe('escapeCell', () => {
  it('| をエスケープする（列区切りと衝突する）', () => {
    expect(escapeCell('a|b')).toBe('a\\|b')
  })

  it('改行は <br> にする（CRLF・CR・LF のすべて）', () => {
    expect(escapeCell('1\r\n2\r3\n4')).toBe('1<br>2<br>3<br>4')
  })

  it('バックスラッシュを先に処理する（順序が逆だと自分が入れた \\ を二重エスケープする）', () => {
    expect(escapeCell('C:\\Users\\bin')).toBe('C:\\\\Users\\\\bin')
    // 生の `a\|b` は、リテラルの `\` ＋ エスケープされた `|` で `a\\\|b`
    expect(escapeCell('a\\|b')).toBe('a\\\\\\|b')
  })

  it('空文字はそのまま（空セルは列として残る）', () => {
    expect(escapeCell('')).toBe('')
  })
})

describe('row', () => {
  it('セルを | で挟んで連ねる', () => {
    expect(row(['a', 'b'])).toBe('| a | b |')
  })

  it('空セルも列として残す（列数が崩れない）', () => {
    expect(row(['a', '', 'c'])).toBe('| a |  | c |')
  })
})

describe('dividerRow', () => {
  it('列数ぶんの --- を並べる', () => {
    expect(dividerRow(3)).toBe('| --- | --- | --- |')
  })
})

describe('headingText', () => {
  it('改行を空白へ潰す（h1 の混入経路を塞ぐ）', () => {
    expect(headingText('用語集\n# 見出しのつもり')).toBe('用語集 # 見出しのつもり')
  })

  it('| はエスケープしない（見出しに列区切りは無い）', () => {
    expect(headingText('a|b')).toBe('a|b')
  })
})
