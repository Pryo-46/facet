import type { Theme } from './settings'

const QUERY = '(prefers-color-scheme: dark)'

/** 設定と OS の状態から、いま当てる面を決める */
export function resolveTheme(setting: Theme, systemPrefersDark: boolean): 'light' | 'dark' {
  if (setting === 'system') return systemPrefersDark ? 'dark' : 'light'
  return setting
}

/**
 * OS がダークを求めているか。
 *
 * **`matchMedia` を持たない環境はライト扱いに落とす。** jsdom の既定がそれで、
 * ここで投げると起動そのものが止まる
 */
export function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(QUERY).matches
}

/** OS の切り替えを購読する。返り値を呼ぶと外れる */
export function watchPrefersDark(listener: (dark: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined
  }
  const media = window.matchMedia(QUERY)
  const handler = (event: MediaQueryListEvent): void => listener(event.matches)
  media.addEventListener('change', handler)
  return () => media.removeEventListener('change', handler)
}
