import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { STEP_SHAPE_LABEL, STEP_SHAPE_ORDER, type StepShapeValue } from './commands'

export interface StepShapeCellProps {
  value: StepShapeValue
  'aria-label': string
  'data-cell': string
  onChange: (next: StepShapeValue) => void
  /** メニューの開閉。開いている間キャンバスのズーム・パンを止めるために親が使う */
  onOpenChange?: (open: boolean) => void
  onFieldKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void
}

/**
 * kind × awaitsReply の1セル。データは2フィールドだが、画面は
 * 「呼出／呼出（応答なし）／応答／内部処理」の4値1セル。
 *
 * **マウスはメニュー、キーボードは ↑↓ の巡回**（sequence M3）。M2 で入れた
 * クリック巡回は、クリックが「開く」になるので消えた——4値に対して最大3クリックが
 * 1クリックになる上位互換である。
 *
 * ネイティブの `select` にしないのは、ブラウザ既定のドロップダウンが
 * キャンバスの transform を無視して出るため。Radix は portal ＋ anchor の
 * `getBoundingClientRect` で画面座標に出すので、transform 下でも位置が合い、
 * ズームで拡大縮小もしない（等倍で読める側に倒れる）
 */
export function StepShapeCell(props: StepShapeCellProps) {
  const cycle = (delta: -1 | 1): void => {
    const at = STEP_SHAPE_ORDER.indexOf(props.value)
    const next = (at + delta + STEP_SHAPE_ORDER.length) % STEP_SHAPE_ORDER.length
    props.onChange(STEP_SHAPE_ORDER[next])
  }
  return (
    <DropdownMenu onOpenChange={props.onOpenChange}>
      <DropdownMenuTrigger
        type="button"
        className="w-full rounded-sm border border-rule bg-surface px-1.5 py-0.5 text-left text-sm text-ink-muted outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
        aria-label={props['aria-label']}
        data-cell={props['data-cell']}
        onKeyDown={(e) => {
          // 修飾キー付きの矢印は操作言語のもの（Alt+↑↓＝並び替え）。素の ↑↓ だけが循環
          if (
            (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
            !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
          ) {
            // **preventDefault が Radix の「↓ で開く」を止めている。**
            // Radix の Trigger は composeEventHandlers(props.onKeyDown, 内部) の形で
            // 組んでおり、ここで defaultPrevented を立てると内部ハンドラが降りる。
            // 外すと ↓ が巡回ではなくメニュー開きになる
            e.preventDefault()
            cycle(e.key === 'ArrowUp' ? -1 : 1)
            return
          }
          // Enter / Space も Radix はメニューを開くキーとして取る。**トリガーは
          // ポインタでだけ開く**——Enter はステップ追加（操作言語）であり、
          // 開かれるとキーボードの動線が M2 までと変わってしまう
          if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
          props.onFieldKeyDown?.(e)
        }}
      >
        {STEP_SHAPE_LABEL[props.value]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {STEP_SHAPE_ORDER.map((shape) => (
          <DropdownMenuItem key={shape} onSelect={() => props.onChange(shape)}>
            {STEP_SHAPE_LABEL[shape]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
