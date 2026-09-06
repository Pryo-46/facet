import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  /** 既定は「キャンセル」 */
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 確認ダイアログ（額縁のファイル操作用）。
 *
 * **開いている間は呼び出し側が KeyContext.modalOpen を true にすること。**
 * 操作言語を止めないと、Esc をダイアログとエディタで取り合う（rev 10章の
 * 境界規則。resolveCommand に配線点を作ってある）。
 *
 * 用語の削除に確認は挟まない（rev 5章。会議中の入力速度を削ぐため）。
 * 確認するのは「ファイルの削除」など、Undo で取り消せない操作だけ。
 *
 * `description` は改行を含みうる（出力前の確認が指摘を箇条書きで並べる）。
 * `<p>` は既定で改行を潰すので `whitespace-pre-line` を当てている
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(next) => {
        // Esc・オーバーレイクリックはどちらも「閉じる」に落ちてくる
        if (!next) props.onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">
            {props.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{props.cancelLabel ?? 'キャンセル'}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // AlertDialogAction も内部実装は AlertDialogCancel と同じ Dialog.Close で、
              // クリックすると onOpenChange(false) も発火してしまう（Radix の仕様）。
              // これを止めないと確認クリックのたびに onCancel まで呼ばれる。
              // preventDefault で内部の close 発火を止め、経路を onConfirm 一本にする。
              event.preventDefault()
              props.onConfirm()
            }}
          >
            {props.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
