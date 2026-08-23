import { CellInput, type FieldState } from '@/components/CellInput'
import type { Rect } from '@/core/canvas/viewport'
import { badgeClass } from './badge-styles'
import { QUESTION_LABELS } from './derive'
import type { IssuePlacement } from './layout'
import { ISSUE_BORDER, ISSUE_BOX_CLASS, ISSUE_PADDING_X, ISSUE_PADDING_Y, TITLE_FONT_CLASS } from './measure'

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
  /** 最新の見送りの理由（見送りが無ければ null）。理由は最新だけ編集できる */
  deferralNote: string | null
  deferralCellKey: string
  onTextChange: (next: string) => void
  onDeferralNoteChange: (next: string) => void
  onFieldKeyDown?: (e: React.KeyboardEvent, state: FieldState) => void
  /**
   * 見送りのトグル（入り＝見送り済み／切り＝見送っていない）。**必須にしてある**
   *——省略できると、見送りを付ける動線がマウスから消えていても型は通り、
   * 画面は一見正常なまま「押す場所が無い」になる。
   * 見送り済みの箱では、このトグル自身が見送りバッジを兼ねる（面はエディタが渡す）
   */
  deferralToggle: React.ReactNode
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
 * 1. 面が4種類ある（整合性エラー／抑制／見送り／通常）。**未決を面で見せない**
 *    ——立っている問いはタイトル行の右端のバッジが運ぶ。面で塗ると、
 *    「まだ埋めていない」箱が図の大半を占めて地の色が意味を失う
 * 2. 抑制された配下も**地の色に落とさない**。`bg-surface` のまま枠と文字を
 *    `ink-faint` にする——`bg-canvas` にすると箱が背景に溶けて木の形が読めない。
 *    **`opacity-*` で薄くしない**（検算したコントラストを割る）
 * 3. **自分自身が見送りの箱は `bg-surface-accent` で塗る**（実機確認後に追加。
 *    `docs/issue-tree/仮説検証モジュール-設計ノート.md` D8）。未決とは違って
 *    見送りは稀で意図的な判断なので、1の理由（未決を面で塗ると図が警告で
 *    埋まる）はここには効かない。塗るのは掲げた当人の箱だけ——抑制（2）が
 *    勝つ。祖先由来で既に薄い箱は、自分も見送っていても濃い塗りには戻さない
 * 4. 見送りのトグルを置く枠がある。**押されているかどうかはデータの導出**
 *    ——`events` が空でなければ入り。ビュー側に開閉の状態を持たない
 *（判断のドロップダウンだけが、開閉の状態を親＝エディタに持たせている）
 */
export function IssueBox(props: IssueBoxProps) {
  const { placement, label } = props
  const rect = placement.rect

  // **面と枠のクラスは片方だけ出す。** bg-surface と bg-warning/20 を両方
  // 並べても、勝つのは生成 CSS の順序であってクラス名の順序ではない（M8）。
  //
  // **`errorCell` / `warnCell` の定数を置いていないのは意図的である。**
  // 未決を面で見せなくなった（前提3）ので `warnCell` に使い道が無く、
  // `palette.test.ts` の紐づき検査は**片方を宣言したファイルに両方を要求する**
  // ——使わない定数を検査のためだけに置くのは、検査を騙すのと変わらない。
  // 濃さそのものは「検算していない濃さを使っていない」が字面で見ている
  //
  // **優先順位は 整合性エラー ＞ 抑制 ＞ 見送り ＞ 通常。** `placement.deferral`
  // は layout.ts が「このノード自身が見送り済みか」だけで組む
  // （`deferred = node.events.length > 0`。祖先は見ない）ので、自分自身の
  // 見送りを判定するのに新しい prop は要らない。**`suppressed` を上に置くのが
  // 要**——見送りが入れ子になったとき（祖先 B が見送り、配下 C も自分で見送りを
  // 掲げている）、C は `suppressed`（祖先由来）が立つので塗りには進まない。
  // ここを逆にすると、薄い配下の中に濃い塗りの C が挟まる退行になる
  // （`IssueTreeEditor.tsx` の `inheritedSuppressed` のコメントが指す退行と
  // 同じ形。実際にそのテストが「見送りが入れ子でも、配下は薄いまま」で見ている）。
  // 塗りは `surface-accent`——新しいトークンは足さず、見出しの面
  // （`HEADING_FACE`）を流用した。枠は素の `border-rule` のまま変えていない
  // ——`GlossaryEditor.tsx` / `ErrorCatalogEditor.tsx` の見出し行が既に
  // `border-rule bg-surface-accent` の組を使っており、新しい組ではない。
  // 役割が2つになった経緯は `docs/issue-tree/仮説検証モジュール-設計ノート.md` D8
  const face = props.invalid
    ? 'border-warning bg-warning/20 text-ink'
    : props.suppressed
      ? 'border-ink-faint bg-surface text-ink-faint'
      : placement.deferral !== null
        ? 'border-rule bg-surface-accent text-ink'
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
      <div className="absolute" style={inBox(placement.title)}>
        <CellInput
          multiline
          autoSize={false}
          className={`h-full w-full resize-none overflow-hidden bg-transparent whitespace-pre-wrap break-all ${TITLE_FONT_CLASS} outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-inset focus:ring-ring`}
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

      {/* 見送りのトグル。**箱の外（left-full）へ逃がさない**——列の
          間隔の中に置くと、隣の枝と重なる位置に出ることがある。
          **レイアウトはタイトル行の右上を常に1枠空けている**ので、
          見送り済みなら測定した矩形へ、まだなら同じ枠（右寄せ）へ置けば、
          ホバー中に出るボタンがタイトルの文字に被らない（layout.ts の解説） */}
      <div
        className="absolute flex items-center justify-end"
        style={
          placement.deferral === null
            ? { top: ISSUE_PADDING_Y, right: ISSUE_PADDING_X }
            : inBox(placement.deferral.badge)
        }
      >
        {props.deferralToggle}
      </div>

      {/* 「仮説なし」。**見送りバッジとは排他**（見送った課題は抑制されるので
          問いが立たない）。読み取り専用の表示だが aria-hidden にしない——
          名前の後半に同じ言葉が入っており、音声でも二重には読まれない。

          **ホバー・フォーカス中は隠して、見送りのトグルと入れ替える。**
          右上の枠は1つで、レイアウトが空けているのは「バッジかトグルの
          広い方」1枠ぶんである（2枠ぶん空けるとタイトルが痩せる）。
          問いは名前の後半にも入っているので、隠しているあいだも音声からは消えない */}
      {props.warn && placement.deferral === null && (
        <div
          className="pointer-events-none absolute flex items-center justify-end group-hover/issue:invisible group-focus-within/issue:invisible"
          style={{ top: ISSUE_PADDING_Y, right: ISSUE_PADDING_X }}
        >
          <span className={badgeClass('open', props.suppressed)}>{QUESTION_LABELS.hypothesis}</span>
        </div>
      )}

      {/* 見送りの理由。**最新の見送りだけが編集できる**（`setDeferralNote` が
          データ側で塞いでいる約束を、画面側でも塞ぐ）。
          `onFieldKeyDown` を渡さないのは、理由の欄で Enter に何も生やさせない
          ため——ここは木の構造を増やす場所ではない */}
      {placement.deferral !== null && props.deferralNote !== null && (
        <div className="absolute" style={inBox(placement.deferral.reason)}>
          <CellInput
            multiline
            autoSize={false}
            // 理由は `text-ink-muted`（モックの `.reason`）。見送りを掲げている
            // 箱は通常の面で描くので、継承では本文と同じ濃さになってしまう
            className="h-full w-full resize-none overflow-hidden bg-transparent text-xs whitespace-pre-wrap break-all text-ink-muted outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-inset focus:ring-ring"
            aria-label={`${label} の見送りの理由`}
            placeholder="理由"
            data-cell={props.deferralCellKey}
            value={props.deferralNote}
            onValueChange={props.onDeferralNoteChange}
          />
        </div>
      )}

      {/* 仮説行。**行は自分の世界座標を持つので、箱の原点を引いて置く**
          （`HypothesisRow` に `origin` を渡してある） */}
      {props.children}
    </div>
  )
}
