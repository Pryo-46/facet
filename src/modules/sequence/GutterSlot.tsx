import { CellInput, type FieldState } from '@/components/CellInput'
import { ANSWER_BOX_CLASS, gutterLabelText } from './measure'
import { NOT_APPLICABLE_LABEL } from './output-labels'

export type SlotState = 'unanswered' | 'handled' | 'notApplicable'

/** ifExecuted（下位問い）のインデント幅。行高の測定側（SequenceEditor）も読む */
export const GUTTER_INDENT = 16

export interface GutterSlotProps {
  /** 問いの文言（questionLabels の値）。ラベル列に出す */
  question: string
  /**
   * 問いの具体例（questionHints の値）。ラベルの `title` に出す。
   * **ラベル本体は抽象のまま保つ**——問いは知識状態に立てるので、原因の例示は
   * ここだけで行う（questions.ts の questionHints の注記）。空文字なら出さない
   */
  hint: string
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
 * 未回答＝`missing` の淡い面＋破線の枠（rev 9章 規約2。M21 の実機確認で
 * 「破線だけではガターのスロットが方眼に埋もれて拾えない」と判断して面を足した。
 * M22 で placeholder の「未定義」を消した——欠落は面が示すもので、
 * データに無い語を空欄に書き込んで見せるものではない）。
 * handled＝無地・通常文字。notApplicable＝無地・ink-muted＋「考慮不要」の接頭
 * （M22。以前は `─` の記号だけだったが、初見に意図が伝わらないため語にした）。
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
        className="shrink-0 py-1 text-sm text-ink-muted"
        style={{ width: props.labelWidth - indentPad }}
        // ブラウザ既定のツールチップを使う。Radix の Tooltip にしないのは、
        // ラベル列がキャンバスの transform 層にあり portal の座標合わせが要るのに対し、
        // これは「初めての人が一度確認する」用途で、確実に出ることが見た目に優先するため
        title={props.hint === '' ? undefined : props.hint}
      >
        {gutterLabelText(props.question, props.indent)}
      </div>
      <div className="relative" style={{ width: props.answerWidth }}>
        {props.state === 'notApplicable' && (
          <span aria-hidden="true" className="pointer-events-none absolute left-2 top-1 text-sm leading-normal">
            {NOT_APPLICABLE_LABEL}
          </span>
        )}
        <CellInput
          multiline
          autoSize={false}
          className={`h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-all rounded-sm ${ANSWER_BOX_CLASS} ${face} ${
            props.state === 'notApplicable' ? 'pl-18' : ''
          } text-sm leading-normal outline-none focus:ring-2 focus:ring-inset focus:ring-ring`}
          aria-label={props['aria-label']}
          data-cell={props['data-cell']}
          value={props.text}
          onValueChange={props.onTextChange}
          onFieldKeyDown={props.onFieldKeyDown}
        />
      </div>
    </div>
  )
}
