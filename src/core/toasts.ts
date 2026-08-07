/**
 * 非モーダル通知の状態（コア・純ロジック。React を知らない）。
 *
 * バナー（App の `ioError` / `saveError`）は**いま続いている状態**を出す場所、
 * トーストは**起きた出来事**を流す場所。役割を混ぜない（M5 で確定）
 */
export interface ToastItem {
  /** 呼び出し側が採番する（コアはカウンタを持たない） */
  id: number
  message: string
  /**
   * 押せる操作（例: 取り込み前に戻す）。
   * **付いているトーストは自動で消さない**——Undo 履歴を破棄した後の
   * 唯一の復元手段が時間切れで消えると、退避の意味が無い（rev 3章）
   */
  action?: { label: string; run: () => void | Promise<void> }
  /**
   * 同じ key の通知は新しい方に置き換える。同じファイルへ外部変更が
   * 連続して来ても積み上がらないようにするため
   */
  key?: string
}

/** 同時に出す上限。超えたら古い方から落とす */
export const MAX_TOASTS = 3

export function pushToast(list: readonly ToastItem[], toast: ToastItem): ToastItem[] {
  const at = toast.key === undefined ? -1 : list.findIndex((t) => t.key === toast.key)
  const next = at >= 0 ? list.map((t, i) => (i === at ? toast : t)) : [...list, toast]
  return next.length <= MAX_TOASTS ? next : next.slice(next.length - MAX_TOASTS)
}

export function dismissToast(list: readonly ToastItem[], id: number): ToastItem[] {
  return list.filter((t) => t.id !== id)
}
