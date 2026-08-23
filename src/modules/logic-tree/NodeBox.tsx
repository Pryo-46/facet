import { CellInput, type FieldState } from '@/components/CellInput'
import { NODE_BOX_CLASS } from './measure'

export interface NodeBoxProps {
  /** DOM 上の識別子。フォーカス移動が querySelector で引く */
  nodeKey: string
  label: string
  text: string
  x: number
  y: number
  width: number
  height: number
  /** 整合性検証で赤表示の対象になっているか */
  invalid: boolean
  onTextChange: (next: string) => void
  onFieldKeyDown?: (e: React.KeyboardEvent, state: FieldState) => void
}

/**
 * ノード1つ。**入力欄は常に textarea で、フォーカスされている＝編集中。**
 * 用語集のセルと同じ模型で、IME・ドラフト・Undo 反映は CellInput が持つ。
 *
 * 高さは測定層が決めた値を CSS で当てる（autoSize={false}）。折り返しは
 * `break-all`——測定層のコードポイント単位のグリーディと同じ規則にすることで、
 * ブラウザが測定より早く折り返して文字が切れることを防ぐ
 */
export function NodeBox(props: NodeBoxProps) {
  // 無効は `invalid` の枠＋淡い面（rev 9章 規約2）
  const face = props.invalid ? 'border-invalid bg-invalid-face' : 'border-rule bg-surface'
  return (
    <div
      // ノードのレイヤは pointer-events-none で操作を通す。操作を受けるのは
      // この矩形だけ——レイヤ全面が受けると、下にある空状態のボタンや
      // 背景（Task 11 のパン）に触れなくなる
      className="pointer-events-auto absolute"
      style={{ left: props.x, top: props.y, width: props.width, height: props.height }}
    >
      <CellInput
        multiline
        autoSize={false}
        className={`h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-all rounded-sm ${NODE_BOX_CLASS} ${face} text-sm text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-ring`}
        aria-label={props.label}
        data-cell={props.nodeKey}
        value={props.text}
        onValueChange={props.onTextChange}
        onFieldKeyDown={props.onFieldKeyDown}
      />
    </div>
  )
}
