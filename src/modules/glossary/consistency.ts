import type { ConsistencyIssue } from '@/core/consistency'
import { normalizeForMatch } from '@/core/normalize'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'

/**
 * 用語集のモジュール内検証（規約4。rev 6章の責務内訳の「モジュール内」側）。
 * 自ファイルで完結する検証のみ。単一性違反はコア横断検証の管轄。
 * alias 系は表記ゆれ検知の照合データ自体の矛盾として扱う（session-notes 論点5）。
 */
export function checkGlossaryConsistency(data: GlossarySchemaVersion1): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const terms = data.terms

  // ID 重複（ID は機械的識別子なので正規化しない完全一致）
  const idCount = new Map<string, number>()
  for (const t of terms) idCount.set(t.id, (idCount.get(t.id) ?? 0) + 1)
  for (const [id, count] of idCount) {
    if (count > 1) {
      issues.push({
        rule: 'duplicate-id',
        message: `ID が重複しています（${count}件）: ${id}`,
        locations: [{ entityId: id, field: 'id' }],
      })
    }
  }

  // name 重複（同名2件は「この語を正式名とする」宣言としての矛盾。rev 5章）
  const byName = new Map<string, Term[]>()
  for (const t of terms) {
    const key = normalizeForMatch(t.name)
    byName.set(key, [...(byName.get(key) ?? []), t])
  }
  for (const group of byName.values()) {
    if (group.length > 1) {
      issues.push({
        rule: 'duplicate-name',
        message: `名称が重複しています: ${group.map((t) => `「${t.name}」`).join(' と ')}`,
        locations: group.map((t) => ({ entityId: t.id, field: 'name' })),
      })
    }
  }

  // alias 重複（同一用語内・用語間の両方を1つのルールで扱う）
  const aliasOwners = new Map<string, { term: Term; alias: string }[]>()
  for (const t of terms) {
    for (const alias of t.aliases) {
      const key = normalizeForMatch(alias)
      aliasOwners.set(key, [...(aliasOwners.get(key) ?? []), { term: t, alias }])
    }
  }
  for (const owners of aliasOwners.values()) {
    if (owners.length > 1) {
      const uniqueTermIds = [...new Set(owners.map((o) => o.term.id))]
      issues.push({
        rule: 'duplicate-alias',
        message: `別名「${owners[0].alias}」が重複しています（${owners.length}件）`,
        locations: uniqueTermIds.map((id) => ({ entityId: id, field: 'aliases' })),
      })
    }
  }

  // alias と他用語の name の衝突（自用語の name は対象外。
  // 正式名そのものを alias に持つのは冗長ではあるが矛盾ではない）
  for (const t of terms) {
    for (const alias of t.aliases) {
      for (const other of byName.get(normalizeForMatch(alias)) ?? []) {
        if (other.id === t.id) continue
        issues.push({
          rule: 'alias-name-collision',
          message: `「${t.name}」の別名「${alias}」が用語「${other.name}」の名称と衝突しています`,
          locations: [
            { entityId: t.id, field: 'aliases' },
            { entityId: other.id, field: 'name' },
          ],
        })
      }
    }
  }

  return issues
}
