import { DEFAULT_SETTINGS, type AppSettings } from './settings'

export interface SettingsStore {
  getSnapshot: () => AppSettings
  subscribe: (listener: () => void) => () => void
  set: (settings: AppSettings) => void
  reset: () => void
}

/**
 * 実行時の設定を持つ外部ストア。作りも理由も `createTableCopyPrefsStore` と同じ。
 *
 * **ディスクは知らない。** 起動時に読んだ値を入れるのも、変更のたび書き出すのも
 * `src/App.tsx` の担当で、コアは Tauri を知らないという分担をそのまま守る。
 *
 * **モジュールスコープの可変状態はテスト間で漏れる。**
 * テストの `beforeEach` で `reset()` を呼ぶこと
 */
export function createSettingsStore(): SettingsStore {
  const initial: AppSettings = DEFAULT_SETTINGS
  // **同一参照を返し続けること。** useSyncExternalStore は getSnapshot が
  // 毎回新しいオブジェクトを返すと無限ループする
  let current: AppSettings = initial
  const listeners = new Set<() => void>()
  const emit = (): void => {
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (settings) => {
      current = { theme: settings.theme, canvas: { ...settings.canvas } }
      emit()
    },
    reset: () => {
      current = initial
      emit()
    },
  }
}

/** アプリ全体で1個 */
export const appSettings = createSettingsStore()
