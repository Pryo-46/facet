// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { badgeClass, BADGE_BOX_HEIGHT } from '@/components/badge-styles'
import { buildTree, type FlatTreeNode } from '@/core/canvas/flat-tree'
import type { IssueTreeSchemaVersion2 } from '@/types/issue-tree'
import { badgeVariantOf } from './badge-variant'
import {
  BADGE_LABELS,
  DEFERRAL_NOTE,
  deferralLine,
  EVENT_KIND_LABELS,
  ISSUE_DEFERRED_LABEL,
  poseQuestions,
  QUESTION_LABELS,
  TALLY_TOTAL_LABEL,
  tallyLine,
  tallyQuestions,
} from './derive'
import { IssueTreeEditor } from './IssueTreeEditor'
import { DEFER_TRIGGER_LABEL, JUDGEMENT_TRIGGER_LABELS } from './layout'

afterEach(cleanup)

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

/**
 * 課題3件（根→中間→葉）・仮説1件。**中間ノードが子を持っている形を選ぶ**
 *——葉の直後で足すと `Tab`（子課題）と `Enter`（兄弟課題）が同じ配列位置・
 * 同じラベルになり、写像を差し替えても緑のままになる（logic-tree M1 が踏んだ形）
 */
const file = (): IssueTreeSchemaVersion2 => ({
  schemaVersion: 2,
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
      text: '既存APIの前例に合わせられる',
      rationale: '先行プロジェクトの実測',
      events: [],
      pendingNotes: [],
    },
  ],
})

/** 額縁と同じく、onChange を state に反映する殻を被せる */
function Harness({
  initial,
  onChange,
}: {
  initial: IssueTreeSchemaVersion2
  onChange?: (next: IssueTreeSchemaVersion2, mergeKey?: string | null) => void
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
 * 同じ接頭辞を持つ見送りのトグル（`課題{N}の見送り`）と区別するため。
 *
 * **後半を素通しにしない**——見送った課題は同じ箱の中に理由の欄
 *（`課題{N} の見送りの理由`）を持っており、前方一致だけだと2件引いてしまう。
 * 許すのは「（未記入）」と立っている問いだけにして、前半の約束は動かさない
 */
const issueCell = (n: number): HTMLTextAreaElement =>
  screen.getByRole('textbox', {
    name: new RegExp(`^課題${n}(（未記入）)?( ${QUESTION_LABELS.hypothesis})?$`),
  }) as HTMLTextAreaElement

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

describe('IssueTreeEditor（主修飾キー＋Enter の写像）', () => {
  // 写像が入れ替わっても画面は一見正常なので、ここでしか捕まらない

  it('課題セルでは仮説を足す', () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
    expect(fireEvent.keyDown(issueCell(3), { key: 'Enter', ctrlKey: true })).toBe(false)
    const next: IssueTreeSchemaVersion2 = onChange.mock.calls[0][0]
    expect(next.hypotheses).toHaveLength(2)
    // 足したのは「押した課題」にぶら下がる仮説であること
    expect(next.hypotheses.filter((h) => h.issueId === I(3))).toHaveLength(2)
    // 課題は増えていない（Enter の兄弟追加と取り違えていない）
    expect(next.issues).toHaveLength(3)
  })

  it('仮説セルでは判断のドロップダウンを開く（仮説は増えない）', async () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
    expect(fireEvent.keyDown(openHypothesis(1), { key: 'Enter', ctrlKey: true })).toBe(false)
    // **項目名は EVENT_KIND_LABELS から引く**（打ち直すと Skill の報告と食い違う）
    await screen.findByRole('menuitem', { name: EVENT_KIND_LABELS.supported })
    // **件数を数えない。** かつてここは `toHaveLength(6)` で、`JUDGEMENT_KINDS` が
    // 手書きの `readonly JudgementKind[]` だったため、スキーマへ `onHold` を
    // 足しても配列は6件のまま——**アプリからは選べない判断**が静かに残り、
    // このテストは緑のままだった。`EVENT_KIND_LABELS`（`Record<JudgementKind, string>`）
    // の値の集合と突き合わせれば、種別が増えたときに必ず落ちる
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent).sort()).toEqual(
      Object.values(EVENT_KIND_LABELS).sort(),
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  it('メモを最新イベントの根拠へ移す（イベント0件なら何も起きない）', () => {
    const base = file()
    const withNote: IssueTreeSchemaVersion2 = {
      ...base,
      hypotheses: [{ ...base.hypotheses[0], pendingNotes: ['再送の窓は何分か'] }],
    }
    const onChange = vi.fn()
    const { unmount } = render(<Harness initial={withNote} onChange={onChange} />)
    // イベントが0件なので移動先が無い＝データは動かない
    openHypothesis(1)
    fireEvent.keyDown(screen.getByRole('textbox', { name: '仮説1 のFB1' }), {
      key: 'Enter',
      ctrlKey: true,
    })
    expect(onChange).not.toHaveBeenCalled()
    unmount()

    const withEvent: IssueTreeSchemaVersion2 = {
      ...base,
      hypotheses: [
        { ...base.hypotheses[0], events: [{ kind: 'supported', note: '' }], pendingNotes: ['再送の窓は何分か'] },
      ],
    }
    const onMoved = vi.fn()
    render(<Harness initial={withEvent} onChange={onMoved} />)
    openHypothesis(1)
    fireEvent.keyDown(screen.getByRole('textbox', { name: '仮説1 のFB1' }), {
      key: 'Enter',
      ctrlKey: true,
    })
    const next: IssueTreeSchemaVersion2 = onMoved.mock.calls[0][0]
    expect(next.hypotheses[0].events[0].note).toBe('再送の窓は何分か')
    expect(next.hypotheses[0].pendingNotes).toEqual([])
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

    // 見送りは課題ノードのトグルを1回押して付ける（種別は `deferred` の1語しか
    // 無いので選ばせない。かつてはここが1択のドロップダウンだった）
    const toggle = screen.getByRole('button', { name: '課題1の見送り' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    /**
     * **この2本が捕まえるのは「JSX に文字列を直書きした」ことだけである。**
     *
     * 描く側もレイアウト（`layout.ts` の `slotW`）も同じ定数を読むので、
     * 定数を書き換えれば両方が一緒に動く。しかも `DEFER_TRIGGER_LABEL` と
     * `ISSUE_DEFERRED_LABEL` は**いま同値**（どちらも「見送り」）なので、
     * 切りと入りを取り違えてもここは通る——取り違えを捕まえるのは、すぐ下の
     * **面のクラス**の照合の方である（同値であること自体は
     * `layout.test.ts` が「畳まないこと」として固定している）。
     *
     * **空けた幅と描いた幅が一致することは、ここでは検査していない。**
     * `px-1`→`px-2`・枠線の削除・`text-sm`→`text-base`・`ACTION_INSET_X` の
     * 変更——予約幅と描画幅を食い違わせる経路はどれも `textContent` を
     * 動かさない。**jsdom には版組が無いので原理的に測れない**ので、
     * 対は「measure.ts の定数と Tailwind クラスを対で直す」という規律
     *（`measure.ts` の註）と実機確認が守っている
     */
    expect(toggle.textContent).toBe(DEFER_TRIGGER_LABEL)
    // **切りの面もバッジと同じ幾何を持つ**（実機所見: 周囲のバッジとサイズが
    // 揃っていなかった）。色は「押せる面」だが、箱の高さはバッジと揃える
    expect(toggle.className).toContain(`h-[${BADGE_BOX_HEIGHT}px]`)
    // **切りの面はバッジの面ではない。** ここが入りの面になっていたら、
    // 見送っていない箱に見送りバッジが出ている
    expect(toggle.className).not.toContain(badgeClass(badgeVariantOf('deferred', false)))
    const offFace = toggle.className
    fireEvent.click(toggle)

    // 押した後は**見送りの理由の欄**へフォーカスが来る（`toggleDeferral` の行き先）
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
      screen.getByText(tallyLine({ hypothesis: 0, result: 0, hold: 0, judgement: 0, total: 0 })),
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
            i === 1 ? { ...n, events: [{ kind: 'deferred', note: '初回フローの成立が先' }] } : n,
          ),
          // **見送った課題2に直接ぶら下がる仮説を足す。** 既存の仮説1は課題3
          //（＝配下）にぶら下がっており、自己包含でも祖先由来でも薄くなるので、
          // 「行だけは自己包含で薄くする」という今回の設計の要を突けない
          hypotheses: [
            ...base.hypotheses,
            { id: H(2), issueId: I(2), text: '通知は後追いで足せる', rationale: '', events: [], pendingNotes: [] },
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
    const nested: IssueTreeSchemaVersion2 = {
      schemaVersion: 2,
      type: 'issueTree',
      title: 'テスト',
      issues: [
        { id: I(1), parentId: null, text: 'A 通常', events: [] },
        { id: I(2), parentId: I(1), text: 'B 見送り', events: [{ kind: 'deferred', note: '今回は追わない' }] },
        {
          id: I(3),
          parentId: I(2),
          text: 'C 見送り',
          events: [{ kind: 'deferred', note: '本開発で扱う' }],
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
  it('bg-surface-muted は見送りを掲げた当人の箱だけ（通常・入れ子で抑制された配下は持たない）', () => {
    const nested: IssueTreeSchemaVersion2 = {
      schemaVersion: 2,
      type: 'issueTree',
      title: 'テスト',
      issues: [
        { id: I(1), parentId: null, text: 'A 通常', events: [] },
        { id: I(2), parentId: I(1), text: 'B 見送り', events: [{ kind: 'deferred', note: '今回は追わない' }] },
        {
          id: I(3),
          parentId: I(2),
          text: 'C 見送り',
          events: [{ kind: 'deferred', note: '本開発で扱う' }],
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
    // B：見送りを掲げた当人だけが塗る
    expect(classesOf(2)).toContain('bg-surface-muted')
    expect(classesOf(2)).not.toContain('bg-surface')
    // C：自分も見送っているが、祖先（B）由来の抑制が勝つので塗らない
    expect(classesOf(3)).not.toContain('bg-surface-muted')
    expect(classesOf(3)).toContain('bg-surface')
    // D：ただの抑制された配下も塗らない
    expect(classesOf(4)).not.toContain('bg-surface-muted')
    expect(classesOf(4)).toContain('bg-surface')
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
              ? { ...n, events: [{ kind: 'deferred', note: '本開発の設計と一緒に決める' }] }
              : n,
          ),
        }}
        onChange={onChange}
      />,
    )
    // バッジは1語「見送り」。**同時にこれが見送りのトグルを兼ねる**。
    // **これも「JSX に直書きしていない」ことしか見ていない**（上の註のとおり、
    // 幅の一致は jsdom では測れないし、`DEFER_TRIGGER_LABEL` と同値なので
    // 切り／入りの取り違えも捕まえない）——状態を分けているのは下の面の方
    const badge = screen.getByRole('button', { name: '課題1の見送り' })
    expect(badge.textContent).toBe(ISSUE_DEFERRED_LABEL)
    // **薄くならない。** 見送りは「そこで下した判断の表明」であって
    // 「もう見なくてよい枝」ではない（俯瞰モックの規則。薄いのは配下だけ）
    expect(badge.className).toContain(badgeClass(badgeVariantOf('deferred', false)))

    const reason = screen.getByRole('textbox', { name: '課題1 の見送りの理由' })
    expect((reason as HTMLTextAreaElement).value).toBe('本開発の設計と一緒に決める')
    fireEvent.change(reason, { target: { value: '通知は本開発で扱う' } })
    const next: IssueTreeSchemaVersion2 = onChange.mock.calls[0][0]
    expect(next.issues[0].events).toEqual([
      { kind: 'deferred', note: '通知は本開発で扱う' },
    ])
  })

  /**
   * **トグルを切ると、理由の欄ごと消える。** 「一度見送って戻した」履歴も、
   * そのとき書いた理由も残らない——`toggleDeferral` が最新の見送りを消すので
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
            i === 0 ? { ...n, events: [{ kind: 'deferred', note: '本開発の設計と一緒に決める' }] } : n,
          ),
        }}
        onChange={onChange}
      />,
    )
    const toggle = screen.getByRole('button', { name: '課題1の見送り' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)

    const next: IssueTreeSchemaVersion2 = onChange.mock.calls[0][0]
    expect(next.issues[0].events).toEqual([])
    // 理由の欄は消え、トグルは切りに戻る（面もバッジから小ボタンへ戻る）
    expect(screen.queryByRole('textbox', { name: '課題1 の見送りの理由' })).toBeNull()
    const back = screen.getByRole('button', { name: '課題1の見送り' })
    expect(back.getAttribute('aria-pressed')).toBe('false')
    expect(back.className).not.toContain(badgeClass(badgeVariantOf('deferred', false)))
    expect(back.textContent).toBe(DEFER_TRIGGER_LABEL)
    // **フォーカスは課題の文言へ戻る**（消えた欄には返せず、ボタンの上では
    // 木の操作言語が効かない）
    expect(document.activeElement).toBe(issueCell(1))
  })
})

/**
 * 未決2件（同じ課題）と「仮説なし」1件が同時に立つ形。**同じ種類が2件ある**ので、
 * チップを押し続けたときの巡回（末尾なら先頭へ）が見える
 */
const openFile = (): IssueTreeSchemaVersion2 => ({
  schemaVersion: 2,
  type: 'issueTree',
  title: 'テスト',
  issues: [
    { id: I(1), parentId: null, text: '根', events: [] },
    { id: I(2), parentId: I(1), text: '仮説を持つ葉', events: [] },
    { id: I(3), parentId: I(1), text: '仮説の無い葉', events: [] },
  ],
  hypotheses: [
    { id: H(1), issueId: I(2), text: '仮説A', rationale: '', events: [], pendingNotes: [] },
    { id: H(2), issueId: I(2), text: '仮説B', rationale: '', events: [], pendingNotes: [] },
  ],
})

/**
 * 4種の問いが**同時に**立つ形。チップの面（実線／破線）は種類ごとに分かれるので、
 * 保留だけを別のファイルで見ると「どちらも警告色の枠」までしか言えず、
 * `kind === 'hold'` の分岐を壊しても緑になる。同じ帯に4つ並べて突き合わせる
 */
const allKindsFile = (): IssueTreeSchemaVersion2 => ({
  schemaVersion: 2,
  type: 'issueTree',
  title: 'テスト',
  issues: [
    { id: I(1), parentId: null, text: '根', events: [] },
    { id: I(2), parentId: I(1), text: '仮説を持つ葉', events: [] },
    { id: I(3), parentId: I(1), text: '仮説の無い葉', events: [] },
  ],
  hypotheses: [
    // 未決＝イベントが0件
    { id: H(1), issueId: I(2), text: '仮説A', rationale: '', events: [], pendingNotes: [] },
    // 保留＝最新が onHold
    {
      id: H(2),
      issueId: I(2),
      text: '仮説B',
      rationale: '',
      events: [{ kind: 'onHold', note: '「楽」の定義が決まらず判断できない' }],
      pendingNotes: [],
    },
    // 未判断＝締め忘れたFBメモが残っている（判断は付いているので未決ではない）
    {
      id: H(3),
      issueId: I(2),
      text: '仮説C',
      rationale: '',
      events: [{ kind: 'supported', note: '実測で確認' }],
      pendingNotes: ['レビューで出た指摘'],
    },
  ],
})

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
    expect(t).toMatchObject({ hypothesis: 1, result: 2, hold: 0, judgement: 0, total: 3 })
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
    expect(chip('judgement')).toBeNull()
    expect(screen.queryByText(`${QUESTION_LABELS.hold} 0`)).toBeNull()
    expect(screen.queryByText(`${QUESTION_LABELS.judgement} 0`)).toBeNull()
  })

  /**
   * チップの面は**キャンバスのバッジの語彙そのまま**（`chipVariantOf`）——保留は
   * 実線の枠（`hold`）、未判断は着信の青（`pending`。レビューの FB に返答して
   * いない＝欠落ではなく受信箱）、仮説なし・未決は「まだ見ていない」の破線
   *（`open`）。帯とキャンバスが同じ言葉を使う
   */
  it('保留と未判断は実線、仮説なし・未決は破線のバッジ（未判断だけ色も違う）', () => {
    const data = allKindsFile()
    const t = tallyQuestions(poseQuestions(data))
    expect(t).toMatchObject({ hypothesis: 1, result: 1, hold: 1, judgement: 1, total: 4 })
    render(<Harness initial={data} />)
    // **クラス名を打ち直さない**——`badgeClass` の戻り値と照合する。チップは
    // 共通部品 `MissingTally` が土台のクラスを前に足すので、一致ではなく包含で見る
    const hold = badgeClass('hold')
    const pending = badgeClass('pending')
    const open = badgeClass('open')
    expect(chip('hold')?.className).toContain(hold)
    expect(chip('judgement')?.className).toContain(pending)
    for (const kind of ['hypothesis', 'result'] as const) {
      expect(chip(kind)?.className, kind).toContain(open)
    }
    // 3つの面は互いに異なる（同じクラスへ潰れていないこと）
    expect(hold).not.toBe(pending)
    expect(hold).not.toBe(open)
    expect(pending).not.toBe(open)
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

  it('操作ヒントを5件出す（表記が互いに重ならない）', () => {
    render(<Harness initial={file()} />)
    const hintSpan = (text: string) =>
      screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === text)
    expect(hintSpan('Enter: 兄弟を追加')).toBeTruthy()
    expect(hintSpan('Tab: 子課題を追加')).toBeTruthy()
    // $mod / $alt は KeyHints が解決する（jsdom は mac 判定にならない）
    expect(hintSpan('Ctrl+Enter: 仮説／判断を追加')).toBeTruthy()
    expect(hintSpan('←→: 親子移動')).toBeTruthy()
    expect(hintSpan('Alt+↑↓: 並び替え')).toBeTruthy()
  })

  it('課題0件でも「課題を追加」で根を作れる（マウスだけの動線）', () => {
    render(
      <Harness
        initial={{ schemaVersion: 2, type: 'issueTree', title: 'テスト', issues: [], hypotheses: [] }}
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
    const next: IssueTreeSchemaVersion2 = onChange.mock.calls[0][0]
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
    // 行を開くと、展開後の文言の欄までフォーカスが来る（`expandRow` の予約）
    openHypothesis(1)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '仮説1' }))
    fireEvent.click(screen.getByRole('button', { name: '仮説を追加' }))
    const next: IssueTreeSchemaVersion2 = onChange.mock.calls.at(-1)?.[0]
    expect(next.hypotheses).toHaveLength(3)
    expect(next.hypotheses.filter((h) => h.issueId === I(2))).toHaveLength(3)
  })
})

/** 見送りを掲げた課題が2件（うち1件は入れ子）あるファイル */
const deferredFile = (): IssueTreeSchemaVersion2 => ({
  schemaVersion: 2,
  type: 'issueTree',
  title: '見送りの帯',
  issues: [
    { id: I(1), parentId: null, text: '決済', events: [] },
    {
      id: I(2),
      parentId: I(1),
      text: '需要',
      events: [{ kind: 'deferred', note: '今回は追わない' }],
    },
    {
      id: I(3),
      parentId: I(1),
      text: '性能',
      events: [{ kind: 'deferred', note: '機材が無い' }],
    },
  ],
  hypotheses: [],
})

describe('IssueTreeEditor（見送りの別枠チップ。M25 D17）', () => {
  it('見送りを掲げた課題の数を出し、押すとその課題の欄へ視点が飛んで巡回する', () => {
    render(<Harness initial={deferredFile()} />)
    const chip = screen.getByRole('button', { name: '次の見送りへ' })
    expect(chip.textContent).toBe(deferralLine(2))
    expect(chip.title).toBe(DEFERRAL_NOTE)
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
 * 帯の「未判断 N」と、行に出る「未判断」バッジを**一対一にする**（M22）。
 * 集計だけが増えて「どの行のことか」が図から読めない状態を作らない。
 *
 * **`allKindsFile` を使うのは、立つ行と立たない行が同じ画面に並ぶから**である
 *（立つ行だけのファイルだと「常に出す」実装でも緑になる）
 */
describe('IssueTreeEditor（行の未判断バッジ）', () => {
  /** 行の中のバッジ（`Badge` は inline-flex。行頭の点は rounded-full の span） */
  const rowBadges = (n: number): HTMLElement[] => {
    const row = screen.getByRole('button', { name: `仮説${n}を開く` })
    return Array.from(row.querySelectorAll('[class*="inline-flex"]')) as HTMLElement[]
  }

  it('未判断が立つ仮説の行にだけ「未判断」バッジが出る（帯のチップと同じ面）', () => {
    const data = allKindsFile()
    expect(poseQuestions(data).hypothesisQuestions.map((q) => q.judgement)).toEqual([
      false,
      false,
      true,
    ])
    render(<Harness initial={data} />)

    // 立っていない行は状態のバッジ1つだけ
    expect(rowBadges(1).map((e) => e.textContent)).toEqual([BADGE_LABELS.open])
    expect(rowBadges(2).map((e) => e.textContent)).toEqual([BADGE_LABELS.hold])
    // 立っている行は2つ。**状態のバッジは残る**（置き換えではなく、その左へ並ぶ）
    expect(rowBadges(3).map((e) => e.textContent)).toEqual([
      BADGE_LABELS.yes,
      QUESTION_LABELS.judgement,
    ])

    // 面は帯のチップと同じ語彙（着信の青＝`pending`）。**クラス名を打ち直さない**
    const pending = rowBadges(3)[1]
    expect(pending.className).toBe(badgeClass('pending'))

    /**
     * **未判断は状態のバッジの左に置く。** 幅は jsdom では測れない（版組が無い）が、
     * 絶対配置の `left` はレイアウトが返した矩形そのままなので、
     * `placement.badge` を流用して2つを同じ場所へ重ねた実装はここで落ちる
     */
    const leftOf = (el: HTMLElement): number =>
      parseFloat((el.parentElement as HTMLElement).style.left)
    expect(leftOf(pending)).toBeLessThan(leftOf(rowBadges(3)[0]))
  })

  it('展開した仮説の頭部にも「未判断」バッジが残る', () => {
    // 頭部は閉じた行と別の分岐で描かれる（`inRow` と `inBox`）ので、別に見る
    render(<Harness initial={allKindsFile()} />)
    const box = openHypothesis(3).closest('[class*="pointer-events-auto"]')
    if (box === null) throw new Error('仮説3の箱が無い')
    const found = Array.from(box.querySelectorAll('[class*="inline-flex"]')).filter(
      (e) => e.textContent === QUESTION_LABELS.judgement,
    )
    expect(found).toHaveLength(1)
    expect((found[0] as HTMLElement).className).toBe(badgeClass('pending'))
  })
})

describe('IssueTreeEditor（仮説の行の操作）', () => {
  it('判断を選ぶとイベントが追記される（マウスの動線）', async () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
    // 判断のトリガーは**展開パネルの中**にある（畳まれた行はバッジ1つ）
    openHypothesis(1)
    fireEvent.pointerDown(screen.getByRole('button', { name: '仮説1に判断を追加' }), { button: 0 })
    fireEvent.click(await screen.findByRole('menuitem', { name: EVENT_KIND_LABELS.rejected }))
    const next: IssueTreeSchemaVersion2 = onChange.mock.calls[0][0]
    expect(next.hypotheses[0].events).toEqual([{ kind: 'rejected', note: '' }])
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
  })

  it('FB の Enter は押した位置の次に足す（末尾ではない）', () => {
    const base = file()
    const onChange = vi.fn()
    render(
      <Harness
        initial={{
          ...base,
          hypotheses: [{ ...base.hypotheses[0], pendingNotes: ['A', 'B', 'C'] }],
        }}
        onChange={onChange}
      />,
    )
    // **真ん中で押す**——末尾で押すと「末尾に足す実装」と結果が区別できない
    openHypothesis(1)
    expect(
      fireEvent.keyDown(screen.getByRole('textbox', { name: '仮説1 のFB2' }), { key: 'Enter' }),
    ).toBe(false)
    expect(onChange.mock.calls[0][0].hypotheses[0].pendingNotes).toEqual(['A', 'B', '', 'C'])
  })

  it('FB の Alt+↑ で並びが入れ替わる（写像が noteIndex と向きを正しく渡す）', () => {
    const base = file()
    const onChange = vi.fn()
    render(
      <Harness
        initial={{
          ...base,
          hypotheses: [{ ...base.hypotheses[0], pendingNotes: ['A', 'B', 'C'] }],
        }}
        onChange={onChange}
      />,
    )
    openHypothesis(1)
    expect(
      fireEvent.keyDown(screen.getByRole('textbox', { name: '仮説1 のFB2' }), {
        key: 'ArrowUp',
        altKey: true,
      }),
    ).toBe(false)
    expect(onChange.mock.calls[0][0].hypotheses[0].pendingNotes).toEqual(['B', 'A', 'C'])
  })

  it('空欄の仮説を Backspace で消すと、持ち主の課題へフォーカスが返る', () => {
    // `deleteHypothesis` は前の仮説が無いとき行き先に null を返す。
    // そのままだとフォーカスが宙に浮き、続けて打ったキーがどこにも入らない
    const base = file()
    render(<Harness initial={{ ...base, hypotheses: [{ ...base.hypotheses[0], text: '' }] }} />)
    expect(fireEvent.keyDown(openHypothesis(1), { key: 'Backspace' })).toBe(false)
    expect(screen.queryByRole('textbox', { name: '仮説1' })).toBeNull()
    expect(document.activeElement).toBe(issueCell(3))
  })

  it('由来の Enter は FB を生やす（移動先が無ければ作る）', () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
    openHypothesis(1)
    expect(
      fireEvent.keyDown(screen.getByRole('textbox', { name: '仮説1 の由来' }), { key: 'Enter' }),
    ).toBe(false)
    expect(onChange.mock.calls[0][0].hypotheses[0].pendingNotes).toEqual([''])
  })

  it('由来を空にして Backspace しても仮説は消えない（deletableField: false）', () => {
    const base = file()
    const onChange = vi.fn()
    render(
      <Harness
        initial={{ ...base, hypotheses: [{ ...base.hypotheses[0], rationale: '' }] }}
        onChange={onChange}
      />,
    )
    openHypothesis(1)
    fireEvent.keyDown(screen.getByRole('textbox', { name: '仮説1 の由来' }), { key: 'Backspace' })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: '仮説1' })).toBeTruthy()
  })
})

describe('IssueTreeEditor（展開の継ぎ目）', () => {
  /**
   * **畳まれた行の `<button>` と展開後の `<textarea>` は同じ `data-cell` を
   * 名乗る。** エディタは行に着いた瞬間に同じ鍵でフォーカスを予約し、展開後の
   * DOM でそれを当てる——**2つが同時に DOM にあると `querySelector` が先頭を
   * 掴み、予約が静かに外れる**（落ちるテストが他に無いので、ここで見る）
   */
  it('畳まれた行にフォーカスが入ると、同じ仮説の textarea へ移る', () => {
    render(<Harness initial={file()} />)
    const row = screen.getByRole('button', { name: '仮説1を開く' })
    act(() => {
      fireEvent.focus(row)
    })
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '仮説1' }))
    // ボタンは DOM から消えている（同じ鍵の要素が2つ残らない）
    expect(screen.queryByRole('button', { name: '仮説1を開く' })).toBeNull()
  })

  it('課題セルの Ctrl+Enter で生えた仮説は、展開された状態でフォーカスを受ける', () => {
    render(<Harness initial={file()} />)
    fireEvent.keyDown(issueCell(3), { key: 'Enter', ctrlKey: true })
    // 新しい仮説は配列の末尾（仮説2）。畳まれたままだと打つ場所が無い
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '仮説2' }))
  })

  it('展開しているのは同時に1つ（別の行を開くと前の行はボタンに戻る）', () => {
    const base = file()
    render(
      <Harness
        initial={{
          ...base,
          hypotheses: [
            base.hypotheses[0],
            { ...base.hypotheses[0], id: H(2), text: '受信を待つ作りに切り替える' },
          ],
        }}
      />,
    )
    openHypothesis(1)
    expect(screen.queryByRole('button', { name: '仮説1を開く' })).toBeNull()
    openHypothesis(2)
    // 前の行は畳まれて、詳細は1本ぶんだけ画面に出る
    expect(screen.getByRole('button', { name: '仮説1を開く' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '仮説1' })).toBeNull()
    expect(screen.getAllByRole('textbox', { name: /の由来$/ })).toHaveLength(1)
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
   * 開くと判断の節（バッジ＋「判断を変える」のトリガー）が現れる。畳まれた行が
   * 語を2つ運んだり、節が畳まれた行に漏れ出したりしないことは、いまも壊れうる
   */
  it('畳まれた行は判断の語を1つだけ運び、展開すると判断の節が出る', () => {
    const base = file()
    render(
      <Harness
        initial={{
          ...base,
          hypotheses: [{ ...base.hypotheses[0], events: [{ kind: 'rejected', note: '' }] }],
        }}
      />,
    )
    const row = screen.getByRole('button', { name: '仮説1を開く' })
    expect(row.textContent).toContain(BADGE_LABELS.no)
    // 畳まれた行に判断の節は出ない（「判断を変える」のトリガーは中の人）
    expect(row.textContent).not.toContain(JUDGEMENT_TRIGGER_LABELS.latest)
    expect(screen.getAllByText(EVENT_KIND_LABELS.rejected)).toHaveLength(1)

    openHypothesis(1)
    // **展開すると同じ語が2つ出る**——行末の俯瞰バッジと、判断の節のバッジ。
    // 5語に畳む前は後者だけが「検証せず棄却」で、2つは別の語だった
    expect(screen.getAllByText(EVENT_KIND_LABELS.rejected)).toHaveLength(2)
    expect(screen.getByRole('button', { name: '仮説1に判断を追加' }).textContent).toBe(
      JUDGEMENT_TRIGGER_LABELS.latest,
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
