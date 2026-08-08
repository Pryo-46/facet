import type { ToastItem } from '@/core/toasts'

export interface ToastStackProps {
  toasts: readonly ToastItem[]
  onDismiss: (id: number) => void
}

/**
 * 非モーダル通知（rev 3章。外部変更を読み込んだことを知らせる）。
 *
 * **時間では消えない。閉じるまで残す。** 当初は操作の付かない通知だけ6秒で
 * 自動消去していたが、実機確認で「外部変更のトーストを見逃したのか、
 * そもそも出ていないのか」が区別できず、検証の妨げになった。会議中に画面から
 * 目を離していれば6秒は確実に見逃す時間であり、「外部が仕様ファイルを
 * 書き換えた」は見逃してよい出来事ではない——**問題は消せなくして見せる**
 * （rev 5章）という思想を、通知にも適用する。溜まり過ぎは `MAX_TOASTS` の
 * 上限と、同じファイルの通知を `key` で置き換える仕組みで抑える。
 *
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
