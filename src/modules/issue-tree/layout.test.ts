import { describe, expect, it } from 'vitest'
import { createEstimateMeasurer } from '@/core/canvas/wrap'
import type { IssueTreeSchemaVersion1 } from '@/types/issue-tree'
import { poseQuestions } from './derive'
import { CARD_INDENT, CARD_WIDTH } from './measure'
import { layoutIssueTree } from './layout'

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

const fonts = { body: { measure: createEstimateMeasurer(14), lineHeight: 23 }, small: { measure: createEstimateMeasurer(12), lineHeight: 18 } }

function run(data: IssueTreeSchemaVersion1) {
  return layoutIssueTree(data, poseQuestions(data), fonts)
}

function make(over: Partial<IssueTreeSchemaVersion1>): IssueTreeSchemaVersion1 {
  return { schemaVersion: 1, type: 'issueTree', title: 'T', issues: [], hypotheses: [], ...over }
}

describe('layoutIssueTree', () => {
  it('同じ入力からは同じ出力が出る（図は導出。前回の位置を混ぜない）', () => {
    const data = make({ issues: [{ id: I(0), parentId: null, text: '根', events: [] }] })
    expect(run(data)).toEqual(run(data))
  })

  it('仮説カードは課題ノードの下に字下げして積まれる', () => {
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '結果取得を画面遷移の中で待てるか', events: [] },
        { id: I(1), parentId: I(0), text: '待てないなら何を先に返すか', events: [] },
      ],
      hypotheses: [
        { id: H(1), issueId: I(0), text: '同期取得で間に合う', rationale: '', events: [], pendingNotes: [] },
        { id: H(2), issueId: I(0), text: 'webhook受信に切り替える', rationale: '', events: [], pendingNotes: [] },
      ],
    })
    const out = run(data)
    const node = out.issues[0]!.rect
    const [a, b] = [out.hypotheses[0]!.rect, out.hypotheses[1]!.rect]
    expect(a.x).toBe(node.x + CARD_INDENT)
    expect(a.width).toBe(CARD_WIDTH)
    expect(a.y).toBeGreaterThan(node.y + node.height - 1)
    expect(b.y).toBeGreaterThan(a.y + a.height - 1)
    // カードの幅はブロックの幅に効く（列の x は深さごとのブロック幅の最大で
    // 決まるので、ここを数え落とすと**子の列がカードの上に乗る**）
    expect(out.issues[1]!.rect.x).toBeGreaterThanOrEqual(b.x + b.width)
  })

  it('問いが立っている仮説にだけバッジの場所が確保される', () => {
    const data = make({
      issues: [{ id: I(0), parentId: null, text: '根', events: [] }],
      hypotheses: [
        { id: H(1), issueId: I(0), text: '未決の仮説', rationale: '', events: [], pendingNotes: [] },
        { id: H(2), issueId: I(0), text: '決着した仮説', rationale: '', events: [{ kind: 'supported', note: '' }], pendingNotes: [] },
      ],
    })
    const out = run(data)
    expect(out.hypotheses[0]!.badge).not.toBe(null)
    expect(out.hypotheses[1]!.badge).toBe(null)
  })

  it('イベントは種類ラベルの行と根拠の行を持つ', () => {
    const data = make({
      issues: [{ id: I(0), parentId: null, text: '根', events: [] }],
      hypotheses: [
        {
          id: H(1),
          issueId: I(0),
          text: '仮説',
          rationale: '',
          events: [{ kind: 'rejected', note: '制限は日次でなく分単位窓と判明。夜間に寄せても超過する' }],
          pendingNotes: [],
        },
      ],
    })
    const card = run(data).hypotheses[0]!
    expect(card.events).toHaveLength(1)
    expect(card.events[0].note.y).toBeGreaterThan(card.events[0].label.y)
    // 根拠は字下げされる
    expect(card.events[0].note.x).toBeGreaterThan(card.rect.x)
  })

  it('子の課題は親より右の列に置かれ、親のブロックとは重ならない', () => {
    // **兄弟3つ・深さ2にする**——兄弟2つ・深さ1では「常に先頭」「常に末尾」
    // のような別実装でも同じ座標になりうる
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '根', events: [] },
        { id: I(1), parentId: I(0), text: '子A', events: [] },
        { id: I(2), parentId: I(1), text: '孫', events: [] },
        { id: I(3), parentId: I(0), text: '子B', events: [] },
        { id: I(4), parentId: I(0), text: '子C', events: [] },
      ],
    })
    const out = run(data)
    const [root, a, g, b, c] = out.issues.map((p) => p!.rect)
    expect(a.x).toBeGreaterThan(root.x)
    expect(g.x).toBeGreaterThan(a.x)
    expect(b.y).toBeGreaterThan(a.y)
    expect(c.y).toBeGreaterThan(b.y)
  })

  it('仮説カードの高さは兄弟の間隔に効く（次の兄弟はカードの下に来る）', () => {
    // ブロック（課題ノード＋ぶら下がるカード）の高さを木のレイアウトへ渡して
    // いることを見る。カードの高さを数え落とすと、次の兄弟がカードに重なる
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '根', events: [] },
        { id: I(1), parentId: I(0), text: '結果取得を画面遷移の中で待てるか', events: [] },
        { id: I(2), parentId: I(0), text: '再受検の扱い', events: [] },
        { id: I(3), parentId: I(0), text: '通知の宛先をどこから引くか', events: [] },
      ],
      hypotheses: [
        { id: H(1), issueId: I(1), text: '同期取得で間に合う', rationale: '既存の応答は概ね一秒以内', events: [], pendingNotes: [] },
        { id: H(2), issueId: I(1), text: '受信を待つ作りに切り替える', rationale: '', events: [], pendingNotes: ['採否は次回の設計会で決める'] },
      ],
    })
    const out = run(data)
    const lastCard = out.hypotheses[1]!.rect
    const next = out.issues[2]!.rect
    expect(next.y).toBeGreaterThan(lastCard.y + lastCard.height - 1)
  })

  it('循環して根から到達できない課題は位置を持たない（図に描かれない）', () => {
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '根', events: [] },
        { id: I(1), parentId: I(2), text: 'a', events: [] },
        { id: I(2), parentId: I(1), text: 'b', events: [] },
      ],
    })
    const out = run(data)
    expect(out.issues[0]).not.toBe(null)
    expect(out.issues[1]).toBe(null)
    expect(out.issues[2]).toBe(null)
  })

  it('見送りイベントは課題ノードの直下に行を持ち、抑制された子には説明の行が出る', () => {
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '再受検の扱い', events: [{ kind: 'deferred', note: '初回受検フローの成立が先' }] },
        { id: I(1), parentId: I(0), text: '受検IDの再発行が要るか', events: [] },
      ],
    })
    const out = run(data)
    expect(out.issues[0]!.deferrals).toHaveLength(1)
    expect(out.issues[0]!.suppressedNote).toBe(null) // 自分が見送りを持つ側には出さない
    expect(out.issues[1]!.deferrals).toEqual([])
    expect(out.issues[1]!.suppressedNote).not.toBe(null)
    // 見送りの行もブロックの幅に効く（課題ノードより横に長いので、
    // 数え落とすと子の列が見送りの行の上に乗る）
    const defRect = out.issues[0]!.deferrals[0]
    expect(out.issues[1]!.rect.x).toBeGreaterThanOrEqual(defRect.x + defRect.width)
  })
})
