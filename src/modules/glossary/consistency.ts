import type { ConsistencyIssue } from '@/core/consistency'
import { findDuplicates, groupByKey } from '@/core/duplicate'
import { normalizeForMatch } from '@/core/normalize'
import type { GlossarySchemaVersion1 } from '@/types/glossary'

/**
 * 用語集のモジュール内検証（規約4。rev 6章の責務内訳の「モジュール内」側）。
 * 自ファイルで完結する検証のみ。単一性違反はコア横断検証の管轄。
 * alias 系は表記ゆれ検知の照合データ自体の矛盾として扱う（session-notes 論点5）。
 *
 * locations は配列位置（entityIndex）で行を指す。ID 重複ファイルを
 * 「受け入れて赤表示」する以上、entityId だけでは行を一意に特定できない。
 *
 * **グループ化は core/duplicate.ts に一元化してある**（M9）。正規化を掛けるか
 * どうかはルールごとに違うので、keyOf に載せて呼び分ける
 */
export function checkGlossaryConsistency(data: GlossarySchemaVersion1): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const terms = data.terms

  // ID 重複（ID は機械的識別子なので正規化しない完全一致）
  for (const [id, indices] of findDuplicates(terms, (t) => t.id)) {
    issues.push({
      rule: 'duplicate-id',
      message: `ID が重複しています（${indices.length}件）: ${id}`,
      locations: indices.map((i) => ({ entityId: id, entityIndex: i, field: 'id' })),
    })
  }

  // name 重複（同名2件は「この語を正式名とする」宣言としての矛盾。rev 5章）
  const nameKey = (name: string): string => normalizeForMatch(name)
  for (const indices of findDuplicates(terms, (t) => nameKey(t.name)).values()) {
    issues.push({
      rule: 'duplicate-name',
      message: `名称が重複しています: ${indices.map((i) => `「${terms[i].name}」`).join(' と ')}`,
      locations: indices.map((i) => ({
        entityId: terms[i].id,
        entityIndex: i,
        field: 'name',
      })),
    })
  }

  // alias 重複（同一用語内・用語間の両方を1つのルールで扱う）。
  // 別名は用語にぶら下がるので、いったん「持ち主の位置つき」に平らへ潰してから引く
  const owned = terms.flatMap((term, index) =>
    term.aliases.map((alias) => ({ index, alias })),
  )
  for (const group of findDuplicates(owned, (o) => nameKey(o.alias)).values()) {
    // 同一用語内の重複は行が1つしかないので、同じ行を2度指さない
    const seen = new Set<number>()
    const locations = []
    for (const flat of group) {
      const { index } = owned[flat]
      if (seen.has(index)) continue
      seen.add(index)
      locations.push({ entityId: terms[index].id, entityIndex: index, field: 'aliases' })
    }
    issues.push({
      rule: 'duplicate-alias',
      message: `別名「${owned[group[0]].alias}」が重複しています（${group.length}件）`,
      locations,
    })
  }

  // alias と他用語の name の衝突（自用語の name は対象外。
  // 正式名そのものを alias に持つのは冗長ではあるが矛盾ではない）。
  // 自他の判定は index で行う——ID が重複していても別の行は別の用語。
  // ここは「重複」ではなく引き当てなので groupByKey（全グループ）を使う
  const byName = groupByKey(terms, (t) => nameKey(t.name))
  terms.forEach((term, index) => {
    for (const alias of term.aliases) {
      for (const other of byName.get(nameKey(alias)) ?? []) {
        if (other === index) continue
        issues.push({
          rule: 'alias-name-collision',
          message: `「${term.name}」の別名「${alias}」が用語「${terms[other].name}」の名称と衝突しています`,
          locations: [
            { entityId: term.id, entityIndex: index, field: 'aliases' },
            { entityId: terms[other].id, entityIndex: other, field: 'name' },
          ],
        })
      }
    }
  })

  return issues
}
