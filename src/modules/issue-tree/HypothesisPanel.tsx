import { Plus, Trash2 } from 'lucide-react'
import { buttonBase } from '@/components/button-styles'
import { CellInput } from '@/components/CellInput'
import type { Rect } from '@/core/canvas/viewport'
import type { Hypothesis } from '@/types/issue-tree'
import { AskBlock } from './AskBlock'
import { hypothesisCellKey, type HypothesisCell } from './cell-keys'
import { EVENT_KIND_LABELS } from './derive'
import type { HypothesisPanel as PanelRects } from './layout'
import {
  ADD_ASK_LABEL,
  ADD_NOTE_LABEL,
  ASK_LABEL,
  FIELD_PLACEHOLDERS,
  judgementDateText,
  NO_JUDGEMENT_TEXT,
  SECTION_LABELS,
  type Sentiment,
} from './layout'
import {
  ACTION_HEIGHT_CLASS,
  ACTION_ICON_SIZE_CLASS,
  BODY_FIELD_CLASS,
  CELL_INPUT_CLASS,
  HYPO_TITLE_FONT_CLASS,
  ISSUE_BORDER,
  PANEL_BOX_CLASS,
  SECTION_LABEL_FONT_CLASS,
  STATIC_TEXT_CLASS,
  TRASH_ICON_SIZE_CLASS,
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
   * 描く仮説1件。**欄ごとにばらして受け取らない**——節が6つあり、
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
  /** FB の調子（`sentiment`）を差し替える（アイコンのドロップダウン） */
  onFeedbackSentimentChange: (feedbackIndex: number, next: Sentiment) => void
  /**
   * 調子のドロップダウンの開閉。**エディタの `menuPropsFor` の戻り値**を
   * FB の席ごとに渡す——**鍵はエディタが1つだけ持つ**ので、同時に開くのは
   * 判断も含めて1つである（`AskBlock` の同名 prop の解説）
   */
  sentimentMenuProps: (feedbackIndex: number) => {
    open: boolean
    onOpenChange: (open: boolean) => void
  }
  /** **最新イベントの根拠だけが編集できる**（`setEventNote` が同じ規則を持つ） */
  onEventNoteChange: (eventIndex: number, next: string) => void
  onAddAsk: () => void
  /**
   * 問いを1件消す（見出し行のゴミ箱）。**`askIndex` は押されたブロックが持つ**
   *（`onAddFeedback` の `askId` と同じ規律）。**`askIndex` が `null` のブロック
   *（どの問いにも紐づかないFB）からは呼ばれない**——消す対象の問いが無い
   */
  onRemoveAsk: (askIndex: number) => void
  /**
   * FB を1件足す。**`askId` は呼ぶ側（＝押されたブロック）が持つ**
   *——`addFeedback` が既定値を与えず必須にしているのと同じ理由で、
   * ここで `null` に固定すると、問いブロックの「＋FB」が黙って
   * 「どの問いにも紐づかない FB」を作る（`commands.ts` の解説）
   */
  onAddFeedback: (askId: string | null) => void
  onRemoveFeedback: (feedbackIndex: number) => void
  /**
   * この仮説を消す（「ソリューション仮説」の見出しの右端のゴミ箱）。
   * **必須にしてある**（`judgementMenu` と同じ理由）——キーから仮説の削除が
   * 消えたので、この動線が抜けると**どこからも消せない仮説**になる。
   *
   * **確認ダイアログは出さない**（押した先で消える）——Undo は額縁の
   * グローバル層にあり、FB も問いも同じく確認なしで消える
   */
  onDelete: () => void
  /**
   * 判断イベントのドロップダウン。エディタが `menuPropsFor` で組んで渡す。
   * **トリガーは状態のバッジそのもの**なので、これは「操作」だけでなく
   * 「いまの状態」も運ぶ——パネルが同じ語をもう1つ描かないこと。
   * **必須にしてある**（`IssueBox` の `eventToggle` と同じ）——判断を付ける
   * 動線がマウスから消えていても型は通る、という穴を塞ぐ
   */
  judgementMenu: React.ReactNode
}

/**
 * 節の見出しの帯。**見出しの文字・バッジ（＝判断のトリガー）・日付が横に並ぶ1行**で、
 * レイアウトは帯の矩形1つだけを測っている（`HypothesisPanel` 型の解説）。
 * `gap-2` はキャンバスの `.label { gap: 8px }`。
 *
 * **文字色は持たない**——下の `ink` / `mutedInk` が抑制に応じて足す
 */
const sectionBandClass = 'absolute flex items-center gap-2 overflow-hidden select-none'

// 仮説の欄は操作言語を通らない（キーは課題だけが取る）。
// ただし**ソリューション仮説のタイトルだけ** Enter を消費する——同じ文言は
// 畳まれた行でも1行として測られており、改行を許すと開いているときだけ
// 読める文が生まれる。rev 10章「ツール側で e.key を見ない」の明示的な例外で、
// コマンドへの写像は行わない
const swallowEnter = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
  if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault()
}

/**
 * 展開した仮説1件のパネル（デザインキャンバス「仮説の展開」アートボード）。
 *
 * 節は上から **ソリューション仮説 → 価値仮説 → どう作るか → 検証結果 → FB**
 * の5つ（`SECTION_LABELS` の鍵の並びが正）。
 *
 * **「以前の判断」の節は無い。** 仮説の `events` が `maxItems: 1` なので、
 * 覆される前の判断はデータに残らない——読み手（見出し・バッジ・
 * 読み取り専用の根拠）を残すと、**永久に空の節**が測定だけを食う。
 *
 * **パネルの面は判断で変えない**（全部 `bg-canvas`）。キャンバスは支持・棄却で
 * 面を塗り分けているが、採らない
 *——`surface-muted` は「見送りの箱」の面なので、棄却に敷くと**抑制（祖先が
 * 見送った枝）と見分けが付かなくなる**から。
 * **役割トークンが揃っていることを根拠に塗り分けを入れないこと。** 棄却は畳まれた行の
 * 文言を一段落とすことで表す（`HypothesisRow`）。
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
    /**
     * **包みは位置を持たない**（`position: static`）ので、中の絶対配置は
     * 箱を基準にしたまま。中身が全て絶対配置なので高さも 0 で、`IssueBox` の
     * 行の包み（`IssueTreeEditor`）と同じ形である。
     *
     * **`data-panel` は「ここは課題を選ぶ場所ではない」の印**。
     * `IssueBox` の `onBoxClick` がこの印を見て**素通し**にする——箱の地の
     * クリックは選択を入り切りするので、印が無いと**開いたパネルの余白を
     * 押した拍子に課題ごと畳まれる**（780px の箱ではパネルの地が広い）。
     * **パネルが描かれるのは選択中のときだけ**なので、素通しにして失う経路は
     * 無い（未選択のノードのパネルを押して選ぶ、という道はそもそも存在しない）
     */
    <div data-panel="hypothesis">
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
        {/* ゴミ箱（仮説の削除。キャンバスの `.trash`）。**帯の右端**へ
            `ml-auto` で寄せる——帯は flex なので、置いても他の節の測定は
            変わらない（帯の高さだけ `TRASH_ICON_SIZE` を勘定に入れてある）。
            **確認ダイアログを出さない**（Undo は額縁のグローバル層）。
            文字色は抑制に合わせて落とさない `text-ink-faint` 固定——
            キャンバスの `.trash` そのもので、押せる場所であることは
            ホバーで一段濃くなることが示す */}
        <button
          type="button"
          className={`${buttonBase} ml-auto text-ink-faint hover:text-ink-muted`}
          // **前半（`仮説{N}`）は動かさない**（テストが前方一致で引く規約）
          aria-label={`${label}を削除`}
          onClick={props.onDelete}
        >
          <Trash2 className={TRASH_ICON_SIZE_CLASS} aria-hidden="true" />
        </button>
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

      {/* --- どう作るか（`detail`）---
          独立した節である（`HypothesisPanel.detail` の解説）。
          **アクセシブル名は `仮説{N} の詳細` のまま**——前半だけでなく、
          この名前でフォーカスの行き先を引いているテストが複数ある。
          見出しが変わっても `data-cell`（`detail:`）は同じ席を指す */}
      <div className={sectionBandClass} style={inBox(panel.detail.label)}>
        <span className={sectionLabelClass}>{SECTION_LABELS.detail}</span>
      </div>
      <div className="absolute" style={inBox(panel.detail.field)}>
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

      {/* --- 検証結果 --- */}
      <div className={sectionBandClass} style={inBox(panel.judgement.label)}>
        <span className={sectionLabelClass}>{SECTION_LABELS.judgement}</span>
        {/* **状態のバッジはドロップダウンのトリガーそのもの。**
            パネルはここへ置くだけで、語も面もエディタが組む
            ——見る場所と変える場所が1つなので、**パネルが自分でもう1つ
            バッジを描いてはならない**（同じ語が帯に2つ出る） */}
        {props.judgementMenu}
        {/* 日付は**判断があるときだけ**。無いときに「更新」だけが出ると、
            何もしていないのに更新したように読める */}
        {latest !== undefined && (
          <span className={`text-sm ${mutedInk} whitespace-nowrap`}>
            {judgementDateText(latest.date)}
          </span>
        )}
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
            // **消す対象の問いを持つブロックだけが呼ぶ**（`askIndex` が null の
            // 受け皿では、レイアウトが削除の矩形そのものを出さない）
            onRemoveAsk={() => {
              if (askIndex !== null) props.onRemoveAsk(askIndex)
            }}
            onFeedbackTextChange={props.onFeedbackTextChange}
            onFeedbackSentimentChange={props.onFeedbackSentimentChange}
            sentimentMenuProps={props.sentimentMenuProps}
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
          // **見える文字（`ADD_ASK_LABEL`）の語がこの名前に含まれること。**
          // 音声操作の利用者は見えている言葉でボタンを呼ぶ（WCAG 2.5.3 の趣旨）
          // ので、`ASK_LABEL` から組んで打ち直さない。**前半（`仮説{N}`）は
          // 動かさない**（規約。テストが前方一致で引く）。
          // **`足す` は隣の「FBを足す」と揃えたまま**——見える文字の `追加` と
          // 食い違うが、それはこの変更より前からモジュール全体にある不揃いで、
          // ここだけ直すと逆に隣と揃わなくなる（`docs/open-issues.md` に記録）
          aria-label={`${label} に${ASK_LABEL}を足す`}
          onClick={props.onAddAsk}
        >
          <Plus className={ACTION_ICON_SIZE_CLASS} aria-hidden="true" />
          {ADD_ASK_LABEL}
        </button>
        <button
          type="button"
          className={addButtonClass}
          aria-label={`${label} にFBを足す`}
          onClick={() => props.onAddFeedback(null)}
        >
          <Plus className={ACTION_ICON_SIZE_CLASS} aria-hidden="true" />
          {ADD_NOTE_LABEL}
        </button>
      </div>
    </div>
  )
}
