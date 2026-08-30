import { describe, expect, it } from 'vitest'
import type { Hypothesis, IssueNode } from '@/types/issue-tree'
import type { FocusTarget } from './commands'
import { poseQuestions, tallyQuestions } from './derive'
import {
  listFlaggedTargets,
  listOpenTargets,
  nextFlaggedTarget,
  nextOpenTarget,
  type OpenTarget,
} from './open-targets'

const id = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const hid = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

function hypothesis(n: number, issueId: string, over: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: hid(n),
    issueId,
    title: `仮説${n}`,
    detail: '',
    value: '',
    asks: [],
    feedbacks: [],
    events: [],
    ...over,
  }
}

/** 問いは `poseQuestions` の答えをそのまま使う（列が問いの条件を二度書いていないことの検査でもある） */
const targetsOf = (issues: IssueNode[], hypotheses: Hypothesis[]): [string, FocusTarget][] => {
  const data = { issues, hypotheses }
  return listOpenTargets(data, poseQuestions(data)).map((t) => [t.kind, t.focus])
}

describe('listOpenTargets（要対応の並び）', () => {
  it('課題の DFS 順に、課題の「仮説なし」→ その仮説の問い、の順で並ぶ', () => {
    // 根(0) → 子(1){仮説なし} / 子(2){仮説A: 未決, 仮説B: 保留, 仮説C: FB待ち}。
    // **仮説の配列順は B, A, C** にして「配列順」と「問いの種類ごと」の
    // 取り違えを検知する（種類で舐めると 未決→保留→FB待ち＝A, B, C の順になる）
    const issues: IssueNode[] = [
      { id: id(0), parentId: null, text: '根', events: [] },
      { id: id(1), parentId: id(0), text: '子1', events: [] },
      { id: id(2), parentId: id(0), text: '子2', events: [] },
    ]
    const hypotheses = [
      hypothesis(2, id(2), { events: [{ kind: 'onHold', note: '', date: '2026-08-30' }] }),
      hypothesis(1, id(2)),
      // FB待ちだけを立てるので、判断は付けたうえで文言のある問いを未回答にする
      //（events が0件だと未決も一緒に立ち、この仮説から2件出る）
      hypothesis(3, id(2), {
        events: [{ kind: 'supported', note: '', date: '2026-08-30' }],
        asks: [{ id: 'ask_AAAAAAAAAA', text: '締め忘れないか' }],
      }),
    ]
    expect(targetsOf(issues, hypotheses)).toEqual([
      ['hypothesis', { cell: 'issue', index: 1 }],
      ['hold', { cell: 'hypothesis', index: 0 }], // B
      ['result', { cell: 'hypothesis', index: 1 }], // A
      ['feedback', { cell: 'hypothesis', index: 2 }], // C
    ])
  })

  /**
   * 上のケースは仮説が1つの課題に集まっているので、「課題ごとにまとめる」を
   * 「仮説の配列を頭から舐める」に取り違えても同じ答えになる。
   * **課題をまたぐ並びを別に置く**——正規化を通っていないファイル（手で編んだもの）
   * では配列順と課題順が食い違い、そこで初めて実装の差が出る
   */
  it('仮説の配列が課題順に整っていなくても、課題ごとにまとまる', () => {
    const issues: IssueNode[] = [
      { id: id(0), parentId: null, text: '根', events: [] },
      { id: id(1), parentId: id(0), text: '子1', events: [] },
      { id: id(2), parentId: id(0), text: '子2', events: [] },
    ]
    // 配列は 子2 → 子1 → 子2 の順（正規化前）。列は 子1 の1件が先に来る
    const hypotheses = [hypothesis(1, id(2)), hypothesis(2, id(1)), hypothesis(3, id(2))]
    expect(targetsOf(issues, hypotheses)).toEqual([
      ['result', { cell: 'hypothesis', index: 1 }],
      ['result', { cell: 'hypothesis', index: 0 }],
      ['result', { cell: 'hypothesis', index: 2 }],
    ])
  })

  it('1つの仮説に複数の問いが立つときは 未決→保留→FB待ち の順（tallyLine の内訳と同じ並び）', () => {
    const issues: IssueNode[] = [{ id: id(0), parentId: null, text: '根', events: [] }]
    // 保留のまま FB待ちが残っている＝保留と FB待ちが同時に立つ
    const hypotheses = [
      hypothesis(1, id(0), {
        events: [{ kind: 'onHold', note: '', date: '2026-08-30' }],
        asks: [{ id: 'ask_AAAAAAAAAA', text: 'FB' }],
      }),
    ]
    expect(targetsOf(issues, hypotheses)).toEqual([
      ['hold', { cell: 'hypothesis', index: 0 }],
      ['feedback', { cell: 'hypothesis', index: 0 }],
    ])
  })

  it('抑制された配下は列に入らない（posed が立てていない）', () => {
    const issues: IssueNode[] = [
      { id: id(0), parentId: null, text: '根', events: [] },
      // 見送った課題。**自分の「仮説なし」も配下の仮説の問いも立たない**
      { id: id(1), parentId: id(0), text: '見送り', events: [{ kind: 'deferred', note: '', date: '2026-08-30' }] },
      { id: id(2), parentId: id(1), text: '配下の葉', events: [] },
    ]
    const hypotheses = [
      hypothesis(1, id(1)),
      hypothesis(2, id(2), { asks: [{ id: 'ask_AAAAAAAAAA', text: 'FB' }] }),
    ]
    expect(targetsOf(issues, hypotheses)).toEqual([])
  })

  it('ぶら下がり先の課題が図に無い仮説は列に入らない（行き先にしても視点が動かない）', () => {
    const issues: IssueNode[] = [{ id: id(0), parentId: null, text: '根', events: [] }]
    const hypotheses = [hypothesis(1, id(0)), hypothesis(2, id(9))]
    expect(targetsOf(issues, hypotheses)).toEqual([['result', { cell: 'hypothesis', index: 0 }]])
  })

  it('FB待ちの行き先は仮説につき1つ（問いが2件でも列は1つ）', () => {
    // **チップの数と列の長さが食い違うことを、意図として固定する。**
    // m5 が問いに固有のセルを与えたら、この it は「問いごとに1つ」へ書き換わる
    const issues: IssueNode[] = [{ id: id(0), parentId: null, text: '根', events: [] }]
    const h = hypothesis(1, id(0), {
      asks: [
        { id: 'ask_AAAAAAAAAA', text: '離脱しないか' },
        { id: 'ask_BBBBBBBBBB', text: '制限に当たらないか' },
      ],
      feedbacks: [],
    })
    const data = { issues, hypotheses: [h] }
    const posed = poseQuestions(data)
    expect(tallyQuestions(posed).feedback).toBe(2)
    expect(listOpenTargets(data, posed).filter((t) => t.kind === 'feedback')).toHaveLength(1)
  })
})

describe('nextOpenTarget（次の1件）', () => {
  const at = (index: number): OpenTarget => ({ kind: 'result', focus: { cell: 'hypothesis', index } })
  /** 同じ種類が3件（0,1,2）。間に別の種類を挟んで、絞り込みを飛ばした実装と区別する */
  const targets: OpenTarget[] = [
    at(0),
    { kind: 'hold', focus: { cell: 'hypothesis', index: 5 } },
    at(1),
    at(2),
  ]

  it('current の後ろを返す', () => {
    expect(nextOpenTarget(targets, 'result', { cell: 'hypothesis', index: 1 })).toEqual(at(2))
  })

  it('末尾なら先頭に戻る', () => {
    expect(nextOpenTarget(targets, 'result', { cell: 'hypothesis', index: 2 })).toEqual(at(0))
  })

  it('current が列に無ければ先頭（別の種類に居るとき・どこにも居ないとき）', () => {
    expect(nextOpenTarget(targets, 'result', { cell: 'hypothesis', index: 5 })).toEqual(at(0))
    expect(nextOpenTarget(targets, 'result', { cell: 'issue', index: 0 })).toEqual(at(0))
    expect(nextOpenTarget(targets, 'result', null)).toEqual(at(0))
  })

  it('同じ添字でも cell が違えば別のセル（課題の欄と仮説の欄を取り違えない）', () => {
    const mixed: OpenTarget[] = [
      { kind: 'hypothesis', focus: { cell: 'issue', index: 0 } },
      { kind: 'hypothesis', focus: { cell: 'issue', index: 1 } },
    ]
    // 仮説の0番に居ても、課題の0番に居るとは見なさない＝先頭から始まる
    expect(nextOpenTarget(mixed, 'hypothesis', { cell: 'hypothesis', index: 0 })).toEqual(mixed[0])
  })

  it('列が空なら null（チップが描かれていない種類）', () => {
    expect(nextOpenTarget(targets, 'feedback', null)).toBe(null)
    expect(nextOpenTarget([], 'result', null)).toBe(null)
  })
})

describe('listFlaggedTargets / nextFlaggedTarget（旗の巡回）', () => {
  const issue = (issueId: string, parentId: string | null, kind?: 'deferred' | 'resolved') => ({
    id: issueId,
    parentId,
    text: '課題',
    events: kind === undefined ? [] : [{ kind, note: '今回は追わない', date: '2026-08-30' }],
  })

  it('見送りを掲げた課題だけが行き先（配下の抑制は入らない）', () => {
    const data = {
      issues: [
        issue('issue_AAAAAAAAAA', null, 'deferred'),
        issue('issue_BBBBBBBBBB', 'issue_AAAAAAAAAA'), // 抑制されるが掲げていない
        issue('issue_CCCCCCCCCC', 'issue_AAAAAAAAAA', 'deferred'), // 入れ子でも入る
      ],
    }
    expect(listFlaggedTargets(data, 'deferred')).toEqual([
      { cell: 'issue', index: 0 },
      { cell: 'issue', index: 2 },
    ])
  })

  it('旗の巡回列は種別ごとに分かれる（見送りと解決が混ざらない）', () => {
    const flagged = [
      issue('issue_AAAAAAAAAA', null),
      issue('issue_BBBBBBBBBB', 'issue_AAAAAAAAAA', 'deferred'),
      issue('issue_CCCCCCCCCC', 'issue_AAAAAAAAAA', 'resolved'),
    ]
    expect(listFlaggedTargets({ issues: flagged }, 'deferred')).toEqual([{ cell: 'issue', index: 1 }])
    expect(listFlaggedTargets({ issues: flagged }, 'resolved')).toEqual([{ cell: 'issue', index: 2 }])
  })

  it('末尾の次は先頭へ戻り、current が列に無ければ先頭、空なら null（3件以上で退化を防ぐ）', () => {
    const targets = [
      { cell: 'issue' as const, index: 0 },
      { cell: 'issue' as const, index: 2 },
      { cell: 'issue' as const, index: 5 },
    ]
    expect(nextFlaggedTarget(targets, null)).toEqual({ cell: 'issue', index: 0 })
    expect(nextFlaggedTarget(targets, { cell: 'issue', index: 0 })).toEqual({ cell: 'issue', index: 2 })
    expect(nextFlaggedTarget(targets, { cell: 'issue', index: 2 })).toEqual({ cell: 'issue', index: 5 })
    expect(nextFlaggedTarget(targets, { cell: 'issue', index: 5 })).toEqual({ cell: 'issue', index: 0 })
    expect(nextFlaggedTarget([], null)).toBeNull()
  })
})
