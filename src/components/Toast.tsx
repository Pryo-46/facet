import { useEffect, useState } from 'react'
import { buttonBase } from '@/components/button-styles'
import { isWeakToast, WEAK_TOAST_MS, type ToastItem } from '@/core/toasts'

export interface ToastStackProps {
  toasts: readonly ToastItem[]
  onDismiss: (id: number) => void
  /**
   * モーダル（確認・二択ダイアログ）が開いているか。開いている間は
   * **表示だけにして操作を受け付けない**——トーストはモーダルより前面に出す
   * 必要がある（下記 z-index）ので、そのままだと Radix が body の
   * pointer-events を切っていても行が `pointer-events-auto` で復活し、
   * 回答待ちの二択の裏で古い「取り込み前に戻す」を押せてしまう
   */
  modalOpen?: boolean
  /**
   * 右端から空ける幅（px）。端末ペインの幅を渡す。
   * **右下に置くと Claude Code の入力欄に重なる**ので、ペインを除いた領域の下中央に出す
   */
  rightInset?: number
}

/**
 * 非モーダル通知（rev 3章。外部変更を読み込んだことを知らせる）。
 *
 * **弱い通知は数秒で消え、重要な通知と操作付きの通知は閉じるまで残す**
 * （区別は `src/core/toasts.ts` の `important`）。すべてを閉じるまで残すと、
 * コピーや一括入力のたびに通知が溜まって作業面を塞ぐ。
 *
 * 面は地と反対の明度に置く（`bg-toast`）。地と同じ面にすると、表や方眼の上で
 * 通知が出たことに気付けない。
 *
 * shadcn の sonner は使わない——生成物が next-themes を import するため、
 * 「生成物は手で整形しない」というリポジトリの規約と衝突する。
 */
export function ToastStack(props: ToastStackProps) {
  if (props.toasts.length === 0) return null
  return (
    // z-60: **モーダルより前面に出す**（ダイアログの overlay / content は z-50）。
    // 二択ダイアログ表示中に出る「選ぶまで閉じられません」の通知は、z-50 のままだと
    // オーバーレイのぼかしの下に描画されて読めない——閉じられない理由を
    // 伝える唯一の手段が、それを出す場面でだけ読めないという壊れ方になる
    <div
      className="pointer-events-none fixed bottom-4 left-0 z-60 flex flex-col items-center gap-2 px-4"
      style={{ right: props.rightInset ?? 0 }}
    >
      {props.toasts.map((toast) => (
        <ToastRow
          key={toast.id}
          toast={toast}
          onDismiss={props.onDismiss}
          inert={props.modalOpen ?? false}
        />
      ))}
    </div>
  )
}

function ToastRow(props: {
  toast: ToastItem
  onDismiss: (id: number) => void
  /** true なら表示だけ（モーダル中） */
  inert: boolean
}) {
  const { toast, onDismiss, inert } = props
  const action = toast.action
  const weak = isWeakToast(toast)
  // ポインタを載せている間は消さない。読んでいる最中や「閉じる」へ
  // 手を伸ばした瞬間に消えると、別の通知や下の表を押してしまう
  const [hovered, setHovered] = useState(false)

  // 同じ key の通知に置き換わると id が変わり、行ごと作り直されて数え直しになる
  useEffect(() => {
    if (!weak || hovered) return
    const timer = setTimeout(() => onDismiss(toast.id), WEAK_TOAST_MS)
    return () => clearTimeout(timer)
  }, [weak, hovered, toast.id, onDismiss])

  return (
    <div
      role="status"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={`w-96 max-w-full rounded-sm bg-toast px-3 py-2 text-base leading-normal text-toast-fg shadow-md ${
        inert ? '' : 'pointer-events-auto'
      }`}
    >
      <p>{toast.message}</p>
      <div className="mt-1 flex items-center gap-3">
        {action !== undefined && (
          <button
            type="button"
            disabled={inert}
            className={`${buttonBase} text-sm text-toast-fg underline`}
            onClick={() => void action.run()}
          >
            {action.label}
          </button>
        )}
        <button
          type="button"
          aria-label="通知を閉じる"
          disabled={inert}
          className={`${buttonBase} ml-auto text-sm text-toast-fg hover:underline`}
          onClick={() => onDismiss(toast.id)}
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
