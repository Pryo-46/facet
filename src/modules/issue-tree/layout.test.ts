import { describe, expect, it } from 'vitest'
import { createEstimateMeasurer } from '@/core/canvas/wrap'
import type { Hypothesis, IssueNode, IssueTreeSchemaVersion4 } from '@/types/issue-tree'
import { ISSUE_EVENT_LABELS, poseQuestions } from './derive'
import { layoutIssueTree, SECTION_LABELS, type IssueTreeFonts, type IssueTreeLayout } from './layout'
import {
  ACTION_HEIGHT,
  ASK_PADDING_X,
  BADGE_BORDER,
  BADGE_GAP,
  BADGE_HEIGHT,
  BADGE_PADDING_X,
  BOX_WIDTH,
  EXPANDED_BOX_WIDTH,
  FB_DELETE_WIDTH,
  FIELD_INDENT,
  ISSUE_INSET_X,
  ISSUE_INSET_Y,
  PANEL_GAP,
  PANEL_INSET_X,
  PANEL_INSET_Y,
  TRASH_ICON_SIZE,
} from './measure'

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

/** 表示用の日付。v3 は `IssueEvent` / `JudgementEvent` / `Feedback` のいずれも空文字を許さない */
const DATE = '2026-08-30'

/**
 * 測定は決定的な概算器で行う。**太字（title）の概算は細字と同じでよい**
 *——ここで見るのは寸法どうしの関係であって実寸ではない
 */
const fonts: IssueTreeFonts = {
  title: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  // 展開中の課題タイトルは一段大きい（`EXPANDED_TITLE_FONT_CLASS` = 16px）。
  // **概算器も大きくしておく**——同じ値だと「切り替えていない」実装でも緑になる
  expandedTitle: { measure: createEstimateMeasurer(18), lineHeight: 27 },
  body: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  small: { measure: createEstimateMeasurer(14), lineHeight: 18 },
}

/**
 * **第4引数は「選択している課題の添字」**（issue-tree m5 Task 2 で仮説の添字から
 * 課題の添字になり、実機確認後に「展開」から「選択」へ意味が変わった）。
 * 選択された課題は、仮説を1本以上持っていれば開く——0本なら開かないまま
 * 末尾の「＋ 仮説を追加」だけを持つ
 */
function run(data: IssueTreeSchemaVersion4, selectedIssueIndex = -1) {
  return layoutIssueTree(data, poseQuestions(data), fonts, selectedIssueIndex)
}

function make(over: Partial<IssueTreeSchemaVersion4>): IssueTreeSchemaVersion4 {
  return { schemaVersion: 4, type: 'issueTree', title: 'T', issues: [], hypotheses: [], ...over }
}

const root: IssueNode = { id: I(0), parentId: null, text: '結果取得を画面遷移の中で待てるか', events: [] }
const child: IssueNode = { id: I(1), parentId: I(0), text: '待てないなら何を先に返すか', events: [] }

/** `root` にぶら下がる仮説1件 */
function h(n: number, over: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: H(n),
    issueId: I(0),
    title: `仮説${n}の文言`,
    detail: '',
    value: '',
    asks: [],
    feedbacks: [],
    events: [],
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
    const first = out.hypotheses[0]!.row!
    expect(first.badge.x).toBeGreaterThanOrEqual(first.text.x + first.text.width)
    expect(first.badge.x + first.badge.width).toBeLessThanOrEqual(box.x + box.width)
  })

  /**
   * 帯の「FB待ち」と行の表示を一対一にする（M22。M4 で `pendingNotes` から
   * `asks`/`feedbacks` へ移った）。**同じテストで有り／無しの両方を見る**
   *——片方だけだと「常に null」「常に Rect」でも緑になる。2件は現在ステータスを
   * 揃えてある（どちらも支持）ので、状態バッジの幅は同じ。差は FB待ちバッジの
   * ぶんだけである
   */
  it('FB待ちの仮説行は、状態バッジの左にFB待ちバッジの幅を確保する', () => {
    const data = make({
      issues: [root],
      hypotheses: [
        h(1, {
          events: [{ kind: 'supported', note: '実測で確認', date: DATE }],
          // 文言のある問いに FB が1件も無い＝ FB待ちが立つ（derive.ts）
          asks: [{ id: 'ask_0000000001', text: 'レビューで出た指摘に答えられるか' }],
        }),
        h(2, { events: [{ kind: 'supported', note: '実測で確認', date: DATE }] }),
      ],
    })
    const posed = poseQuestions(data)
    expect(posed.hypothesisQuestions[0].feedback).toBeGreaterThan(0)
    expect(posed.hypothesisQuestions[1].feedback).toBe(0)

    const out = run(data)
    const pending = out.hypotheses[0]!.row!
    const plain = out.hypotheses[1]!.row!

    // 立っていない行は従来どおり（バッジは1つ）
    expect(plain.feedbackBadge).toBeNull()

    // 立っている行は、状態バッジの左に BADGE_GAP を空けて並ぶ（同じ高さ・同じ y）
    const jb = pending.feedbackBadge!
    expect(jb.width).toBeGreaterThan(0)
    expect(jb.height).toBe(pending.badge.height)
    expect(jb.y).toBe(pending.badge.y)
    expect(jb.x + jb.width + BADGE_GAP).toBe(pending.badge.x)
    // 状態バッジ自身の場所は動かない（右端のまま）
    expect(pending.badge.x).toBe(plain.badge.x)
    expect(pending.badge.x + pending.badge.width).toBeLessThanOrEqual(
      out.issues[0]!.rect.x + out.issues[0]!.rect.width,
    )
    // 文言はそのぶんだけ狭く、FB待ちバッジに被らない
    expect(pending.text.width).toBe(plain.text.width - BADGE_GAP - jb.width)
    expect(pending.text.x + pending.text.width).toBeLessThanOrEqual(jb.x)

    // **展開した仮説に頭部は無い**（m5 Task 4）——「点・文言・バッジ」の1行は
    // 畳まれているときだけで、開くとパネルが全部を負う。**FB待ちのバッジも
    // 畳まれた行にしか出ない**（展開中は問いブロックの側に出す。Task 5）。
    // 頭部を残すと、パネルの「ソリューション仮説」節と同じ文言が2箇所に出る
    const openLayout = run(data, 0)
    expect(openLayout.hypotheses[0]!.row).toBeNull()
    expect(openLayout.hypotheses[0]!.expanded).not.toBeNull()
    // 展開した課題の中身は、畳まれていたときより広い（押し広げが効いている）
    expect(openLayout.hypotheses[0]!.expanded!.panel.width).toBeGreaterThan(pending.text.width)
  })

  /**
   * **M24 で反転した観点。** 以前は「仮説を持たない課題の箱はタイトルの
   * 自然幅」だった。箱幅が内容で決まると、同じ列の中でバッジの右端が
   * 散り、「どれが未決か」を知るのに全ノードを読む必要が出る
   *（UI ノート D3 rev.3 ＝ スキャン性）
   */
  it('箱の幅は、仮説の有無・見送りの有無によらず BOX_WIDTH で一定', () => {
    // (a) 葉で仮説なし（「仮説なし」バッジが立つ＝一番広い枠）
    const warn = run(make({ issues: [{ ...root, text: '短い' }] })).issues[0]!
    expect(warn.rect.width).toBe(BOX_WIDTH)

    // (b) 仮説を持つ
    const withRows = run(make({ issues: [root], hypotheses: [h(1)] })).issues[0]!
    expect(withRows.rect.width).toBe(BOX_WIDTH)

    // (c) 見送り済み
    const deferred = run(
      make({
        issues: [{ ...root, events: [{ kind: 'deferred', note: '今回は追わない', date: DATE }] }],
      }),
    ).issues[0]!
    expect(deferred.rect.width).toBe(BOX_WIDTH)

    // (d) バッジもトグルも立たない（子を持つ中間の課題）
    const middle = run(make({ issues: [root, child] })).issues[0]!
    expect(middle.rect.width).toBe(BOX_WIDTH)
  })

  /**
   * **D3 rev.3 の主張そのものの門番。** 右上の枠に出るものは3つ（旗のバッジ・
   * 「仮説なし」バッジ・見送りトグル）だが、**レイアウトが矩形を組むのは
   * 旗のバッジだけ**で、残る2つは `IssueBox` が CSS の `right: ISSUE_PADDING_X`
   * で右寄せする。どちらも右端は「箱の右端 − `ISSUE_INSET_X`」に落ちるので、
   * **箱幅が揃っていれば3種類とも同じ x に並ぶ**——上のテストと対で見ること
   */
  it('同じ深さの箱では、旗のバッジの右端が揃う', () => {
    const a: IssueNode = {
      id: I(1),
      parentId: I(0),
      text: '短い',
      events: [{ kind: 'deferred', note: 'r', date: DATE }],
    }
    const b: IssueNode = {
      id: I(2),
      parentId: I(0),
      text: 'とても長いほうの課題の文言でありこちらは折り返す',
      events: [{ kind: 'deferred', note: 'r', date: DATE }],
    }
    // 見送っていない葉（仮説を持たないので「仮説なし」バッジが立つ）。
    // **a・b だけでは幅ロックそのものを弁別しない**——両方とも見送り済みで、
    // 旧コード（幅を内容から導出していた版）でも見送りバッジの幅を含めて
    // BOX_WIDTH に落ちていたため、幅を固定する前後でこのテストの結論が
    // 変わらなかった。c は旧コードで「仮説も見送りも無い箱はタイトルの
    // 自然幅」の分岐に入り、短いタイトルぶんだけ箱が狭くなっていた側
    // （M24 で削った分岐。history 参照）。旧コードに戻すと c.rect の幅が
    // BOX_WIDTH を割り、下のアサーションが赤くなる
    const c: IssueNode = { id: I(3), parentId: I(0), text: '短い葉', events: [] }
    const out = run(make({ issues: [root, a, b, c] }))
    const da = out.issues[1]!.event!
    const db = out.issues[2]!.event!
    expect(da.badge.x + da.badge.width).toBe(db.badge.x + db.badge.width)
    // 箱の右端 − ISSUE_INSET_X に一致する
    const rect = out.issues[1]!.rect
    expect(da.badge.x + da.badge.width).toBe(rect.x + rect.width - ISSUE_INSET_X)
    // 同じ深さの兄弟は x を共有する。c の箱の右端からも同じ式が成り立つ
    // ことを見ることで、「仮説なし」側の箱幅も BOX_WIDTH に固定されている
    // ことを直接押さえる
    const rectC = out.issues[3]!.rect
    expect(da.badge.x + da.badge.width).toBe(rectC.x + rectC.width - ISSUE_INSET_X)
  })

  /**
   * 固定幅になっても、**一番広い枠を引いたタイトルが痩せすぎない**ことは
   * 依然として要る（M24 より前は `ISSUE_TITLE_MIN_WIDTH` が持っていた不変条件）。
   * **下限をリテラルで書かない**——段が変われば「8字ぶん」の px は動くので、
   * テストの測定器から導く
   */
  it('一番広い枠を引いても、タイトルは日本語8字ぶんを残す', () => {
    // **名前から「（仮説なしバッジ）」を落としてある。** 旗のトグルが2つに
    // なってからは、旗の無い箱で一番広い枠を作るのは「仮説なし」バッジ（70px）
    // ではなく**トグル2つ**（106px）で、`Math.max` の勝者が入れ替わった
    //（issue-tree-m5 の追加作業。`docs/history/m24-core-node-width-lock.md` と
    // m24 の計画書は旧名で引いているが、どちらも記録＝不変なので追随させない）。
    // **勝者が誰であれ嘘にならない名前にした**——テスト名は失敗出力の1行目で、
    // 一番長く読まれる。この `it` が踏む経路も見ている不変条件も変えていない
    const data = make({ issues: [{ ...root, text: '' }] })
    expect(poseQuestions(data).issueNeedsHypothesis[0]).toBe(true)
    const box = run(data).issues[0]!
    expect(box.title.width).toBeGreaterThanOrEqual(fonts.title.measure('あ'.repeat(8)))
    // タイトルは箱からはみ出さない
    expect(box.title.x + box.title.width).toBeLessThanOrEqual(box.rect.x + box.rect.width)
  })

  /**
   * **「測定と描画は対で直す」の測定側の番人。** 旗の無い箱の右上に出る
   * トグルは**2つ**（見送り／解決。`IssueTreeEditor` の `FLAG_KINDS`）なので、
   * `layout.ts` は**2つの合計幅＋間の `BADGE_GAP`** を空ける。片方ぶんの式に
   * 戻すと、予約した枠より描画が広くなってホバー中にボタンがタイトルへはみ出す。
   *
   * **定数式との厳密一致で見る。** 「十分広い」だけを見る形にすると、
   * `Math.max` の相手（「仮説なし」バッジ）に救われて片方ぶんの実装でも緑を通る
   *——だから**「仮説なし」が立たない箱**（子を持つ中間の課題）を選び、
   * 枠を決めているのがトグル2つであることを紛れさせない
   */
  it('旗の無い箱は、旗のトグル2つぶん（＋間の空き）の枠をタイトルの右に空ける', () => {
    const data = make({ issues: [root, child] })
    // 根は子を持つので「仮説なし」は立たない＝`badgeW` は 0
    expect(poseQuestions(data).issueNeedsHypothesis[0]).toBe(false)
    const box = run(data).issues[0]!
    const badgeW = (label: string): number =>
      Math.ceil(fonts.small.measure(label)) + BADGE_PADDING_X * 2 + BADGE_BORDER * 2
    /** 描く側（`IssueBox` の `gap-2` の flex）と同じ組み立て */
    const triggersW =
      badgeW(ISSUE_EVENT_LABELS.deferred) + BADGE_GAP + badgeW(ISSUE_EVENT_LABELS.resolved)
    expect(box.title.width).toBe(BOX_WIDTH - ISSUE_INSET_X * 2 - BADGE_GAP - triggersW)
    // タイトルは箱からはみ出さない（枠を広げすぎていないことは上の8字テストが見る）
    expect(box.title.x + box.title.width).toBeLessThanOrEqual(box.rect.x + box.rect.width)
  })

  /**
   * **箱の幅は 360**（issue-tree m5 の実機確認。依頼者の指示）。旗のトグルが
   * 2つになって右上の枠が広がり、タイトルが 200 → 164px に痩せたので、
   * 箱の側を 320 → 360 に伸ばして 204px に戻した。
   *
   * **ここだけは `BOX_WIDTH` を使わずに数字を書く。** 上の「トグル2つぶんの枠」の
   * テストは `BOX_WIDTH` から期待値を組むので、定数を戻しても緑のまま通る
   *——**戻したことに気づく番人がどこにも無い**（テスト名の「320のまま」は
   * m5 で `BOX_WIDTH` 参照へ書き換えた）。伸ばした事実そのものはここが持つ。
   *
   * `EXPANDED_BOX_WIDTH`（780）は動かしていない——伸ばしたのは畳んだ箱だけ
   */
  it('畳んだ箱の幅は 360 で、タイトルはそのぶん広い 224px を取る', () => {
    expect(BOX_WIDTH).toBe(360)
    expect(EXPANDED_BOX_WIDTH).toBe(780)
    const data = make({ issues: [root, child] })
    const out = run(data)
    for (const [i, box] of out.issues.entries()) {
      expect(box!.rect.width, `課題${i + 1}の箱`).toBe(360)
      // 320 のままなら 144。**「十分広い」ではなく実寸で見る**——枠の側を
      // 詰めて誤魔化した実装と、箱を伸ばした実装を区別するため。
      // **m5 の実機確認後に 204 → 224 へ広がった**——開閉トグル（シェブロン）を
      // 撤去して、タイトルの左に空けていた 20px が消えたぶん
      expect(box!.title.width, `課題${i + 1}のタイトル`).toBe(224)
    }
  })

  it('展開した課題ではぶら下がる仮説がすべてパネルを持ち、箱はその分だけ高くなる', () => {
    const data = make({
      issues: [root],
      hypotheses: [
        h(1),
        h(2, {
          feedbacks: [
            { askId: null, text: 'FB1', by: '', sentiment: 'note', date: DATE },
            { askId: null, text: 'FB2', by: '', sentiment: 'note', date: DATE },
          ],
          events: [{ kind: 'rejected', note: '覆った', date: DATE }],
        }),
        h(3),
      ],
    })
    const folded = run(data)
    // **課題ごと開く**（m5）。仮説1本だけを開く道はもう無い
    const open = run(data, 0)
    expect(folded.hypotheses[1]!.expanded).toBeNull()
    const p = open.hypotheses[1]!.expanded!
    // FB は「どの問いにも紐づかないFB」のブロック1つに入る（問いが無いので）
    expect(p.notes.blocks).toHaveLength(1)
    expect(p.notes.blocks[0].askIndex).toBeNull()
    expect(p.notes.blocks[0].rows.map((r) => r.feedbackIndex)).toEqual([0, 1])
    // 判断も FB も無い隣の仮説にもパネルは出る（節の数は判断の有無で変わらない）
    const bare = open.hypotheses[0]!.expanded!
    // FB も問いも無ければブロックは1つも出ない（空の受け皿を置かない）
    expect(bare.notes.blocks).toEqual([])
    expect(open.issues[0]!.rect.height).toBeGreaterThan(folded.issues[0]!.rect.height)
    // 並びは配列順のまま。下の行は上の行のパネルのぶんだけ押し下げられる
    expect(open.hypotheses[1]!.rect.y).toBeGreaterThan(
      open.hypotheses[0]!.rect.y + open.hypotheses[0]!.rect.height - 1,
    )
    expect(open.hypotheses[2]!.rect.y).toBeGreaterThan(folded.hypotheses[2]!.rect.y)
    // パネルの矩形は行の矩形の中
    expect(p.panel.y + p.panel.height).toBeLessThanOrEqual(
      open.hypotheses[1]!.rect.y + open.hypotheses[1]!.rect.height,
    )
    // 節は上から ソリューション仮説 → 価値仮説 → どう作るか → 検証結果 → FB の
    // **5つ**（由来は v3 で廃止／「どう作るか」は m5 の追加作業でソリューション仮説の
    // 中から昇格／「以前の判断」は v4 で廃止）。**y で見る**——描く側の DOM 順は
    // `HypothesisPanel.dom.test.tsx` が別に見ている
    expect(p.solution.title.y).toBeGreaterThan(p.solution.label.y)
    expect(p.value.label.y).toBeGreaterThan(p.solution.title.y)
    expect(p.value.field.y).toBeGreaterThan(p.value.label.y)
    expect(p.detail.label.y).toBeGreaterThan(p.value.field.y)
    expect(p.detail.field.y).toBeGreaterThan(p.detail.label.y)
    expect(p.judgement.label.y).toBeGreaterThan(p.detail.field.y)
    expect(p.notes.label.y).toBeGreaterThan(p.judgement.note.y)
    expect(p.notes.adds.y).toBeGreaterThan(p.notes.blocks[0].rows[1].rect.y)
    // 検証結果の根拠は見出しの帯の下に座る（バッジ・日付・トリガーは帯の中に
    // flex で並ぶので、根拠の幅を削らない）。**左端だけが `FIELD_INDENT` ぶん
    // 内側**で、右端は帯と揃う（下の「値の欄は…」が対で見ている）
    expect(p.judgement.note.y).toBeGreaterThanOrEqual(
      p.judgement.label.y + p.judgement.label.height,
    )
    expect(p.judgement.note.x).toBe(p.judgement.label.x + FIELD_INDENT)
    expect(p.judgement.note.width).toBe(p.judgement.label.width - FIELD_INDENT)
  })

  /**
   * **「ソリューション仮説」の帯はゴミ箱より低くならない**
   *（`solutionLabelH = Math.max(labelH, TRASH_ICON_SIZE)`）。
   *
   * 現行の書体では `labelH`（`fonts.small` の行高）が `TRASH_ICON_SIZE`（16px）を
   * 上回るので、**既定の測定器では `Math.max` の右側が選ばれない。**
   * だが「選ばれない分岐には番人を付けようがない」は誤りである——
   * `layoutIssueTree` は `fonts` を**引数で受け取る**ので、行高を縮めた `fonts` を
   * 1つ渡せば右側が選ばれる。書体が縮んだ日にこの分岐が壊れていることを、
   * 実機まで持ち越さないための番人
   */
  it('節見出しの帯はゴミ箱より低くならない（書体が縮んだときの分岐）', () => {
    const data = make({ issues: [root], hypotheses: [h(1)] })
    const tiny: IssueTreeFonts = {
      ...fonts,
      small: { measure: createEstimateMeasurer(10), lineHeight: 12 },
    }
    // labelH(12) < TRASH_ICON_SIZE(16) → 帯はアイコンの高さに底上げされる
    const shrunk = layoutIssueTree(data, poseQuestions(data), tiny, 0).hypotheses[0]!.expanded!
    expect(shrunk.solution.label.height).toBe(TRASH_ICON_SIZE)
    // **他の節の帯は縮んだまま**——底上げがソリューション仮説だけであること
    expect(shrunk.value.label.height).toBe(12)
    // 既定の書体では文字の高さの方が高い（左側の分岐）
    expect(run(data, 0).hypotheses[0]!.expanded!.solution.label.height).toBe(
      fonts.small.lineHeight,
    )
  })

  /**
   * **「検証結果」の帯の高さはバッジで決まる**（m5 Task 6）。トリガーは
   * 「判断を追加」という**文言のボタン**（`ACTION_HEIGHT` ＝ 24px）ではなく
   * **バッジ自身**（`BADGE_HEIGHT` ＝ 22px）になった。文言ボタンを消したのに
   * 帯だけ 24px を空け続けると、**帯の 2px は誰も使わないまま根拠の欄を
   * 押し下げ、画面と測定が静かに食い違う**——測り直しの番人はここ
   */
  /**
   * **展開した課題ノードの末尾に「＋ 仮説を追加」の場所を空ける**（m5 Task 7）。
   * 仮説を足す動線はキーから消えたのでマウスにしかなく、**その高さ
   *（`ACTION_HEIGHT`）を箱の高さに入れ忘れると、ボタンが箱の下端からはみ出す**
   *——絶対配置なので画面は「はみ出したまま描く」だけで、何も落ちない。
   * ここが唯一の番人なので、**下端と一致すること（`toBe`）で見る**
   */
  it('展開した課題ノードは末尾の「仮説を追加」の高さを勘定に入れる', () => {
    const data = make({ issues: [root], hypotheses: [h(1)] })
    const folded = run(data)
    // 畳んだ課題にボタンは無い（開いていない箱に末尾の操作は出ない）
    expect(folded.issues[0]!.addHypothesis).toBeNull()

    const open = run(data, 0)
    const box = open.issues[0]!
    const add = box.addHypothesis
    expect(add).not.toBeNull()
    expect(add!.height).toBe(ACTION_HEIGHT)
    // 左端はパネルと揃う（`PANEL_INDENT` と `ROW_INDENT` は同じ原点の同じ値）
    expect(add!.x).toBe(open.hypotheses[0]!.expanded!.panel.x)
    // **最後のパネルの下**に座る
    const panel = open.hypotheses[0]!.expanded!.panel
    expect(add!.y).toBeGreaterThanOrEqual(panel.y + panel.height)
    // **箱の下端にちょうど収まる**——`ACTION_HEIGHT` を高さの式から落とすと、
    // ボタンの下端が箱の下端を超える
    expect(add!.y + add!.height + ISSUE_INSET_Y).toBe(box.rect.y + box.rect.height)
  })

  /**
   * **見出しと値の区別を付けるための字下げ**（m5 の追加作業。実機で「見出しと
   * 値の区別がつかない」と言われた）。値の欄は節見出しの帯より**全角1文字
   *（`FIELD_INDENT`）だけ内側**から始まり、**右端は帯と揃う**。
   * **帯そのものは動かさない**——「見出しが左、値が一段右」という位置関係で読ませる。
   *
   * **測る側と描く側の両方を見る。**
   *
   * - `x` に足しただけ（幅を削っていない）→ 右端が帯からはみ出す
   * - 幅を削っただけ（`x` に足していない）→ 字下げが無い
   * - **`fieldContentWidth` を `panelContentWidth` に戻した**→ 位置も幅も
   *   正しいのに、**折り返しだけが実際より広い幅で数えられる**。高さ固定＋
   *   `overflow-hidden` の textarea なので、末尾の行が黙って消える。
   *   これは位置と幅だけを見るテストでは捕まらないので、**境界の長さの文字列**で
   *   行数そのものを見る
   */
  it('値の欄は帯より全角1文字ぶん内側から始まり、そのぶん狭く測られる', () => {
    // `body` の概算器は全角1文字＝16px。帯は 720px（45文字ちょうど）で、値の欄は
    // 706px（44文字ぶん）——**45文字は帯の幅なら1行、値の幅なら2行**になる
    const boundary = 'あ'.repeat(45)
    const data = make({
      issues: [root],
      hypotheses: [
        h(1, {
          title: boundary,
          detail: boundary,
          value: boundary,
          feedbacks: [{ askId: null, text: 'FB1', by: '', sentiment: 'note', date: DATE }],
          events: [{ kind: 'rejected', note: boundary, date: DATE }],
        }),
      ],
    })
    const p = run(data, 0).hypotheses[0]!.expanded!

    // --- 描く側: 左端だけが内側へ入り、右端は帯と揃う ---
    const pairs: [string, { x: number; width: number }, { x: number; width: number }][] = [
      ['ソリューション仮説', p.solution.label, p.solution.title],
      ['価値仮説', p.value.label, p.value.field],
      ['どう作るか', p.detail.label, p.detail.field],
      ['検証結果', p.judgement.label, p.judgement.note],
      ['FB', p.notes.label, p.notes.blocks[0].block],
    ]
    for (const [name, band, field] of pairs) {
      expect(field.x, name).toBe(band.x + FIELD_INDENT)
      // 右端が揃う＝「x を足しただけ」の実装ならここで落ちる
      expect(field.x + field.width, name).toBeLessThanOrEqual(band.x + band.width)
    }
    // **検証結果の根拠は帯の右端まで使い切る。** 上の `pairs` は「右端を越えない」
    // しか見ないので、幅を狭める変異は素通りする——`fieldContentWidth` を
    // 使わない実装だとここが落ちる
    expect(p.judgement.note.x + p.judgement.note.width).toBe(
      p.judgement.label.x + p.judgement.label.width,
    )
    // 帯そのものはパネルの内容の左端に座ったまま（見出しは動かさない）
    expect(p.value.label.x).toBe(p.panel.x + PANEL_INSET_X)
    expect(p.notes.label.width).toBe(p.notes.blocks[0].block.width + FIELD_INDENT)

    // --- 測る側: 狭い幅で折り返している（45文字が2行になる） ---
    expect(p.solution.title.height).toBe(fonts.title.lineHeight * 2)
    expect(p.detail.field.height).toBe(fonts.body.lineHeight * 2)
    expect(p.value.field.height).toBe(fonts.body.lineHeight * 2)
    expect(p.judgement.note.height).toBe(fonts.body.lineHeight * 2)
  })

  /**
   * **検証結果の根拠の、測る側だけを狙った番人。**
   *
   * 上のテストの幅の1行（`judgement.note` の右端が帯の右端と一致する）は、
   * **`fieldContentWidth` という1つの数**を固定する——いまの実装はその同じ値を
   * 矩形の幅にも `textHeight` の引数にも渡しているので、そこを広い幅へ戻す変異は
   * あれで赤くなる。**ここが見るのはその先**で、`textHeight` の引数だけを
   * 別の式に差し替える（＝測る側と描く側が別々の数を見る形に割る）変異である。
   *
   * **固定の文字数を置けない。** 正しい幅と壊れた幅の両方が同じ文字数を収める
   * 組み合わせでは、**どんな長さの文字列でも行数が変わらず、高さの検査は
   * 番人にならない**（issue-tree-m5 で実際に踏んだ形）。だから
   *
   * 1. 幅を**実測してから**境界の長さを作る
   * 2. **境界が2つの幅の間にあること自体を前提として検査する**
   *
   * こうしておくと、書体や余白が動いて境界が消えた日には
   * 「番人が効かなくなった」ことが**静かにではなく赤で**分かる
   *
   * **この番人は v4 で引っ越してきた**——それまで同じ検査を担っていたのは
   * 「以前の判断」の根拠で、その節ごと消えたため、字下げを共有する隣の欄
   *（検証結果の根拠）へ移した
   */
  it('検証結果の根拠は、字下げのぶん狭い幅で折り返す（測る側）', () => {
    /** 根拠の文言だけを差し替えて、検証結果の根拠の矩形を取る */
    const judgeNote = (note: string) => {
      const data = make({
        issues: [root],
        hypotheses: [h(1, { events: [{ kind: 'deferred', note, date: DATE }] })],
      })
      return run(data, 0).hypotheses[0]!.expanded!.judgement.note
    }

    const room = judgeNote('短い根拠').width
    /** 全角1文字の幅（概算器は 16px）。**打ち直さず測定器に聞く** */
    const em = fonts.body.measure('あ')
    const perLine = Math.floor(room / em)
    // **前提**: 14px 広い幅なら1行に入る文字数が増えること。増えないなら
    // 行数では2つの幅を区別できず、この検査は何も守っていない
    expect(
      Math.floor((room + FIELD_INDENT) / em),
      '字下げのぶんを戻しても1行の文字数が変わらない＝この番人は成立しない',
    ).toBeGreaterThan(perLine)

    // 狭い幅（実装）では2行、広い幅（変異）では1行に収まる長さ
    const boundary = 'あ'.repeat(perLine + 1)
    expect(boundary.length * em).toBeLessThanOrEqual(room + FIELD_INDENT)
    expect(judgeNote(boundary).height).toBe(fonts.body.lineHeight * 2)
  })

  it('検証結果の帯はバッジの高さで測る（消えた文言ボタンのぶんを空けない）', () => {
    // 2つの定数が同じ値だと、この番人は何も区別しない
    expect(BADGE_HEIGHT).toBeLessThan(ACTION_HEIGHT)
    const data = make({ issues: [root], hypotheses: [h(1)] })
    const p = run(data, 0).hypotheses[0]?.expanded
    expect(p).toBeDefined()
    expect(p!.judgement.label.height).toBe(BADGE_HEIGHT)
  })

  it('展開パネルの節は5つで、鍵の並びが描く順である（由来と以前の判断の廃止）', () => {
    // 型からも消えているので、これは「消し忘れた矩形が残っていない」ことの番人ではなく、
    // **節が減ったぶんパネルが縮む**ことの番人である
    const data = make({
      issues: [root],
      hypotheses: [
        h(1, {
          feedbacks: [{ askId: null, text: 'FB1', by: '', sentiment: 'note', date: DATE }],
          events: [{ kind: 'rejected', note: '覆った', date: DATE }],
        }),
      ],
    })
    const posed = poseQuestions(data)
    const withRationaleGone = layoutIssueTree(data, posed, fonts, 0)
    const panel = withRationaleGone.hypotheses[0]?.expanded
    expect(panel).not.toBeNull()
    // **鍵の並びが描く順**（`SECTION_LABELS` の解説）。「どう作るか」（`detail`）は
    // m5 の追加作業で価値仮説の次へ入った
    expect(Object.keys(SECTION_LABELS)).toEqual([
      'solution',
      'value',
      'detail',
      'judgement',
      'notes',
    ])
    // **SECTION_LABELS の鍵だけでは「矩形が残っていないか」しか見ない。**
    // パネルの実測が節5つぶんぴったりであることも見る——最後の内容（＋FBボタン）
    // の下端と、パネルの下端（内側余白を引いた位置）が一致するはずで、消した節の
    // ぶんの高さを `sectionHs` から落とし忘れているとここに隙間が残る。
    // **積み上げの空きも数える**——`PANEL_GAP * (節の数 - 1)` が節の減少に
    // 追随していないと、実測の下端がここでズレる
    const p = panel!
    expect(p.notes.adds.y + ACTION_HEIGHT).toBe(p.panel.y + p.panel.height - PANEL_INSET_Y)
    // 節と節の間の空きはちょうど4つぶん（5つの節の間）。**帯の上端どうしの
    // 差ではなく、前の節の下端から次の帯の上端までを1つずつ見る**
    const gaps = [
      p.value.label.y - (p.solution.title.y + p.solution.title.height),
      p.detail.label.y - (p.value.field.y + p.value.field.height),
      p.judgement.label.y - (p.detail.field.y + p.detail.field.height),
      p.notes.label.y - (p.judgement.note.y + p.judgement.note.height),
    ]
    expect(gaps).toEqual([PANEL_GAP, PANEL_GAP, PANEL_GAP, PANEL_GAP])
  })

  /**
   * **問いブロックの中身がブロックからはみ出さないこと。** 測る側（ここ）と
   * 描く側（`AskBlock`）は同じ矩形を見るので、入れ子の高さを測り損ねると
   * 下のブロックの上に文字が重なる（measure.ts の「定数とクラスは対」の
   * 入れ子版）。**割り振りの規則もここで固定する**——`asks` の順に並び、
   * `askId` が `null` の FB と**実在しない `askId` を持つ FB**が末尾へ入る
   */
  it('問いブロックは asks の順に並び、中身がブロックの中に収まる', () => {
    const A1 = 'ask_AAAAAAAAAA'
    const A2 = 'ask_BBBBBBBBBB'
    const data = make({
      issues: [root],
      hypotheses: [
        h(1, {
          asks: [
            { id: A1, text: '3時間で十分か' },
            { id: A2, text: '取りこぼしをどう防ぐか' },
          ],
          feedbacks: [
            { askId: A2, text: '深夜帯は空けてよい', by: '佐藤さん', sentiment: 'like', date: DATE },
            { askId: null, text: '媒体ごとに仕様が違う', by: '', sentiment: 'note', date: DATE },
            // 実在しない問いを指す FB（手書き・AI が書いたファイル。スキーマは許す）
            { askId: 'ask_ZZZZZZZZZZ', text: '消えた問いへの答え', by: '', sentiment: 'question', date: DATE },
          ],
        }),
      ],
    })
    const p = run(data, 0).hypotheses[0]!.expanded!
    expect(p.notes.blocks.map((b) => b.askIndex)).toEqual([0, 1, null])
    expect(p.notes.blocks.map((b) => b.rows.map((r) => r.feedbackIndex))).toEqual([[], [0], [1, 2]])
    // FB待ちが立つのは「文言があって答えの無い問い」だけ（`derive.ts` の導出）
    expect(p.notes.blocks[0].head.badge).not.toBeNull()
    expect(p.notes.blocks[1].head.badge).toBeNull()

    let prevBottom = p.notes.label.y + p.notes.label.height
    for (const b of p.notes.blocks) {
      expect(b.block.y).toBeGreaterThanOrEqual(prevBottom)
      // ブロックは値の欄と同じ字下げ（`FIELD_INDENT`）で、右端は帯と揃う
      expect(b.block.x).toBe(p.notes.label.x + FIELD_INDENT)
      expect(b.block.width).toBe(p.notes.label.width - FIELD_INDENT)
      const parts = [
        b.head.icon,
        b.head.text,
        b.head.add,
        ...(b.head.badge === null ? [] : [b.head.badge]),
        ...(b.head.remove === null ? [] : [b.head.remove]),
        ...b.rows.map((r) => r.rect),
      ]
      for (const r of parts) {
        expect(r.x).toBeGreaterThanOrEqual(b.block.x)
        expect(r.x + r.width).toBeLessThanOrEqual(b.block.x + b.block.width)
        expect(r.y).toBeGreaterThanOrEqual(b.block.y)
        expect(r.y + r.height).toBeLessThanOrEqual(b.block.y + b.block.height)
      }
      // 見出しの列（アイコン → 文言 → FB待ち → ＋FB → 削除）は重ならない。
      // **削除は問いのあるブロックだけ**（`null` のブロックには消す問いが無い）
      expect(b.head.icon.x + b.head.icon.width).toBeLessThanOrEqual(b.head.text.x)
      expect(b.head.text.x + b.head.text.width).toBeLessThanOrEqual(
        (b.head.badge ?? b.head.add).x,
      )
      expect(b.head.badge === null || b.head.badge.x + b.head.badge.width <= b.head.add.x).toBe(true)
      if (b.askIndex === null) {
        expect(b.head.remove).toBeNull()
        expect(b.head.add.x + b.head.add.width).toBe(b.block.x + b.block.width - ASK_PADDING_X)
      } else {
        expect(b.head.remove).not.toBeNull()
        expect(b.head.add.x + b.head.add.width).toBeLessThanOrEqual(b.head.remove!.x)
        // 削除はブロックの中身の右端（FB 行の削除と同じ列幅）
        expect(b.head.remove!.width).toBe(FB_DELETE_WIDTH)
        expect(b.head.remove!.x + b.head.remove!.width).toBe(
          b.block.x + b.block.width - ASK_PADDING_X,
        )
      }
      // FB の列（アイコン → 本文 → 誰が・いつ → 削除）も重ならない
      for (const row of b.rows) {
        expect(row.icon.x + row.icon.width).toBeLessThanOrEqual(row.text.x)
        expect(row.text.x + row.text.width).toBeLessThanOrEqual(row.meta.x)
        expect(row.meta.x + row.meta.width).toBeLessThanOrEqual(row.remove.x)
        expect(row.remove.x + row.remove.width).toBeLessThanOrEqual(row.rect.x + row.rect.width)
        expect(row.rect.y).toBeGreaterThanOrEqual(b.head.text.y + b.head.text.height)
      }
      prevBottom = b.block.y + b.block.height
    }
    expect(p.notes.adds.y).toBeGreaterThanOrEqual(prevBottom)
  })

  it('展開した仮説の文言は折り返した高さになる（畳むと1行）', () => {
    const long = 'あ'.repeat(60)
    const data = make({ issues: [root], hypotheses: [h(1, { title: long })] })
    expect(run(data).hypotheses[0]!.row!.text.height).toBe(fonts.body.lineHeight)
    // 展開すると、文言はパネルの「ソリューション仮説」節の中で折り返す
    expect(run(data, 0).hypotheses[0]!.expanded!.solution.title.height).toBeGreaterThan(
      fonts.body.lineHeight,
    )
  })

  /**
   * **`EXPANDED_TITLE_FONT_CLASS` の接続の番人。** 開いた課題のタイトルは
   * `IssueBox` が 16px（`text-base`）で描くので、**測る側も 16px の測定器で
   * 測っていなければならない**。`layout.ts` の `open ? fonts.expandedTitle :
   * fonts.title` が `fonts.title` 固定に戻ると、レイアウトは 14px で測り
   * 画面は 16px で描く——高さ固定＋`overflow-hidden` の textarea なので、
   * **長いタイトルの最終行が黙って消える**（tsc も lint も反応しない）。
   *
   * **高さの大小では見ない**——開くと箱が `BOX_WIDTH` → `EXPANDED_BOX_WIDTH` に広がってタイトルの幅も
   * 増えるので、字が大きくても行数は減りうる。**行高の倍数であること**で見る
   *（`fonts` の概算器は title 24 / expandedTitle 27 とわざと違えてある）
   */
  it('展開した課題のタイトルは展開用の測定器で測る（描く書体と対）', () => {
    const long = 'あ'.repeat(40)
    const data = make({ issues: [{ ...root, text: long }], hypotheses: [h(1)] })
    const folded = run(data).issues[0]!
    const open = run(data, 0).issues[0]!

    expect(folded.title.height % fonts.title.lineHeight).toBe(0)
    expect(open.title.height % fonts.expandedTitle.lineHeight).toBe(0)
    // **畳んだときの行高では割り切れない**＝切り替えを落とすとここが赤くなる
    expect(open.title.height % fonts.title.lineHeight).not.toBe(0)
  })

  /**
   * **複数行で測っていることの番人**（このタスクが増やした3つの欄）。
   * `textHeight(...)` を `fonts.body.lineHeight`（1行固定）に置き換えても、
   * パネル全体の高さの整合は**測定と配置が同じ数字を見ているかぎり通る**
   *——測定側と描画側が揃って「1行」と思い込んだ状態は、そちらでは捕まらない。
   *
   * 壊れると、3行書いた詳細の2行目以降が textarea の外に落ちて読めなくなる。
   * **ファイルには残るので、画面だけが嘘をつく**
   */
  it('詳細・価値仮説・判断の理由は複数行で測る（空なら1行）', () => {
    const long = 'あ'.repeat(120)
    const data = make({
      issues: [root],
      hypotheses: [
        h(1, {
          detail: long,
          value: long,
          events: [{ kind: 'supported', note: long, date: DATE }],
        }),
      ],
    })
    const p = run(data, 0).hypotheses[0]!.expanded!
    expect(p.detail.field.height).toBeGreaterThan(fonts.body.lineHeight)
    expect(p.value.field.height).toBeGreaterThan(fonts.body.lineHeight)
    expect(p.judgement.note.height).toBeGreaterThan(fonts.body.lineHeight)

    // 空の欄は1行ぶん残す（潰すと、プレースホルダも押せる場所も消える）
    const empty = run(make({ issues: [root], hypotheses: [h(1)] }), 0).hypotheses[0]!.expanded!
    expect(empty.detail.field.height).toBe(fonts.body.lineHeight)
    expect(empty.value.field.height).toBe(fonts.body.lineHeight)
  })

  it('見送った課題はタイトル行の右端にバッジ、その下に理由の行を持つ', () => {
    const data = make({
      issues: [{ ...root, events: [{ kind: 'deferred', note: '通知は本開発で扱う', date: DATE }] }],
    })
    const p = run(data).issues[0]!
    expect(p.event).not.toBeNull()
    expect(p.event!.badge.x).toBeGreaterThanOrEqual(p.title.x + p.title.width)
    expect(p.event!.reason.y).toBeGreaterThanOrEqual(p.title.y + p.title.height)
    expect(p.rect.width).toBe(BOX_WIDTH)
    // バッジは箱の中（右端からはみ出さない）
    expect(p.event!.badge.x + p.event!.badge.width).toBeLessThanOrEqual(p.rect.x + p.rect.width)
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

  it('展開した課題の高さは兄弟の間隔に効く（次の兄弟はその下に来る）', () => {
    // ブロック（＝箱）の高さを木のレイアウトへ渡していることを見る。
    // 展開したぶんを数え落とすと、次の兄弟がパネルに重なる
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '根', events: [] },
        { id: I(1), parentId: I(0), text: '結果取得を画面遷移の中で待てるか', events: [] },
        { id: I(2), parentId: I(0), text: '再受検の扱い', events: [] },
      ],
      hypotheses: [
        {
          ...h(1),
          issueId: I(1),
          feedbacks: [
            { askId: null, text: '採否は次回の設計会で決める', by: '', sentiment: 'note', date: DATE },
          ],
        },
        { ...h(2), issueId: I(1) },
      ],
    })
    // **仮説がぶら下がっている I(1) を開く**（根を開いても行が無く、パネルの
    // 高さが木に効いていることを見られない）
    const out = run(data, 1)
    const box = out.issues[1]!.rect
    const next = out.issues[2]!.rect
    expect(out.hypotheses[0]!.expanded).not.toBeNull()
    expect(next.y).toBeGreaterThan(box.y + box.height - 1)
    // 畳んだときより実際に高い（パネルのぶんを数え落としていたら赤くなる）
    expect(box.height).toBeGreaterThan(run(data).issues[1]!.rect.height)
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

  /**
   * **展開の単位は課題ノードである**（m5 Task 2）。開いた課題だけが幅を広げ、
   * 同じ列の他の箱は `BOX_WIDTH` のまま——`tree-layout.ts` の `columnXs` が深さごとの
   * 最大幅で列の x を決めるので、押し広げは列の側で自動的に効く
   */
  it('展開した課題ノードだけ幅が広がり、閉じたノードは BOX_WIDTH のまま', () => {
    const data = make({ issues: [root, child], hypotheses: [h(1)] })
    const layout = run(data, 0)
    expect(layout.issues[0]!.rect.width).toBe(EXPANDED_BOX_WIDTH)
    expect(layout.issues[1]!.rect.width).toBe(BOX_WIDTH)
    // 閉じれば元に戻る（幅がデータではなくビュー状態から出ている）
    expect(run(data).issues[0]!.rect.width).toBe(BOX_WIDTH)
  })

  it('展開した課題の仮説はすべてパネルを持つ', () => {
    // 課題1件・仮説3件。**1件では「先頭だけ開く」実装と区別できない**
    const data = make({ issues: [root], hypotheses: [h(1), h(2), h(3)] })
    const open = run(data, 0)
    for (const [i, p] of open.hypotheses.entries()) {
      expect(p!.expanded, `仮説${i + 1}`).not.toBeNull()
    }
    // 閉じていれば1件も持たない
    for (const [i, p] of run(data).hypotheses.entries()) {
      expect(p!.expanded, `仮説${i + 1}`).toBeNull()
    }
  })

  it('別の課題を展開しても、その課題にぶら下がらない仮説は畳まれたまま', () => {
    // root に h(1)、child に h(2)。child を開いても root の行は開かない
    const data = make({
      issues: [root, child],
      hypotheses: [h(1), { ...h(2), issueId: I(1) }],
    })
    const out = run(data, 1)
    expect(out.hypotheses[0]!.expanded).toBeNull()
    expect(out.hypotheses[1]!.expanded).not.toBeNull()
    expect(out.issues[0]!.rect.width).toBe(BOX_WIDTH)
    expect(out.issues[1]!.rect.width).toBe(EXPANDED_BOX_WIDTH)
  })

  /**
   * **タイトルは内容の左端から始まる**（m5 の実機確認後。それまでは開閉トグル
   *（シェブロン）のぶん 20px 右へ寄っていた）。トグルを撤去したのだから、
   * 空けていた場所も一緒に消えていること——**片方だけ残ると、誰も使わない
   * 20px がタイトルを痩せさせたまま画面に残る**（`measure.ts` から
   * `CHEVRON_*` が消えたので、式で書くこともできない）
   */
  it('課題のタイトルは箱の内容の左端から始まる（列の中で揃う）', () => {
    const data = make({ issues: [root, child], hypotheses: [h(1)] })
    const folded = run(data)
    const box = folded.issues[0]!
    expect(box.title.x).toBe(box.rect.x + ISSUE_INSET_X)
    // 仮説を持つ箱と持たない箱で同じ場所（列の中で左端が揃う）
    const leaf = folded.issues[1]!
    expect(leaf.title.x - leaf.rect.x).toBe(box.title.x - box.rect.x)
    // 開いても左端は動かない
    const open = run(data, 0).issues[0]!
    expect(open.title.x).toBe(open.rect.x + ISSUE_INSET_X)
    // タイトルは箱からはみ出さない
    expect(box.title.x + box.title.width).toBeLessThanOrEqual(box.rect.x + box.rect.width)
  })

  /**
   * **開くものが無ければ開かない。** 展開中の課題から最後の仮説を消したとき、
   * 行が1本も無い 780 幅の箱が残らないようにする番人（m4 からの退行だった
   * ——鍵が仮説を指していた頃は、消えれば自動的に畳まれていた）。
   *
   * **選択そのものは残る**（m5 実機確認後）——選ばれた印（`selected`）と
   * 末尾の「＋ 仮説を追加」は出る。**幅とボタンの両方を見る**——幅だけだと
   * 「ボタンごと出さない」実装（仮説を足す道がその課題から消える）が通り、
   * ボタンだけだと 780 に広がった箱が通る
   */
  it('仮説を1本も持たない課題は、選ばれても開かない（幅は畳んだまま／ボタンは出る）', () => {
    const data = make({ issues: [root, child] })
    const out = run(data, 0)
    expect(out.issues[0]!.selected).toBe(true)
    expect(out.issues[0]!.expanded).toBe(false)
    expect(out.issues[0]!.rect.width).toBe(BOX_WIDTH)
    // **ボタンは出る**——足す道が箱から消えないこと
    const add = out.issues[0]!.addHypothesis
    expect(add).not.toBeNull()
    expect(add!.height).toBe(ACTION_HEIGHT)
    // **箱の下端にちょうど収まる**（高さの式へ足し忘れると、はみ出したまま描かれる）
    expect(add!.y + add!.height + ISSUE_INSET_Y).toBe(
      out.issues[0]!.rect.y + out.issues[0]!.rect.height,
    )
    // 選ばれていない隣の箱にはボタンが無い
    expect(out.issues[1]!.selected).toBe(false)
    expect(out.issues[1]!.addHypothesis).toBeNull()
    // 1本でもぶら下がれば開ける
    const withRow = run(make({ issues: [root, child], hypotheses: [h(1)] }), 0)
    expect(withRow.issues[0]!.selected).toBe(true)
    expect(withRow.issues[0]!.expanded).toBe(true)
    expect(withRow.issues[1]!.expanded).toBe(false)
  })

  /**
   * ID 重複は**先に現れた方を採る**（`commands.ts` の規約。実体は
   * `core/canvas/flat-tree-core.ts` の `firstIndexById`）。ID 重複のファイルは
   * 受け入れて赤表示する仕様なので、ここは到達可能な入力である。
   *
   * **行の持ち主と箱の開閉が別々の規則で解決されると幾何が壊れる**
   *——`BOX_WIDTH` 前提で測った行を `EXPANDED_BOX_WIDTH` の箱に置く（またはその逆）ことになる
   */
  it('ID が重複した課題では、開けるのは先に現れた方だけ', () => {
    const dup: IssueNode = { id: I(0), parentId: null, text: '同じIDの後ろ側', events: [] }
    const data = make({ issues: [root, dup], hypotheses: [h(1)] })
    // 先頭を開くと、行もその箱の幅で測られる
    const first = run(data, 0)
    expect(first.issues[0]!.expanded).toBe(true)
    expect(first.issues[0]!.rect.width).toBe(EXPANDED_BOX_WIDTH)
    expect(first.hypotheses[0]!.expanded).not.toBeNull()
    // 後ろ側は開かない（箱だけが広がる、が起きない）
    const second = run(data, 1)
    expect(second.issues[1]!.expanded).toBe(false)
    expect(second.issues[1]!.rect.width).toBe(BOX_WIDTH)
    expect(second.hypotheses[0]!.expanded).toBeNull()
  })

  it('展開した課題では、仮説の行もパネルも広がった箱の中に収まる', () => {
    const data = make({
      issues: [root],
      hypotheses: [
        h(1, {
          feedbacks: [{ askId: null, text: 'FB1', by: '', sentiment: 'note', date: DATE }],
          events: [{ kind: 'supported', note: '実測で確認', date: DATE }],
        }),
        h(2),
      ],
    })
    const out = run(data, 0)
    const box = out.issues[0]!.rect
    expect(box.width).toBe(EXPANDED_BOX_WIDTH)
    for (const p of out.hypotheses) {
      const r = p!.rect
      expect(r.x).toBeGreaterThanOrEqual(box.x)
      expect(r.x + r.width).toBeLessThanOrEqual(box.x + box.width)
      expect(r.y + r.height).toBeLessThanOrEqual(box.y + box.height)
      const panel = p!.expanded!.panel
      expect(panel.x + panel.width).toBeLessThanOrEqual(box.x + box.width - ISSUE_INSET_X)
    }
    // 広がったぶんだけパネルの中身も広い（`BOX_WIDTH` のまま測っていたら赤くなる）
    const narrow = run(data).hypotheses[0]!
    expect(out.hypotheses[0]!.expanded!.notes.blocks[0].rows[0].text.width).toBeGreaterThan(
      narrow.row!.text.width,
    )
  })

  /**
   * 旗を1件立てた木のレイアウトを返す。**`posed` は必ず同じ `data` から取り直す**
   *——`layoutIssueTree` は「`posed` は同じ `data` に対する `poseQuestions(data)` の
   * 結果である」を前提に添字で引き当てており（`open-issues.md` にこの不変条件が
   * doc に書かれていないとして載っている）、別の木の答えを渡すとバッジが立ったり
   * 立たなかったりする。**テストの中でその不変条件を破らないこと**
   */
  const flagData = make({ issues: [root, child] })
  function layoutWithFlag(kind: 'deferred' | 'resolved'): IssueTreeLayout {
    const issues: IssueNode[] = flagData.issues.map((n, i) =>
      i === 1 ? { ...n, events: [{ kind, note: '通知の集約で解ける', date: DATE }] } : n,
    )
    const next = { ...flagData, issues }
    return layoutIssueTree(next, poseQuestions(next), fonts, -1)
  }

  it('解決の旗を掲げた課題は、見送りと同じ形で右上のバッジと理由の行を持つ', () => {
    const placement = layoutWithFlag('resolved').issues[1]
    expect(placement?.event).not.toBeNull()
    expect(placement?.event?.reason.height).toBeGreaterThan(0)
  })

  it('旗のバッジの幅は種別ごとに変わる（文言決め打ちに戻したら赤くなる）', () => {
    // **等値でも「片方が狭い」でもなく「違う」を見る。** 概算測定器の
    // 文字幅の仮定に寄りかからずに、`ISSUE_EVENT_LABELS[kind]` から測って
    // いることだけを押さえる
    const deferred = layoutWithFlag('deferred').issues[1]?.event?.badge.width
    const resolved = layoutWithFlag('resolved').issues[1]?.event?.badge.width
    expect(deferred).toBeDefined()
    expect(resolved).toBeDefined()
    expect(resolved).not.toBe(deferred)
    // ブリーフの前提の番人：「見送り」（3文字）と「解決」（2文字）で幅が違う
    expect(ISSUE_EVENT_LABELS.deferred).not.toBe(ISSUE_EVENT_LABELS.resolved)
  })
})
