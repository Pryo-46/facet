import type { ConsistencyIssue } from '@/core/consistency'
import { findDuplicates } from '@/core/duplicate'
import { normalizeForMatch } from '@/core/normalize'
import { rowRef } from '@/core/row-ref'
import type { ErrorCatalogSchemaVersion1 } from '@/types/error-catalog'
import { FIELD_LABELS, type ResolutionLevel } from './fields'
import { resolutionLabel } from './resolution-labels'

/**
 * エラーカタログのモジュール内検証（規約4。決定13）。
 * レベル2＝受け入れて赤表示。自ファイルで完結する検証のみで、
 * 単一性違反はコア横断検証の管轄。
 *
 * **欠落（対応文・原因の空、undecided）はここに載せない。** 欠落は
 * セルの面であってエディタが直接塗る（`missing.ts`）——issue 一覧が
 * 欠落で埋まると、赤の指摘が読めなくなる。
 *
 * locations は配列位置（entityIndex）で行を指す。ID 重複ファイルを
 * 「受け入れて赤表示」する以上、entityId だけでは行を一意に特定できない
 */
type ActionField = 'userAction' | 'supportAction' | 'engineerAction'

/** そのレベルを宣言したときに埋まっているべき対応。none / undecided は誰も宣言しない */
const REQUIRED_ACTION: Partial<Record<ResolutionLevel, ActionField>> = {
  user: 'userAction',
  support: 'supportAction',
  engineer: 'engineerAction',
}

export function checkErrorCatalogConsistency(
  data: ErrorCatalogSchemaVersion1,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const errors = data.errors

  // ID 重複（ID は機械的識別子なので正規化しない完全一致）
  for (const [id, indices] of findDuplicates(errors, (e) => e.id)) {
    issues.push({
      rule: 'duplicate-id',
      message: `ID が重複しています（${indices.length}件。${indices.map(rowRef).join(' ／ ')}）: ${id}`,
      locations: indices.map((i) => ({ entityId: id, entityIndex: i, field: 'id' })),
    })
  }

  // エラー名の重複（同名2件は「この語で引ける」という前提の矛盾）。
  // 照合規則は用語集の duplicate-name と同じ normalizeForMatch を使う
  //——同じアプリの中で「同じ語とみなす規則」を2つ持たない
  for (const indices of findDuplicates(errors, (e) => normalizeForMatch(e.name)).values()) {
    issues.push({
      rule: 'duplicate-name',
      message: `エラー名「${errors[indices[0]].name}」が${indices.length}件重複しています（${indices.map(rowRef).join(' ／ ')}）`,
      locations: indices.map((i) => ({
        entityId: errors[i].id,
        entityIndex: i,
        field: 'name',
      })),
    })
  }

  // 宣言したレベルと対応文の矛盾（例: user なのに userAction が空）
  errors.forEach((entry, index) => {
    const field = REQUIRED_ACTION[entry.resolutionLevel]
    if (field === undefined || entry[field] !== '') return
    issues.push({
      rule: 'resolution-action-missing',
      message: `${rowRef(index)}「${entry.name}」は${resolutionLabel(entry.resolutionLevel)}としていますが、${FIELD_LABELS[field]}が空です`,
      locations: [{ entityId: entry.id, entityIndex: index, field }],
    })
  })

  return issues
}
