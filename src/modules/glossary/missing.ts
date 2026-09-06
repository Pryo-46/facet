import type { MissingTally } from '@/core/missing-tally'
import type { Term } from '@/types/glossary'
import type { GlossaryField } from './fields'

/**
 * 用語集の欠落判定（docs/missing-semantics.md 決定1）。
 * 判定源は src/core/reading-guide.md の「未決」と一対一——
 * definition の空＝未定義、kind の undecided＝未分類。
 * 別名・備考の空は欠落ではない（session-notes: 検知対象外）。
 * セルの面（GlossaryEditor の cellClass の warn）と帯の集計が同じ関数を読む
 */
export function isMissingCell(term: Term, field: GlossaryField): boolean {
  if (field === 'definition') return term.definition === ''
  if (field === 'kind') return term.kind === 'undecided'
  return false
}

export function tallyMissing(terms: readonly Term[]): MissingTally {
  let definition = 0
  let kind = 0
  for (const t of terms) {
    if (isMissingCell(t, 'definition')) definition += 1
    if (isMissingCell(t, 'kind')) kind += 1
  }
  const parts = [
    { kind: 'definition', label: '未定義', count: definition, variant: 'open' as const },
    { kind: 'kind', label: '未分類', count: kind, variant: 'open' as const },
  ].filter((p) => p.count > 0)
  return { total: definition + kind, parts }
}
