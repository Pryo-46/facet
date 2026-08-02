import type { ConsistencyIssue } from '@/core/consistency'
import { normalizeForMatch } from '@/core/normalize'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'

/** 検証中の用語（配列位置つき）。locations の entityIndex に使う */
interface IndexedTerm {
  term: Term
  index: number
}

/**
 * 用語集のモジュール内検証（規約4。rev 6章の責務内訳の「モジュール内」側）。
 * 自ファイルで完結する検証のみ。単一性違反はコア横断検証の管轄。
 * alias 系は表記ゆれ検知の照合データ自体の矛盾として扱う（session-notes 論点5）。
 *
 * locations は配列位置（entityIndex）で行を指す。ID 重複ファイルを
 * 「受け入れて赤表示」する以上、entityId だけでは行を一意に特定できない。
 */
export function checkGlossaryConsistency(data: GlossarySchemaVersion1): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const terms: IndexedTerm[] = data.terms.map((term, index) => ({ term, index }))

  // ID 重複（ID は機械的識別子なので正規化しない完全一致）
  const byId = new Map<string, IndexedTerm[]>()
  for (const t of terms) byId.set(t.term.id, [...(byId.get(t.term.id) ?? []), t])
  for (const [id, group] of byId) {
    if (group.length > 1) {
      issues.push({
        rule: 'duplicate-id',
        message: `ID が重複しています（${group.length}件）: ${id}`,
        locations: group.map((t) => ({ entityId: id, entityIndex: t.index, field: 'id' })),
      })
    }
  }

  // name 重複（同名2件は「この語を正式名とする」宣言としての矛盾。rev 5章）
  const byName = new Map<string, IndexedTerm[]>()
  for (const t of terms) {
    const key = normalizeForMatch(t.term.name)
    byName.set(key, [...(byName.get(key) ?? []), t])
  }
  for (const group of byName.values()) {
    if (group.length > 1) {
      issues.push({
        rule: 'duplicate-name',
        message: `名称が重複しています: ${group.map((t) => `「${t.term.name}」`).join(' と ')}`,
        locations: group.map((t) => ({
          entityId: t.term.id,
          entityIndex: t.index,
          field: 'name',
        })),
      })
    }
  }

  // alias 重複（同一用語内・用語間の両方を1つのルールで扱う）
  const aliasOwners = new Map<string, { owner: IndexedTerm; alias: string }[]>()
  for (const t of terms) {
    for (const alias of t.term.aliases) {
      const key = normalizeForMatch(alias)
      aliasOwners.set(key, [...(aliasOwners.get(key) ?? []), { owner: t, alias }])
    }
  }
  for (const owners of aliasOwners.values()) {
    if (owners.length > 1) {
      // 同一用語内の重複は行が1つしかないので、同じ行を2度指さない
      const seen = new Set<number>()
      const locations = []
      for (const o of owners) {
        if (seen.has(o.owner.index)) continue
        seen.add(o.owner.index)
        locations.push({
          entityId: o.owner.term.id,
          entityIndex: o.owner.index,
          field: 'aliases',
        })
      }
      issues.push({
        rule: 'duplicate-alias',
        message: `別名「${owners[0].alias}」が重複しています（${owners.length}件）`,
        locations,
      })
    }
  }

  // alias と他用語の name の衝突（自用語の name は対象外。
  // 正式名そのものを alias に持つのは冗長ではあるが矛盾ではない）。
  // 自他の判定は index で行う——ID が重複していても別の行は別の用語
  for (const t of terms) {
    for (const alias of t.term.aliases) {
      for (const other of byName.get(normalizeForMatch(alias)) ?? []) {
        if (other.index === t.index) continue
        issues.push({
          rule: 'alias-name-collision',
          message: `「${t.term.name}」の別名「${alias}」が用語「${other.term.name}」の名称と衝突しています`,
          locations: [
            { entityId: t.term.id, entityIndex: t.index, field: 'aliases' },
            { entityId: other.term.id, entityIndex: other.index, field: 'name' },
          ],
        })
      }
    }
  }

  return issues
}
