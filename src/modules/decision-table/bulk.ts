import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'

/**
 * まとめて入力の適用先。**1回に1つ。** 結果と起こりえないを同時に書くと、
 * 1手の Undo で何が戻るのかを人が予測できない
 */
export type BulkTarget =
  | { kind: 'result'; outcomeIndex: number; value: string }
  | { kind: 'impossible'; on: boolean }

export interface BulkResult {
  data: DecisionTableSchemaVersion1
  /**
   * 実際に値が変わった行の数。**ボタンに出す対象行数とは分母が違う**
   *——対象は絞り込みが出している行、これはそのうち値が動いた行である
   */
  changed: number
}

/**
 * 絞り込んだ行へまとめて書き込む。**上書きは常に行い、確認を挟まない**
 *——Undo で1手として戻せるので、確認は打鍵を増やすだけになる。
 *
 * **結果は起こりえない行へ書かない。** 起こりえないはその組み合わせが
 * 起こらないことを表すので、結果を持たない。対象を表示中の行だけで決めると、
 * 人が目印として付けた起こりえないを一括で塗り潰す。
 * 起こりえないの入り切りは対象の全行に効く。
 *
 * **1行も変わらないときは元のデータをそのまま返す。** 新しい参照を返すと、
 * 何も起きていない1手が Undo 履歴に積まれる
 */
export function applyBulk(
  data: DecisionTableSchemaVersion1,
  targets: readonly number[],
  target: BulkTarget,
): BulkResult {
  // 結果を消した直後の描画は古い添字を持ちうる。行の配列の形を壊さないよう先に止める
  if (target.kind === 'result' && data.outcomes[target.outcomeIndex] === undefined) {
    return { data, changed: 0 }
  }
  const picked = new Set(targets)
  let changed = 0
  const rows = data.rows.map((row, index) => {
    if (!picked.has(index)) return row
    if (target.kind === 'impossible') {
      if (row.impossible === target.on) return row
      changed += 1
      return { ...row, impossible: target.on }
    }
    if (row.impossible) return row
    if ((row.results[target.outcomeIndex] ?? '') === target.value) return row
    changed += 1
    return {
      ...row,
      results: row.results.map((v, j) => (j === target.outcomeIndex ? target.value : v)),
    }
  })
  return changed === 0 ? { data, changed: 0 } : { data: { ...data, rows }, changed }
}
