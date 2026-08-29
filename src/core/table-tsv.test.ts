import { describe, expect, it } from 'vitest'
import { tableToTsv } from './table-tsv'

describe('tableToTsv', () => {
  it('見出しと行をタブで連ね、行を改行で継ぐ', () => {
    expect(tableToTsv({ header: ['用語', '種別'], rows: [['受注', '業務']] })).toBe(
      '用語\t種別\n受注\t業務',
    )
  })

  it('末尾に改行を付けない（クリップボードのテキストはファイルではない。貼り先で空行が増える）', () => {
    expect(tableToTsv({ header: ['a'], rows: [['b']] })).toBe('a\nb')
  })

  it('タブ・改行・" を含むセルだけ " で囲む', () => {
    expect(tableToTsv({ header: ['a'], rows: [['x\ty']] })).toBe('a\n"x\ty"')
    expect(tableToTsv({ header: ['a'], rows: [['x\ny']] })).toBe('a\n"x\ny"')
  })

  it('囲んだ中の " は "" に倍化する（RFC 4180）', () => {
    expect(tableToTsv({ header: ['a'], rows: [['x"y']] })).toBe('a\n"x""y"')
  })

  it('壊す文字を含まないセルは囲まない（素のままの方が他所に貼ったとき読みやすい）', () => {
    expect(tableToTsv({ header: ['a'], rows: [['C:\\Users\\bin']] })).toBe('a\nC:\\Users\\bin')
  })

  it('改行は LF へ揃えてから囲む（CR が残ると貼り先で行が割れる）', () => {
    expect(tableToTsv({ header: ['a'], rows: [['x\r\ny\rz']] })).toBe('a\n"x\ny\nz"')
  })

  it('空セルも列として残す（列数が崩れない）', () => {
    expect(tableToTsv({ header: ['a', 'b'], rows: [['', 'v']] })).toBe('a\tb\n\tv')
  })

  it('行が0本でも見出しだけは出す', () => {
    expect(tableToTsv({ header: ['a', 'b'], rows: [] })).toBe('a\tb')
  })
})
