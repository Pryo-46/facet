import type { GlossaryField } from './fields'

/**
 * 用語テーブルの列（M8 決定1）。
 *
 * **`defaultWidth` が null の列は幅を持たず、残りを埋める。** 定義列だけが
 * これに当たる。他4列が px を持ち定義が残りを取るので、テーブルは常に親幅に
 * 収まり横スクロールが出ない。「定義を広げたい」は他の列を狭めることで達成される。
 * 窓を狭めたときも定義列が縮んで吸収する
 */
export interface ColumnSpec {
  field: GlossaryField
  defaultWidth: number | null
}

export const COLUMNS: readonly ColumnSpec[] = [
  { field: 'name', defaultWidth: 176 },
  { field: 'kind', defaultWidth: 128 },
  { field: 'definition', defaultWidth: null },
  { field: 'aliases', defaultWidth: 176 },
  // 備考は自由記述で長くなりやすいので、名称・別名より広く取る（M7 の要望7）
  { field: 'notes', defaultWidth: 256 },
]

/**
 * COLUMNS の添字 → 幅配列の添字。幅を持たない列は null。
 *
 * **幅配列は固定幅を持つ列だけを並び順で持つ**ので、COLUMNS の添字とは
 * 一致しない。対応をここ1箇所に閉じ、コンポーネント側で添字を計算しない
 */
export const WIDTH_INDEX: readonly (number | null)[] = (() => {
  let n = 0
  return COLUMNS.map((c) => (c.defaultWidth === null ? null : n++))
})()

/** 固定幅を持つ列の既定幅（並び順）。列幅 store の初期値になる */
export const DEFAULT_WIDTHS: readonly number[] = COLUMNS.flatMap((c) =>
  c.defaultWidth === null ? [] : [c.defaultWidth],
)

/**
 * `i` より後ろで最初に幅を持つ列の、幅配列上の添字を返す。無ければ null。
 *
 * 幅を持たない列（定義）の右端にハンドルを置くとき、掴めるのは右隣の
 * 固定幅の列の幅なので、その添字をここで引く（M8 Task 15）
 */
export function nextWidthIndex(i: number): number | null {
  for (let j = i + 1; j < WIDTH_INDEX.length; j++) {
    const w = WIDTH_INDEX[j]
    if (w !== null) return w
  }
  return null
}
