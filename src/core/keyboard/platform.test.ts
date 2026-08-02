import { describe, expect, it } from 'vitest'
import {
  altModifierLabel,
  detectPlatform,
  isPrimaryModifier,
  primaryModifierLabel,
} from './platform'

const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)'
const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)'

describe('detectPlatform', () => {
  it('macOS を判定する', () => {
    expect(detectPlatform(MAC_UA)).toBe('mac')
  })

  it('Windows は other', () => {
    expect(detectPlatform(WIN_UA)).toBe('other')
  })
})

describe('isPrimaryModifier', () => {
  const none = { ctrlKey: false, metaKey: false }

  it('Windows では Ctrl が主修飾キー', () => {
    expect(isPrimaryModifier({ ...none, ctrlKey: true }, 'other')).toBe(true)
    expect(isPrimaryModifier({ ...none, metaKey: true }, 'other')).toBe(false)
  })

  it('macOS では Cmd が主修飾キー', () => {
    expect(isPrimaryModifier({ ...none, metaKey: true }, 'mac')).toBe(true)
    expect(isPrimaryModifier({ ...none, ctrlKey: true }, 'mac')).toBe(false)
  })

  it('両方押されている組み合わせは主修飾キーとして扱わない', () => {
    expect(isPrimaryModifier({ ctrlKey: true, metaKey: true }, 'other')).toBe(false)
    expect(isPrimaryModifier({ ctrlKey: true, metaKey: true }, 'mac')).toBe(false)
  })
})

describe('キーヒントのラベル', () => {
  it('プラットフォームごとの呼び方を返す', () => {
    expect(primaryModifierLabel('other')).toBe('Ctrl')
    expect(primaryModifierLabel('mac')).toBe('Cmd')
    expect(altModifierLabel('other')).toBe('Alt')
    expect(altModifierLabel('mac')).toBe('Option')
  })
})
