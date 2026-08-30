import { describe, expect, it } from 'vitest'
import type { Feedback, Hypothesis, IssueTreeSchemaVersion4 } from '@/types/issue-tree'
import {
  addAsk,
  addChildIssue,
  addFeedback,
  addFeedbackAfter,
  addHypothesis,
  addRootIssue,
  clearJudgement,
  deleteIssueSubtree,
  moveFeedback,
  moveHypothesis,
  moveIssueSibling,
  normalizeOrder,
  removeAsk,
  removeFeedback,
  setAskText,
  setEventNote,
  setFeedbackSentiment,
  setHypothesisDetail,
  setHypothesisValue,
  setIssueEventNote,
  setJudgement,
  toggleIssueEvent,
} from './commands'

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

/** 根(0) — 子(1) — 孫(2), 孫(4) ／ 根 — 子(3)。兄弟3つ・深さ2を含む */
function base(): IssueTreeSchemaVersion4 {
  return {
    schemaVersion: 4,
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
      { id: H(1), issueId: I(3), title: '仮説1', detail: '', value: '', asks: [], feedbacks: [], events: [] },
      { id: H(2), issueId: I(2), title: '仮説2', detail: '', value: '', asks: [], feedbacks: [], events: [] },
      { id: H(3), issueId: I(2), title: '仮説3', detail: '', value: '', asks: [], feedbacks: [], events: [] },
    ],
  }
}

const R = I(10)
const X = I(11)
const Y = I(12)
const YCHILD = I(13)
const Z = I(14)

/**
 * 根 R — X, Y, Z（兄弟3つ）／ Y — Ychild。
 * 仮説の id は H(11)=X / H(12)=Y / H(13)=Ychild / H(14)=Z にぶら下がる
 */
function branched(hypothesisIds: string[]): IssueTreeSchemaVersion4 {
  const issueOf: Record<string, string> = { [H(11)]: X, [H(12)]: Y, [H(13)]: YCHILD, [H(14)]: Z }
  return {
    schemaVersion: 4,
    type: 'issueTree',
    title: 'T',
    issues: [
      { id: R, parentId: null, text: '根', events: [] },
      { id: X, parentId: R, text: 'X', events: [] },
      { id: Y, parentId: R, text: 'Y', events: [] },
      { id: YCHILD, parentId: Y, text: 'Yの子', events: [] },
      { id: Z, parentId: R, text: 'Z', events: [] },
    ],
    hypotheses: hypothesisIds.map((id) => ({
      id,
      issueId: issueOf[id],
      title: '仮説',
      detail: '',
      value: '',
      asks: [],
      feedbacks: [],
      events: [],
    })),
  }
}

describe('normalizeOrder', () => {
  it('課題を DFS 行きがけ順に、仮説をその課題順に並べ替える', () => {
    const next = normalizeOrder(base())
    expect(next.issues.map((n) => n.id)).toEqual([I(0), I(1), I(2), I(4), I(3)])
    // I(2) が I(3) より先に来たので、そこにぶら下がる仮説2・3 が前へ出る
    expect(next.hypotheses.map((h) => h.id)).toEqual([H(2), H(3), H(1)])
  })

  it('同じ課題の中の相対順は変えない（表示順の正だから）', () => {
    const d = base()
    d.hypotheses = [d.hypotheses[2], d.hypotheses[1], d.hypotheses[0]] // H3, H2, H1
    expect(normalizeOrder(d).hypotheses.map((h) => h.id)).toEqual([H(3), H(2), H(1)])
  })

  it('ぶら下がり先が実在しない仮説は末尾に元の順で残す（消さない）', () => {
    const d = base()
    d.hypotheses = [
      {
        id: H(9),
        issueId: 'issue_ZZZZZZZZZZ',
        title: '迷子',
        detail: '',
        value: '',
        asks: [],
        feedbacks: [],
        events: [],
      },
      ...d.hypotheses,
    ]
    const next = normalizeOrder(d)
    expect(next.hypotheses.map((h) => h.id)).toEqual([H(2), H(3), H(1), H(9)])
  })
})

describe('課題の構造編集', () => {
  it('子を足すと部分木の直後に入り、そこへフォーカスが行く', () => {
    const next = addChildIssue(normalizeOrder(base()), 1) // I(1) の子
    expect(next.data.issues.map((n) => n.id).slice(0, 5)).toEqual([I(0), I(1), I(2), I(4), expect.any(String)])
    expect(next.data.issues[4].parentId).toBe(I(1))
    expect(next.focus).toEqual({ cell: 'issue', index: 4 })
  })

  it('循環を含むファイルに根を足しても、フォーカスは足した課題を指す', () => {
    // 出力を正規化する以上、**位置は参照の同一性で引き直さないと**
    // 別の実在ノード（循環側）を指す——空欄だと思って打つと他人の文言を潰す
    const d: IssueTreeSchemaVersion4 = {
      schemaVersion: 4,
      type: 'issueTree',
      title: 'T',
      issues: [
        { id: 'issue_cycA00000', parentId: 'issue_cycB00000', text: 'cycA', events: [] },
        { id: 'issue_cycB00000', parentId: 'issue_cycA00000', text: 'cycB', events: [] },
      ],
      hypotheses: [],
    }
    const r = addRootIssue(d)
    // 循環ノードは orderFlatNodes が末尾へ寄せるので、新しい根は先頭に来る
    expect(r.data.issues.map((n) => n.text)).toEqual(['', 'cycA', 'cycB'])
    expect(r.focus).toEqual({ cell: 'issue', index: 0 })
  })

  it('課題を動かすと、仮説の配列順も新しい課題順に付いてくる', () => {
    // **課題の並びが変わる編集は、仮説の並びも道連れにする**——スキーマは
    // hypotheses の配列順を「ぶら下がり先の課題の順」と定めているので、
    // 課題だけ動かして仮説を置き去りにするとその規約が破れる
    const d = normalizeOrder(branched([H(11), H(12), H(14)]))
    expect(d.issues.map((n) => n.id)).toEqual([R, X, Y, YCHILD, Z])
    expect(d.hypotheses.map((h) => h.id)).toEqual([H(11), H(12), H(14)])

    const next = moveIssueSibling(d, 4, -1) // Z を Y の前へ（部分木ごと動く）
    expect(next.data.issues.map((n) => n.id)).toEqual([R, X, Z, Y, YCHILD])
    expect(next.data.hypotheses.map((h) => h.id)).toEqual([H(11), H(14), H(12)])
    expect(next.focus).toEqual({ cell: 'issue', index: 2 })
  })

  it('正規化前の入力を消しても、残る仮説は課題順に並べ直して返す', () => {
    // 入力の課題順が行きがけ順でないとき、課題だけ並べ替えて仮説を
    // 入力のまま filter すると、規約を破った文書を吐く
    const d = branched([H(13), H(11), H(14)])
    d.issues = [d.issues[0], d.issues[3], d.issues[1], d.issues[2], d.issues[4]] // R, Ychild, X, Y, Z
    const next = deleteIssueSubtree(d, 4) // Z（入力配列での位置）
    expect(next.data.issues.map((n) => n.id)).toEqual([R, X, Y, YCHILD])
    expect(next.data.hypotheses.map((h) => h.id)).toEqual([H(11), H(13)])
  })

  it('部分木を消すと、その配下にぶら下がる仮説も一緒に消える', () => {
    // **仮説を残すと、どの課題にも属さない孤児が黙って増える**
    const next = deleteIssueSubtree(normalizeOrder(base()), 1) // I(1) 以下（I(2), I(4)）
    expect(next.data.issues.map((n) => n.id)).toEqual([I(0), I(3)])
    expect(next.data.hypotheses.map((h) => h.id)).toEqual([H(1)])
  })
})

describe('仮説とFB', () => {
  it('仮説を足すと、その課題の末尾に入る', () => {
    const next = addHypothesis(normalizeOrder(base()), 2) // I(2)
    const forIssue2 = next.data.hypotheses.filter((h) => h.issueId === I(2))
    expect(forIssue2.map((h) => h.id).slice(0, 2)).toEqual([H(2), H(3)])
    expect(forIssue2).toHaveLength(3)
    expect(forIssue2[2].title).toBe('')
    expect(forIssue2[2].id.startsWith('hypothesis_')).toBe(true)
  })

  it('新しい仮説は全キー常在で作られる（asks と feedbacks は空配列）', () => {
    const next = addHypothesis(base(), 0)
    const created = next.data.hypotheses[next.focus?.cell === 'hypothesis' ? next.focus.index : -1]
    expect(created.title).toBe('')
    expect(created.detail).toBe('')
    expect(created.value).toBe('')
    expect(created.asks).toEqual([])
    expect(created.feedbacks).toEqual([])
    expect(created.events).toEqual([])
  })

  it('仮説の並び替えは同じ課題の中だけで起きる', () => {
    // 隣の課題の仮説と入れ替える実装と取り違えられないよう、
    // 別の課題の仮説を挟んだ状態（正規化前）で端の仮説を動かす
    const d = normalizeOrder(base())
    const at = d.hypotheses.findIndex((h) => h.id === H(3))
    const next = moveHypothesis(d, at, 1) // 課題内の末尾。動かない
    expect(next.data.hypotheses.map((h) => h.id)).toEqual([H(2), H(3), H(1)])
    expect(next.focus).toBe(null)
  })

  const fb = (text: string): Feedback => ({
    askId: null,
    text,
    by: '',
    sentiment: 'note',
    date: '2026-08-30',
  })

  /** FB のオブジェクトから文言だけを取り出す（`toEqual` で文字列配列として比較するため） */
  const textsOf = (h: Hypothesis): string[] => h.feedbacks.map((f) => f.text)

  it('アプリが作る FB は「どの問いにも紐づかない・誰の発言か空・ただのメモ」で、日付だけが入る', () => {
    // **sentiment の既定が note なのは、m4 が調子を選ばせる画面を持たないからである。**
    // 嘘の分類（question 等）を既定にすると、選ばれていない分類が記録として残る
    const next = addFeedback(base(), 0, null, '2026-08-30')
    expect(next.data.hypotheses[0].feedbacks).toEqual([
      { askId: null, text: '', by: '', sentiment: 'note', date: '2026-08-30' },
    ])
    expect(next.focus).toEqual({ cell: 'feedback', index: 0, feedbackIndex: 0 })
  })

  /**
   * FB を持つ仮説を**2件**用意する。1件だけだと「対象の仮説だけを差し替える」が
   * 「全部を差し替える」実装と区別できない。FB も3件持たせる——2件だと
   * 上下の入れ替えが同じ結果になり、向きの取り違えを検出できない
   */
  function withFeedbacks(): IssueTreeSchemaVersion4 {
    const d = normalizeOrder(base())
    return {
      ...d,
      hypotheses: d.hypotheses.map((h, i) =>
        i === 0
          ? { ...h, feedbacks: [fb('A'), fb('B'), fb('C')] }
          : i === 1
            ? { ...h, feedbacks: [fb('X'), fb('Y')] }
            : h,
      ),
    }
  }

  it('直後に FB を1件足す（末尾ではなく押した位置の次）', () => {
    // **3件の真ん中で足す。** 末尾で足すと「末尾に足す実装」と結果が
    // 区別できず、`addFeedback` に写した実装でも緑になる
    let d = base()
    d = { ...d, hypotheses: d.hypotheses.map((h, i) => (i === 0 ? { ...h, feedbacks: [fb('A'), fb('B'), fb('C')] } : h)) }
    const next = addFeedbackAfter(d, 0, 1, '2026-08-30')
    expect(textsOf(next.data.hypotheses[0])).toEqual(['A', 'B', '', 'C'])
    expect(next.focus).toEqual({ cell: 'feedback', index: 0, feedbackIndex: 2 })
  })

  it('存在しない FB の直後には足せない', () => {
    const d = withFeedbacks()
    expect(addFeedbackAfter(d, 0, 9).data).toBe(d)
    expect(addFeedbackAfter(d, 99, 0).data).toBe(d)
  })

  it('FB を上下に動かすと、フォーカスは動いた先を指す', () => {
    const d = withFeedbacks()
    const up = moveFeedback(d, 0, 1, -1)
    expect(textsOf(up.data.hypotheses[0])).toEqual(['B', 'A', 'C'])
    expect(up.focus).toEqual({ cell: 'feedback', index: 0, feedbackIndex: 0 })

    const down = moveFeedback(d, 0, 1, 1)
    expect(textsOf(down.data.hypotheses[0])).toEqual(['A', 'C', 'B'])
    expect(down.focus).toEqual({ cell: 'feedback', index: 0, feedbackIndex: 2 })
  })

  it('端の FB は動かない（動かなかった編集は同じ参照を返す）', () => {
    const d = withFeedbacks()
    const top = moveFeedback(d, 0, 0, -1)
    expect(top.data).toBe(d)
    expect(top.focus).toBe(null)

    const bottom = moveFeedback(d, 0, 2, 1)
    expect(bottom.data).toBe(d)
    expect(bottom.focus).toBe(null)
  })

  it('FB の並び替えは他の仮説を巻き込まない', () => {
    const d = withFeedbacks()
    const next = moveFeedback(d, 0, 0, 1)
    expect(textsOf(next.data.hypotheses[1])).toEqual(['X', 'Y'])
    // 差し替えたのは対象の仮説だけ（他は同一参照のまま）
    expect(next.data.hypotheses[1]).toBe(d.hypotheses[1])
    expect(next.data.hypotheses[2]).toBe(d.hypotheses[2])
  })

  it('存在しない仮説・存在しない FB は動かせない', () => {
    const d = withFeedbacks()
    expect(moveFeedback(d, 99, 0, 1).data).toBe(d)
    expect(moveFeedback(d, 0, 9, -1).data).toBe(d)
  })

  /**
   * **調子（`sentiment`）の差し替え**（m5 の追加作業）。それまでアプリから入る
   * 調子は `note`（`newFeedback` の既定）だけで、**スキーマが受け入れる4語のうち
   * 3語はアプリから選べなかった**。
   *
   * **他の欄が動かないことまで見る**——`date` は「いつ言われたか」であって
   * 「いつ分類し直したか」ではない（`setFeedbackText` が日付を触らないのと同じ規律）
   */
  it('FB の調子だけを差し替える（文言・発言者・日付は動かない）', () => {
    const d = withFeedbacks()
    const next = setFeedbackSentiment(d, 0, 1, 'concern')
    expect(next.hypotheses[0].feedbacks.map((f) => f.sentiment)).toEqual([
      'note',
      'concern',
      'note',
    ])
    expect(next.hypotheses[0].feedbacks[1]).toEqual({
      askId: null,
      text: 'B',
      by: '',
      sentiment: 'concern',
      date: '2026-08-30',
    })
    // 対象の仮説以外は同一参照のまま（巻き込まない）
    expect(next.hypotheses[1]).toBe(d.hypotheses[1])
  })

  it('同じ調子を選び直しても、存在しない席でも「動かなかった編集」（同じ参照）', () => {
    const d = withFeedbacks()
    // ドロップダウンはいまの値も選べるので、素通しにすると中身の同じコミットが積まれる
    expect(setFeedbackSentiment(d, 0, 0, 'note')).toBe(d)
    expect(setFeedbackSentiment(d, 0, 9, 'like')).toBe(d)
    expect(setFeedbackSentiment(d, 99, 0, 'like')).toBe(d)
  })

  it('先頭の FB を消したら仮説の文言へ戻る（由来の欄が無くなったので行き先が変わった）', () => {
    let d = base()
    d = { ...d, hypotheses: d.hypotheses.map((h, i) => (i === 0 ? { ...h, feedbacks: [fb('A')] } : h)) }
    const next = removeFeedback(d, 0, 0)
    expect(next.data.hypotheses[0].feedbacks).toEqual([])
    expect(next.focus).toEqual({ cell: 'hypothesis', index: 0 })
  })
})

describe('詳細・価値仮説・聞きたいこと（m5）', () => {
  it('setHypothesisDetail は該当の1件だけを書き換え、他の仮説を動かさない', () => {
    const d = base()
    const next = setHypothesisDetail(d, 1, '中身のメモ')
    expect(next.hypotheses[1].detail).toBe('中身のメモ')
    // 他は同一参照のまま（差し替えたのは対象の仮説だけ）
    expect(next.hypotheses[0]).toBe(d.hypotheses[0])
    expect(next.hypotheses[2]).toBe(d.hypotheses[2])
  })

  it('setHypothesisValue は該当の1件だけを書き換え、他の仮説を動かさない', () => {
    const d = base()
    const next = setHypothesisValue(d, 1, 'なぜ効くか')
    expect(next.hypotheses[1].value).toBe('なぜ効くか')
    expect(next.hypotheses[0]).toBe(d.hypotheses[0])
    expect(next.hypotheses[2]).toBe(d.hypotheses[2])
  })

  it('存在しない仮説には書けない（同じ参照を返す）', () => {
    const d = base()
    expect(setHypothesisDetail(d, 99, 'x')).toBe(d)
    expect(setHypothesisValue(d, 99, 'x')).toBe(d)
  })

  it('addAsk は ask_ 接頭辞の ID を採番し、行き先は末尾の問いを指す', () => {
    const next = addAsk(base(), 0)
    const h = next.data.hypotheses[0]
    expect(h.asks).toHaveLength(1)
    expect(h.asks[0].id.startsWith('ask_')).toBe(true)
    expect(h.asks[0].text).toBe('')
    expect(next.focus).toEqual({ cell: 'ask', index: 0, askIndex: 0 })
  })

  it('存在しない仮説には足せない', () => {
    const d = base()
    expect(addAsk(d, 99).data).toBe(d)
    expect(addAsk(d, 99).focus).toBe(null)
  })

  /** 問い3件を持つ仮説を用意する（`removeAsk` が末尾を消す実装でも件数だけで区別できないよう2件目を狙う） */
  function withAsks(): IssueTreeSchemaVersion4 {
    const d = base()
    return {
      ...d,
      hypotheses: d.hypotheses.map((h, i) =>
        i === 0
          ? {
              ...h,
              asks: [
                { id: 'ask_0000000001', text: '問い1' },
                { id: 'ask_0000000002', text: '問い2' },
                { id: 'ask_0000000003', text: '問い3' },
              ],
            }
          : h,
      ),
    }
  }

  it('setAskText は該当の問い1件だけを書き換える', () => {
    const d = withAsks()
    const next = setAskText(d, 0, 1, '書き換えた問い2')
    expect(next.hypotheses[0].asks.map((a) => a.text)).toEqual(['問い1', '書き換えた問い2', '問い3'])
  })

  it('存在しない問いには書けない（同じ参照を返す）', () => {
    const d = withAsks()
    expect(setAskText(d, 0, 9, 'x')).toBe(d)
    expect(setAskText(d, 99, 0, 'x')).toBe(d)
  })

  it('removeAsk は3件のうち2件目を消し、残る2件の文言が正しい', () => {
    const d = withAsks()
    const next = removeAsk(d, 0, 1)
    expect(next.data.hypotheses[0].asks.map((a) => a.text)).toEqual(['問い1', '問い3'])
    // 消した位置の1つ前へ行き先が付く
    expect(next.focus).toEqual({ cell: 'ask', index: 0, askIndex: 0 })
  })

  it('先頭の問いを消したら仮説の文言へ戻る（前の問いが無いため）', () => {
    const d = withAsks()
    const next = removeAsk(d, 0, 0)
    expect(next.data.hypotheses[0].asks.map((a) => a.text)).toEqual(['問い2', '問い3'])
    expect(next.focus).toEqual({ cell: 'hypothesis', index: 0 })
  })

  it('存在しない問いは消せない（同じ参照を返す）', () => {
    const d = withAsks()
    expect(removeAsk(d, 0, 9).data).toBe(d)
    expect(removeAsk(d, 99, 0).data).toBe(d)
  })

  it('removeAsk は、消した問いを指していた FB の askId を null にし、他の問いを指す FB の askId は変えない', () => {
    const d = withAsks()
    const withFb = {
      ...d,
      hypotheses: d.hypotheses.map((h, i) =>
        i === 0
          ? {
              ...h,
              feedbacks: [
                { askId: 'ask_0000000002', text: '問い2への答え', by: '', sentiment: 'note' as const, date: '2026-08-30' },
                { askId: 'ask_0000000003', text: '問い3への答え', by: '', sentiment: 'note' as const, date: '2026-08-30' },
                { askId: null, text: 'どの問いにも紐づかない', by: '', sentiment: 'note' as const, date: '2026-08-30' },
              ],
            }
          : h,
      ),
    }
    const next = removeAsk(withFb, 0, 1) // 問い2（ask_0000000002）を消す
    expect(next.data.hypotheses[0].feedbacks.map((f) => f.askId)).toEqual([
      null, // 消した問いを指していたので null に付け替わる
      'ask_0000000003', // 他の問いを指す FB は変わらない
      null, // もともと null の FB も変わらない
    ])
  })

  it('addFeedback は渡した askId を持つ FB を作る', () => {
    const d = withAsks()
    const withAsk = addFeedback(d, 0, 'ask_0000000002', '2026-08-30')
    expect(withAsk.data.hypotheses[0].feedbacks[0].askId).toBe('ask_0000000002')

    const withoutAsk = addFeedback(d, 0, null, '2026-08-30')
    expect(withoutAsk.data.hypotheses[0].feedbacks[0].askId).toBe(null)
  })
})

describe('イベントの記録（D2: v4 で仮説の判断も 0 件か 1 件になった）', () => {
  /**
   * **番人の狙いは「長さが 1 のままであること」である。**
   *
   * 中身（最新の種別と日付）だけを見ると、**追記に戻した実装でも緑になる**
   *——`[...events, e]` でも最後の要素は同じだからである。だから
   * `events` そのものを `toEqual` で固定し、**列に前の判断が残っていないこと**を
   * 見る（`toHaveLength(1)` も併せて置く——`toEqual` の配列比較は長さも見るが、
   * 落ちたときにどちらが壊れたかが読めるようにしておく）
   */
  it('判断を選ぶと差し替わる（列は1件のまま。前の判断は残らない）', () => {
    const d = normalizeOrder(base())
    const once = setJudgement(d, 0, 'rejected', '2026-08-30')
    const twice = setJudgement(once.data, 0, 'supported', '2026-08-31')
    expect(twice.data.hypotheses[0].events).toHaveLength(1)
    expect(twice.data.hypotheses[0].events).toEqual([
      { kind: 'supported', note: '', date: '2026-08-31' },
    ])
    expect(twice.focus).toEqual({ cell: 'event', index: 0, eventIndex: 0 })
  })

  it('判断が無い仮説には1件足り、日付が入る', () => {
    const next = setJudgement(base(), 0, 'supported', '2026-08-30')
    expect(next.data.hypotheses[0].events).toEqual([
      { kind: 'supported', note: '', date: '2026-08-30' },
    ])
    expect(next.focus).toEqual({ cell: 'event', index: 0, eventIndex: 0 })
  })

  it('同じ種別を選び直しても何も起きない（理由も日付も残る。同じ参照）', () => {
    // ドロップダウンはいまの種別も選べる。素通しにすると**書いた理由が空に戻り、
    // 日付だけが今日へ動く**——`setFeedbackSentiment` と同じ約束で同じ参照を返す
    const on = setJudgement(normalizeOrder(base()), 0, 'supported', '2026-08-30')
    const withNote = setEventNote(on.data, 0, 0, '中央値4.2秒')
    const again = setJudgement(withNote, 0, 'supported', '2026-09-01')
    expect(again.data).toBe(withNote)
    expect(again.focus).toBe(null)
    expect(withNote.hypotheses[0].events[0]).toEqual({
      kind: 'supported',
      note: '中央値4.2秒',
      date: '2026-08-30',
    })
  })

  describe('clearJudgement（判断を取り消して未決へ戻す）', () => {
    it('取り消すと events が空になり、仮説の文言へ返す', () => {
      const on = setJudgement(normalizeOrder(base()), 0, 'supported', '2026-08-30')
      const withNote = setEventNote(on.data, 0, 0, '中央値4.2秒')
      const off = clearJudgement(withNote, 0)
      expect(off.data.hypotheses[0].events).toEqual([])
      // **理由ごと消えるのは自覚した代償である**（D2 の反転節）。戻すのは Undo
      expect(off.focus).toEqual({ cell: 'hypothesis', index: 0 })
    })

    it('往復すると元の仮説そのものに戻る（取り消しの痕跡も残らない）', () => {
      // 打ち消しのイベントを追記する実装なら、ここで `events` に1件残って落ちる
      const d = normalizeOrder(base())
      const on = setJudgement(d, 0, 'rejected', '2026-08-30')
      expect(clearJudgement(on.data, 0).data.hypotheses[0]).toEqual(d.hypotheses[0])
    })

    it('判断が無ければ同じ参照を返す（apply が落とす契約）', () => {
      const d = normalizeOrder(base())
      expect(clearJudgement(d, 0).data).toBe(d)
      expect(clearJudgement(d, 99).data).toBe(d)
    })
  })

  /**
   * **課題の旗は issue-tree-m3 で先に追記専用から外れた。** かつては1択の
   * ドロップダウンから `appendDeferral` を呼んでいた——選ぶものが1つしか
   * 無いので、後追いでトグルに変えた。v3 で旗が2種（見送り／解決）になり、
   * 「切る」側は**旗を消す**、「差し替える」側は**消してから足す**
   *（打ち消しイベントの追記ではない。D2 の反転節）。
   * **v4 で仮説の判断も同じ規律に揃った**（上の `setJudgement` ／ `clearJudgement`）
   */
  describe('toggleIssueEvent（課題の旗は入り切りする）', () => {
    it('旗が無い課題に旗を1件足し、理由の欄へ移す', () => {
      const next = toggleIssueEvent(base(), 0, 'deferred', '2026-08-30')
      expect(next.data.issues[0].events).toEqual([{ kind: 'deferred', note: '', date: '2026-08-30' }])
      expect(next.focus).toEqual({ cell: 'issueEvent', index: 0 })
    })

    it('入り→書く→切りで理由ごと消える', () => {
      const on = toggleIssueEvent(normalizeOrder(base()), 1, 'deferred', '2026-08-30')
      const withNote = setIssueEventNote(on.data, 1, '初回フローの成立が先')
      expect(withNote.issues[1].events[0]?.note).toBe('初回フローの成立が先')

      const off = toggleIssueEvent(withNote, 1, 'deferred', '2026-08-31')
      // **理由ごと消えるのは自覚した代償である**（D2 の反転節）。取り消しは Undo
      expect(off.data.issues[1].events).toEqual([])
      // 理由の欄はいま消えた欄なので行き先にできない。課題の文言へ返す
      expect(off.focus).toEqual({ cell: 'issue', index: 1 })
    })

    it('押すたびに向きが入れ替わり、往復すると元の課題に戻る', () => {
      // **「旗が無いのに切る」という呼び出しは API に存在しない**——向きは
      // `toggleIssueEvent` が押された瞬間の最新イベントから決めるので、
      // 呼ぶ側が向きを指定する口が無い。だからここで見るのは片道ではなく
      // **往復**である: 切った後のノードが「一度も旗を立てていないノード」と
      // 区別できないこと（区別が残ると、次に押したとき別の向きへ倒れる）
      const d = normalizeOrder(base())
      const on = toggleIssueEvent(d, 1, 'deferred', '2026-08-30')
      expect(on.data.issues[1].events).toEqual([{ kind: 'deferred', note: '', date: '2026-08-30' }])

      const off = toggleIssueEvent(on.data, 1, 'deferred', '2026-08-31')
      // **往復して元のノードそのものに戻る**（`events` が空になるだけでなく、
      // 取り消しの痕跡も残らない）
      expect(off.data.issues[1]).toEqual(d.issues[1])

      const again = toggleIssueEvent(off.data, 1, 'deferred', '2026-09-01')
      expect(again.data.issues[1].events).toEqual([{ kind: 'deferred', note: '', date: '2026-09-01' }])
      expect(again.focus).toEqual({ cell: 'issueEvent', index: 1 })
    })

    it('同じ旗をもう一度押すと最新1件が消え、課題の文言へ戻る', () => {
      const on = toggleIssueEvent(base(), 0, 'deferred', '2026-08-30')
      const off = toggleIssueEvent(on.data, 0, 'deferred', '2026-08-31')
      expect(off.data.issues[0].events).toEqual([])
      expect(off.focus).toEqual({ cell: 'issue', index: 0 })
    })

    it('別の旗を押すと差し替わる（列に2件並べない。見送りと解決は排他）', () => {
      const deferred = toggleIssueEvent(base(), 0, 'deferred', '2026-08-30')
      const resolved = toggleIssueEvent(deferred.data, 0, 'resolved', '2026-08-31')
      // **1件のまま。** 消してから足す
      expect(resolved.data.issues[0].events).toEqual([
        { kind: 'resolved', note: '', date: '2026-08-31' },
      ])
      expect(resolved.focus).toEqual({ cell: 'issueEvent', index: 0 })
    })

    /**
     * **「手書きの2件以上でも、消すのは最新1件だけ」の it はここにあった。**
     * v4 のスキーマが `maxItems: 1` を課したので、その入力は**型として作れず**
     *（`IssueNode['events']` は `[] | [IssueEvent]`）、そもそも開けるファイルに
     * 存在しない。到達しない状態の番人は置かない（`lessons-for-planning.md`
     * 「すべての分岐にテストを書けるわけではない」）——**なぜ書けないかを残す**
     * のがここの役割である
     */
    it('存在しない添字では同じ参照を返す（apply が落とす契約）', () => {
      const d = normalizeOrder(base())
      expect(toggleIssueEvent(d, 99, 'deferred', '2026-08-30').data).toBe(d)
    })
  })

  describe('setIssueEventNote', () => {
    it('旗の種別によらず理由が書け、種別と日付は動かない', () => {
      // **2種とも回す。** 「`deferred` のときだけ書く」のような kind 決め打ちの
      // 実装を弾く（v3 まではここで2件並べて「最新だけ」も見ていたが、
      // v4 の `maxItems: 1` でその入力は型として作れなくなった）
      for (const kind of ['deferred', 'resolved'] as const) {
        const on = toggleIssueEvent(base(), 0, kind, '2026-08-30')
        const out = setIssueEventNote(on.data, 0, '通知は本開発で')
        expect(out.issues[0].events, kind).toEqual([
          { kind, note: '通知は本開発で', date: '2026-08-30' },
        ])
      }
    })

    it('旗の理由を書けるのは立っている旗だけ。旗が無ければ同じ参照を返す', () => {
      const on = toggleIssueEvent(base(), 0, 'resolved', '2026-08-30')
      const written = setIssueEventNote(on.data, 0, '通知の集約で解ける')
      expect(written.issues[0].events[0]?.note).toBe('通知の集約で解ける')
      // 旗が無い課題では何も起きない（`apply` が同じ参照を見て履歴を積まない）
      const d = base()
      expect(setIssueEventNote(d, 0, 'x')).toBe(d)
    })
  })

  it('立っている判断の note は書けるが、席の無い添字は素通しする', () => {
    // **`eventIndex` は画面が出している席の添字である。** v4 で列が高々1件に
    // なっても、席の無い添字（1）を渡されたら何も書かない——ここが素通しになると、
    // 画面が出していない席への書き込みを受け付ける
    const d = setJudgement(normalizeOrder(base()), 0, 'supported', '2026-08-30').data
    const ok = setEventNote(d, 0, 0, '中央値4.2秒')
    expect(ok.hypotheses[0].events[0]?.note).toBe('中央値4.2秒')
    const blocked = setEventNote(d, 0, 1, '無い席へ書く')
    expect(blocked).toBe(d) // 同一参照＝何も起きていない
    // 判断が無い仮説も同じ（0 番の席すら無い）
    const bare = normalizeOrder(base())
    expect(setEventNote(bare, 0, 0, 'x')).toBe(bare)
  })
})
