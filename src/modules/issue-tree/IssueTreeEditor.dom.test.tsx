// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { IssueTreeSchemaVersion1 } from '@/types/issue-tree'
import {
  EVENT_KIND_LABELS,
  poseQuestions,
  QUESTION_LABELS,
  SUPPRESSED_NOTE,
  tallyLine,
  tallyQuestions,
} from './derive'
import { IssueTreeEditor } from './IssueTreeEditor'

afterEach(cleanup)

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

/**
 * 課題3件（根→中間→葉）・仮説1件。**中間ノードが子を持っている形を選ぶ**
 *——葉の直後で足すと `Tab`（子課題）と `Enter`（兄弟課題）が同じ配列位置・
 * 同じラベルになり、写像を差し替えても緑のままになる（logic-tree M1 が踏んだ形）
 */
const file = (): IssueTreeSchemaVersion1 => ({
  schemaVersion: 1,
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
  initial: IssueTreeSchemaVersion1
  onChange?: (next: IssueTreeSchemaVersion1, mergeKey?: string | null) => void
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
 * 同じ接頭辞を持つ見送りのボタン（`課題{N}を見送る`）と区別するため
 */
const issueCell = (n: number): HTMLTextAreaElement =>
  screen.getByRole('textbox', { name: new RegExp(`^課題${n}(?![0-9])`) }) as HTMLTextAreaElement

const hypothesisCell = (n: number): HTMLTextAreaElement =>
  screen.getByRole('textbox', { name: `仮説${n}` }) as HTMLTextAreaElement

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
    const next: IssueTreeSchemaVersion1 = onChange.mock.calls[0][0]
    expect(next.hypotheses).toHaveLength(2)
    // 足したのは「押した課題」にぶら下がる仮説であること
    expect(next.hypotheses.filter((h) => h.issueId === I(3))).toHaveLength(2)
    // 課題は増えていない（Enter の兄弟追加と取り違えていない）
    expect(next.issues).toHaveLength(3)
  })

  it('仮説セルでは判断のドロップダウンを開く（仮説は増えない）', async () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
    expect(fireEvent.keyDown(hypothesisCell(1), { key: 'Enter', ctrlKey: true })).toBe(false)
    // **項目名は EVENT_KIND_LABELS から引く**（打ち直すと Skill の報告と食い違う）
    await screen.findByRole('menuitem', { name: EVENT_KIND_LABELS.supported })
    expect(screen.getAllByRole('menuitem')).toHaveLength(6)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('メモを最新イベントの根拠へ移す（イベント0件なら何も起きない）', () => {
    const base = file()
    const withNote: IssueTreeSchemaVersion1 = {
      ...base,
      hypotheses: [{ ...base.hypotheses[0], pendingNotes: ['再送の窓は何分か'] }],
    }
    const onChange = vi.fn()
    const { unmount } = render(<Harness initial={withNote} onChange={onChange} />)
    // イベントが0件なので移動先が無い＝データは動かない
    fireEvent.keyDown(screen.getByRole('textbox', { name: '仮説1 のメモ1' }), {
      key: 'Enter',
      ctrlKey: true,
    })
    expect(onChange).not.toHaveBeenCalled()
    unmount()

    const withEvent: IssueTreeSchemaVersion1 = {
      ...base,
      hypotheses: [
        { ...base.hypotheses[0], events: [{ kind: 'supported', note: '' }], pendingNotes: ['再送の窓は何分か'] },
      ],
    }
    const onMoved = vi.fn()
    render(<Harness initial={withEvent} onChange={onMoved} />)
    fireEvent.keyDown(screen.getByRole('textbox', { name: '仮説1 のメモ1' }), {
      key: 'Enter',
      ctrlKey: true,
    })
    const next: IssueTreeSchemaVersion1 = onMoved.mock.calls[0][0]
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
  it('祖先を見送りにすると、配下の問いのバッジが画面から消える', async () => {
    // `derive.ts` の抑制が描画まで繋がっていることを見る唯一の窓
    render(<Harness initial={file()} />)
    expect(screen.getByText(QUESTION_LABELS.result)).toBeTruthy()

    // 見送りは課題ノードのドロップダウンから付ける（Radix のトリガーは pointerdown で開く）
    fireEvent.pointerDown(screen.getByRole('button', { name: '課題1を見送る' }), { button: 0 })
    fireEvent.click(await screen.findByRole('menuitem', { name: EVENT_KIND_LABELS.deferred }))

    // 選んだ後は見送った課題のセルへフォーカスが戻る（`appendDeferral` の行き先）。
    // Radix の既定に予約を奪われるとトリガーのボタンに残る
    expect(document.activeElement).toBe(issueCell(1))
    expect(screen.queryByText(QUESTION_LABELS.result)).toBeNull()
    // 未決の集計も0になる（抑制された配下は勘定に入らない）
    expect(screen.getByText(tallyLine({ hypothesis: 0, result: 0, judgement: 0, total: 0 }))).toBeTruthy()
    // 「なぜここには問いが無いのか」は配下の課題2件に出る（課題1は自分の見送り行を持つ）
    expect(screen.getAllByText(SUPPRESSED_NOTE)).toHaveLength(2)
  })

  it('見送りイベントの行を種別ラベルと理由で描く', () => {
    // レイアウトはこの行のぶん縦を空けている。描かないと、見送った課題は
    // 「箱の下に理由の分だけ空白が空いたノード」になる
    const base = file()
    render(
      <Harness
        initial={{
          ...base,
          issues: base.issues.map((n, i) =>
            i === 0
              ? { ...n, events: [{ kind: 'deferredToMainDev', note: '本開発の設計と一緒に決める' }] }
              : n,
          ),
        }}
      />,
    )
    expect(screen.getByText(EVENT_KIND_LABELS.deferredToMainDev)).toBeTruthy()
    expect(screen.getByText('本開発の設計と一緒に決める')).toBeTruthy()
  })
})

describe('IssueTreeEditor（帯）', () => {
  it('未決の集計を tallyLine のまま出す', () => {
    // **文字列を打ち直さない**——アプリの画面と Skill の報告が同じ言葉を出す
    const data = file()
    render(<Harness initial={data} />)
    expect(screen.getByText(tallyLine(tallyQuestions(poseQuestions(data))))).toBeTruthy()
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
        initial={{ schemaVersion: 1, type: 'issueTree', title: 'テスト', issues: [], hypotheses: [] }}
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
    const next: IssueTreeSchemaVersion1 = onChange.mock.calls[0][0]
    expect(next.hypotheses).toHaveLength(2)
    expect(next.hypotheses.some((h) => h.issueId === I(1))).toBe(true)
  })
})

describe('IssueTreeEditor（仮説カードの操作）', () => {
  it('判断を選ぶとイベントが追記される（マウスの動線）', async () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
    fireEvent.pointerDown(screen.getByRole('button', { name: '仮説1に判断を追加' }), { button: 0 })
    fireEvent.click(await screen.findByRole('menuitem', { name: EVENT_KIND_LABELS.rejected }))
    const next: IssueTreeSchemaVersion1 = onChange.mock.calls[0][0]
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

  it('メモの Enter は押した位置の次に足す（末尾ではない）', () => {
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
    expect(
      fireEvent.keyDown(screen.getByRole('textbox', { name: '仮説1 のメモ2' }), { key: 'Enter' }),
    ).toBe(false)
    expect(onChange.mock.calls[0][0].hypotheses[0].pendingNotes).toEqual(['A', 'B', '', 'C'])
  })

  it('メモの Alt+↑ で並びが入れ替わる（写像が noteIndex と向きを正しく渡す）', () => {
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
    expect(
      fireEvent.keyDown(screen.getByRole('textbox', { name: '仮説1 のメモ2' }), {
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
    expect(fireEvent.keyDown(hypothesisCell(1), { key: 'Backspace' })).toBe(false)
    expect(screen.queryByRole('textbox', { name: '仮説1' })).toBeNull()
    expect(document.activeElement).toBe(issueCell(3))
  })

  it('由来の Enter はメモを生やす（移動先が無ければ作る）', () => {
    const onChange = vi.fn()
    render(<Harness initial={file()} onChange={onChange} />)
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
    fireEvent.keyDown(screen.getByRole('textbox', { name: '仮説1 の由来' }), { key: 'Backspace' })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: '仮説1' })).toBeTruthy()
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
    expect(issueCell(1).parentElement?.className).toContain('pointer-events-auto')
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
