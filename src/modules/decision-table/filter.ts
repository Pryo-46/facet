import type { Condition, Outcome, Row } from '@/types/decision-table'

/**
 * 表本体の絞り込み。**列ごとに「出すラベルの集合」を持つ。**
 *
 * **鍵に入っていない列は絞り込まない。** 全ラベルを選んだ状態と
 * 「まだ触っていない」状態を同じ形にすると、あとで値を1つ足したときに
 * 新しい値だけが隠れる。
 *
 * **鍵は条件・結果の `id` である。** 位置で持つと、並び替えたときに
 * 別の列の絞り込みを引き継ぐ。ID が重複しているファイルでは2列が同じ
 * 絞り込みを共有するが、その状態は `duplicate-id` が赤で出している
 */
export interface GridFilter {
  /** ID → 出すラベル。空の配列は「1つも出さない」であり、鍵が無いのとは違う */
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

/** 結果列の絞り込みに並べるラベル。**先頭は空文字で、画面では未記入と書く** */
export function outcomeFilterLabels(outcome: Outcome): string[] {
  return ['', ...outcome.choices]
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
