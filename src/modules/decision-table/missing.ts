import type { MissingTally } from '@/core/missing-tally'
import type { DecisionTableSchemaVersion1, Row } from '@/types/decision-table'

/** 帯のチップの鍵。ジャンプ先の区画がこれで決まる */
export const RESULT_KIND = 'result'
export const LABEL_KIND = 'label'

/**
 * 結果セルの欠落判定（docs/missing-semantics.md 決定1）。
 *
 * **`impossible` の行は数えない。** 起こりえない組み合わせに結果を求めると、
 * 永遠に埋まらない欠落が残る
 */
export function isMissingResult(row: Row, outcomeIndex: number): boolean {
  if (row.impossible) return false
  return (row.results[outcomeIndex] ?? '') === ''
}

/** 条件名・値ラベル・結果名・選択肢ラベルの欠落判定 */
export function isMissingLabel(text: string): boolean {
  return text === ''
}

/**
 * 帯の集計。**判定関数と同じファイルに置く**ので、画面に面が付く箇所と
 * 数える箇所が同じ関数から出る（規約4）
 */
export function tallyMissing(data: DecisionTableSchemaVersion1): MissingTally {
  let result = 0
  for (const row of data.rows) {
    for (let j = 0; j < data.outcomes.length; j++) {
      if (isMissingResult(row, j)) result += 1
    }
  }
  let label = 0
  for (const c of data.conditions) {
    if (isMissingLabel(c.name)) label += 1
    for (const v of c.values) if (isMissingLabel(v)) label += 1
  }
  for (const o of data.outcomes) {
    if (isMissingLabel(o.name)) label += 1
    for (const c of o.choices) if (isMissingLabel(c)) label += 1
  }
  const parts = [
    { kind: RESULT_KIND, label: '未記入', count: result, variant: 'open' as const },
    { kind: LABEL_KIND, label: '名前なし', count: label, variant: 'open' as const },
  ].filter((p) => p.count > 0)
  return { total: result + label, parts }
}
