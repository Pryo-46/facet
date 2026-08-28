import { buildTree, type FlatTreeNode } from '@/core/canvas/flat-tree'
import type { LogicTreeSchemaVersion1, TreeNode } from '@/types/logic-tree'

/**
 * ロジックツリー → Miro の JSON。**この層は器を知らない**（値を組むだけ）。
 *
 * 決定と根拠は docs/superpowers/plans/2026-08-29-logic-tree-m2-miro-clipboard-design.md の
 * 4章。要点だけ:
 *
 * - **autoLayout: true かつ座標も出す。** 座標が無いと兄弟の順序が壊れ（Miro が勝手に
 *   並べる）、autoLayout が false だと見た目が硬くなる。両方要る
 * - **幅は列内の最大へ揃える。** 揃えないと骨格が読めない（tree-layout.ts が列の x を
 *   最大幅で決めているのと同じ考え方）
 * - **幅は概算であり、広めに倒す。** 狭いと Miro 側で折り返して見た目が崩れる。
 *   フォントの実測手段が無いので、折り返しが出たら係数を上げるのが対処
 * - **固定値だけを使う**（乱数も時刻も混ぜない）。原本照合のテストが成立しなくなる
 */

/** Miro の標準の黒 (#1A1A1A)。枠・線・文字すべてこれ */
const INK = 1710618
const NODE_HEIGHT = 40
const COLUMN_GAP = 60
const ROW_GAP = 16
/** 全角 / 半角 1文字あたりの概算幅と、左右の余白 */
const EM_WIDTH = 16
const EN_WIDTH = 9
const PADDING_X = 28
const MIN_WIDTH = 72

const BOARD_ID = 'ZmFjZXQtdHI='
const INITIAL_ID_BASE = 3458764699000000000n

const NODE_STYLE = JSON.stringify({
  st: 28, bc: -1, bo: 0, bsc: 0, ta: 'c', tc: INK, tsc: 1, ffn: 'Noto Sans',
  b: 0, u: 0, i: 0, s: 0, fw: 0, brc: INK, bro: 1, brw: 2, brs: 2, hl: 0,
})
const LINE_STYLE = JSON.stringify({
  lc: INK, ls: 2, t: 2, lt: 3, a_start: 0, a_end: 0, VER: 2, jump: 0,
})

/** 半角と見なす範囲（ASCII と半角カナ） */
const HALF_WIDTH = /[ -~｡-ﾟ]/

function estimateWidth(text: string): number {
  let w = 0
  for (const ch of text) w += HALF_WIDTH.test(ch) ? EN_WIDTH : EM_WIDTH
  return Math.max(MIN_WIDTH, w + PADDING_X)
}

/** Miro のノード文言は HTML なので、地の文をエスケープしてから <p> で包む */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function nodesToMiroPayload(
  data: LogicTreeSchemaVersion1,
): { payload: unknown; texts: string[] } {
  const built = buildTree(data.nodes)

  // 1. DFS 行きがけ順で並べる。**この順が objects の index になる**（widgetIndex が指す先）
  const ordered: { node: TreeNode; depth: number; parentIndex: number | null }[] = []
  const walk = (flat: FlatTreeNode, depth: number, parentIndex: number | null): void => {
    const index = ordered.length
    ordered.push({ node: data.nodes[flat.index], depth, parentIndex })
    for (const child of flat.children) walk(child, depth + 1, index)
  }
  for (const root of built.roots) walk(root, 0, null)

  // 2. 列ごとの幅（列内の最大に揃える）と、列の x
  const colWidth: number[] = []
  for (const { node, depth } of ordered) {
    colWidth[depth] = Math.max(colWidth[depth] ?? 0, estimateWidth(node.text))
  }
  const colX: number[] = []
  let acc = 0
  for (let d = 0; d < colWidth.length; d++) {
    colX[d] = acc
    acc += colWidth[d] + COLUMN_GAP
  }

  // 3. y は「葉を上から積み、親は子の中央」。ordered は行きがけ順なので、
  //    子の y を先に確定させるために**後ろから走る**
  const childIndices = new Map<number, number[]>()
  ordered.forEach((entry, index) => {
    if (entry.parentIndex === null) return
    const siblings = childIndices.get(entry.parentIndex) ?? []
    siblings.push(index)
    childIndices.set(entry.parentIndex, siblings)
  })
  const y: number[] = new Array(ordered.length).fill(0)
  // 葉を上から順に積む。**行きがけ順に前から走ると、葉は画面の上から下の順に現れる**
  let cursor = 0
  for (let i = 0; i < ordered.length; i++) {
    const kids = childIndices.get(i)
    if (kids === undefined || kids.length === 0) {
      y[i] = cursor
      cursor += NODE_HEIGHT + ROW_GAP
    }
  }
  // 親は子の中央。**後ろから走る**ことで、自分を計算する時点で子が確定している
  //（行きがけ順なので、子は必ず親より後ろにいる）
  for (let i = ordered.length - 1; i >= 0; i--) {
    const kids = childIndices.get(i)
    if (kids === undefined || kids.length === 0) continue
    y[i] = Math.round((y[kids[0]] + y[kids[kids.length - 1]]) / 2)
  }

  // 4. Miro のオブジェクトへ。**ノードを全部並べてからエッジを足す**
  //    （widgetIndex が指すのは objects の位置なので、ノードの index を先に確定させる）
  const objects: unknown[] = []
  const initialIdOf = (i: number) => String(INITIAL_ID_BASE + BigInt(i) + 1n)
  ordered.forEach((entry, index) => {
    objects.push({
      widgetData: {
        json: {
          _position: { offsetPx: { x: colX[entry.depth], y: y[index] }, schema: 'canvasOffsetPx' },
          scale: { scale: 1 },
          relativeScale: 1,
          rotation: { rotation: 0 },
          relativeRotation: 0,
          size: { width: colWidth[entry.depth], height: NODE_HEIGHT },
          _parent: null,
          text: `<p>${escapeHtml(entry.node.text)}</p>`,
          style: NODE_STYLE,
        },
        type: 'text',
      },
      type: 14,
      'ns:mindmap': {
        theme: 'colorBranch',
        layout: 'butterfly',
        autoLayout: true,
        collapsibleBranch: { isBranchCollapsed: false, isNodeHidden: false },
      },
      id: index,
      initialId: initialIdOf(index),
      meta: { boardId: BOARD_ID, widgetToken: index + 1 },
    })
  })
  ordered.forEach((entry, index) => {
    if (entry.parentIndex === null) return
    const id = objects.length
    objects.push({
      widgetData: {
        json: {
          points: [],
          primary: { point: { x: 1, y: 0.5 }, positionType: 0, widgetIndex: entry.parentIndex },
          secondary: { point: { x: 0, y: 0.5 }, positionType: 0, widgetIndex: index },
          _position: null,
          _parent: null,
          style: LINE_STYLE,
          line: { captions: [] },
        },
        type: 'line',
      },
      type: 14,
      'ns:mindmap': { mindmap: true },
      id,
      initialId: initialIdOf(id),
      meta: { boardId: BOARD_ID, widgetToken: id + 1 },
    })
  })

  return {
    payload: {
      isProtected: false,
      boardId: BOARD_ID,
      data: { objects, meta: {} },
      version: 2,
      host: 'miro.com',
      asPortalAmount: 0,
      copierType: 'COPY',
    },
    // div 側は表示用。Miro の原本もエスケープ済みの文言を並べている
    texts: ordered.map((e) => escapeHtml(e.node.text)),
  }
}
