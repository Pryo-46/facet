import { BADGE_BORDER, BADGE_BOX_HEIGHT, BADGE_PADDING_X } from '@/components/badge-styles'

/**
 * 課題ツリーの箱の寸法（DOM 非依存の定数だけ）。折り返しの規則は
 * core/canvas/wrap.ts が持つ。
 *
 * **定数と Tailwind クラスは必ず対で直すこと。** 測定が実際より小さいと、
 * ブラウザに与えられる幅が前提より狭くなり、測定より多い行数に折り返して
 * 文字が切れる（logic-tree の measure.ts と同じ約束）。
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
 * 「仮説の展開」アートボードは 16px で描かれているが、`src/index.css` の段に
 * 節見出しは段1 と名指しされている（index.css:22）ので、
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
 * いるが、18px は `src/index.css` の段（14/16/22px の3サイズ）に
 * 存在しないので、`text-base`（16px・24px 行高）に落とす。**
 */
export const EXPANDED_TITLE_FONT_CLASS = 'text-base leading-normal font-semibold'
/**
 * ソリューション仮説のタイトルのフォント（14px / 21px / 500）。値は同アートボードから
 */
export const HYPO_TITLE_FONT_CLASS = 'text-sm leading-normal font-medium'

/**
 * 課題の箱の幅（**固定。導出しない**）。全種類の箱に共通。
 *
 * 箱の中には課題の文言と仮説の行という**性質の違う文章が縦に積まれる**ので、
 * 一番長い行に幅を合わせると、短い課題と長い課題で箱幅がばらつき、木が
 * 階段状に見える。シーケンスがガター幅を導出しないと決めた（design-notes
 * 論点7）のと同じ判断。
 *
 * 仮説も見送りも持たない箱をタイトルの自然幅にすると、同じ列の中で右上の
 * バッジの右端が散り、「どれが未決か」を知るには全ノードを個別に読む必要が
 * 出る（rev 9章 D3 rev.3 ＝ スキャン性）。例外なくこの幅にするので、
 * **バッジは列ごとに縦一列に揃う。**
 *
 * **値は 360 で、ロジックツリーのノード（`NODE_WIDTH`＝320）とは違う。**
 * 旗のトグルが2つ（見送り／解決）あり、タイトルの右に空ける枠が広い分を
 * 箱の側で吸収する（タイトルは 204px 前後）。
 *
 * **3つを共有定数に束ねない**——`NODE_WIDTH`（320）は固定、シーケンスの
 * `LABEL_MAX_WIDTH`（320）は**上限**であって固定ではない。意味が違うものを
 * 1つの定数にすると、片方の事情で動かしたときに無関係な図まで一緒に動く
 */
export const BOX_WIDTH = 360
/** 箱の中の文章が使える幅 */
export const BOX_CONTENT_WIDTH = BOX_WIDTH - ISSUE_INSET_X * 2

/**
 * 展開中の課題ノードの幅（**固定。導出しない**——`BOX_WIDTH` と同じ判断）。
 * 展開すると仮説・問い・FB まで縦に積まれるので、畳んだ幅（`BOX_WIDTH`）の
 * ままでは1行が細くなりすぎる。**`BOX_WIDTH` とは独立に決める。**
 * 値はデザインキャンバスの「仮説の展開」アートボードから
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
/**
 * `BADGE_GAP` と対のクラス（gap-2 = 8px）。**`ACTION_HEIGHT_CLASS` /
 * `MINI_ICON_GAP_CLASS` と同じ「数とクラスを隣に置く」流儀である。**
 *
 * 読み手は `IssueBox.tsx` の旗のトグルを包む flex で、**測る側は `layout.ts` の
 * `flagTriggersW`**（旗の無い箱にトリガーが2つ並ぶので、2つぶんの幅＋この空きを
 * 枠として予約する）。**旗が2種類（見送り／解決）になって初めて荷重が掛かった**
 *——1つだった間は間の空きが存在せず、食い違っても何も起きなかった。
 *
 * **この対に番人は立たない。** jsdom にレイアウトが無く、`gap-2` を `gap-3` に
 * しても DOM の検査は全部緑のままである（クラス文字列を引いているテストも無い）。
 * **定数にした目的は機械に守らせることではなく、片方だけ直したことが目で見える
 * ようにすることである**——`grep BADGE_GAP` が測る側と描く側の両方を返す。
 */
export const BADGE_GAP_CLASS = 'gap-2'
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
 * **節見出しの下の「値の欄」の字下げ（全角1文字ぶん）。**
 *
 * 見出しと値の区別を付けるためである。**見出しの書体は上げない**——`src/index.css` の段は節見出しを段1（`text-sm`
 * ＝14px）と名指ししており（`SECTION_LABEL_FONT_CLASS` の解説）、そこを動かすのは
 * 別の領域である。代わりに**値の欄だけを一段右へ**寄せ、「見出しが左・値がその
 * 内側」という位置関係で読ませる。**見出しの帯は動かさない。**
 *
 * 値は `text-sm`（14px）の**全角1文字**。日本語の全角は em と同幅なので
 * 14px そのもので、`ROW_INDENT`（12）や `PANEL_INDENT`（12）とは**別の量**である
 *——あちらは行頭の点・パネルの左端という別の事情から来た 12px で、
 * 「1文字ぶん下げる」という今回の理由とは無関係に動きうる。
 *
 * **対のクラスは無い。** パネルの中身はすべて絶対配置で、位置も幅も
 * `layout.ts` が座標で与える（`PANEL_BOX_CLASS` の解説と同じ事情）。
 * そのぶん**測る側と描く側は同じ1箇所**——`layout.ts` が
 * 「x を足す」と「幅から引く」を**対で**行う。片方だけだと、字下げたぶん
 * 欄が右へはみ出す（＝折り返しの測定が実際より広い幅で行われる）
 */
export const FIELD_INDENT = 14
/**
 * 節の末尾の追加ボタン（「聞きたいことを追加」「FBを追加」）の行の高さ。
 * **下のクラスと対で直すこと**——クラスを当て忘れるとボタンの実高が測定より
 * 低くなり、定数が嘘になる。
 *
 * **「検証結果」の帯はこれを空けない**——判断のトリガーは文言のボタンではなく
 * バッジ自身なので、帯の高さは `BADGE_HEIGHT` で測る
 *（`layout.ts` の `judgeLabelH`）
 */
export const ACTION_HEIGHT = 24
/** `ACTION_HEIGHT` と対のクラス（h-6 = 24px） */
export const ACTION_HEIGHT_CLASS = 'h-6'
/**
 * 通常の大きさのボタンの中のアイコン（キャンバスの `.add > svg` /
 * `.addhypo > svg` / `.del > svg` はいずれも 12px）。
 *
 * **`MINI_ICON_SIZE_CLASS`（10px）を借りないこと。** キャンバスは `.add` を
 * 12px、`.miniadd` を 10px と**書き分けている**ので、借りるとミニボタンの
 * アイコンを直したとき節末のボタンと FB の削除が黙って一緒に動く。
 *
 * **数の対（`ACTION_ICON_SIZE`）を置かないのは、この 12px を測る場所が
 * どこにも無いため。** 節末の `.add` と末尾の「＋ 仮説を追加」は幅いっぱいの
 * 帯の中で flex に並び、`.del` の列幅は `FB_DELETE_WIDTH` が決めている
 *（アイコンはその中で中央に座る）。読まれない数を置けば、それ自体が
 * 静かに嘘になる定数になる——下の `ASK_*_CLASS` を消したのと同じ判断
 */
export const ACTION_ICON_SIZE_CLASS = 'size-3'
/**
 * 仮説の削除（キャンバスの `.trash`）。「ソリューション仮説」の見出しの帯の
 * 右端に座る。**帯の高さはこれを勘定に入れる**（`layout.ts` の
 * `solutionLabelH`）——見出しの文字より高ければ帯がその高さになる。
 * 「検証結果」の帯がバッジの高さで測られている（`judgeLabelH`）のと同じ組み方で、
 * **測る側と描く側が同じ数を見る**ための対である
 */
export const TRASH_ICON_SIZE = 16
/** `TRASH_ICON_SIZE` と対のクラス（size-4 = 16px） */
export const TRASH_ICON_SIZE_CLASS = 'size-4'
/**
 * ボタンの左右の余白（px-1 = 4px）＋枠線 1px。**いまはどこからも読まれていない**
 *——判断のトリガーは「検証結果」の見出しの帯の中で flex に並んでおり、
 * レイアウトがボタンの幅を測る必要が無い（`layout.ts` に `actionWidth` は
 * 無い）。**小さなボタンを絶対配置で置く場所が再び出たときの対として残してある**
 *（幅は文言の実測＋これ）
 */
export const ACTION_INSET_X = 5

/**
 * **`PANEL_CONTENT_WIDTH` は無い。**
 *
 * 箱の幅が可変になった（畳んで `BOX_WIDTH` ／開いて `EXPANDED_BOX_WIDTH`）ので、
 * パネルの中の文章が使える幅は箱ごとに違う。`layout.ts` が `contentWidth - PANEL_INDENT -
 * PANEL_INSET_X * 2` をその場で組んでおり、**ここに同じ式の写しを置くと、
 * `PANEL_INDENT` などを動かしたとき定数側だけが静かに嘘になる**
 *（畳んだ経路でしか合わない値が「パネルの幅」の名前で残る）。
 * 幅が要るときは箱の `contentWidth` から組むこと
 */

/**
 * 問いブロック（Ask）。デザインキャンバス「仮説の展開」アートボードの値。
 * `ASK_PADDING_X` / `ASK_PADDING_Y` は問いブロックの余白、`ASK_GAP` は
 * ブロックの中の縦の空き（問いの文言と FB 行の間）、`ASK_BLOCK_GAP` は
 * 問いブロックどうしの空き
 */
export const ASK_PADDING_X = 8
export const ASK_PADDING_Y = 6
export const ASK_GAP = 4
export const ASK_BLOCK_GAP = 4
/**
 * **`ASK_PADDING_CLASS` / `ASK_GAP_CLASS` / `ASK_BLOCK_GAP_CLASS` /
 * `FB_COL_GAP_CLASS` は無い。**
 *
 * 「flex で積む作りに変えるときの対」として置いてあったが、問いブロックの子は
 * **すべて絶対配置で置くと決めてある**（`ISSUE_BOX_CLASS` / `PANEL_BOX_CLASS` と
 * 同じ事情で、余白は `layout.ts` が座標で与える）。予定の無い作りのための対は、
 * **誰も読まないぶん、隣の数と食い違っても何も落ちない**——`px-2` のまま
 * `ASK_PADDING_X` を 10 にしても検査は緑で、次に読む人は嘘を読む。
 * flex で積む日が来たら、そのとき対で足すこと（`ISSUE_BOX_CLASS` のように
 * **実際に当てているクラス**なら残す価値がある。消したのは当てていないものだけ）
 */

/**
 * FB（フィードバック）行。同アートボードの値。`FB_ICON_SIZE` はアイコンの
 * 一辺、`FB_COL_GAP` は列（アイコン・文言・削除ボタン）どうしの空き、
 * `FB_DELETE_WIDTH` は削除ボタンの列幅
 */
export const FB_ICON_SIZE = 16
/** `FB_ICON_SIZE` と対のクラス（size-4 = 16px） */
export const FB_ICON_SIZE_CLASS = 'size-4'
export const FB_COL_GAP = 8
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
 * ミニボタンの左右の余白（px-1.5 = 6px）と枠線。**キャンバスの `.miniadd` は
 * 5px だが、バッジ（`BADGE_PADDING_X`）と同じ 6px に揃えた**——同じ高さ 20px の
 * 小さな箱が2種類、1px 違う内寸で並ぶ理由が無い
 */
export const MINI_ACTION_PADDING_X = 6
export const MINI_ACTION_BORDER = 1
/** ミニボタンの中のアイコン（キャンバスの `.miniadd > svg`）と文言との空き */
export const MINI_ICON_SIZE = 10
/** `MINI_ICON_SIZE` と対のクラス（size-2.5 = 10px） */
export const MINI_ICON_SIZE_CLASS = 'size-2.5'
/**
 * アイコンと文言の空き（gap-1 = 4px）。**キャンバスの `.miniadd` は 3px だが、
 * Tailwind の間隔の段（4px 刻み）に無い**ので 1px 広い方へ倒す
 *（狭い方へ倒すと文字が測定より右へはみ出す）
 */
export const MINI_ICON_GAP = 4
/** `MINI_ICON_GAP` と対のクラス（gap-1 = 4px） */
export const MINI_ICON_GAP_CLASS = 'gap-1'
/**
 * ミニボタンの書体。**`leading-none` はバッジと同じ理屈**——`text-sm`（14px）の
 * 既定行間 1.3 は 18.2px で、枠線 2px を足すと 20.2px となり
 * `MINI_ACTION_HEIGHT`（20px）を超える。行箱を 14px に潰し、枠 2px と合わせた
 * 16px を `items-center` が 20px の箱の中で上下 2px ずつ空けて挟む
 *（`badge-styles.ts` の `base` と同じ組み方）
 */
export const MINI_ACTION_FONT_CLASS = 'text-sm leading-none'

/**
 * FB 行の字下げ（キャンバスの `.fb` の padding-left）。問いの文言よりわずかに
 * 内側から始めることで、答えが問いにぶら下がっていることを示す
 */
export const FB_INDENT = 11

/**
 * 文章の欄が潰れない最小幅。**発言者名（`by`）は自由記述**なので、長い名前が
 * 来ると `{by} · {date}` が行を食い尽くし、FB の本文の幅が 0 以下になる
 *——`wrapWithin` は幅が足りなければ1文字ずつ折るので、本文が縦に伸びて
 * ブロックが破綻する。溢れた側（日付の並び）は `overflow-hidden` が切る
 */
export const MIN_FIELD_WIDTH = 80

/**
 * 入力欄の共通クラス。**面と文字色を持たない**——箱の面の上に透明で乗り、
 * 文字色は呼び出し側が足す（抑制された配下がそのまま薄い文字に落ちる）。
 *
 * **余白も持たない。** レイアウトは各行を「余白 0」で測っているので、ここで
 * padding を足すとブラウザが測定より早く折り返して文字が切れる。
 * **`HypothesisPanel` と `AskBlock` が同じ文字列を読む**——片方だけに写すと、
 * 測定の前提（余白 0）が画面の半分だけで破れる
 */
export const CELL_INPUT_CLASS =
  'h-full w-full resize-none overflow-hidden bg-transparent whitespace-pre-wrap break-all outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-inset focus:ring-ring'

/** 読み取り専用の文章（判断が無いときの案内・固定文の見出し）。文字色は同上 */
export const STATIC_TEXT_CLASS =
  'absolute overflow-hidden text-sm leading-normal break-all whitespace-pre-wrap'

/** 本文の欄（詳細・価値仮説・根拠・問い・FB）のフォント。**測っているのは `fonts.body`** */
export const BODY_FIELD_CLASS = 'text-sm leading-normal'

/**
 * **`CHEVRON_SIZE` / `CHEVRON_SIZE_CLASS` / `CHEVRON_GAP` は無い。**
 *
 * 課題タイトルの左に開閉トグル（シェブロン）は無く、選択は**箱そのものの
 * クリック**で行う（設計ノート D8）。トグルが無いので、タイトルの左に
 * `CHEVRON_SIZE + CHEVRON_GAP`（20px）を空けない——**畳んだ箱のタイトルは
 * 224px**（`layout.test.ts` の「畳んだ箱の幅は 360」が実寸で見ている）。
 *
 * 定数を残さないのは上の `ASK_*_CLASS` / `PANEL_CONTENT_WIDTH` と同じ判断
 *——**誰も読まない数は、隣の数と食い違っても何も落ちない**ぶん静かに嘘になる
 */
