import { Plus } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { buttonBase } from '@/components/button-styles'
import { CellInput } from '@/components/CellInput'
import type { Rect } from '@/core/canvas/viewport'
import type { Hypothesis } from '@/types/issue-tree'
import { AskBlock } from './AskBlock'
import { badgeVariantOf } from './badge-variant'
import { hypothesisCellKey, type HypothesisCell } from './cell-keys'
import { badgeGroupOf, BADGE_LABELS, EVENT_KIND_LABELS } from './derive'
import type { HypothesisPanel as PanelRects } from './layout'
import {
  ADD_ASK_LABEL,
  ADD_NOTE_LABEL,
  FIELD_PLACEHOLDERS,
  judgementDateText,
  NO_JUDGEMENT_TEXT,
  SECTION_LABELS,
} from './layout'
import {
  ACTION_HEIGHT_CLASS,
  BODY_FIELD_CLASS,
  CELL_INPUT_CLASS,
  HYPO_TITLE_FONT_CLASS,
  ISSUE_BORDER,
  MINI_ICON_SIZE_CLASS,
  PANEL_BOX_CLASS,
  SECTION_LABEL_FONT_CLASS,
  STATIC_TEXT_CLASS,
} from './measure'

/**
 * `data-cell` の値は `./cell-keys` が作る。**ここに書き写さないこと**
 *——エディタは同じ文字列でフォーカスの予約を引くので、2つ目のコピーが
 * できると「予約したのに当たらない」が静かに起きる（cell-keys.ts の解説）
 */

export interface HypothesisPanelProps {
  /** 行の鍵（`computeRowKeys`）。`data-cell` はこれから作る */
  hypothesisKey: string
  /** アクセシブル名の接頭（`仮説{N}`）。**前半は動かさない**（テストが前方一致で引く） */
  label: string
  /**
   * レイアウトが返したパネルの矩形（`HypothesisPlacement.expanded`）。
   * **パネルは寸法を再計算しない**——測ったのはレイアウトである
   */
  panel: PanelRects
  /** 親の箱の左上（世界座標）。パネルは箱の中に絶対配置されるので差し引く */
  origin: { x: number; y: number }
  /**
   * 描く仮説1件。**欄ごとにばらして受け取らない**——節が5つあり、
   * `title` / `detail` / `value` / `events` / `feedbacks` を別々の props で
   * 運ぶと、どれか1つを渡し忘れても型が通る組み合わせが増える
   */
  hypothesis: Hypothesis
  /** 整合性検証で赤表示の対象になっているか */
  invalid: boolean
  /** 祖先の見送りで抑制されているか */
  suppressed: boolean
  onTitleChange: (next: string) => void
  onDetailChange: (next: string) => void
  onValueChange: (next: string) => void
  onAskTextChange: (askIndex: number, next: string) => void
  onFeedbackTextChange: (feedbackIndex: number, next: string) => void
  /** **最新イベントの根拠だけが編集できる**（`setEventNote` が同じ規則を持つ） */
  onEventNoteChange: (eventIndex: number, next: string) => void
  onAddAsk: () => void
  /**
   * FB を1件足す。**`askId` は呼ぶ側（＝押されたブロック）が持つ**
   *——`addFeedback` が既定値を与えず必須にしているのと同じ理由で、
   * ここで `null` に固定すると、問いブロックの「＋FB」が黙って
   * 「どの問いにも紐づかない FB」を作る（`commands.ts` の解説）
   */
  onAddFeedback: (askId: string | null) => void
  onRemoveFeedback: (feedbackIndex: number) => void
  /**
   * 判断イベントのドロップダウン。エディタが `menuPropsFor` で組んで渡す。
   * **必須にしてある**（`IssueBox` の `eventToggle` と同じ）——判断を付ける
   * 動線がマウスから消えていても型は通る、という穴を塞ぐ
   */
  judgementMenu: React.ReactNode
}

/**
 * 節の見出しの帯。**見出しの文字・バッジ・日付・トリガーが横に並ぶ1行**で、
 * レイアウトは帯の矩形1つだけを測っている（`HypothesisPanel` 型の解説）。
 * `gap-2` はキャンバスの `.label { gap: 8px }`。
 *
 * **文字色は持たない**——下の `ink` / `mutedInk` が抑制に応じて足す
 */
const sectionBandClass = 'absolute flex items-center gap-2 overflow-hidden select-none'

// 仮説の欄は操作言語を通らない（キーは課題だけが取る。m5 の決定）。
// ただし**ソリューション仮説のタイトルだけ** Enter を消費する——同じ文言は
// 畳まれた行でも1行として測られており、改行を許すと開いているときだけ
// 読める文が生まれる。rev 10章「ツール側で e.key を見ない」の明示的な例外で、
// コマンドへの写像は行わない（m5 Task 3 で行から移ってきた）
const swallowEnter = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
  if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault()
}

/**
 * 展開した仮説1件のパネル（デザインキャンバス「仮説の展開」アートボード）。
 *
 * 節は上から **ソリューション仮説 → 価値仮説 → 検証結果 →（以前の判断）→ FB**。
 * 「以前の判断」はキャンバスに描かれていないが**残す**——追記専用の列
 *（覆される前の判断とその根拠）を読める唯一の場所だからで、判断が2件以上の
 * ときだけ出る。
 *
 * **パネルの面は判断で変えない**（全部 `bg-canvas`）。キャンバスは支持・棄却で
 * 面を塗り分けているが、`judge-yes-face` は facet の役割トークンに無く、
 * `surface-muted` は「見送りの箱」の面なので、棄却に敷くと**抑制（祖先が
 * 見送った枝）と見分けが付かなくなる**。棄却は畳まれた行の文言を一段
 * 落とすことで表す（`HypothesisRow`）。
 *
 * **開いた仮説に「点・文言・バッジ」の頭部は無い**（`HypothesisPlacement.row`
 * が null）。頭部を残すと、この節の「ソリューション仮説」と同じ文言が
 * 画面に2つ出る。**畳まれた行の `<button>` とここの `<textarea>` は同じ
 * `data-cell`（`hyp:`）を名乗る**ので、2つが同時に DOM にあってはならない
 *——エディタが `expanded` の有無でどちらか一方だけを描く
 */
export function HypothesisPanel(props: HypothesisPanelProps) {
  const { panel, label, hypothesis } = props
  const events = hypothesis.events
  const latestIndex = events.length - 1
  const latest = events[latestIndex]

  const cellOf = (cell: HypothesisCell): string => hypothesisCellKey(props.hypothesisKey, cell)

  /** 世界座標 → 箱の中（絶対配置の原点はパディングボックス＝枠線の内側） */
  const inBox = (r: Rect): React.CSSProperties => ({
    left: r.x - props.origin.x - ISSUE_BORDER,
    top: r.y - props.origin.y - ISSUE_BORDER,
    width: r.width,
    height: r.height,
  })

  /**
   * 抑制された配下の文字色。**箱からの継承に頼らない**（`HypothesisRow` と
   * 同じ理屈——見送りを掲げている当の箱は通常の面で描くので、中の仮説は
   * `text-ink` を継承してしまう）。**`opacity-*` は使わない**
   */
  const ink = props.suppressed ? 'text-ink-faint' : 'text-ink'
  /** 読み取り専用の文章・日付・プレースホルダ相当の抑えた文字 */
  const mutedInk = props.suppressed ? 'text-ink-faint' : 'text-ink-muted'
  /**
   * 節見出しの文字色は **`ink`**（`mutedInk` にしない）——キャンバスの `.label`
   * は 600 の太さで本文と同じ濃さである。太さで見出しと本文を分ける
   */
  const sectionLabelClass = `${SECTION_LABEL_FONT_CLASS} ${ink}`
  /**
   * 節の末尾のボタン（キャンバスの `.add`）。**高さは `ACTION_HEIGHT` と対**で、
   * 左右の余白 6px はバッジ・ミニボタンと揃えてある。文字はキャンバス通り
   * `ink`（抑えない）——ここは節の中で唯一の操作なので、探して見つかる濃さが要る
   */
  const addButtonClass = `${buttonBase} ${ACTION_HEIGHT_CLASS} gap-1 border border-rule bg-surface px-1.5 text-sm ${ink} hover:bg-canvas`

  return (
    <>
      {/* パネルは面だけを描き、中身は同じ座標系（箱の中）に置く。
          後に描かれる要素が上に乗る＝面が中身を覆うことはない */}
      <div
        aria-hidden="true"
        className={`absolute rounded-sm border-rule bg-canvas ${PANEL_BOX_CLASS}`}
        style={inBox(panel.panel)}
      />

      {/* --- ソリューション仮説 --- */}
      <div className={sectionBandClass} style={inBox(panel.solution.label)}>
        <span className={sectionLabelClass}>{SECTION_LABELS.solution}</span>
        {/* ゴミ箱（仮説の削除）は Task 7 がここへ `ml-auto` で足す。
            帯は flex なので、足しても測定は変わらない */}
      </div>
      <div
        className={`absolute${props.invalid ? ' bg-invalid-face outline-1 -outline-offset-1 outline-invalid' : ''}`}
        style={inBox(panel.solution.title)}
      >
        <CellInput
          multiline
          autoSize={false}
          // **`HYPO_TITLE_FONT_CLASS` と対で測っているのは `fonts.title`**
          //（同じ 14px・同じ行間で太さだけ上。広い方で測る＝安全側。
          // `IssueTreeFonts.title` の解説）。ここを本文の書体に変えるなら、
          // 測る側も対で直すこと
          className={`${CELL_INPUT_CLASS} ${HYPO_TITLE_FONT_CLASS} ${ink}`}
          aria-label={label}
          placeholder="仮説"
          data-cell={cellOf({ cell: 'hypothesis' })}
          value={hypothesis.title}
          onValueChange={props.onTitleChange}
          onFieldKeyDown={swallowEnter}
        />
      </div>
      <div className="absolute" style={inBox(panel.solution.detail)}>
        <CellInput
          multiline
          autoSize={false}
          className={`${CELL_INPUT_CLASS} ${BODY_FIELD_CLASS} ${ink}`}
          aria-label={`${label} の詳細`}
          // **空でも警告にしない**（スキーマの規律。設計ノート D7）——
          // プレースホルダは「何を書く欄か」の案内であって欠落の印ではない
          placeholder={FIELD_PLACEHOLDERS.detail}
          data-cell={cellOf({ cell: 'detail' })}
          value={hypothesis.detail}
          onValueChange={props.onDetailChange}
        />
      </div>

      {/* --- 価値仮説 --- */}
      <div className={sectionBandClass} style={inBox(panel.value.label)}>
        <span className={sectionLabelClass}>{SECTION_LABELS.value}</span>
      </div>
      <div className="absolute" style={inBox(panel.value.field)}>
        <CellInput
          multiline
          autoSize={false}
          className={`${CELL_INPUT_CLASS} ${BODY_FIELD_CLASS} ${ink}`}
          aria-label={`${label} の価値仮説`}
          placeholder={FIELD_PLACEHOLDERS.value}
          data-cell={cellOf({ cell: 'value' })}
          value={hypothesis.value}
          onValueChange={props.onValueChange}
        />
      </div>

      {/* --- 検証結果 --- */}
      <div className={sectionBandClass} style={inBox(panel.judgement.label)}>
        <span className={sectionLabelClass}>{SECTION_LABELS.judgement}</span>
        {/* 判断のバッジ。**イベントが無ければ導出の「未決」**（`BADGE_LABELS`）で、
            1件でもあれば保存された種別の文言（`EVENT_KIND_LABELS`）。
            Task 6 がこれを押せるようにする */}
        <Badge
          variant={badgeVariantOf(
            latest === undefined ? 'open' : badgeGroupOf(latest.kind),
            props.suppressed,
          )}
        >
          {latest === undefined ? BADGE_LABELS.open : EVENT_KIND_LABELS[latest.kind]}
        </Badge>
        {/* 日付は**判断があるときだけ**。無いときに「更新」だけが出ると、
            何もしていないのに更新したように読める */}
        {latest !== undefined && (
          <span className={`text-sm ${mutedInk} whitespace-nowrap`}>
            {judgementDateText(latest.date)}
          </span>
        )}
        <span className="ml-auto flex items-center">{props.judgementMenu}</span>
      </div>
      {latest === undefined ? (
        <div className={`${STATIC_TEXT_CLASS} ${mutedInk}`} style={inBox(panel.judgement.note)}>
          {NO_JUDGEMENT_TEXT}
        </div>
      ) : (
        <div className="absolute" style={inBox(panel.judgement.note)}>
          <CellInput
            multiline
            autoSize={false}
            className={`${CELL_INPUT_CLASS} ${BODY_FIELD_CLASS} ${ink}`}
            aria-label={`${label} の${EVENT_KIND_LABELS[latest.kind]}の根拠`}
            data-cell={cellOf({ cell: 'event', eventIndex: latestIndex })}
            value={latest.note}
            onValueChange={(next) => props.onEventNoteChange(latestIndex, next)}
          />
        </div>
      )}

      {/* --- 以前の判断 ---
          **`CellInput` にしない**——追記専用の列であり、「そのとき何を根拠に
          決めたか」が後から書き換わってはならない。バッジは保存された種別の
          文言で、面は薄い枠にする（いま決まっているのは最新1件だけだと見せる） */}
      {panel.previousLabel !== null && (
        <div className={sectionBandClass} style={inBox(panel.previousLabel)}>
          <span className={sectionLabelClass}>{SECTION_LABELS.previous}</span>
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
            <span className={`${STATIC_TEXT_CLASS} ${mutedInk}`} style={inBox(rects.note)}>
              {event.note}
            </span>
          </span>
        )
      })}

      {/* --- FB ---
          **中身は問いブロックの入れ子**（`AskBlock`）。並びと割り振りは
          レイアウトが決めており（`layout.ts` の `groupFeedbacks`）、ここは
          `asks` の添字でブロックと問いを突き合わせるだけである。
          **`askIndex` が `null` のブロックは末尾の「どの問いにも紐づかないFB」**
          で、`askId` が `null` の FB と、**実在しない `askId` を持つ FB** が入る */}
      <div className={sectionBandClass} style={inBox(panel.notes.label)}>
        <span className={sectionLabelClass}>{SECTION_LABELS.notes}</span>
      </div>
      {panel.notes.blocks.map((rects) => {
        const askIndex = rects.askIndex
        const ask = askIndex === null ? null : (hypothesis.asks[askIndex] ?? null)
        return (
          <AskBlock
            key={askIndex === null ? 'ask:none' : `ask:${askIndex}`}
            ask={ask}
            feedbacks={hypothesis.feedbacks}
            rects={rects}
            inBox={inBox}
            cellOf={cellOf}
            label={label}
            ink={ink}
            mutedInk={mutedInk}
            onAskTextChange={(next) => {
              if (askIndex !== null) props.onAskTextChange(askIndex, next)
            }}
            // **`askId` はブロックが持つ**——押した「＋FB」がどの問いの下に
            // あるかを、呼ぶ側が知っている（`addFeedback` の必須引数）
            onAddFeedback={() => props.onAddFeedback(ask === null ? null : ask.id)}
            onFeedbackTextChange={props.onFeedbackTextChange}
            onRemoveFeedback={props.onRemoveFeedback}
          />
        )
      })}
      {/* 節の末尾の2つのボタン。**「FBを追加」はどの問いにも紐づかない FB を作る**
          （紐づけを強制しない、というスキーマの立場のまま。用意した問いの外から
          来る指摘こそ重い） */}
      <div className="absolute flex items-center gap-1.5" style={inBox(panel.notes.adds)}>
        <button
          type="button"
          className={addButtonClass}
          aria-label={`${label} に聞きたいことを足す`}
          onClick={props.onAddAsk}
        >
          <Plus className={MINI_ICON_SIZE_CLASS} aria-hidden="true" />
          {ADD_ASK_LABEL}
        </button>
        <button
          type="button"
          className={addButtonClass}
          aria-label={`${label} にFBを足す`}
          onClick={() => props.onAddFeedback(null)}
        >
          <Plus className={MINI_ICON_SIZE_CLASS} aria-hidden="true" />
          {ADD_NOTE_LABEL}
        </button>
      </div>
    </>
  )
}
