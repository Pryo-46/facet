import type { Condition, Row } from '@/types/decision-table'

/**
 * 行数の上限。2値の条件なら10本、3値なら6本まで立てられる。
 *
 * **直積は条件を1つ足すごとに倍以上になる。** 上限が無いと、ボタン1回で
 * 数万行の DOM を作って画面が固まる。上限に達したら定義部の追加ボタンを
 * 押せなくする（`DecisionTableEditor`）
 */
export const MAX_ROWS = 1024

/**
 * 条件の値の直積の行数。**条件が0本なら0とする。**
 * 数学的な直積は空タプル1本だが、条件を立てる前の表に行を出しても人が埋めるものが無い
 */
export function productSize(conditions: readonly Condition[]): number {
  if (conditions.length === 0) return 0
  return conditions.reduce((n, c) => n * c.values.length, 1)
}

/**
 * 直積の位置 → 条件ごとの値の添字。**左端の条件が最もゆっくり回る**ので、
 * 右端から順に剰余を取る。
 *
 * **`productSize` が0のときに呼ばない。** 値を持たない条件があると
 * 0 で割ることになる。呼び出し側は `position < productSize(conditions)` を守る
 */
export function valueIndicesAt(conditions: readonly Condition[], position: number): number[] {
  const out: number[] = []
  let rest = position
  for (let i = conditions.length - 1; i >= 0; i--) {
    const n = conditions[i].values.length
    out[i] = rest % n
    rest = Math.floor(rest / n)
  }
  return out
}

/**
 * 新しい条件1本の引き継ぎ元。
 *
 * `from` が null のときは旧に対応が無いので、その軸は制約を置かない
 *（＝旧の1行が新しい複数行へ複製される）。`from` がある軸で
 * `valueFrom[v]` が null のときは、その値に引き継ぐ元が無い（＝空から始まる）
 */
export interface Axis {
  /** 旧 conditions の添字。null＝新しく足した条件 */
  from: number | null
  /** 新しい値の添字 → 旧の値の添字。null＝新しく足した値。`from` が null なら読まない */
  valueFrom: readonly (number | null)[]
}

export interface RebuildResult {
  rows: Row[]
  /** まとまった行で値が食い違い、空欄に落ちた結果セルの数 */
  clearedCells: number
  /** 記入済みだったのに新しい表に残らない結果セルの数。`clearedCells` の分を含む */
  lostCells: number
}

/** 値の増減が無いときの対応づけ。条件も値もその位置のまま引き継ぐ */
export function identityAxes(conditions: readonly Condition[]): Axis[] {
  return conditions.map((c, i) => ({ from: i, valueFrom: c.values.map((_, v) => v) }))
}

/**
 * 条件の追加・削除・並び替えの対応づけ。**値の増減はこの関数では表せない**
 *（ラベルからは「消した」と「書き換えた」を見分けられない）ので、
 * 値を触る操作は `Axis` を自分で組み立てる。
 *
 * **ID が重複していると先頭の1件に引き当たる。** 重複は整合性検証が赤で出す
 */
export function axesById(prev: readonly Condition[], next: readonly Condition[]): Axis[] {
  return next.map((c) => {
    const from = prev.findIndex((p) => p.id === c.id)
    return from < 0
      ? { from: null, valueFrom: [] }
      : { from, valueFrom: prev[from].values.map((_, v) => v) }
  })
}

/** 結果の追加・削除・並び替えの対応づけ。null＝新しく足した結果 */
export function outcomeFromById(
  prev: readonly { id: string }[],
  next: readonly { id: string }[],
): (number | null)[] {
  return next.map((o) => {
    const from = prev.findIndex((p) => p.id === o.id)
    return from < 0 ? null : from
  })
}

/** 全要素が同じ値ならその値、違えば null。空の配列も null */
function agreed<T>(values: readonly T[]): T | null {
  if (values.length === 0) return null
  const first = values[0]
  return values.every((v) => v === first) ? first : null
}

/**
 * 新しい行1つに対応する、旧の行の位置。
 *
 * 制約を置かない旧の軸（消した条件）は全ての値を走査するので、
 * 戻り値が2件以上になる＝行がまとまる＝結果が食い違いうる
 */
function sourceRows(
  prevConditions: readonly Condition[],
  prevRows: readonly Row[],
  axes: readonly Axis[],
  indices: readonly number[],
): number[] {
  const pin: (number | null)[] = prevConditions.map(() => null)
  for (let a = 0; a < axes.length; a++) {
    const axis = axes[a]
    if (axis.from === null) continue
    const pv = axis.valueFrom[indices[a]]
    if (pv === null || pv === undefined) return []
    pin[axis.from] = pv
  }
  let positions: number[] = [0]
  for (let i = 0; i < prevConditions.length; i++) {
    const n = prevConditions[i].values.length
    const fixed = pin[i]
    const next: number[] = []
    for (const base of positions) {
      if (fixed === null) {
        for (let v = 0; v < n; v++) next.push(base * n + v)
      } else {
        next.push(base * n + fixed)
      }
    }
    positions = next
  }
  // 旧の行が直積になっていないファイルでは、位置に行が無いことがある
  return positions.filter((p) => prevRows[p] !== undefined)
}

/**
 * 行の集合を直積へ整え直し、既存の結果を座標で引き継ぐ。
 *
 * **旧の行は「旧の直積での位置」で引く。** ラベルで引くと、値のラベルが
 * 重複しているファイルでどの行を指しているか決められない。位置で引く形は
 * 直積になっていないファイルを整え直す経路も兼ねる
 */
export function rebuildRows(
  prevConditions: readonly Condition[],
  prevRows: readonly Row[],
  nextConditions: readonly Condition[],
  axes: readonly Axis[],
  outcomeFrom: readonly (number | null)[],
): RebuildResult {
  const total = productSize(nextConditions)
  const rows: Row[] = []
  let clearedCells = 0
  /** 新しい表へ持ち越せた、旧の（行の位置, 結果の添字）の組 */
  const survived = new Set<string>()

  for (let position = 0; position < total; position++) {
    const indices = valueIndicesAt(nextConditions, position)
    const values = nextConditions.map((c, i) => c.values[indices[i]])
    const sources = sourceRows(prevConditions, prevRows, axes, indices)
    const results: string[] = []
    for (let j = 0; j < outcomeFrom.length; j++) {
      const pj = outcomeFrom[j]
      if (pj === null || sources.length === 0) {
        results.push('')
        continue
      }
      const picked = agreed(sources.map((s) => prevRows[s].results[pj] ?? ''))
      if (picked === null) {
        results.push('')
        clearedCells += 1
        continue
      }
      results.push(picked)
      if (picked !== '') for (const s of sources) survived.add(`${s}:${pj}`)
    }
    const impossible = agreed(sources.map((s) => prevRows[s].impossible)) ?? false
    rows.push({ values, impossible, results })
  }

  let filled = 0
  for (const prev of prevRows) {
    for (const value of prev.results) if (value !== '') filled += 1
  }
  return { rows, clearedCells, lostCells: filled - survived.size }
}
