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
 * 抑制が「祖先を遡る導出」であることが見える。**破線になるのは配下へ入る線だけ**
 *（孫へ入る線は破線、見送りを掲げている子A自身へ入る線は実線のまま、
 * 子B・子Cの枝はそのまま）。
 *
 * 課題0（根）にだけ仮説の行を2本ぶら下げてある。行は箱の高さを押し広げるので、
 * **線が箱の矩形から引かれていれば座標が変わる。**
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
/**
 * **エディタが渡すのと同じ「祖先由来の抑制」。** `suppressedIssueIds` は
 * 見送りを掲げている当の課題も含むが、俯瞰モックの規則では**その課題は
 * 通常どおり描き、入る線も実線**である（薄くなる・破線になるのは配下だけ）。
 * ここで自己包含のまま渡すと、部品は正しいのに画面だけがモックと食い違う
 */
const suppressed = data.issues.map(
  // **「自分が見送っていない」で代用しない**（入れ子の見送りで壊れる。
  // `IssueTreeEditor.tsx` の `inheritedSuppressed` の解説）。親が
  // 「自分または祖先が見送り」の集合に居れば、その子は祖先由来で抑制される
  (node) => node.parentId !== null && suppressedIds.has(node.parentId),
)

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
   * 抑制は**子で判定する**（`suppressed[child.index]`）。境目は
   * 「見送りを掲げている課題**の下**」——その課題へ入る線は実線のまま、
   * 配下へ入る線から破線になる（箱の面が薄くなるのと同じ位置で切り替わる）
   */
  it('見送った課題の配下へ入る線だけが破線になる（見送った課題へ入る線は実線）', () => {
    const container = renderEdges()
    // 課題1（子A）が見送りを掲げている当人。そこへ入る線は実線
    expect(pathFor(container, 0, 1).getAttribute('stroke-dasharray')).toBeNull()
    // その配下（孫）へ入る線から破線になる
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
