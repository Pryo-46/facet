import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TABLE_OPTIONS } from './table-export'
import { resolveVariantId, tableCopyPrefs } from './table-copy-options'

beforeEach(() => tableCopyPrefs.reset())

describe('tableCopyPrefs', () => {
  it('既定は No 列オン・階層番号・親は先頭行だけ・（未定義）を出す', () => {
    expect(tableCopyPrefs.getSnapshot().options).toEqual(DEFAULT_TABLE_OPTIONS)
    expect(DEFAULT_TABLE_OPTIONS).toEqual({
      numbering: true,
      numberStyle: 'path',
      repeatParent: false,
      showUndefined: true,
    })
  })

  it('set した値を返す', () => {
    tableCopyPrefs.set({
      options: { ...DEFAULT_TABLE_OPTIONS, numbering: false },
      variantId: 'dev',
    })
    expect(tableCopyPrefs.getSnapshot().options.numbering).toBe(false)
    expect(tableCopyPrefs.getSnapshot().variantId).toBe('dev')
  })

  it('getSnapshot は同一参照を返し続ける（useSyncExternalStore が無限ループしないため）', () => {
    expect(tableCopyPrefs.getSnapshot()).toBe(tableCopyPrefs.getSnapshot())
  })

  it('set と reset を subscribe したリスナへ通知する', () => {
    const listener = vi.fn()
    const unsubscribe = tableCopyPrefs.subscribe(listener)
    tableCopyPrefs.set({ options: DEFAULT_TABLE_OPTIONS, variantId: 'dev' })
    expect(listener).toHaveBeenCalledTimes(1)
    tableCopyPrefs.reset()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    tableCopyPrefs.set({ options: DEFAULT_TABLE_OPTIONS, variantId: 'x' })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('reset で既定へ戻る', () => {
    tableCopyPrefs.set({ options: { ...DEFAULT_TABLE_OPTIONS, numbering: false }, variantId: 'dev' })
    tableCopyPrefs.reset()
    expect(tableCopyPrefs.getSnapshot().options).toEqual(DEFAULT_TABLE_OPTIONS)
  })
})

describe('resolveVariantId', () => {
  const variants = [{ id: 'support' }, { id: 'dev' }]

  it('覚えている id がその一覧にあればそのまま返す', () => {
    expect(resolveVariantId(variants, 'dev')).toBe('dev')
  })

  it('無ければ先頭へ落とす（エラーカタログの id を覚えたまま用語集を開いても壊れない）', () => {
    expect(resolveVariantId(variants, 'default')).toBe('support')
  })

  it('一覧が空なら空文字（規約8 を宣言しないツールでは呼ばれないが、型では守れない）', () => {
    expect(resolveVariantId([], 'dev')).toBe('')
  })
})
