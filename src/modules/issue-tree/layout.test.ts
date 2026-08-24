import { describe, expect, it } from 'vitest'
import { createEstimateMeasurer } from '@/core/canvas/wrap'
import type { Hypothesis, IssueNode, IssueTreeSchemaVersion2 } from '@/types/issue-tree'
import { ISSUE_DEFERRED_LABEL, poseQuestions } from './derive'
import { DEFER_TRIGGER_LABEL, layoutIssueTree, type IssueTreeFonts } from './layout'
import { BADGE_GAP, BOX_WIDTH, ISSUE_INSET_X, ISSUE_TITLE_MIN_WIDTH } from './measure'

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

/**
 * 測定は決定的な概算器で行う。**太字（title）の概算は細字と同じでよい**
 *——ここで見るのは寸法どうしの関係であって実寸ではない
 */
const fonts: IssueTreeFonts = {
  title: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  body: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  small: { measure: createEstimateMeasurer(14), lineHeight: 18 },
}

function run(data: IssueTreeSchemaVersion2, expandedIndex = -1) {
  return layoutIssueTree(data, poseQuestions(data), fonts, expandedIndex)
}

function make(over: Partial<IssueTreeSchemaVersion2>): IssueTreeSchemaVersion2 {
  return { schemaVersion: 2, type: 'issueTree', title: 'T', issues: [], hypotheses: [], ...over }
}

const root: IssueNode = { id: I(0), parentId: null, text: '結果取得を画面遷移の中で待てるか', events: [] }
const child: IssueNode = { id: I(1), parentId: I(0), text: '待てないなら何を先に返すか', events: [] }

/** `root` にぶら下がる仮説1件 */
function h(n: number, over: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: H(n),
    issueId: I(0),
    text: `仮説${n}の文言`,
    rationale: '',
    events: [],
    pendingNotes: [],
    ...over,
  }
}

describe('layoutIssueTree', () => {
  it('同じ入力からは同じ出力が出る（図は導出。前回の位置を混ぜない）', () => {
    const data = make({ issues: [{ id: I(0), parentId: null, text: '根', events: [] }] })
    expect(run(data)).toEqual(run(data))
  })

  it('仮説を持つ課題の箱は BOX_WIDTH で、仮説は箱の中の行として1行ずつ積まれる', () => {
    // 仮説3件。2件だと「末尾」と「先頭」の取り違えが検知できない
    const data = make({ issues: [root], hypotheses: [h(1), h(2), h(3)] })
    const out = run(data)
    const box = out.issues[0]!.rect
    expect(box.width).toBe(BOX_WIDTH)
    const rows = out.hypotheses.map((p) => p!.rect)
    // 箱の中に収まる
    for (const r of rows) {
      expect(r.x).toBeGreaterThanOrEqual(box.x)
      expect(r.x + r.width).toBeLessThanOrEqual(box.x + box.width)
      expect(r.y + r.height).toBeLessThanOrEqual(box.y + box.height)
    }
    // 1行ずつ（畳まれた行の高さは本文の行送り）。並びは配列順
    expect(rows.map((r) => r.height)).toEqual([
      fonts.body.lineHeight,
      fonts.body.lineHeight,
      fonts.body.lineHeight,
    ])
    expect(rows[1].y).toBeGreaterThan(rows[0].y)
    expect(rows[2].y).toBeGreaterThan(rows[1].y)
    // タイトルの下に来る
    expect(rows[0].y).toBeGreaterThanOrEqual(out.issues[0]!.title.y + out.issues[0]!.title.height)
    // 文言の右にバッジの場所が空く（重ねない）
    const first = out.hypotheses[0]!
    expect(first.badge.x).toBeGreaterThanOrEqual(first.text.x + first.text.width)
    expect(first.badge.x + first.badge.width).toBeLessThanOrEqual(box.x + box.width)
  })

  /**
   * 帯の「未判断」と行の表示を一対一にする（M22）。**同じテストで有り／無しの
   * 両方を見る**——片方だけだと「常に null」「常に Rect」でも緑になる。
   * 2件は現在ステータスを揃えてある（どちらも支持）ので、判断バッジの幅は同じ。
   * 差は未判断バッジのぶんだけである
   */
  it('未判断の仮説行は、判断バッジの左に未判断バッジの幅を確保する', () => {
    const data = make({
      issues: [root],
      hypotheses: [
        h(1, {
          events: [{ kind: 'supported', note: '実測で確認' }],
          pendingNotes: ['レビューで出た指摘'],
        }),
        h(2, { events: [{ kind: 'supported', note: '実測で確認' }] }),
      ],
    })
    const posed = poseQuestions(data)
    expect(posed.hypothesisQuestions[0].judgement).toBe(true)
    expect(posed.hypothesisQuestions[1].judgement).toBe(false)

    const out = run(data)
    const pending = out.hypotheses[0]!
    const plain = out.hypotheses[1]!

    // 立っていない行は従来どおり（バッジは1つ）
    expect(plain.judgementBadge).toBeNull()

    // 立っている行は、判断バッジの左に BADGE_GAP を空けて並ぶ（同じ高さ・同じ y）
    const jb = pending.judgementBadge!
    expect(jb.width).toBeGreaterThan(0)
    expect(jb.height).toBe(pending.badge.height)
    expect(jb.y).toBe(pending.badge.y)
    expect(jb.x + jb.width + BADGE_GAP).toBe(pending.badge.x)
    // 判断バッジ自身の場所は動かない（右端のまま）
    expect(pending.badge.x).toBe(plain.badge.x)
    expect(pending.badge.x + pending.badge.width).toBeLessThanOrEqual(
      out.issues[0]!.rect.x + out.issues[0]!.rect.width,
    )
    // 文言はそのぶんだけ狭く、未判断バッジに被らない
    expect(pending.text.width).toBe(plain.text.width - BADGE_GAP - jb.width)
    expect(pending.text.x + pending.text.width).toBeLessThanOrEqual(jb.x)

    // **展開した行の頭部も同じ**（頭部の組み立ては閉じた行と同じ幅を通る）
    const open = run(data, 0).hypotheses[0]!
    const ojb = open.judgementBadge!
    expect(ojb.width).toBe(jb.width)
    expect(ojb.y).toBe(open.badge.y)
    expect(ojb.x + ojb.width + BADGE_GAP).toBe(open.badge.x)
    expect(open.text.width).toBe(pending.text.width)
  })

  it('仮説を持たない課題の箱はタイトルの自然幅（ロジックツリーと同じ）', () => {
    const out = run(make({ issues: [{ ...root, text: '短い' }] }))
    expect(out.issues[0]!.rect.width).toBeLessThan(BOX_WIDTH)
    // **箱の下限は定数ではない**——タイトルの下限に、右上へ常に空ける枠のぶんが乗る
    expect(out.issues[0]!.rect.width).toBeGreaterThan(ISSUE_TITLE_MIN_WIDTH)
  })

  /**
   * **実機で踏んだ欠陥の再現。** タイトル行の右上を「常に1枠空ける」ようにしたとき、
   * 折り返しの下限を**箱の**下限から枠のぶんを引いて作っていた。「仮説なし」バッジは
   * 70px 前後を取るので、96 の箱では入力欄が数 px になり、新しく作った課題に
   * 1字も打てなくなる。**枠が文章を食うのではなく、箱が枠のぶん広がる**のが正しい
   */
  it('空のタイトルでもバッジのぶん箱が広がり、入力欄は下限を割らない', () => {
    // 葉で仮説が無い＝「仮説なし」が立つ（右上に一番広い枠を取るのがこの場合）
    const data = make({ issues: [{ ...root, text: '' }] })
    expect(poseQuestions(data).issueNeedsHypothesis[0]).toBe(true)
    const box = run(data).issues[0]!
    expect(box.title.width).toBeGreaterThanOrEqual(ISSUE_TITLE_MIN_WIDTH)
    // 箱は「タイトル＋左右の余白」よりさらに広い（＝枠のぶんを箱が負担している）
    expect(box.rect.width).toBeGreaterThan(box.title.width + ISSUE_INSET_X * 2)
    // タイトルは箱からはみ出さない
    expect(box.title.x + box.title.width).toBeLessThanOrEqual(box.rect.x + box.rect.width)
  })

  it('固定幅（BOX_WIDTH）の箱でも、枠を引いたタイトルは下限を割らない', () => {
    // 仮説を持つ箱では「仮説なし」は立たないが、ホバー中に出る見送りトリガーの枠は空く
    const withRows = run(make({ issues: [root], hypotheses: [h(1)] })).issues[0]!
    expect(withRows.rect.width).toBe(BOX_WIDTH)
    expect(withRows.title.width).toBeGreaterThanOrEqual(ISSUE_TITLE_MIN_WIDTH)
    const deferred = run(
      make({ issues: [{ ...root, events: [{ kind: 'deferred', note: '今回は追わない' }] }] }),
    ).issues[0]!
    expect(deferred.rect.width).toBe(BOX_WIDTH)
    expect(deferred.title.width).toBeGreaterThanOrEqual(ISSUE_TITLE_MIN_WIDTH)
  })

  it('展開した仮説だけパネルを持ち、箱はその分だけ高くなる', () => {
    const data = make({
      issues: [root],
      hypotheses: [
        h(1),
        h(2, {
          rationale: '由来',
          pendingNotes: ['FB1', 'FB2'],
          events: [
            { kind: 'supported', note: '根拠' },
            { kind: 'rejected', note: '覆った' },
          ],
        }),
        h(3),
      ],
    })
    const folded = run(data)
    const open = run(data, 1)
    expect(folded.hypotheses[1]!.expanded).toBeNull()
    const p = open.hypotheses[1]!.expanded!
    expect(p.previous).toHaveLength(1) // events 2件 → 以前の判断は1件
    expect(p.previousLabel).not.toBeNull()
    expect(p.notes.cells).toHaveLength(2)
    expect(open.issues[0]!.rect.height).toBeGreaterThan(folded.issues[0]!.rect.height)
    // 展開していない隣の行は動かない（上の行）／下の行は押し下げられる
    expect(open.hypotheses[0]!.rect.y).toBe(folded.hypotheses[0]!.rect.y)
    expect(open.hypotheses[2]!.rect.y).toBeGreaterThan(folded.hypotheses[2]!.rect.y)
    // パネルの矩形は行の矩形の中
    expect(p.panel.y + p.panel.height).toBeLessThanOrEqual(
      open.hypotheses[1]!.rect.y + open.hypotheses[1]!.rect.height,
    )
    // 節は上から 判断 → 以前の判断 → 由来 → FB の順
    expect(p.previousLabel!.y).toBeGreaterThan(p.judgement.label.y)
    expect(p.rationale.label.y).toBeGreaterThan(p.previous[0].note.y)
    expect(p.notes.label.y).toBeGreaterThan(p.rationale.cell.y)
    expect(p.notes.add.y).toBeGreaterThan(p.notes.cells[1].y)
    // 判断の行はバッジ・根拠・トリガーが横に並ぶ（重ならない）
    expect(p.judgement.note.x).toBeGreaterThanOrEqual(p.judgement.badge.x + p.judgement.badge.width)
    expect(p.judgement.trigger.x).toBeGreaterThanOrEqual(
      p.judgement.note.x + p.judgement.note.width,
    )
  })

  it('イベントが1件だけの仮説には「以前の判断」の節が出ない', () => {
    const data = make({
      issues: [root],
      hypotheses: [h(1, { events: [{ kind: 'supported', note: '実測' }] })],
    })
    const p = run(data, 0).hypotheses[0]!.expanded!
    expect(p.previous).toEqual([])
    expect(p.previousLabel).toBeNull()
  })

  it('展開した仮説の文言は折り返した高さになる（畳むと1行）', () => {
    const long = 'あ'.repeat(60)
    const data = make({ issues: [root], hypotheses: [h(1, { text: long })] })
    expect(run(data).hypotheses[0]!.text.height).toBe(fonts.body.lineHeight)
    expect(run(data, 0).hypotheses[0]!.text.height).toBeGreaterThan(fonts.body.lineHeight)
  })

  it('見送った課題はタイトル行の右端にバッジ、その下に理由の行を持つ', () => {
    const data = make({
      issues: [{ ...root, events: [{ kind: 'deferred', note: '通知は本開発で扱う' }] }],
    })
    const p = run(data).issues[0]!
    expect(p.deferral).not.toBeNull()
    expect(p.deferral!.badge.x).toBeGreaterThanOrEqual(p.title.x + p.title.width)
    expect(p.deferral!.reason.y).toBeGreaterThanOrEqual(p.title.y + p.title.height)
    expect(p.rect.width).toBe(BOX_WIDTH)
    // バッジは箱の中（右端からはみ出さない）
    expect(p.deferral!.badge.x + p.deferral!.badge.width).toBeLessThanOrEqual(p.rect.x + p.rect.width)
  })

  /**
   * **タイトル行の右上の枠に出る文言は2つあり、いまどちらも「見送り」である。**
   * `DEFER_TRIGGER_LABEL`（まだ見送っていない箱でホバー中に出る小ボタン）と
   * `ISSUE_DEFERRED_LABEL`（見送り済みのバッジ）で、`layout.ts` の `slotW` は
   * 状態に応じてどちらかの幅で枠を空ける。
   *
   * **一致は偶然であって、統合したわけではない**——別々に置いてあるのは、
   * 押す前と押した後で文言を変えられるようにするためである（`derive.ts` が
   * `ISSUE_DEFERRED_LABEL` を `BADGE_LABELS.deferred` と別に持っているのと同じ趣旨）。
   * **だから畳まないこと。**
   *
   * 固定するのは「一致していること」ではなく、**一致が黙って崩れないこと**である。
   * ここが落ちたら、割るのか揃えるのかを決めてから検査を直す——割るなら、
   * `IssueTreeEditor.dom.test.tsx` の `textContent` の照合が
   * **その時点で初めて**切りと入りの取り違えを捕まえる検査に変わる
   *（同値であるいまは捕まえない。あちらは面のクラスで分けている）
   */
  it('DEFER_TRIGGER_LABEL と ISSUE_DEFERRED_LABEL はたまたま同値な独立した定数である（畳まない）', () => {
    expect(DEFER_TRIGGER_LABEL).toBe(ISSUE_DEFERRED_LABEL)
  })

  it('子の列は親の箱の右端より右に置かれる（箱の幅がブロックの幅に効く）', () => {
    const data = make({ issues: [root, child], hypotheses: [h(1), h(2)] }) // h は root に
    const out = run(data)
    expect(out.issues[1]!.rect.x).toBeGreaterThanOrEqual(
      out.issues[0]!.rect.x + out.issues[0]!.rect.width,
    )
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
    const [rootRect, a, g, b, c] = out.issues.map((p) => p!.rect)
    expect(a.x).toBeGreaterThan(rootRect.x)
    expect(g.x).toBeGreaterThan(a.x)
    expect(b.y).toBeGreaterThan(a.y)
    expect(c.y).toBeGreaterThan(b.y)
  })

  it('展開した仮説の高さは兄弟の間隔に効く（次の兄弟はその下に来る）', () => {
    // ブロック（＝箱）の高さを木のレイアウトへ渡していることを見る。
    // 展開したぶんを数え落とすと、次の兄弟がパネルに重なる
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '根', events: [] },
        { id: I(1), parentId: I(0), text: '結果取得を画面遷移の中で待てるか', events: [] },
        { id: I(2), parentId: I(0), text: '再受検の扱い', events: [] },
      ],
      hypotheses: [
        { ...h(1), issueId: I(1), pendingNotes: ['採否は次回の設計会で決める'] },
        { ...h(2), issueId: I(1) },
      ],
    })
    const out = run(data, 0)
    const box = out.issues[1]!.rect
    const next = out.issues[2]!.rect
    expect(next.y).toBeGreaterThan(box.y + box.height - 1)
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

  it('ぶら下がり先が図に無い仮説は位置を持たない', () => {
    const data = make({
      issues: [{ id: I(0), parentId: null, text: '根', events: [] }],
      hypotheses: [h(1), { ...h(2), issueId: I(9) }],
    })
    const out = run(data)
    expect(out.hypotheses[0]).not.toBe(null)
    expect(out.hypotheses[1]).toBe(null)
  })
})
