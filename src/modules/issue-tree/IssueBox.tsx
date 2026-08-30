import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/Badge'
import { CellInput, type FieldState } from '@/components/CellInput'
import type { Rect } from '@/core/canvas/viewport'
import { badgeVariantOf } from './badge-variant'
import { ISSUE_EVENT_LABELS, QUESTION_LABELS, type IssueEventKind } from './derive'
import type { IssuePlacement } from './layout'
import {
  CHEVRON_SIZE_CLASS,
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
   * 旗が立っている箱では、このトグル自身が旗のバッジを兼ねる（面はエディタが渡す）
   */
  eventToggle: React.ReactNode
  /**
   * 開閉トグル。**必須にしてある**（`eventToggle` と同じ理由——押す場所を型で守る）。
   *
   * **開いているか／開けるかは props で受け取らない**——`placement.expanded` /
   * `placement.expandable` を見る。エディタの持つ鍵とレイアウトの決めた事実で
   * 情報源が2つに割れると、「シェブロンは下向きなのに何も開いていない」が
   * 作れてしまう（`IssuePlacement.expanded` の解説）
   */
  onToggleExpand: () => void
  /**
   * 展開した課題ノードの末尾に置く「＋ 仮説を追加」。**必須にしてある**
   *（`eventToggle` / `onToggleExpand` と同じ理由——押す場所を型で守る）。
   * 仮説を足す動線はキーから消えた（m5）ので、これが抜けると
   * **その課題に仮説を足す道が箱から消える**。
   *
   * **場所を決めるのはレイアウト**（`placement.addHypothesis`）で、畳んで
   * いれば矩形が `null` になり、ここは描かれない
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
 * ロジックツリーのノードとの差は4つ:
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
 * 3. **自分自身が旗（見送り／解決）を掲げている箱は `bg-surface-muted` で塗る**
 *    （実機確認後に追加。`docs/issue-tree/仮説検証モジュール-設計ノート.md` D8）。
 *    未決とは違って旗は稀で意図的な判断なので、1の理由（未決を面で塗ると図が
 *    警告で埋まる）はここには効かない。**M25 からは配下も同じ面を持つ**ので、
 *    面が運ぶのは「表明の所在」ではなく**凍結の範囲**になった——誰が掲げたかは
 *    文字の濃さ（当人＝`text-ink`／配下＝`ink-faint`）とバッジ（当人＝実線／
 *    配下＝faint）が運ぶ（D8 の M25 追記）。**見送りと解決は面を分けない**
 *    ——面が運ぶのは凍結の範囲であって旗の種別ではなく、種別はバッジの文言が運ぶ
 *    （D8 の規律。m4 で `resolved` 用の新しい面は足していない）。
 *    枠は他の面と揃えて `border-rule`（`rule` は `surface-muted` の上でも
 *    3:1 を満たす。理由は `face` 計算のコメントを見よ）
 * 4. **タイトルの左に開閉トグル（シェブロン）がある**（m5）。展開の単位は
 *    課題ノードで、開くと箱が `BOX_WIDTH` → `EXPANDED_BOX_WIDTH` に広がり、
 *    その課題の仮説がまとめてパネルを持つ。**仮説を持たない課題では場所を
 *    空けたまま隠す**（`invisible`）——`display: none` にすると同じ列の中で
 *    タイトルの左端が揃わない
 * 5. 旗のトグルを置く枠がある。**押されているかどうかはデータの導出**
 *    ——`events` が空でなければ入り。ビュー側に開閉の状態を持たない
 *（判断のドロップダウンだけが、開閉の状態を親＝エディタに持たせている）
 */
export function IssueBox(props: IssueBoxProps) {
  const { placement, label } = props
  const rect = placement.rect

  // **面と枠のクラスは片方だけ出す。** 生成 CSS の順序に頼らず、条件分岐で
  // 排他にする（M8）。
  //
  // **優先順位は 整合性エラー ＞ 抑制 ＞ 旗 ＞ 通常。** `placement.event`
  // は layout.ts が「このノード自身が旗（見送り／解決）を掲げているか」だけで組む
  // （祖先は見ない）ので、自分自身の旗を判定するのに新しい prop は要らない。
  // **`suppressed` を上に置くのが要**——旗が入れ子になったとき（祖先 B が
  // 旗を掲げ、配下 C も自分で旗を掲げている）、C は `suppressed`（祖先由来）が
  // 立つので faint の側に進む。M25 で面はどちらも `surface-muted` になったが、
  // ここを逆にすると C だけ文字が濃く戻り、薄い配下の中に濃い C が挟まる退行になる
  // （`IssueTreeEditor.tsx` の `inheritedSuppressed` のコメントが指す退行と
  // 同じ形。実際にそのテストが「見送りが入れ子でも、配下は薄いまま」で見ている）。
  //
  // 旗を掲げた箱は一段沈んだ面（`surface-muted`）。**見送りと解決で面を分けない**
  // ——面が運ぶのは「凍結の範囲」であって旗の種別ではなく、種別はバッジの文言
  // （`ISSUE_EVENT_LABELS`）が運ぶ（D8 の規律）。`rule` はこの面の上でも
  // 3:1 を満たす（`palette-requirements.ts` の `BACKGROUNDS` に入っている）。
  // 無効は赤い枠＋淡い面（`invalid-face`。rev 9章 規約2）
  const face = props.invalid
    ? 'border-invalid bg-invalid-face text-ink'
    : props.suppressed
      ? 'border-ink-faint bg-surface-muted text-ink-faint'
      : placement.event !== null
        ? 'border-rule bg-surface-muted text-ink'
        : 'border-rule bg-surface text-ink'

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
      className={`group/issue pointer-events-auto absolute rounded-sm ${ISSUE_BOX_CLASS} ${face}`}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    >
      {/* 開閉トグル（m5）。**展開の単位は課題ノード**なので、押すと
          その課題にぶら下がる仮説がまとめて開く。
          **レイアウトが場所を空けている**（`placement.chevron`）ので、
          仮説を持たない箱でも `invisible` で隠すだけにしてタイトルの
          左端を列の中で揃える。アイコンは lucide の SVG（絵文字は使わない）、
          寸法は `CHEVRON_SIZE` と対の `CHEVRON_SIZE_CLASS` */}
      <button
        type="button"
        className={`pointer-events-auto absolute inline-flex items-center justify-center rounded-sm text-ink-muted outline-none transition-colors hover:text-ink focus:ring-2 focus:ring-inset focus:ring-ring${
          placement.expandable ? '' : ' invisible'
        }`}
        style={inBox(placement.chevron)}
        // **アクセシブル名の前半（`課題{N}`）は動かさない**——テストが前方一致で引く。
        // 開いているかは `aria-expanded` が運ぶ（名前と二重に述べない）
        aria-label={`${label}の詳細`}
        aria-expanded={placement.expanded}
        onClick={props.onToggleExpand}
      >
        {placement.expanded ? (
          <ChevronDown aria-hidden className={CHEVRON_SIZE_CLASS} />
        ) : (
          <ChevronRight aria-hidden className={CHEVRON_SIZE_CLASS} />
        )}
      </button>

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
          ホバー中に出るボタンがタイトルの文字に被らない（layout.ts の解説） */}
      <div
        className="absolute flex items-center justify-end"
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
          パネルと揃えている。**開いているときだけ矩形がある** */}
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
