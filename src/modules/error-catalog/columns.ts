import {
  defaultWidths,
  nextWidthIndex as nextWidthIndexOf,
  widthIndex,
  type ColumnSpec,
} from '@/core/list-editor/columns'
import type { ErrorField } from './fields'
import { DEV_PROFILE, SUPPORT_PROFILE, type ErrorProfile, type ProfileId } from './profiles'

/**
 * 表の列（M10 決定10・決定16）。
 *
 * `'no'` は編集対象ではない**導出列**（データ配列の index + 1）。フィールドでは
 * ないので `ErrorField` には入れず、列としてだけ先頭に足す。
 *
 * **幅を持たない列は `causeForSupport`**（用語集の `definition` に相当する位置）。
 * 他の列が px を持ち1列が残りを取るので、テーブルは常に親幅に収まる。
 * 写像の実装は `@/core/list-editor/columns` にある（M9 で引き上げ）
 */
export type ErrorColumn = 'no' | ErrorField

export const NO_COLUMN_LABEL = 'No'

/**
 * 個別に幅を決める列。ここに無いフィールドは散文列として `PROSE_WIDTH` を使う。
 * **`causeForSupport` を明示的に null で置く**——`undefined`（未登録）と
 * 区別が付かないと、吸収列がプロファイルごとにずれる
 */
const FIXED_WIDTH: Partial<Record<ErrorColumn, number | null>> = {
  no: 56,
  name: 152,
  occurrence: 128,
  resolutionLevel: 112,
  causeForSupport: null,
}

/**
 * 散文列の既定幅。**開発向けは列が2本多いので狭くする。** 同じ幅にすると
 * 1440px の窓で固定幅の合計が実効幅を越え、吸収列が潰れて横スクロールが出る
 */
const PROSE_WIDTH: Record<ProfileId, number> = { support: 168, dev: 104 }

function columnsFor(profile: ErrorProfile): readonly ColumnSpec<ErrorColumn>[] {
  const columns: ErrorColumn[] = ['no', ...profile.fields]
  return columns.map((field) => {
    const fixed = FIXED_WIDTH[field]
    return { field, defaultWidth: fixed === undefined ? PROSE_WIDTH[profile.id] : fixed }
  })
}

export interface ProfileColumns {
  columns: readonly ColumnSpec<ErrorColumn>[]
  /** 列の添字 → 幅配列の添字。幅を持たない列は null */
  widthIndex: readonly (number | null)[]
  /** 固定幅を持つ列の既定幅（並び順）。列幅 store の初期値になる */
  defaultWidths: readonly number[]
  /** `i` より後ろで最初に幅を持つ列の、幅配列上の添字。無ければ null */
  nextWidthIndex: (i: number) => number | null
}

function profileColumns(profile: ErrorProfile): ProfileColumns {
  const columns = columnsFor(profile)
  const index = widthIndex(columns)
  return {
    columns,
    widthIndex: index,
    defaultWidths: defaultWidths(columns),
    nextWidthIndex: (i) => nextWidthIndexOf(index, i),
  }
}

/**
 * プロファイルごとの列表。**モジュールスコープで1回だけ組む**——
 * レンダごとに作ると `<colgroup>` の参照が毎回変わる
 */
export const PROFILE_COLUMNS: Record<ProfileId, ProfileColumns> = {
  support: profileColumns(SUPPORT_PROFILE),
  dev: profileColumns(DEV_PROFILE),
}
