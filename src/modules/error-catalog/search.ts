import { normalizeForMatch } from '@/core/normalize'
import type { ErrorEntry } from '@/types/error-catalog'
import type { ProseField } from './fields'

/**
 * 検索・解決レベルフィルタ（M10 決定16）。
 * 照合は重複判定と同じ `normalizeForMatch` を使う——同じアプリの中で
 * 「同じ語とみなす規則」を2つ持たない。
 *
 * **検索対象は表示中のプロファイルに依らない。** サポート向け表示でも
 * `causeForSpec` を検索する——プロファイルは「誰に見せるか」の切り替えで
 * あって、データの一部を無かったことにする機能ではない。
 * `notes` だけは検知対象外の自由メモなので外す（用語集と同じ判断）
 */
const SEARCH_FIELDS: readonly ProseField[] = [
  'name',
  'occurrence',
  'causeForSupport',
  'causeForSpec',
  'userAction',
  'supportAction',
  'engineerAction',
]

export interface ErrorFilter {
  /** インクリメンタル検索の文字列 */
  query: string
  /** 解決レベルの絞り込み。空配列＝絞り込みなし。複数指定は OR */
  levels: readonly string[]
}

export const EMPTY_FILTER: ErrorFilter = { query: '', levels: [] }

/**
 * 導出表示か（＝データ順と表示順が食い違いうるか）。
 * true の間は並び替え（Alt+↑↓）と行追加を無効にする
 */
export function isDerivedView(filter: ErrorFilter): boolean {
  return normalizeForMatch(filter.query) !== '' || filter.levels.length > 0
}

/** 表示するエラーの「元配列での index」を配列順のまま返す */
export function filterErrorIndices(
  errors: readonly ErrorEntry[],
  filter: ErrorFilter,
): number[] {
  const query = normalizeForMatch(filter.query)
  const levels = new Set(filter.levels)
  const out: number[] = []
  errors.forEach((entry, index) => {
    if (levels.size > 0 && !levels.has(entry.resolutionLevel)) return
    if (query !== '' && !matches(entry, query)) return
    out.push(index)
  })
  return out
}

function matches(entry: ErrorEntry, normalizedQuery: string): boolean {
  return SEARCH_FIELDS.some((f) => normalizeForMatch(entry[f]).includes(normalizedQuery))
}
