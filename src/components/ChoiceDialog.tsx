import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export interface ChoiceDialogProps {
  open: boolean
  title: string
  description: string
  primaryLabel: string
  secondaryLabel: string
  onPrimary: () => void
  onSecondary: () => void
}

/**
 * 二択ダイアログ（外部変更の衝突。rev 3章。マージ UI は作らない）。
 *
 * **キャンセルも Esc もオーバーレイクリックも無い。** どちらの選択にも副作用が
 * あり、決めないまま閉じると「自分の編集も保存されず、外部変更も取り込まれない」
 * 宙ぶらりんが残る（検知した時点でそのファイルの自動保存は止めてある）。
 * かといって Esc を「上書き」に割り当てると、外部変更の破棄が最も押しやすい
 * キーになってしまう。だから明示的な選択だけを受ける。
 *
 * **開いている間は呼び出し側が KeyContext.modalOpen を true にすること**
 *（配線点は3箇所。ConfirmDialog と同じ。rev 10章の境界規則）。
 *
 * 両ボタンで preventDefault してから handler を呼ぶ——Radix の
 * AlertDialogAction は内部が Dialog.Close なので、放っておくと
 * onOpenChange も発火する（M4 で踏んだ罠）。
 * 見た目は shadcn の既定トークンのままで、役割トークンへの寄せは M7
 */
export function ChoiceDialog(props: ChoiceDialogProps) {
  return (
    <AlertDialog open={props.open}>
      {/* onOpenChange を渡さない＝内部からの close 要求は全部無視される。
          Esc は Radix が独自に拾うので明示的に止める */}
      <AlertDialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            variant="outline"
            onClick={(event) => {
              event.preventDefault()
              props.onSecondary()
            }}
          >
            {props.secondaryLabel}
          </AlertDialogAction>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault()
              props.onPrimary()
            }}
          >
            {props.primaryLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
