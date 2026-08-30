import { Badge } from '@/components/Badge'
import { CellInput, type FieldState } from '@/components/CellInput'
import type { Rect } from '@/core/canvas/viewport'
import { badgeVariantOf } from './badge-variant'
import { ISSUE_EVENT_LABELS, QUESTION_LABELS, type IssueEventKind } from './derive'
import type { IssuePlacement } from './layout'
import {
  EXPANDED_TITLE_FONT_CLASS,
  ISSUE_BORDER,
  ISSUE_BOX_CLASS,
  ISSUE_PADDING_X,
  ISSUE_PADDING_Y,
  TITLE_FONT_CLASS,
} from './measure'

export interface IssueBoxProps {
  nodeKey: string
  /** アクセシブル名の接頭（`課題{N}`）。**前半は動かさない**（テストが前方一致で引く） */
  label: string
  text: string
  placement: IssuePlacement
  invalid: boolean
  suppressed: boolean
  /** 「仮説なし」が立っているか */
  warn: boolean
  /** 最新の旗の種別（旗が無ければ null）。**ラベルとアクセシブル名はここから引く** */
  eventKind: IssueEventKind | null
  /** 最新の旗の理由（旗が無ければ null）。理由は最新だけ編集できる */
  eventNote: string | null
  eventCellKey: string
  onTextChange: (next: string) => void
  onEventNoteChange: (next: string) => void
  onFieldKeyDown?: (e: React.KeyboardEvent, state: FieldState) => void
  /**
   * 旗のトグル（入り＝旗が立っている／切り＝立っていない）。**必須にしてある**
   *——省略できると、旗を付ける動線がマウスから消えていても型は通り、
   * 画面は一見正常なまま「押す場所が無い」になる。
   * 旗が立っている箱では、このトグル自身が旗のバッジを兼ねる（面はエディタが渡す）。
   *
   * **旗が無い箱では要素が2つ来る**（見送り／解決。エディタの `FLAG_KINDS` を
   * 回して作る）。ここは受け取った物を置くだけだが、**間の空きは
   * この包み（`gap-2`）が持ち、`layout.ts` の `triggersW` と対になっている**
   */
  eventToggle: React.ReactNode
  /**
   * この課題を選ぶ（＝箱の中がクリックされた）。**必須にしてある**
   *（`eventToggle` と同じ理由——押す場所を型で守る）。
   *
   * 引数 `toggle` は「**選択中の課題をもう一度押したとき、外すかどうか**」。
   * 箱の地の上のクリックは `true`（もう一度押すと畳まれる）、文章の欄
   *（`textarea` など）の上のクリックは `false`（**選ぶだけで外さない**）。
   * 打ちに来た人から選択を奪わないための区別で、理由は `onBoxClick` にある。
   *
   * **選ばれているか／開いているかは props で受け取らない**——`placement.selected`
   * / `placement.expanded` を見る。エディタの持つ鍵とレイアウトの決めた事実で
   * 情報源が2つに割れると、「枠は選択の色なのに何も開いていない」が
   * 作れてしまう（`IssuePlacement.expanded` の解説）
   */
  onSelect: (toggle: boolean) => void
  /**
   * 選択された課題ノードの末尾に置く「＋ 仮説を追加」。**必須にしてある**
   *（`eventToggle` / `onSelect` と同じ理由——押す場所を型で守る）。
   * 仮説を足す動線はキーから消えた（m5）ので、これが抜けると
   * **その課題に仮説を足す道が箱から消える**。
   *
   * **場所を決めるのはレイアウト**（`placement.addHypothesis`）で、選ばれて
   * いなければ矩形が `null` になり、ここは描かれない
   */
  addHypothesis: React.ReactNode
  /** 仮説行（`HypothesisRow` の列）。箱の中に絶対配置で置かれる */
  children?: React.ReactNode
}

/**
 * 課題の箱1つ。**箱は課題だけであり、仮説はこの箱の中の行になる**（M3 の文法）。
 *
 * 入力欄は常に textarea で、フォーカスされている＝編集中（`src/modules/logic-tree/
 * NodeBox.tsx` と同じ模型。IME・ドラフト・Undo 反映は `CellInput` が持つ）。
 * 高さは測定層が決めた値を CSS で当てる（`autoSize={false}`）。
 *
 * ロジックツリーのノードとの差は5つ:
 *
 * 1. 面が4種類ある（整合性エラー／抑制／旗／通常）。**未決を面で見せない**
 *    ——立っている問いはタイトル行の右端のバッジが運ぶ。面で塗ると、
 *    「まだ埋めていない」箱が図の大半を占めて地の色が意味を失う
 * 2. 抑制された配下は**旗の面ごとグレー**（`bg-surface-muted`）で、枠と文字を
 *    `ink-faint` に落とす（M25 の実機確認で反転——それまで配下は `bg-surface` の
 *    白い面だった。白いままだと見送りの枝が「まだ生きている枝」に見える、という
 *    人間の観察）。**`bg-canvas`（地の色）には落とさない**——箱が背景に溶けて
 *    木の形が読めない。**`opacity-*` で薄くしない**（検算したコントラストを割る。
 *    `ink-faint` は `BACKGROUNDS` 3面——`surface-muted` を含む——への 3:1 が
 *    `palette.test.ts` で機械検査済み）
 * 3. **自分自身が旗（見送り／解決）を掲げている箱は面を持つ**
 *    （実機確認後に追加。`docs/issue-tree/仮説検証モジュール-設計ノート.md` D8）。
 *    未決とは違って旗は稀で意図的な判断なので、1の理由（未決を面で塗ると図が
 *    警告で埋まる）はここには効かない。**M25 からは配下も同じ面を持つ**ので、
 *    面が運ぶのは「表明の所在」ではなく**凍結の範囲**になった——誰が掲げたかは
 *    文字の濃さ（当人＝`text-ink`／配下＝`ink-faint`）とバッジ（当人＝実線／
 *    配下＝faint）が運ぶ（D8 の M25 追記）。**見送りと解決は面を分ける**
 *    ——見送りは `bg-surface-muted`、解決は `bg-judge-yes-face`（淡い緑）。
 *    M25 は「分けない」と決めていたが、issue-tree m5 の実機確認で覆った
 *    （D8 の m5 追記。理由は「一目で『解決方針が決まった課題』＝これ以上
 *    考えなくてよい とわかる」）。**祖先由来の抑制が勝つ優先順位は動いていない**
 *    ——祖先が旗を掲げている配下は、自分が解決でも `bg-surface-muted` ＋
 *    `ink-faint` に落ちる（下の `face` の分岐で `suppressed` が上にある）。
 *    枠はどちらも `border-rule`（`rule` は両方の面の上で 3:1 を満たす。
 *    理由は `face` 計算のコメントを見よ）
 * 4. **箱そのものがクリックの受け口である**（m5 の実機確認後。それまでは
 *    タイトルの左に開閉トグル＝シェブロンがあった）。押すとその課題が
 *    **選択**され、仮説を1本以上持っていれば箱が `BOX_WIDTH` →
 *    `EXPANDED_BOX_WIDTH` に広がってその課題の仮説がまとめてパネルを持つ。
 *    **選択中は枠が `border-ink` に変わる**（`FileList` の選択と同じ語彙）。
 *    **操作子の上のクリックは選択に効かない**——タイトルの `textarea` を
 *    押すたびに選択が入り切りしたら、文字を打つ場所が開いたり閉じたりする
 * 5. 旗のトグルを置く枠がある。**押されているかどうかはデータの導出**
 *    ——`events` が空でなければ入り。ビュー側に開閉の状態を持たない
 *（判断のドロップダウンだけが、開閉の状態を親＝エディタに持たせている）
 */
export function IssueBox(props: IssueBoxProps) {
  const { placement, label } = props
  const rect = placement.rect

  // **面と枠のクラスは片方だけ出す。** 生成 CSS の順序に頼らず、条件分岐で
  // 排他にする（M8）。**枠は下の `border` が別に選ぶ**——選択（m5 実機確認後）が
  // 枠だけを取るので、面と枠を1本の式に束ねたままだと選択の枝で面まで
  // 書き換えることになる。ここは面と文字色だけを決める。
  //
  // **優先順位は 整合性エラー ＞ 抑制 ＞ 旗 ＞ 通常。** `placement.event`
  // は layout.ts が「このノード自身が旗（見送り／解決）を掲げているか」だけで組む
  // （祖先は見ない）ので、自分自身の旗を判定するのに新しい prop は要らない。
  // **`suppressed` を上に置くのが要**——旗が入れ子になったとき（祖先 B が
  // 旗を掲げ、配下 C も自分で旗を掲げている）、C は `suppressed`（祖先由来）が
  // 立つので faint の側に進む。ここを逆にすると C だけ文字が濃く戻り、薄い配下の
  // 中に濃い C が挟まる退行になる（`IssueTreeEditor.tsx` の `inheritedSuppressed` の
  // コメントが指す退行と同じ形。実際にそのテストが「見送りが入れ子でも、配下は
  // 薄いまま」で見ている）。**m5 で解決の面（`judge-yes-face`）が加わってからは
  // 賭け金が上がった**——逆にすると、凍結された枝の途中に淡い緑の箱が1つだけ
  // 灯り、「その1件はまだ考える」と読めてしまう。順番は動かさないこと。
  //
  // 旗を掲げた箱は面を持つ。**M25 は「見送りと解決で面を分けない」と決めていたが、
  // issue-tree m5 の実機確認で覆した**（設計ノート D8）——依頼者の理由は
  // 「一目で『解決方針が決まった課題』＝これ以上考えなくてよい とわかる」。
  // 見送りは一段沈んだ面（`surface-muted`）のまま、**解決だけ淡い緑
  // （`judge-yes-face`）**にする。種別はバッジの文言（`ISSUE_EVENT_LABELS`）も
  // 運ぶが、面が加わったぶん遠目で分かる。
  // `rule` はどちらの面の上でも 3:1 を満たす（`surface-muted` は
  // `palette-requirements.ts` の `BACKGROUNDS`、`judge-yes-face` は
  // `FACE_REQUIREMENTS` が課している）。
  // 無効は赤い枠＋淡い面（`invalid-face`。rev 9章 規約2）
  const face = props.invalid
    ? 'bg-invalid-face text-ink'
    : props.suppressed
      ? 'bg-surface-muted text-ink-faint'
      : placement.event !== null
        ? props.eventKind === 'resolved'
          ? 'bg-judge-yes-face text-ink'
          : 'bg-surface-muted text-ink'
        : 'bg-surface text-ink'

  /**
   * **選択は枠で示す。面には触らない。**（m5 の実機確認後）
   *
   * 面は旗が使っている（見送り＝`surface-muted`／解決＝`judge-yes-face`）ので、
   * 選択まで面で示すと**旗と選択が同じ道具を奪い合う**——解決の課題を選んだ
   * 瞬間に緑が消える、あるいは選択が見えない、のどちらかになる。枠なら両立する。
   *
   * 語彙は `FileList.tsx`（選択中＝`border-ink bg-canvas`／非選択＝
   * `border-transparent`）に倣い、**枠の側だけ**借りた（面は上のとおり旗のもの）。
   * 新しい役割トークンは作らない。
   *
   * **太さは変えない**（`ISSUE_BORDER` ＝ 1px のまま）——枠の太さは
   * `measure.ts` の定数と対で、太くすると測る側も直さなければ中身の位置が
   * 1px ずつずれる。色だけで示せるものに幾何を動かさない。
   *
   * **面と枠のクラスは片方だけ出す**（上の `face` と同じ M8 の約束）ので、
   * ここは1本の三項で枠を1つだけ選ぶ
   */
  const border = placement.selected
    ? 'border-ink'
    : props.invalid
      ? 'border-invalid'
      : props.suppressed
        ? 'border-ink-faint'
        : 'border-rule'

  /**
   * 箱の中のクリックで選択する。**押された場所で3つに分かれる**:
   *
   * 1. **押すと何かが起きるもの**（`button` ＝ 旗のトグル・畳んだ仮説行・
   *    パネルの中のボタン、判断のドロップダウンの `menuitem`、リンク）と、
   *    **展開パネルの中**（`[data-panel]`）→ **選択を動かさない。**
   *    前者はその操作自身が仕事を持っているから、後者は**そこが課題を選ぶ
   *    場所ではなく、仮説を読み書きする場所**だから。パネルを外さずに
   *    入り切りを受けると、**開いた箱（780px）の広い余白を押した拍子に
   *    課題ごと畳まれる**。**パネルが描かれるのは選択中のときだけ**なので、
   *    素通しにして失う経路は無い（未選択のノードのパネルを押して選ぶ、
   *    という道はそもそも存在しない）。外す手段は「箱の地をもう一度押す」
   *    「別のノードを押す」の2つが残る
   * 2. **文章の欄**（`textarea` / `input` / `select`）→ **選ぶだけ。外さない。**
   *    ここを外す側に倒すと、**選択中の課題のタイトルへカーソルを置き直す
   *    たびに箱が畳まれる**——打つ場所そのものが目の前で動く
   * 3. それ以外（箱の地）→ **入り切りする。** もう一度押すと畳まれる
   *    （撤去したシェブロンの手触りを、箱そのもので受ける）
   *
   * **判断のドロップダウンは Radix のポータルで body へ出るが、React の
   * 合成イベントは React の木を遡る**ので、ここまで届く。1 で弾かないと、
   * 種別を選んだ瞬間にその課題が畳まれてパネルごと消える（実際に踏んだ）。
   *
   * **フォーカスでは選択しない**（`onFocus` を持たせない）——`Tab` で
   * キャンバスを歩くたびに次々と箱が開いて図が動く。m5 が同じ理由で
   * 仮説行の `onFocus` による自動展開を外している（設計ノート D8）
   */
  const onBoxClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement
    if (target.closest('button, a, [role="menuitem"], [role="menu"], [data-panel]') !== null) return
    props.onSelect(target.closest('textarea, input, select') === null)
  }

  // 未記入と立っている問いは名前の後半に付ける。**前半（`課題{N}`）は動かさない**
  // ——エディタのテストが前方一致で引く
  const name = `${label}${props.text === '' ? '（未記入）' : ''}${
    props.warn ? ` ${QUESTION_LABELS.hypothesis}` : ''
  }`

  /**
   * 世界座標の矩形を、箱の中の位置へ直す。**枠線ぶん戻すのを忘れないこと**
   * ——絶対配置の原点はボーダーボックスではなくパディングボックスであり、
   * レイアウトが返す `ISSUE_INSET_X`（余白＋枠線）は箱の左上から測ってある
   */
  const inBox = (r: Rect): React.CSSProperties => ({
    left: r.x - rect.x - ISSUE_BORDER,
    top: r.y - rect.y - ISSUE_BORDER,
    width: r.width,
    height: r.height,
  })

  return (
    <div
      // ノードのレイヤは pointer-events-none で操作を通す。操作を受けるのは
      // この矩形だけ——レイヤ全面が受けると、下にある空状態のボタンや
      // 背景（パン）に触れなくなる
      className={`group/issue pointer-events-auto absolute rounded-sm ${ISSUE_BOX_CLASS} ${border} ${face}`}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      onClick={onBoxClick}
    >
      <div className="absolute" style={inBox(placement.title)}>
        <CellInput
          multiline
          autoSize={false}
          // **開いた課題のタイトルは一段大きい**（`EXPANDED_TITLE_FONT_CLASS`
          // ＝ text-base 16px。畳んでいれば `TITLE_FONT_CLASS` ＝ 14px）。
          // **`layout.ts` が同じ条件で測定器を切り替えている**——片方だけ
          // 変えると、測定より広く描いて折り返しが1行増え、高さ固定＋
          // `overflow-hidden` の textarea で末尾の行が黙って見えなくなる
          className={`h-full w-full resize-none overflow-hidden bg-transparent whitespace-pre-wrap break-all ${placement.expanded ? EXPANDED_TITLE_FONT_CLASS : TITLE_FONT_CLASS} outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-inset focus:ring-ring`}
          aria-label={name}
          // **`QUESTION_LABELS.hypothesis` をプレースホルダにしない**
          // ——空の箱のタイトルが「仮説なし」に見える。問いはバッジが運ぶ
          placeholder="課題"
          data-cell={props.nodeKey}
          value={props.text}
          onValueChange={props.onTextChange}
          onFieldKeyDown={props.onFieldKeyDown}
        />
      </div>

      {/* 旗のトグル。**箱の外（left-full）へ逃がさない**——列の
          間隔の中に置くと、隣の枝と重なる位置に出ることがある。
          **レイアウトはタイトル行の右上を常に1枠空けている**ので、
          旗が立っていれば測定した矩形へ、まだなら同じ枠（右寄せ）へ置けば、
          ホバー中に出るボタンがタイトルの文字に被らない（layout.ts の解説）。

          **`gap-2` は `BADGE_GAP`（8px）と対。** 旗の無い箱では
          `eventToggle` がボタン2つ（見送り／解決）を返し、ここがその間の
          空きを持つ——`layout.ts` の `triggersW` が同じ 8px を足して枠を
          予約している。**片方だけ変えると、予約した枠より描画が広くなって
          タイトルにはみ出す**（旗が立っていれば子は1つなので効かない） */}
      <div
        className="absolute flex items-center justify-end gap-2"
        style={
          placement.event === null
            ? { top: ISSUE_PADDING_Y, right: ISSUE_PADDING_X }
            : inBox(placement.event.badge)
        }
      >
        {props.eventToggle}
      </div>

      {/* 「仮説なし」。**旗のバッジとは排他**（旗を掲げた課題は抑制されるので
          問いが立たない）。読み取り専用の表示だが aria-hidden にしない——
          名前の後半に同じ言葉が入っており、音声でも二重には読まれない。

          **ホバー・フォーカス中は隠して、旗のトグルと入れ替える。**
          右上の枠は1つで、レイアウトが空けているのは「バッジかトグルの
          広い方」1枠ぶんである（2枠ぶん空けるとタイトルが痩せる）。
          問いは名前の後半にも入っているので、隠しているあいだも音声からは消えない */}
      {props.warn && placement.event === null && (
        <div
          className="pointer-events-none absolute flex items-center justify-end group-hover/issue:invisible group-focus-within/issue:invisible"
          style={{ top: ISSUE_PADDING_Y, right: ISSUE_PADDING_X }}
        >
          <Badge variant={badgeVariantOf('open', props.suppressed)}>{QUESTION_LABELS.hypothesis}</Badge>
        </div>
      )}

      {/* 旗の理由。**最新の旗だけが編集できる**（`setEventNote` が
          データ側で塞いでいる約束を、画面側でも塞ぐ）。
          `onFieldKeyDown` を渡さないのは、理由の欄で Enter に何も生やさせない
          ため——ここは木の構造を増やす場所ではない。
          **`eventKind` が `null` を通る式のままにしてある**——`placement.event
          !== null` と対なので実際には常にラベルが入るが、型で `null` を
          除けないところに `!` を置くと、後から前提が変わったときに実行時に落ちる */}
      {placement.event !== null && props.eventNote !== null && (
        <div className="absolute" style={inBox(placement.event.reason)}>
          <CellInput
            multiline
            autoSize={false}
            // 理由は `text-ink-muted`（モックの `.reason`）。旗を掲げている
            // 箱は `text-ink` を継承するので、そのままでは本文と同じ濃さになってしまう
            className="h-full w-full resize-none overflow-hidden bg-transparent text-sm whitespace-pre-wrap break-all text-ink-muted outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-inset focus:ring-ring"
            aria-label={`${label} の${props.eventKind === null ? '' : ISSUE_EVENT_LABELS[props.eventKind]}の理由`}
            placeholder="理由"
            data-cell={props.eventCellKey}
            value={props.eventNote}
            onValueChange={props.onEventNoteChange}
          />
        </div>
      )}

      {/* 仮説行。**行は自分の世界座標を持つので、箱の原点を引いて置く**
          （`HypothesisRow` に `origin` を渡してある） */}
      {props.children}

      {/* 末尾の「＋ 仮説を追加」（m5 Task 7。キャンバスの `.addhypo`）。
          **帯は幅いっぱいで、ボタンは左寄せ**（`align-self: flex-start` に
          あたる）——レイアウトはボタンの幅を測っておらず、左端だけを
          パネルと揃えている。**選ばれているときだけ矩形がある**——仮説が
          0本で開かない課題でも、選べばここだけは出る（`layout.ts`） */}
      {placement.addHypothesis !== null && (
        <div
          className="absolute flex items-center"
          style={inBox(placement.addHypothesis)}
        >
          {props.addHypothesis}
        </div>
      )}
    </div>
  )
}
