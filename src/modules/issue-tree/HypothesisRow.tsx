import { Badge } from '@/components/Badge'
import type { Rect } from '@/core/canvas/viewport'
import type { JudgementEvent } from '@/types/issue-tree'
import { badgeVariantOf } from './badge-variant'
import { hypothesisCellKey } from './cell-keys'
import { badgeGroupOf, BADGE_LABELS, latestKind, QUESTION_LABELS } from './derive'
import type { HypothesisRowRects } from './layout'
import { BADGE_HEIGHT, ISSUE_BORDER, ROW_DOT_INSET, ROW_DOT_SIZE } from './measure'

/**
 * `data-cell` の値は `./cell-keys` が作る。**ここに書き写さないこと**
 *——エディタは同じ文字列でフォーカスの予約を引くので、2つ目のコピーが
 * できると「予約したのに当たらない」が静かに起きる（cell-keys.ts の解説）
 */

export interface HypothesisRowProps {
  /** 行の鍵（`computeRowKeys`）。`data-cell` はこれから作る */
  hypothesisKey: string
  /** アクセシブル名の接頭（`仮説{N}`） */
  label: string
  /** 行の外枠（`HypothesisPlacement.rect`）。**行は寸法を再計算しない** */
  rect: Rect
  /**
   * 畳まれた行の中身（`HypothesisPlacement` の畳まれた枝の `row`）。
   * 開いている仮説は `HypothesisPanel` が丸ごと描く——**どちらを描くかは
   * 型が決めている**（`row` を持つ枝の `expanded` は `null` 型そのもの）
   */
  row: HypothesisRowRects
  /** 親の箱の左上（世界座標）。行は箱の中に絶対配置されるので差し引く */
  origin: { x: number; y: number }
  /** ソリューション仮説のタイトル。**詳細・価値仮説はパネルの担当** */
  title: string
  events: readonly JudgementEvent[]
  /** 祖先の見送りで抑制されているか */
  suppressed: boolean
  /**
   * 畳まれた行を**押した**ときに開く（フォーカスでは開かない。下の註）。
   * 開くのは**持ち主の課題**であり、同じ課題の仮説はまとめてパネルを持つ
   */
  onExpand: () => void
}

/**
 * 畳まれた仮説1件＝**課題の箱の中の1行**（M3 の文法）。
 *
 * 「点・文言・行末のバッジ」の1行だけを描く。詳細・価値仮説・検証結果・FB は
 * **展開したときにだけ** `HypothesisPanel` が出す。展開はビュー状態であり、
 * ファイルには書かない。**開くのは課題ノードごと**（m5）なので、同じ課題に
 * ぶら下がる行は同時に開く。
 *
 * **畳まれた行の `<button>` と、パネルの中の文言の `<textarea>` は同じ
 * `data-cell` を名乗る。** エディタはその文字列でフォーカスを予約するので
 *（行に着いた瞬間に textarea へ移す継ぎ目）、**2つが同時に DOM にあっては
 * ならない**——`querySelector` は先頭を掴み、予約が静かに外れる。
 * 2つの部品が構造的に排他なのはそのためである
 */
export function HypothesisRow(props: HypothesisRowProps) {
  const { row, label, events } = props

  /** 畳まれた行の中（ボタンの矩形が原点。ボタンは枠線を持たない） */
  const inRow = (r: Rect): React.CSSProperties => ({
    left: r.x - props.rect.x,
    top: r.y - props.rect.y,
    width: r.width,
    height: r.height,
  })

  // 現在ステータスは**最新イベントからの導出**（`derive.ts`）。
  // `hypothesisStatus` ではなく `latestKind` を呼ぶのは、props の
  // `readonly` な配列をそのまま渡せるため（写しを作らない）
  const group = badgeGroupOf(latestKind(events) ?? 'undecided')

  /**
   * 文字色。**3段ある**:
   *
   * - 抑制された配下（祖先が見送り／解決を掲げた枝）は `ink-faint`。
   *   **箱からの継承に頼らない**——旗を掲げている当の箱は通常の面で描く
   *   ので、中の行は `text-ink` を継承してしまう
   * - **棄却された仮説は `ink-muted`**（計画の前提7）。面は敷かない
   *   ——灰色の面は「見送りの箱」（`surface-muted`）と同じ見え方になり、
   *   抑制と見分けが付かなくなる。棄却の理由は本開発から遡って読む対象
   *   なので、読めなくはしない（一段落とすだけ）
   * - それ以外は `ink`
   *
   * **`opacity-*` は使わない**——検算したコントラスト比を割る
   */
  const ink = props.suppressed ? 'text-ink-faint' : group === 'no' ? 'text-ink-muted' : 'text-ink'
  /** プレースホルダ相当（文言が空）の抑えた文字 */
  const mutedInk = props.suppressed ? 'text-ink-faint' : 'text-ink-muted'
  /**
   * 行頭の点（モックの `.row::before`）。**バッジと同じ高さに揃える**
   */
  const dot: Rect = {
    x: props.rect.x + ROW_DOT_INSET,
    y: row.badge.y + Math.floor((BADGE_HEIGHT - ROW_DOT_SIZE) / 2),
    width: ROW_DOT_SIZE,
    height: ROW_DOT_SIZE,
  }

  return (
    <button
      type="button"
      className="absolute rounded-sm text-left outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
      style={{
        left: props.rect.x - props.origin.x - ISSUE_BORDER,
        top: props.rect.y - props.origin.y - ISSUE_BORDER,
        width: props.rect.width,
        height: props.rect.height,
      }}
      aria-label={`${label}を開く`}
      data-cell={hypothesisCellKey(props.hypothesisKey, { cell: 'hypothesis' })}
      // **フォーカスが入っただけでは開かない**（m5 で `onFocus` を外した）
      // ——`Tab` で行に着いた瞬間に開いて textarea へ移す形だと、1回の `Tab` で
      // フォーカスが2回動き、キーで木を歩くときに行き先が読めなくなる
      //（`open-issues.md` に上がっていた欠陥）。押したときだけ開く
      onClick={props.onExpand}
    >
      <span
        aria-hidden="true"
        className={`absolute rounded-full ${props.suppressed ? 'bg-ink-faint' : 'bg-ink-muted'}`}
        style={inRow(dot)}
      />
      {/* 畳まれた行は**必ず1行**。レイアウトも1行で測っているので、
          改行は空白に潰してから省略記号に任せる */}
      <span
        className={`absolute truncate text-sm leading-normal ${props.title === '' ? mutedInk : ink}`}
        style={inRow(row.text)}
      >
        {props.title === '' ? '仮説' : props.title.replace(/\n/g, ' ')}
      </span>
      <span className="absolute flex items-center justify-end" style={inRow(row.badge)}>
        <Badge variant={badgeVariantOf(group, props.suppressed)}>{BADGE_LABELS[group]}</Badge>
      </span>
      {/* 「FB待ち」（M22）。**状態のバッジの後に描く**——先に置くと、
          行の先頭の `inline-flex` を状態のバッジとして引いている検査が
          黙って別の要素を掴む。抑制された行には立たない（`derive.ts`） */}
      {row.feedbackBadge !== null && (
        <span
          className="absolute flex items-center justify-end"
          style={inRow(row.feedbackBadge)}
        >
          <Badge variant="pending">{QUESTION_LABELS.feedback}</Badge>
        </span>
      )}
    </button>
  )
}
