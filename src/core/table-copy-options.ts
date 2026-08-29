import { DEFAULT_TABLE_OPTIONS, type TableOptions } from './table-export'

export interface TableCopyPrefs {
  options: TableOptions
  /**
   * 直近に選んだ読み手の id。**ツールを跨いで1つだけ持つ。**
   * 今 `variants` を2本持つのはエラーカタログだけで、他ツールでは一致しないので
   * `resolveVariantId` が先頭へ落とす
   */
  variantId: string
}

export interface TableCopyPrefsStore {
  getSnapshot: () => TableCopyPrefs
  subscribe: (listener: () => void) => () => void
  set: (prefs: TableCopyPrefs) => void
  reset: () => void
}

/**
 * 表形式コピーの設定を **アプリを閉じるまで** 保持する外部ストア（M29）。
 *
 * 列幅ストア（`createColumnWidthStore`）と同じ作り・同じ理由。**永続化はしない**
 * ——`settings.json` に足すには `saveLastProjectDir` のファイル丸ごと上書きを
 * 読んで書き戻す形へ直す必要があり、直し損ねると直近フォルダの復元が壊れる。
 * 得られるもの（再起動をまたいで好みが残る）に対して危険が大きい。
 *
 * **列幅ストアと違い、ツールを跨いで1個を共有する。** 設定の意味（No 列を出すか等）が
 * ツール共通なので、ツールごとに分けると「用語集では No を出すがエラーカタログでは
 * 出さない」という覚え方になり、利用者は自分がいつそう決めたか思い出せない。
 *
 * **モジュールスコープの可変状態はテスト間で漏れる。**
 * テストの `beforeEach` で `reset()` を呼ぶこと
 */
export function createTableCopyPrefsStore(): TableCopyPrefsStore {
  const initial: TableCopyPrefs = { options: { ...DEFAULT_TABLE_OPTIONS }, variantId: '' }
  // **同一参照を返し続けること。** useSyncExternalStore は getSnapshot が
  // 毎回新しいオブジェクトを返すと無限ループする
  let current: TableCopyPrefs = initial
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
    set: (prefs) => {
      current = { options: { ...prefs.options }, variantId: prefs.variantId }
      emit()
    },
    reset: () => {
      current = initial
      emit()
    },
  }
}

/** アプリ全体で1個 */
export const tableCopyPrefs = createTableCopyPrefsStore()

/**
 * 覚えている読み手の id が、いま開いているツールの一覧に無ければ先頭へ落とす。
 * **id が一致しないのは異常ではなく日常**（ツールを切り替えれば必ず起きる）
 */
export function resolveVariantId(
  variants: readonly { id: string }[],
  remembered: string,
): string {
  return variants.some((v) => v.id === remembered) ? remembered : (variants[0]?.id ?? '')
}
