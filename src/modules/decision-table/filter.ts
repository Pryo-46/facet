import type { Condition, Outcome, Row } from '@/types/decision-table'

/**
 * 表本体の絞り込み。**列ごとに「出すラベルの集合」を持つ。**
 *
 * **鍵に入っていない列は絞り込まない。** 全ラベルを選んだ状態と
 * 「まだ触っていない」状態を同じ形にすると、あとで値を1つ足したときに
 * 新しい値だけが隠れる。
 *
 * **鍵は条件・結果の `id` である。** 位置で持つと、並び替えたときに
 * 別の列の絞り込みを引き継ぐ。ID が重複しているファイルでは2列が同じ絞り込みを
 * 共有する。`duplicate-id` が赤で出すのは条件どうし・結果どうしの重複だけなので、
 * 条件と結果が同じ ID を持つ組み合わせは赤にならないまま共有する
 */
export interface GridFilter {
  /**
   * ID → 出すラベル。**鍵の無い列は絞り込まない。** 空の配列は「1つも出さない」
   * 指定であり、鍵が無いのとは違う
   */
  values: Readonly<Record<string, readonly string[]>>
  /** 起こりえない行を出すか */
  showImpossible: boolean
}

/** 触っていない絞り込み。**起こりえないは出す**——隠すのは人が選んだときだけ */
export const EMPTY_FILTER: GridFilter = { values: {}, showImpossible: true }

/**
 * 絞り込みが掛かっているか。額縁への報告と「N / M 行」の表示に使う。
 *
 * **起こりえないを隠すだけでも掛かっている。** 行が減る以上、額縁から見れば
 * 絞り込みである
 */
export function isFiltered(filter: GridFilter): boolean {
  return !filter.showImpossible || Object.keys(filter.values).length > 0
}

/**
 * 結果列が取りうる値の一覧。**先頭は空文字で、画面では未記入や「空にする」と書く**
 *——空欄は欠落であり、一覧から外すと抜けだけを取り出せなくなる
 */
export function outcomeFilterLabels(outcome: Outcome): string[] {
  return ['', ...outcome.choices]
}

/**
 * 絞り込みを、いまの条件・結果に合わせて刈り込む。**絞り込みは、指している
 * データより長く残る状態である**——列を消してもラベルを書き換えても、鍵と
 * ラベルは触られないまま残る。
 *
 * 落とすのは3つ。消えた列の鍵、その列に無くなったラベル、そして列の全ラベルを
 * 覆う鍵である。**覆う鍵を残すと `isFiltered` が嘘をつく。**
 *
 * **空の選択は2通りあり、扱いが違う。** 人が全部のチェックを外した空集合は
 * 「1行も出さない」指定なのでそのまま残す。刈り込みでラベルが消えた結果の
 * 空集合は指す値を失っているので、鍵ごと落とす
 *
 * **ラベルの書き換えはここでは追えない。** 旧ラベルと新ラベルの対応を知るのは
 * 書き換えた側だけで、ここから見ると旧ラベルが消えて新ラベルが増えたようにしか
 * 見えない。追従は呼び出し側が行う。
 *
 * **変わらないときは同じ参照を返す。** 描画のたびに新しいオブジェクトを返すと、
 * これを state へ書き戻す経路が無限に回る
 */
export function reconcileFilter(
  conditions: readonly Condition[],
  outcomes: readonly Outcome[],
  filter: GridFilter,
): GridFilter {
  const labelsById = new Map<string, readonly string[]>()
  // 条件と結果が同じ ID を持つファイルでは、両方のラベルを足した一覧で判定する。
  // 片方だけで判定すると、共有された絞り込みのうち他方のラベルを落としてしまう
  const add = (id: string, labels: readonly string[]): void => {
    const known = labelsById.get(id)
    labelsById.set(id, known === undefined ? labels : [...known, ...labels])
  }
  conditions.forEach((c) => add(c.id, c.values))
  outcomes.forEach((o) => add(o.id, outcomeFilterLabels(o)))

  const values: Record<string, readonly string[]> = {}
  let changed = false
  for (const [id, picked] of Object.entries(filter.values)) {
    const labels = labelsById.get(id)
    if (labels === undefined) {
      changed = true
      continue
    }
    const next = picked.filter((label) => labels.includes(label))
    if (picked.length === 0) {
      values[id] = picked
      continue
    }
    const nextSet = new Set(next)
    if (next.length === 0 || labels.every((label) => nextSet.has(label))) {
      changed = true
      continue
    }
    if (next.length !== picked.length) changed = true
    values[id] = next.length === picked.length ? picked : next
  }
  return changed ? { ...filter, values } : filter
}

/**
 * 表示する行の「元配列での index」を配列順のまま返す。
 *
 * **列の中は OR、列どうしは AND。** 1つの列で複数のラベルを選ぶのは
 * 「どれかに当たる行」を見る操作で、列をまたぐ選択は絞り込みを重ねる操作である。
 *
 * **知らない鍵は読み飛ばす。** 条件を消しても絞り込みの鍵は残るので、
 * 読み飛ばさないと、画面から消えた列のせいで行が出ない状態になる
 */
export function filterRowIndices(
  conditions: readonly Condition[],
  outcomes: readonly Outcome[],
  rows: readonly Row[],
  filter: GridFilter,
): number[] {
  const columns: { at: number; from: 'values' | 'results'; picked: ReadonlySet<string> }[] = []
  conditions.forEach((c, i) => {
    const picked = filter.values[c.id]
    if (picked !== undefined) columns.push({ at: i, from: 'values', picked: new Set(picked) })
  })
  outcomes.forEach((o, j) => {
    const picked = filter.values[o.id]
    if (picked !== undefined) columns.push({ at: j, from: 'results', picked: new Set(picked) })
  })
  const out: number[] = []
  rows.forEach((row, index) => {
    if (row.impossible && !filter.showImpossible) return
    for (const column of columns) {
      const label = (column.from === 'values' ? row.values : row.results)[column.at] ?? ''
      if (!column.picked.has(label)) return
    }
    out.push(index)
  })
  return out
}

/**
 * 1つのラベルの入り切り。**`all` を渡すのは、触っていない列が「全部出す」だから**
 *——そこから1つ外すには、残りを選んだ形へ展開する必要がある。
 *
 * **選び直して全部揃ったら鍵ごと消す。** 残すと `isFiltered` が真のままになり、
 * 絞り込んでいないのに額縁へ絞り込みを報告する
 */
export function toggleFilterValue(
  filter: GridFilter,
  id: string,
  label: string,
  all: readonly string[],
): GridFilter {
  const current = filter.values[id] ?? all
  const has = current.includes(label)
  // 並びは `all` の順に保つ。押すたびに一覧の順が変わると、メニューのチェックが動いて見える
  const next = all.filter((v) => (v === label ? !has : current.includes(v)))
  const values = { ...filter.values }
  if (next.length === all.length) delete values[id]
  else values[id] = next
  return { ...filter, values }
}

/** 1つの列の絞り込みを外す。他の列は触らない */
export function clearFilterValue(filter: GridFilter, id: string): GridFilter {
  const values = { ...filter.values }
  delete values[id]
  return { ...filter, values }
}
