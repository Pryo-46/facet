// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { edgePath } from '@/core/canvas/edges'
import { buildTree, type FlatTreeNode } from '@/core/canvas/flat-tree'
import { INITIAL_TRANSFORM } from '@/core/canvas/viewport'
import { createEstimateMeasurer } from '@/core/canvas/wrap'
import type { IssueTreeSchemaVersion2 } from '@/types/issue-tree'
import { poseQuestions, suppressedIssueIds } from './derive'
import { IssueTreeEdges } from './IssueTreeEdges'
import { layoutIssueTree } from './layout'

afterEach(cleanup)

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

const fonts = {
  title: { measure: createEstimateMeasurer(14), lineHeight: 23 },
  body: { measure: createEstimateMeasurer(14), lineHeight: 23 },
  small: { measure: createEstimateMeasurer(12), lineHeight: 18 },
}

/**
 * **兄弟3つ・深さ2**の木にする。兄弟2つ・深さ1では「先頭だけ」「末尾だけ」の
 * ような別実装でも同じ結果になり、`suppressed[child.index]` の引き当てが
 * 1つずれていても緑になる。
 *
 * 見送り（`deferred`）は**子Aに付ける**——根でも葉でもない位置に置くことで、
 * 抑制が「祖先を遡る導出」であること（子Aへ入る線・孫へ入る線の両方が
 * 破線になり、子B・子Cの枝はそのまま）が見える。
 *
 * 課題0（根）にだけ仮説カードを2枚ぶら下げてある。カードはブロックの高さと
 * 幅を押し広げるので、**線がブロックの矩形から引かれていれば座標が変わる。**
 */
const data: IssueTreeSchemaVersion2 = {
  schemaVersion: 2,
  type: 'issueTree',
  title: 'テスト',
  issues: [
    { id: I(0), parentId: null, text: '結果取得を画面遷移の中で待てるか', events: [] },
    { id: I(1), parentId: I(0), text: '再受検の扱い', events: [{ kind: 'deferred', note: '初回受検フローの成立が先' }] },
    { id: I(2), parentId: I(1), text: '受検IDの再発行が要るか', events: [] },
    { id: I(3), parentId: I(0), text: '待てないなら何を先に返すか', events: [] },
    { id: I(4), parentId: I(0), text: '通知の宛先をどこから引くか', events: [] },
  ],
  hypotheses: [
    { id: H(1), issueId: I(0), text: '同期取得で間に合う', rationale: '先行プロジェクトの実測', events: [], pendingNotes: [] },
    { id: H(2), issueId: I(0), text: 'webhook受信に切り替える', rationale: '', events: [], pendingNotes: ['再送の窓は何分か'] },
  ],
}

const built = buildTree(data.issues)
const layout = layoutIssueTree(data, poseQuestions(data), fonts, -1)
const suppressedIds = suppressedIssueIds(data.issues)
const suppressed = data.issues.map((node) => suppressedIds.has(node.id))

/** 添字 → 木の同一性の鍵（`key` は id ではないので、木から引き当てる） */
const keys = new Map<number, string>()
const collect = (node: FlatTreeNode): void => {
  keys.set(node.index, node.key)
  for (const child of node.children) collect(child)
}
for (const root of built.roots) collect(root)

function keyOf(index: number): string {
  const key = keys.get(index)
  if (key === undefined) throw new Error(`課題${index}が木に無い`)
  return key
}

/** `data-edge` は `${親のkey}->${子のkey}` */
const edgeKey = (parent: number, child: number): string => `${keyOf(parent)}->${keyOf(child)}`

function renderEdges(): HTMLElement {
  const { container } = render(
    <IssueTreeEdges
      roots={built.roots}
      placements={layout.issues}
      suppressed={suppressed}
      transform={INITIAL_TRANSFORM}
    />,
  )
  return container
}

const pathFor = (container: HTMLElement, parent: number, child: number): SVGPathElement => {
  const el = container.querySelector<SVGPathElement>(`[data-edge="${edgeKey(parent, child)}"]`)
  if (el === null) throw new Error(`課題${parent}→課題${child} の線が無い`)
  return el
}

describe('IssueTreeEdges: 線の引き元', () => {
  /**
   * 線は**課題の箱の矩形**から引く。M3 の文法では仮説は箱の中の行なので、
   * 箱はぶら下がる仮説のぶんだけ縦に伸びる——**その伸びた矩形から引く**
   *（別の矩形を作って引くと、線が箱の縁からずれた所を指す）
   */
  it('親の矩形は課題の箱のもので、仮説の行はその中に収まる', () => {
    const container = renderEdges()
    const from = layout.issues[0]
    const to = layout.issues[3]
    if (from === null || to === null) throw new Error('図に位置を持たない課題がある')
    expect(pathFor(container, 0, 3).getAttribute('d')).toBe(edgePath(from.rect, to.rect))
    // 行は箱の中（はみ出さない）
    const row = layout.hypotheses[1]
    if (row === null) throw new Error('仮説2が図に位置を持たない')
    expect(row.rect.y + row.rect.height).toBeLessThanOrEqual(from.rect.y + from.rect.height)
    // それでも箱は仮説のぶんだけ高い（数え落とすと子の列が箱に重なる）
    expect(from.rect.height).toBeGreaterThan(to.rect.height)
  })
})

describe('IssueTreeEdges: 抑制された枝', () => {
  /**
   * 抑制は**子で判定する**（`suppressed[child.index]`）。見送りを付けた当の
   * 課題も `suppressedIssueIds` に入るので、そこへ入る線から破線になる
   */
  it('見送った課題へ入る線と、その配下へ入る線が破線になる', () => {
    const container = renderEdges()
    expect(pathFor(container, 0, 1).getAttribute('stroke-dasharray')).toBe('4 3')
    expect(pathFor(container, 1, 2).getAttribute('stroke-dasharray')).toBe('4 3')
  })

  it('関係のない兄弟の枝は実線のまま', () => {
    const container = renderEdges()
    expect(pathFor(container, 0, 3).getAttribute('stroke-dasharray')).toBeNull()
    expect(pathFor(container, 0, 4).getAttribute('stroke-dasharray')).toBeNull()
  })

  /**
   * **色は変えない。** `stroke-grid` は方眼紙の線（`bg-grid-paper` が同じ
   * `--grid` でキャンバスを塗っている）のトークンなので、それで引いた線は
   * 地と見分けられない。抑制された課題の箱は `bg-canvas` になっても描かれ
   * 続けるため、線だけが消えると「親を持たない箱の群れ」に見える
   */
  it('抑制されていてもいなくても線の色（stroke-rule）は同じ', () => {
    const container = renderEdges()
    for (const [p, c] of [[0, 1], [1, 2], [0, 3], [0, 4]]) {
      expect(pathFor(container, p, c).getAttribute('class')).toBe('fill-none stroke-rule')
    }
  })
})
