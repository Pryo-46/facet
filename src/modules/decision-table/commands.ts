import { newId } from '@/core/new-id'
import type { Condition, DecisionTableSchemaVersion1, Outcome } from '@/types/decision-table'
import {
  axesById,
  identityAxes,
  outcomeFromById,
  rebuildRows,
  type Axis,
} from './rows'

/**
 * 定義部の編集の結果。**画面はこの3つ組しか受け取らない**ので、
 * 行を直積へ整え忘れた経路が生まれない。
 *
 * `lostCells` が0でないとき、画面は要素を減らす操作に限って確認を挟む
 */
export interface Applied {
  data: DecisionTableSchemaVersion1
  /** まとまった行で値が食い違い、空欄に落ちた結果セルの数 */
  clearedCells: number
  /** 記入済みだったのに新しい表に残らない結果セルの数 */
  lostCells: number
}

/**
 * 新しい条件。**値は空1つから始める。** 人が決めていない値を既定で入れると、
 * 決めた値と見分けが付かない。本数も同じで、2つ置くと「2つに分かれる条件」を
 * 決めたように見える
 */
export function newCondition(): Condition {
  return { id: newId('cond'), name: '', values: [''] }
}

/**
 * 新しい結果。**選択肢は空から始める。** 結果が取りうる値に一般の既定は無く、
 * 決めるまで表本体のセルは埋められない
 */
export function newOutcome(): Outcome {
  return { id: newId('out'), name: '', choices: [] }
}

function apply(
  data: DecisionTableSchemaVersion1,
  conditions: Condition[],
  outcomes: Outcome[],
  axes: readonly Axis[],
  outcomeFrom: readonly (number | null)[],
): Applied {
  const built = rebuildRows(data.conditions, data.rows, conditions, axes, outcomeFrom)
  return {
    data: { ...data, conditions, outcomes, rows: built.rows },
    clearedCells: built.clearedCells,
    lostCells: built.lostCells,
  }
}

/**
 * 条件の追加・削除・並び替え。対応づけは `id` で行う。
 *
 * **値の増減をこの関数に渡さないこと。** 対応づけが値の位置を同じとみなすので、
 * 値が増減した配列を渡すと引き継ぎ先が1つずつずれる
 */
export function setConditions(
  data: DecisionTableSchemaVersion1,
  next: readonly Condition[],
): Applied {
  return apply(
    data,
    [...next],
    data.outcomes,
    axesById(data.conditions, next),
    data.outcomes.map((_, j) => j),
  )
}

/** 結果の追加・削除・並び替え。対応づけは `id` で行う */
export function setOutcomes(
  data: DecisionTableSchemaVersion1,
  next: readonly Outcome[],
): Applied {
  return apply(
    data,
    data.conditions,
    [...next],
    identityAxes(data.conditions),
    outcomeFromById(data.outcomes, next),
  )
}

/** 条件名。行は条件名を持たないので書き換えない */
export function renameCondition(
  data: DecisionTableSchemaVersion1,
  index: number,
  name: string,
): Applied {
  const conditions = data.conditions.map((c, i) => (i === index ? { ...c, name } : c))
  return { data: { ...data, conditions }, clearedCells: 0, lostCells: 0 }
}

/** 結果名。行は結果名を持たないので書き換えない */
export function renameOutcome(
  data: DecisionTableSchemaVersion1,
  index: number,
  name: string,
): Applied {
  const outcomes = data.outcomes.map((o, i) => (i === index ? { ...o, name } : o))
  return { data: { ...data, outcomes }, clearedCells: 0, lostCells: 0 }
}

export function addValue(data: DecisionTableSchemaVersion1, condIndex: number): Applied {
  const target = data.conditions[condIndex]
  const conditions = data.conditions.map((c, i) =>
    i === condIndex ? { ...c, values: [...c.values, ''] } : c,
  )
  const axes = identityAxes(data.conditions)
  axes[condIndex] = { from: condIndex, valueFrom: [...target.values.map((_, v) => v), null] }
  return apply(data, conditions, data.outcomes, axes, data.outcomes.map((_, j) => j))
}

/**
 * 値を1つ消す。**最後の1つは消せない。** 値が0本になると直積が空になり、
 * 条件ごと消したのと画面上で見分けが付かなくなる
 */
export function removeValue(
  data: DecisionTableSchemaVersion1,
  condIndex: number,
  valueIndex: number,
): Applied {
  const target = data.conditions[condIndex]
  if (target.values.length <= 1) return { data, clearedCells: 0, lostCells: 0 }
  const conditions = data.conditions.map((c, i) =>
    i === condIndex ? { ...c, values: c.values.filter((_, v) => v !== valueIndex) } : c,
  )
  const axes = identityAxes(data.conditions)
  axes[condIndex] = {
    from: condIndex,
    valueFrom: target.values.map((_, v) => v).filter((v) => v !== valueIndex),
  }
  return apply(data, conditions, data.outcomes, axes, data.outcomes.map((_, j) => j))
}

/**
 * 値のラベルを書き換える。行がラベルを直接持つので、再構築を通して全行を書き直す。
 * 位置で引き継ぐため、同じラベルが2件あっても引き継ぎ先は決まる
 */
export function renameValue(
  data: DecisionTableSchemaVersion1,
  condIndex: number,
  valueIndex: number,
  label: string,
): Applied {
  const conditions = data.conditions.map((c, i) =>
    i === condIndex ? { ...c, values: c.values.map((v, k) => (k === valueIndex ? label : v)) } : c,
  )
  return apply(
    data,
    conditions,
    data.outcomes,
    identityAxes(data.conditions),
    data.outcomes.map((_, j) => j),
  )
}

export function addChoice(data: DecisionTableSchemaVersion1, outIndex: number): Applied {
  const outcomes = data.outcomes.map((o, i) =>
    i === outIndex ? { ...o, choices: [...o.choices, ''] } : o,
  )
  return { data: { ...data, outcomes }, clearedCells: 0, lostCells: 0 }
}

/**
 * 選択肢を1つ消し、その選択肢を選んでいた結果セルを空へ戻す。
 *
 * **同じラベルの選択肢が2件あると、残る側を選んだ行も空に戻る。**
 * 結果セルはラベルで選択肢を指すので、重複したラベルからは行を選り分けられない
 */
export function removeChoice(
  data: DecisionTableSchemaVersion1,
  outIndex: number,
  choiceIndex: number,
): Applied {
  const removed = data.outcomes[outIndex].choices[choiceIndex]
  const outcomes = data.outcomes.map((o, i) =>
    i === outIndex ? { ...o, choices: o.choices.filter((_, k) => k !== choiceIndex) } : o,
  )
  let lostCells = 0
  const rows = data.rows.map((row) => {
    if (row.results[outIndex] !== removed) return row
    if (removed !== '') lostCells += 1
    return { ...row, results: row.results.map((v, j) => (j === outIndex ? '' : v)) }
  })
  return { data: { ...data, outcomes, rows }, clearedCells: 0, lostCells }
}

/**
 * 選択肢のラベルを書き換え、その選択肢を選んでいた結果セルも追従させる。
 *
 * **同じラベルの選択肢が2件あると、両方を選んだ行が同じ新しいラベルになる**
 *（`removeChoice` と同じ理由）
 */
export function renameChoice(
  data: DecisionTableSchemaVersion1,
  outIndex: number,
  choiceIndex: number,
  label: string,
): Applied {
  const old = data.outcomes[outIndex].choices[choiceIndex]
  const outcomes = data.outcomes.map((o, i) =>
    i === outIndex ? { ...o, choices: o.choices.map((c, k) => (k === choiceIndex ? label : c)) } : o,
  )
  const rows = data.rows.map((row) =>
    row.results[outIndex] === old
      ? { ...row, results: row.results.map((v, j) => (j === outIndex ? label : v)) }
      : row,
  )
  return { data: { ...data, outcomes, rows }, clearedCells: 0, lostCells: 0 }
}

/** 表本体の結果セル。行の集合は変わらない */
export function setResult(
  data: DecisionTableSchemaVersion1,
  rowIndex: number,
  outIndex: number,
  value: string,
): DecisionTableSchemaVersion1 {
  const rows = data.rows.map((row, i) =>
    i === rowIndex ? { ...row, results: row.results.map((v, j) => (j === outIndex ? value : v)) } : row,
  )
  return { ...data, rows }
}

/**
 * 起こりえないの入り切り。**結果の値は消さない**ので、戻せば元の値が見える
 *（シーケンスの考慮不要が答えの本文を消さないのと同じ扱い）
 */
export function toggleImpossible(
  data: DecisionTableSchemaVersion1,
  rowIndex: number,
): DecisionTableSchemaVersion1 {
  const rows = data.rows.map((row, i) =>
    i === rowIndex ? { ...row, impossible: !row.impossible } : row,
  )
  return { ...data, rows }
}
