import type { ConsistencyIssue, ConsistencyLocation } from '@/core/consistency'
import { buildTree } from '@/core/canvas/flat-tree'
import { findDuplicates } from '@/core/duplicate'
import type { Hypothesis, IssueNode, IssueTreeSchemaVersion3 } from '@/types/issue-tree'

/** 文言で指す。空のものは配列位置で呼ぶ（「（未記入）」だけだと区別できない） */
function label(text: string, index: number): string {
  return text.trim() === '' ? `（未記入・${index + 1}番目）` : `「${text}」`
}

function at(id: string, index: number, field: string): ConsistencyLocation {
  return { entityId: id, entityIndex: index, field }
}

/**
 * 課題ツリーのモジュール内検証（規約4。rev 6章の責務内訳の「モジュール内」側）。
 *
 * **仮説がどの課題にぶら下がっているかは検証しない**——中間ノードへの仮説は
 * D1 で明示的に許した形であり、指摘すると「当たりをつける」入力が
 * 制約違反として赤くなる
 */
export function checkIssueTreeConsistency(data: IssueTreeSchemaVersion3): ConsistencyIssue[] {
  const out: ConsistencyIssue[] = []
  const issues = data.issues
  const built = buildTree(issues)

  for (const [id, indices] of findDuplicates(issues, (n: IssueNode) => n.id)) {
    out.push({
      rule: 'duplicate-id',
      message: `課題の ID が重複しています（${indices.length}件）: ${id}`,
      locations: indices.map((i) => at(id, i, 'id')),
    })
  }
  for (const [id, indices] of findDuplicates(data.hypotheses, (h: Hypothesis) => h.id)) {
    out.push({
      rule: 'duplicate-id',
      message: `仮説の ID が重複しています（${indices.length}件）: ${id}`,
      locations: indices.map((i) => at(id, i, 'id')),
    })
  }

  // 循環（＝根から到達できない課題）。図に描かれないので、ここで見せないと
  // 「ファイルにあるのに画面に無い」課題が黙って生まれる
  if (built.unreachable.length > 0) {
    out.push({
      rule: 'cyclic-parent',
      message: `親子関係が循環している課題があります（${built.unreachable.length}件。図には表示されません）: ${built.unreachable
        .map((i) => label(issues[i].text, i))
        .join('、')}`,
      locations: built.unreachable.map((i) => at(issues[i].id, i, 'parentId')),
    })
  }

  // 参照切れ。ルートとして描かれるため、下の multiple-root も同時に立つ
  if (built.missingParent.length > 0) {
    out.push({
      rule: 'missing-parent',
      message: `親が見つからない課題があります（${built.missingParent.length}件）: ${built.missingParent
        .map((i) => label(issues[i].text, i))
        .join('、')}`,
      locations: built.missingParent.map((i) => at(issues[i].id, i, 'parentId')),
    })
  }

  // ルートの単一性。0件は正常な状態（新規作成直後）
  if (built.roots.length > 1) {
    out.push({
      rule: 'multiple-root',
      message: `ルートが${built.roots.length}件あります（1本の木にしてください）: ${built.roots
        .map((r) => label(issues[r.index].text, r.index))
        .join('、')}`,
      locations: built.roots.map((r) => at(issues[r.index].id, r.index, 'parentId')),
    })
  }

  // 仮説の参照切れ（「参照する側」のモジュールが持つ検証。rev 6章）
  const existing = new Set(issues.map((n) => n.id))
  const dangling = data.hypotheses
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => !existing.has(h.issueId))
  if (dangling.length > 0) {
    out.push({
      rule: 'missing-issue',
      message: `ぶら下がり先の課題が見つからない仮説があります（${dangling.length}件）: ${dangling
        .map(({ h, i }) => label(h.title, i))
        .join('、')}`,
      locations: dangling.map(({ h, i }) => at(h.id, i, 'issueId')),
    })
  }

  return out
}
