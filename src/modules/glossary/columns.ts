import {
  defaultWidths,
  nextWidthIndex as nextWidthIndexOf,
  widthIndex,
  type ColumnSpec,
} from '@/core/list-editor/columns'
import type { GlossaryField } from './fields'

/**
 * 用語テーブルの列（M8 決定1）。
 *
 * **定義列だけが幅を持たず、残りを埋める。** 他4列が px を持つので、
 * テーブルは常に親幅に収まり横スクロールが出ない。「定義を広げたい」は
 * 他の列を狭めることで達成される。
 *
 * 写像の実装は `@/core/list-editor/columns` にある（M9 で引き上げ）。
 * このファイルが持つのは**列データそのものだけ**
 *
 * `'no'` は編集対象ではない**導出列**（データ配列の index + 1）。フィールドでは
 * ないので `GlossaryField` には入れず、列としてだけ先頭に足す（M22。
 * エラーカタログ `columns.ts` の形を写す）
 */
export type GlossaryColumn = 'no' | GlossaryField

export const NO_COLUMN_LABEL = 'No'

export const COLUMNS: readonly ColumnSpec<GlossaryColumn>[] = [
  { field: 'no', defaultWidth: 56 },
  { field: 'name', defaultWidth: 176 },
  { field: 'kind', defaultWidth: 128 },
  { field: 'definition', defaultWidth: null },
  { field: 'aliases', defaultWidth: 176 },
  // 備考は自由記述で長くなりやすいので、名称・別名より広く取る（M7 の要望7）
  { field: 'notes', defaultWidth: 256 },
]

/** COLUMNS の添字 → 幅配列の添字。幅を持たない列は null */
export const WIDTH_INDEX: readonly (number | null)[] = widthIndex(COLUMNS)

/** 固定幅を持つ列の既定幅（並び順）。列幅 store の初期値になる */
export const DEFAULT_WIDTHS: readonly number[] = defaultWidths(COLUMNS)

/** `i` より後ろで最初に幅を持つ列の、幅配列上の添字。無ければ null */
export function nextWidthIndex(i: number): number | null {
  return nextWidthIndexOf(WIDTH_INDEX, i)
}
