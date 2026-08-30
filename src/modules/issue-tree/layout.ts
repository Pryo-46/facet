import { buildTree, type FlatTreeNode } from '@/core/canvas/flat-tree'
import { layoutTree, type Size } from '@/core/canvas/tree-layout'
import type { Rect } from '@/core/canvas/viewport'
import { wrapWithin, type MeasureWidth } from '@/core/canvas/wrap'
import type { Feedback, Hypothesis, IssueTreeSchemaVersion3 } from '@/types/issue-tree'
import {
  awaitingAskCount,
  badgeGroupOf,
  BADGE_LABELS,
  EVENT_KIND_LABELS,
  hypothesisStatus,
  ISSUE_EVENT_LABELS,
  QUESTION_LABELS,
  type PosedQuestions,
} from './derive'
import {
  ACTION_HEIGHT,
  ASK_BLOCK_GAP,
  ASK_GAP,
  ASK_PADDING_X,
  ASK_PADDING_Y,
  BADGE_BORDER,
  BADGE_GAP,
  BADGE_HEIGHT,
  BADGE_PADDING_X,
  BOX_CONTENT_WIDTH,
  BOX_WIDTH,
  EXPANDED_BOX_WIDTH,
  FB_COL_GAP,
  FB_DELETE_WIDTH,
  FB_ICON_SIZE,
  FB_INDENT,
  ISSUE_INSET_X,
  ISSUE_INSET_Y,
  MIN_FIELD_WIDTH,
  MINI_ACTION_BORDER,
  MINI_ACTION_HEIGHT,
  MINI_ACTION_PADDING_X,
  MINI_ICON_GAP,
  MINI_ICON_SIZE,
  PANEL_GAP,
  PANEL_INDENT,
  PANEL_INSET_X,
  PANEL_INSET_Y,
  ROW_GAP,
  ROW_INDENT,
  SECTION_GAP,
  TITLE_GAP,
  TRASH_ICON_SIZE,
} from './measure'

/** 1つのフォント階級の測定器。エディタが DOM の見本から作る */
export interface IssueTreeFont {
  measure: MeasureWidth
  lineHeight: number
}

export interface IssueTreeFonts {
  /**
   * 課題のタイトル（`TITLE_FONT_CLASS` = text-sm leading-normal font-semibold）。
   * 太字は幅が変わるので独立に測る。
   *
   * **展開パネルの中のソリューション仮説のタイトルもこれで測る。**
   * 描くのは `HYPO_TITLE_FONT_CLASS`（同じ 14px・同じ行間 1.5 で、太さだけ
   * 500）なので、**測る側の方が太い＝広い**——測定は実際より早く折り返す側に
   * 倒れ、描画が測定からはみ出すことはない（`badgeWidth` が枠線ぶんを常に
   * 足しているのと同じ「広い方で空けておく」判断）。太さごとに見本を増やすより、
   * 安全側の再利用を選んでいる
   */
  title: IssueTreeFont
  /**
   * 展開中の課題のタイトル（`EXPANDED_TITLE_FONT_CLASS` = text-base leading-normal
   * font-semibold）。**畳んだ箱の 14px とはサイズが違うので独立に測る**
   *——1本で兼ねると、開いた瞬間にタイトルが測定より広く描かれて末尾の行が
   * 高さ固定の textarea から切れる（measure.ts の解説）
   */
  expandedTitle: IssueTreeFont
  /** 仮説の詳細・価値仮説・根拠・FB（text-sm leading-normal） */
  body: IssueTreeFont
  /** 節の見出し・見送りの理由・バッジ（text-sm） */
  small: IssueTreeFont
}

export interface IssuePlacement {
  /** 箱の外枠（世界座標）。エッジはここから引く */
  rect: Rect
  /**
   * この課題が**選択されているか**（m5 実機確認後）。選択は箱をクリックして
   * 入り、もう一度クリックすると外れる。**同時に1件だけ。**
   *
   * 運ぶのは2つ:
   *
   * - 枠の色（`IssueBox` が `border-ink` に切り替える。`FileList` の選択と同じ語彙）
   * - **末尾の「＋ 仮説を追加」を出すこと**（`addHypothesis` が非 null になる）
   *
   * **`expanded` とは別である**——仮説を1本も持たない課題は、選択されても
   * 開かない（箱は `BOX_WIDTH` のまま）。ボタンだけが出る。中身がボタン1つ
   * しかない 780 幅の箱を作らないための分けであって、情報源が分かれた
   * わけではない（どちらも下の `selectedIssueIndex` から出る）
   */
  selected: boolean
  /**
   * この課題が開いているか＝**選択されていて、かつ仮説を1本以上持つか**。
   * **「開いているか」の唯一の出所はここである**——描く側（`IssueBox` の
   * タイトルの書体・箱の幅）とパネルの有無（`HypothesisPlacement.expanded`）が
   * 別々の情報源を見ると、片方だけが「開いている」と言う状態が作れてしまう。
   * **エディタの `selectedIssueKey` を直接見ないこと。**
   *
   * **仮説を1本も持たない課題は、鍵が自分を指していても開かない。**
   * m4 まで展開の鍵は仮説を指していたので、仮説が消えれば鍵が宙に浮いて
   * 自動的に畳まれた。鍵が課題を指す m5 では消えても鍵が残るため、**行が
   * 1本も無い 780 幅の箱**が残る。ビュー状態の側で消しに行くのではなく、
   * **レイアウトが「開かない」と決める**ことで塞いでいる
   */
  expanded: boolean
  /** タイトルの入力欄（箱の中。バッジがあればその幅だけ右が空く） */
  title: Rect
  /**
   * 最新の旗（見送り／解決）。バッジはタイトル行の右端、理由はその下の1行
   *（最新だけ編集できる）。**種別はここに持たない**——描く側は
   * `node.events` の最新から引く（データを2箇所に写さない）
   */
  event: { badge: Rect; reason: Rect } | null
  /**
   * 選択された課題ノードの**末尾**に置く「＋ 仮説を追加」の帯（m5 Task 7）。
   * 選択されていなければ null。
   *
   * **`expanded` ではなく `selected` で出る**（m5 実機確認後）——仮説を
   * 1本も持たない課題は開かない（箱は `BOX_WIDTH` のまま）が、**足す道が
   * どこにも無くなってはいけない**。畳んだ幅のままボタンだけを出す。
   * 帯の「仮説を追加」は「最後に触った課題」に足す別経路なので、
   * これが無いと「この課題に足す」動線が箱から消える
   *
   * **高さ（`ACTION_HEIGHT`）は箱の高さに入っている。** 入れ忘れるとボタンが
   * 箱の下端からはみ出すが、絶対配置なので画面は黙ってはみ出したまま描く
   *（`layout.test.ts` の「末尾の『仮説を追加』の高さを勘定に入れる」が番人）。
   *
   * **幅は帯の全幅で、ボタンの幅は測らない**——`notes.adds`（節末の2つの
   * ボタン）と同じ組み方で、描く側が帯の中に左寄せで並べる。左端は
   * パネルと揃う（`PANEL_INDENT`。キャンバスの `.addhypo { margin-left: 12px }`）
   */
  addHypothesis: Rect | null
}

/**
 * 展開パネルの中身。畳まれている行は持たない。
 *
 * **節の見出しは「1行の帯」1つで表す**（`label`）。見出しの右にはバッジ・
 * 日付・トリガー・ゴミ箱が並ぶが、**それぞれの矩形を測らない**——帯の中で
 * flex に並べる（デザインキャンバスの `.label { display:flex; gap:8px }` そのもの）。
 * 見出しの文字幅を測って隣を置く形にすると、節見出しの書体（`text-sm
 * font-semibold`）専用の測定器がもう1本要る一方で、得られるのは
 * 「絶対配置で置ける」だけである
 */
export interface HypothesisPanel {
  panel: Rect
  /** 「ソリューション仮説」節。見出しの帯／仮説の文言／詳細（どちらも複数行） */
  solution: { label: Rect; title: Rect; detail: Rect }
  /** 「価値仮説」節。見出しの帯／価値仮説（複数行） */
  value: { label: Rect; field: Rect }
  /**
   * 「検証結果」節。`label` の帯に最新イベントのバッジ・日付・種別を選ぶ
   * トリガーが並び、その下が根拠（編集可）。
   * **イベント0件でもトリガーのために節は出る**——出さないと、マウスで
   * 判断を付ける動線が展開した仮説から消える
   */
  judgement: { label: Rect; note: Rect }
  /**
   * 「以前の判断」の見出し。1件も無ければ null（節ごと出ない）。
   *
   * **`previous` の配列とは別に持つ。** 見出しの場所を部品が
   * 「先頭行の上」から逆算すると、節の組み方（`SECTION_GAP`）が
   * レイアウトと部品の2箇所に散る
   */
  previousLabel: Rect | null
  /** 「以前の判断」。`events[0 .. length-2]` の順。読み取り専用 */
  previous: { badge: Rect; note: Rect }[]
  /**
   * FB の節。**中身は問いブロックの入れ子**（デザインキャンバスの `.ask`）で、
   * `blocks` は `asks` の順に並び、最後に「どの問いにも紐づかないFB」の
   * ブロックが**その中身が1件以上あるときだけ**付く。`adds` は
   * 「聞きたいことを追加」「FBを追加」が横に並ぶ1行
   */
  notes: { label: Rect; blocks: AskBlockRects[]; adds: Rect }
}

/**
 * FB 1行の置き場所。**`feedbackIndex` はデータ（`hypothesis.feedbacks`）の
 * 添字であって、ブロックの中の順番ではない**——入れ子に並べ替えて描いても、
 * 書き換え・削除・`data-cell` は元の席を指す必要がある
 */
export interface FeedbackRowRects {
  feedbackIndex: number
  /** 行の全体（アイコンから削除ボタンまで） */
  rect: Rect
  /** 調子（`sentiment`）のアイコン */
  icon: Rect
  /** 本文の欄（複数行。ここだけが伸びる） */
  text: Rect
  /** `{by} · {date}`。**幅は実測**（右端の削除ボタンから左へ置く） */
  meta: Rect
  /** 削除の `X` */
  remove: Rect
}

/**
 * 問いブロック1つ。**問いに答えとしての FB がぶら下がる**入れ子の単位。
 *
 * **`askIndex` が `null` のブロックは「どの問いにも紐づかないFB」の受け皿**で、
 * `askId` が `null` の FB だけでなく、**実在しない `askId` を持つ FB もここに入る**
 *（スキーマは「存在しない ask を指していてもファイルは開ける」と明記している）。
 * 問いごとに `askId` で素朴に絞ると、そういう FB がどのブロックにも入らず
 * **画面から黙って消える**——「ファイルにあるものが黙って減るのが一番たちが悪い」
 * は `commands.ts` の `normalizeOrder` の註が述べている、このコードベースの価値である。
 * 割り振りは常に**全 FB のちょうど1つのブロックへの分割**になっている
 */
export interface AskBlockRects {
  /** `asks` の添字。null＝末尾の「どの問いにも紐づかないFB」ブロック */
  askIndex: number | null
  /** ブロックの面（キャンバスの `.ask`。中身はこの矩形の中に収まる） */
  block: Rect
  /**
   * 問いの見出し行。`icon` は問いの印（`askIndex` が null のときは描かない
   * ——**場所は空けたまま**にして、文言の左端をブロックどうしで揃える）、
   * `badge` は「FB待ち」（立っていなければ null。`HypothesisRowRects.feedbackBadge`
   * と同じ形）、`add` はこの問いに FB を足すミニボタン、`remove` は問いの削除。
   *
   * **`remove` は問いのあるブロックだけ**（`askIndex` が `null` なら null）
   *——「どの問いにも紐づかないFB」の受け皿には消す対象の問いが無い。
   * 列は左から [アイコン][文言][FB待ち][＋FB][削除] で、**削除は FB 行と同じ
   * 右端の列**（`FB_DELETE_WIDTH`）に座る
   */
  head: { icon: Rect; text: Rect; badge: Rect | null; add: Rect; remove: Rect | null }
  /** このブロックに属する FB。**データの配列順のまま** */
  rows: FeedbackRowRects[]
}

/**
 * 畳まれた1行の中身。
 *
 * - `text`: 文言（`body.lineHeight` ちょうどの1行。溢れは CSS で省略）
 * - `badge`: 状態のバッジ（行末。高さ `BADGE_HEIGHT`）
 * - `feedbackBadge`: 「FB待ち」が立っていれば、状態のバッジの左に
 *   `BADGE_GAP` 空けて並ぶ。立っていなければ null
 */
export interface HypothesisRowRects {
  text: Rect
  badge: Rect
  feedbackBadge: Rect | null
}

/**
 * 仮説1本の置き場所。**畳まれた行（`row`）と展開パネル（`expanded`）は
 * 判別子つきの合併で排他にしてある**——`row` を持つ枝の `expanded` は
 * `null` 型そのものなので、**両方を埋めた値は型が通らない。**
 *
 * 独立した2つの `| null` にしていると、将来レイアウトが両方を埋めたときに
 * 描く側の `if` の順で**行が勝ってパネルが静かに消える**（型は通ったまま）。
 * `row !== null` / `expanded !== null` のどちらで絞っても、もう片方が
 * 確定するのはこの形のおかげである。
 *
 * **開いた仮説に「点・文言・バッジ」の頭部は無い**——パネルが全部を負う
 *（計画「閉じた行と展開パネルは責務が違い、同時に描かれることがない」）。
 * 頭部を残すと、パネルの「ソリューション仮説」節と**同じ文言が2箇所に出る**
 */
export type HypothesisPlacement =
  | {
      /** 行の全体（畳まれた1行） */
      rect: Rect
      row: HypothesisRowRects
      expanded: null
    }
  | {
      /** 行の全体（展開していればパネルそのもの） */
      rect: Rect
      row: null
      expanded: HypothesisPanel
    }

export interface IssueTreeLayout {
  /** issues と同じ添字。循環して根から到達できないものは null */
  issues: (IssuePlacement | null)[]
  /** hypotheses と同じ添字。ぶら下がり先が図に無いものは null */
  hypotheses: (HypothesisPlacement | null)[]
  width: number
  height: number
}

/**
 * **`JUDGEMENT_TRIGGER_LABELS`（「判断を追加」「判断を変える」）は m5 Task 6 で
 * 消した。** トリガーは状態のバッジ自身になったので、**トリガーに固有の文言は
 * もう存在しない**——描くのは `EVENT_KIND_LABELS` ／ `BADGE_LABELS` の語であり、
 * 何をするボタンかはアクセシブル名（`仮説{N}に判断を追加`）が運ぶ。
 * 帯の高さを決める `judgeLabelH` も**バッジの高さで測り直してある**
 *（下の「検証結果の節」を見ること）
 */

/**
 * 「検証結果」節でイベントが1件も無いときに根拠の場所へ出す文言
 *（デザインキャンバスの `.field.ph`）。**空欄を警告にしない**——判断を
 * 選ぶまで根拠は書けない、という手順の案内であって欠落の印ではない
 */
export const NO_JUDGEMENT_TEXT = '理由（判断を選ぶと書ける）'

/**
 * 節の見出し。**`derive.ts` には置かない**——Skill の報告には出ない画面だけの言葉。
 * **並びは描く順**（キャンバスの「仮説の展開」アートボード）: ソリューション仮説 →
 * 価値仮説 → 検証結果 →（以前の判断）→ FB
 */
export const SECTION_LABELS = {
  solution: 'ソリューション仮説',
  value: '価値仮説',
  judgement: '検証結果',
  previous: '以前の判断',
  notes: 'FB',
} as const

/**
 * 空の欄に出す案内。**プレースホルダは高さに効かない**（測るのは値の側）ので
 * レイアウトは使わないが、**節見出しと同じ「画面だけの言葉」なので隣に置く**
 *——部品ごとに打ち直すと、同じ欄の呼び名が節見出しとずれる
 */
export const FIELD_PLACEHOLDERS = {
  detail: 'どう作るか',
  value: 'なぜ効くか',
  ask: '聞きたいこと',
} as const

/**
 * 検証結果の見出しに出す日付（キャンバスの `.date` ＝「2/13 更新」）。
 * **`YYYY-MM-DD` をそのまま出さない**——見出しの帯は1行で、年は判断の
 * 読み比べに要らない。
 *
 * **形の違う日付は考えない。** スキーマが `date` のすべてに
 * `^\d{4}-\d{2}-\d{2}$` を課しており（`schemas/issue-tree.schema.json`）、
 * 違う形のファイルはレベル1検証で弾かれて**そもそも開けない**。
 * 到達しない分岐を書くと、テストの当たらないコードが1本増えるだけである
 */
export function judgementDateText(date: string): string {
  return `${shortDate(date)} 更新`
}

/**
 * 画面に出す月日（`2/13`）。**`YYYY-MM-DD` をそのまま出さない**——年は
 * 判断の読み比べにも FB の並びにも要らない。形の違う日付を考えないのは
 * `judgementDateText` と同じ理由（レベル1検証が弾く＝そもそも開けない）
 */
function shortDate(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
}

/**
 * FB 行の右に出す「誰が・いつ」（キャンバスの `.meta` ＝「田中さん · 2/12」）。
 *
 * **測る側と描く側が同じ文字列を読む**——幅を実測して右端から置くので、
 * 打ち直すと測定と描画がずれる。`by` は空文字を許す（会話に出ていなければ
 * 推測して埋めない、というスキーマの規律）ので、**空なら日付だけ**にする
 *——「 · 2/12」と中黒だけが浮くのは、誰が言ったか分からないことの表示として
 * 読めない
 */
export function feedbackMetaText(f: Pick<Feedback, 'by' | 'date'>): string {
  return f.by === '' ? shortDate(f.date) : `${f.by} · ${shortDate(f.date)}`
}

/**
 * 「＋ FBを追加」のボタンの文言（節の末尾。**どの問いにも紐づかない FB を作る**）。
 * 値はデザインキャンバスの `.adds` から逐語
 */
export const ADD_NOTE_LABEL = 'FBを追加'
/** 「＋ 聞きたいことを追加」のボタンの文言。同上 */
export const ADD_ASK_LABEL = '聞きたいことを追加'
/** 問いブロックの中の小さな「＋FB」の文言（キャンバスの `.miniadd`） */
export const MINI_ADD_NOTE_LABEL = 'FB'
/**
 * `askIndex` が `null` のブロックの見出し（キャンバスの逐語）。
 * **編集できない固定文**——これは問いではなく「問いが無い」ことの名前なので、
 * 打ち替えられると `askId === null` の意味と食い違う
 */
export const NO_ASK_TEXT = 'どの問いにも紐づかないFB'

/**
 * 折り返した文章の高さ（余白は箱が1度だけ持つので、ここでは 0）。
 */
function textHeight(text: string, font: IssueTreeFont, width: number): number {
  return wrapWithin(text, font.measure, font.lineHeight, {
    maxWidth: width,
    minWidth: 0,
    insetX: 0,
    insetY: 0,
  }).height
}

/**
 * バッジの幅。**枠線ぶんを常に足す**——枠を持つ群（保留・未決・見送り・抑制）は
 * 面を塗る群より 2px 広い。広い方で空けておけば、狭い群は右寄せの中で
 * 2px 余るだけで済む（足りない方に倒すと文字が切れる）
 */
function badgeWidth(label: string, font: IssueTreeFont): number {
  return Math.ceil(font.measure(label)) + BADGE_PADDING_X * 2 + BADGE_BORDER * 2
}

/**
 * ミニボタン（問いブロックの「＋FB」）の幅。アイコン・空き・左右の余白・枠線を
 * 文言の実測に足す（`badgeWidth` と同じ組み立て）
 */
function miniActionWidth(label: string, font: IssueTreeFont): number {
  return (
    Math.ceil(font.measure(label)) +
    MINI_ICON_SIZE +
    MINI_ICON_GAP +
    MINI_ACTION_PADDING_X * 2 +
    MINI_ACTION_BORDER * 2
  )
}

/**
 * FB を問いブロックへ振り分ける。**返すのは `feedbacks` の添字の配列で、
 * すべての FB がちょうど1つのブロックに入る**（分割であって絞り込みではない）。
 *
 * - `attached[i]` … `asks[i]` を指す FB
 * - `loose` … `askId` が `null` の FB **と、実在しない `askId` を持つ FB**
 *
 * **宙に浮いた `askId` を捨てないこと。** スキーマは「存在しない ask を指していても
 * ファイルは開ける（整合性検証も今は見ない）」と明記しており、手書き・AI が書いた
 * ファイルにはそういう FB がありうる。問いごとに `askId` で絞って残りを
 * 「`askId === null`」だけで集めると、それらはどのブロックにも入らず画面から
 * 黙って消える（`AskBlockRects` の解説）。
 *
 * **同じ id の問いが2つあるファイルでは、先に現れた方だけが答えを受け取る**
 *（`core/canvas/flat-tree.ts` の「同じ id は先に現れた方を採る」と同じ規則）
 *——両方に入れると、1件の FB が画面に2回出る（減るのと同じくらい嘘である）
 */
function groupFeedbacks(h: Pick<Hypothesis, 'asks' | 'feedbacks'>): {
  attached: number[][]
  loose: number[]
} {
  const askAt = new Map<string, number>()
  h.asks.forEach((a, i) => {
    if (!askAt.has(a.id)) askAt.set(a.id, i)
  })
  const attached: number[][] = h.asks.map(() => [])
  const loose: number[] = []
  h.feedbacks.forEach((f, i) => {
    const at = f.askId === null ? undefined : askAt.get(f.askId)
    if (at === undefined) loose.push(i)
    else attached[at].push(i)
  })
  return { attached, loose }
}

/** 仮説行1本の計画。高さを先に確定させ、置く場所が決まってから矩形を組む */
interface RowPlan {
  height: number
  /** `x` は箱の内容の左端、`y` は行の上端（どちらも世界座標） */
  build: (x: number, y: number) => HypothesisPlacement
}

/**
 * 課題ツリーのレイアウト（**完全な純関数**）。
 *
 * 新しい文法（M3）は「**箱は課題だけ／仮説は箱の中の1行**」である。仮説は
 * 独立した矩形を持たなくなったので、ブロック＝箱そのものになり、コアの
 * `layoutTree` へはその寸法だけを渡す。木の畳み方（親を最初の子と最後の子の
 * 中心に置く／兄弟の衝突を全深さで見る）はロジックツリーと同じ関数がやる。
 *
 * **展開の単位は課題ノードである**（m5。M3〜m4 は仮説1本だった）。開いた課題は
 * 幅が `EXPANDED_BOX_WIDTH` に広がり、**その課題にぶら下がる仮説がすべて**
 * パネル（判断・以前の判断・FB）を開く。1本だけ開く形をやめたのは、仮説どうしを
 * 見比べる場面——どれを先に検証するか、どれが同じ問いに答えているか——で、
 * 開くたびに隣が畳まれると比較そのものができないため。
 *
 * 押し広げは**列の側が引き受ける**——`tree-layout.ts` の `columnXs` は深さごとの
 * 最大幅で列の x を決めるので、`Size.width` に 780 を渡せば右の列がそのぶん
 * 送られる。**`tree-layout.ts` は触らない。**
 *
 * **開く鍵は「選択中の課題」である**（m5 の実機確認後）。箱をクリックすると
 * その課題が選択され、選択されていて仮説を1本以上持つ課題が開く。
 * **選択されていても仮説が0本なら開かない**——箱は `BOX_WIDTH` のままで、
 * 末尾の「＋ 仮説を追加」だけが出る（`IssuePlacement.selected` の解説）。
 *
 * `selectedIssueIndex` は**ビュー状態であり `data` には無い**——座標と同じく、
 * 「いまどれを選んでいるか」をファイルに書かない（rev 3章）。
 *
 * **ここに「前回どこにあったか」の状態を混ぜないこと**——同じデータと同じ
 * 選択状態から違う図が出るようになった時点で「図は導出」が崩れる
 */
export function layoutIssueTree(
  data: IssueTreeSchemaVersion3,
  posed: PosedQuestions,
  fonts: IssueTreeFonts,
  /** 選択している**課題**の添字。無ければ -1 */
  selectedIssueIndex: number,
): IssueTreeLayout {
  /**
   * 課題 ID → 添字。仮説の行が「持ち主の課題が開いているか」を引くのに要る
   *（開閉が仮説ごとではなく課題ごとになったため）
   */
  const issueIndexOf = new Map<string, number>()
  data.issues.forEach((node, i) => {
    // **ID 重複は先に現れた方を採る**（`commands.ts` の規約、実体は
    // `core/canvas/flat-tree-core.ts` の `firstIndexById`）。ID 重複のファイルは
    // 受け入れて赤表示する仕様（`consistency.ts` の `duplicate-id`）なので、
    // ここは到達可能な入力である。**後勝ちにすると木の側（先勝ち）とずれ**、
    // 先頭側の箱を選んでも行が開かず箱だけが 780 に広がる
    if (!issueIndexOf.has(node.id)) issueIndexOf.set(node.id, i)
  })
  /** 展開している課題の中身が使える幅（箱が広がったぶんだけ広い） */
  const EXPANDED_CONTENT_WIDTH = EXPANDED_BOX_WIDTH - ISSUE_INSET_X * 2
  // --- 1. 仮説行の計画（高さと組み立て） ---
  // **`null` を混ぜない。** 「図に出ない仮説」は `hypotheses[hi]` が `null` の
  // ままであることで表される——`walkPlace` は根から到達できる課題しか歩かない
  // ので、到達しない課題にぶら下がる行は組み立て自体が呼ばれない
  const plans: RowPlan[] = data.hypotheses.map((h, hi) => {
    // **開いているかは持ち主の課題で決まる。** ぶら下がり先が図に無い仮説
    //（参照切れ）はどの課題の子にもならないので、開くこともない
    const owner = issueIndexOf.get(h.issueId)
    const open = owner !== undefined && owner === selectedIssueIndex
    /**
     * この行が使える幅。**開いた課題の中では箱が広がっているので、行も
     * パネルも広い方の幅で測る**——`BOX_CONTENT_WIDTH` のまま測ると、
     * ブラウザに与えられる幅より狭い前提で折り返しを数えることになり、
     * パネルの下に隙間が空く（measure.ts の「定数と Tailwind クラスは対」と
     * 同じ約束の、幅の側）
     */
    const contentWidth = open ? EXPANDED_CONTENT_WIDTH : BOX_CONTENT_WIDTH
    const panelContentWidth = contentWidth - PANEL_INDENT - PANEL_INSET_X * 2

    // --- 畳まれた1行 ---
    // **バッジと文言の幅の式はこの枝にしか無い。** 開いた仮説に頭部は無く
    //（`HypothesisPlacement` の解説）、パネルの中身は下でパネルの幅から組む
    if (!open) {
      const group = badgeGroupOf(hypothesisStatus(h))
      const badgeW = badgeWidth(BADGE_LABELS[group], fonts.small)
      /**
       * 「FB待ち」の行バッジ（M22。M4 で `pendingNotes` から `asks`/`feedbacks` へ
       * 移った）。帯の集計（`tallyQuestions`）と行の表示を一対一にする——数だけが
       * 増えて、どの行かが図から読めないのを防ぐ。
       *
       * **ここで `suppressed` を見る必要は無い**——抑制された仮説には
       * `poseQuestions` が `feedback` を立てない（`derive.ts`）。
       * **展開中は出ない**——問いブロックの側に出す（m5 Task 5）
       */
      const q = posed.hypothesisQuestions[hi]
      const feedbackW =
        q !== undefined && q.feedback > 0 ? badgeWidth(QUESTION_LABELS.feedback, fonts.small) : 0
      /** 行末に並ぶバッジ全体の幅（2つ並ぶときは間の `BADGE_GAP` も含む） */
      const badgesW = feedbackW === 0 ? badgeW : badgeW + BADGE_GAP + feedbackW
      const textW = contentWidth - ROW_INDENT - BADGE_GAP - badgesW
      // 畳まれた行は**必ず1行**（溢れは CSS の truncate が省略記号にする）
      const textH = fonts.body.lineHeight
      // バッジは行の中で縦中央に座るので、文言より高ければ行がその高さになる
      const rowH = Math.max(textH, BADGE_HEIGHT)

      return {
        height: rowH,
        build: (x, y) => {
          const badge: Rect = {
            x: x + contentWidth - badgeW,
            y: y + Math.floor((rowH - BADGE_HEIGHT) / 2),
            width: badgeW,
            height: BADGE_HEIGHT,
          }
          return {
            rect: { x, y, width: contentWidth, height: rowH },
            row: {
              text: {
                x: x + ROW_INDENT,
                y: y + Math.floor((rowH - textH) / 2),
                width: textW,
                height: textH,
              },
              badge,
              // FB待ちバッジは**状態のバッジから逆算する**（右端から左へ並ぶ）
              feedbackBadge:
                feedbackW === 0
                  ? null
                  : {
                      x: badge.x - BADGE_GAP - feedbackW,
                      y: badge.y,
                      width: feedbackW,
                      height: BADGE_HEIGHT,
                    },
            },
            expanded: null,
          }
        },
      }
    }

    // --- 展開パネルの中身を測る ---
    const labelH = fonts.small.lineHeight
    const latest = h.events.length === 0 ? null : h.events[h.events.length - 1]

    /**
     * ソリューション仮説の節。**タイトルは `fonts.title` で測る**（描くのは
     * `HYPO_TITLE_FONT_CLASS`。`IssueTreeFonts.title` の解説＝安全側の再利用）。
     * 詳細は本文と同じ書体で、**空でも1行ぶんの高さを取る**——空欄には
     * プレースホルダが出るので、潰すと押せる場所が消える
     */
    const hypoTitleH = textHeight(h.title, fonts.title, panelContentWidth)
    const detailH = textHeight(h.detail, fonts.body, panelContentWidth)
    /**
     * 見出しの帯にはゴミ箱（仮説の削除。m5 Task 7）が右端に並ぶので、
     * **帯の高さは高い方に合わせる**——`judgeLabelH` がバッジで測っているのと
     * 同じ組み方で、書体が小さい環境でアイコンが帯からはみ出さない
     */
    const solutionLabelH = Math.max(labelH, TRASH_ICON_SIZE)
    const solutionH = solutionLabelH + SECTION_GAP + hypoTitleH + SECTION_GAP + detailH

    /** 価値仮説の節（見出し＋1つの欄） */
    const valueH = textHeight(h.value, fonts.body, panelContentWidth)
    const valueSectionH = labelH + SECTION_GAP + valueH

    /**
     * 検証結果の節。**見出しの帯にバッジと日付が同居する**ので、帯の高さは
     * 高い方に合わせる（幅は測らない。`HypothesisPanel` の解説）。根拠は
     * その下に**パネルの全幅**で座る。
     *
     * **`ACTION_HEIGHT`（24px）は入れない。** m5 Task 6 で「判断を追加」という
     * 文言のボタンが消え、判断のトリガーは**バッジ自身**（`BADGE_HEIGHT`）に
     * なった。帯にボタンぶんの 24px を空け続けると、**誰も使わない 2px が
     * 根拠の欄を押し下げたまま残る**（消した文言のぶんを測り直し忘れる、の形）
     */
    const judgeLabelH = Math.max(labelH, BADGE_HEIGHT)
    const judgeNoteH = textHeight(
      latest === null ? NO_JUDGEMENT_TEXT : latest.note,
      fonts.body,
      panelContentWidth,
    )
    const judgementH = judgeLabelH + SECTION_GAP + judgeNoteH

    // 以前の判断は追記専用の記録。**最新1件を除いた全部**を古い順に出す
    const previous = h.events.slice(0, -1).map((e) => {
      const w = badgeWidth(EVENT_KIND_LABELS[e.kind], fonts.small)
      const noteW = panelContentWidth - w - BADGE_GAP
      return { badgeW: w, noteW, height: Math.max(BADGE_HEIGHT, textHeight(e.note, fonts.body, noteW)) }
    })
    const previousH =
      previous.length === 0
        ? 0
        : labelH +
          SECTION_GAP +
          previous.reduce((sum, p) => sum + p.height, 0) +
          ROW_GAP * (previous.length - 1)

    /**
     * FB の節。**問いブロックの入れ子**（キャンバスの `.ask`）で、`asks` の順に
     * 並べ、最後に「どの問いにも紐づかないFB」のブロックを**中身があるときだけ**置く
     */
    const { attached, loose } = groupFeedbacks(h)
    const blockContentWidth = panelContentWidth - ASK_PADDING_X * 2
    const rowContentWidth = blockContentWidth - FB_INDENT
    const miniAddW = miniActionWidth(MINI_ADD_NOTE_LABEL, fonts.small)
    /**
     * 「FB待ち」が立つ問いか。**ここで数え直さない**——条件を持っているのは
     * `derive.ts` の `awaitingAskCount` だけであり（「この関数だけが『FB待ち』の
     * 条件を持つ」）、問い1件だけの配列を渡して同じ関数に判定させる。
     * 抑制（祖先の見送り・解決）は `posed` の側が既に落としているので、
     * **仮説の件数が 0 なら1件も立たない**——抑制の規則をここへ写さないための門である
     */
    const awaitingCount = posed.hypothesisQuestions[hi]?.feedback ?? 0
    const awaits = (askIndex: number): boolean => {
      const ask = h.asks[askIndex]
      if (ask === undefined || awaitingCount === 0) return false
      return awaitingAskCount({ asks: [ask], feedbacks: h.feedbacks }) === 1
    }

    /** FB 1行の計画。列は [アイコン][本文][{by} · {date}][削除] */
    const planFeedbackRow = (feedbackIndex: number) => {
      const f = h.feedbacks[feedbackIndex]
      const meta = feedbackMetaText(f)
      /** アイコン・3つの空き・削除ボタンを引いた、本文と `meta` が分け合う幅 */
      const room = rowContentWidth - FB_ICON_SIZE - FB_COL_GAP * 3 - FB_DELETE_WIDTH
      const metaW = Math.min(
        Math.ceil(fonts.small.measure(meta)),
        Math.max(0, room - MIN_FIELD_WIDTH),
      )
      const textW = room - metaW
      return {
        feedbackIndex,
        metaW,
        textW,
        // 本文が1行でもアイコンより低くならないようにする
        height: Math.max(textHeight(f.text, fonts.body, textW), FB_ICON_SIZE),
      }
    }

    /** 問いブロック1つの計画。`askIndex` が null なら「紐づかないFB」の受け皿 */
    const planAskBlock = (askIndex: number | null, indices: readonly number[]) => {
      const badgeW =
        askIndex !== null && awaits(askIndex)
          ? badgeWidth(QUESTION_LABELS.feedback, fonts.small)
          : 0
      /**
       * 見出しの列は [アイコン][文言][FB待ち][＋FB][削除]。文言以外は幅が
       * 決まっている。**削除は問いのあるブロックだけ**（`askIndex` が `null` の
       * 受け皿には消す対象の問いが無い）——**その席を測り忘れると、文言が
       * ボタンの下へ潜る**（`FB_DELETE_WIDTH` を引いているのがその席）
       */
      const removable = askIndex !== null
      const headTextW = Math.max(
        blockContentWidth -
          FB_ICON_SIZE -
          FB_COL_GAP * 2 -
          miniAddW -
          (badgeW === 0 ? 0 : badgeW + FB_COL_GAP) -
          (removable ? FB_DELETE_WIDTH + FB_COL_GAP : 0),
        MIN_FIELD_WIDTH,
      )
      const headTextH = textHeight(
        askIndex === null ? NO_ASK_TEXT : (h.asks[askIndex]?.text ?? ''),
        fonts.body,
        headTextW,
      )
      // 見出しの帯は「文言・バッジ・ミニボタン」の一番高いものに合わせる
      //（検証結果の見出しが `judgeLabelH` を組んでいるのと同じ）
      const headH = Math.max(headTextH, MINI_ACTION_HEIGHT, badgeW === 0 ? 0 : BADGE_HEIGHT)
      const rows = indices.map(planFeedbackRow)
      const height =
        ASK_PADDING_Y * 2 +
        headH +
        (rows.length === 0
          ? 0
          : ASK_GAP + rows.reduce((sum, r) => sum + r.height, 0) + ROW_GAP * (rows.length - 1))
      // `removable` は下の `build` も読む（削除の矩形を出すかどうか）ので計画に載せる
      return { askIndex, badgeW, headTextW, headTextH, headH, rows, removable, height }
    }

    const askBlocks = [
      ...h.asks.map((_, i) => planAskBlock(i, attached[i] ?? [])),
      // **1件も無ければブロックごと出さない**——空の受け皿は「紐づけ忘れがある」
      // という誤った印になる。足す動線は節の末尾の「＋ FBを追加」が持つ
      ...(loose.length === 0 ? [] : [planAskBlock(null, loose)]),
    ]
    const notesSectionH =
      labelH +
      SECTION_GAP +
      askBlocks.reduce((sum, b) => sum + b.height + ASK_BLOCK_GAP, 0) +
      ACTION_HEIGHT

    const sectionHs = [solutionH, valueSectionH, judgementH, previousH, notesSectionH].filter(
      (s) => s > 0,
    )
    const panelH =
      PANEL_INSET_Y * 2 +
      sectionHs.reduce((sum, s) => sum + s, 0) +
      PANEL_GAP * (sectionHs.length - 1)
    // **開いた仮説に頭部は無い**（`HypothesisPlacement.row` の解説）。行の高さは
    // パネルそのもの
    const height = panelH

    return {
      height,
      build: (x, y) => {
        // **パネルの左端は畳まれた行の文言の左端と揃う**（`PANEL_INDENT` と
        // `ROW_INDENT` は同じ原点から測った同じ値。measure.ts の解説）
        const panel: Rect = {
          x: x + PANEL_INDENT,
          y,
          width: contentWidth - PANEL_INDENT,
          height: panelH,
        }
        const cx = panel.x + PANEL_INSET_X
        let cursor = panel.y + PANEL_INSET_Y
        /** パネルの全幅を使う1行を置いて、次の行の上端まで進める */
        const fullRow = (rowHeight: number, gap: number): Rect => {
          const r: Rect = { x: cx, y: cursor, width: panelContentWidth, height: rowHeight }
          cursor += rowHeight + gap
          return r
        }
        /** 節の見出しの帯を置いて本文の上端まで進める */
        const sectionLabel = (bandHeight = labelH): Rect => fullRow(bandHeight, SECTION_GAP)

        const solutionLabel = sectionLabel(solutionLabelH)
        // 節の中の空きは見出しと同じ `SECTION_GAP`（キャンバスの `.sec` の gap）
        const hypoTitle = fullRow(hypoTitleH, SECTION_GAP)
        const detail = fullRow(detailH, PANEL_GAP)

        const valueLabel = sectionLabel()
        const valueField = fullRow(valueH, PANEL_GAP)

        const judgeLabel = sectionLabel(judgeLabelH)
        const judgeNote = fullRow(judgeNoteH, 0)

        const previousRects: { badge: Rect; note: Rect }[] = []
        let previousLabel: Rect | null = null
        if (previous.length > 0) {
          cursor += PANEL_GAP
          previousLabel = sectionLabel()
          previous.forEach((p, j) => {
            if (j > 0) cursor += ROW_GAP
            previousRects.push({
              badge: { x: cx, y: cursor, width: p.badgeW, height: BADGE_HEIGHT },
              note: { x: cx + p.badgeW + BADGE_GAP, y: cursor, width: p.noteW, height: p.height },
            })
            cursor += p.height
          })
        }

        cursor += PANEL_GAP
        const notesLabel = sectionLabel()
        const blocks: AskBlockRects[] = askBlocks.map((bp) => {
          const block: Rect = { x: cx, y: cursor, width: panelContentWidth, height: bp.height }
          const bx = block.x + ASK_PADDING_X
          /** ブロックの中身の右端（＋FB とバッジはここから左へ並ぶ） */
          const right = bx + blockContentWidth
          let by = block.y + ASK_PADDING_Y
          // 問いの削除は**右端の列**（FB 行の削除と同じ幅・同じ高さ）。
          // 「＋FB」はその左へ寄る——右端から左へ並べるのは、この見出し行と
          // FB の行で唯一の並べ方である（`head.badge` も `add` から逆算する）
          const remove: Rect | null = bp.removable
            ? {
                x: right - FB_DELETE_WIDTH,
                y: by,
                width: FB_DELETE_WIDTH,
                height: fonts.body.lineHeight,
              }
            : null
          const add: Rect = {
            x: (remove === null ? right : remove.x - FB_COL_GAP) - miniAddW,
            y: by,
            width: miniAddW,
            height: MINI_ACTION_HEIGHT,
          }
          const head = {
            icon: { x: bx, y: by, width: FB_ICON_SIZE, height: fonts.body.lineHeight },
            text: {
              x: bx + FB_ICON_SIZE + FB_COL_GAP,
              y: by,
              width: bp.headTextW,
              height: bp.headTextH,
            },
            // FB待ちのバッジは**＋FB から逆算する**（右端から左へ並ぶ。
            // 畳まれた行が状態のバッジから逆算しているのと同じ）
            badge:
              bp.badgeW === 0
                ? null
                : {
                    x: add.x - FB_COL_GAP - bp.badgeW,
                    y: by,
                    width: bp.badgeW,
                    height: BADGE_HEIGHT,
                  },
            add,
            remove,
          }
          by += bp.headH
          const rows: FeedbackRowRects[] = bp.rows.map((rp, j) => {
            by += j === 0 ? ASK_GAP : ROW_GAP
            const rx = bx + FB_INDENT
            const rect: Rect = { x: rx, y: by, width: rowContentWidth, height: rp.height }
            const remove: Rect = {
              x: rx + rowContentWidth - FB_DELETE_WIDTH,
              y: by,
              width: FB_DELETE_WIDTH,
              height: fonts.body.lineHeight,
            }
            const out: FeedbackRowRects = {
              feedbackIndex: rp.feedbackIndex,
              rect,
              icon: { x: rx, y: by, width: FB_ICON_SIZE, height: fonts.body.lineHeight },
              text: {
                x: rx + FB_ICON_SIZE + FB_COL_GAP,
                y: by,
                width: rp.textW,
                height: rp.height,
              },
              meta: {
                x: remove.x - FB_COL_GAP - rp.metaW,
                y: by,
                width: rp.metaW,
                height: fonts.body.lineHeight,
              },
              remove,
            }
            by += rp.height
            return out
          })
          cursor += bp.height + ASK_BLOCK_GAP
          return { askIndex: bp.askIndex, block, head, rows }
        })
        const addsRect: Rect = { x: cx, y: cursor, width: panelContentWidth, height: ACTION_HEIGHT }

        return {
          rect: { x, y, width: contentWidth, height },
          row: null,
          expanded: {
            panel,
            solution: { label: solutionLabel, title: hypoTitle, detail },
            value: { label: valueLabel, field: valueField },
            judgement: { label: judgeLabel, note: judgeNote },
            previousLabel,
            previous: previousRects,
            notes: { label: notesLabel, blocks, adds: addsRect },
          },
        }
      },
    }
  })

  const rowsOf = new Map<string, number[]>()
  data.hypotheses.forEach((h, i) => {
    rowsOf.set(h.issueId, [...(rowsOf.get(h.issueId) ?? []), i])
  })

  // --- 2. 課題の箱を測る ---
  const built = buildTree(data.issues)
  interface BoxPlan {
    /** 開いているか（＝選ばれていて、かつ仮説を1本以上持つ） */
    open: boolean
    /** 選ばれているか。枠の色と、末尾の「＋ 仮説を追加」の有無をこれが決める */
    selected: boolean
    width: number
    /** 箱の中の文章が使える幅（`width - ISSUE_INSET_X * 2`）。展開すると広がる */
    contentWidth: number
    titleWidth: number
    titleHeight: number
    /** 見送りバッジ（無ければ 0）。タイトルの右に空ける幅は `BADGE_GAP + これ` */
    badgeWidth: number
    reasonHeight: number | null
    height: number
    rows: number[]
  }
  /**
   * **旗の無い箱の右上に並ぶトリガー2つ**（見送り／解決。`IssueTreeEditor` の
   * `FLAG_KINDS`）の合計幅＋間の `BADGE_GAP`。描く側の `IssueBox` が同じ枠を
   * `gap-2`（＝`BADGE_GAP` の 8px）の flex で並べている。
   *
   * **箱ごとに変わらない**（`fonts` はループの外）ので、`boxes` の外で1回だけ
   * 畳む。**語ごとに測って畳む**——`ISSUE_EVENT_LABELS` に種別が増えれば
   * 測る側は自動で追随し、足りない方（＝はみ出す方）へは倒れない
   *（`FLAG_KINDS` は `IssueEventKind[]` なので、ここが型として上界になる）
   */
  const flagTriggersW = Object.values(ISSUE_EVENT_LABELS).reduce(
    (sum, label, idx) => sum + (idx === 0 ? 0 : BADGE_GAP) + badgeWidth(label, fonts.small),
    0,
  )
  const boxes: BoxPlan[] = data.issues.map((node, i) => {
    const rows = rowsOf.get(node.id) ?? []
    const selected = i === selectedIssueIndex
    // **開くものが無ければ開かない。** 選ばれていても仮説が0本なら畳んだまま
    // ——展開中の課題から最後の仮説を消したときに、行の無い 780 幅の箱が
    // 残らないようにする（`IssuePlacement.expanded` の解説）。**選択そのものは
    // 残る**ので、末尾の「＋ 仮説を追加」は畳んだ幅のまま出る。
    //
    // **行の側と同じ判定を通す。** 仮説行は `issueIndexOf`（先勝ち）で持ち主を
    // 引くので、ID が重複しているとき開けるのは**先に現れた方だけ**である。
    // ここで後ろ側も開けてしまうと、`BOX_WIDTH` 前提で測った行を `EXPANDED_BOX_WIDTH` の箱に置くこと
    // （またはその逆）になり、行とパネルが箱からはみ出す
    const open = selected && rows.length > 0 && issueIndexOf.get(node.id) === i
    const latestFlag = node.events[node.events.length - 1]
    const flagged = latestFlag !== undefined
    // 「仮説なし」と旗は**排他**（旗を掲げた課題は抑制されるので問いが立たない）。
    // 同じ場所に置いてよい
    const warn = posed.issueNeedsHypothesis[i]
    const badgeW = flagged
      ? badgeWidth(ISSUE_EVENT_LABELS[latestFlag.kind], fonts.small)
      : warn
        ? badgeWidth(QUESTION_LABELS.hypothesis, fonts.small)
        : 0
    /**
     * タイトル行の右上は**常に1枠空ける**。ここに出るのは3つで、
     * いずれも同じ場所に右寄せで置かれる:
     *
     * - 旗のバッジ（旗が立っている。これ自身が旗のトグルを兼ねる）
     * - 「仮説なし」バッジ（問いが立っている）
     * - 旗のトグル（まだ旗が無い。ホバー・フォーカス中だけ出る小さなボタンが**2つ**）
     *
     * **バッジがあるときだけ空ける形にしない。** そうすると普通の箱では
     * ホバー中に不透明なボタンがタイトルの1行目の末尾に被り、読めなくなる
     *（M1 が `left-full` で箱の外へ逃がしていたのはこれを避けるためだった）。
     * 箱の外へ出す道は採らない——列の間隔に置くと隣の枝と重なる。
     * 「仮説なし」の箱ではバッジとトリガーが同じ枠を奪い合うので、
     * **ホバー中はバッジを隠してトグルと入れ替える**（IssueBox）。
     * 旗が立っている箱では2つが同じ要素なので、広い方＝バッジの幅でよい
     */
    // まだ旗の無い箱のトリガーは `IssueTreeEditor` の `FLAG_TRIGGER_FACE`
    // ＝バッジと同じ幾何（`px-1.5` ＋ 枠 1px）を描くので、幅も `actionWidth`
    // （`px-1` 前提）ではなく `badgeWidth` で測る。**描く面が変わったら測る式も
    // 対で直すこと**——片方だけ変えると、予約した枠より描画が広くなってはみ出す。
    //
    // **旗の無い箱にはトリガーが2つ並ぶ**ので、その合計幅（`flagTriggersW`。
    // 組み立ては宣言のところ）で測る。片方ぶんで測っていた版に戻すと、ホバー中に
    // 見送りのボタンがタイトルへはみ出す（`layout.test.ts` の
    // 「旗の無い箱は、旗のトグル2つぶん（＋間の空き）の枠をタイトルの右に空ける」）
    const slotW = flagged ? badgeW : Math.max(badgeW, flagTriggersW)
    const reserve = BADGE_GAP + slotW

    // **箱の幅は導出しない**（`measure.ts` の `BOX_WIDTH` の解説）。
    // M24 より前は「仮説も見送りも無い箱だけタイトルの自然幅」という分岐が
    // あり、そこで `minWidth <= maxWidth`（逆転するとタイトルが黙って下限を
    // 割る）に依存していた。**幅が固定になったので、その依存ごと消えている**
    // ——枠は常に固定幅の中から取られ、枠が文章を食って下限を割る経路が無い。
    //
    // 残っている不変条件は「一番広い枠を引いてもタイトルが痩せすぎない」だけで、
    // これは `layout.test.ts` が測定器から導いた下限で見ている。**`BOX_WIDTH` を
    // 縮めるか、バッジの語を伸ばすと、そのテストが赤くなる**
    //
    // **展開している課題だけが `EXPANDED_BOX_WIDTH`**（m5）。これも固定値であって
    // 内容から導出しない——導出にすると、開いた瞬間に幅が文言の長さで変わる
    const width = open ? EXPANDED_BOX_WIDTH : BOX_WIDTH
    const contentWidth = width - ISSUE_INSET_X * 2
    /**
     * **タイトルは内容の左端から始まる。** m5 はここに開閉トグル（シェブロン）の
     * ぶん（`CHEVRON_SIZE + CHEVRON_GAP` ＝ 20px）を空けていたが、**実機確認後に
     * トグルごと撤去した**（開閉は箱のクリックによる選択に変わった）ので、
     * その空きも消えている。タイトルはそのぶん広い
     */
    const titleWidth = contentWidth - reserve

    /**
     * **展開中の課題タイトルは一段大きい**（`EXPANDED_TITLE_FONT_CLASS` ＝
     * text-base 16px）。**測る側と描く側（`IssueBox`）が同じ条件で切り替わること。**
     * 片方だけだと、測定より広く描いて折り返しが1行増え、高さ固定＋
     * `overflow-hidden` の textarea で末尾の行が黙って見えなくなる
     */
    const titleFont = open ? fonts.expandedTitle : fonts.title
    const titleHeight = textHeight(node.text, titleFont, titleWidth)
    const reasonHeight = flagged
      ? textHeight(latestFlag.note, fonts.small, contentWidth - ROW_INDENT)
      : null

    let height = ISSUE_INSET_Y * 2 + titleHeight
    if (reasonHeight !== null) height += TITLE_GAP + reasonHeight
    if (rows.length > 0) {
      height += TITLE_GAP + ROW_GAP * (rows.length - 1)
      for (const hi of rows) height += plans[hi].height
    }
    /**
     * **選ばれた課題ノードの末尾には「＋ 仮説を追加」が座る**（m5 Task 7。仮説を
     * 足す動線はキーから消えたのでマウスにしかない）。**その高さを箱に足すこと**
     *——足し忘れるとボタンが箱の下端からはみ出すが、絶対配置なので画面は
     * 黙ってはみ出したまま描く。
     *
     * **空きは、行があれば行どうしと同じ `ROW_GAP`（ボタンは最後の行に続く）、
     * 行が無ければ `TITLE_GAP`**（タイトル——または旗の理由——の直後に続く。
     * 行が始まるときに空ける空きと同じ）。仮説0本の課題は開かないが、
     * ボタンだけは出る（`IssuePlacement.addHypothesis` の解説）ので、
     * **ここは `open` ではなく `selected` で足す**
     */
    if (selected) height += (rows.length > 0 ? ROW_GAP : TITLE_GAP) + ACTION_HEIGHT
    return {
      open,
      selected,
      width,
      contentWidth,
      titleWidth,
      titleHeight,
      badgeWidth: badgeW,
      reasonHeight,
      height,
      rows,
    }
  })

  // --- 3. コアの木レイアウトへ渡す（ブロック＝箱。仮説は箱の中なので別途足さない） ---
  const blockSizes = new Map<string, Size>()
  const walkSizes = (node: FlatTreeNode): void => {
    blockSizes.set(node.key, { width: boxes[node.index].width, height: boxes[node.index].height })
    for (const child of node.children) walkSizes(child)
  }
  for (const root of built.roots) walkSizes(root)

  const { positions, width, height } = layoutTree(built.roots, blockSizes)

  // --- 4. 世界座標へ展開する ---
  const issues: (IssuePlacement | null)[] = data.issues.map(() => null)
  const hypotheses: (HypothesisPlacement | null)[] = data.hypotheses.map(() => null)
  const walkPlace = (node: FlatTreeNode): void => {
    const point = positions.get(node.key)
    if (point !== undefined) {
      const i = node.index
      const box = boxes[i]
      const left = point.x + ISSUE_INSET_X
      let cursor = point.y + ISSUE_INSET_Y
      // タイトルは内容の左端から始まる（m5 実機確認後にシェブロンを撤去した）
      const title: Rect = {
        x: left,
        y: cursor,
        width: box.titleWidth,
        height: box.titleHeight,
      }
      cursor += box.titleHeight
      let event: { badge: Rect; reason: Rect } | null = null
      if (box.reasonHeight !== null) {
        cursor += TITLE_GAP
        event = {
          badge: {
            x: left + box.width - ISSUE_INSET_X * 2 - box.badgeWidth,
            y: title.y,
            width: box.badgeWidth,
            height: BADGE_HEIGHT,
          },
          reason: {
            x: left + ROW_INDENT,
            y: cursor,
            width: box.contentWidth - ROW_INDENT,
            height: box.reasonHeight,
          },
        }
        cursor += box.reasonHeight
      }
      if (box.rows.length > 0) cursor += TITLE_GAP
      box.rows.forEach((hi, j) => {
        if (j > 0) cursor += ROW_GAP
        hypotheses[hi] = plans[hi].build(left, cursor)
        cursor += plans[hi].height
      })
      // 末尾の「＋ 仮説を追加」。**左端はパネルと揃える**（`PANEL_INDENT`）。
      // 帯は残りの幅いっぱいで、ボタン自身の幅は測らない（描く側が左寄せで置く）。
      // **空きは高さを積んだときと同じ式**（行があれば `ROW_GAP`、無ければ
      // `TITLE_GAP`）——片方だけ直すとボタンが箱からはみ出す
      const addHypothesis: Rect | null = box.selected
        ? {
            x: left + PANEL_INDENT,
            y: cursor + (box.rows.length > 0 ? ROW_GAP : TITLE_GAP),
            width: box.contentWidth - PANEL_INDENT,
            height: ACTION_HEIGHT,
          }
        : null
      issues[i] = {
        rect: { x: point.x, y: point.y, width: box.width, height: box.height },
        selected: box.selected,
        expanded: box.open,
        title,
        event,
        addHypothesis,
      }
    }
    for (const child of node.children) walkPlace(child)
  }
  for (const root of built.roots) walkPlace(root)

  return { issues, hypotheses, width, height }
}
