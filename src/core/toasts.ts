/**
 * 非モーダル通知の状態（コア・純ロジック。React を知らない）。
 *
 * バナー（App の `ioError` / `saveError`）は**いま続いている状態**を出す場所、
 * トーストは**起きた出来事**を流す場所。役割を混ぜない
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
   * 閉じるまで残す通知。付けるのは2種類だけである——**裏で起きた破壊的な変更**
   * （外部での削除・外部の変更で開けなくなった）と、**アプリからのお知らせ**
   * （旧版の残骸の削除依頼・更新のダウンロード進捗）。
   * 利用者が自分の操作の直後に読む通知は付けない（数秒で消える）
   */
  important?: boolean
  /**
   * 同じ key の通知は新しい方に置き換える。同じファイルへ外部変更が
   * 連続して来ても積み上がらないようにするため
   */
  key?: string
}

/** 弱い通知が消えるまでの時間。ポインタを載せている間は数えない（`src/components/Toast.tsx`） */
export const WEAK_TOAST_MS = 5000

/** 時間で消してよい通知か。操作付きは `important` が無くても残す（`action` の註） */
export function isWeakToast(toast: ToastItem): boolean {
  return toast.important !== true && toast.action === undefined
}

/**
 * 同時に出す上限。重要な通知と操作付きの通知は時間では消えないので、
 * 溜まり過ぎはこの上限と `key` による置き換えで抑える
 */
export const MAX_TOASTS = 3

export function pushToast(list: readonly ToastItem[], toast: ToastItem): ToastItem[] {
  const at = toast.key === undefined ? -1 : list.findIndex((t) => t.key === toast.key)
  // 置き換えは件数が増えないので上限の判定に入らない
  if (at >= 0) return list.map((t, i) => (i === at ? toast : t))
  const next = [...list, toast]
  if (next.length <= MAX_TOASTS) return next
  // 追い出す相手を選ぶ。**押し込んだ通知（末尾）は絶対に落とさない**——
  // 落とすと「出来事を知らせる」という役目をその通知が果たせないまま消える。
  // 先に弱い通知を落とす（放っておいても数秒で消える）。次に操作の無い重要な通知を落とす。
  // 操作付きは最後まで残す: 取り込み前に戻す等は Undo 履歴を破棄した後の唯一の復元手段で、
  // 追い出しで消えると同じ手段が失われる（操作付きばかりなら最古を落とす）
  const last = next.length - 1
  let victim = next.findIndex((t, i) => i < last && isWeakToast(t))
  if (victim < 0) victim = next.findIndex((t, i) => i < last && t.action === undefined)
  return victim >= 0 ? [...next.slice(0, victim), ...next.slice(victim + 1)] : next.slice(1)
}

export function dismissToast(list: readonly ToastItem[], id: number): ToastItem[] {
  return list.filter((t) => t.id !== id)
}

/**
 * 同じ key の通知を消す。**古い操作付きトーストを取り下げるために要る**——
 * 例えば二択ダイアログを出す前に、そのファイルの前回の「取り込み前に戻す」を消す。
 * 操作付きのトーストは時間で消えないので、残すと二択に答えた後に押せてしまい、
 * 二択の前提（ディスクは検知した内容のまま）が崩れる
 */
export function dismissToastByKey(list: readonly ToastItem[], key: string): ToastItem[] {
  return list.filter((t) => t.key !== key)
}
