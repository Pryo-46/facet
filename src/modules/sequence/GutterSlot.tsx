import { CellInput, type FieldState } from '@/components/CellInput'
import { ANSWER_BOX_CLASS, gutterLabelText } from './measure'

export type SlotState = 'unanswered' | 'handled' | 'notApplicable'

/** ifExecuted（下位問い）のインデント幅。行高の測定側（SequenceEditor）も読む */
export const GUTTER_INDENT = 16

export interface GutterSlotProps {
  /** 問いの文言（questionLabels の値）。ラベル列に出す */
  question: string
  /** ifExecuted はインデントして下位問いであることを見せる */
  indent: boolean
  state: SlotState
  text: string
  'aria-label': string
  'data-cell': string
  x: number
  y: number
  labelWidth: number
  answerWidth: number
  height: number
  onTextChange: (next: string) => void
  onFieldKeyDown?: (e: React.KeyboardEvent, state: FieldState) => void
}

/**
 * 問いスロット1つ（design-notes 論点7）。
 * 未定義＝`missing` の淡い面＋破線の枠（rev 9章 規約2。M21 の実機確認で
 * 「破線だけではガターのスロットが方眼に埋もれて拾えない」と判断して面を足した）。
 * handled＝無地・通常文字。notApplicable＝無地・ink-muted＋「─ 考慮不要」の接頭。
 * 3状態の切替は Ctrl+Enter（toggle-item-state）で、キーの解釈は
 * エディタ側の resolveCommand が行う——ここはキーの意味を決めない
 */
export function GutterSlot(props: GutterSlotProps) {
  const face =
    props.state === 'unanswered'
      ? 'border-dashed border-missing bg-missing-face text-ink-muted'
      : props.state === 'notApplicable'
        ? 'border-rule bg-surface text-ink-muted'
        : 'border-rule bg-surface text-ink'
  const indentPad = props.indent ? GUTTER_INDENT : 0
  return (
    <div
      className="pointer-events-auto absolute flex items-stretch gap-1"
      style={{ left: props.x + indentPad, top: props.y, height: props.height }}
    >
      <div
        className="shrink-0 py-1 text-xs text-ink-muted"
        style={{ width: props.labelWidth - indentPad }}
      >
        {gutterLabelText(props.question, props.indent)}
      </div>
      <div className="relative" style={{ width: props.answerWidth }}>
        {props.state === 'notApplicable' && (
          <span aria-hidden="true" className="pointer-events-none absolute left-2 top-1 text-sm">
            ─
          </span>
        )}
        <CellInput
          multiline
          autoSize={false}
          className={`h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-all rounded-sm ${ANSWER_BOX_CLASS} ${face} ${
            props.state === 'notApplicable' ? 'pl-6' : ''
          } text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-ring`}
          aria-label={props['aria-label']}
          data-cell={props['data-cell']}
          value={props.text}
          placeholder={props.state === 'unanswered' ? '未定義' : undefined}
          onValueChange={props.onTextChange}
          onFieldKeyDown={props.onFieldKeyDown}
        />
      </div>
    </div>
  )
}
