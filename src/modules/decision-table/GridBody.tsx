import { CellSelect } from '@/components/CellSelect'
import { cellFace, CELL_FACE_CLASS, type ErrorMarks } from '@/core/list-editor/cell-face'
import { cellId } from '@/core/list-editor/use-list-rows'
import type { Condition, Outcome, Row } from '@/types/decision-table'
import { CLEAR_RESULT_LABEL, IMPOSSIBLE_LABEL } from './labels'
import { isMissingResult } from './missing'

/**
 * セルの入力欄。**全ツール共通の見た目だが、コアに定数の置き場が無い**ので
 * モジュールごとに同じ文字列を持つ（`DefinitionList.tsx` の同名定数と同じ）
 */
const cellInput =
  'w-full resize-none overflow-y-auto bg-transparent px-2 py-1 text-ink outline-none rounded-sm align-middle focus:ring-2 focus:ring-inset focus:ring-ring'

/**
 * 結果列の境界の縦罫。**条件列には引かない**——条件は読み取り専用、結果は
 * 操作対象なので、罫線で2つの区画を分ける
 */
const colBorder = 'border-l border-l-rule-muted'
const headColBorder = 'border-l border-l-rule'

const headCell =
  'sticky top-0 z-10 border-b border-b-rule bg-surface-muted px-2 py-1 text-base font-medium tracking-wide text-ink-muted'

export interface GridBodyProps {
  conditions: readonly Condition[]
  outcomes: readonly Outcome[]
  rows: readonly Row[]
  marks: ErrorMarks
  /** 行の鍵。行は ID を持たないので、呼び出し側が位置から作る */
  gridRowKey: (index: number) => string
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
 * 「起こりえない」を表示するボタンにする——押すと解除する（立てる入口は
 * マウスに無く、主修飾キー＋Enter だけが持つ）
 */
export function GridBody(props: GridBodyProps) {
  const { conditions, outcomes, rows, marks, gridRowKey, onPickResult, onToggleImpossible, onCellKeyDown } = props

  const face = (index: number, field: string, warn: boolean, rowAnchor = false): string =>
    CELL_FACE_CLASS[cellFace(marks, index, field, warn, rowAnchor)]

  return (
    <div className="border border-rule bg-surface">
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
        </colgroup>
        <thead>
          <tr className="text-left">
            <th className={`${headCell} text-right`}>No</th>
            {conditions.map((c, i) => (
              <th key={`cond-${i}`} className={headCell}>
                {c.name}
              </th>
            ))}
            {outcomes.map((o, j) => (
              <th key={`out-${j}`} className={`${headCell} ${headColBorder}`}>
                {o.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowNo = index + 1
            const rowKey = gridRowKey(index)
            return (
              <tr key={rowKey} className="border-b border-rule-muted align-middle">
                {/* 行全体の指摘（行の列数不一致など欄を特定できないもの）は No セルの面で示す */}
                <td className={`px-2 py-1 text-right text-ink-muted ${face(index, 'no', false, true)}`}>
                  {rowNo}
                </td>
                {conditions.map((_, i) => (
                  <td key={`cond-${i}`} className="px-2 py-1 text-ink-muted">
                    {row.values[i]}
                  </td>
                ))}
                {outcomes.map((outcome, j) => {
                  const field = `result:${j}`
                  const cellClass = `${colBorder} ${face(index, field, isMissingResult(row, j))}`
                  if (row.impossible) {
                    return (
                      <td key={`out-${j}`} className={cellClass}>
                        {/* impossible の行のセル。押すと起こりえないを解除する */}
                        <button
                          type="button"
                          data-cell={cellId(rowKey, field)}
                          aria-label={`${outcome.name}（${rowNo}行目）: ${IMPOSSIBLE_LABEL}`}
                          className={`${cellInput} text-left text-ink-muted`}
                          onClick={() => onToggleImpossible(index)}
                          onKeyDown={(e) => onCellKeyDown(e, { index, field })}
                        >
                          {IMPOSSIBLE_LABEL}
                        </button>
                      </td>
                    )
                  }
                  return (
                    <td key={`out-${j}`} className={`relative ${cellClass}`}>
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
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
