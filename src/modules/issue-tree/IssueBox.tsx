import { CellInput, type FieldState } from '@/components/CellInput'
import { QUESTION_LABELS } from './derive'
import { ISSUE_BOX_CLASS } from './measure'

export interface IssueBoxProps {
  nodeKey: string
  /** ノードの文言。空なら「（未記入）」を含む名前になる */
  label: string
  text: string
  rect: { x: number; y: number; width: number; height: number }
  invalid: boolean
  suppressed: boolean
  /** 「仮説は？」が立っているか */
  warn: boolean
  onTextChange: (next: string) => void
  onFieldKeyDown?: (e: React.KeyboardEvent, state: FieldState) => void
  /** 見送りのドロップダウン。エディタが menuPropsFor で組んで渡す */
  deferralMenu: React.ReactNode
}

// **面と枠のクラスは片方だけ出す。** bg-surface と bg-warning/10 を両方
// 並べても、勝つのは生成 CSS の順序であってクラス名の順序ではない（M8）
const errorCell = 'bg-warning/20' // 整合性検証の赤（entityIndex が指す欄）
const warnCell = 'bg-warning/10' // 立っている問い（未決）

/**
 * 課題ノード1つ。**入力欄は常に textarea で、フォーカスされている＝編集中**
 *（`src/modules/logic-tree/NodeBox.tsx` と同じ模型。IME・ドラフト・Undo 反映は
 * `CellInput` が持つ）。高さは測定層が決めた値を CSS で当てる（`autoSize={false}`）。
 *
 * ロジックツリーのノードとの差は3つ:
 *
 * 1. 面が4種類ある（整合性エラー／抑制／未決／通常）
 * 2. 立っている問い（`QUESTION_LABELS.hypothesis`）を**枠の外のバッジにしない。**
 *    キャンバス上の絶対配置なので、枠外に出すと測定した矩形と描画がずれる。
 *    問いは面（`warnCell`）とプレースホルダで見せ、文言はスクリーンリーダ向けに
 *    `aria-label` の後半へ入れる
 * 3. 見送りのドロップダウンを置く枠がある。**開閉の状態は親（エディタ）が持つ**
 *    ——同時に1つのドロップダウンしか開かない（rev 10章 境界規則の例外。
 *    sequence M3 で確定した形）
 */
export function IssueBox(props: IssueBoxProps) {
  // 抑制された配下は「作業する面ではない」ことを地の色で見せる。
  // **opacity で薄くしない**——文字のコントラストが検算した値を割る
  const face = props.invalid
    ? `border-warning ${errorCell} text-ink`
    : props.suppressed
      ? 'border-rule bg-canvas text-ink-muted'
      : props.warn
        ? `border-warning ${warnCell} text-ink`
        : 'border-rule bg-surface text-ink'
  // 未記入と立っている問いは名前の後半に付ける。**前半（`課題{N}`）は動かさない**
  // ——エディタのテストが前方一致で引く
  const name = `${props.label}${props.text === '' ? '（未記入）' : ''}${
    props.warn ? ` ${QUESTION_LABELS.hypothesis}` : ''
  }`
  return (
    <div
      // ノードのレイヤは pointer-events-none で操作を通す。操作を受けるのは
      // この矩形だけ——レイヤ全面が受けると、下にある空状態のボタンや
      // 背景（パン）に触れなくなる
      className="pointer-events-auto absolute"
      style={{
        left: props.rect.x,
        top: props.rect.y,
        width: props.rect.width,
        height: props.rect.height,
      }}
    >
      <CellInput
        multiline
        autoSize={false}
        className={`h-full w-full resize-none overflow-hidden rounded-sm whitespace-pre-wrap break-all ${ISSUE_BOX_CLASS} ${face} text-sm outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-inset focus:ring-ring`}
        aria-label={name}
        placeholder={props.warn ? QUESTION_LABELS.hypothesis : undefined}
        data-cell={props.nodeKey}
        value={props.text}
        onValueChange={props.onTextChange}
        onFieldKeyDown={props.onFieldKeyDown}
      />
      {/* **枠の中に重ねない。** 文言は枠いっぱいに折り返してよいことに
          なっており（測定層がそう測っている）、上に重ねると1行目の末尾が
          読めなくなる。右へ逃がすぶんは列の間隔（COLUMN_GAP = 48）の中に
          収まる大きさに留めること */}
      <div className="absolute top-0 left-full ml-1">{props.deferralMenu}</div>
    </div>
  )
}
