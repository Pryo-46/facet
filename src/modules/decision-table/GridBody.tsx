import { Ban } from 'lucide-react'
import { useRef, useState } from 'react'
import { buttonBase } from '@/components/button-styles'
import { CellSelect } from '@/components/CellSelect'
import { cellField, cellFocus, cellInput, headCell } from '@/components/table-styles'
import { cellFace, CELL_FACE_CLASS, type ErrorMarks } from '@/core/list-editor/cell-face'
import { cellId } from '@/core/list-editor/use-list-rows'
import { rowRef } from '@/core/row-ref'
import type { Condition, Outcome, Row } from '@/types/decision-table'
import { CLEAR_RESULT_LABEL, IMPOSSIBLE_LABEL } from './labels'
import { isMissingResult } from './missing'

/**
 * 起こりえないのセルの入力欄。非アクティブの文字色（`ink-faint`）で置く
 * ——起こりえないが示すのは「この行に結果が無い」ことであって、強調ではない。
 * `cellInput` ではなく `cellField` から組むのは、同じ要素に文字色を2つ載せると
 * どちらが出るかが生成 CSS の並び順で決まるため
 */
const impossibleCellInput = `w-full ${cellField} text-left text-ink-faint`

/**
 * 結果どうしの境界の縦罫（弱い）。条件と結果の境界（先頭の結果列）は
 * `headColBorder` を使う——条件は読み取り専用、結果は操作対象なので、
 * 2つの区画の境目だけ見出しと同じ強さの線で分ける
 */
const colBorder = 'border-l border-l-rule-muted'
const headColBorder = 'border-l border-l-rule'

/**
 * 条件列どうしの境界の縦罫。結果列の境界（`headColBorder` の `rule`）より薄い
 * `rule-muted` を使う——条件名が長い表では、この薄い罫線が無いと列の境界が
 * 読み取れない
 */
const condColBorder = 'border-l border-l-rule-muted'

/** 条件列の地を引くための鍵。条件列は編集対象ではないので、指摘の `field` にはならない */
const CONDITION_FIELD = 'condition-column'

/**
 * 読み取り専用の列の鍵。No 列と条件列がこれに当たり、地を一段弱く敷く。
 * 起こりえないのトグル列は入れない——押せる列なので、結果列と同じ地に置く
 */
const READONLY_FIELDS: ReadonlySet<string> = new Set([CONDITION_FIELD, 'no'])

/** 起こりえないのトグル列の地を引くための鍵。この列も検証の対象ではないので、指摘の `field` にはならない */
const IMPOSSIBLE_FIELD = 'impossible-column'

export interface GridBodyProps {
  conditions: readonly Condition[]
  outcomes: readonly Outcome[]
  rows: readonly Row[]
  marks: ErrorMarks
  /** 行の鍵。行は ID を持たないので、呼び出し側が位置から作る */
  gridRowKey: (index: number) => string
  /** 表本体でいまフォーカスのある行。無ければ null */
  focusedRow: number | null
  /** 行のフォーカスが変わったときに呼ぶ。表の外へ出たときは null を渡す */
  onFocusRow: (index: number | null) => void
  onPickResult: (rowIndex: number, outIndex: number, value: string) => void
  onToggleImpossible: (rowIndex: number) => void
  onCellKeyDown: (e: React.KeyboardEvent, at: { index: number; field: string }) => void
}

/**
 * デシジョンテーブルの表本体。**`rows` をそのまま描く**——条件の直積から
 * 描き直すと、直積と一致しないファイル（整合性検証が row-set で赤にする状態）
 * の中身が見えなくなる。
 *
 * **`impossible` の行でも結果セルの本数を変えない。** `colSpan` でまとめると、
 * `Tab` の送り先が行によって消える。`impossible` の行は各結果セルを
 * 「起こりえない」を表示するボタンにする——押すと解除する。
 *
 * 表の右端に行ごとの `起こりえない` トグルボタンを置く。主修飾キー＋`Enter` は
 * 結果セルにしか届かないので、結果が0本の表ではこのボタンだけが入り切りの入口になる
 */
export function GridBody(props: GridBodyProps) {
  const {
    conditions,
    outcomes,
    rows,
    marks,
    gridRowKey,
    focusedRow,
    onFocusRow,
    onPickResult,
    onToggleImpossible,
    onCellKeyDown,
  } = props

  /**
   * メニューを開いているセルの行。**`onBlur` より優先する。**
   * ポータルへ移ったフォーカスは表の外に見えるので、これが無いと
   * 値を選んでいる間だけ面が消える。
   *
   * **開いている間の面は jsdom では決められない。** メニューを開くと
   * トリガーにフォーカスが当たり、`focusedRow` が同じ面を付けるので、
   * どちらが付けたのかをテストから区別できない。閉じたときに戻すことと、
   * `CellSelect` が開閉を知らせることの2点だけがテストで縛れる
   */
  const [menuRow, setMenuRow] = useState<number | null>(null)

  /** 面を敷く行。開いているメニューがあればその行を優先し、無ければフォーカスの行に従う */
  const surfaceRow = menuRow ?? focusedRow

  /**
   * セルの面。**1セルにつき1つだけ返す**——面のクラスを2つ載せると、
   * どちらが出るかは生成 CSS の並び順で決まり、クラスを書いた順では決まらない。
   * 強い順に
   * 指摘（赤・黄）＞ 起こりえない ＞ 行の面 ＞ 読み取り専用の列の面 で当てる。
   *
   * **読み取り専用の列（No・条件）の面は行の面より弱い `bg-surface-subtle` である。**
   * 同じ面を敷くと、選択中の行がこれらの列の上で見分けられなくなる。明度の序列
   * （地 ＞ 読み取り専用の列 ＞ 行）はライトとダークのどちらでも単調なので、
   * 暗い側でも関係が反転しない
   */
  const surfaceOf = (
    index: number,
    field: string,
    warn: boolean,
    rowAnchor = false,
    impossible = false,
  ): string => {
    const face = cellFace(marks, index, field, warn, rowAnchor)
    if (face !== 'none') return CELL_FACE_CLASS[face]
    if (impossible) return 'bg-surface-muted'
    if (index === surfaceRow) return 'bg-surface-muted'
    return READONLY_FIELDS.has(field) ? 'bg-surface-subtle' : ''
  }

  /**
   * 表を包む要素。フォーカスの追跡（`onBlur`）とクリック移動先の検索
   * （`querySelector`）の両方がこの要素を基準にする
   */
  const containerRef = useRef<HTMLDivElement>(null)

  /**
   * No・条件セルをクリックしたときの移動先。**結果が0本の表では、起こりえないの
   * トグルボタンへ移す**——結果セルが無い表では、このボタンだけがフォーカスできる
   * セルとして残る。トグルボタンは `data-cell` を持たないので、行の `<tr>` を
   * 位置で数えて中の `aria-pressed` 属性で引く
   */
  const focusFirstResultCell = (index: number, rowKey: string): void => {
    if (outcomes.length === 0) {
      containerRef.current
        ?.querySelectorAll<HTMLElement>('tbody tr')[index]
        ?.querySelector<HTMLElement>('button[aria-pressed]')
        ?.focus()
      return
    }
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-cell="${cellId(rowKey, 'result:0')}"]`)
      ?.focus()
  }

  /** 行の中の移動でも `onBlur` は飛ぶ。表の外へ出たときだけフォーカスの行を外す */
  const onGridBlur = (e: React.FocusEvent<HTMLDivElement>): void => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    onFocusRow(null)
  }

  return (
    <div ref={containerRef} className="border border-rule bg-surface" onBlur={onGridBlur}>
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col style={{ width: 56 }} />
          {/* 条件列・結果列は幅を持たない。列の本数がデータで変わってもテーブルは親幅に収まる */}
          {/* 列の key に生の id を使わない。ID 重複はこのアプリが受け入れて
              赤表示する正規の状態なので、重複した id が2本あると key が衝突する */}
          {conditions.map((_, i) => (
            <col key={`cond-${i}`} />
          ))}
          {outcomes.map((_, j) => (
            <col key={`out-${j}`} />
          ))}
          {/* 起こりえないのボタン列。幅は定義部の削除列と同じ40px */}
          <col style={{ width: 40 }} />
        </colgroup>
        <thead>
          <tr className="text-left">
            <th className={`${headCell} text-right`}>No</th>
            {conditions.map((c, i) => (
              <th key={`cond-${i}`} className={`${headCell} ${condColBorder}`}>
                {c.name}
              </th>
            ))}
            {outcomes.map((o, j) => (
              <th key={`out-${j}`} className={`${headCell} ${headColBorder}`}>
                {o.name}
              </th>
            ))}
            {/* 見出しは空。列の意味は行のボタンのアクセシブル名が運ぶ */}
            <th className={`${headCell} ${headColBorder}`} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowNo = index + 1
            const rowKey = gridRowKey(index)
            const rowSurface = surfaceOf(index, IMPOSSIBLE_FIELD, false)
            return (
              <tr key={rowKey} className="border-b border-rule-muted align-middle">
                {/* 行全体の指摘（行の列数不一致など欄を特定できないもの）は No セルの面で示す。
                    クリックでも行へ移れる——編集はできないので onClick は移動のみ */}
                <td
                  className={`cursor-pointer px-2 py-1 text-right text-ink-muted ${surfaceOf(index, 'no', false, true)}`}
                  onClick={() => focusFirstResultCell(index, rowKey)}
                >
                  {rowNo}
                </td>
                {conditions.map((_, i) => (
                  <td
                    key={`cond-${i}`}
                    className={`cursor-pointer px-2 py-1 text-ink-muted ${condColBorder} ${surfaceOf(index, CONDITION_FIELD, false)}`}
                    onClick={() => focusFirstResultCell(index, rowKey)}
                  >
                    {row.values[i]}
                  </td>
                ))}
                {outcomes.map((outcome, j) => {
                  const field = `result:${j}`
                  // 条件と結果の境界（先頭列）だけ見出しと同じ強い罫線にする。
                  // 結果どうしの境界は colBorder（弱い）のまま
                  const border = j === 0 ? headColBorder : colBorder
                  // 起こりえないの結果セルは、見送りの箱と同じ一段沈んだ面で塗る。
                  // 濃い面（judge-no）は決着をバッジの点で示すための色で、行いっぱいに
                  // 敷くと表の中でいちばん強い要素になる
                  const cellClass = `${border} ${cellFocus} ${surfaceOf(index, field, isMissingResult(row, j), false, row.impossible)}`
                  if (row.impossible) {
                    return (
                      // onFocus は td に置く。子のボタンから bubble するので、
                      // ボタンとトリガーの両方に同じ配線を重複させずに済む
                      <td key={`out-${j}`} className={cellClass} onFocus={() => onFocusRow(index)}>
                        {/* impossible の行のセル。押すと起こりえないを解除する */}
                        <button
                          type="button"
                          data-cell={cellId(rowKey, field)}
                          aria-label={`${outcome.name}（${rowNo}行目）: ${IMPOSSIBLE_LABEL}`}
                          className={impossibleCellInput}
                          onClick={() => onToggleImpossible(index)}
                          onKeyDown={(e) => onCellKeyDown(e, { index, field })}
                        >
                          {IMPOSSIBLE_LABEL}
                        </button>
                      </td>
                    )
                  }
                  return (
                    <td
                      key={`out-${j}`}
                      className={`relative ${cellClass}`}
                      onFocus={() => onFocusRow(index)}
                    >
                      <CellSelect
                        className={`${cellInput} appearance-none pr-6`}
                        aria-label={`${outcome.name}（${rowNo}行目）`}
                        data-cell={cellId(rowKey, field)}
                        value={row.results[j] ?? ''}
                        options={['', ...outcome.choices]}
                        labelOf={(v) => v}
                        itemLabelOf={(v) => (v === '' ? CLEAR_RESULT_LABEL : v)}
                        onPick={(v) => onPickResult(index, j, v)}
                        onKeyDown={(e) => onCellKeyDown(e, { index, field })}
                        changeOnArrows={false}
                        openOnEnter
                        onOpenChange={(nowOpen) => setMenuRow(nowOpen ? index : null)}
                      />
                      {/* appearance-none で消えた矢印を描き直す。背景画像の data URI は
                          使わない——色値を書くことになり conventions.test.ts が弾く */}
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 12 12"
                        className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 fill-none stroke-current stroke-2 text-ink-muted"
                      >
                        <path d="M3 4.5 L6 7.5 L9 4.5" />
                      </svg>
                    </td>
                  )
                })}
                <td
                  className={`${headColBorder} px-1 py-1 text-center ${rowSurface}`}
                  onFocus={() => onFocusRow(index)}
                >
                  {/* 起こりえないの入り切り。キーの入口（主修飾キー＋Enter）は結果セルにしか
                      無いので、結果が0本の表ではこのボタンだけが入口になる。onFocus は td に
                      置く——結果セルの他の td と同じで、子のボタンから bubble する */}
                  <button
                    type="button"
                    aria-pressed={row.impossible}
                    aria-label={`${rowRef(index)} を${IMPOSSIBLE_LABEL}にする`}
                    title={IMPOSSIBLE_LABEL}
                    className={`${buttonBase} size-6 ${row.impossible ? 'text-ink' : 'text-ink-faint hover:text-ink'}`}
                    onClick={() => onToggleImpossible(index)}
                  >
                    <Ban aria-hidden className="size-4" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
