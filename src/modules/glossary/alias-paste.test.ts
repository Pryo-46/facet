import { describe, expect, it } from 'vitest'
import { splitPastedAliases } from './alias-paste'

describe('splitPastedAliases', () => {
  it('改行で分割する', () => {
    expect(splitPastedAliases('オーダー\n受注書\n注文')).toEqual(['オーダー', '受注書', '注文'])
  })

  it('CRLF とタブでも分割する（表計算からの貼り付け）', () => {
    expect(splitPastedAliases('オーダー\r\n受注書\t注文')).toEqual(['オーダー', '受注書', '注文'])
  })

  it('前後の空白を落とし、空行は捨てる', () => {
    expect(splitPastedAliases(' オーダー \n\n 受注書 ')).toEqual(['オーダー', '受注書'])
  })

  it('読点やカンマでは分割しない（1行＝1別名なので区切り文字は不要）', () => {
    expect(splitPastedAliases('受注、オーダー')).toEqual(['受注、オーダー'])
  })

  it('区切りを含まない貼り付けは1件', () => {
    expect(splitPastedAliases('オーダー')).toEqual(['オーダー'])
  })

  it('空文字は0件', () => {
    expect(splitPastedAliases('   ')).toEqual([])
  })
})
