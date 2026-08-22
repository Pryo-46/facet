import { describe, expect, it } from 'vitest'
import type { IssueTreeSchemaVersion1 } from '@/types/issue-tree'
import {
  addChildIssue,
  addHypothesis,
  addPendingNote,
  appendDeferral,
  appendJudgement,
  deleteIssueSubtree,
  moveHypothesis,
  normalizeOrder,
  promoteNote,
  setEventNote,
} from './commands'

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

/** 根(0) — 子(1) — 孫(2), 孫(4) ／ 根 — 子(3)。兄弟3つ・深さ2を含む */
function data(): IssueTreeSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'issueTree',
    title: 'T',
    issues: [
      { id: I(0), parentId: null, text: '根', events: [] },
      { id: I(1), parentId: I(0), text: '中間', events: [] },
      { id: I(2), parentId: I(1), text: '葉A', events: [] },
      { id: I(4), parentId: I(1), text: '葉C', events: [] },
      { id: I(3), parentId: I(0), text: '葉B', events: [] },
    ],
    hypotheses: [
      { id: H(1), issueId: I(3), text: '仮説1', rationale: '', events: [], pendingNotes: [] },
      { id: H(2), issueId: I(2), text: '仮説2', rationale: '', events: [], pendingNotes: [] },
      { id: H(3), issueId: I(2), text: '仮説3', rationale: '', events: [], pendingNotes: [] },
    ],
  }
}

describe('normalizeOrder', () => {
  it('課題を DFS 行きがけ順に、仮説をその課題順に並べ替える', () => {
    const next = normalizeOrder(data())
    expect(next.issues.map((n) => n.id)).toEqual([I(0), I(1), I(2), I(4), I(3)])
    // I(2) が I(3) より先に来たので、そこにぶら下がる仮説2・3 が前へ出る
    expect(next.hypotheses.map((h) => h.id)).toEqual([H(2), H(3), H(1)])
  })

  it('同じ課題の中の相対順は変えない（表示順の正だから）', () => {
    const d = data()
    d.hypotheses = [d.hypotheses[2], d.hypotheses[1], d.hypotheses[0]] // H3, H2, H1
    expect(normalizeOrder(d).hypotheses.map((h) => h.id)).toEqual([H(3), H(2), H(1)])
  })

  it('ぶら下がり先が実在しない仮説は末尾に元の順で残す（消さない）', () => {
    const d = data()
    d.hypotheses = [
      { id: H(9), issueId: 'issue_ZZZZZZZZZZ', text: '迷子', rationale: '', events: [], pendingNotes: [] },
      ...d.hypotheses,
    ]
    const next = normalizeOrder(d)
    expect(next.hypotheses.map((h) => h.id)).toEqual([H(2), H(3), H(1), H(9)])
  })
})

describe('課題の構造編集', () => {
  it('子を足すと部分木の直後に入り、そこへフォーカスが行く', () => {
    const next = addChildIssue(normalizeOrder(data()), 1) // I(1) の子
    expect(next.data.issues.map((n) => n.id).slice(0, 5)).toEqual([I(0), I(1), I(2), I(4), expect.any(String)])
    expect(next.data.issues[4].parentId).toBe(I(1))
    expect(next.focus).toEqual({ cell: 'issue', index: 4 })
  })

  it('部分木を消すと、その配下にぶら下がる仮説も一緒に消える', () => {
    // **仮説を残すと、どの課題にも属さない孤児が黙って増える**
    const next = deleteIssueSubtree(normalizeOrder(data()), 1) // I(1) 以下（I(2), I(4)）
    expect(next.data.issues.map((n) => n.id)).toEqual([I(0), I(3)])
    expect(next.data.hypotheses.map((h) => h.id)).toEqual([H(1)])
  })
})

describe('仮説とメモ', () => {
  it('仮説を足すと、その課題の末尾に入る', () => {
    const next = addHypothesis(normalizeOrder(data()), 2) // I(2)
    const forIssue2 = next.data.hypotheses.filter((h) => h.issueId === I(2))
    expect(forIssue2.map((h) => h.id).slice(0, 2)).toEqual([H(2), H(3)])
    expect(forIssue2).toHaveLength(3)
    expect(forIssue2[2].text).toBe('')
    expect(forIssue2[2].id.startsWith('hypothesis_')).toBe(true)
  })

  it('仮説の並び替えは同じ課題の中だけで起きる', () => {
    // 隣の課題の仮説と入れ替える実装と取り違えられないよう、
    // 別の課題の仮説を挟んだ状態（正規化前）で端の仮説を動かす
    const d = normalizeOrder(data())
    const at = d.hypotheses.findIndex((h) => h.id === H(3))
    const next = moveHypothesis(d, at, 1) // 課題内の末尾。動かない
    expect(next.data.hypotheses.map((h) => h.id)).toEqual([H(2), H(3), H(1)])
    expect(next.focus).toBe(null)
  })

  it('メモを足すと空文字が1件増え、そこへフォーカスが行く', () => {
    const next = addPendingNote(normalizeOrder(data()), 0)
    expect(next.data.hypotheses[0].pendingNotes).toEqual([''])
    expect(next.focus).toEqual({ cell: 'note', index: 0, noteIndex: 0 })
  })
})

describe('イベントの追記（D2: 追記専用）', () => {
  it('判断イベントは末尾に足され、過去の要素を書き換えない', () => {
    const d = normalizeOrder(data())
    const once = appendJudgement(d, 0, 'rejected')
    const twice = appendJudgement(once.data, 0, 'supported')
    expect(twice.data.hypotheses[0].events).toEqual([
      { kind: 'rejected', note: '' },
      { kind: 'supported', note: '' },
    ])
    expect(twice.focus).toEqual({ cell: 'event', index: 0, eventIndex: 1 })
  })

  it('課題ノードへは見送り系だけを追記する', () => {
    const next = appendDeferral(normalizeOrder(data()), 1, 'deferred')
    expect(next.data.issues[1].events).toEqual([{ kind: 'deferred', note: '' }])
  })

  it('最新イベントの note は書けるが、過去のイベントは書き換えられない', () => {
    const d = appendJudgement(appendJudgement(normalizeOrder(data()), 0, 'rejected').data, 0, 'supported').data
    const ok = setEventNote(d, 0, 1, '中央値4.2秒')
    expect(ok.hypotheses[0].events[1].note).toBe('中央値4.2秒')
    const blocked = setEventNote(d, 0, 0, '後から根拠を足す')
    expect(blocked).toBe(d) // 同一参照＝何も起きていない
  })

  it('メモは選んだものだけが最新イベントの根拠へ移る（D9）', () => {
    let d = normalizeOrder(data())
    d = addPendingNote(d, 0).data
    d = { ...d, hypotheses: d.hypotheses.map((h, i) => (i === 0 ? { ...h, pendingNotes: ['採る', '雑談', '採る2'] } : h)) }
    d = appendJudgement(d, 0, 'supported').data
    d = promoteNote(d, 0, 0).data
    d = promoteNote(d, 0, 1).data // 「雑談」を飛ばして「採る2」を採る（添字は詰まっている）
    expect(d.hypotheses[0].events[0].note).toBe('採る\n採る2')
    expect(d.hypotheses[0].pendingNotes).toEqual(['雑談'])
  })

  it('イベントが1件も無いときメモは移せない（根拠の行き先が無い）', () => {
    let d = normalizeOrder(data())
    d = { ...d, hypotheses: d.hypotheses.map((h, i) => (i === 0 ? { ...h, pendingNotes: ['メモ'] } : h)) }
    expect(promoteNote(d, 0, 0).data).toBe(d)
  })
})
