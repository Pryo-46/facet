import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from './settings'
import { createSettingsStore } from './settings-store'

describe('createSettingsStore', () => {
  it('既定から始まる', () => {
    expect(createSettingsStore().getSnapshot()).toEqual(DEFAULT_SETTINGS)
  })

  it('変えない限り同じ参照を返す', () => {
    // useSyncExternalStore は getSnapshot が毎回新しい値を返すと無限ループする
    const store = createSettingsStore()
    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })

  it('set した値を返し、購読者へ知らせる', () => {
    const store = createSettingsStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.set({ ...DEFAULT_SETTINGS, theme: 'dark' })
    expect(store.getSnapshot().theme).toBe('dark')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('set した後のオブジェクトを呼び手と共有しない', () => {
    const store = createSettingsStore()
    const next = { ...DEFAULT_SETTINGS, canvas: { ...DEFAULT_SETTINGS.canvas } }
    store.set(next)
    next.canvas.panWithSpaceDrag = false
    expect(store.getSnapshot().canvas.panWithSpaceDrag).toBe(true)
  })

  it('購読を解いた後は呼ばれない', () => {
    const store = createSettingsStore()
    const listener = vi.fn()
    store.subscribe(listener)()
    store.set({ ...DEFAULT_SETTINGS, theme: 'dark' })
    expect(listener).not.toHaveBeenCalled()
  })

  it('reset で既定に戻る', () => {
    const store = createSettingsStore()
    store.set({ ...DEFAULT_SETTINGS, theme: 'dark' })
    store.reset()
    expect(store.getSnapshot()).toEqual(DEFAULT_SETTINGS)
  })
})
