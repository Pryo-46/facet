import { describe, expect, it } from 'vitest'
import { normalizeForMatch } from './normalize'

describe('normalizeForMatch', () => {
  it('全角英数を半角に揃える（NFKC）', () => {
    expect(normalizeForMatch('ＡＰＩ')).toBe('api')
  })

  it('英字の大文字小文字を同一視する', () => {
    expect(normalizeForMatch('OrderAPI')).toBe(normalizeForMatch('orderapi'))
  })

  it('半角カナを全角に揃える（NFKC）', () => {
    expect(normalizeForMatch('ｵｰﾀﾞｰ')).toBe('オーダー')
  })

  it('カナ同一視はしない（ひらがな・カタカナは別物のまま）', () => {
    expect(normalizeForMatch('おーだー')).not.toBe(normalizeForMatch('オーダー'))
  })

  it('日本語はそのまま', () => {
    expect(normalizeForMatch('受注')).toBe('受注')
  })

  it('前後の空白を除去する（スペースで重複判定をすり抜けられないように）', () => {
    expect(normalizeForMatch(' 受注 ')).toBe('受注')
  })

  it('前後の全角スペースも除去する（NFKC で半角化してから trim）', () => {
    expect(normalizeForMatch('　受注　')).toBe('受注')
  })

  it('語中の空白は残す（別の表記として扱う）', () => {
    expect(normalizeForMatch('order id')).toBe('order id')
  })
})
