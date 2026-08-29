import { newId } from '@/core/new-id'
import type { TreeNode } from '@/types/logic-tree'

/**
 * Miro の JSON をロジックツリーへ。**この層は器を知らない**（復号済みの値を受ける）。
 *
 * 詳細は docs/superpowers/plans/2026-08-29-logic-tree-m2-miro-clipboard-design.md
 */

const ENTITIES: ReadonlyMap<string, string> = new Map([
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&apos;', "'"],
  ['&nbsp;', ' '],
])

/**
 * Miro のノード文言（HTML）を、ロジックツリーの text（プレーンテキスト）へ。
 *
 * **装飾は捨てる。** ロジックツリーは見た目を持たない設計で（スキーマ:「位置・幅・
 * 折りたたみ状態は持たない」）、text に置き場所がない。中途半端に持つと Markdown
 * 出力まで壊れる。**代償として、Miro で装飾した語は往復すると素の文字列に戻る。**
 */
export function stripMiroText(html: string): string {
  return html
    // 段落の切れ目と br を先に改行へ。**タグを消す前にやること**
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // 残りのタグを落とす（装飾はここで消える）
    .replace(/<[^>]*>/g, '')
    // エンティティを実体へ。**&amp; を最後に回さないと二重復号になる**ので一括で置換する
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES.get(m) ?? m)
}

export type MiroImportResult = { ok: true; nodes: TreeNode[] } | { ok: false; reason: string }

/** Miro のオブジェクト1件から、必要な値だけ取り出した形。キーは Map の key（index）が持つ */
interface MiroNode {
  text: string
  y: number
}

const NO_MINDMAP = 'マインドマップが見つかりません。Miro でマインドマップを選んでコピーしてください。'
const NOT_A_TREE = '木の形になっていません（ノードが輪になっています）。'
const NOT_MIRO = 'Miro のデータとして読めませんでした。'

function objectsOf(payload: unknown): unknown[] | null {
  if (typeof payload !== 'object' || payload === null) return null
  const data = (payload as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return null
  const objects = (data as { objects?: unknown }).objects
  return Array.isArray(objects) ? objects : null
}

/** ns:mindmap を持つものだけが対象。付箋・図形の混入はここで落ちる */
function isMindmapObject(o: unknown): o is Record<string, unknown> {
  return typeof o === 'object' && o !== null && 'ns:mindmap' in o
}

function widgetJson(o: Record<string, unknown>): Record<string, unknown> | null {
  const wd = o.widgetData
  if (typeof wd !== 'object' || wd === null) return null
  const json = (wd as { json?: unknown }).json
  return typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : null
}

function widgetType(o: Record<string, unknown>): string | null {
  const wd = o.widgetData
  if (typeof wd !== 'object' || wd === null) return null
  const t = (wd as { type?: unknown }).type
  return typeof t === 'string' ? t : null
}

export function miroPayloadToNodes(payload: unknown): MiroImportResult {
  const objects = objectsOf(payload)
  if (objects === null) return { ok: false, reason: NOT_MIRO }

  // 1. ns:mindmap を持つものだけに絞り、ノードとエッジに分ける。
  //    **index は絞る前の配列位置**（widgetIndex がそれを指すため）
  const nodes = new Map<number, MiroNode>()
  const edges: { from: number; to: number }[] = []
  objects.forEach((o, index) => {
    if (!isMindmapObject(o)) return
    const json = widgetJson(o)
    if (json === null) return
    if (widgetType(o) === 'text') {
      const text = typeof json.text === 'string' ? stripMiroText(json.text) : ''
      const pos = json._position as { offsetPx?: { y?: unknown } } | null | undefined
      const y = typeof pos?.offsetPx?.y === 'number' ? pos.offsetPx.y : 0
      nodes.set(index, { text, y })
    } else if (widgetType(o) === 'line') {
      const from = (json.primary as { widgetIndex?: unknown } | undefined)?.widgetIndex
      const to = (json.secondary as { widgetIndex?: unknown } | undefined)?.widgetIndex
      if (typeof from === 'number' && typeof to === 'number') edges.push({ from, to })
    }
  })
  if (nodes.size === 0) return { ok: false, reason: NO_MINDMAP }

  // 2. エッジから親子を作る。参照先が捨てられたオブジェクトを指すエッジは無視する
  const parentOf = new Map<number, number>()
  const childrenOf = new Map<number, number[]>()
  for (const { from, to } of edges) {
    if (!nodes.has(from) || !nodes.has(to) || from === to) continue
    // 同じ子に複数の親が来たら最初の1本を採る（Miro の木では起きないが、全域にしておく）
    if (parentOf.has(to)) continue
    parentOf.set(to, from)
    const siblings = childrenOf.get(from) ?? []
    siblings.push(to)
    childrenOf.set(from, siblings)
  }

  // 3. ルートは親を持たないノード。1つでなければ断る
  const roots = [...nodes.keys()].filter((i) => !parentOf.has(i))
  if (roots.length === 0) return { ok: false, reason: NOT_A_TREE }
  if (roots.length > 1) {
    return {
      ok: false,
      reason: `マインドマップ1つ分を選んでコピーしてください（木が ${roots.length} 本あります）。`,
    }
  }

  // 4. ルートから DFS。兄弟は y 座標の昇順（Miro 自身が見た目の順をこれで決めている）。
  //    **到達できなかったノードがあれば循環している**（buildTree と同じ考え方）
  const out: TreeNode[] = []
  const visited = new Set<number>()
  const walk = (index: number, parentId: string | null): void => {
    if (visited.has(index)) return
    visited.add(index)
    const id = newId('node')
    const self = nodes.get(index)
    out.push({ id, parentId, text: self === undefined ? '' : self.text })
    const kids = (childrenOf.get(index) ?? []).slice().sort((a, b) => {
      const ya = nodes.get(a)?.y ?? 0
      const yb = nodes.get(b)?.y ?? 0
      return ya - yb
    })
    for (const kid of kids) walk(kid, id)
  }
  walk(roots[0], null)

  if (visited.size !== nodes.size) return { ok: false, reason: NOT_A_TREE }
  return { ok: true, nodes: out }
}
