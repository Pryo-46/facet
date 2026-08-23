import { BADGE_BORDER, BADGE_BOX_HEIGHT, BADGE_PADDING_X } from '@/components/badge-styles'

/**
 * 課題ツリーの箱の寸法（DOM 非依存の定数だけ）。折り返しの規則は
 * core/canvas/wrap.ts が持つ。
 *
 * **定数と Tailwind クラスは必ず対で直すこと。** 測定が実際より小さいと、
 * ブラウザに与えられる幅が前提より狭くなり、測定より多い行数に折り返して
 * 文字が切れる（logic-tree M1 の measure.ts と同じ約束）。
 *
 * 値は `docs/issue-tree/俯瞰モック/俯瞰.html`・`展開.html` の CSS から取った
 * ——`.issue` の `padding: 6px 10px` / `gap: 5px`、`.rows` の `gap: 3px`、
 * `.row` の `padding-left: 12px`、`.panel` の `margin-left: 12px` /
 * `padding: 10px 12px` / `gap: 12px`、`.sec` の `gap: 4px`
 */

/** 課題ノードの上限幅。ロジックツリーのノード（`NODE_MAX_WIDTH`）と同じ 320 */
export const ISSUE_MAX_WIDTH = 320
/**
 * タイトルの入力欄が必ず確保する幅。**箱の下限ではなく、文章の下限である。**
 *
 * ロジックツリーは箱の下限（`NODE_MIN_WIDTH` = 96）だけを持てば足りた。課題の箱は
 * タイトル行の右上を**常に1枠空ける**（バッジか見送りのトリガー。layout.ts の解説）
 * ので、同じ形——箱の下限から枠のぶんを引いて折り返す——にすると、**空けた枠が
 * 文章を食ってタイトルに下限が残らない。** 「仮説なし」バッジは 70px 前後を取るから、
 * 96 の箱では入力欄が数 px になり、1字も打てない箱ができる（実機で踏んだ）。
 *
 * だから下限はタイトルの側に持たせ、**箱の方がその下限＋枠のぶんまで広がる。**
 * 結果として箱の下限は定数ではなくなる——空ける枠の幅はバッジの文言の実測で
 * 決まるので、フォント次第で動く。
 *
 * 値は text-sm（14px）で日本語 8 字ぶん。新しく作った空の課題がまず打ち始められる
 * 長さであり、仮説を持つ箱の `BOX_WIDTH`（320）へ跳ねる前の段としても落ち着く
 */
export const ISSUE_TITLE_MIN_WIDTH = 120
export const ISSUE_PADDING_X = 10
export const ISSUE_PADDING_Y = 6
export const ISSUE_BORDER = 1
export const ISSUE_INSET_X = ISSUE_PADDING_X + ISSUE_BORDER
export const ISSUE_INSET_Y = ISSUE_PADDING_Y + ISSUE_BORDER
/**
 * px-2.5 = 10px ／ py-1.5 = 6px ／ border = 1px
 *
 * **効いているのは `border` だけ。** 箱の子はすべて絶対配置で、絶対配置の子の
 * 包含ブロックは**パディングボックス**なので、`px-*` / `py-*` は中身を1pxも
 * 動かさない。位置を決めているのは `ISSUE_INSET_X` / `ISSUE_INSET_Y` を読む
 * レイアウト側で、そちらは正しい。**このクラスを消しても消し忘れても、
 * テストも画素も反応しない**——直すときは定数の側を直すこと
 */
export const ISSUE_BOX_CLASS = 'border px-2.5 py-1.5'
/**
 * 課題のタイトルのフォント。**測る側（エディタの見本）と描く側（`IssueBox`）が
 * 同じ定数を読む**——太字は細字より広いので、片方だけ変えると測定と描画がずれる
 */
export const TITLE_FONT_CLASS = 'text-sm font-semibold'

/**
 * 仮説の行を持つ箱・見送りの理由を持つ箱の幅（**固定。導出しない**）。
 *
 * 箱の中には課題の文言と仮説の行という**性質の違う文章が縦に積まれる**ので、
 * 一番長い行に幅を合わせると、短い課題と長い課題で箱幅がばらつき、木が
 * 階段状に見える。シーケンスがガター幅を導出しないと決めた（design-notes
 * 論点7）のと同じ判断。値はロジックツリーのノードと同じ 320
 */
export const BOX_WIDTH = 320
/** 箱の中の文章が使える幅 */
export const BOX_CONTENT_WIDTH = BOX_WIDTH - ISSUE_INSET_X * 2

/** タイトルと最初の行・理由の行の空き（モックの `.issue` の gap） */
export const TITLE_GAP = 5
/** 行どうしの空き（モックの `.rows` の gap） */
export const ROW_GAP = 3
/** 仮説行の字下げ（左の点の幅）。モックの `.row` の padding-left */
export const ROW_INDENT = 12
/** 行頭の点の直径と、行の左端からの位置（モックの `.row::before`） */
export const ROW_DOT_SIZE = 4
export const ROW_DOT_INSET = 2

/** バッジの横の余白と枠線は部品（`src/components/badge-styles.ts`）が持つ。文言との空き（gap-2 = 8px）だけここ */
export { BADGE_BORDER, BADGE_PADDING_X }
export const BADGE_GAP = 8
/** バッジが座る行の高さ。バッジ自身（`BADGE_BOX_HEIGHT`）の上下に 1px ずつ */
export const BADGE_HEIGHT = BADGE_BOX_HEIGHT + 2

/**
 * 展開パネル。モックの `.panel`（margin-left 12 / padding 10px 12px / border 1 / gap 12）。
 *
 * **`ROW_INDENT` と同じ 12 を、同じ原点から測る。** モックの `.row` の
 * padding-left と `.panel` の margin-left はどちらも `.issue` の内容の左端から
 * 12px で、**パネルの左端と行の文言の左端が揃う**（字下げを積んで 24 にしない）
 */
export const PANEL_INDENT = 12
export const PANEL_PADDING_X = 12
export const PANEL_PADDING_Y = 10
export const PANEL_BORDER = 1
export const PANEL_INSET_X = PANEL_PADDING_X + PANEL_BORDER
export const PANEL_INSET_Y = PANEL_PADDING_Y + PANEL_BORDER
export const PANEL_GAP = 12
/**
 * px-3 = 12px ／ py-2.5 = 10px ／ border = 1px
 *
 * `ISSUE_BOX_CLASS` と同じく、**効いているのは `border` だけ**——パネルの子も
 * すべて絶対配置なので `px-*` / `py-*` は中身を動かさない。位置は
 * `PANEL_INSET_X` / `PANEL_INSET_Y` を読むレイアウト側が決めている
 */
export const PANEL_BOX_CLASS = 'border px-3 py-2.5'
/** 節の見出しと本文の空き（モックの `.sec` の gap） */
export const SECTION_GAP = 4
/**
 * トリガー・「＋ FB」ボタンの行の高さ。**下のクラスと対で直すこと**
 *——クラスを当て忘れるとボタンの実高が測定より低くなり、定数が嘘になる
 */
export const ACTION_HEIGHT = 24
/** `ACTION_HEIGHT` と対のクラス（h-6 = 24px） */
export const ACTION_HEIGHT_CLASS = 'h-6'
/** ボタンの左右の余白（px-1 = 4px）＋枠線 1px。幅は文言の実測＋これ */
export const ACTION_INSET_X = 5

/** パネルの中の文章が使える幅（パネルは行の文言と同じ位置から始まる） */
export const PANEL_CONTENT_WIDTH = BOX_CONTENT_WIDTH - PANEL_INDENT - PANEL_INSET_X * 2
