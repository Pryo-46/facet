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
export const TITLE_FONT_CLASS = 'text-sm leading-normal font-semibold'
/**
 * 節見出しのフォント（段1 = text-sm 14px / 1.3 / 600）。**キャンバスの
 * 「仮説の展開」アートボードは 16px で描かれているが、`src/index.css` の段
 * （M23／M26）に節見出しは段1 と名指しされている（index.css:22）ので、
 * サイズはそちらに合わせて落とす。** 展開タイトル（下）と同寸になって
 * 階層が潰れるのを避けるため、サイズではなく太さ（`font-semibold`）で
 * 見出しと本文を区別する（段の思想＝密度はサイズでなく行高で稼ぐ、
 * index.css:53）。単行の見出しなので `leading-normal` は付けず、段1 の
 * 既定行間 1.3 のままでよい
 */
export const SECTION_LABEL_FONT_CLASS = 'text-sm font-semibold'
/**
 * 展開時の課題タイトルのフォント（段2 = text-base 16px / 1.5 / 600）。
 * **キャンバスの「仮説の展開」アートボードは 18px（27px 行高）で描かれて
 * いるが、18px は `src/index.css` の段（14/16/22px の3サイズ、M23／M26）に
 * 存在しないので、`text-base`（16px・24px 行高）に落とす。** 閉じている間は
 * `TITLE_FONT_CLASS`（14px）のままで、展開すると 16px に差し替わる
 */
export const EXPANDED_TITLE_FONT_CLASS = 'text-base leading-normal font-semibold'
/**
 * ソリューション仮説のタイトルのフォント（14px / 21px / 500）。値は同アートボードから
 */
export const HYPO_TITLE_FONT_CLASS = 'text-sm leading-normal font-medium'

/**
 * 課題の箱の幅（**固定。導出しない**）。**M24 で全種類の箱に広がった。**
 *
 * 箱の中には課題の文言と仮説の行という**性質の違う文章が縦に積まれる**ので、
 * 一番長い行に幅を合わせると、短い課題と長い課題で箱幅がばらつき、木が
 * 階段状に見える。シーケンスがガター幅を導出しないと決めた（design-notes
 * 論点7）のと同じ判断。
 *
 * **M24 より前、仮説も見送りも持たない箱だけはタイトルの自然幅だった。**
 * その結果、同じ列の中で右上のバッジの右端が散り、「どれが未決か」を知るには
 * 全ノードを個別に読む必要があった（UI ノート D3 rev.3 ＝ スキャン性）。
 * いまは例外なくこの幅で、**バッジは列ごとに縦一列に揃う。**
 *
 * 値はロジックツリーのノード（`NODE_WIDTH`）と同じ 320 で、**あちらも固定**。
 * シーケンスの `LABEL_MAX_WIDTH` も 320 だが、あちらは**上限**であって固定では
 * ない——値が同じだけで意味が違うので、3つを共有定数に束ねていない
 */
export const BOX_WIDTH = 320
/** 箱の中の文章が使える幅 */
export const BOX_CONTENT_WIDTH = BOX_WIDTH - ISSUE_INSET_X * 2

/**
 * 展開中の課題ノードの幅（**固定。導出しない**——`BOX_WIDTH` と同じ判断）。
 * 展開すると仮説・問い・FB まで縦に積まれるので、320 のままでは1行が細く
 * なりすぎる。値はデザインキャンバスの「仮説の展開」アートボードから
 */
export const EXPANDED_BOX_WIDTH = 780

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

/**
 * 問いブロック（Ask）。デザインキャンバス「仮説の展開」アートボードの値。
 * `ASK_PADDING_X` / `ASK_PADDING_Y` は問いブロックの余白、`ASK_GAP` は
 * ブロックの中の縦の空き（問いの文言と FB 行の間）、`ASK_BLOCK_GAP` は
 * 問いブロックどうしの空き
 */
export const ASK_PADDING_X = 8
export const ASK_PADDING_Y = 6
/** `ASK_PADDING_X` / `ASK_PADDING_Y` と対のクラス（px-2 = 8px ／ py-1.5 = 6px） */
export const ASK_PADDING_CLASS = 'px-2 py-1.5'
export const ASK_GAP = 4
/** `ASK_GAP` と対のクラス（gap-1 = 4px） */
export const ASK_GAP_CLASS = 'gap-1'
export const ASK_BLOCK_GAP = 4
/** `ASK_BLOCK_GAP` と対のクラス（gap-1 = 4px） */
export const ASK_BLOCK_GAP_CLASS = 'gap-1'

/**
 * FB（フィードバック）行。同アートボードの値。`FB_ICON_SIZE` はアイコンの
 * 一辺、`FB_COL_GAP` は列（アイコン・文言・削除ボタン）どうしの空き、
 * `FB_DELETE_WIDTH` は削除ボタンの列幅
 */
export const FB_ICON_SIZE = 16
/** `FB_ICON_SIZE` と対のクラス（size-4 = 16px） */
export const FB_ICON_SIZE_CLASS = 'size-4'
export const FB_COL_GAP = 8
/** `FB_COL_GAP` と対のクラス（gap-2 = 8px） */
export const FB_COL_GAP_CLASS = 'gap-2'
export const FB_DELETE_WIDTH = 20
/** `FB_DELETE_WIDTH` と対のクラス（w-5 = 20px） */
export const FB_DELETE_WIDTH_CLASS = 'w-5'

/**
 * 問いブロックの中の「＋FB」など、ミニボタンの行の高さ。**`ACTION_HEIGHT` と
 * 同じ約束**——下のクラスと対で直すこと。クラスを当て忘れるとボタンの実高が
 * 測定より低くなり、定数が嘘になる
 */
export const MINI_ACTION_HEIGHT = 20
/** `MINI_ACTION_HEIGHT` と対のクラス（h-5 = 20px） */
export const MINI_ACTION_HEIGHT_CLASS = 'h-5'

/**
 * 課題タイトル左の開閉トグル（シェブロン。Task 2 でレイアウトに組み込む）。
 * `CHEVRON_SIZE` はアイコンの一辺、`CHEVRON_GAP` はタイトルとの空き。
 * 値は同アートボードから
 */
export const CHEVRON_SIZE = 14
/** `CHEVRON_SIZE` と対のクラス（size-3.5 = 14px） */
export const CHEVRON_SIZE_CLASS = 'size-3.5'
export const CHEVRON_GAP = 6
/** `CHEVRON_GAP` と対のクラス（gap-1.5 = 6px） */
export const CHEVRON_GAP_CLASS = 'gap-1.5'
