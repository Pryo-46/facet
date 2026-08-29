import { describe, expect, it } from 'vitest'
import { tableToHtml } from './table-html'

describe('tableToHtml', () => {
  it('thead と tbody を持つ素の table を返す（罫線・色・フォントを付けない）', () => {
    expect(tableToHtml({ header: ['用語'], rows: [['受注']] })).toBe(
      '<table><thead><tr><th>用語</th></tr></thead><tbody><tr><td>受注</td></tr></tbody></table>',
    )
  })

  it('style 属性も class 属性も出さない（貼り先の書式に馴染ませるため）', () => {
    const html = tableToHtml({ header: ['a'], rows: [['b']] })
    expect(html).not.toContain('style=')
    expect(html).not.toContain('class=')
  })

  it('& < > を実体参照にする', () => {
    expect(tableToHtml({ header: ['a'], rows: [['<b> & </b>']] })).toContain(
      '<td>&lt;b&gt; &amp; &lt;/b&gt;</td>',
    )
  })

  it('& を先に処理する（順序が逆だと自分が入れた & を二重にエスケープする）', () => {
    expect(tableToHtml({ header: ['a'], rows: [['&lt;']] })).toContain('<td>&amp;lt;</td>')
  })

  it('セル内の改行は <br>（CRLF・CR・LF のすべて）', () => {
    expect(tableToHtml({ header: ['a'], rows: [['1\r\n2\r3\n4']] })).toContain(
      '<td>1<br>2<br>3<br>4</td>',
    )
  })

  it('見出しもエスケープする（列名が外部由来になりうる）', () => {
    expect(tableToHtml({ header: ['<x>'], rows: [] })).toContain('<th>&lt;x&gt;</th>')
  })

  it('行が0本でも tbody は出す（貼り先が見出しだけの表として受け取れる）', () => {
    expect(tableToHtml({ header: ['a'], rows: [] })).toBe(
      '<table><thead><tr><th>a</th></tr></thead><tbody></tbody></table>',
    )
  })
})
