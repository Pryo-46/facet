import { describe, expect, it } from 'vitest'
import { tallyLine as coreTallyLine } from '@/core/missing-tally'
import type { Hypothesis, IssueNode } from '@/types/issue-tree'
import {
  BADGE_LABELS,
  badgeGroupOf,
  DEFERRAL_NOTE,
  deferralLine,
  deferredIssueCount,
  EVENT_KIND_LABELS,
  hypothesisStatus,
  ISSUE_DEFERRED_LABEL,
  latestKind,
  leafIssueIds,
  poseQuestions,
  suppressedIssueIds,
  tallyLine,
  tallyQuestions,
  toMissingTally,
  type JudgementKind,
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
  it('葉で仮説が0件なら「仮説なし」が立ち、中間ノードには立たない（D1 折衷案）', () => {
    const posed = poseQuestions({ issues: issues(), hypotheses: [] })
    expect(posed.issueNeedsHypothesis).toEqual([false, false, true, true, true])
  })

  it('中間ノードに仮説を付けても、その仮説の「未決」は立つ', () => {
    // 仮説はどのノードにも付けられる。抑えているのは「仮説なし」の問いだけ
    const posed = poseQuestions({ issues: issues(), hypotheses: [hypothesis(1, id(1))] })
    expect(posed.issueNeedsHypothesis[1]).toBe(false)
    expect(posed.hypothesisQuestions[0].result).toBe(true)
  })

  it('仮説が付いた葉には「仮説なし」が立たない', () => {
    const posed = poseQuestions({ issues: issues(), hypotheses: [hypothesis(1, id(2))] })
    expect(posed.issueNeedsHypothesis[2]).toBe(false)
    expect(posed.issueNeedsHypothesis[3]).toBe(true)
  })

  it('pendingNotes が残っていれば「未判断」が立つ（D9 の締め忘れ検出）', () => {
    const h = hypothesis(1, id(2), {
      events: [{ kind: 'supported', note: '' }],
      pendingNotes: ['SHが「分単位窓では？」と発言'],
    })
    const posed = poseQuestions({ issues: issues(), hypotheses: [h] })
    expect(posed.hypothesisQuestions[0]).toEqual({ result: false, hold: false, judgement: true })
  })

  it('祖先が見送りなら配下の4つの問いはすべて立たない', () => {
    const list = issues()
    list[1] = { ...list[1], events: [{ kind: 'deferred', note: '' }] }
    const h = hypothesis(1, id(2), { pendingNotes: ['メモ'] })
    const posed = poseQuestions({ issues: list, hypotheses: [h] })
    expect(posed.issueNeedsHypothesis[2]).toBe(false)
    expect(posed.issueNeedsHypothesis[4]).toBe(false)
    expect(posed.hypothesisQuestions[0]).toEqual({ result: false, hold: false, judgement: false })
    // 抑制の外にある兄弟の枝は立ったまま
    expect(posed.issueNeedsHypothesis[3]).toBe(true)
  })
})

describe('集計と表示文言（アプリと Skill が同じ文字列を出す）', () => {
  it('立っている問いだけを数える', () => {
    const list = issues()
    const hypotheses = [
      hypothesis(1, id(2)), // 未決
      hypothesis(2, id(3), { events: [{ kind: 'supported', note: '' }], pendingNotes: ['x'] }), // 未判断
    ]
    const t = tallyQuestions(poseQuestions({ issues: list, hypotheses }))
    // 葉は 2/3/4 の3つ。2 と 3 には仮説が付いたので「仮説なし」は 4 の1件だけ
    expect(t).toEqual({ hypothesis: 1, result: 1, hold: 0, judgement: 1, total: 3 })
  })

  it('帯に出す1行が組み立てられる', () => {
    expect(tallyLine({ hypothesis: 1, result: 2, hold: 0, judgement: 0, total: 3 })).toBe(
      '⚠ 要対応 3（仮説なし 1 ／ 未決 2）',
    )
  })

  it('4種すべてに表示ラベルがあり、判断の語彙はその4種で尽きる', () => {
    expect(EVENT_KIND_LABELS.supported).toBe('支持')
    expect(EVENT_KIND_LABELS.rejected).toBe('棄却')
    expect(EVENT_KIND_LABELS.onHold).toBe('保留')
    expect(EVENT_KIND_LABELS.deferred).toBe('見送り')
    // **鍵の集合そのものを固定する。** 個々の値だけ見ていると、種別が足された
    // ときに「ラベルはあるが誰も知らない5種目」が静かに増える
    expect(Object.keys(EVENT_KIND_LABELS).sort()).toEqual(
      ['deferred', 'onHold', 'rejected', 'supported'].sort(),
    )
  })
})

describe('保留（onHold）の問い', () => {
  it('最新が onHold の仮説に「保留」の問いが立ち、未決とは別に数える', () => {
    const hs = [
      hypothesis(1, id(2), { events: [{ kind: 'onHold', note: '判断材料が足りない' }] }),
      hypothesis(2, id(3)), // 未決
      // 保留 → 支持 に覆った仮説。最新が決める
      hypothesis(3, id(4), { events: [{ kind: 'onHold', note: '' }, { kind: 'supported', note: '' }] }),
    ]
    const posed = poseQuestions({ issues: issues(), hypotheses: hs })
    expect(posed.hypothesisQuestions.map((q) => q.hold)).toEqual([true, false, false])
    expect(posed.hypothesisQuestions.map((q) => q.result)).toEqual([false, true, false])
    expect(tallyQuestions(posed)).toMatchObject({ hold: 1, result: 1 })
  })

  it('祖先の見送りで抑制された配下では保留も立たない', () => {
    const deferred = issues().map((n) => (n.id === id(1) ? { ...n, events: [{ kind: 'deferred' as const, note: '' }] } : n))
    const hs = [hypothesis(1, id(2), { events: [{ kind: 'onHold', note: '' }] })]
    expect(poseQuestions({ issues: deferred, hypotheses: hs }).hypothesisQuestions[0].hold).toBe(false)
  })
})

describe('バッジ群（5語）', () => {
  /**
   * **判断を5語に畳んだいま、この対応はほぼ名前の付け替えである**（畳まれるのは
   * もう何も無い）。それでも固定するのは、`undecided`——保存されない導出値——が
   * `open` に落ちる経路がここにしか無いためと、`badgeGroupOf` が
   * `HypothesisStatus` の全値を網羅していることを実行時にも見ておくため
   */
  it('4種の kind と未決が5語に1対1で対応する', () => {
    expect(badgeGroupOf('supported')).toBe('yes')
    expect(badgeGroupOf('rejected')).toBe('no')
    expect(badgeGroupOf('onHold')).toBe('hold')
    expect(badgeGroupOf('deferred')).toBe('deferred')
    expect(badgeGroupOf('undecided')).toBe('open')
  })

  it('5語の文言はここ1箇所から引ける', () => {
    expect(Object.values(BADGE_LABELS)).toEqual(['支持', '棄却', '保留', '未決', '見送り'])
  })

  /**
   * **判断を5語に畳んだ結果、`EVENT_KIND_LABELS` の4語は `BADGE_LABELS` の
   * 部分集合になった。これは偶然であって、統合したわけではない**——2つの表は
   * 鍵が違い（`JudgementKind` と `BadgeGroup`）、俯瞰と詳細をまた別の言葉に
   * 分けられるよう別々に残してある（derive.ts の註）。
   *
   * だから固定するのは「一致していること」ではなく、**一致が黙って崩れないこと**
   * である。`BADGE_LABELS.deferred` を書き換えた人が `EVENT_KIND_LABELS.deferred`
   * に思い至らないと、行末のバッジと展開した行の語が誰の判断も経ずに割れる。
   * **ここが落ちたら、割るのか揃えるのかを決めてからこの検査を直すこと**
   *（`ISSUE_DEFERRED_LABEL` を別の定数として記録しているのと同じ趣旨）
   */
  it('EVENT_KIND_LABELS の4語は badgeGroupOf を通した BADGE_LABELS と一致する（偶然の一致を見える所に出す）', () => {
    for (const kind of Object.keys(EVENT_KIND_LABELS) as JudgementKind[]) {
      expect(EVENT_KIND_LABELS[kind]).toBe(BADGE_LABELS[badgeGroupOf(kind)])
    }
    // 俯瞰だけが持つのは「未決」の1語——保存されない導出値なので kind 側に席が無い
    expect(
      Object.values(BADGE_LABELS).filter((l) => !Object.values(EVENT_KIND_LABELS).includes(l)),
    ).toEqual([BADGE_LABELS.open])
  })

  it('課題側の見送りバッジ（ISSUE_DEFERRED_LABEL）は BADGE_LABELS.deferred と値がたまたま同じ独立した定数である', () => {
    // 値の一致を固定する意図ではない。課題と仮説を独立に変えられるよう、
    // 別エクスポートとして存在すること自体をここに記録する
    expect(ISSUE_DEFERRED_LABEL).toBe('見送り')
  })
})

describe('tallyLine', () => {
  it('0 の内訳は出さない', () => {
    expect(tallyLine({ hypothesis: 2, result: 1, hold: 1, judgement: 0, total: 4 })).toBe(
      '⚠ 要対応 4（仮説なし 2 ／ 未決 1 ／ 保留 1）',
    )
  })
  it('合計 0 は内訳も ⚠ も付けない', () => {
    expect(tallyLine({ hypothesis: 0, result: 0, hold: 0, judgement: 0, total: 0 })).toBe('要対応 0')
  })
})

describe('toMissingTally', () => {
  // derive.ts の tallyLine は Skill のバイト一致コピーが読むため、コアの
  // tallyLine を import できない（skill-copy.test.ts）。文字列の組み立てが
  // 2本あることを、この一致テストで固定する（lessons: 複製は機械検査で固定）
  it.each([
    { hypothesis: 0, result: 0, hold: 0, judgement: 0, total: 0 },
    { hypothesis: 1, result: 2, hold: 0, judgement: 0, total: 3 },
    { hypothesis: 2, result: 1, hold: 1, judgement: 3, total: 7 },
  ])('コアの tallyLine と逐語一致する（%j）', (t) => {
    expect(coreTallyLine(toMissingTally(t))).toBe(tallyLine(t))
  })

  it('variant は open / open / hold / pending の対応（帯のチップと同じ）', () => {
    const parts = toMissingTally({ hypothesis: 1, result: 1, hold: 1, judgement: 1, total: 4 }).parts
    expect(parts.map((p) => [p.kind, p.variant])).toEqual([
      ['hypothesis', 'open'],
      ['result', 'open'],
      ['hold', 'hold'],
      ['judgement', 'pending'],
    ])
  })
})

describe('deferredIssueCount / deferralLine（D17 の別枠）', () => {
  const issue = (
    id: string,
    parentId: string | null,
    events: { kind: 'deferred'; note: string }[] = [],
  ) => ({ id, parentId, text: '課題', events })

  it('見送りを掲げた課題だけを数える（配下の抑制は数えない）', () => {
    const issues = [
      issue('issue_AAAAAAAAAA', null, [{ kind: 'deferred', note: '今回は追わない' }]),
      issue('issue_BBBBBBBBBB', 'issue_AAAAAAAAAA'), // 抑制されるが、自分は掲げていない
      issue('issue_CCCCCCCCCC', null),
    ]
    expect(deferredIssueCount(issues)).toBe(1)
  })

  it('入れ子の見送りはそれぞれ1と数える', () => {
    const issues = [
      issue('issue_AAAAAAAAAA', null, [{ kind: 'deferred', note: '枝ごと' }]),
      issue('issue_BBBBBBBBBB', 'issue_AAAAAAAAAA', [{ kind: 'deferred', note: '個別にも' }]),
    ]
    expect(deferredIssueCount(issues)).toBe(2)
  })

  it('deferralLine はチップと Skill の報告が共有する字面', () => {
    expect(deferralLine(2)).toBe('見送り 2')
    expect(DEFERRAL_NOTE).toBe('見送り配下の問いは要対応に数えません')
  })
})
