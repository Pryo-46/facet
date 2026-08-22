import { describe, expect, it } from 'vitest'
import type { Hypothesis, IssueNode } from '@/types/issue-tree'
import {
  EVENT_KIND_LABELS,
  hypothesisStatus,
  latestKind,
  leafIssueIds,
  poseQuestions,
  suppressedIssueIds,
  tallyLine,
  tallyQuestions,
} from './derive'

const id = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const hid = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

/** 根(0) — 子(1) — 孫(2) ／ 根 — 子(3) ／ 子(1) — 孫(4)。兄弟3つ・深さ2を含む */
function issues(): IssueNode[] {
  return [
    { id: id(0), parentId: null, text: '根', events: [] },
    { id: id(1), parentId: id(0), text: '中間', events: [] },
    { id: id(2), parentId: id(1), text: '葉A', events: [] },
    { id: id(3), parentId: id(0), text: '葉B', events: [] },
    { id: id(4), parentId: id(1), text: '葉C', events: [] },
  ]
}

function hypothesis(n: number, issueId: string, over: Partial<Hypothesis> = {}): Hypothesis {
  return { id: hid(n), issueId, text: `仮説${n}`, rationale: '', events: [], pendingNotes: [], ...over }
}

describe('latestKind / ステータスの導出（D2）', () => {
  it('events が空なら null（＝未決）', () => {
    expect(latestKind([])).toBe(null)
    expect(hypothesisStatus(hypothesis(1, id(2)))).toBe('undecided')
  })

  it('**最後の**要素の kind を返す（判断の覆りが履歴を消さずに表現できる）', () => {
    // 先頭を返す実装と取り違えられないよう、3件で最初・中間・最後をすべて別の値にする
    const h = hypothesis(1, id(2), {
      events: [
        { kind: 'rejected', note: '一度は棄却' },
        { kind: 'deferred', note: '見送り' },
        { kind: 'supported', note: '半年後に復活して支持' },
      ],
    })
    expect(hypothesisStatus(h)).toBe('supported')
  })
})

describe('leafIssueIds（D1: 問いが立つのは葉だけ）', () => {
  it('子を持つ課題は葉に数えない', () => {
    expect([...leafIssueIds(issues())].sort()).toEqual([id(2), id(3), id(4)].sort())
  })

  it('親が実在しない課題は、その親を非葉にしない', () => {
    // 参照切れは図の上でルートとして描かれる（整合性検証が別に赤くする）。
    // 存在しない親の id で葉判定を左右させない
    const broken: IssueNode[] = [
      { id: id(0), parentId: null, text: '根', events: [] },
      { id: id(9), parentId: 'issue_ZZZZZZZZZZ', text: '迷子', events: [] },
    ]
    expect([...leafIssueIds(broken)].sort()).toEqual([id(0), id(9)].sort())
  })
})

describe('suppressedIssueIds（D3: 抑制は祖先を遡る導出）', () => {
  it('見送りを付けた課題と、その子孫すべてを含む', () => {
    const list = issues()
    list[1] = { ...list[1], events: [{ kind: 'deferred', note: '初回受検フローの成立が先' }] }
    expect([...suppressedIssueIds(list)].sort()).toEqual([id(1), id(2), id(4)].sort())
  })

  it('本開発送りも抑制する（見送り系2種のどちらでも同じ）', () => {
    const list = issues()
    list[1] = { ...list[1], events: [{ kind: 'deferredToMainDev', note: '' }] }
    expect(suppressedIssueIds(list).has(id(2))).toBe(true)
  })

  it('兄弟の枝には及ばない', () => {
    const list = issues()
    list[1] = { ...list[1], events: [{ kind: 'deferred', note: '' }] }
    expect(suppressedIssueIds(list).has(id(3))).toBe(false)
  })

  it('循環しているファイルでも止まらない（レベル2は受け入れて開く）', () => {
    const cyclic: IssueNode[] = [
      { id: id(0), parentId: id(1), text: 'a', events: [] },
      { id: id(1), parentId: id(0), text: 'b', events: [] },
    ]
    expect(() => suppressedIssueIds(cyclic)).not.toThrow()
    expect(suppressedIssueIds(cyclic).size).toBe(0)
  })
})

describe('poseQuestions（問いの立ち方）', () => {
  it('葉で仮説が0件なら「仮説は？」が立ち、中間ノードには立たない（D1 折衷案）', () => {
    const posed = poseQuestions({ issues: issues(), hypotheses: [] })
    expect(posed.issueNeedsHypothesis).toEqual([false, false, true, true, true])
  })

  it('中間ノードに仮説を付けても、その仮説の「検証結果は？」は立つ', () => {
    // 仮説はどのノードにも付けられる。抑えているのは「仮説は？」の問いだけ
    const posed = poseQuestions({ issues: issues(), hypotheses: [hypothesis(1, id(1))] })
    expect(posed.issueNeedsHypothesis[1]).toBe(false)
    expect(posed.hypothesisQuestions[0].result).toBe(true)
  })

  it('仮説が付いた葉には「仮説は？」が立たない', () => {
    const posed = poseQuestions({ issues: issues(), hypotheses: [hypothesis(1, id(2))] })
    expect(posed.issueNeedsHypothesis[2]).toBe(false)
    expect(posed.issueNeedsHypothesis[3]).toBe(true)
  })

  it('pendingNotes が残っていれば「判断は？」が立つ（D9 の締め忘れ検出）', () => {
    const h = hypothesis(1, id(2), {
      events: [{ kind: 'supported', note: '' }],
      pendingNotes: ['SHが「分単位窓では？」と発言'],
    })
    const posed = poseQuestions({ issues: issues(), hypotheses: [h] })
    expect(posed.hypothesisQuestions[0]).toEqual({ result: false, judgement: true })
  })

  it('祖先が見送りなら配下の3つの問いはすべて立たない', () => {
    const list = issues()
    list[1] = { ...list[1], events: [{ kind: 'deferred', note: '' }] }
    const h = hypothesis(1, id(2), { pendingNotes: ['メモ'] })
    const posed = poseQuestions({ issues: list, hypotheses: [h] })
    expect(posed.issueNeedsHypothesis[2]).toBe(false)
    expect(posed.issueNeedsHypothesis[4]).toBe(false)
    expect(posed.hypothesisQuestions[0]).toEqual({ result: false, judgement: false })
    // 抑制の外にある兄弟の枝は立ったまま
    expect(posed.issueNeedsHypothesis[3]).toBe(true)
  })
})

describe('集計と表示文言（アプリと Skill が同じ文字列を出す）', () => {
  it('立っている問いだけを数える', () => {
    const list = issues()
    const hypotheses = [
      hypothesis(1, id(2)), // 検証結果は？
      hypothesis(2, id(3), { events: [{ kind: 'supported', note: '' }], pendingNotes: ['x'] }), // 判断は？
    ]
    const t = tallyQuestions(poseQuestions({ issues: list, hypotheses }))
    // 葉は 2/3/4 の3つ。2 と 3 には仮説が付いたので「仮説は？」は 4 の1件だけ
    expect(t).toEqual({ hypothesis: 1, result: 1, judgement: 1, total: 3 })
  })

  it('帯に出す1行が組み立てられる', () => {
    expect(tallyLine({ hypothesis: 1, result: 2, judgement: 0, total: 3 })).toBe(
      '⚠ 未決 3（仮説は？ 1 ／ 検証結果は？ 2 ／ 判断は？ 0）',
    )
  })

  it('6種すべてに表示ラベルがある', () => {
    expect(EVENT_KIND_LABELS.supported).toBe('支持')
    expect(EVENT_KIND_LABELS.rejected).toBe('棄却')
    expect(EVENT_KIND_LABELS.supportedWithoutTest).toBe('自明に成立')
    expect(EVENT_KIND_LABELS.rejectedWithoutTest).toBe('検証せず棄却')
    expect(EVENT_KIND_LABELS.deferred).toBe('今回見送り')
    expect(EVENT_KIND_LABELS.deferredToMainDev).toBe('本開発送り')
  })
})
