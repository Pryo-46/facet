import { buildTree } from '@/core/canvas/flat-tree'
import type { ConsistencyIssue, ConsistencyLocation } from '@/core/consistency'
import { findDuplicates } from '@/core/duplicate'
import type { LogicTreeSchemaVersion1, TreeNode } from '@/types/logic-tree'

/** 文言でノードを指す。空のノードは配列位置で呼ぶ（「（未記入）」だけだと区別できない） */
function label(node: TreeNode, index: number): string {
  return node.text.trim() === '' ? `（未記入・${index + 1}番目）` : `「${node.text}」`
}

function at(nodes: readonly TreeNode[], index: number, field: string): ConsistencyLocation {
  return { entityId: nodes[index].id, entityIndex: index, field }
}

/**
 * ロジックツリーのモジュール内検証（規約4。rev 6章の責務内訳の「モジュール内」側）。
 *
 * locations は配列位置（entityIndex）でノードを指す。ID 重複ファイルを
 * 「受け入れて赤表示」する以上、entityId だけでは一意に特定できない。
 */
export function checkLogicTreeConsistency(data: LogicTreeSchemaVersion1): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const nodes = data.nodes
  const built = buildTree(nodes)

  // ID 重複（ID は機械的識別子なので正規化しない完全一致）。
  // グループ化は core/duplicate.ts に一元化されている（M9）
  for (const [id, indices] of findDuplicates(nodes, (n) => n.id)) {
    issues.push({
      rule: 'duplicate-id',
      message: `ID が重複しています（${indices.length}件）: ${id}`,
      locations: indices.map((i) => at(nodes, i, 'id')),
    })
  }

  // 循環（＝根から到達できないノード）。図に描かれないので、ここで見せないと
  // 「ファイルにあるのに画面に無い」ノードが黙って生まれる
  if (built.unreachable.length > 0) {
    issues.push({
      rule: 'cyclic-parent',
      message: `親子関係が循環しているノードがあります（${built.unreachable.length}件。図には表示されません）: ${built.unreachable
        .map((i) => label(nodes[i], i))
        .join('、')}`,
      locations: built.unreachable.map((i) => at(nodes, i, 'parentId')),
    })
  }

  // 参照切れ。ルートとして描かれるため、下の multiple-root も同時に立つ
  if (built.missingParent.length > 0) {
    issues.push({
      rule: 'missing-parent',
      message: `親が見つからないノードがあります（${built.missingParent.length}件）: ${built.missingParent
        .map((i) => label(nodes[i], i))
        .join('、')}`,
      locations: built.missingParent.map((i) => at(nodes, i, 'parentId')),
    })
  }

  // ルートの単一性。0件は正常な状態（新規作成直後）
  if (built.roots.length > 1) {
    issues.push({
      rule: 'multiple-root',
      message: `ルートが${built.roots.length}件あります（1本の木にしてください）: ${built.roots
        .map((r) => label(nodes[r.index], r.index))
        .join('、')}`,
      locations: built.roots.map((r) => at(nodes, r.index, 'parentId')),
    })
  }

  return issues
}
