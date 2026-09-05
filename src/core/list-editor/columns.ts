/**
 * 表の列の仕様と、幅配列への添字の写像（全ツール共通・コア）。
 *
 * **`defaultWidth` が null の列は幅を持たず、残りを埋める。** 他の列が px を
 * 持ち1列が残りを取るので、テーブルは常に親幅に収まり横スクロールが出ない。
 * 「この列を広げたい」は他の列を狭めることで達成される。窓を狭めたときも
 * 幅を持たない列が縮んで吸収する。列構成に依存しない形なので、
 * どのツールでも同じ写像を使える
 */
export interface ColumnSpec<TField extends string> {
  field: TField
  defaultWidth: number | null
}

/**
 * 列の添字 → 幅配列の添字。幅を持たない列は null。
 *
 * **幅配列は固定幅を持つ列だけを並び順で持つ**ので、列の添字とは一致しない。
 * 対応をここ1箇所に閉じ、コンポーネント側で添字を計算しない
 */
export function widthIndex(columns: readonly ColumnSpec<string>[]): (number | null)[] {
  let n = 0
  return columns.map((c) => (c.defaultWidth === null ? null : n++))
}

/** 固定幅を持つ列の既定幅（並び順）。列幅 store の初期値になる */
export function defaultWidths(columns: readonly ColumnSpec<string>[]): number[] {
  return columns.flatMap((c) => (c.defaultWidth === null ? [] : [c.defaultWidth]))
}

/**
 * `i` より後ろで最初に幅を持つ列の、幅配列上の添字を返す。無ければ null。
 *
 * 幅を持たない列の右端にハンドルを置くとき、掴めるのは右隣の固定幅の列の幅
 * なので、その添字をここで引く
 */
export function nextWidthIndex(
  index: readonly (number | null)[],
  i: number,
): number | null {
  for (let j = i + 1; j < index.length; j++) {
    const w = index[j]
    if (w !== null) return w
  }
  return null
}
