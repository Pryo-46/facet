import { useEffect } from 'react'
import type { ToastItem } from '@/core/toasts'

/** 操作の付かない通知が自動で消えるまで */
export const TOAST_AUTO_DISMISS_MS = 6000

export interface ToastStackProps {
  toasts: readonly ToastItem[]
  onDismiss: (id: number) => void
}

/**
 * 非モーダル通知（rev 3章。外部変更を読み込んだことを知らせる）。
 * shadcn の sonner は使わない——生成物が next-themes を import するため、
 * 「生成物は手で整形しない」というリポジトリの規約と衝突する（M5 で確定）。
 * 見た目は既存の役割トークンの流用で仮置き。確定は M7
 */
export function ToastStack(props: ToastStackProps) {
  if (props.toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
      {props.toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={props.onDismiss} />
      ))}
    </div>
  )
}

function ToastRow(props: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const { toast, onDismiss } = props
  const action = toast.action
  // 操作付きは自動で消さない（rev 3章。退避の復元手段を時間切れで失わない）
  const autoDismiss = action === undefined
  useEffect(() => {
    if (!autoDismiss) return
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [autoDismiss, onDismiss, toast.id])

  return (
    <div
      role="status"
      className="pointer-events-auto rounded-sm border border-rule bg-surface px-3 py-2 text-sm text-ink shadow-sm"
    >
      <p>{toast.message}</p>
      <div className="mt-1 flex items-center gap-3">
        {action !== undefined && (
          <button
            type="button"
            className="text-xs text-ink underline"
            onClick={() => void action.run()}
          >
            {action.label}
          </button>
        )}
        <button
          type="button"
          aria-label="通知を閉じる"
          className="ml-auto text-xs text-ink-muted hover:text-ink"
          onClick={() => onDismiss(toast.id)}
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
