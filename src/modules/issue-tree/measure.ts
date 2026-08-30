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
 * 存在しないので、`text-base`（16px・24px 行高）に落とす。**
 *
 * **まだどこからも読まれていない（Task 4 で接続する）。** 展開中の課題タイトルも
 * いまは `TITLE_FONT_CLASS`（14px）で描かれ、`layout.ts` もその測定器で
 * `titleHeight` を測っている。差し替えるときは**エディタの測定用の見本を1本足し、
 * `layout.ts` が展開中の課題だけその測定器で測るように直すのと対で**行うこと
 *——片方だけ変えると、測定より広く描いて折り返しが1行増え、高さ固定＋
 * `overflow-hidden` の textarea で末尾の行が黙って見えなくなる
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
 * **値は 360 で、ロジックツリーのノード（`NODE_WIDTH`＝320）とは違う。**
 * m5 で旗のトグルが2つ（見送り／解決）になり、タイトルの右に空ける枠が
 * 広がってタイトルが 200 → 164px に痩せたので、依頼者の指示で箱の側を
 * 伸ばした（タイトルは 204px 前後に戻る）。
 *
 * **3つを共有定数に束ねていない理由は生きている**——`NODE_WIDTH`（320）は
 * 固定、シーケンスの `LABEL_MAX_WIDTH`（320）は**上限**であって固定では
 * ない。意味が違うものを1つの定数にすると、片方の事情で動かしたとき
 * （まさに今回がそれ）に無関係な図まで一緒に動く
 */
export const BOX_WIDTH = 360
/** 箱の中の文章が使える幅 */
export const BOX_CONTENT_WIDTH = BOX_WIDTH - ISSUE_INSET_X * 2

/**
 * 展開中の課題ノードの幅（**固定。導出しない**——`BOX_WIDTH` と同じ判断）。
 * 展開すると仮説・問い・FB まで縦に積まれるので、畳んだ幅（`BOX_WIDTH`）の
 * ままでは1行が細くなりすぎる。**m5 で `BOX_WIDTH` が 320 → 360 に伸びた
 * ときも、この値は動かしていない**（依頼者の指示は畳んだ箱の側だけ）。
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
 * 節の末尾の追加ボタン（「聞きたいことを追加」「FBを追加」）の行の高さ。
 * **下のクラスと対で直すこと**——クラスを当て忘れるとボタンの実高が測定より
 * 低くなり、定数が嘘になる。
 *
 * **「検証結果」の帯はこれを空けない**（m5 Task 6）——判断のトリガーは文言の
 * ボタンからバッジ自身に変わったので、帯の高さは `BADGE_HEIGHT` で測る
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
 * アイコンを直したとき節末のボタンと FB の削除が黙って一緒に動く（m5 Task 7 で
 * 実際に借りていた）。
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
 *——m5 Task 4 で判断のトリガーが「検証結果」の見出しの帯へ移り、帯の中で
 * flex に並ぶようになったので、レイアウトがボタンの幅を測る必要が無くなった
 *（`layout.ts` の `actionWidth` はそれで消えた）。**小さなボタンを絶対配置で
 * 置く場所が再び出たときの対として残してある**（幅は文言の実測＋これ）
 */
export const ACTION_INSET_X = 5

/**
 * **`PANEL_CONTENT_WIDTH` は m5 Task 2 で消した。**
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
 * `FB_COL_GAP_CLASS` は m5 Task 7 で消した。**
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

/** 読み取り専用の文章（以前の判断の根拠・判断が無いときの案内・固定文の見出し）。文字色は同上 */
export const STATIC_TEXT_CLASS =
  'absolute overflow-hidden text-sm leading-normal break-all whitespace-pre-wrap'

/** 本文の欄（詳細・価値仮説・根拠・問い・FB）のフォント。**測っているのは `fonts.body`** */
export const BODY_FIELD_CLASS = 'text-sm leading-normal'

/**
 * 課題タイトル左の開閉トグル（シェブロン。Task 2 でレイアウトに組み込む）。
 * `CHEVRON_SIZE` はアイコンの一辺、`CHEVRON_GAP` はタイトルとの空き。
 * 値は同アートボードから
 */
export const CHEVRON_SIZE = 14
/** `CHEVRON_SIZE` と対のクラス（size-3.5 = 14px） */
export const CHEVRON_SIZE_CLASS = 'size-3.5'
/**
 * トグルとタイトルの空き。**`CHEVRON_GAP_CLASS`（`gap-1.5`）は m5 Task 7 で
 * 消した**——トグルとタイトルは flex で並んでおらず、`layout.ts` が
 * `CHEVRON_SIZE + CHEVRON_GAP` ぶんタイトルの矩形を右へ寄せている（箱の子は
 * すべて絶対配置）。理由は上の `ASK_*_CLASS` と同じで、**当てていないクラスの
 * 対は誰も読まないぶん、隣の数と食い違っても何も落ちない**
 */
export const CHEVRON_GAP = 6
