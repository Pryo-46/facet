import type { MissingTally } from '@/core/missing-tally'

/** ロジックツリーの欠落＝ text が空のノード（reading-guide:「未記入」） */
export function isMissingNode(node: { text: string }): boolean {
  return node.text === ''
}

export function tallyMissing(nodes: readonly { text: string }[]): MissingTally {
  const count = nodes.filter(isMissingNode).length
  return {
    total: count,
    parts: count === 0 ? [] : [{ kind: 'text', label: '未記入', count, variant: 'open' }],
  }
}
