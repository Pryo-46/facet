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

export interface ChoiceDialogProps {
  open: boolean
  title: string
  description: string
  primaryLabel: string
  secondaryLabel: string
  onPrimary: () => void
  onSecondary: () => void
  /**
   * **任意。** 渡したときだけキャンセルのボタンが出て、Esc も効くようになる。
   *
   * 既定（渡さない）が「キャンセルも Esc も無い」なのは、外部変更の衝突では
   * どちらの選択にも副作用があり、決めないまま閉じると宙ぶらりんが残るため
   * （下の JSDoc を参照）。**取り込みのようにキャンセルが正しい選択に
   * なりうる場面でだけ渡す**（logic-tree M2）
   */
  onCancel?: () => void
  /** キャンセルのボタンの文言。onCancel を渡すときだけ意味がある。既定は「キャンセル」 */
  cancelLabel?: string
}

/**
 * 二択ダイアログ（外部変更の衝突。rev 3章。マージ UI は作らない）。
 *
 * **既定はキャンセルも Esc もオーバーレイクリックも無い。** どちらの選択にも
 * 副作用があり、決めないまま閉じると「自分の編集も保存されず、外部変更も
 * 取り込まれない」宙ぶらりんが残る（検知した時点でそのファイルの自動保存は
 * 止めてある）。かといって Esc を「上書き」に割り当てると、外部変更の破棄が
 * 最も押しやすいキーになってしまう。だから既定では明示的な選択だけを受ける。
 *
 * **`onCancel` は任意の逃げ道。** 渡したときだけキャンセルのボタンと Esc が
 * 有効になる（logic-tree M2、`ChoiceDialogProps.onCancel` 参照）。上の理由が
 * 消えたわけではないので既定は変えていない——「不便だから全部にキャンセルを
 * 付ける」という判断はしないこと。渡すのは、キャンセルしても宙ぶらりんが
 * 残らない場面（例: 外部データの取り込み。やめても今の状態がそのまま残る
 * だけ）だけに限る。
 *
 * **開いている間は呼び出し側が KeyContext.modalOpen を true にすること**
 *（配線点は3箇所。ConfirmDialog と同じ。rev 10章の境界規則）。
 *
 * どのボタンも preventDefault してから handler を呼ぶ——Radix の
 * AlertDialogAction/AlertDialogCancel は内部が Dialog.Close なので、放っておくと
 * onOpenChange も発火する（M4 で踏んだ罠）。
 * 見た目は shadcn の既定トークンのままで、役割トークンへの寄せは M7
 */
export function ChoiceDialog(props: ChoiceDialogProps) {
  return (
    <AlertDialog open={props.open}>
      {/* onOpenChange を渡さない＝内部からの close 要求は全部無視される。
          Esc は Radix が独自に拾うので明示的に止める。
          onCancel があるときだけ通す（無いダイアログは「決めるまで閉じない」既定を維持） */}
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          if (props.onCancel === undefined) {
            event.preventDefault()
            return
          }
          event.preventDefault()
          props.onCancel()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {props.onCancel !== undefined && (
            <AlertDialogCancel
              onClick={(event) => {
                // AlertDialogCancel も内部実装は Dialog.Close で、放っておくと
                // onOpenChange 相当の close 要求が発火する。ChoiceDialog は
                // onOpenChange を渡していない（内部からの close 要求を全部無視する
                // 設計）ので、そのままでは何も起きず onCancel も呼ばれない。
                // preventDefault で内部の close 発火を止め、経路を onCancel 一本にする
                // （ConfirmDialog の AlertDialogAction と同じ罠。M4 で踏んだ）
                event.preventDefault()
                props.onCancel?.()
              }}
            >
              {props.cancelLabel ?? 'キャンセル'}
            </AlertDialogCancel>
          )}
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
