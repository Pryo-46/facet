import { UNDEFINED_TEXT } from '@/core/output-labels'
import type { Table, TableOptions, VisibleRows } from '@/core/table-export'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import { IMPOSSIBLE_LABEL, NO_COLUMN_LABEL } from './labels'
import { rowKeyOf } from './rows'

/**
 * 判定表（モジュール規約8）。Markdown 出力の `### 判定表` もこの関数から作る。
 *
 * **列は画面の表本体と同じ並びで、No・条件列・結果列の順。** 右端の起こりえないの
 * トグル列は出さず、起こりえない行は結果列に `IMPOSSIBLE_LABEL` を書いて示す。
 * 画面の結果セルと同じく、記入済みの結果が残っていても起こりえないが勝つ。
 *
 * **No は行の配列位置（`index + 1`）で、`visible` で絞っても振り直さない。**
 * No は行の呼び名（`#N`）であり、振り直すと貼った表と画面で同じ行を別の番号で呼ぶ。
 *
 * **`visible` は `rowKeyOf` で引く。** エディタが額縁へ報告する鍵と同じ関数である。
 * 別の作り方で鍵を組むとどの行とも一致せず、絞り込んだコピーが黙って空になる。
 * 同じ値の組み合わせの行が2本ある表では、片方だけ隠れていても両方出る——
 * その表は `row-set` か `duplicate-value` が赤で出している。
 *
 * **列数は条件と結果の本数で決め、行の配列の長さに合わせない。** `Table` は
 * header と rows の列数が揃っていることを要求する。`row-length` の行は、
 * 足りない欄を空として扱い、余った欄を落とす
 */
export function decisionTableToTable(
  data: DecisionTableSchemaVersion1,
  options: TableOptions,
  visible?: VisibleRows,
): Table {
  const text = (raw: string): string =>
    options.showUndefined && raw === '' ? UNDEFINED_TEXT : raw
  const header = [
    ...(options.numbering ? [NO_COLUMN_LABEL] : []),
    ...data.conditions.map((c) => text(c.name)),
    ...data.outcomes.map((o) => text(o.name)),
  ]
  const rows: string[][] = []
  data.rows.forEach((row, index) => {
    if (visible != null && !visible.has(rowKeyOf(row))) return
    rows.push([
      ...(options.numbering ? [String(index + 1)] : []),
      ...data.conditions.map((_, i) => text(row.values[i] ?? '')),
      ...data.outcomes.map((_, j) =>
        row.impossible ? IMPOSSIBLE_LABEL : text(row.results[j] ?? ''),
      ),
    ])
  })
  return { header, rows }
}
