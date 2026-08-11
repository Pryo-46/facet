import { STEP_SHAPE_LABEL, STEP_SHAPE_ORDER, type StepShapeValue } from './commands'

export interface StepShapeCellProps {
  value: StepShapeValue
  'aria-label': string
  'data-cell': string
  onChange: (next: StepShapeValue) => void
  onFieldKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void
}

/**
 * kind × awaitsReply の1トグルセル。データは2フィールドだが、画面は
 * 「呼出／呼出（応答なし）／応答／内部処理」の4値1セル（design-notes 未確定
 * リストの決着——Tab の停止が1つ減る）。↑↓で循環。select 要素にしないのは
 * ネイティブのドロップダウン UI がキャンバスの transform の外に出るため
 */
export function StepShapeCell(props: StepShapeCellProps) {
  const cycle = (delta: -1 | 1): void => {
    const at = STEP_SHAPE_ORDER.indexOf(props.value)
    const next = (at + delta + STEP_SHAPE_ORDER.length) % STEP_SHAPE_ORDER.length
    props.onChange(STEP_SHAPE_ORDER[next])
  }
  return (
    <button
      type="button"
      className="w-full rounded-sm border border-rule bg-surface px-1.5 py-0.5 text-left text-sm text-ink-muted outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
      aria-label={props['aria-label']}
      data-cell={props['data-cell']}
      onClick={() => cycle(1)}
      onKeyDown={(e) => {
        // 修飾キー付きの矢印は操作言語のもの（Alt+↑↓＝並び替え）。素の ↑↓ だけが循環
        if (
          (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
          !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
        ) {
          e.preventDefault()
          cycle(e.key === 'ArrowUp' ? -1 : 1)
          return
        }
        props.onFieldKeyDown?.(e)
      }}
    >
      {STEP_SHAPE_LABEL[props.value]}
    </button>
  )
}
