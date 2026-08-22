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

/** 課題ノード。ロジックツリーのノードと同じ寸法（同じ役割の箱だから） */
export const ISSUE_MAX_WIDTH = 320
export const ISSUE_MIN_WIDTH = 96
export const ISSUE_PADDING_X = 10
export const ISSUE_PADDING_Y = 6
export const ISSUE_BORDER = 1
export const ISSUE_INSET_X = ISSUE_PADDING_X + ISSUE_BORDER
export const ISSUE_INSET_Y = ISSUE_PADDING_Y + ISSUE_BORDER
/** px-2.5 = 10px ／ py-1.5 = 6px ／ border = 1px */
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

/** バッジの横の余白（px-1.5 = 6px）と枠線（1px）、文言との空き（gap-2 = 8px） */
export const BADGE_PADDING_X = 6
export const BADGE_BORDER = 1
export const BADGE_GAP = 8
/** バッジが座る行の高さ（バッジ自体は 18px で、その中に縦中央で置く） */
export const BADGE_HEIGHT = 20

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
/** px-3 = 12px ／ py-2.5 = 10px ／ border = 1px */
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
