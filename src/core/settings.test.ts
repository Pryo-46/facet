import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from './settings'

describe('normalizeSettings', () => {
  it('空の入力を既定で埋める', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('オブジェクトでない入力も既定になる', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('settings')).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('保存された値を読む', () => {
    const raw = {
      theme: 'dark',
      canvas: {
        panWithEmptyDrag: false,
        panWithSpaceDrag: true,
        panWithMiddleDrag: false,
        panWithRightDrag: true,
        zoomWithoutModifier: false,
      },
    }
    expect(normalizeSettings(raw)).toEqual(raw)
  })

  it('列挙に無いテーマは既定に落ちる', () => {
    expect(normalizeSettings({ theme: 'sepia' }).theme).toBe('system')
  })

  it('真偽値でないキャンバスの値は既定に落ちる', () => {
    const canvas = normalizeSettings({ canvas: { panWithEmptyDrag: 'yes', zoomWithoutModifier: 0 } }).canvas
    expect(canvas.panWithEmptyDrag).toBe(true)
    expect(canvas.zoomWithoutModifier).toBe(true)
  })

  it('欠けたキーだけを既定で埋め、あるキーは保つ', () => {
    const canvas = normalizeSettings({ canvas: { panWithMiddleDrag: false } }).canvas
    expect(canvas.panWithMiddleDrag).toBe(false)
    expect(canvas.panWithSpaceDrag).toBe(true)
  })

  it('パンの手段が1つも無い入力は空きドラッグを起こす', () => {
    const canvas = normalizeSettings({
      canvas: {
        panWithEmptyDrag: false,
        panWithSpaceDrag: false,
        panWithMiddleDrag: false,
        panWithRightDrag: false,
      },
    }).canvas
    expect(canvas.panWithEmptyDrag).toBe(true)
    // 起こすのは1つだけ。他の選択は保つ
    expect(canvas.panWithSpaceDrag).toBe(false)
    expect(canvas.panWithMiddleDrag).toBe(false)
    expect(canvas.panWithRightDrag).toBe(false)
  })

  it('lastProjectDir のような無関係のキーを持ち込まない', () => {
    expect(normalizeSettings({ lastProjectDir: 'C:\\proj' })).toEqual(DEFAULT_SETTINGS)
  })

  it('入力のオブジェクトを共有しない', () => {
    const raw = { canvas: { panWithSpaceDrag: false } }
    const normalized = normalizeSettings(raw)
    normalized.canvas.panWithSpaceDrag = true
    expect(raw.canvas.panWithSpaceDrag).toBe(false)
  })
})
