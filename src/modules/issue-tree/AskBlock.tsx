import {
  CircleHelp,
  MessageSquare,
  Plus,
  ThumbsUp,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/Badge'
import { buttonBase } from '@/components/button-styles'
import { CellInput } from '@/components/CellInput'
import type { Rect } from '@/core/canvas/viewport'
import type { Ask, Feedback } from '@/types/issue-tree'
import type { HypothesisCell } from './cell-keys'
import { QUESTION_LABELS } from './derive'
import {
  feedbackMetaText,
  FIELD_PLACEHOLDERS,
  MINI_ADD_NOTE_LABEL,
  NO_ASK_TEXT,
  type AskBlockRects,
} from './layout'
import {
  ACTION_ICON_SIZE_CLASS,
  BODY_FIELD_CLASS,
  CELL_INPUT_CLASS,
  FB_DELETE_WIDTH_CLASS,
  FB_ICON_SIZE_CLASS,
  MINI_ACTION_FONT_CLASS,
  MINI_ACTION_HEIGHT_CLASS,
  MINI_ICON_GAP_CLASS,
  MINI_ICON_SIZE_CLASS,
  STATIC_TEXT_CLASS,
} from './measure'

/** FB の調子。**スキーマの enum そのもの**（増えたら下の表で `tsc` が落ちる） */
type Sentiment = Feedback['sentiment']

/**
 * 調子ごとのアイコン。**`Record<Sentiment, LucideIcon>` にしてあるので、
 * スキーマが調子を増やせばここで `tsc` が落ちる**（`EVENT_KIND_LABELS` と同じ手）。
 *
 * **色を持たせない。** 4種はすべて `text-ink-muted`（抑制された配下では
 * `text-ink-faint`）で、**形だけで区別する**——調子は判断ではないので、
 * 意味軸の色（欠落・無効・着信・判断）を貸すと語彙が濁る。
 * `note`（分類しないメモ）にも形を与えているのは、アイコンの列が
 * 1行だけ欠けると「アイコンを付け忘れた行」に見えるためである
 */
const SENTIMENT_ICONS: Record<Sentiment, LucideIcon> = {
  like: ThumbsUp,
  concern: TriangleAlert,
  question: CircleHelp,
  note: MessageSquare,
}

export interface AskBlockProps {
  /**
   * 描く問い。**`null` ＝「どの問いにも紐づかないFB」のブロック**（見出しは
   * 固定文で、アイコンも編集もない）
   */
  ask: Ask | null
  /**
   * 仮説の FB **全部**。この配列を `rects.rows[].feedbackIndex` で引く
   *——ブロックごとに切った配列を渡すと、書き換え・削除の添字が
   * 「ブロックの中の順番」と「データの席」に分裂する
   */
  feedbacks: readonly Feedback[]
  /** レイアウトが測った置き場所（`layout.ts`。**部品は寸法を再計算しない**） */
  rects: AskBlockRects
  /** 世界座標 → 箱の中。ブロックの面だけがこれを使う（中身はブロックからの相対） */
  inBox: (r: Rect) => React.CSSProperties
  /** `data-cell` の値を作る（**文字列は `cell-keys.ts` だけが組む**） */
  cellOf: (cell: HypothesisCell) => string
  /** アクセシブル名の接頭（`仮説{N}`）。**前半は動かさない** */
  label: string
  /** 本文の文字色。**抑制の規則は親（`HypothesisPanel`）が1箇所で決める** */
  ink: string
  /** 抑えた文字（問いの文言・日付・固定文・アイコン）の色。同上 */
  mutedInk: string
  onAskTextChange: (next: string) => void
  /**
   * この問いを消す。**`ask` が `null` のブロックからは呼ばれない**
   *——レイアウトが削除の矩形（`rects.head.remove`）を出さないので、
   * ボタンそのものが描かれない（消す対象の問いが無いブロックである）
   */
  onRemoveAsk: () => void
  onAddFeedback: () => void
  onFeedbackTextChange: (feedbackIndex: number, next: string) => void
  onRemoveFeedback: (feedbackIndex: number) => void
}

/**
 * 聞きたいこと1件と、その答えとしての FB を入れ子で描く
 *（デザインキャンバス「仮説の展開」アートボードの `.ask`）。
 *
 * **このブロックは `position: absolute` の要素そのもので、中身はその中に
 * 相対で置く**——パネルのほかの節は「面」と「中身」を兄弟として並べているが、
 * ここだけは入れ子にしてある。問いと FB の所属は**画面の意味そのもの**であり、
 * 兄弟で並べると「どの FB がどの問いの答えか」が座標にしか現れない
 *（読む人にも、検査にも）。`role="group"` と名前を持たせているのも同じ理由で、
 * 支援技術には「この問いの答えの群れ」として届く。
 *
 * **どの問いにも紐づかない FB のブロックは、宙に浮いた `askId` の受け皿でもある**
 *——割り振りの規則は `layout.ts` の `groupFeedbacks` が持つ
 */
export function AskBlock(props: AskBlockProps) {
  const { ask, inBox, rects, label, ink, mutedInk } = props
  const askIndex = rects.askIndex

  /** ブロックの中の絶対配置（包含ブロックはこのブロック自身） */
  const inBlock = (r: Rect): React.CSSProperties => ({
    position: 'absolute',
    left: r.x - rects.block.x,
    top: r.y - rects.block.y,
    width: r.width,
    height: r.height,
  })

  /** 問いの通し番号（1始まり）。`null` のブロックでは使わない */
  const askLabel = askIndex === null ? null : `${label} の聞きたいこと${askIndex + 1}`
  const blockLabel = askLabel ?? `${label} の${NO_ASK_TEXT}`

  /**
   * 「＋FB」の名前。**どの問いに足すのかを名前に持たせる**——問いブロックが
   * 縦に並ぶので、「FBを足す」だけでは押した先が読み上げから区別できない
   */
  const addLabel =
    askLabel === null ? `${label} に${NO_ASK_TEXT}を足す` : `${askLabel}にFBを足す`

  /**
   * 削除ボタン（キャンバスの `.del` ＝ 20×21）。**幅は `FB_DELETE_WIDTH` と対の
   * クラス、高さは行いっぱい。** 問いの見出しと FB の行で同じ形を使う
   *——どちらも「その行を消す」ボタンであり、別の見え方にする理由が無い
   */
  const deleteButtonClass = `${buttonBase} ${FB_DELETE_WIDTH_CLASS} h-full text-ink-faint hover:text-ink-muted`

  /** ミニボタン（＋FB）。**枠と高さは `MINI_ACTION_*` と対** */
  const miniActionClass = `${buttonBase} ${MINI_ACTION_HEIGHT_CLASS} ${MINI_ICON_GAP_CLASS} ${MINI_ACTION_FONT_CLASS} border border-rule px-1.5 whitespace-nowrap ${mutedInk} hover:bg-canvas`

  return (
    <div
      role="group"
      aria-label={blockLabel}
      className="absolute rounded-sm bg-surface"
      style={inBox(rects.block)}
    >
      {/* --- 問いの見出し --- */}
      {/* アイコンは問いのときだけ。**場所（16px の列）は空けたまま**にして、
          文言の左端をブロックどうしで揃える（キャンバスの空の `<span>`） */}
      {ask !== null && (
        <span
          aria-hidden="true"
          className={`flex items-center justify-center ${mutedInk}`}
          style={inBlock(rects.head.icon)}
        >
          <CircleHelp className={FB_ICON_SIZE_CLASS} />
        </span>
      )}
      {ask === null || askIndex === null ? (
        // **編集できない固定文**——これは問いではなく「問いが無い」ことの名前で、
        // 打ち替えられると `askId === null` の意味と食い違う
        <div className={`${STATIC_TEXT_CLASS} ${mutedInk}`} style={inBlock(rects.head.text)}>
          {NO_ASK_TEXT}
        </div>
      ) : (
        <div style={inBlock(rects.head.text)}>
          <CellInput
            multiline
            autoSize={false}
            className={`${CELL_INPUT_CLASS} ${BODY_FIELD_CLASS} ${mutedInk}`}
            aria-label={`${askLabel}の文言`}
            placeholder={FIELD_PLACEHOLDERS.ask}
            data-cell={props.cellOf({ cell: 'ask', askIndex })}
            value={ask.text}
            onValueChange={props.onAskTextChange}
          />
        </div>
      )}
      {/* 「FB待ち」。**立つかどうかを決めているのは `derive.ts`**（レイアウトが
          その結果で矩形を空けている）。ここでは数え直さない */}
      {rects.head.badge !== null && (
        <span className="flex items-start" style={inBlock(rects.head.badge)}>
          <Badge variant="pending">{QUESTION_LABELS.feedback}</Badge>
        </span>
      )}
      <span className="flex items-center" style={inBlock(rects.head.add)}>
        <button
          type="button"
          className={miniActionClass}
          aria-label={addLabel}
          onClick={props.onAddFeedback}
        >
          <Plus className={MINI_ICON_SIZE_CLASS} aria-hidden="true" />
          {MINI_ADD_NOTE_LABEL}
        </button>
      </span>
      {/* 問いの削除（m5 Task 7）。**問いのあるブロックだけ**——レイアウトが
          `remove` を出すのは `askIndex` が問いを指すブロックだけで、
          「どの問いにも紐づかないFB」の受け皿には消す対象の問いが無い。
          **FB の行の削除と同じ形**（右端・同じ列幅）で、名前だけが
          「何を消すか」を運ぶ。**確認は出さない**（FB・仮説と同じ） */}
      {rects.head.remove !== null && askLabel !== null && (
        <span className="flex items-center justify-end" style={inBlock(rects.head.remove)}>
          <button
            type="button"
            className={deleteButtonClass}
            aria-label={`${askLabel}を消す`}
            onClick={props.onRemoveAsk}
          >
            <X className={ACTION_ICON_SIZE_CLASS} aria-hidden="true" />
          </button>
        </span>
      )}

      {/* --- FB の行 --- */}
      {rects.rows.map((row) => {
        const f = props.feedbacks[row.feedbackIndex]
        if (f === undefined) return null
        const Icon = SENTIMENT_ICONS[f.sentiment]
        const name = `${label} のFB${row.feedbackIndex + 1}`
        return (
          <span key={`fb:${row.feedbackIndex}`}>
            {/* **調子は `data-sentiment` で名乗る**——アイコン自体は
                `aria-hidden` なので、形の対応を検査できる手掛かりを残す */}
            <span
              aria-hidden="true"
              data-sentiment={f.sentiment}
              className={`flex items-center justify-center ${mutedInk}`}
              style={inBlock(row.icon)}
            >
              <Icon className={FB_ICON_SIZE_CLASS} />
            </span>
            <span style={inBlock(row.text)}>
              <CellInput
                multiline
                autoSize={false}
                className={`${CELL_INPUT_CLASS} ${BODY_FIELD_CLASS} ${ink}`}
                aria-label={name}
                data-cell={props.cellOf({ cell: 'feedback', feedbackIndex: row.feedbackIndex })}
                value={f.text}
                onValueChange={(next) => props.onFeedbackTextChange(row.feedbackIndex, next)}
              />
            </span>
            {/* 「誰が・いつ」。**日付の入力欄は作らない**——`date` はアプリと
                登録 Skill が追記時に入れる（手入力にすると更新忘れで嘘をつく）。
                幅は実測ぶんしか無いので、溢れたら切る */}
            <span
              className={`flex items-center overflow-hidden ${BODY_FIELD_CLASS} ${mutedInk} whitespace-nowrap`}
              style={inBlock(row.meta)}
            >
              {feedbackMetaText(f)}
            </span>
            <span className="flex items-center justify-end" style={inBlock(row.remove)}>
              <button
                type="button"
                // 幅は `FB_DELETE_WIDTH` と対のクラス、高さは行（`meta` と同じ
                // 1行ぶん）いっぱい。キャンバスの `.del`（20×21）そのもの
                className={deleteButtonClass}
                aria-label={`${name}を消す`}
                onClick={() => props.onRemoveFeedback(row.feedbackIndex)}
              >
                <X className={ACTION_ICON_SIZE_CLASS} aria-hidden="true" />
              </button>
            </span>
          </span>
        )
      })}
    </div>
  )
}
