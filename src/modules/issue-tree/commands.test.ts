import { describe, expect, it } from 'vitest'
import type { IssueTreeSchemaVersion2 } from '@/types/issue-tree'
import {
  addChildIssue,
  addHypothesis,
  addPendingNote,
  addPendingNoteAfter,
  addRootIssue,
  appendJudgement,
  deleteIssueSubtree,
  moveHypothesis,
  moveIssueSibling,
  movePendingNote,
  normalizeOrder,
  promoteNote,
  setDeferralNote,
  setEventNote,
  toggleDeferral,
} from './commands'
import type { DeferralKind } from './derive'

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

/** 根(0) — 子(1) — 孫(2), 孫(4) ／ 根 — 子(3)。兄弟3つ・深さ2を含む */
function data(): IssueTreeSchemaVersion2 {
  return {
    schemaVersion: 2,
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

const R = I(10)
const X = I(11)
const Y = I(12)
const YCHILD = I(13)
const Z = I(14)

/**
 * 根 R — X, Y, Z（兄弟3つ）／ Y — Ychild。
 * 仮説の id は H(11)=X / H(12)=Y / H(13)=Ychild / H(14)=Z にぶら下がる
 */
function branched(hypothesisIds: string[]): IssueTreeSchemaVersion2 {
  const issueOf: Record<string, string> = { [H(11)]: X, [H(12)]: Y, [H(13)]: YCHILD, [H(14)]: Z }
  return {
    schemaVersion: 2,
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
      text: '仮説',
      rationale: '',
      events: [],
      pendingNotes: [],
    })),
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

  it('循環を含むファイルに根を足しても、フォーカスは足した課題を指す', () => {
    // 出力を正規化する以上、**位置は参照の同一性で引き直さないと**
    // 別の実在ノード（循環側）を指す——空欄だと思って打つと他人の文言を潰す
    const d: IssueTreeSchemaVersion2 = {
      schemaVersion: 2,
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

  /**
   * メモを持つ仮説を**2件**用意する。1件だけだと「対象の仮説だけを差し替える」が
   * 「全部を差し替える」実装と区別できない。メモも3件持たせる——2件だと
   * 上下の入れ替えが同じ結果になり、向きの取り違えを検出できない
   */
  function withNotes(): IssueTreeSchemaVersion2 {
    const d = normalizeOrder(data())
    return {
      ...d,
      hypotheses: d.hypotheses.map((h, i) =>
        i === 0
          ? { ...h, pendingNotes: ['A', 'B', 'C'] }
          : i === 1
            ? { ...h, pendingNotes: ['X', 'Y'] }
            : h,
      ),
    }
  }

  it('メモの直後に足すと、押した位置の次に入る（末尾ではない）', () => {
    // **3件の真ん中で足す。** 末尾で足すと「末尾に足す実装」と結果が
    // 区別できず、`addPendingNote` に写した実装でも緑になる
    const next = addPendingNoteAfter(withNotes(), 0, 1)
    expect(next.data.hypotheses[0].pendingNotes).toEqual(['A', 'B', '', 'C'])
    expect(next.focus).toEqual({ cell: 'note', index: 0, noteIndex: 2 })
  })

  it('存在しないメモの直後には足せない', () => {
    const d = withNotes()
    expect(addPendingNoteAfter(d, 0, 9).data).toBe(d)
    expect(addPendingNoteAfter(d, 99, 0).data).toBe(d)
  })

  it('メモを上下に動かすと、フォーカスは動いた先を指す', () => {
    const d = withNotes()
    const up = movePendingNote(d, 0, 1, -1)
    expect(up.data.hypotheses[0].pendingNotes).toEqual(['B', 'A', 'C'])
    expect(up.focus).toEqual({ cell: 'note', index: 0, noteIndex: 0 })

    const down = movePendingNote(d, 0, 1, 1)
    expect(down.data.hypotheses[0].pendingNotes).toEqual(['A', 'C', 'B'])
    expect(down.focus).toEqual({ cell: 'note', index: 0, noteIndex: 2 })
  })

  it('端のメモは動かない（動かなかった編集は同じ参照を返す）', () => {
    const d = withNotes()
    const top = movePendingNote(d, 0, 0, -1)
    expect(top.data).toBe(d)
    expect(top.focus).toBe(null)

    const bottom = movePendingNote(d, 0, 2, 1)
    expect(bottom.data).toBe(d)
    expect(bottom.focus).toBe(null)
  })

  it('メモの並び替えは他の仮説を巻き込まない', () => {
    const d = withNotes()
    const next = movePendingNote(d, 0, 0, 1)
    expect(next.data.hypotheses[1].pendingNotes).toEqual(['X', 'Y'])
    // 差し替えたのは対象の仮説だけ（他は同一参照のまま）
    expect(next.data.hypotheses[1]).toBe(d.hypotheses[1])
    expect(next.data.hypotheses[2]).toBe(d.hypotheses[2])
  })

  it('存在しない仮説・存在しないメモは動かせない', () => {
    const d = withNotes()
    expect(movePendingNote(d, 99, 0, 1).data).toBe(d)
    expect(movePendingNote(d, 0, 9, -1).data).toBe(d)
  })
})

describe('イベントの記録（D2: 仮説は追記専用／課題の見送りだけ入り切りする）', () => {
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

  /**
   * **課題の見送りだけが D2 の追記専用から外れている。** かつては1択の
   * ドロップダウンから `appendDeferral` を呼んでいた——選ぶものが1つしか
   * 無いので、issue-tree-m3 の後追いでトグルに変えた。「切る」側は
   * **最新の見送りイベントを消す**（打ち消しイベントの追記ではない。D2 の反転節）
   */
  describe('toggleDeferral（課題の見送りは入り切りする）', () => {
    it('入り: 見送りを1件足し、理由の欄へ行き先を返す', () => {
      const next = toggleDeferral(normalizeOrder(data()), 1)
      expect(next.data.issues[1].events).toEqual([{ kind: 'deferred', note: '' }])
      // **課題の文言ではなく理由の欄へ返す。** バッジだけ立って理由が空のまま
      // 残ると「なぜ落としたか」が図から消える
      expect(next.focus).toEqual({ cell: 'deferral', index: 1 })
    })

    it('切り: 最新の見送りが消え、理由も一緒に消える', () => {
      const on = toggleDeferral(normalizeOrder(data()), 1)
      const withNote = setDeferralNote(on.data, 1, '初回フローの成立が先')
      expect(withNote.issues[1].events[0].note).toBe('初回フローの成立が先')

      const off = toggleDeferral(withNote, 1)
      // **理由ごと消えるのは自覚した代償である**（D2 の反転節）。取り消しは Undo
      expect(off.data.issues[1].events).toEqual([])
      // 理由の欄はいま消えた欄なので行き先にできない。課題の文言へ返す
      //——トグルのボタンの上では木の操作言語（Enter／Tab／←→）が1つも効かない
      expect(off.focus).toEqual({ cell: 'issue', index: 1 })
    })

    it('見送っていない課題を切っても何も起きない（イベントは増えも減りもしない）', () => {
      // トグルは押した瞬間の `events.length` で向きを決めるので、「見送って
      // いないのに切る」という呼び出しは画面からは起きない。**それでも
      // 空配列から要素を落とそうとしないことを固定する**——`slice(0, -1)` を
      // `slice(1)` などに書き換えると、空では黙って通り、1件のときだけ壊れる
      const d = normalizeOrder(data())
      const on = toggleDeferral(d, 1)
      const off = toggleDeferral(on.data, 1)
      const again = toggleDeferral(off.data, 1)
      // 空から押せば「入り」になる（＝切りの経路には入らない）
      expect(again.data.issues[1].events).toEqual([{ kind: 'deferred', note: '' }])
      expect(again.focus).toEqual({ cell: 'deferral', index: 1 })
    })

    it('手書きの2件では最新の1件だけが消え、まだ見送ったままになる', () => {
      // アプリが作る列は高々1件だが、手書きのファイルは2件以上を持ちうる。
      // **全部消さない**——書いた人が見ていない過去の理由まで1押しで飛ぶ
      const d: IssueTreeSchemaVersion2 = {
        ...data(),
        issues: [
          {
            id: I(0),
            parentId: null,
            text: '根',
            events: [
              { kind: 'deferred', note: '古い理由' },
              { kind: 'deferred', note: '新しい理由' },
            ],
          },
        ],
        hypotheses: [],
      }
      const off = toggleDeferral(d, 0)
      expect(off.data.issues[0].events).toEqual([{ kind: 'deferred', note: '古い理由' }])
      // まだ見送り済み（`suppressedIssueIds` は1件でもあれば抑制する）。
      // もう一度押せば次が消える＝「最新から順に剥がす」と読める
      expect(off.focus).toEqual({ cell: 'issue', index: 0 })
    })

    it('存在しない添字では同じ参照を返す（apply が落とす契約）', () => {
      const d = normalizeOrder(data())
      expect(toggleDeferral(d, 99).data).toBe(d)
    })
  })

  /**
   * **スキーマへ見送りの種別が増えたら、この `Record` が「足りない」で tsc に落ちる。**
   *
   * かつて同じ見張りは `IssueTreeEditor` の `DEFERRAL_MENU_ORDER`
   *（`Record<DeferralKind, number>`）が担っていたが、**唯一の消費者だった
   * 1択のドロップダウンをトグルへ作り替えたので、あちらは消えた。**
   * 見張りだけをここへ移してある——トグルは種別を選ばせないので、
   * 種別が増えたときに**アプリからは選べない見送りが静かに残る**という穴は、
   * ドロップダウンだったときより見つけにくい
   */
  const DEFERRAL_KIND_VOCABULARY: Record<DeferralKind, true> = { deferred: true }

  it('課題に付く見送りの種別は deferred の1語だけ（増えたらトグルでは選べない）', () => {
    expect(Object.keys(DEFERRAL_KIND_VOCABULARY)).toEqual(['deferred'])
  })

  describe('setDeferralNote', () => {
    it('最新の見送りの理由だけを書き換える', () => {
      const d: IssueTreeSchemaVersion2 = {
        ...data(),
        issues: [
          {
            id: I(0),
            parentId: null,
            text: '根',
            // 同じ `deferred` が2件。**見送りの種別は1つしか無い**ので、
            // 「最新だけを書き換える」は種別の違いではなく位置で効く必要がある
            events: [
              { kind: 'deferred', note: '古い理由' },
              { kind: 'deferred', note: '' },
            ],
          },
        ],
        hypotheses: [],
      }
      const out = setDeferralNote(d, 0, '通知は本開発で')
      expect(out.issues[0].events).toEqual([
        { kind: 'deferred', note: '古い理由' },
        { kind: 'deferred', note: '通知は本開発で' },
      ])
    })

    it('見送りが無い課題では同じ参照を返す（apply が落とす契約）', () => {
      const d: IssueTreeSchemaVersion2 = {
        ...data(),
        issues: [{ id: I(0), parentId: null, text: '根', events: [] }],
        hypotheses: [],
      }
      expect(setDeferralNote(d, 0, 'x')).toBe(d)
    })
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
