import type { Condition, Outcome, Row } from '@/types/decision-table'

/*
 * **このファイルは `npm run gen:skills` が `.mjs` へ変換し、
 * plugins/facet/skills/write-decision-table/scripts/generated/rows.mjs として
 * 登録 Skill へ同梱される。** だから値 import・相対 import・enum を持たない
 * ——`transpileModule` は import を解決しないので、値 import があると
 * 置いた先で解決できなくなる。制約と出力の一致は scripts/gen-skills.test.mjs が検知する
 */

/**
 * 行数の上限。2値の条件なら10本、3値なら6本まで立てられる。
 *
 * **直積は値を1つ足すごとに、その条件の値の本数の比で膨らむ。** 上限が無いと、
 * ボタン1回で数万行の DOM を作って画面が固まる。歯止めは値を足す側だけに置く
 * （`DecisionTableEditor` の `canAddValue`）——条件を1本足しても値は1つなので
 * 直積は増えず、上限には掛からない
 */
export const MAX_ROWS = 1024

/**
 * 行の鍵。**値の組み合わせから作り、添字を使わない**——絞り込みの報告は
 * `useEffect` を通るので1フレーム古くなりうる。条件の値を1つ消すと直積が縮み、
 * 同じ添字が別の組み合わせを指す。組み合わせを鍵にすれば、消えた組み合わせの
 * 鍵はどの行にも一致せず落ちるだけで済む。
 *
 * **`JSON.stringify` を使うのは区切りと衝突しないため。** 額縁への報告
 * （`useVisibleIdsReport`）は鍵を NUL 文字で連結するので、鍵そのものに
 * 生の制御文字が現れてはならない。素朴な連結では
 * `['あ', 'いう']` と `['あい', 'う']` も区別できない。
 *
 * **同じ値ラベルが2件ある表と、行が直積からずれている表では鍵が重複する。**
 * どちらも `duplicate-value` / `row-set` が赤で出している状態である
 */
export function rowKeyOf(row: Row): string {
  return JSON.stringify(row.values)
}

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

export interface AlignResult {
  /** 直積の並びの行。`stray`・`conflicts` があるとき、または `ambiguous` のときは入力の行のまま */
  rows: Row[]
  /** 直積に当てはまらない入力の行の位置（未知の値・`values` か `results` の長さ違い） */
  stray: number[]
  /** 同じ組み合わせで `impossible` か `results` が食い違う、入力の行の位置の組 */
  conflicts: number[][]
  /** 1つの条件に同じ値ラベルが2件あり、ラベルで行を指せない */
  ambiguous: boolean
}

/**
 * 下書きの行を、値ラベルの組み合わせで直積の位置へ引き当てる。欠けた組み合わせは
 * 結果が空の行で補う。登録 Skill の書き出しスクリプトが使う。
 *
 * **引き当てられない行が1つでもあれば、並べ替えずに入力のまま返す。**
 * 当てはまらない行を落とすと、人が決めた結果が黙って消える
 */
export function alignRowsByLabel(
  conditions: readonly Condition[],
  outcomeCount: number,
  rows: readonly Row[],
): AlignResult {
  const asIs = rows.map(copyRow)
  if (conditions.some((c) => new Set(c.values).size !== c.values.length)) {
    return { rows: asIs, stray: [], conflicts: [], ambiguous: true }
  }

  const total = productSize(conditions)
  const stray: number[] = []
  const byKey = new Map<string, number[]>()
  rows.forEach((row, index) => {
    const fits =
      total > 0 &&
      row.values.length === conditions.length &&
      row.results.length === outcomeCount &&
      row.values.every((v, i) => conditions[i].values.includes(v))
    if (!fits) {
      stray.push(index)
      return
    }
    const key = rowKeyOf(row)
    const group = byKey.get(key)
    if (group === undefined) byKey.set(key, [index])
    else group.push(index)
  })

  const aligned: Row[] = []
  const conflicts: number[][] = []
  for (let position = 0; position < total; position++) {
    const indices = valueIndicesAt(conditions, position)
    const values = conditions.map((c, i) => c.values[indices[i]])
    const group = byKey.get(rowKeyOf({ values, impossible: false, results: [] }))
    if (group === undefined) {
      aligned.push({ values, impossible: false, results: Array.from({ length: outcomeCount }, () => '') })
      continue
    }
    const first = rows[group[0]]
    const same = (row: Row): boolean =>
      row.impossible === first.impossible && row.results.every((v, j) => v === first.results[j])
    if (!group.every((i) => same(rows[i]))) conflicts.push(group)
    aligned.push(copyRow(first))
  }

  if (stray.length > 0 || conflicts.length > 0) {
    return { rows: asIs, stray, conflicts, ambiguous: false }
  }
  return { rows: aligned, stray, conflicts, ambiguous: false }
}

function copyRow(row: Row): Row {
  return { values: [...row.values], impossible: row.impossible, results: [...row.results] }
}

interface TableDefinition {
  conditions: readonly Condition[]
  outcomes: readonly Outcome[]
}

/**
 * 定義（条件・値・結果・選択肢）を差し替えた表の行を、旧の行から組み直す。
 * 登録 Skill の書き出しスクリプトが使う。
 *
 * 条件と結果は `id` で対応づける。値と選択肢は、本数が変わらなければ位置で
 * （改名とみなす）、変われば完全一致のラベルで対応づける。
 * **改名と増減を1回に混ぜると、改名した側はラベルで引けず引き継げない。**
 *
 * `lostCells` は旧のセル単位で数える。選択肢を消して空に戻したセルもここに入る
 */
export function rebaseRows(
  base: TableDefinition & { rows: readonly Row[] },
  next: TableDefinition,
): RebuildResult {
  const outcomeFrom = outcomeFromById(base.outcomes, next.outcomes)

  // 選択肢の対応は再構築の前に旧の行へ当てる。再構築の後で当てると、
  // 複製された行ごとに数えてしまい、旧のセル単位で数えられない
  const choiceMaps = base.outcomes.map((o, p) => {
    const j = outcomeFrom.indexOf(p)
    return j < 0 ? null : choiceMap(o.choices, next.outcomes[j].choices)
  })
  let choiceLost = 0
  const prevRows = base.rows.map((row) => ({
    ...row,
    results: row.results.map((value, p) => {
      const to = value === '' ? undefined : choiceMaps[p]?.get(value)
      if (to === undefined) return value
      if (to === '') choiceLost += 1
      return to
    }),
  }))

  const built = rebuildRows(
    base.conditions,
    prevRows,
    next.conditions,
    axesByDefinition(base.conditions, next.conditions),
    outcomeFrom,
  )
  return { ...built, lostCells: built.lostCells + choiceLost }
}

/** 値の対応づけ。本数が同じなら位置、違えば一意に引けるラベル */
function axesByDefinition(prev: readonly Condition[], next: readonly Condition[]): Axis[] {
  return next.map((c) => {
    const from = prev.findIndex((p) => p.id === c.id)
    if (from < 0) return { from: null, valueFrom: [] }
    const old = prev[from].values
    if (old.length === c.values.length) return { from, valueFrom: old.map((_, v) => v) }
    return {
      from,
      valueFrom: c.values.map((label) => {
        const at = old.indexOf(label)
        return at >= 0 && old.lastIndexOf(label) === at ? at : null
      }),
    }
  })
}

/** 旧の選択肢ラベル → 新しいラベル。空文字は「消えた」。本数が同じなら位置で改名とみなす */
function choiceMap(prev: readonly string[], next: readonly string[]): Map<string, string> {
  const map = new Map<string, string>()
  prev.forEach((label, k) => {
    if (map.has(label)) return
    if (prev.length === next.length) map.set(label, next[k])
    else map.set(label, next.includes(label) ? label : '')
  })
  return map
}
