import { describe, expect, it } from 'vitest'
import { createEstimateMeasurer } from '@/core/canvas/wrap'
import type { Hypothesis, IssueNode, IssueTreeSchemaVersion3 } from '@/types/issue-tree'
import { ISSUE_EVENT_LABELS, poseQuestions } from './derive'
import { layoutIssueTree, SECTION_LABELS, type IssueTreeFonts, type IssueTreeLayout } from './layout'
import {
  ACTION_HEIGHT,
  BADGE_GAP,
  BOX_WIDTH,
  CHEVRON_GAP,
  CHEVRON_SIZE,
  EXPANDED_BOX_WIDTH,
  ISSUE_INSET_X,
  ISSUE_INSET_Y,
  PANEL_INSET_Y,
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
 * **第4引数は「展開している課題の添字」**（issue-tree m5 Task 2 で仮説の添字から
 * 変わった）。展開の単位が課題ノードになったので、開いた課題にぶら下がる仮説は
 * まとめてパネルを持つ
 */
function run(data: IssueTreeSchemaVersion3, expandedIssueIndex = -1) {
  return layoutIssueTree(data, poseQuestions(data), fonts, expandedIssueIndex)
}

function make(over: Partial<IssueTreeSchemaVersion3>): IssueTreeSchemaVersion3 {
  return { schemaVersion: 3, type: 'issueTree', title: 'T', issues: [], hypotheses: [], ...over }
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
  it('一番広い枠（仮説なしバッジ）を引いても、タイトルは日本語8字ぶんを残す', () => {
    const data = make({ issues: [{ ...root, text: '' }] })
    expect(poseQuestions(data).issueNeedsHypothesis[0]).toBe(true)
    const box = run(data).issues[0]!
    expect(box.title.width).toBeGreaterThanOrEqual(fonts.title.measure('あ'.repeat(8)))
    // タイトルは箱からはみ出さない
    expect(box.title.x + box.title.width).toBeLessThanOrEqual(box.rect.x + box.rect.width)
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
          events: [
            { kind: 'supported', note: '根拠', date: DATE },
            { kind: 'rejected', note: '覆った', date: DATE },
          ],
        }),
        h(3),
      ],
    })
    const folded = run(data)
    // **課題ごと開く**（m5）。仮説1本だけを開く道はもう無い
    const open = run(data, 0)
    expect(folded.hypotheses[1]!.expanded).toBeNull()
    const p = open.hypotheses[1]!.expanded!
    expect(p.previous).toHaveLength(1) // events 2件 → 以前の判断は1件
    expect(p.previousLabel).not.toBeNull()
    expect(p.notes.cells).toHaveLength(2)
    // 判断も FB も無い隣の仮説にもパネルは出る（節は「判断」と「FB」の2つ）
    const bare = open.hypotheses[0]!.expanded!
    expect(bare.previous).toEqual([])
    expect(bare.previousLabel).toBeNull()
    expect(bare.notes.cells).toEqual([])
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
    // 節は上から ソリューション仮説 → 価値仮説 → 検証結果 → 以前の判断 → FB の順
    //（由来は v3 で廃止された）。**y で見る**——描く側の DOM 順は
    // `HypothesisPanel.dom.test.tsx` が別に見ている
    expect(p.solution.title.y).toBeGreaterThan(p.solution.label.y)
    expect(p.solution.detail.y).toBeGreaterThan(p.solution.title.y)
    expect(p.value.label.y).toBeGreaterThan(p.solution.detail.y)
    expect(p.value.field.y).toBeGreaterThan(p.value.label.y)
    expect(p.judgement.label.y).toBeGreaterThan(p.value.field.y)
    expect(p.previousLabel).not.toBeNull()
    expect(p.previousLabel!.y).toBeGreaterThan(p.judgement.note.y)
    expect(p.notes.label.y).toBeGreaterThan(p.previous[0].note.y)
    expect(p.notes.add.y).toBeGreaterThan(p.notes.cells[1].y)
    // 検証結果の根拠は見出しの帯の下に、パネルの全幅で座る（バッジ・日付・
    // トリガーは帯の中に flex で並ぶので、根拠の幅を削らない）
    expect(p.judgement.note.y).toBeGreaterThanOrEqual(
      p.judgement.label.y + p.judgement.label.height,
    )
    expect(p.judgement.note.x).toBe(p.judgement.label.x)
    expect(p.judgement.note.width).toBe(p.judgement.label.width)
  })

  it('展開パネルに「由来」の節が無い（rationale の廃止）', () => {
    // 型からも消えているので、これは「消し忘れた矩形が残っていない」ことの番人ではなく、
    // **節が3つ（判断・以前の判断・FB）に減ったぶんパネルが縮む**ことの番人である
    const data = make({
      issues: [root],
      hypotheses: [
        h(1, {
          feedbacks: [{ askId: null, text: 'FB1', by: '', sentiment: 'note', date: DATE }],
          events: [
            { kind: 'supported', note: '根拠', date: DATE },
            { kind: 'rejected', note: '覆った', date: DATE },
          ],
        }),
      ],
    })
    const posed = poseQuestions(data)
    const withRationaleGone = layoutIssueTree(data, posed, fonts, 0)
    const panel = withRationaleGone.hypotheses[0]?.expanded
    expect(panel).not.toBeNull()
    expect(Object.keys(SECTION_LABELS)).toEqual([
      'solution',
      'value',
      'judgement',
      'previous',
      'notes',
    ])
    // **SECTION_LABELS の鍵だけでは「矩形が残っていないか」しか見ない。**
    // パネルの実測が節3つぶんぴったりであることも見る——最後の内容（＋FBボタン）
    // の下端と、パネルの下端（内側余白を引いた位置）が一致するはずで、由来の
    // ぶんの高さを `sectionHs` から消し忘れているとここに隙間が残る
    const p = panel!
    expect(p.notes.add.y + ACTION_HEIGHT).toBe(p.panel.y + p.panel.height - PANEL_INSET_Y)
  })

  it('イベントが1件だけの仮説には「以前の判断」の節が出ない', () => {
    const data = make({
      issues: [root],
      hypotheses: [h(1, { events: [{ kind: 'supported', note: '実測', date: DATE }] })],
    })
    const p = run(data, 0).hypotheses[0]!.expanded!
    expect(p.previous).toEqual([])
    expect(p.previousLabel).toBeNull()
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
   * **高さの大小では見ない**——開くと箱が 320 → 780 に広がってタイトルの幅も
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

    // シェブロンはタイトルの**1行目**に対して縦中央。開いた箱の行高で割る
    expect(open.chevron.y - open.rect.y - ISSUE_INSET_Y).toBe(
      Math.floor((fonts.expandedTitle.lineHeight - CHEVRON_SIZE) / 2),
    )
    expect(folded.chevron.y - folded.rect.y - ISSUE_INSET_Y).toBe(
      Math.floor((fonts.title.lineHeight - CHEVRON_SIZE) / 2),
    )
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
    expect(p.solution.detail.height).toBeGreaterThan(fonts.body.lineHeight)
    expect(p.value.field.height).toBeGreaterThan(fonts.body.lineHeight)
    expect(p.judgement.note.height).toBeGreaterThan(fonts.body.lineHeight)

    // 空の欄は1行ぶん残す（潰すと、プレースホルダも押せる場所も消える）
    const empty = run(make({ issues: [root], hypotheses: [h(1)] }), 0).hypotheses[0]!.expanded!
    expect(empty.solution.detail.height).toBe(fonts.body.lineHeight)
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
   * 同じ列の他の箱は 320 のまま——`tree-layout.ts` の `columnXs` が深さごとの
   * 最大幅で列の x を決めるので、押し広げは列の側で自動的に効く
   */
  it('展開した課題ノードだけ幅が広がり、閉じたノードは320のまま', () => {
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

  it('課題のタイトルは開閉トグルのぶんだけ右へ寄り、その場所は開いても閉じても空く', () => {
    // **仮説を持たない課題でも空ける**——空けないと、同じ列の中でタイトルの
    // 左端が箱ごとにずれる（`IssueBox` は仮説を持たない箱でトグルを
    // `invisible` にするだけで、場所は残す）
    const data = make({ issues: [root, child], hypotheses: [h(1)] })
    const folded = run(data)
    const chevronBox = folded.issues[0]!
    expect(chevronBox.chevron.width).toBe(CHEVRON_SIZE)
    expect(chevronBox.chevron.height).toBe(CHEVRON_SIZE)
    expect(chevronBox.chevron.x + CHEVRON_SIZE + CHEVRON_GAP).toBe(chevronBox.title.x)
    // **縦はタイトルの1行目に対する中央。** 行全体の中央にすると、タイトルが
    // 折り返したときシェブロンだけが下がる（行頭の点をバッジに揃えたのと同じ理屈）
    expect(chevronBox.chevron.y).toBe(
      chevronBox.title.y + Math.floor((fonts.title.lineHeight - CHEVRON_SIZE) / 2),
    )
    expect(chevronBox.title.x).toBe(chevronBox.rect.x + ISSUE_INSET_X + CHEVRON_SIZE + CHEVRON_GAP)
    // 仮説を持たない箱でも同じ場所（列の中で左端が揃う）
    const leaf = folded.issues[1]!
    expect(leaf.title.x - leaf.rect.x).toBe(chevronBox.title.x - chevronBox.rect.x)
    // タイトルは箱からはみ出さない
    expect(chevronBox.title.x + chevronBox.title.width).toBeLessThanOrEqual(
      chevronBox.rect.x + chevronBox.rect.width,
    )
  })

  /**
   * **タイトルが折り返してもシェブロンは1行目に留まる**（上のテストと対。
   * こちらは複数行のタイトルで見る——1行だけだと「行全体の中央」の実装でも
   * 同じ座標に落ちて弁別できない）
   */
  it('タイトルが折り返しても、シェブロンは1行目の高さに留まる', () => {
    const short = run(make({ issues: [{ ...root, text: '短い' }] })).issues[0]!
    const long = run(make({ issues: [{ ...root, text: 'あ'.repeat(60) }] })).issues[0]!
    expect(long.title.height).toBeGreaterThan(short.title.height)
    expect(long.chevron.y - long.rect.y).toBe(short.chevron.y - short.rect.y)
  })

  /**
   * **開くものが無ければ開かない。** 展開中の課題から最後の仮説を消したとき、
   * 行が1本も無い 780 幅の箱が残らないようにする番人（m4 からの退行だった
   * ——鍵が仮説を指していた頃は、消えれば自動的に畳まれていた）
   */
  it('仮説を1本も持たない課題は、展開の添字が自分を指していても開かない', () => {
    const data = make({ issues: [root, child] })
    const out = run(data, 0)
    expect(out.issues[0]!.expandable).toBe(false)
    expect(out.issues[0]!.expanded).toBe(false)
    expect(out.issues[0]!.rect.width).toBe(BOX_WIDTH)
    // 1本でもぶら下がれば開ける
    const withRow = run(make({ issues: [root, child], hypotheses: [h(1)] }), 0)
    expect(withRow.issues[0]!.expandable).toBe(true)
    expect(withRow.issues[0]!.expanded).toBe(true)
    expect(withRow.issues[1]!.expanded).toBe(false)
  })

  /**
   * ID 重複は**先に現れた方を採る**（`commands.ts` の規約。実体は
   * `core/canvas/flat-tree-core.ts` の `firstIndexById`）。ID 重複のファイルは
   * 受け入れて赤表示する仕様なので、ここは到達可能な入力である。
   *
   * **行の持ち主と箱の開閉が別々の規則で解決されると幾何が壊れる**
   *——320 前提で測った行を 780 の箱に置く（またはその逆）ことになる
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
    // 広がったぶんだけパネルの中身も広い（320 のまま測っていたら赤くなる）
    const narrow = run(data).hypotheses[0]!
    expect(out.hypotheses[0]!.expanded!.notes.cells[0].width).toBeGreaterThan(
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
    const issues = flagData.issues.map((n, i) =>
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
