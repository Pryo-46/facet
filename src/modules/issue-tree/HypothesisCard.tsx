import { Fragment } from 'react'
import { buttonBase } from '@/components/button-styles'
import { CellInput, type FieldState } from '@/components/CellInput'
import type { Rect } from '@/core/canvas/viewport'
import type { JudgementEvent } from '@/types/issue-tree'
import { hypothesisCellKey, type HypothesisCell } from './cell-keys'
import { EVENT_KIND_LABELS, QUESTION_LABELS, type HypothesisQuestions } from './derive'
import type { HypothesisPlacement } from './layout'
import { CARD_BORDER, CARD_BOX_CLASS } from './measure'

/**
 * `data-cell` の値は `./cell-keys` が作る。**ここに書き写さないこと**
 *——エディタは同じ文字列でフォーカスの予約を引くので、2つ目のコピーが
 * できると「予約したのに当たらない」が静かに起きる（cell-keys.ts の解説）
 */

export interface HypothesisCardProps {
  /** 行の鍵（`computeRowKeys`）。`data-cell` はこれから作る */
  hypothesisKey: string
  /** アクセシブル名の接頭（`仮説{N}`） */
  label: string
  /** レイアウトが返した矩形。**カードは寸法を再計算しない** */
  placement: HypothesisPlacement
  text: string
  rationale: string
  notes: readonly string[]
  events: readonly JudgementEvent[]
  /** 立っている問い（`poseQuestions` の結果） */
  questions: HypothesisQuestions
  /** 整合性検証で赤表示の対象になっているか */
  invalid: boolean
  /** 祖先の見送りで抑制されているか */
  suppressed: boolean
  onTextChange: (next: string) => void
  onRationaleChange: (next: string) => void
  onNoteChange: (noteIndex: number, next: string) => void
  /** **最新イベントの根拠だけが編集できる**（`setEventNote` が同じ規則を持つ） */
  onEventNoteChange: (eventIndex: number, next: string) => void
  /** FBメモ1件を最新イベントの根拠へ移す */
  onPromoteNote: (noteIndex: number) => void
  onFieldKeyDown?: (e: React.KeyboardEvent, state: FieldState, cell: HypothesisCell) => void
  /**
   * 判断イベントのドロップダウン。エディタが menuPropsFor で組んで渡す。
   *
   * **必須にしてある**（`IssueBox` の `deferralMenu` と同じ）——省略できると、
   * 仮説に判断を付ける動線がマウスから消えていても型は通り、
   * 画面は一見正常なまま「押す場所が無い」になる
   */
  judgementMenu: React.ReactNode
}

// **面と枠のクラスは片方だけ出す。** bg-surface と bg-warning/10 を両方
// 並べても、勝つのは生成 CSS の順序であってクラス名の順序ではない（M8）
const errorCell = 'bg-warning/20' // 整合性検証の赤（entityIndex が指す欄）
const warnCell = 'bg-warning/10' // 立っている問い（未決）

/**
 * 入力欄の共通クラス。**面と文字色を持たない**——カードの面の上に透明で乗り、
 * 文字色はカードから継承する（抑制された配下がそのまま地の色に落ちる）。
 *
 * 余白も持たない。カードの余白は枠が1度だけ持っており（`CARD_INSET_*`）、
 * レイアウトは各行を「余白 0」で測っている。ここで padding を足すと
 * ブラウザが測定より早く折り返して文字が切れる
 */
const inputClass =
  'h-full w-full resize-none overflow-hidden bg-transparent whitespace-pre-wrap break-all outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-inset focus:ring-ring'

/**
 * 問いのバッジとイベント種別ラベルの行。**`BADGE_HEIGHT`（20px）ちょうどで
 * 描くこと。**行の高さは矩形が与えるので、ここに縦の余白を足して膨らませない
 * ——描画が測定より高くなると、カード全体が測定より高くなって下の行が
 * はみ出す。`leading-5` は 20px 行送り＝矩形と同じ高さで、text-xs の文字を
 * その中で縦に揃える
 */
const badgeRowClass = 'absolute overflow-hidden text-xs leading-5 font-medium select-none'

/**
 * 仮説カード1枚。**レイアウトが返した矩形へそのまま絶対配置で置くだけで、
 * 寸法を再計算しない**（`autoSize={false}`）。
 *
 * イベントの列は追記専用なので、**根拠を編集できるのは最新イベントだけ**。
 * 過去のイベントは静的テキストで描く——ここを `CellInput` にすると、
 * 「そのとき何を根拠に決めたか」が後から書き換わる（`setEventNote` が
 * データ側で塞いでいる約束を、画面側でも塞ぐ）
 */
export function HypothesisCard(props: HypothesisCardProps) {
  const { placement, label, events, notes, questions } = props
  const rect = placement.rect
  const warn = questions.result || questions.judgement

  // 抑制された配下は「作業する面ではない」ことを地の色で見せる。
  // **opacity で薄くしない**——文字のコントラストが検算した値を割る
  const face = props.invalid
    ? `border-warning ${errorCell} text-ink`
    : props.suppressed
      ? 'border-rule bg-canvas text-ink-muted'
      : warn
        ? `border-warning ${warnCell} text-ink`
        : 'border-rule bg-surface text-ink'

  /**
   * 世界座標の矩形を、カードの中の位置へ直す。**枠線ぶん戻すのを忘れないこと**
   * ——絶対配置の原点はボーダーボックスではなくパディングボックスであり、
   * レイアウトが返す `CARD_INSET_X`（余白＋枠線）はカードの左上から測ってある。
   *
   * 中身は全部これで置くので、枠が持つ `CARD_BOX_CLASS` の `px`/`py` は
   * 位置に効かない（絶対配置の原点はパディングを含まない）。**それでも
   * 外さないこと**——`CARD_INSET_*` と対になっている値であり、
   * 片方だけ動かすと測定と描画がずれる（measure.ts の約束）
   */
  const inCard = (r: Rect): React.CSSProperties => ({
    left: r.x - rect.x - CARD_BORDER,
    top: r.y - rect.y - CARD_BORDER,
    width: r.width,
    height: r.height,
  })

  const badgeText = [
    questions.result ? QUESTION_LABELS.result : null,
    questions.judgement ? QUESTION_LABELS.judgement : null,
  ]
    .filter((t) => t !== null)
    .join('・')

  return (
    <div
      // 操作を受けるのはカードの矩形だけ——レイヤ全面が受けると、下にある
      // 空状態のボタンや背景（パン）に触れなくなる（レイヤは
      // pointer-events-none で、中の要素が auto に戻す）
      className={`pointer-events-auto absolute rounded-sm ${CARD_BOX_CLASS} ${face}`}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      <div className="absolute" style={inCard(placement.text)}>
        <CellInput
          multiline
          autoSize={false}
          className={`${inputClass} text-sm`}
          aria-label={label}
          data-cell={hypothesisCellKey(props.hypothesisKey, { cell: 'hypothesis' })}
          value={props.text}
          onValueChange={props.onTextChange}
          onFieldKeyDown={(e, state) => props.onFieldKeyDown?.(e, state, { cell: 'hypothesis' })}
        />
      </div>

      {/* 立っている問い。**読み取り専用の表示**だが `aria-hidden` にはしない
          ——カードの面（warnCell）が運んでいる未決を、音声にも出す */}
      {placement.badge !== null && badgeText !== '' && (
        <div className={badgeRowClass} style={inCard(placement.badge)}>
          {badgeText}
        </div>
      )}

      <div className="absolute" style={inCard(placement.rationale)}>
        <CellInput
          multiline
          autoSize={false}
          className={`${inputClass} text-xs`}
          aria-label={`${label} の由来`}
          placeholder="由来（任意）"
          data-cell={hypothesisCellKey(props.hypothesisKey, { cell: 'rationale' })}
          value={props.rationale}
          onValueChange={props.onRationaleChange}
          onFieldKeyDown={(e, state) => props.onFieldKeyDown?.(e, state, { cell: 'rationale' })}
        />
      </div>

      {placement.notes.map((r, i) => (
        <div key={i} className="group/note absolute" style={inCard(r)}>
          <CellInput
            multiline
            autoSize={false}
            className={`${inputClass} text-xs`}
            aria-label={`${label} のメモ${i + 1}`}
            data-cell={hypothesisCellKey(props.hypothesisKey, { cell: 'note', noteIndex: i })}
            value={notes[i] ?? ''}
            onValueChange={(next) => props.onNoteChange(i, next)}
            onFieldKeyDown={(e, state) =>
              props.onFieldKeyDown?.(e, state, { cell: 'note', noteIndex: i })
            }
          />
          {/* **イベントが1件以上あるときだけ出す**（0件では移動先が無く、
              押しても何も起きないボタンになる）。
              **常時は出さない**——メモ行の幅は測定した折り返し幅そのもので、
              上に不透明なボタンを重ねると1行目の末尾が読めなくなる。
              ホバーだけでなく focus-within でも出すので、キーボードでは
              メモ欄から Tab で辿り着ける（`visibility` なので、見えている
              あいだだけフォーカスを受ける） */}
          {events.length > 0 && (
            <button
              type="button"
              className={`${buttonBase} invisible absolute top-0 right-0 border border-rule bg-surface px-1 text-xs group-hover/note:visible group-focus-within/note:visible hover:bg-canvas`}
              aria-label={`${label} のメモ${i + 1} を根拠へ移す`}
              onClick={() => props.onPromoteNote(i)}
            >
              根拠へ
            </button>
          )}
        </div>
      ))}

      {placement.events.map((rects, j) => {
        const event = events[j]
        if (event === undefined) return null
        const kindLabel = EVENT_KIND_LABELS[event.kind]
        // 追記専用の列。最新だけが編集できる
        const latest = j === events.length - 1
        return (
          <Fragment key={j}>
            <div className={badgeRowClass} style={inCard(rects.label)}>
              {kindLabel}
            </div>
            <div className="absolute" style={inCard(rects.note)}>
              {latest ? (
                <CellInput
                  multiline
                  autoSize={false}
                  className={`${inputClass} text-xs`}
                  aria-label={`${label} の${kindLabel}の根拠`}
                  data-cell={hypothesisCellKey(props.hypothesisKey, {
                    cell: 'event',
                    eventIndex: j,
                  })}
                  value={event.note}
                  onValueChange={(next) => props.onEventNoteChange(j, next)}
                  onFieldKeyDown={(e, state) =>
                    props.onFieldKeyDown?.(e, state, { cell: 'event', eventIndex: j })
                  }
                />
              ) : (
                <div className="h-full w-full overflow-hidden text-xs whitespace-pre-wrap break-all">
                  {event.note}
                </div>
              )}
            </div>
          </Fragment>
        )
      })}

      {/* 判断のドロップダウン。**カードの外の右へ逃がす**——中に重ねると
          文言に被る（IssueBox の見送りと同じ理由。列の間隔に収まる大きさに
          留めること）。開閉の状態は親（エディタ）が持つ */}
      <div className="absolute top-0 left-full ml-1">{props.judgementMenu}</div>
    </div>
  )
}
