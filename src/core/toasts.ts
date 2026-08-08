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

/**
 * 同時に出す上限。**トーストは時間では消えない**（閉じるまで残る。理由は
 * `src/components/Toast.tsx`）ので、消える経路は「閉じるを押す」「同じ key の
 * 新しい通知に置き換わる」「この上限を超えて追い出される」の3つだけ
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
  // 操作付きも残す: 取り込み前に戻す等は Undo 履歴を破棄した後の唯一の復元手段で、
  // 追い出しで消えると同じ手段が失われる（操作付きばかりなら最古を落とす）
  const victim = next.findIndex((t, i) => i < next.length - 1 && t.action === undefined)
  return victim >= 0 ? [...next.slice(0, victim), ...next.slice(victim + 1)] : next.slice(1)
}

export function dismissToast(list: readonly ToastItem[], id: number): ToastItem[] {
  return list.filter((t) => t.id !== id)
}
