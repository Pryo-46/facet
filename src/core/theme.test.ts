// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefersDark, resolveTheme, watchPrefersDark } from './theme'

describe('resolveTheme', () => {
  it('明示の選択はそのまま効く', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('system は OS の状態に従う', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

/** matchMedia を持たない jsdom へ、変更を流せる偽物を差す */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>()
  const mql = {
    matches,
    addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
  }
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => mql })
  return {
    emit: (next: boolean) => {
      for (const fn of listeners) fn({ matches: next } as MediaQueryListEvent)
    },
    listenerCount: () => listeners.size,
  }
}

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('prefersDark', () => {
  it('matchMedia を持たない環境はライト扱い', () => {
    // jsdom の既定がこれ。ここで投げると起動そのものが止まる
    expect(prefersDark()).toBe(false)
  })

  it('OS がダークなら true', () => {
    stubMatchMedia(true)
    expect(prefersDark()).toBe(true)
  })
})

describe('watchPrefersDark', () => {
  it('OS の切り替えを流す', () => {
    const media = stubMatchMedia(false)
    const listener = vi.fn()
    watchPrefersDark(listener)
    media.emit(true)
    expect(listener).toHaveBeenCalledWith(true)
  })

  it('返り値を呼ぶと購読が外れる', () => {
    const media = stubMatchMedia(false)
    watchPrefersDark(vi.fn())()
    expect(media.listenerCount()).toBe(0)
  })

  it('matchMedia を持たない環境でも投げず、外す関数を返す', () => {
    expect(() => watchPrefersDark(vi.fn())()).not.toThrow()
  })
})
