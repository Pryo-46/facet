import { normalizeForMatch } from '@/core/normalize'
import type { Term } from '@/types/glossary'

/**
 * 検索・種別フィルタ（session-notes 論点6）。
 * 照合は重複判定と同じ normalizeForMatch を使う——同じアプリの中で
 * 「同じ語とみなす規則」を2つ持たない。
 * notes は検知対象外の自由メモなので検索対象に含めない（論点2）。
 */
export interface GlossaryFilter {
  /** インクリメンタル検索の文字列（name / aliases / definition 横断） */
  query: string
  /** 種別フィルタ。空配列＝絞り込みなし。複数指定は OR */
  kinds: readonly string[]
}

export const EMPTY_FILTER: GlossaryFilter = { query: '', kinds: [] }

/**
 * 導出表示か（＝データ順と表示順が食い違いうるか）。
 * true の間は並び替え（Alt+↑↓）を無効にする（session-notes 論点4）
 */
export function isDerivedView(filter: GlossaryFilter): boolean {
  return normalizeForMatch(filter.query) !== '' || filter.kinds.length > 0
}

/** 表示する用語の「元配列での index」を配列順のまま返す */
export function filterTermIndices(terms: readonly Term[], filter: GlossaryFilter): number[] {
  const query = normalizeForMatch(filter.query)
  const kinds = new Set(filter.kinds)
  const out: number[] = []
  terms.forEach((term, index) => {
    if (kinds.size > 0 && !kinds.has(term.kind)) return
    if (query !== '' && !matches(term, query)) return
    out.push(index)
  })
  return out
}

function matches(term: Term, normalizedQuery: string): boolean {
  return [term.name, term.definition, ...term.aliases].some((s) =>
    normalizeForMatch(s).includes(normalizedQuery),
  )
}
