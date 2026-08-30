import { Badge } from '@/components/Badge'
import { buttonBase } from '@/components/button-styles'
import { CellInput } from '@/components/CellInput'
import type { Rect } from '@/core/canvas/viewport'
import type { JudgementEvent } from '@/types/issue-tree'
import { badgeVariantOf } from './badge-variant'
import { hypothesisCellKey, type HypothesisCell } from './cell-keys'
import {
  badgeGroupOf,
  BADGE_LABELS,
  EVENT_KIND_LABELS,
  latestKind,
  QUESTION_LABELS,
} from './derive'
import type { HypothesisPlacement } from './layout'
import { ADD_NOTE_LABEL, NO_JUDGEMENT_TEXT, SECTION_LABELS } from './layout'
import {
  ACTION_HEIGHT_CLASS,
  BADGE_HEIGHT,
  ISSUE_BORDER,
  PANEL_BOX_CLASS,
  ROW_DOT_INSET,
  ROW_DOT_SIZE,
} from './measure'

/**
 * `data-cell` の値は `./cell-keys` が作る。**ここに書き写さないこと**
 *——エディタは同じ文字列でフォーカスの予約を引くので、2つ目のコピーが
 * できると「予約したのに当たらない」が静かに起きる（cell-keys.ts の解説）
 */

export interface HypothesisRowProps {
  /** 行の鍵（`computeRowKeys`）。`data-cell` はこれから作る */
  hypothesisKey: string
  /** アクセシブル名の接頭（`仮説{N}`） */
  label: string
  /** レイアウトが返した矩形。**行は寸法を再計算しない** */
  placement: HypothesisPlacement
  /** 親の箱の左上（世界座標）。行は箱の中に絶対配置されるので差し引く */
  origin: { x: number; y: number }
  /** ソリューション仮説のタイトル。**`detail` と `value` は m4 では描かない**（m5 が設計する） */
  title: string
  /** FB の文言だけ（`feedbacks[].text`）。**`by` / `sentiment` / `date` は m4 では描かない** */
  notes: readonly string[]
  events: readonly JudgementEvent[]
  /** 整合性検証で赤表示の対象になっているか */
  invalid: boolean
  /** 祖先の見送りで抑制されているか */
  suppressed: boolean
  /**
   * 展開しているか（`placement.expanded !== null` と一致する。エディタが両方を
   * 同じレイアウトから作る）。**開閉の単位は課題ノード**（m5）なので、
   * 同じ課題にぶら下がる行はまとめて開く
   */
  expanded: boolean
  /** 畳まれた行を**押した**ときに開く（フォーカスでは開かない。下の `onFocus` の註） */
  onExpand: () => void
  onTitleChange: (next: string) => void
  onFeedbackTextChange: (feedbackIndex: number, next: string) => void
  /** **最新イベントの根拠だけが編集できる**（`setEventNote` が同じ規則を持つ） */
  onEventNoteChange: (eventIndex: number, next: string) => void
  onAddFeedback: () => void
  /**
   * 判断イベントのドロップダウン。エディタが `menuPropsFor` で組んで渡す。
   * **必須にしてある**（`IssueBox` の `eventToggle` と同じ）——省略できると、
   * 判断を付ける動線がマウスから消えていても型は通る
   */
  judgementMenu: React.ReactNode
}

/**
 * 入力欄の共通クラス。**面と文字色を持たない**——箱の面の上に透明で乗り、
 * 文字色は箱から継承する（抑制された配下がそのまま薄い文字に落ちる）。
 *
 * 余白も持たない。レイアウトは各行を「余白 0」で測っているので、ここで
 * padding を足すとブラウザが測定より早く折り返して文字が切れる
 */
const inputClass =
  'h-full w-full resize-none overflow-hidden bg-transparent whitespace-pre-wrap break-all outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-inset focus:ring-ring'

/**
 * 節の見出し（text-sm）。レイアウトは `fonts.small` の1行で場所を空けている。
 * **文字色は持たない**——下の `mutedInk` が抑制に応じて足す
 */
const sectionLabelClass = 'absolute overflow-hidden text-sm leading-none font-medium select-none'

/** 読み取り専用の文章（以前の判断の根拠・「判断はまだ無い」）。文字色は同上 */
const staticTextClass = 'absolute overflow-hidden text-sm leading-normal break-all whitespace-pre-wrap'

// 仮説の欄は操作言語を通らない（キーは課題だけが取る。m5 の決定）。
// ただし Enter だけは消費する——閉じた行は1行で測っており、改行が入ると
// 測定と描画がずれて下の行に被る。rev 10章「ツール側で e.key を見ない」の
// 明示的な例外で、コマンドへの写像は行わない
const swallowEnter = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
  if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault()
}

/**
 * 仮説1件＝**課題の箱の中の1行**（M3 の文法）。
 *
 * 畳まれているときは「点・文言・行末のバッジ」の1行だけで、根拠・FB・
 * 以前の判断は**展開したときにだけ**下のパネルへ出る。展開はビュー状態であり、
 * ファイルには書かない。**開くのは課題ノードごと**（m5）なので、同じ課題に
 * ぶら下がる行は同時に開く。**`detail` / `value` / `asks` は m4 では描かない**
 *（見せ方は m5 が設計する）。
 *
 * **畳まれた行の `<button>` と、展開後の文言の `<textarea>` は同じ `data-cell`
 * を名乗る。** エディタはその文字列でフォーカスを予約するので（Tab で行に
 * 着いた瞬間に textarea へ移す継ぎ目）、**2つが同時に DOM にあってはならない**
 * ——`querySelector` は先頭を掴み、予約が静かに外れる。下の `open` 1つで
 * 分岐を束ね、両方が描かれる枝を構造的に作らない
 */
export function HypothesisRow(props: HypothesisRowProps) {
  const { placement, label, events, notes } = props
  const panel = props.expanded ? placement.expanded : null
  const open = panel !== null

  const cellOf = (cell: HypothesisCell): string => hypothesisCellKey(props.hypothesisKey, cell)

  /** 世界座標 → 箱の中（絶対配置の原点はパディングボックス＝枠線の内側） */
  const inBox = (r: Rect): React.CSSProperties => ({
    left: r.x - props.origin.x - ISSUE_BORDER,
    top: r.y - props.origin.y - ISSUE_BORDER,
    width: r.width,
    height: r.height,
  })
  /** 畳まれた行の中（ボタンの矩形が原点。ボタンは枠線を持たない） */
  const inRow = (r: Rect): React.CSSProperties => ({
    left: r.x - placement.rect.x,
    top: r.y - placement.rect.y,
    width: r.width,
    height: r.height,
  })

  // 現在ステータスは**最新イベントからの導出**（`derive.ts`）。
  // `hypothesisStatus` ではなく `latestKind` を呼ぶのは、props の
  // `readonly` な配列をそのまま渡せるため（写しを作らない）
  const group = badgeGroupOf(latestKind(events) ?? 'undecided')

  /**
   * 抑制された配下の文字色。**箱からの継承に頼らない。**
   *
   * 見送りを掲げている当の課題の箱は**通常の面**で描く（俯瞰モックの規則。
   * 薄くなるのは配下だけ）ので、その箱の中の仮説行は `text-ink` を継承して
   * しまう。だが「その課題はもう追わない」は**ぶら下がる仮説にも及ぶ**
   *（`poseQuestions` が見送った課題の配下に問いを立てないのと同じ理屈）ので、
   * 行の側で明示的に薄くする。**`opacity-*` は使わない**——検算した比を割る
   */
  const ink = props.suppressed ? 'text-ink-faint' : 'text-ink'
  /** 見出し・読み取り専用の文章・プレースホルダ相当の抑えた文字 */
  const mutedInk = props.suppressed ? 'text-ink-faint' : 'text-ink-muted'
  /**
   * 行頭の点（モックの `.row::before`）。**バッジと同じ高さに揃える**
   *——展開すると文言が折り返して行が縦に伸びるので、行の中央に置くと
   * 点だけがパネルの横まで下がる
   */
  const dot: Rect = {
    x: placement.rect.x + ROW_DOT_INSET,
    y: placement.badge.y + Math.floor((BADGE_HEIGHT - ROW_DOT_SIZE) / 2),
    width: ROW_DOT_SIZE,
    height: ROW_DOT_SIZE,
  }

  if (!open) {
    return (
      <button
        type="button"
        className="absolute rounded-sm text-left outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
        style={inBox(placement.rect)}
        aria-label={`${label}を開く`}
        data-cell={cellOf({ cell: 'hypothesis' })}
        // **フォーカスが入っただけでは開かない**（m5 で `onFocus` を外した）
        // ——`Tab` で行に着いた瞬間に開いて textarea へ移す形だと、1回の `Tab` で
        // フォーカスが2回動き、キーで木を歩くときに行き先が読めなくなる
        //（`open-issues.md` に上がっていた欠陥）。押したときだけ開く
        onClick={props.onExpand}
      >
        <span
          aria-hidden="true"
          className={`absolute rounded-full ${props.suppressed ? 'bg-ink-faint' : 'bg-ink-muted'}`}
          style={inRow(dot)}
        />
        {/* 畳まれた行は**必ず1行**。レイアウトも1行で測っているので、
            改行は空白に潰してから省略記号に任せる */}
        <span
          className={`absolute truncate text-sm leading-normal ${props.title === '' ? mutedInk : ink}`}
          style={inRow(placement.text)}
        >
          {props.title === '' ? '仮説' : props.title.replace(/\n/g, ' ')}
        </span>
        <span className="absolute flex items-center justify-end" style={inRow(placement.badge)}>
          <Badge variant={badgeVariantOf(group, props.suppressed)}>{BADGE_LABELS[group]}</Badge>
        </span>
        {/* 「FB待ち」（M22）。**状態のバッジの後に描く**——先に置くと、
            行の先頭の `inline-flex` を状態のバッジとして引いている検査が
            黙って別の要素を掴む。抑制された行には立たない（`derive.ts`） */}
        {placement.feedbackBadge !== null && (
          <span
            className="absolute flex items-center justify-end"
            style={inRow(placement.feedbackBadge)}
          >
            <Badge variant="pending">{QUESTION_LABELS.feedback}</Badge>
          </span>
        )}
      </button>
    )
  }

  const latestIndex = events.length - 1
  const latest = events[latestIndex]

  return (
    <>
      <span
        aria-hidden="true"
        className={`absolute rounded-full ${props.suppressed ? 'bg-ink-faint' : 'bg-ink-muted'}`}
        style={inBox(dot)}
      />
      <div
        className={`absolute${props.invalid ? ' bg-invalid-face outline-1 -outline-offset-1 outline-invalid' : ''}`}
        style={inBox(placement.text)}
      >
        <CellInput
          multiline
          autoSize={false}
          // **`font-medium` を付けないこと。** 測っているのは `fonts.body`
          //（`BODY_FONT_CLASS = 'text-sm leading-normal'`＝weight 400）の見本であり、中字で
          // 描くと同じ字数がより広くなって測定より1行多く折り返す。高さ固定＋
          // overflow-hidden の textarea なので、**打っている最後の行が黙って
          // 見えなくなる**（`fonts.title` を別に持っている理由と同じ）。
          // 整合性検証の無効は外側の箱に `invalid` の輪郭＋淡い面（rev 9章 規約2）
          className={`${inputClass} text-sm leading-normal ${ink}`}
          aria-label={label}
          placeholder="仮説"
          data-cell={cellOf({ cell: 'hypothesis' })}
          value={props.title}
          onValueChange={props.onTitleChange}
          onFieldKeyDown={swallowEnter}
        />
      </div>
      <span className="absolute flex items-center justify-end" style={inBox(placement.badge)}>
        <Badge variant={badgeVariantOf(group, props.suppressed)}>{BADGE_LABELS[group]}</Badge>
      </span>
      {/* 展開した頭部にも同じ形で出す（レイアウトは閉じた行と同じ幅を通る） */}
      {placement.feedbackBadge !== null && (
        <span
          className="absolute flex items-center justify-end"
          style={inBox(placement.feedbackBadge)}
        >
          <Badge variant="pending">{QUESTION_LABELS.feedback}</Badge>
        </span>
      )}

      {/* パネルは面だけを描き、中身は同じ座標系（箱の中）に置く。
          後に描かれる要素が上に乗る＝面が中身を覆うことはない */}
      <div
        aria-hidden="true"
        className={`absolute rounded-sm border-rule bg-canvas ${PANEL_BOX_CLASS}`}
        style={inBox(panel.panel)}
      />

      <div className={`${sectionLabelClass} ${mutedInk}`} style={inBox(panel.judgement.label)}>
        {SECTION_LABELS.judgement}
      </div>
      <span className="absolute flex items-start" style={inBox(panel.judgement.badge)}>
        <Badge variant={badgeVariantOf(latest === undefined ? 'open' : badgeGroupOf(latest.kind), props.suppressed)}>
          {latest === undefined ? BADGE_LABELS.open : EVENT_KIND_LABELS[latest.kind]}
        </Badge>
      </span>
      {latest === undefined ? (
        <div className={`${staticTextClass} ${mutedInk}`} style={inBox(panel.judgement.note)}>
          {NO_JUDGEMENT_TEXT}
        </div>
      ) : (
        <div className="absolute" style={inBox(panel.judgement.note)}>
          <CellInput
            multiline
            autoSize={false}
            className={`${inputClass} text-sm leading-normal ${ink}`}
            aria-label={`${label} の${EVENT_KIND_LABELS[latest.kind]}の根拠`}
            data-cell={cellOf({ cell: 'event', eventIndex: latestIndex })}
            value={latest.note}
            onValueChange={(next) => props.onEventNoteChange(latestIndex, next)}
          />
        </div>
      )}
      <div className="absolute flex items-start justify-end" style={inBox(panel.judgement.trigger)}>
        {props.judgementMenu}
      </div>

      {/* 以前の判断。**`CellInput` にしない**——追記専用の列であり、
          「そのとき何を根拠に決めたか」が後から書き換わってはならない。
          バッジは保存された種別の文言（`EVENT_KIND_LABELS`）で、面は薄い枠にする
          （いま決まっているのは最新1件だけだと見せる） */}
      {panel.previousLabel !== null && (
        <div className={`${sectionLabelClass} ${mutedInk}`} style={inBox(panel.previousLabel)}>
          {SECTION_LABELS.previous}
        </div>
      )}
      {panel.previous.map((rects, j) => {
        const event = events[j]
        if (event === undefined) return null
        return (
          <span key={`prev:${j}`}>
            <span className="absolute flex items-start" style={inBox(rects.badge)}>
              <Badge variant="faint">{EVENT_KIND_LABELS[event.kind]}</Badge>
            </span>
            <span className={`${staticTextClass} ${mutedInk}`} style={inBox(rects.note)}>
              {event.note}
            </span>
          </span>
        )
      })}

      <div className={`${sectionLabelClass} ${mutedInk}`} style={inBox(panel.notes.label)}>
        {SECTION_LABELS.notes}
      </div>
      {panel.notes.cells.map((r, i) => (
        <div key={`feedback:${i}`} className="absolute" style={inBox(r)}>
          <CellInput
            multiline
            autoSize={false}
            className={`${inputClass} text-sm leading-normal ${ink}`}
            aria-label={`${label} のFB${i + 1}`}
            data-cell={cellOf({ cell: 'feedback', feedbackIndex: i })}
            value={notes[i] ?? ''}
            onValueChange={(next) => props.onFeedbackTextChange(i, next)}
          />
        </div>
      ))}
      <div className="absolute flex items-center" style={inBox(panel.notes.add)}>
        <button
          type="button"
          className={`${buttonBase} ${ACTION_HEIGHT_CLASS} gap-1 border border-rule bg-surface px-1 text-sm ${mutedInk} hover:bg-canvas`}
          aria-label={`${label} にFBを足す`}
          onClick={props.onAddFeedback}
        >
          {ADD_NOTE_LABEL}
        </button>
      </div>
    </>
  )
}
