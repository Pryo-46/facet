// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { badgeClass, BADGE_BOX_HEIGHT, type BadgeVariant } from '@/components/badge-styles'
import { buildTree, type FlatTreeNode } from '@/core/canvas/flat-tree'
import { todayString } from '@/core/today'
import type { IssueTreeSchemaVersion3 } from '@/types/issue-tree'
import { badgeVariantOf, FLAG_BADGE_GROUPS } from './badge-variant'
import {
  BADGE_LABELS,
  EVENT_KIND_LABELS,
  ISSUE_EVENT_LABELS,
  ISSUE_EVENT_NOTES,
  issueEventLine,
  poseQuestions,
  QUESTION_LABELS,
  TALLY_TOTAL_LABEL,
  tallyLine,
  tallyQuestions,
} from './derive'
import { CLEAR_JUDGEMENT_LABEL, IssueTreeEditor } from './IssueTreeEditor'
import { NO_ASK_TEXT, SECTION_LABELS, SENTIMENT_LABELS } from './layout'
import {
  BOX_WIDTH,
  EXPANDED_BOX_WIDTH,
  EXPANDED_TITLE_FONT_CLASS,
  TITLE_FONT_CLASS,
} from './measure'

afterEach(cleanup)

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

/**
 * 課題3件（根→中間→葉）・仮説1件。**中間ノードが子を持っている形を選ぶ**
 *——葉の直後で足すと `Tab`（子課題）と `Enter`（兄弟課題）が同じ配列位置・
 * 同じラベルになり、写像を差し替えても緑のままになる（logic-tree M1 が踏んだ形）
 */
const file = (): IssueTreeSchemaVersion3 => ({
  schemaVersion: 4,
  type: 'issueTree',
  title: 'テスト',
  issues: [
    { id: I(1), parentId: null, text: '結果取得を画面遷移の中で待てるか', events: [] },
    { id: I(2), parentId: I(1), text: '待てないなら何を先に返すか', events: [] },
    { id: I(3), parentId: I(2), text: '受付IDだけ返せるか', events: [] },
  ],
  hypotheses: [
    {
      id: H(1),
      issueId: I(3),
      title: '既存APIの前例に合わせられる',
      detail: '',
      value: '',
      asks: [],
      feedbacks: [],
      events: [],
    },
  ],
})

/** 額縁と同じく、onChange を state に反映する殻を被せる */
function Harness({
  initial,
  onChange,
}: {
  initial: IssueTreeSchemaVersion3
  onChange?: (next: IssueTreeSchemaVersion3, mergeKey?: string | null) => void
}) {
  const [data, setData] = useState(initial)
  return (
    <IssueTreeEditor
      data={data}
      onChange={(next, mergeKey) => {
        onChange?.(next, mergeKey)
        setData(next)
      }}
      issues={[]}
      modalOpen={false}
    />
  )
}

/**
 * 課題ノードの入力欄。**アクセシブル名の前半（`課題{N}`）で引く**——後半には
 * 「（未記入）」や立っている問いが付く。role を textbox に絞るのは、
 * 同じ接頭辞を持つ旗のトグル（`課題{N}の見送り` / `課題{N}の解決`）と区別するため。
 *
 * **後半を素通しにしない**——旗を立てた課題は同じ箱の中に理由の欄
 *（`課題{N} の見送りの理由` 等）を持っており、前方一致だけだと2件引いてしまう。
 * 許すのは「（未記入）」と立っている問いだけにして、前半の約束は動かさない
 */
const issueCell = (n: number): HTMLTextAreaElement =>
  screen.getByRole('textbox', {
    name: new RegExp(`^課題${n}(（未記入）)?( ${QUESTION_LABELS.hypothesis})?$`),
  }) as HTMLTextAreaElement

/**
 * 課題の箱そのもの（クリックの受け口）。箱に `data-cell` は無いので
 * **タイトルの欄からたどる**。
 *
 * **箱を押すとその課題が選択される**（m5 の実機確認後。それまでは
 * タイトルの左のシェブロンを押していた）——選択中は仮説のパネルが開き、
 * もう一度押すと外れる
 */
const issueBox = (n: number): HTMLElement => {
  const box = issueCell(n).closest('[class*="pointer-events-auto"]')
  if (box === null) throw new Error(`課題${n}の箱が無い`)
  return box as HTMLElement
}

/** 課題の箱をクリックする（＝選ぶ／選択中ならば外す） */
const clickIssueBox = (n: number): void => {
  fireEvent.click(issueBox(n))
}

/**
 * 仮説の文言の欄。**畳まれた行に textbox は無い**（M3 の文法）——行はボタンで、
 * 押す（＝フォーカスが入る）と展開して textarea になる。
 * 既に開いていればそのまま返す
 */
const openHypothesis = (n: number): HTMLTextAreaElement => {
  const row = screen.queryByRole('button', { name: `仮説${n}を開く` })
  if (row !== null) fireEvent.click(row)
  return screen.getByRole('textbox', { name: `仮説${n}` }) as HTMLTextAreaElement
}

describe('IssueTreeEditor（木の操作）', () => {
  it('Tab は子課題を、Enter は兄弟課題を作る（子を持つ中間ノードの上で）', () => {
    // **どちらも配列位置3・ラベル「課題4」に着地する**ので、画面の見た目では
    // 取り違えを検出できない。親で見る
    const onTab = vi.fn()
    const { unmount } = render(<Harness initial={file()} onChange={onTab} />)
    // 既定動作を止めること（fireEvent は preventDefault されると false を返す）。
    // 止め損なうと、新しい課題へ移した直後に既定の Tab 送りでフォーカスが逃げる
    expect(fireEvent.keyDown(issueCell(2), { key: 'Tab' })).toBe(false)
    expect(onTab.mock.calls[0][0].issues[3].parentId).toBe(I(2))
    unmount()

    const onEnter = vi.fn()
    render(<Harness initial={file()} onChange={onEnter} />)
    expect(fireEvent.keyDown(issueCell(2), { key: 'Enter' })).toBe(false)
    expect(onEnter.mock.calls[0][0].issues[3].parentId).toBe(I(1))
  })

  it('Shift+Enter / Alt+Enter は誰も消費しない（セル内改行が生きる）', () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
    expect(fireEvent.keyDown(issueCell(2), { key: 'Enter', shiftKey: true })).toBe(true)
    expect(fireEvent.keyDown(issueCell(2), { key: 'Enter', altKey: true })).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('モーダルが開いている間は操作言語が止まる', () => {
    const onChange = vi.fn()
    render(
      <IssueTreeEditor data={file()} onChange={onChange} issues={[]} modalOpen />,
    )
    fireEvent.keyDown(issueCell(2), { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('IssueTreeEditor（仮説は操作言語を持たない。m5）', () => {
  // m5 でキーによる操作は課題の追加・削除・移動だけになった。仮説の追加・削除・
  // 判断の変更はマウスのボタンへ移り（Task 6・7）、仮説側のセルはキーを取らない

  it('仮説の文言で Enter を打っても仮説は増えない（キーは課題だけが取る）', () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
    // **戻り値も見る。** `false`＝既定動作（改行）を消費して止めた——閉じた行は
    // 1行で測っているので、改行が入ると測定と描画がずれる（`swallowEnter` の役目）
    expect(fireEvent.keyDown(openHypothesis(1), { key: 'Enter' })).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  /**
   * **修飾つきの Enter も止める。**
   *
   * rev 10章は「`Shift+Enter` / `Alt+Enter` はアプリが関与しない（＝ブラウザ
   * 既定のセル内改行が生きる）」を不変条件として持ち、課題セルではそれを
   * 上の「Shift+Enter / Alt+Enter は誰も消費しない」が守っている。
   * **仮説のタイトルはその明示的な例外**で、`swallowEnter` は修飾を見ずに
   * `preventDefault` する——畳まれた仮説の行はこの文言を**1行**として
   * 測っているので、どの打ち方であれ改行が入れば測定と描画がずれる。
   *
   * **素の Enter だけを見ていると、修飾を除外する変異
   *（`&& !e.shiftKey && !e.altKey`）が緑のまま通る。** ここが例外の
   * 適用範囲そのものを固定する番人である
   */
  it('仮説のタイトルでは修飾つきの Enter も消費する（rev 10章の例外の適用範囲）', () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
    const title = openHypothesis(1)
    expect(fireEvent.keyDown(title, { key: 'Enter', shiftKey: true })).toBe(false)
    expect(fireEvent.keyDown(title, { key: 'Enter', altKey: true })).toBe(false)
    // 主修飾キー（課題ツリーでは未割り当て）でも同じ——改行させない
    expect(fireEvent.keyDown(title, { key: 'Enter', ctrlKey: true })).toBe(false)
    expect(fireEvent.keyDown(title, { key: 'Enter', metaKey: true })).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('仮説の文言が空でも Backspace で仮説は消えない', () => {
    const base = file()
    const onChange = vi.fn()
    render(
      <Harness
        initial={{ ...base, hypotheses: [{ ...base.hypotheses[0], title: '' }] }}
        onChange={onChange}
      />,
    )
    // Backspace はどの操作にも写像されないので既定動作のまま（消費しない＝true）
    expect(fireEvent.keyDown(openHypothesis(1), { key: 'Backspace' })).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: '仮説1' })).toBeTruthy()
  })
})

describe('IssueTreeEditor（IME）', () => {
  /**
   * 変換確定の Enter で課題が増えないこと。**「呼ばれていないこと」だけを
   * 見ない**——手前で例外が飛んでも緑になるので、続けて素の Enter を送って
   * 増えることまで見る
   */
  it('変換確定の Enter（keyCode 229）では課題が増えず、素の Enter では増える', () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
    const cell = issueCell(2)
    fireEvent.keyDown(cell, { key: 'Enter', keyCode: 229 })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.keyDown(cell, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].issues).toHaveLength(4)
  })
})

describe('IssueTreeEditor（見送りと抑制）', () => {
  it('祖先を見送りにすると、配下の箱とバッジが薄い枠に落ちる', () => {
    // `derive.ts` の抑制が描画まで繋がっていることを見る唯一の窓
    render(<Harness initial={file()} />)
    const badgeOf = (n: number): HTMLElement => {
      const row = screen.getByRole('button', { name: `仮説${n}を開く` })
      // バッジは行の中の inline-flex な要素（行頭の点は rounded-full の span）
      const badge = row.querySelector('[class*="inline-flex"]')
      if (badge === null) throw new Error(`仮説${n}のバッジが無い`)
      return badge as HTMLElement
    }
    // 抑制されていない仮説のバッジは「未決」の面（missing の破線）
    expect(badgeOf(1).className).toBe(badgeClass(badgeVariantOf('open', false)))

    // 見送りは課題ノードのトグルを1回押して付ける（種別は初期状態では `deferred`
    // の1語しか無いので選ばせない。かつてはここが1択のドロップダウンだった）
    const toggle = screen.getByRole('button', { name: '課題1の見送り' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    /**
     * **この検査が捕まえるのは「JSX に文字列を直書きした」ことだけである。**
     *
     * 描く側もレイアウト（`layout.ts` の `slotW`）も同じ `ISSUE_EVENT_LABELS.deferred`
     * を読むので、定数を書き換えれば両方が一緒に動く。**v3 では切り／入りの文言が
     * 同じ1つの定数から出る**（旧 `DEFER_TRIGGER_LABEL` と `ISSUE_DEFERRED_LABEL` は
     * 統合された）ので、取り違えを捕まえるのは、すぐ下の**面のクラス**の照合の方である。
     *
     * **空けた幅と描いた幅が一致することは、ここでは検査していない。**
     * `px-1`→`px-2`・枠線の削除・`text-sm`→`text-base`・`ACTION_INSET_X` の
     * 変更——予約幅と描画幅を食い違わせる経路はどれも `textContent` を
     * 動かさない。**jsdom には版組が無いので原理的に測れない**ので、
     * 対は「measure.ts の定数と Tailwind クラスを対で直す」という規律
     *（`measure.ts` の註）と実機確認が守っている
     */
    expect(toggle.textContent).toBe(ISSUE_EVENT_LABELS.deferred)
    // **切りの面もバッジと同じ幾何を持つ**（実機所見: 周囲のバッジとサイズが
    // 揃っていなかった）。色は「押せる面」だが、箱の高さはバッジと揃える
    expect(toggle.className).toContain(`h-[${BADGE_BOX_HEIGHT}px]`)
    // **切りの面はバッジの面ではない。** ここが入りの面になっていたら、
    // 見送っていない箱に見送りバッジが出ている
    expect(toggle.className).not.toContain(badgeClass(badgeVariantOf('deferred', false)))
    const offFace = toggle.className
    fireEvent.click(toggle)

    // 押した後は**見送りの理由の欄**へフォーカスが来る（`toggleIssueEvent` の行き先）
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: '課題1 の見送りの理由' }),
    )
    // 入りになったことは名前ではなく `aria-pressed` が運ぶ（名前は動かさない）
    const pressed = screen.getByRole('button', { name: '課題1の見送り' })
    expect(pressed.getAttribute('aria-pressed')).toBe('true')
    // **入りの面は見送りバッジそのもの**（課題1は根なので祖先由来の抑制は無い）。
    // 面が状態で入れ替わることを、両側から挟んで固定する
    expect(pressed.className).toContain(badgeClass(badgeVariantOf('deferred', false)))
    expect(pressed.className).not.toBe(offFace)
    // **バッジは消えない——薄い枠（ink-faint）に落ちる。** 「いま作業する面では
    // ない」ことを面の濃さで見せる（`opacity-*` では検算した比を割る）
    expect(badgeOf(1).className).toBe(badgeClass(badgeVariantOf('open', true)))
    expect(badgeOf(1).className).toContain('ink-faint')
    // 箱も同じ段に落ち、面は見送りの面ごとグレー（M25 で bg-surface →
    // bg-surface-muted へ反転。地の色には落とさない＝木の形は読めたまま）
    const box = issueCell(2).closest('[class*="pointer-events-auto"]')
    expect(box?.className).toContain('border-ink-faint')
    expect(box?.className).toContain('text-ink-faint')
    expect(box?.className).toContain('bg-surface-muted')
    // 未決の集計も0になる（抑制された配下は勘定に入らない）
    expect(
      screen.getByText(tallyLine({ hypothesis: 0, result: 0, hold: 0, feedback: 0, total: 0 })),
    ).toBeTruthy()
  })

  /**
   * **見送りを掲げている当の課題は通常どおり描き、薄くなるのは配下だけ**
   *（`docs/issue-tree/俯瞰モック/俯瞰.html` の規則。見送り箱は `class="issue"` で
   * `faint` を持たない）。見送りは**そこで下した判断の表明**であって
   * 「もう見なくてよい枝」ではないので、薄くすると誰が何を落としたのかが
   * 図から読めなくなる。
   *
   * **`suppressedIssueIds` の自己包含は正しく、触ってはいけない**——
   * 見送った課題自身に「仮説なし」を立てないためにそうなっている。
   * 分けるのは**渡し方**（箱とエッジは祖先由来だけ、箱の中の行は自己包含）
   * であり、ここが戻されると画面だけが黙ってモックと食い違う
   */
  it('見送った課題自身の箱とバッジは薄くならず、配下の箱だけが薄くなる', () => {
    const base = file()
    render(
      <Harness
        initial={{
          ...base,
          // **中間の課題（課題2）に付ける**——根に付けると「自分自身」と
          // 「配下」の区別が付く相手が居なくなる
          issues: base.issues.map((n, i) =>
            i === 1
              ? { ...n, events: [{ kind: 'deferred', note: '初回フローの成立が先', date: '2026-08-30' }] }
              : n,
          ),
          // **見送った課題2に直接ぶら下がる仮説を足す。** 既存の仮説1は課題3
          //（＝配下）にぶら下がっており、自己包含でも祖先由来でも薄くなるので、
          // 「行だけは自己包含で薄くする」という今回の設計の要を突けない
          hypotheses: [
            ...base.hypotheses,
            {
              id: H(2),
              issueId: I(2),
              title: '通知は後追いで足せる',
              detail: '',
              value: '',
              asks: [],
              feedbacks: [],
              events: [],
            },
          ],
        }}
      />,
    )
    const boxOf = (n: number): HTMLElement => {
      const box = issueCell(n).closest('[class*="pointer-events-auto"]')
      if (box === null) throw new Error(`課題${n}の箱が無い`)
      return box as HTMLElement
    }
    // 見送りを掲げている当人（課題2）は薄くならず、見送りの塗り
    // （`border-rule bg-surface-muted`。`rule` はこの面の上でも 3:1 を満たす）を持つ。
    // M25 からは配下も同じ面を持つので、**当人を識別するのは面ではなく
    // 文字の濃さ（ink-faint でない）と実線のバッジ**である
    expect(boxOf(2).className).toContain('bg-surface-muted')
    expect(boxOf(2).className).not.toContain('ink-faint')
    expect(screen.getByRole('button', { name: '課題2の見送り' }).className).toContain(
      badgeClass(badgeVariantOf('deferred', false)),
    )
    // 配下（課題3）は薄い枠と薄い文字に落ち、面は見送りの面ごとグレー（M25）
    expect(boxOf(3).className).toContain('border-ink-faint')
    expect(boxOf(3).className).toContain('text-ink-faint')
    expect(boxOf(3).className).toContain('bg-surface-muted')
    // **箱の中の仮説行は薄いまま**（「その課題はもう追わない」は配下の仮説にも及ぶ）。
    // 箱の面は通常に戻したので、行が箱から色を継承していると薄くならない
    const rowBadgeClass = (n: number): string => {
      const row = screen.getByRole('button', { name: `仮説${n}を開く` })
      const badge = row.querySelector('[class*="inline-flex"]')
      if (badge === null) throw new Error(`仮説${n}のバッジが無い`)
      return (badge as HTMLElement).className
    }
    // 仮説2 は**見送った課題2に直接**ぶら下がる（ここが分割の要。箱と同じ配列を
    // 行にも渡すと、この行だけが濃くなる）
    expect(rowBadgeClass(2)).toBe(badgeClass(badgeVariantOf('open', true)))
    // 仮説1 は配下の課題3 にぶら下がる
    expect(rowBadgeClass(1)).toBe(badgeClass(badgeVariantOf('open', true)))
  })

  /**
   * **見送りが入れ子になっている木**。修正ラウンド1 で「祖先由来の抑制」を
   * 「自分が見送っていない」（`node.events.length === 0`）で代用してしまい、
   * **C が B の配下なのに通常の面へ戻る**退行を出した——薄い D の上に濃い C が
   * 挟まり、B→C の線まで実線になっていた。既存のテストは見送りが1段しか無く、
   * 素通りした。
   *
   * 正しい規則は2つの重ね合わせである:
   *
   * - 見送りを**掲げている当人**（B）は通常どおり描く。入る線も実線
   * - **祖先のいずれかが見送っている**課題（C・D）は、自分が見送っていようと
   *   いまいと薄い。入る線も破線
   */
  it('見送りが入れ子でも、配下は薄いまま（自分も見送っている C が濃く戻らない）', () => {
    const nested: IssueTreeSchemaVersion3 = {
      schemaVersion: 4,
      type: 'issueTree',
      title: 'テスト',
      issues: [
        { id: I(1), parentId: null, text: 'A 通常', events: [] },
        {
          id: I(2),
          parentId: I(1),
          text: 'B 見送り',
          events: [{ kind: 'deferred', note: '今回は追わない', date: '2026-08-30' }],
        },
        {
          id: I(3),
          parentId: I(2),
          text: 'C 見送り',
          events: [{ kind: 'deferred', note: '本開発で扱う', date: '2026-08-30' }],
        },
        { id: I(4), parentId: I(3), text: 'D 通常', events: [] },
      ],
      hypotheses: [],
    }
    const { container } = render(<Harness initial={nested} />)
    const boxOf = (n: number): HTMLElement => {
      const box = issueCell(n).closest('[class*="pointer-events-auto"]')
      if (box === null) throw new Error(`課題${n}の箱が無い`)
      return box as HTMLElement
    }
    // A（根）と B（見送りを掲げている当人）は通常の面
    expect(boxOf(1).className).not.toContain('ink-faint')
    expect(boxOf(2).className).not.toContain('ink-faint')
    // **C は自分も見送っているが、B の配下なので薄い**（ここが退行した箇所）
    expect(boxOf(3).className).toContain('border-ink-faint')
    expect(boxOf(4).className).toContain('border-ink-faint')

    // 線も同じ境目で切り替わる。**B→C が実線に戻っていないこと**
    const built = buildTree(nested.issues)
    const keys = new Map<number, string>()
    const collect = (node: FlatTreeNode): void => {
      keys.set(node.index, node.key)
      for (const child of node.children) collect(child)
    }
    for (const root of built.roots) collect(root)
    const dashOf = (parent: number, child: number): string | null => {
      const edge = container.querySelector(
        `[data-edge="${keys.get(parent)}->${keys.get(child)}"]`,
      )
      if (edge === null) throw new Error(`課題${parent + 1}→課題${child + 1} の線が無い`)
      return edge.getAttribute('stroke-dasharray')
    }
    expect(dashOf(0, 1)).toBeNull() // A→B は実線
    expect(dashOf(1, 2)).toBe('4 3') // B→C は破線
    expect(dashOf(2, 3)).toBe('4 3') // C→D は破線
  })

  /**
   * `bg-surface-muted` の塗りは**見送りを掲げた当人の箱だけ**に付く
   *（`IssueBox.tsx` D8）。同じ入れ子の木（A 通常→B 見送り→C 見送り→D 通常）を
   * 流用し、上のテストが見た「枠と文字の薄さ」に加えて塗りの有無も見る。
   *
   * **`toContain` ではなく `split(' ')` の完全一致で見る。** `bg-surface-muted`
   * は文字列として `bg-surface` を含む（`'bg-surface-muted'.includes('bg-surface')`
   * が真）ので、`toContain('bg-surface')` は `bg-surface-muted` の箱でも
   * 通ってしまい、「非塗りの箱だけが `bg-surface` を持つ」を検査できない
   */
  // M25 で主張が反転した——それまでは「塗るのは掲げた当人だけ（配下は
  // bg-surface のまま）」を固定していたが、実機で「白い配下がまだ生きている
  // 枝に見える」と出て、配下も塗ることになった（設計ノート D8 の M25 追記）。
  // いま面が運ぶのは「凍結の範囲」で、当人と配下の区別は文字の濃さ
  // （ink-faint か否か）が運ぶ——それはこのテストと「入れ子でも配下は
  // 薄いまま」のテストが両側から見ている
  it('見送りの枝（当人と配下）だけが bg-surface-muted を持ち、通常の箱は持たない', () => {
    const nested: IssueTreeSchemaVersion3 = {
      schemaVersion: 4,
      type: 'issueTree',
      title: 'テスト',
      issues: [
        { id: I(1), parentId: null, text: 'A 通常', events: [] },
        {
          id: I(2),
          parentId: I(1),
          text: 'B 見送り',
          events: [{ kind: 'deferred', note: '今回は追わない', date: '2026-08-30' }],
        },
        {
          id: I(3),
          parentId: I(2),
          text: 'C 見送り',
          events: [{ kind: 'deferred', note: '本開発で扱う', date: '2026-08-30' }],
        },
        { id: I(4), parentId: I(3), text: 'D 通常', events: [] },
      ],
      hypotheses: [],
    }
    render(<Harness initial={nested} />)
    const boxOf = (n: number): HTMLElement => {
      const box = issueCell(n).closest('[class*="pointer-events-auto"]')
      if (box === null) throw new Error(`課題${n}の箱が無い`)
      return box as HTMLElement
    }
    const classesOf = (n: number): string[] => boxOf(n).className.split(' ')

    // A：通常の箱は塗らない
    expect(classesOf(1)).not.toContain('bg-surface-muted')
    expect(classesOf(1)).toContain('bg-surface')
    // B：見送りを掲げた当人は塗り、文字は濃いまま
    expect(classesOf(2)).toContain('bg-surface-muted')
    expect(classesOf(2)).not.toContain('bg-surface')
    expect(classesOf(2)).not.toContain('text-ink-faint')
    // C：自分も見送っているが、祖先（B）由来の抑制が勝つ——面は同じグレーでも
    // 文字は faint（濃く戻らない）
    expect(classesOf(3)).toContain('bg-surface-muted')
    expect(classesOf(3)).not.toContain('bg-surface')
    expect(classesOf(3)).toContain('text-ink-faint')
    // D：ただの抑制された配下も同じ（枝全体がひとかたまりのグレー）
    expect(classesOf(4)).toContain('bg-surface-muted')
    expect(classesOf(4)).not.toContain('bg-surface')
    expect(classesOf(4)).toContain('text-ink-faint')
  })

  it('見送った課題はバッジと理由の欄を持ち、打つと最新の見送りの note が変わる', () => {
    // レイアウトはこの行のぶん縦を空けている。描かないと、見送った課題は
    // 「箱の下に理由の分だけ空白が空いたノード」になる
    const base = file()
    const onChange = vi.fn()
    render(
      <Harness
        initial={{
          ...base,
          issues: base.issues.map((n, i) =>
            i === 0
              ? {
                  ...n,
                  events: [{ kind: 'deferred', note: '本開発の設計と一緒に決める', date: '2026-08-30' }],
                }
              : n,
          ),
        }}
        onChange={onChange}
      />,
    )
    // バッジは1語「見送り」。**同時にこれが見送りのトグルを兼ねる**。
    // **これも「JSX に直書きしていない」ことしか見ていない**（上の註のとおり、
    // 幅の一致は jsdom では測れないし、切り／入りは同じ定数から出るので
    // 取り違えも捕まえない）——状態を分けているのは下の面の方
    const badge = screen.getByRole('button', { name: '課題1の見送り' })
    expect(badge.textContent).toBe(ISSUE_EVENT_LABELS.deferred)
    // **薄くならない。** 見送りは「そこで下した判断の表明」であって
    // 「もう見なくてよい枝」ではない（俯瞰モックの規則。薄いのは配下だけ）
    expect(badge.className).toContain(badgeClass(badgeVariantOf('deferred', false)))

    const reason = screen.getByRole('textbox', { name: '課題1 の見送りの理由' })
    expect((reason as HTMLTextAreaElement).value).toBe('本開発の設計と一緒に決める')
    fireEvent.change(reason, { target: { value: '通知は本開発で扱う' } })
    const next: IssueTreeSchemaVersion3 = onChange.mock.calls[0][0]
    expect(next.issues[0].events).toEqual([
      { kind: 'deferred', note: '通知は本開発で扱う', date: '2026-08-30' },
    ])
  })

  /**
   * **トグルを切ると、理由の欄ごと消える。** 「一度見送って戻した」履歴も、
   * そのとき書いた理由も残らない——`toggleIssueEvent` が最新の旗を消すので
   * あって、打ち消しのイベントを追記するのではない（D2 の反転節）。
   * ここは**代償の側を画面で固定するテスト**である
   */
  it('見送りを切ると理由の欄が消え、書いてあった理由も一緒に消える', () => {
    const base = file()
    const onChange = vi.fn()
    render(
      <Harness
        initial={{
          ...base,
          issues: base.issues.map((n, i) =>
            i === 0
              ? {
                  ...n,
                  events: [{ kind: 'deferred', note: '本開発の設計と一緒に決める', date: '2026-08-30' }],
                }
              : n,
          ),
        }}
        onChange={onChange}
      />,
    )
    const toggle = screen.getByRole('button', { name: '課題1の見送り' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)

    const next: IssueTreeSchemaVersion3 = onChange.mock.calls[0][0]
    expect(next.issues[0].events).toEqual([])
    // 理由の欄は消え、トグルは切りに戻る（面もバッジから小ボタンへ戻る）
    expect(screen.queryByRole('textbox', { name: '課題1 の見送りの理由' })).toBeNull()
    const back = screen.getByRole('button', { name: '課題1の見送り' })
    expect(back.getAttribute('aria-pressed')).toBe('false')
    expect(back.className).not.toContain(badgeClass(badgeVariantOf('deferred', false)))
    expect(back.textContent).toBe(ISSUE_EVENT_LABELS.deferred)
    // **フォーカスは課題の文言へ戻る**（消えた欄には返せず、ボタンの上では
    // 木の操作言語が効かない）
    expect(document.activeElement).toBe(issueCell(1))
  })
})

/**
 * 未決2件（同じ課題）と「仮説なし」1件が同時に立つ形。**同じ種類が2件ある**ので、
 * チップを押し続けたときの巡回（末尾なら先頭へ）が見える
 */
const openFile = (): IssueTreeSchemaVersion3 => ({
  schemaVersion: 4,
  type: 'issueTree',
  title: 'テスト',
  issues: [
    { id: I(1), parentId: null, text: '根', events: [] },
    { id: I(2), parentId: I(1), text: '仮説を持つ葉', events: [] },
    { id: I(3), parentId: I(1), text: '仮説の無い葉', events: [] },
  ],
  hypotheses: [
    { id: H(1), issueId: I(2), title: '仮説A', detail: '', value: '', asks: [], feedbacks: [], events: [] },
    { id: H(2), issueId: I(2), title: '仮説B', detail: '', value: '', asks: [], feedbacks: [], events: [] },
  ],
})

/**
 * 4種の問いが**同時に**立つ形。チップの面（実線／破線）は種類ごとに分かれるので、
 * 保留だけを別のファイルで見ると「どちらも警告色の枠」までしか言えず、
 * `kind === 'hold'` の分岐を壊しても緑になる。同じ帯に4つ並べて突き合わせる
 */
const allKindsFile = (): IssueTreeSchemaVersion3 => ({
  schemaVersion: 4,
  type: 'issueTree',
  title: 'テスト',
  issues: [
    { id: I(1), parentId: null, text: '根', events: [] },
    { id: I(2), parentId: I(1), text: '仮説を持つ葉', events: [] },
    { id: I(3), parentId: I(1), text: '仮説の無い葉', events: [] },
  ],
  hypotheses: [
    // 未決＝イベントが0件
    { id: H(1), issueId: I(2), title: '仮説A', detail: '', value: '', asks: [], feedbacks: [], events: [] },
    // 保留＝最新が onHold
    {
      id: H(2),
      issueId: I(2),
      title: '仮説B',
      detail: '',
      value: '',
      asks: [],
      feedbacks: [],
      events: [{ kind: 'onHold', note: '「楽」の定義が決まらず判断できない', date: '2026-08-30' }],
    },
    // FB待ち＝判断は付いているが、聞きたいことに FB が1件も無い（判断は「未決」ではない）
    {
      id: H(3),
      issueId: I(2),
      title: '仮説C',
      detail: '',
      value: '',
      asks: [{ id: 'ask_AAAAAAAAAA', text: 'レビューで出た指摘は解消したか' }],
      feedbacks: [],
      events: [{ kind: 'supported', note: '実測で確認', date: '2026-08-30' }],
    },
  ],
})

/**
 * FB待ちが**同じ仮説に2件**立つ形（m5 Task 8）。行き先が問いごとになったので、
 * 「2回押すと2件目の問いへ行く」を見るには同じ仮説の中に2件要る
 *——別々の仮説に散らすと、仮説単位の行き先へ戻した実装でも巡回して見える。
 *
 * 判断を付けてあるのは、未決を立てないため（未決が立つと帯に別のチップが増える）。
 * 根は葉ではないので「仮説なし」も立たず、**帯に出るのは FB待ち だけ**になる
 */
const askFile = (): IssueTreeSchemaVersion3 => ({
  schemaVersion: 4,
  type: 'issueTree',
  title: 'テスト',
  issues: [
    { id: I(1), parentId: null, text: '根', events: [] },
    { id: I(2), parentId: I(1), text: '仮説を持つ葉', events: [] },
  ],
  hypotheses: [
    {
      id: H(1),
      issueId: I(2),
      title: '仮説A',
      detail: '',
      value: '',
      asks: [
        { id: 'ask_AAAAAAAAAA', text: '離脱しないか' },
        { id: 'ask_BBBBBBBBBB', text: '制限に当たらないか' },
      ],
      feedbacks: [],
      events: [{ kind: 'supported', note: '実測で確認', date: '2026-08-30' }],
    },
  ],
})

/** 問いの文言の欄。**畳まれた行にも畳まれた課題にも無い**（展開パネルの中だけ） */
const askCell = (h: number, a: number): HTMLTextAreaElement =>
  screen.getByRole('textbox', { name: `仮説${h} の聞きたいこと${a}の文言` }) as HTMLTextAreaElement

/** 帯のチップ（「次の◯◯へ」）。0件の種類は描かれないので queryBy で引く */
const chip = (kind: keyof typeof QUESTION_LABELS): HTMLButtonElement | null =>
  screen.queryByRole('button', { name: `次の${QUESTION_LABELS[kind]}へ` }) as HTMLButtonElement | null

describe('IssueTreeEditor（帯）', () => {
  it('要対応の合計と、内訳のチップを出す（数は tallyQuestions から）', () => {
    // **文字列を打ち直さない**——アプリの画面と Skill の報告が同じ言葉を出す。
    // `tallyLine` の1行はもう帯に出ないが（内訳がチップになった）、
    // **合計の文言と内訳の文言は `tallyLine` と同じ語**である
    const data = openFile()
    const t = tallyQuestions(poseQuestions(data))
    expect(t).toMatchObject({ hypothesis: 1, result: 2, hold: 0, feedback: 0, total: 3 })
    render(<Harness initial={data} />)
    // **語を打ち直さない。** 帯と `tallyLine`（Skill の報告）は同じ語
    //（`TALLY_TOTAL_LABEL` / `QUESTION_LABELS`）を出すが、接頭辞は M25 決定8 で
    // **意図的に分岐した**——画面は CircleAlert のアイコン、端末は `⚠`
    //（SVG は端末に出せない）。ここでは両側をそれぞれ縛る
    const [head] = tallyLine(t).split('（')
    expect(head).toBe(`⚠ ${TALLY_TOTAL_LABEL} ${t.total}`) // 端末側の字面（据え置き）
    expect(screen.getByText(`${TALLY_TOTAL_LABEL} ${t.total}`)).toBeTruthy() // 画面側は語と数だけ
    expect(chip('hypothesis')?.textContent).toBe(`${QUESTION_LABELS.hypothesis} ${t.hypothesis}`)
    expect(chip('result')?.textContent).toBe(`${QUESTION_LABELS.result} ${t.result}`)
  })

  it('0 件の種類のチップは出ない', () => {
    render(<Harness initial={openFile()} />)
    // 立っている2種は出る
    expect(chip('hypothesis')).not.toBeNull()
    expect(chip('result')).not.toBeNull()
    // 0 件の2種は**描かない**（`tallyLine` が0の内訳を出さないのと同じ規則）。
    // 文言そのものが帯に現れないことも見る（数だけ 0 で出ていないこと）
    expect(chip('hold')).toBeNull()
    expect(chip('feedback')).toBeNull()
    expect(screen.queryByText(`${QUESTION_LABELS.hold} 0`)).toBeNull()
    expect(screen.queryByText(`${QUESTION_LABELS.feedback} 0`)).toBeNull()
  })

  /**
   * チップの面は**キャンバスのバッジの語彙そのまま**（`toMissingTally`）——保留は
   * 実線の枠（`hold`）、FB待ちは着信の青（`pending`。用意した問いに答えが返って
   * いない＝欠落ではなく受信箱）、仮説なし・未決は「まだ見ていない」の破線
   *（`open`）。帯とキャンバスが同じ言葉を使う
   */
  it('保留とFB待ちは実線、仮説なし・未決は破線のバッジ（FB待ちだけ色も違う）', () => {
    const data = allKindsFile()
    const t = tallyQuestions(poseQuestions(data))
    expect(t).toMatchObject({ hypothesis: 1, result: 1, hold: 1, feedback: 1, total: 4 })
    render(<Harness initial={data} />)
    // **クラス名を打ち直さない**——`badgeClass` の戻り値と照合する。チップは
    // 共通部品 `MissingTally` が土台のクラスを前に足すので、一致ではなく包含で見る
    const hold = badgeClass('hold')
    const pending = badgeClass('pending')
    const open = badgeClass('open')
    expect(chip('hold')?.className).toContain(hold)
    expect(chip('feedback')?.className).toContain(pending)
    for (const kind of ['hypothesis', 'result'] as const) {
      expect(chip(kind)?.className, kind).toContain(open)
    }
    // 3つの面は互いに異なる（同じクラスへ潰れていないこと）
    expect(hold).not.toBe(pending)
    expect(hold).not.toBe(open)
    expect(pending).not.toBe(open)
  })

  it('要対応の内訳に「FB待ち」が出る（問いの数で数える）', () => {
    // **仮説単位の真偽ではないことをここで見る**——聞きたいことが2件あれば
    // チップの数は2になる（`derive.test.ts` の同じ主張の画面側）
    const base = file()
    render(
      <Harness
        initial={{
          ...base,
          hypotheses: [
            {
              ...base.hypotheses[0],
              asks: [
                { id: 'ask_AAAAAAAAAA', text: '離脱しないか' },
                { id: 'ask_BBBBBBBBBB', text: '制限に当たらないか' },
              ],
              feedbacks: [],
              events: [{ kind: 'supported', note: '', date: '2026-08-30' }],
            },
          ],
        }}
      />,
    )
    expect(screen.getByRole('button', { name: '次のFB待ちへ' }).textContent).toBe('FB待ち 2')
  })

  it('帯のチップを押すと、その種類の次の要対応へフォーカスが移る（末尾なら先頭へ）', () => {
    render(<Harness initial={openFile()} />)
    // **1回目は列の先頭**（まだどこにも触っていない）。仮説の行は押されると開くので、
    // 行き先は展開後の文言の欄になる
    fireEvent.click(chip('result') as HTMLButtonElement)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '仮説1' }))
    // 2回目は**次の1件**（起点は最後にフォーカスがあったセル）
    fireEvent.click(chip('result') as HTMLButtonElement)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '仮説2' }))
    // 3回目は末尾の次＝先頭へ戻る（一巡して「見落としが無い」と分かる）
    fireEvent.click(chip('result') as HTMLButtonElement)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '仮説1' }))
    // 種類が違えば別の列。「仮説なし」は**課題の欄**へ飛ぶ
    fireEvent.click(chip('hypothesis') as HTMLButtonElement)
    expect(document.activeElement).toBe(issueCell(3))
  })

  /**
   * **飛び先の課題を開いてから当てる**（m5 Task 8）。問いの欄は展開パネルの中に
   * しか無いので、開かないまま予約しても `data-cell` が DOM に無く、
   * **フォーカスは当たらない**（黙って外れる——落ちるテストが無い種類のずれ）。
   *
   * **開いたことと当たったことの両方を見る。** 開くだけの実装（予約が外れる）でも、
   * 当てるだけの実装（そもそも要素が無い）でも落ちる
   */
  it('閉じている課題の中の問いへ飛ぶと、その課題が開いて問いの欄にフォーカスが当たる', () => {
    render(<Harness initial={askFile()} />)
    // 最初はどの課題も畳まれている＝パネルの節見出しは画面に無い
    expect(screen.queryByText(SECTION_LABELS.value)).toBeNull()
    expect(chip('feedback')?.textContent).toBe(`${QUESTION_LABELS.feedback} 2`)

    fireEvent.click(chip('feedback') as HTMLButtonElement)
    // 開いた（パネルの節見出しが出る）
    expect(screen.getByText(SECTION_LABELS.value)).toBeTruthy()
    // かつ、1件目の問いの欄に当たっている
    expect(document.activeElement).toBe(askCell(1, 1))

    // **2回目は2件目の問いへ。** 同じ仮説の中なので、行き先を仮説単位に
    // 潰した実装（または `askIndex` を見ない同一性）はここで1件目に留まる
    fireEvent.click(chip('feedback') as HTMLButtonElement)
    expect(document.activeElement).toBe(askCell(1, 2))

    // 3回目は末尾の次＝先頭へ戻る（押し続ければ一巡する＝見落としが無い）
    fireEvent.click(chip('feedback') as HTMLButtonElement)
    expect(document.activeElement).toBe(askCell(1, 1))
  })

  it('指摘の一覧はエディタが出さない（額縁の IssueBanner が出す）', () => {
    render(
      <IssueTreeEditor
        data={file()}
        onChange={() => {}}
        issues={[{ rule: 'multiple-root', message: 'ルートが2件あります', locations: [] }]}
        modalOpen={false}
      />,
    )
    expect(screen.queryByText('ルートが2件あります')).toBeNull()
  })

  it('操作ヒントを4件出す（表記が互いに重ならない。m5 で課題だけに絞った）', () => {
    render(<Harness initial={file()} />)
    const hintSpan = (text: string) =>
      screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === text)
    expect(hintSpan('Enter: 兄弟を追加')).toBeTruthy()
    expect(hintSpan('Tab: 子課題を追加')).toBeTruthy()
    // $mod / $alt は KeyHints が解決する（jsdom は mac 判定にならない）。
    // **`Ctrl+Enter: 仮説／判断を追加` の行は無い**——仮説の追加はボタンへ移った
    expect(screen.queryByText((_, element) => element?.tagName === 'SPAN' && element.textContent === 'Ctrl+Enter: 仮説／判断を追加')).toBeNull()
    expect(hintSpan('←→: 親子移動')).toBeTruthy()
    expect(hintSpan('Alt+↑↓: 並び替え')).toBeTruthy()
  })

  it('課題0件でも「課題を追加」で根を作れる（マウスだけの動線）', () => {
    render(
      <Harness
        initial={{ schemaVersion: 4, type: 'issueTree', title: 'テスト', issues: [], hypotheses: [] }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '課題を追加' }))
    expect(document.activeElement).toBe(issueCell(1))
  })

  it('「仮説を追加」は最後に触っていた課題に足す', () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
    // 末尾の課題（既定の行き先）ではなく、触った課題に足されることを見る。
    // **`act` で包む**——素の `focus()` は React の更新を流さないので、
    // 「どの課題に触っていたか」の state が反映されないまま次の操作へ進む
    act(() => {
      issueCell(1).focus()
    })
    fireEvent.click(screen.getByRole('button', { name: '仮説を追加' }))
    const next: IssueTreeSchemaVersion3 = onChange.mock.calls[0][0]
    expect(next.hypotheses).toHaveLength(2)
    expect(next.hypotheses.some((h) => h.issueId === I(1))).toBe(true)
  })

  it('仮説の行に触っていたときは、その仮説がぶら下がる課題に足す', () => {
    // **「最後に触ったセル」は1つしか持たない**（仮説の行に居るときは仮説を指す）。
    // 「仮説を追加」の行き先はそこから導く——別に「最後の課題」を持つと、
    // 片方だけが古くなって別の課題へ足しに行く
    const onChange = vi.fn()
    render(<Harness initial={openFile()} onChange={onChange} />)
    // 仮説A・B がぶら下がるのは I(2)。**末尾の課題は I(3)** なので、既定の
    // 行き先（末尾）に落ちていたら気づける
    // 行を開くと、展開後の文言の欄までフォーカスが来る（`expandRowFor` の予約）
    openHypothesis(1)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '仮説1' }))
    fireEvent.click(screen.getByRole('button', { name: '仮説を追加' }))
    const next: IssueTreeSchemaVersion3 = onChange.mock.calls.at(-1)?.[0]
    expect(next.hypotheses).toHaveLength(3)
    expect(next.hypotheses.filter((h) => h.issueId === I(2))).toHaveLength(3)
  })
})

/** 見送りを掲げた課題が2件（うち1件は入れ子）あるファイル */
const deferredFile = (): IssueTreeSchemaVersion3 => ({
  schemaVersion: 4,
  type: 'issueTree',
  title: '見送りの帯',
  issues: [
    { id: I(1), parentId: null, text: '決済', events: [] },
    {
      id: I(2),
      parentId: I(1),
      text: '需要',
      events: [{ kind: 'deferred', note: '今回は追わない', date: '2026-08-30' }],
    },
    {
      id: I(3),
      parentId: I(1),
      text: '性能',
      events: [{ kind: 'deferred', note: '機材が無い', date: '2026-08-30' }],
    },
  ],
  hypotheses: [],
})

describe('IssueTreeEditor（見送りの別枠チップ。M25 D17）', () => {
  it('見送りを掲げた課題の数を出し、押すとその課題の欄へ視点が飛んで巡回する', () => {
    render(<Harness initial={deferredFile()} />)
    const chip = screen.getByRole('button', { name: '次の見送りへ' })
    expect(chip.textContent).toBe(issueEventLine(2, 'deferred'))
    expect(chip.title).toBe(ISSUE_EVENT_NOTES.deferred)
    // 行き先の検証は「帯のチップを押すと、その種類の次の要対応へフォーカスが
    // 移る」と同じ書き方（`document.activeElement` と `issueCell` を突き合わせる）
    // に合わせる。1回目は issues[1]（需要＝課題2）、もう1回押すと issues[2]
    // （性能＝課題3）、さらに押すと issues[1]（課題2）へ戻る
    fireEvent.click(chip)
    expect(document.activeElement).toBe(issueCell(2))
    fireEvent.click(chip)
    expect(document.activeElement).toBe(issueCell(3))
    fireEvent.click(chip)
    expect(document.activeElement).toBe(issueCell(2))
  })

  it('見送りを掲げた課題が無ければチップは出ない', () => {
    render(<Harness initial={openFile()} />)
    expect(screen.queryByRole('button', { name: '次の見送りへ' })).toBeNull()
  })
})

/**
 * v3 で課題の旗が2種になった（見送り／解決）。**トグルは共通の部品を種別で
 * 回すだけ**——ボタンの面もアイコンも同じで、違うのはアクセシブル名と描く
 * 文言だけである（`ISSUE_EVENT_LABELS` から引く）
 */
describe('IssueTreeEditor（解決の旗と帯のチップ）', () => {
  it('解決の旗が立った課題は「解決」と描かれ、押すと外れる（見送りとは別の旗）', () => {
    const base = file()
    const onChange = vi.fn()
    render(
      <Harness
        initial={{
          ...base,
          issues: base.issues.map((n, i) =>
            i === 0
              ? { ...n, events: [{ kind: 'resolved' as const, note: '通知の集約で解ける', date: '2026-08-30' }] }
              : n,
          ),
        }}
        onChange={onChange}
      />,
    )
    const toggle = screen.getByRole('button', { name: '課題1の解決' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(toggle.textContent).toBe('解決')
    fireEvent.click(toggle)
    // **旗が外れる（差し替えではない）。** 解決を新規に付ける動線は m4 では
    // 足していない——立っている旗を押すと、その旗だけが消える
    expect(onChange.mock.calls[0][0].issues[0].events).toEqual([])
  })

  /**
   * **`resolved` を新規に立てる動線の番人**（m4 は「m5 の担当」と残し、m5 の計画は
   * 「m4 で実装済み」と誤認して着手しなかった穴。依頼者の指示で m5 の中で作った）。
   *
   * **見るのは保存された JSON の `kind` である。** バッジの文字だけを見る形にすると、
   * **どちらのボタンも `deferred` を付ける実装**（＝退行そのもの）でも
   * 「解決」と描かれてしまい、緑を通る
   */
  it('旗の無い箱には見送りと解決が同じ形で並び、「解決」を押すと resolved が立つ', () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)

    // 課題1にはまだ旗が無い。**2つ並ぶ**（並びは `FLAG_KINDS` の順＝見送り→解決）
    const defer = screen.getByRole('button', { name: `課題1の${ISSUE_EVENT_LABELS.deferred}` })
    const resolve = screen.getByRole('button', { name: `課題1の${ISSUE_EVENT_LABELS.resolved}` })
    expect(defer.getAttribute('aria-pressed')).toBe('false')
    expect(resolve.getAttribute('aria-pressed')).toBe('false')
    expect(defer.textContent).toBe(ISSUE_EVENT_LABELS.deferred)
    expect(resolve.textContent).toBe(ISSUE_EVENT_LABELS.resolved)
    // **同じ形で並べる**（`FLAG_KINDS` の註。実効は同じで意味だけが逆なので
    // 見た目の系統を分けない）。切りの面はバッジの面ではない
    expect(resolve.className).toBe(defer.className)
    expect(defer.className).toContain(`h-[${BADGE_BOX_HEIGHT}px]`)
    expect(defer.className).not.toContain(badgeClass(badgeVariantOf('deferred', false)))
    // DOM の並びは 見送り → 解決
    expect(defer.compareDocumentPosition(resolve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(resolve)
    // **文字ではなく保存された `kind` を見る**
    expect(onChange.mock.calls[0][0].issues[0].events).toEqual([
      { kind: 'resolved', note: '', date: todayString() },
    ])
    // 立てた直後は**理由の欄**へフォーカスが移る（`toggleIssueEvent` の行き先）
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: `課題1 の${ISSUE_EVENT_LABELS.resolved}の理由` }),
    )

    // **旗が立ったらボタンは1つ**（バッジ兼トグル）。もう一方は消える
    expect(
      screen.queryByRole('button', { name: `課題1の${ISSUE_EVENT_LABELS.deferred}` }),
    ).toBeNull()
    const flagged = screen.getByRole('button', { name: `課題1の${ISSUE_EVENT_LABELS.resolved}` })
    expect(flagged.getAttribute('aria-pressed')).toBe('true')
    // **立った旗のバッジは種別で分かれる**（`FLAG_BADGE_GROUPS`）。解決は判断の緑。
    // 詳しい退行防止は下の「解決の旗のバッジ…」の2本が持つ
    expect(flagged.className).toContain(
      badgeClass(badgeVariantOf(FLAG_BADGE_GROUPS.resolved, false)),
    )
    // **押すと外れる（差し替えではない）。** 見送りへ直に変える動線は作らない
    fireEvent.click(flagged)
    expect(onChange.mock.calls.at(-1)![0].issues[0].events).toEqual([])
  })

  /**
   * 上と対の退行防止。**2つのボタンの写像が入れ替わっていない**ことを見る
   *——`FLAG_KINDS` を回す実装で `kind` の代わりに定数を渡してしまうと、
   * 片側だけのテストでは気づけない
   */
  it('旗の無い箱で「見送り」を押すと deferred が立つ（解決と取り違えていない）', () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: `課題1の${ISSUE_EVENT_LABELS.deferred}` }))
    expect(onChange.mock.calls[0][0].issues[0].events).toEqual([
      { kind: 'deferred', note: '', date: todayString() },
    ])
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: `課題1 の${ISSUE_EVENT_LABELS.deferred}の理由` }),
    )
    expect(
      screen.queryByRole('button', { name: `課題1の${ISSUE_EVENT_LABELS.resolved}` }),
    ).toBeNull()
  })

  it('帯には見送りと解決が別々のチップとして並ぶ（両方同時に立ち、0件のほうは描かれない）', () => {
    const base = file()
    // 課題1に見送り・課題2に解決を立てる。**`FLAG_KINDS` を回さず「0件でない
    // 先頭の種別だけ描く」実装でも、片方だけを見るテストは両方とも緑を通る**
    //——だからこの1本で「2つが同時に並ぶ」経路を踏む
    const bothFlagged: IssueTreeSchemaVersion3 = {
      ...base,
      issues: base.issues.map((n, i) => {
        if (i === 0) return { ...n, events: [{ kind: 'deferred' as const, note: '', date: '2026-08-30' }] }
        if (i === 1) return { ...n, events: [{ kind: 'resolved' as const, note: '', date: '2026-08-30' }] }
        return n
      }),
    }
    render(<Harness initial={bothFlagged} />)
    expect(screen.getByRole('button', { name: '次の見送りへ' }).textContent).toBe(
      issueEventLine(1, 'deferred'),
    )
    expect(screen.getByRole('button', { name: '次の解決へ' }).textContent).toBe(
      issueEventLine(1, 'resolved'),
    )
    cleanup()

    // **0件のほうは描かれないことも失わない**（解決だけが立つケース）
    const onlyResolved: IssueTreeSchemaVersion3 = {
      ...base,
      issues: base.issues.map((n, i) =>
        i === 0 ? { ...n, events: [{ kind: 'resolved' as const, note: '', date: '2026-08-30' }] } : n,
      ),
    }
    render(<Harness initial={onlyResolved} />)
    expect(screen.getByRole('button', { name: '次の解決へ' }).textContent).toBe('解決 1')
    expect(screen.queryByRole('button', { name: '次の見送りへ' })).toBeNull()
  })
})

/**
 * **旗の見え方は種別で分かれる**（issue-tree m5 の実機確認。設計ノート D8）。
 *
 * 実機で見つかった欠陥は、`IssueTreeEditor` が立った旗のバッジを
 * `badgeVariantOf('deferred', …)` と**決め打ち**していたこと——`flagKind` が
 * `resolved` でも見送りのグレーで描かれていた。写像は `FLAG_BADGE_GROUPS` が持つ。
 *
 * **`FLAG_BADGE_GROUPS` 経由の期待値を書かない。** それでは写像を書き換えた
 * 瞬間に期待値も一緒に動き、何も固定しない（トートロジー）。**ここだけは
 * 変異が効くように `'yes'` / `'deferred'` を字面で置く**——`badgeClass` の
 * 戻り値と照合するので、クラス名そのものは打ち直していない
 */
describe('IssueTreeEditor（旗の面と幅。m5 の実機確認）', () => {
  /** 課題1件だけの木。旗の有無と種別だけを変える */
  const oneIssue = (events: IssueTreeSchemaVersion3['issues'][number]['events']): IssueTreeSchemaVersion3 => ({
    schemaVersion: 4,
    type: 'issueTree',
    title: 'テスト',
    issues: [{ id: I(1), parentId: null, text: '根', events }],
    hypotheses: [],
  })
  const flagged = (kind: 'deferred' | 'resolved'): IssueTreeSchemaVersion3['issues'][number]['events'] => [
    { kind, note: '理由', date: '2026-08-30' },
  ]
  const boxOf = (n: number): HTMLElement => {
    const box = issueCell(n).closest('[class*="pointer-events-auto"]')
    if (box === null) throw new Error(`課題${n}の箱が無い`)
    return box as HTMLElement
  }

  it('解決の旗のバッジは判断の緑（yes）で描かれる', () => {
    render(<Harness initial={oneIssue(flagged('resolved'))} />)
    const badge = screen.getByRole('button', { name: `課題1の${ISSUE_EVENT_LABELS.resolved}` })
    expect(badge.className).toContain(badgeClass('yes'))
    // **見送りの面ではない。** 決め打ちに戻すとここが赤くなる
    expect(badge.className).not.toContain(badgeClass('deferred'))
  })

  it('見送りの旗のバッジは従来どおり見送りの面（deferred）のまま', () => {
    render(<Harness initial={oneIssue(flagged('deferred'))} />)
    const badge = screen.getByRole('button', { name: `課題1の${ISSUE_EVENT_LABELS.deferred}` })
    expect(badge.className).toContain(badgeClass('deferred'))
    // **緑に振り替わっていない**（写像を両方 `yes` にする変異を捕まえる）
    expect(badge.className).not.toContain(badgeClass('yes'))
  })

  /**
   * **抑制された配下では種別によらず `faint`**（`badgeVariantOf` の第2引数）。
   * `FLAG_BADGE_GROUPS[flagKind]` を `badgeClass` へ直に渡す実装にすると、
   * 凍結された枝の中で解決の箱だけが緑のバッジで灯る
   */
  it('祖先由来の抑制が立つと、見送りも解決もバッジは faint に落ちる', () => {
    const nested: IssueTreeSchemaVersion3 = {
      schemaVersion: 4,
      type: 'issueTree',
      title: 'テスト',
      issues: [
        {
          id: I(1),
          parentId: null,
          text: 'A 見送り（祖先）',
          events: [{ kind: 'deferred', note: '今回は追わない', date: '2026-08-30' }],
        },
        {
          id: I(2),
          parentId: I(1),
          text: 'B 配下だが自分は解決',
          events: [{ kind: 'resolved', note: '答えは出た', date: '2026-08-30' }],
        },
        {
          id: I(3),
          parentId: I(1),
          text: 'C 配下だが自分は見送り',
          events: [{ kind: 'deferred', note: '本開発で扱う', date: '2026-08-30' }],
        },
      ],
      hypotheses: [],
    }
    render(<Harness initial={nested} />)
    const faint = badgeClass('faint')
    expect(
      screen.getByRole('button', { name: `課題2の${ISSUE_EVENT_LABELS.resolved}` }).className,
    ).toContain(faint)
    expect(
      screen.getByRole('button', { name: `課題3の${ISSUE_EVENT_LABELS.deferred}` }).className,
    ).toContain(faint)
    // 掲げている当人（課題1＝根）は落ちない
    expect(
      screen.getByRole('button', { name: `課題1の${ISSUE_EVENT_LABELS.deferred}` }).className,
    ).toContain(badgeClass('deferred'))
  })

  /**
   * **箱の面**。依頼者の理由は「一目で『解決方針が決まった課題』＝これ以上
   * 考えなくてよい とわかるから」（設計ノート D8 の m5 追記）。
   *
   * **`split(' ')` の完全一致で見る**——`bg-judge-yes-face` は文字列として
   * `bg-judge-yes` を含むので、`toContain` では濃い面と淡い面を弁別できない
   *（既存の `bg-surface` / `bg-surface-muted` と同じ穴）
   */
  it('解決を掲げた箱は淡い緑（judge-yes-face）、見送りの箱は surface-muted のまま', () => {
    render(<Harness initial={oneIssue(flagged('resolved'))} />)
    expect(boxOf(1).className.split(' ')).toContain('bg-judge-yes-face')
    expect(boxOf(1).className.split(' ')).not.toContain('bg-surface-muted')
    // 掲げた当人なので文字は濃いまま（抑制ではない）
    expect(boxOf(1).className.split(' ')).toContain('text-ink')
    cleanup()

    render(<Harness initial={oneIssue(flagged('deferred'))} />)
    expect(boxOf(1).className.split(' ')).toContain('bg-surface-muted')
    expect(boxOf(1).className.split(' ')).not.toContain('bg-judge-yes-face')
    cleanup()

    // 旗が無ければどちらでもない
    render(<Harness initial={oneIssue([])} />)
    expect(boxOf(1).className.split(' ')).toContain('bg-surface')
    expect(boxOf(1).className.split(' ')).not.toContain('bg-judge-yes-face')
  })

  /**
   * **祖先由来の抑制が勝つ優先順位は m5 でも動いていない**（`IssueBox.tsx` の
   * `face` の分岐で `suppressed` が旗より上にある）。ここを逆にすると、
   * 凍結された枝の途中に淡い緑の箱が1つだけ灯り、「その1件はまだ考える」と
   * 読めてしまう
   */
  it('祖先が旗を掲げていれば、自分が解決でも surface-muted ＋ ink-faint に落ちる', () => {
    const nested: IssueTreeSchemaVersion3 = {
      schemaVersion: 4,
      type: 'issueTree',
      title: 'テスト',
      issues: [
        {
          id: I(1),
          parentId: null,
          text: 'A 解決（祖先）',
          events: [{ kind: 'resolved', note: '答えは出た', date: '2026-08-30' }],
        },
        {
          id: I(2),
          parentId: I(1),
          text: 'B 配下だが自分も解決',
          events: [{ kind: 'resolved', note: '同じく', date: '2026-08-30' }],
        },
        { id: I(3), parentId: I(1), text: 'C ただの配下', events: [] },
      ],
      hypotheses: [],
    }
    render(<Harness initial={nested} />)
    // A：掲げた当人は淡い緑、文字は濃い
    expect(boxOf(1).className.split(' ')).toContain('bg-judge-yes-face')
    expect(boxOf(1).className.split(' ')).not.toContain('text-ink-faint')
    // B：自分も解決だが、祖先由来の抑制が勝つ
    expect(boxOf(2).className.split(' ')).toContain('bg-surface-muted')
    expect(boxOf(2).className.split(' ')).not.toContain('bg-judge-yes-face')
    expect(boxOf(2).className.split(' ')).toContain('text-ink-faint')
    // C：ただの配下も同じ（枝全体がひとかたまりのグレー）
    expect(boxOf(3).className.split(' ')).toContain('bg-surface-muted')
    expect(boxOf(3).className.split(' ')).toContain('text-ink-faint')
  })

  /**
   * **同じ語が場所によって色を変えないこと。** 「解決」は帯の別枠チップにも
   * 課題の箱のバッジにも出る。写像（`FLAG_BADGE_GROUPS`）は1つなので、
   * **どちらか片方だけを決め打ちに戻すとここが赤くなる。**
   *
   * **どの面かをこのテストが名指ししないのが要**——一方の DOM から取り出した面が
   * もう一方にも現れることだけを見る。「解決＝緑」を両側に書くと、写像を
   * 書き換えたとき期待値も一緒に動いて何も固定しない（上の2本が字面で
   * `'yes'` / `'deferred'` を押さえているので、値の側の番人は別にある）。
   *
   * **variant の一覧は `Record<BadgeVariant, true>` の鍵から作る**——手書きの
   * 配列にすると variant が増えたとき黙って古びる（`find` が外れて
   * `toBeDefined` で落ちるので事故にはならないが、原因が分かりにくい）
   */
  it('帯の別枠チップと箱のバッジは、同じ種別について同じ面を出す', () => {
    const ALL_VARIANTS = Object.keys({
      open: true,
      hold: true,
      invalid: true,
      pending: true,
      yes: true,
      no: true,
      deferred: true,
      faint: true,
    } satisfies Record<BadgeVariant, true>) as BadgeVariant[]

    // **旗を立てる2件は兄弟にする。** `file()` の木は縦一列（1→2→3）なので、
    // 課題1に見送りを立てると課題2は祖先由来で抑制され、バッジが faint に
    // 落ちて「帯と同じ面か」を比べる意味が消える（実際に一度そうなった）。
    // 抑制は祖先由来だけなので、兄弟どうしなら互いに影響しない
    const siblings: IssueTreeSchemaVersion3 = {
      schemaVersion: 4,
      type: 'issueTree',
      title: 'テスト',
      issues: [
        { id: I(1), parentId: null, text: '根（旗なし）', events: [] },
        {
          id: I(2),
          parentId: I(1),
          text: '兄（見送り）',
          events: [{ kind: 'deferred', note: '', date: '2026-08-30' }],
        },
        {
          id: I(3),
          parentId: I(1),
          text: '弟（解決）',
          events: [{ kind: 'resolved', note: '', date: '2026-08-30' }],
        },
      ],
      hypotheses: [],
    }
    render(<Harness initial={siblings} />)
    for (const [kind, issueNo] of [
      ['deferred', 2],
      ['resolved', 3],
    ] as const) {
      const label = ISSUE_EVENT_LABELS[kind]
      const chip = screen.getByRole('button', { name: `次の${label}へ` })
      const badge = screen.getByRole('button', { name: `課題${issueNo}の${label}` })
      const face = ALL_VARIANTS.map(badgeClass).find((f) => chip.className.includes(f))
      expect(face, `帯の「${label}」チップがバッジの面を持たない`).toBeDefined()
      expect(badge.className, `「${label}」の面が帯と箱で違う`).toContain(face)
    }
  })
})

/**
 * 帯の「FB待ち N」と、行に出る「FB待ち」バッジを**一対一にする**（M22）。
 * 集計だけが増えて「どの行のことか」が図から読めない状態を作らない。
 *
 * **`allKindsFile` を使うのは、立つ行と立たない行が同じ画面に並ぶから**である
 *（立つ行だけのファイルだと「常に出す」実装でも緑になる）
 */
describe('IssueTreeEditor（行のFB待ちバッジ）', () => {
  /** 行の中のバッジ（`Badge` は inline-flex。行頭の点は rounded-full の span） */
  const rowBadges = (n: number): HTMLElement[] => {
    const row = screen.getByRole('button', { name: `仮説${n}を開く` })
    return Array.from(row.querySelectorAll('[class*="inline-flex"]')) as HTMLElement[]
  }

  it('FB待ちが立つ仮説の行にだけ「FB待ち」バッジが出る（帯のチップと同じ面）', () => {
    const data = allKindsFile()
    expect(poseQuestions(data).hypothesisQuestions.map((q) => q.feedback)).toEqual([0, 0, 1])
    render(<Harness initial={data} />)

    // 立っていない行は状態のバッジ1つだけ
    expect(rowBadges(1).map((e) => e.textContent)).toEqual([BADGE_LABELS.open])
    expect(rowBadges(2).map((e) => e.textContent)).toEqual([BADGE_LABELS.hold])
    // 立っている行は2つ。**状態のバッジは残る**（置き換えではなく、その左へ並ぶ）
    expect(rowBadges(3).map((e) => e.textContent)).toEqual([
      BADGE_LABELS.yes,
      QUESTION_LABELS.feedback,
    ])

    // 面は帯のチップと同じ語彙（着信の青＝`pending`）。**クラス名を打ち直さない**
    const pending = rowBadges(3)[1]
    expect(pending.className).toBe(badgeClass('pending'))

    /**
     * **FB待ちは状態のバッジの左に置く。** 幅は jsdom では測れない（版組が無い）が、
     * 絶対配置の `left` はレイアウトが返した矩形そのままなので、
     * `placement.badge` を流用して2つを同じ場所へ重ねた実装はここで落ちる
     */
    const leftOf = (el: HTMLElement): number =>
      parseFloat((el.parentElement as HTMLElement).style.left)
    expect(leftOf(pending)).toBeLessThan(leftOf(rowBadges(3)[0]))
  })

  /**
   * **開いた仮説に頭部は無い**（m5 Task 4）——「点・文言・バッジ」の1行は
   * 畳まれているときだけで、開くと `HypothesisPanel` が全部を負う。頭部を
   * 残すと、パネルの「ソリューション仮説」節と同じ文言が画面に2つ出る。
   * **FB待ちのバッジは展開すると問いブロックの中へ移る**（m5 Task 5）
   *——要対応の単位は問い1件なので、開いたら「どの問いが待っているか」を
   * その問いの隣で言う。行の頭部として重ねて出すと、同じ1件が2箇所に出る
   */
  it('展開した仮説の「FB待ち」バッジは、待っている問いのブロックの中に出る', () => {
    render(<Harness initial={allKindsFile()} />)
    const box = openHypothesis(3).closest('[class*="pointer-events-auto"]')
    if (box === null) throw new Error('仮説3の箱が無い')
    const found = Array.from(box.querySelectorAll('[class*="inline-flex"]')).filter(
      (e) => e.textContent === QUESTION_LABELS.feedback,
    )
    // 画面に1つだけ（頭部にも出す実装なら2つになる）
    expect(found).toHaveLength(1)
    const group = screen.getByRole('group', { name: '仮説3 の聞きたいこと1' })
    expect(group.contains(found[0])).toBe(true)
  })
})

describe('IssueTreeEditor（仮説の行の操作）', () => {
  /**
   * **状態を見る場所と変える場所を1つにする**（m5 Task 6。キャンバスの
   * `.badge.pick`）。かつてはバッジの右に「判断を追加」「判断を変える」という
   * **文言のボタン**が別に並んでいた——同じ1件について語る要素が2つあると、
   * どちらが今の状態でどちらが操作なのかを毎回読み分けることになる。
   * いまは**バッジ自身がトリガー**で、押せることは中の山形（`ChevronDown`）が示す
   */
  it('検証結果のバッジを押すと判断の候補が出る', async () => {
    render(<Harness initial={file()} />)
    openHypothesis(1)
    const trigger = screen.getByRole('button', { name: '仮説1に判断を追加' })
    // トリガーはバッジそのもの（語も面もバッジの語彙。判断がまだ無いので「未決」）
    expect(trigger.textContent).toBe(BADGE_LABELS.open)
    expect(trigger.className).toContain(badgeClass(badgeVariantOf('open', false)))
    // 押せることを示す山形が**バッジの中**にある（アイコンは lucide の SVG）
    expect(trigger.querySelector('svg')).not.toBeNull()
    // **文言のボタンは残っていない**——同じことを2箇所で言わない
    expect(screen.queryByText('判断を追加')).toBeNull()
    expect(screen.queryByText('判断を変える')).toBeNull()

    fireEvent.pointerDown(trigger, { button: 0 })
    expect((await screen.findAllByRole('menuitem')).map((e) => e.textContent)).toEqual([
      EVENT_KIND_LABELS.supported,
      EVENT_KIND_LABELS.rejected,
      EVENT_KIND_LABELS.onHold,
      EVENT_KIND_LABELS.deferred,
    ])
  })

  /**
   * **「取り消す」は判断があるときだけ出る**（v4）。未決に「取り消す」は意味を
   * 持たない——押せる項目として並ぶと、何も起きない操作を利用者に見せることになる。
   *
   * **同じテストで有り／無しの両方を見る。** 片方だけだと、条件を落として
   * 「常に出す」に変えた実装も、条件を反転した実装も、どちらかは緑で通る
   */
  it('「取り消す」は判断があるときだけ候補に並ぶ', async () => {
    const judged: IssueTreeSchemaVersion3 = {
      ...file(),
      hypotheses: [
        { ...file().hypotheses[0], events: [{ kind: 'rejected', note: '実機で3秒超', date: '2026-08-13' }] },
      ],
    }
    render(<Harness initial={judged} />)
    openHypothesis(1)
    fireEvent.pointerDown(screen.getByRole('button', { name: '仮説1に判断を追加' }), { button: 0 })
    expect((await screen.findAllByRole('menuitem')).map((e) => e.textContent)).toEqual([
      EVENT_KIND_LABELS.supported,
      EVENT_KIND_LABELS.rejected,
      EVENT_KIND_LABELS.onHold,
      EVENT_KIND_LABELS.deferred,
      CLEAR_JUDGEMENT_LABEL,
    ])
    cleanup()

    // 未決（`file()` の仮説は events が空）では並ばない
    render(<Harness initial={file()} />)
    openHypothesis(1)
    fireEvent.pointerDown(screen.getByRole('button', { name: '仮説1に判断を追加' }), { button: 0 })
    await screen.findAllByRole('menuitem')
    expect(screen.queryByRole('menuitem', { name: CLEAR_JUDGEMENT_LABEL })).toBeNull()
  })

  /**
   * **判断は差し替わる（追記されない）。番人の狙いは列の長さである。**
   *
   * 最新の種別だけを見ると、**追記に戻した実装でも緑になる**——`[...events, e]`
   * でも最後の要素は同じだからである。だから**保存された JSON の `events` を
   * まるごと**見る（長さ1・中身が新しい判断だけ）。
   *
   * あわせて**選んだ瞬間に課題が畳まれないこと**も見る（FB の調子と同じ罠。
   * Radix の項目は `body` へポータルされるが React の合成イベントは箱まで遡る）
   */
  it('判断を選び直すと差し替わり（列は1件のまま）、課題は畳まれない', async () => {
    const onChange = vi.fn()
    const judged: IssueTreeSchemaVersion3 = {
      ...file(),
      hypotheses: [
        { ...file().hypotheses[0], events: [{ kind: 'rejected', note: '実機で3秒超', date: '2026-08-13' }] },
      ],
    }
    render(<Harness initial={judged} onChange={onChange} />)
    openHypothesis(1)
    expect(issueBox(3).style.width).toBe(`${EXPANDED_BOX_WIDTH}px`)
    fireEvent.pointerDown(screen.getByRole('button', { name: '仮説1に判断を追加' }), { button: 0 })
    fireEvent.click(await screen.findByRole('menuitem', { name: EVENT_KIND_LABELS.supported }))

    const next: IssueTreeSchemaVersion3 = onChange.mock.calls[0][0]
    expect(next.hypotheses[0].events).toHaveLength(1)
    expect(next.hypotheses[0].events).toEqual([
      { kind: 'supported', note: '', date: todayString() },
    ])
    expect(onChange.mock.calls[0][1]).toBe(null)
    // **開いたまま**であること
    expect(issueBox(3).style.width).toBe(`${EXPANDED_BOX_WIDTH}px`)
    expect(screen.getByRole('button', { name: '仮説1に判断を追加' }).textContent).toBe(
      EVENT_KIND_LABELS.supported,
    )
  })

  /**
   * **「取り消す」の動線の番人**（v4）。4つを見る:
   *
   * 1. **保存された JSON の `events` が空になること**——バッジの語だけを見ると、
   *    未決の語を描くだけで保存していない実装でも緑になる
   * 2. **バッジが未決へ戻ること**（画面の側）
   * 3. **根拠の欄が消えること**——判断が無いのに欄が残ると、書いた文字が
   *    どこにも保存されない
   * 4. **選んだ瞬間に課題が畳まれないこと**（上と同じ罠）
   */
  it('「取り消す」で判断が消え、バッジが未決に戻り、課題は畳まれない', async () => {
    const onChange = vi.fn()
    const judged: IssueTreeSchemaVersion3 = {
      ...file(),
      hypotheses: [
        { ...file().hypotheses[0], events: [{ kind: 'rejected', note: '実機で3秒超', date: '2026-08-13' }] },
      ],
    }
    render(<Harness initial={judged} onChange={onChange} />)
    openHypothesis(1)
    expect(issueBox(3).style.width).toBe(`${EXPANDED_BOX_WIDTH}px`)
    // 取り消す前は根拠の欄がある
    expect(screen.getByRole('textbox', { name: `仮説1 の${EVENT_KIND_LABELS.rejected}の根拠` })).toBeTruthy()

    fireEvent.pointerDown(screen.getByRole('button', { name: '仮説1に判断を追加' }), { button: 0 })
    fireEvent.click(await screen.findByRole('menuitem', { name: CLEAR_JUDGEMENT_LABEL }))

    const next: IssueTreeSchemaVersion3 = onChange.mock.calls[0][0]
    expect(next.hypotheses[0].events).toEqual([])
    expect(onChange.mock.calls[0][1]).toBe(null)
    // **開いたまま**であること
    expect(issueBox(3).style.width).toBe(`${EXPANDED_BOX_WIDTH}px`)
    // バッジは導出の「未決」へ戻り、根拠の欄は消える
    expect(screen.getByRole('button', { name: '仮説1に判断を追加' }).textContent).toBe(BADGE_LABELS.open)
    expect(screen.queryAllByRole('textbox', { name: /の根拠$/ })).toHaveLength(0)
    // **行き先は仮説の文言**（`clearJudgement` の解説）——根拠の欄はいま消えた
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '仮説1' }))
  })

  it('判断を選ぶとイベントが追記される（マウスの動線）', async () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
    // 判断のトリガーは**展開パネルの中**にある（畳まれた行はバッジ1つ）
    openHypothesis(1)
    fireEvent.pointerDown(screen.getByRole('button', { name: '仮説1に判断を追加' }), { button: 0 })
    fireEvent.click(await screen.findByRole('menuitem', { name: EVENT_KIND_LABELS.rejected }))
    const next: IssueTreeSchemaVersion3 = onChange.mock.calls[0][0]
    // `date` はエディタが `appendJudgement` を今日の日付（既定引数）で呼ぶ
    expect(next.hypotheses[0].events).toEqual([{ kind: 'rejected', note: '', date: todayString() }])
    // 構造の変更は履歴をまとめない（1操作1コミット）
    expect(onChange.mock.calls[0][1]).toBe(null)
    // **追記した根拠の欄までフォーカスが来ること。** Radix の既定（閉じたら
    // トリガーへ戻す）に予約を奪われると、選んだ直後に根拠が打てない
    //（`KindMenu` の `picked` ref ＋ `onCloseAutoFocus` が塞いでいる機械）。
    // **この経路の予約先は条件付きでしか描かれない**——`data-cell` を持つのは
    // 最新イベントの根拠だけなので、外れると静かに壊れる
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: `仮説1 の${EVENT_KIND_LABELS.rejected}の根拠` }),
    )
    // **トリガーはバッジなので、選んだ語がそのまま状態の表示になる**
    //（m5 Task 6。名前は `仮説{N}に判断を追加` のまま——前半は動かさない規約）
    expect(screen.getByRole('button', { name: '仮説1に判断を追加' }).textContent).toBe(
      EVENT_KIND_LABELS.rejected,
    )
  })

  /**
   * **FB の調子（`sentiment`）を選ぶ動線の番人**（m5 の追加作業）。3つを見る:
   *
   * 1. **保存された JSON の値**——アイコンの見た目だけを見ると、
   *    `setFeedbackSentiment` を配線し忘れた実装でも緑になりかねない
   * 2. **他の欄が動かないこと**——`date` は「いつ言われたか」であって
   *    「いつ分類し直したか」ではない
   * 3. **選んだ瞬間に課題が畳まれないこと**——Radix の項目は `body` へ
   *    ポータルされるが**React の合成イベントは箱まで遡る**ので、
   *    `IssueBox` の `onBoxClick` が `[role="menuitem"]` を弾いていないと、
   *    調子を選ぶたびに開いていた課題が閉じる（判断のドロップダウンで
   *    実際に踏んだ欠陥。`[data-panel]` の素通しはポータルには効かない）
   */
  it('FB のアイコンから調子を選ぶと保存され、課題は畳まれない', async () => {
    const onChange = vi.fn()
    const base = file()
    const withFeedback: IssueTreeSchemaVersion3 = {
      ...base,
      hypotheses: [
        {
          ...base.hypotheses[0],
          feedbacks: [
            {
              askId: null,
              text: '待ち表示があるなら離脱しない',
              by: '佐藤さん',
              sentiment: 'note',
              date: '2026-08-01',
            },
          ],
        },
      ],
    }
    render(<Harness initial={withFeedback} onChange={onChange} />)
    openHypothesis(1)
    expect(issueBox(3).style.width).toBe(`${EXPANDED_BOX_WIDTH}px`)

    const trigger = screen.getByRole('button', { name: '仮説1 のFB1の調子' })
    expect(trigger.getAttribute('data-sentiment')).toBe('note')
    fireEvent.pointerDown(trigger, { button: 0 })
    fireEvent.click(await screen.findByRole('menuitem', { name: SENTIMENT_LABELS.concern }))

    const next: IssueTreeSchemaVersion3 = onChange.mock.calls[0][0]
    expect(next.hypotheses[0].feedbacks[0]).toEqual({
      askId: null,
      text: '待ち表示があるなら離脱しない',
      by: '佐藤さん',
      sentiment: 'concern',
      date: '2026-08-01',
    })
    // 1操作1コミット（打鍵ではないのでまとめる相手が無い）
    expect(onChange.mock.calls[0][1]).toBe(null)
    // **開いたまま**であること
    expect(issueBox(3).style.width).toBe(`${EXPANDED_BOX_WIDTH}px`)
    expect(screen.getByRole('button', { name: '仮説1 のFB1の調子' }).getAttribute('data-sentiment')).toBe(
      'concern',
    )
  })

  /**
   * **エディタの配線の番人。** `addFeedback` の `askId` は既定値の無い必須引数で、
   * 押されたブロックが自分の問いを渡す。ここが `null` に固定されていても
   * 「FB が1件増える」テストは緑になるので、**保存された `askId` を見る**
   */
  it('問いブロックの「＋FB」で、その問いに紐づく FB が追記される', () => {
    const onChange = vi.fn()
    render(<Harness initial={allKindsFile()} onChange={onChange} />)
    openHypothesis(3)
    fireEvent.click(screen.getByRole('button', { name: '仮説3 の聞きたいこと1にFBを足す' }))
    const next: IssueTreeSchemaVersion3 = onChange.mock.calls[0][0]
    expect(next.hypotheses[2].feedbacks).toEqual([
      { askId: 'ask_AAAAAAAAAA', text: '', by: '', sentiment: 'note', date: todayString() },
    ])
    // 節の末尾の「＋ FBを追加」はどの問いにも紐づかない FB を作る（対の動線）
    fireEvent.click(screen.getByRole('button', { name: '仮説3 にFBを足す' }))
    const loose: IssueTreeSchemaVersion3 = onChange.mock.calls[1][0]
    expect(loose.hypotheses[2].feedbacks.at(-1)?.askId).toBeNull()
  })

  /**
   * **追加した直後にその欄へ行けること。** 配線は3つに分かれている
   *（`commands.ts` が `focus` を返す → `cell-keys.ts` が `data-cell` に直す →
   * `AskBlock` がその `data-cell` を出す）ので、どれか1つが欠けても
   * 「1件増える」テストは緑のまま——足したのに打てない欄が残る。
   * 判断イベントの根拠には同じ番人がある（上の「判断を選ぶと…」）
   */
  it('「聞きたいことを追加」で足した問いの欄にフォーカスが来る', () => {
    render(<Harness initial={file()} />)
    openHypothesis(1)
    fireEvent.click(screen.getByRole('button', { name: '仮説1 にSHに聞きたいことを足す' }))
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: '仮説1 の聞きたいこと1の文言' }),
    )
  })

  it('「FBを追加」で足した FB の欄にフォーカスが来る', () => {
    render(<Harness initial={file()} />)
    openHypothesis(1)
    fireEvent.click(screen.getByRole('button', { name: '仮説1 にFBを足す' }))
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '仮説1 のFB1' }))
  })

  // **FB の並び替えと挿入位置の指定はキーから消えた（m5）。** `addFeedbackAfter` /
  // `moveFeedback` はいまどの動線からも到達できない（`commands.ts` に残るが
  // 呼び出し元が無い。Task 3 報告参照）。削除（FB・問い・仮説）と追加は
  // すべてマウスのボタンに載っており、下の describe が見ている
})

/**
 * **仮説の追加・削除はマウスにしかない**（m5 Task 7）。キーの操作言語は課題の
 * 追加・削除・移動だけに絞られたので、仮説を足す・消す動線が画面に無いと
 * 「キーでしか到達できない意味」どころか**どこからも到達できない意味**になる
 *（rev 10章の裏返し）。問いの削除も同じ理由でここに置いた——`removeAsk` は
 * m4 からあったが、押せる場所が無く「足せるが消せない」ままだった
 */
describe('IssueTreeEditor（仮説の追加・削除のマウス動線。m5 Task 7）', () => {
  /** 課題3 に仮説3件。**2件だと「常に末尾を消す」実装と区別が付かない** */
  const threeHypotheses = (): IssueTreeSchemaVersion3 => {
    const base = file()
    return {
      ...base,
      hypotheses: [
        { ...base.hypotheses[0], id: H(1), title: '仮説A' },
        { ...base.hypotheses[0], id: H(2), title: '仮説B' },
        { ...base.hypotheses[0], id: H(3), title: '仮説C' },
      ],
    }
  }

  it('パネルのゴミ箱を押すとその仮説だけが消える', () => {
    const onChange = vi.fn()
    render(<Harness initial={threeHypotheses()} onChange={onChange} />)
    // 課題ごと開く（3本ともパネルになる）
    openHypothesis(2)
    fireEvent.click(screen.getByRole('button', { name: '仮説2を削除' }))
    const next: IssueTreeSchemaVersion3 = onChange.mock.calls[0][0]
    // **件数を数えない**——「常に末尾を消す」実装も 3件→2件になる。残った文言で見る
    expect(next.hypotheses.map((h) => h.title)).toEqual(['仮説A', '仮説C'])
    // 構造の変更は履歴をまとめない（1操作1コミット）
    expect(onChange.mock.calls[0][1]).toBe(null)
    // **確認ダイアログを出さない**（Undo は額縁のグローバル層にある）
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  /**
   * **`deleteHypothesis` は前の仮説が無いとき行き先に `null` を返す。** そのまま
   * 予約を外すとフォーカスが宙に浮き（`document.body`）、続けて打ったキーが
   * どこにも入らない——エディタが持ち主の課題へ返す（`ownerIssueFocus`）
   */
  it('仮説を消したあとフォーカスが宙に浮かない（持ち主の課題へ返る）', () => {
    render(<Harness initial={file()} />)
    openHypothesis(1)
    fireEvent.click(screen.getByRole('button', { name: '仮説1を削除' }))
    expect(screen.queryByRole('textbox', { name: '仮説1' })).toBeNull()
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(issueCell(3))
  })

  /**
   * **開いた課題から最後の仮説が消えたら、箱は畳まれる**（m4 まではキーの
   * Backspace で見ていた番人。Task 3 で動線ごと消え、ゴミ箱で守り直す）。
   *
   * m4 までは `expandedKey` が**仮説**の鍵だったので、仮説が消えれば
   * `indexOf` が -1 になって自動的に畳まれていた。課題の鍵に変えた m5 では
   * その自動解除が効かない——鍵は課題を指したまま残るので、**行が1本も無い
   * 780 幅の箱**が残り、列が 460px 右へずれたまま戻せなくなる。
   *
   * 直しは**レイアウト側**にある（「行が0本なら開かない」）ので、
   * **パネルの有無と箱の実寸の両方を見る**——片方だけだと、
   * 「見た目は畳んだが幅は 780 のまま」を見逃す。
   *
   * **選択そのものは残る**（m5 の実機確認後）ので、末尾の「＋ 仮説を追加」が
   * 出たままであることも見る——ここで一緒に消える実装だと、最後の仮説を
   * 消した課題に**もう一度仮説を足す道が箱から無くなる**
   */
  it('選択した課題から最後の仮説が消えると、箱は畳まれる', () => {
    render(<Harness initial={file()} />)

    clickIssueBox(3)
    expect(screen.getByRole('textbox', { name: '仮説1' })).toBeTruthy()
    expect(issueBox(3).style.width).toBe(`${EXPANDED_BOX_WIDTH}px`)

    fireEvent.click(screen.getByRole('button', { name: '仮説1を削除' }))
    expect(screen.queryByRole('textbox', { name: '仮説1' })).toBeNull()

    // **選択は残る**（＝「＋ 仮説を追加」は出たまま）が、開くものが無いので
    // 箱は畳んだ幅に戻る
    expect(issueBox(3).style.width).toBe(`${BOX_WIDTH}px`)
    expect(screen.getByRole('button', { name: '課題3に仮説を追加' })).toBeTruthy()
  })

  /**
   * **「測定と描画」の対の、描画側の番人。**
   *
   * `layout.ts` は `titleFont = open ? fonts.expandedTitle : fonts.title` で
   * 測定器を切り替えており、そちらには番人がある（`layout.test.ts`）。
   * **対のもう半分——`IssueBox` が同じ条件でクラスを切り替えること——は
   * ここが唯一の番人である。**
   *
   * 片側だけ壊れると静かに壊れる: 描画を常に `TITLE_FONT_CLASS`（14px）に
   * すると測定 16px・描画 14px で余白が増えるだけだが、逆に常に
   * `EXPANDED_TITLE_FONT_CLASS`（16px）にすると**測定 14px・描画 16px** となり、
   * 高さ固定＋`overflow-hidden` の textarea から末尾の行が黙って消える。
   * `Badge.dom.test.tsx` の `h-[${BADGE_BOX_HEIGHT}px]` と同じ形で、
   * **定数と実際に当たっているクラスを DOM で突き合わせる。**
   *
   * **両向きを見る**——片側だけだと「常に片方」の実装が緑のまま残る
   */
  it('開いた課題のタイトルだけが展開時の書体になる（測定と対）', () => {
    render(<Harness initial={file()} />)
    // 畳んでいる間は 14px
    expect(issueCell(3).className).toContain(TITLE_FONT_CLASS)
    expect(issueCell(3).className).not.toContain(EXPANDED_TITLE_FONT_CLASS)

    clickIssueBox(3)

    // 開いた箱だけが 16px に上がる
    expect(issueCell(3).className).toContain(EXPANDED_TITLE_FONT_CLASS)
    expect(issueCell(3).className).not.toContain(TITLE_FONT_CLASS)
    // **開いていない箱は 14px のまま**——切り替えが箱ごとであること
    expect(issueCell(1).className).toContain(TITLE_FONT_CLASS)
    expect(issueCell(1).className).not.toContain(EXPANDED_TITLE_FONT_CLASS)
  })

  /**
   * **ノード末尾のボタンは「その課題」に足す。** 帯の「仮説を追加」は
   * **最後に触った課題**に足すので、両者は別経路である——同じ課題で試すと
   * どちらの実装でも緑になるので、**別の課題を最後に触った状態**で押す
   */
  it('展開したノード末尾のボタンでその課題に仮説が増える', () => {
    const base = file()
    const initial: IssueTreeSchemaVersion3 = {
      ...base,
      hypotheses: [
        { ...base.hypotheses[0], id: H(1), issueId: I(2), title: '課題2の仮説' },
        { ...base.hypotheses[0], id: H(2), issueId: I(3), title: '課題3の仮説' },
      ],
    }
    const onChange = vi.fn()
    const { unmount } = render(<Harness initial={initial} onChange={onChange} />)
    // 最後に触ったのは課題2。箱をクリックしても「最後に触った課題」は書き換わらない
    act(() => {
      issueCell(2).focus()
    })
    clickIssueBox(3)
    fireEvent.click(screen.getByRole('button', { name: '課題3に仮説を追加' }))
    const next: IssueTreeSchemaVersion3 = onChange.mock.calls[0][0]
    expect(next.hypotheses.filter((h) => h.issueId === I(3))).toHaveLength(2)
    expect(next.hypotheses.filter((h) => h.issueId === I(2))).toHaveLength(1)
    unmount()

    // **対の経路**——同じ状態で帯のボタンを押すと、最後に触った課題2 に足される
    const onBanner = vi.fn()
    render(<Harness initial={initial} onChange={onBanner} />)
    act(() => {
      issueCell(2).focus()
    })
    fireEvent.click(screen.getByRole('button', { name: '仮説を追加' }))
    const banner: IssueTreeSchemaVersion3 = onBanner.mock.calls[0][0]
    expect(banner.hypotheses.filter((h) => h.issueId === I(2))).toHaveLength(2)
  })

  /** 問い3件。ゴミ箱と同じく**残った文言**で見る */
  const threeAsks = (): IssueTreeSchemaVersion3 => {
    const base = file()
    return {
      ...base,
      hypotheses: [
        {
          ...base.hypotheses[0],
          asks: [
            { id: 'ask_AAAAAAAAAA', text: '問いA' },
            { id: 'ask_AAAAAAAAAB', text: '問いB' },
            { id: 'ask_AAAAAAAAAC', text: '問いC' },
          ],
        },
      ],
    }
  }

  it('問いの削除ボタンでその問いだけが消える', () => {
    const onChange = vi.fn()
    render(<Harness initial={threeAsks()} onChange={onChange} />)
    openHypothesis(1)
    fireEvent.click(screen.getByRole('button', { name: '仮説1 の聞きたいこと2を消す' }))
    const next: IssueTreeSchemaVersion3 = onChange.mock.calls[0][0]
    expect(next.hypotheses[0].asks.map((a) => a.text)).toEqual(['問いA', '問いC'])
  })

  /**
   * **「どの問いにも紐づかないFB」のブロックに削除は無い**——消す対象の問いが
   * 無い（`removeAsk` に渡す `askIndex` が無い）。名前で引くのではなく
   * **そのブロックの中のボタンを全部並べて**見る——「たまたま名前が違う削除」が
   * 混ざっていれば落ちる
   */
  it('どの問いにも紐づかない FB のブロックには問いの削除が無い', () => {
    const base = file()
    render(
      <Harness
        initial={{
          ...base,
          hypotheses: [
            {
              ...base.hypotheses[0],
              feedbacks: [
                { askId: null, text: '媒体ごとに仕様が違う', by: '', sentiment: 'note', date: '2026-08-30' },
              ],
            },
          ],
        }}
      />,
    )
    openHypothesis(1)
    const loose = screen.getByRole('group', { name: `仮説1 の${NO_ASK_TEXT}` })
    // **調子のトリガー（アイコン）はどのブロックの FB にも付く**（m5 の追加作業）
    // ——ここが見ているのは「問いの削除だけが無い」ことである
    expect(within(loose).queryAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      `仮説1 に${NO_ASK_TEXT}を足す`,
      '仮説1 のFB1の調子',
      '仮説1 のFB1を消す',
    ])
  })
})

describe('IssueTreeEditor（展開の継ぎ目）', () => {
  /**
   * **畳まれた行の `<button>` と展開後の `<textarea>` は同じ `data-cell` を
   * 名乗る。** エディタは行に着いた瞬間に同じ鍵でフォーカスを予約し、展開後の
   * DOM でそれを当てる——**2つが同時に DOM にあると `querySelector` が先頭を
   * 掴み、予約が静かに外れる**（落ちるテストが他に無いので、ここで見る）
   */
  it('畳まれた行を押すと、同じ仮説の textarea へ移る', () => {
    render(<Harness initial={file()} />)
    const row = screen.getByRole('button', { name: '仮説1を開く' })
    act(() => {
      fireEvent.click(row)
    })
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '仮説1' }))
    // ボタンは DOM から消えている（同じ鍵の要素が2つ残らない）
    expect(screen.queryByRole('button', { name: '仮説1を開く' })).toBeNull()
  })

  /**
   * **フォーカスが入っただけでは開かない**（m5）。畳まれた行に `Tab` で着いた
   * 瞬間に開いて textarea へ移す形は、1回の `Tab` でフォーカスが2回動くのと
   * 同じで、キーで木を歩くときに行き先が読めなかった（`open-issues.md`）
   */
  it('仮説の行にフォーカスしても展開しない', () => {
    render(<Harness initial={file()} />)
    const row = screen.getByRole('button', { name: '仮説1を開く' })
    act(() => {
      row.focus()
      fireEvent.focus(row)
    })
    // 行はボタンのまま。パネルの節見出しも現れない
    expect(document.activeElement).toBe(row)
    expect(screen.queryByRole('textbox', { name: '仮説1' })).toBeNull()
    expect(screen.queryByRole('button', { name: '仮説1に判断を追加' })).toBeNull()
  })

  /**
   * 選択（＝展開）の単位は**課題ノード**（m5）。**箱そのものがクリックの
   * 受け口である**（m5 の実機確認後。それまではタイトルの左のシェブロンだった）
   *——押すと箱ごと開き、その課題の仮説がまとめてパネルを持つ。
   * もう一度押すと外れる
   */
  it('課題の箱をクリックすると選択されて展開し、もう一度クリックすると外れる', () => {
    const base = file()
    render(
      <Harness
        initial={{
          ...base,
          hypotheses: [
            base.hypotheses[0],
            { ...base.hypotheses[0], id: H(2), title: '受信を待つ作りに切り替える' },
          ],
        }}
      />,
    )
    expect(screen.getByRole('button', { name: '仮説1を開く' })).toBeTruthy()

    clickIssueBox(3)
    // **その課題の仮説はすべて開く**（1本だけではない）
    expect(screen.getByRole('textbox', { name: '仮説1' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '仮説2' })).toBeTruthy()
    // 箱も広がる（見た目だけ開いて幅が畳んだままにならないこと）
    expect(issueBox(3).style.width).toBe(`${EXPANDED_BOX_WIDTH}px`)

    clickIssueBox(3)
    expect(screen.getByRole('button', { name: '仮説1を開く' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '仮説2を開く' })).toBeTruthy()
    expect(issueBox(3).style.width).toBe(`${BOX_WIDTH}px`)
  })

  /**
   * **選択中は枠で示す。面は旗のもののまま。**
   *
   * 語彙は `FileList.tsx`（選択中＝`border-ink`／非選択＝`border-transparent`）に
   * 倣って枠の側だけ借りた。**面まで選択で使うと旗と道具を奪い合う**ので、
   * 解決の旗（淡い緑 `judge-yes-face`）を掲げた課題を選んだときに
   * **緑と選択の両方が見えること**をここで固定する——片方を消す実装
   *（面で選択を示す／枠の三項で旗の面を上書きする）はここで赤くなる
   */
  it('解決の旗を掲げた課題を選んでも、緑の面と選択の枠が両立する', () => {
    const base = file()
    render(
      <Harness
        initial={{
          ...base,
          issues: base.issues.map((n, i) =>
            i === 2 ? { ...n, events: [{ kind: 'resolved' as const, note: '', date: '2026-08-30' }] } : n,
          ),
        }}
      />,
    )
    // 旗だけのときは通常の枠
    expect(issueBox(3).className).toContain('bg-judge-yes-face')
    expect(issueBox(3).className).toContain('border-rule')
    expect(issueBox(3).className).not.toContain('border-ink ')

    clickIssueBox(3)
    // **面はそのまま**（緑が消えない）
    expect(issueBox(3).className).toContain('bg-judge-yes-face')
    // **枠だけが選択の色に変わる**（選択が見えないままにならない）
    expect(issueBox(3).className).toContain('border-ink ')
    expect(issueBox(3).className).not.toContain('border-rule')
  })

  /**
   * **開閉トグル（シェブロン）は撤去した**（m5 の実機確認。依頼者の指示）。
   * 選択が箱のクリックへ移ったので、同じことをする口が2つある状態にしない。
   *
   * **代償は承知の上である**——シェブロンは `<button>` としてタブ順にいたので、
   * 撤去したことで**展開へのキーボード経路が無くなった**（`docs/open-issues.md`）
   */
  it('タイトル左の開閉トグル（シェブロン）は無い', () => {
    render(<Harness initial={file()} />)
    for (const n of [1, 2, 3]) {
      expect(screen.queryByRole('button', { name: `課題${n}の詳細` })).toBeNull()
    }
    // `aria-expanded` を名乗るものも箱に残っていない（出所は layout ひとつ）。
    // **箱の中に絞る**——文書全体で数えると、Radix のトリガー（`KindMenu` は
    // `aria-expanded` を持つ）が既定の fixture に出た瞬間、無関係の理由で赤くなる
    for (const n of [1, 2, 3]) {
      expect(issueBox(n).querySelectorAll('[aria-expanded]')).toHaveLength(0)
    }
  })

  /**
   * **仮説を1本も持たない課題は、選ばれても広がらない**——中身がボタン1つ
   * しかない 780 幅の箱は、無意味に右の列を押し広げる。
   * **だが「仮説を追加」だけは出す**——出さないと、その課題に仮説を足す道が
   * 箱から消える（帯のボタンは「最後に触った課題」に足す別経路）。
   *
   * **幅とボタンの両方を見る**——幅だけだと「ボタンごと出さない」実装が、
   * ボタンだけだと 780 に広がる実装が、それぞれ通ってしまう
   */
  it('仮説を持たない課題は、選んでも広がらず「仮説を追加」だけが出る', () => {
    render(<Harness initial={file()} />)
    // 課題1 は仮説を持たない（仮説がぶら下がるのは課題3）
    expect(screen.queryByRole('button', { name: '課題1に仮説を追加' })).toBeNull()

    clickIssueBox(1)
    expect(issueBox(1).style.width).toBe(`${BOX_WIDTH}px`)
    expect(screen.getByRole('button', { name: '課題1に仮説を追加' })).toBeTruthy()
  })

  /**
   * **出したボタンが実際に効くこと。** 上のテストは**出ること**しか見ておらず、
   * 「その課題に増える」は仮説を1本持つ課題の側のテスト（下の describe の
   * 「展開したノード末尾のボタンでその課題に仮説が増える」）が見ている。
   * **`selected` と `open` を分けた動機がまさにこの経路**——仮説0本の課題は
   * 開かない（`open` は偽）が、ボタンだけは出す（`selected` は真）——なので、
   * ここに直接の番人を置く。**足す先の課題を `index` で渡す配線**が
   * 開いた箱の側だけで生きていても、こちらは静かに壊れうる
   */
  it('仮説を持たない課題の「仮説を追加」で、その課題に仮説が増える', () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
    clickIssueBox(1)
    fireEvent.click(screen.getByRole('button', { name: '課題1に仮説を追加' }))
    const next: IssueTreeSchemaVersion3 = onChange.mock.calls[0][0]
    // **課題1 に1本**（既定の fixture の1本は課題3 にぶら下がっている）
    expect(next.hypotheses.filter((h) => h.issueId === I(1))).toHaveLength(1)
    expect(next.hypotheses.filter((h) => h.issueId === I(3))).toHaveLength(1)
  })

  /**
   * **選択は同時に1つ。** 箱が `BOX_WIDTH` → `EXPANDED_BOX_WIDTH` に広がるので、
   * 複数開くと図が読めない（`selectedIssueKey` が単一であることの番人）
   */
  it('選択は同時に1つ（別の課題を選ぶと前の課題は畳まれる）', () => {
    const base = file()
    render(
      <Harness
        initial={{
          ...base,
          hypotheses: [
            base.hypotheses[0],
            { ...base.hypotheses[0], id: H(2), issueId: I(2), title: '受付IDだけ先に返す' },
          ],
        }}
      />,
    )
    clickIssueBox(3)
    expect(issueBox(3).style.width).toBe(`${EXPANDED_BOX_WIDTH}px`)

    clickIssueBox(2)
    expect(issueBox(2).style.width).toBe(`${EXPANDED_BOX_WIDTH}px`)
    expect(issueBox(3).style.width).toBe(`${BOX_WIDTH}px`)
  })

  /**
   * **展開したパネルの地をクリックしても畳まれない。**
   *
   * 入り切りは箱の地で受けるが、**パネルの中は素通しにする**（`[data-panel]`）
   *——開いた箱は 780px あり、パネルの余白は広い。押した拍子に課題ごと畳まれると、
   * 詳細や価値仮説を読み書きしている最中に開いていたものが閉じる。
   * **パネルが描かれるのは選択中のときだけ**なので、素通しにして失う経路は無い。
   *
   * **面（`aria-hidden` の地）と、節見出しの帯の文字の両方で見る**——前者だけだと
   * 「面の要素だけ弾く」実装が、後者だけだと「文字の要素だけ弾く」実装が通る
   */
  it('展開したパネルの地をクリックしても選択は外れない', () => {
    render(<Harness initial={file()} />)
    clickIssueBox(3)
    expect(issueBox(3).style.width).toBe(`${EXPANDED_BOX_WIDTH}px`)

    // パネルの面（`HypothesisPanel` が最初に描く `aria-hidden` の地）
    const ground = issueBox(3).querySelector('[data-panel]')?.firstElementChild
    if (ground === null || ground === undefined) throw new Error('パネルの地が無い')
    expect(ground.getAttribute('aria-hidden')).toBe('true')
    fireEvent.click(ground)
    expect(issueBox(3).style.width).toBe(`${EXPANDED_BOX_WIDTH}px`)
    expect(screen.getByRole('textbox', { name: '仮説1' })).toBeTruthy()

    // 節見出しの帯（ボタンでも欄でもない、パネルの中の文字）
    fireEvent.click(screen.getByText(SECTION_LABELS.solution))
    expect(issueBox(3).style.width).toBe(`${EXPANDED_BOX_WIDTH}px`)

    // **箱の地では従来どおり外れる**（素通しがパネルの外まで広がっていないこと）
    clickIssueBox(3)
    expect(issueBox(3).style.width).toBe(`${BOX_WIDTH}px`)
  })

  /**
   * **タイトルの欄は選択を外さない。** 箱の地の上のクリックは入り切りするが、
   * 文章の欄の上のクリックは**選ぶだけ**である——外す側に倒すと、選択中の
   * 課題のタイトルへカーソルを置き直すたびに箱が畳まれ、**打つ場所そのものが
   * 目の前で動く**。
   *
   * あわせて**タイトルの編集とキー操作が生きていること**を見る（箱に
   * クリックの受け口を足したことで、`textarea` の入力や `Enter` の
   * 兄弟追加が阻害されていないこと）
   */
  it('タイトルの欄はクリックしても畳まれず、編集とキー操作が生きている', () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
    clickIssueBox(3)
    expect(issueBox(3).style.width).toBe(`${EXPANDED_BOX_WIDTH}px`)

    // 欄をクリックしても畳まれない（選ぶだけ）
    fireEvent.click(issueCell(3))
    expect(issueBox(3).style.width).toBe(`${EXPANDED_BOX_WIDTH}px`)

    // 文言が打てる
    fireEvent.change(issueCell(3), { target: { value: '受付IDだけ返せるか？' } })
    expect(onChange.mock.calls[0][0].issues[2].text).toBe('受付IDだけ返せるか？')
    // Enter は兄弟を増やす（既定動作は止める）
    expect(fireEvent.keyDown(issueCell(3), { key: 'Enter' })).toBe(false)
    expect(onChange.mock.calls[1][0].issues).toHaveLength(4)
  })

  // **「開いた課題から最後の仮説が消えると箱は畳まれる」は消す動線と一緒に
  // 引っ越した**——m4 はキーボードの Backspace、m5 Task 7 からはパネルの
  // ゴミ箱である。番人は下の describe（仮説の追加・削除のマウス動線）にある

  /**
   * **かつてはこの経路が課題セルの Ctrl+Enter だった**（m5 でボタンへ移った）。
   * `apply` → `goTo` が展開と予約を担うのは経路によらず共通なので、いまは
   * 帯の「仮説を追加」ボタンでこの性質（生えた仮説が展開された状態でフォーカスを
   * 受ける）を確かめる
   */
  it('「仮説を追加」で生えた仮説は、展開された状態でフォーカスを受ける', () => {
    render(<Harness initial={file()} />)
    act(() => {
      issueCell(3).focus()
    })
    fireEvent.click(screen.getByRole('button', { name: '仮説を追加' }))
    // 新しい仮説は配列の末尾（仮説2）。畳まれたままだと打つ場所が無い
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '仮説2' }))
  })

  /**
   * **開いているのは同時に1つの課題**（m5。それまでは仮説1本だった）。
   * 箱が `BOX_WIDTH` → `EXPANDED_BOX_WIDTH` に広がるので、複数開くと図が読めない。
   * **同じ課題の仮説どうしは畳み合わない**——見比べるために課題ごと開いている
   */
  it('展開しているのは同時に1つの課題（別の課題を開くと前の課題は畳まれる）', () => {
    const base = file()
    render(
      <Harness
        initial={{
          ...base,
          hypotheses: [
            // 課題3 に2本
            base.hypotheses[0],
            { ...base.hypotheses[0], id: H(2), title: '受信を待つ作りに切り替える' },
            // 課題2 に1本
            { ...base.hypotheses[0], id: H(3), issueId: I(2), title: '受付IDだけ先に返す' },
          ],
        }}
      />,
    )
    openHypothesis(1)
    // **同じ課題の隣の行も開いたまま**（1本だけ開く実装なら赤くなる）
    expect(screen.queryByRole('button', { name: '仮説1を開く' })).toBeNull()
    expect(screen.getByRole('textbox', { name: '仮説2' })).toBeTruthy()

    // 別の課題を開くと、前の課題は畳まれる
    openHypothesis(3)
    expect(screen.getByRole('button', { name: '仮説1を開く' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '仮説2を開く' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '仮説1' })).toBeNull()
  })

  it('課題のプレースホルダは「課題」で、「仮説なし」はバッジに出る', () => {
    // **プレースホルダに問いを入れない**——空の箱のタイトルが「仮説なし」に
    // 見える。問いはタイトル行の右端のバッジが運ぶ
    const base = file()
    render(
      <Harness
        initial={{
          ...base,
          issues: base.issues.map((n, i) => (i === 2 ? { ...n, text: '' } : n)),
          hypotheses: [],
        }}
      />,
    )
    const cell = screen.getByRole('textbox', { name: /^課題3/ }) as HTMLTextAreaElement
    expect(cell.placeholder).toBe('課題')
    // 名前の後半には問いが入る（音声にも出す）
    expect(cell.getAttribute('aria-label')).toBe(`課題3（未記入） ${QUESTION_LABELS.hypothesis}`)
    expect(screen.getAllByText(QUESTION_LABELS.hypothesis)[0].className).toBe(
      badgeClass(badgeVariantOf('open', false)),
    )
  })

  /**
   * **かつてここは「俯瞰は5語、展開では正確な種別」を見ていた**——`rejectedWithoutTest`
   * の行が畳まれていれば「棄却」、開けば「検証せず棄却」と出ることを固定していた。
   * 判断を5語に畳んだいま、その差は無くなった（どちらも「棄却」）。
   *
   * 残っているのは**畳まれた行とその中身の関係**である: 行は判断の語を1つだけ運び、
   * 開くと判断の節（＝押せるバッジ1つ。m5 Task 6）が現れる。畳まれた行が
   * 語を2つ運んだり、節が畳まれた行に漏れ出したりしないことは、いまも壊れうる
   */
  it('畳まれた行は判断の語を1つだけ運び、展開すると判断の節が出る', () => {
    const base = file()
    render(
      <Harness
        initial={{
          ...base,
          hypotheses: [
            { ...base.hypotheses[0], events: [{ kind: 'rejected', note: '', date: '2026-08-30' }] },
          ],
        }}
      />,
    )
    const row = screen.getByRole('button', { name: '仮説1を開く' })
    expect(row.textContent).toContain(BADGE_LABELS.no)
    // 畳まれた行に判断の節は出ない（バッジのトリガーは開いてから現れる）
    expect(screen.queryByRole('button', { name: '仮説1に判断を追加' })).toBeNull()
    expect(screen.getAllByText(EVENT_KIND_LABELS.rejected)).toHaveLength(1)

    openHypothesis(1)
    // **開いても語は1つのまま**——行末の俯瞰バッジは頭部ごと消え、判断の語を
    // 運ぶのは「検証結果」節のバッジだけになった（m5 Task 4。頭部を残すと
    // 同じ文言が2箇所に出る）
    expect(screen.getAllByText(EVENT_KIND_LABELS.rejected)).toHaveLength(1)
    // **語を運んでいるのはトリガーそのもの**（m5 Task 6 でバッジがトリガーに
    // なったので、バッジと文言ボタンで語が2つに割れることが無くなった）
    expect(screen.getByRole('button', { name: '仮説1に判断を追加' }).textContent).toBe(
      EVENT_KIND_LABELS.rejected,
    )
  })
})

describe('IssueTreeEditor（キャンバス）', () => {
  it('3レイヤが同じ transform を共有する', () => {
    // ズレるとエッジがノードから外れる
    const { container } = render(<Harness initial={file()} />)
    const background = container.querySelector('[data-layer="background"]') as HTMLElement
    const nodes = container.querySelector('[data-layer="nodes"]') as HTMLElement
    const edges = container.querySelector('[data-layer="edges"] g') as SVGGElement
    expect(nodes.style.transform).toBe(background.style.transform)
    expect(edges.getAttribute('transform')).toBe('translate(40,40) scale(1)')
  })

  it('ノードのレイヤは操作を通し、箱の矩形だけが受ける', () => {
    // レイヤは帯のボタンより上に来る透明な面なので、pointer-events を切らないと
    // 中央のヒットテストを奪って帯のボタンが押せなくなる（jsdom は
    // ヒットテストを持たないため、クリックのテストでは検出できない）
    const { container } = render(<Harness initial={file()} />)
    expect(container.querySelector('[data-layer="nodes"]')?.className).toContain(
      'pointer-events-none',
    )
    // 箱の矩形（`group/issue pointer-events-auto`）が受ける。入力欄はその中の
    // 絶対配置の子なので、親を1段だけ見るのでは届かない
    expect(issueCell(1).closest('[class*="pointer-events-auto"]')).not.toBeNull()
  })

  it('新しい課題へのフォーカスでコンテナをスクロールさせない', () => {
    // 画面外の要素に focus すると**ブラウザが祖先の scrollLeft/scrollTop を
    // 動かす**が、位置は transform で持っており panIntoView はスクロール量を
    // 見ていないので、追従と二重に動いて以後ずれ続ける
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus')
    render(<Harness initial={file()} />)
    fireEvent.keyDown(issueCell(2), { key: 'Tab' })
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    focus.mockRestore()
  })
})
