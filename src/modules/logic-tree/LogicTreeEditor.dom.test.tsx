// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createHistory, record, undo as undoHistory } from '@/core/history'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { LogicTreeEditor } from './LogicTreeEditor'

afterEach(cleanup)

const ID = (n: number): string => `node_${String(n).padStart(10, 'a')}`

const file = (spec: [number, number | null, string][]): LogicTreeSchemaVersion1 => ({
  schemaVersion: 1,
  type: 'logicTree',
  title: 'テスト',
  nodes: spec.map(([id, parent, text]) => ({
    id: ID(id),
    parentId: parent === null ? null : ID(parent),
    text,
  })),
})

/**
 * 額縁と同じく、onChange を state に反映する殻を被せる。
 * `onChange` を渡すと、反映しつつ覗ける（構造の検査に使う——
 * 画面に出るラベルは配列位置なので、親子の付け替えを取り違えても同じに見える）
 */
function Harness({
  initial,
  onChange,
}: {
  initial: LogicTreeSchemaVersion1
  onChange?: (next: LogicTreeSchemaVersion1, mergeKey?: string | null) => void
}) {
  const [data, setData] = useState(initial)
  return (
    <LogicTreeEditor
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

describe('LogicTreeEditor（描画）', () => {
  it('ノードの文言を入力欄として出す', () => {
    render(<Harness initial={file([[1, null, '退会できない'], [2, 1, '導線が分からない']])} />)
    expect((screen.getByLabelText('ノード1') as HTMLTextAreaElement).value).toBe('退会できない')
    expect((screen.getByLabelText('ノード2') as HTMLTextAreaElement).value).toBe('導線が分からない')
  })

  it('文言を打つと onChange が呼ばれる', () => {
    const onChange = vi.fn()
    render(
      <LogicTreeEditor
        data={file([[1, null, '']])}
        onChange={onChange}
        issues={[]}
        modalOpen={false}
      />,
    )
    fireEvent.change(screen.getByLabelText('ノード1'), { target: { value: '退会できない' } })
    expect(onChange.mock.calls[0][0].nodes[0].text).toBe('退会できない')
    // 同じノードへの連続入力は1履歴にまとまってほしいのでキーを渡す
    expect(onChange.mock.calls[0][1]).toBe(`${ID(1)}#0:text`)
  })

  it('IME 変換中の入力は親へ上げない（未確定文字列の巻き戻りを防ぐ）', () => {
    const onChange = vi.fn()
    render(
      <LogicTreeEditor
        data={file([[1, null, '']])}
        onChange={onChange}
        issues={[]}
        modalOpen={false}
      />,
    )
    const el = screen.getByLabelText('ノード1')
    fireEvent.compositionStart(el)
    fireEvent.change(el, { target: { value: 'たいかい' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.compositionEnd(el, { target: { value: '退会' } })
    expect(onChange.mock.calls[0][0].nodes[0].text).toBe('退会')
  })

  it('ノード0件のときは「ノードを追加」を出し、押すとルートができてフォーカスが乗る', () => {
    render(<Harness initial={file([])} />)
    fireEvent.click(screen.getByRole('button', { name: 'ノードを追加' }))
    const node = screen.getByLabelText('ノード1')
    expect(node).toBeDefined()
    expect(document.activeElement).toBe(node)
  })

  it('ノードがあるときは「ノードを追加」を出さない', () => {
    render(<Harness initial={file([[1, null, 'x']])} />)
    expect(screen.queryByRole('button', { name: 'ノードを追加' })).toBe(null)
  })

  // 指摘の一覧を出すのは額縁（IssueBanner）で、エディタではない（rev 6章）。
  // ここに戻すと件数が増えるほど木の上部を覆う——それが M14 で直した欠陥
  it('整合性検証の指摘の一覧はエディタが出さない', () => {
    render(
      <LogicTreeEditor
        data={file([[1, null, 'x']])}
        onChange={() => {}}
        issues={[{ rule: 'multiple-root', message: 'ルートが2件あります', locations: [] }]}
        modalOpen={false}
      />,
    )
    expect(screen.queryByText('ルートが2件あります')).toBe(null)
  })

  it('親子の数だけエッジを描く', () => {
    // 「画面に木が出る」の枝の部分。ここにアサーションが無いと、
    // edgePath が壊れても walk が1本も push しなくても緑になる。
    //
    // **孫を持たせる。** 親と子だけの木だと walk の再帰呼び出しを消しても
    // 結果が変わらず、再帰が無検証のまま緑になる
    const { container } = render(
      <Harness
        initial={file([[1, null, '親'], [2, 1, '子A'], [3, 2, '孫'], [4, 1, '子B']])}
      />,
    )
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBe(3)
    for (const path of paths) {
      // 属性が空でないことまで見る。d="" でも要素は2つ数えられてしまう
      const d = path.getAttribute('d')
      expect(d).toMatch(/^M [\d.-]+ [\d.-]+ C /)
    }
  })

  it('葉しかない木にはエッジを描かない', () => {
    const { container } = render(<Harness initial={file([[1, null, '親']])} />)
    expect(container.querySelectorAll('path').length).toBe(0)
  })

  it('指摘の対象になったノードに無効の枠と淡い面を当てる', () => {
    render(
      <LogicTreeEditor
        data={file([[1, null, 'x'], [2, 1, 'y']])}
        onChange={() => {}}
        issues={[
          {
            rule: 'duplicate-id',
            message: 'ID が重複しています',
            locations: [{ entityId: ID(1), entityIndex: 0, field: 'text' }],
          },
        ]}
        modalOpen={false}
      />,
    )
    const target = screen.getByLabelText('ノード1')
    // 無効は `invalid` の枠＋淡い面（rev 9章 規約2。M21 の実機確認で、
    // 1px の枠だけでは方眼に埋もれて拾えないと判断して面を足した）
    expect(target.className).toContain('border-invalid')
    expect(target.className).toContain('bg-invalid-face')
    expect(target.className).not.toContain('border-rule')

    // 指摘の付いていないノードは通常の枠と面のまま。**面の側も見る**
    // ——枠だけ見ていると、淡い面を全ノードに撒いてしまっても緑になる
    const other = screen.getByLabelText('ノード2')
    expect(other.className).toContain('border-rule')
    expect(other.className).not.toContain('border-invalid')
    expect(other.className).not.toContain('bg-invalid-face')
  })

  it('ノードのレイヤは操作を通し、ノードの矩形だけが受ける', () => {
    // レイヤはツリー順で帯のボタンより上に来る透明な面なので、
    // pointer-events を切らないと中央のヒットテストを奪って
    // 「ノードを追加」が押せなくなる（jsdom はヒットテストを
    //  持たないため、クリックのテストではこの退行を検出できない）
    const { container } = render(<Harness initial={file([[1, null, 'x']])} />)
    const layer = container.querySelector('[data-layer="nodes"]')
    expect(layer?.className).toContain('pointer-events-none')
    const box = screen.getByLabelText('ノード1').parentElement
    expect(box?.className).toContain('pointer-events-auto')
  })

  it('jsdom でもビューポートの配線でクラッシュしない', () => {
    // d3-zoom はマウント時に listener を張るだけなので、レイアウトを持たない
    // 環境でも落ちてはいけない（ここが落ちると他の DOM テストが全部道連れになる）
    render(<Harness initial={file([[1, null, '親']])} />)
    expect(screen.getByLabelText('ノード1')).toBeDefined()
  })

  it('循環しているノードは図に出さない（位置を持たないので落ちない）', () => {
    // 1 は正常なルート、2 と 3 が互いを親にしている
    render(
      <Harness
        initial={{
          schemaVersion: 1,
          type: 'logicTree',
          title: 'テスト',
          nodes: [
            { id: ID(1), parentId: null, text: 'a' },
            { id: ID(2), parentId: ID(3), text: 'b' },
            { id: ID(3), parentId: ID(2), text: 'c' },
          ],
        }}
      />,
    )
    expect(screen.getByLabelText('ノード1')).toBeDefined()
    expect(screen.queryByLabelText('ノード2')).toBe(null)
  })
})

describe('LogicTreeEditor（キーボード操作）', () => {
  it('Enter で直後に兄弟を追加し、その入力欄にフォーカスが移る', () => {
    const onChange = vi.fn()
    render(<Harness initial={file([[1, null, '親'], [2, 1, '子']])} onChange={onChange} />)
    // **既定動作を止めること。** fireEvent は preventDefault されると false を返す
    //（GlossaryEditor.dom.test.tsx と同じ作法）。ノードは multiline の textarea
    // なので、止め損なうと「ノードが増えたうえに改行も入る」になる
    expect(fireEvent.keyDown(screen.getByLabelText('ノード2'), { key: 'Enter' })).toBe(false)
    const added = screen.getByLabelText('ノード3')
    expect((added as HTMLTextAreaElement).value).toBe('')
    expect(document.activeElement).toBe(added)
    // **親を見る。** 葉の直後に足す限り、兄弟でも子でも配列位置は同じになるので、
    // ラベルと値だけでは Tab（子追加）との取り違えを検出できない
    expect(onChange.mock.calls[0][0].nodes[2].parentId).toBe(ID(1))
  })

  it('IME 変換中の Enter ではノードが増えない（M1 の最重要要件）', () => {
    render(<Harness initial={file([[1, null, '親'], [2, 1, '']])} />)
    const el = screen.getByLabelText('ノード2')
    fireEvent.compositionStart(el)
    fireEvent.keyDown(el, { key: 'Enter', isComposing: true })
    expect(screen.queryByLabelText('ノード3')).toBe(null)
  })

  // WKWebView の実測: 確定の Enter は keyCode 229・isComposing false で来る。
  // 229 は IME が食った打鍵の予約値で、composition の記録に頼らず判別できる
  it('WKWebView の実測どおりの Enter（keyCode 229 / isComposing false）でもノードが増えない', () => {
    render(<Harness initial={file([[1, null, '親'], [2, 1, '']])} />)
    const el = screen.getByLabelText('ノード2')
    fireEvent.keyDown(el, { key: 'Enter', keyCode: 229 })
    expect(screen.queryByLabelText('ノード3')).toBe(null)
  })

  it('WebKit の順序（compositionend が先）でもノードが増えない', () => {
    render(<Harness initial={file([[1, null, '親'], [2, 1, '']])} />)
    const el = screen.getByLabelText('ノード2')
    fireEvent.compositionStart(el)
    fireEvent.compositionEnd(el, { target: { value: '退会' } })
    fireEvent.keyDown(el, { key: 'Enter' })
    expect(screen.queryByLabelText('ノード3')).toBe(null)
  })

  it('Shift+Enter / Alt+Enter はノード内の改行として既定動作に委ねる', () => {
    // 誰も消費しない＝ブラウザが改行を入れる（CellInput が約束している挙動）。
    // ノードの文言は複数行になり得るので、この経路が塞がると改行が打てなくなる
    render(<Harness initial={file([[1, null, '親'], [2, 1, '子']])} />)
    const el = screen.getByLabelText('ノード2')
    expect(fireEvent.keyDown(el, { key: 'Enter', shiftKey: true })).toBe(true)
    expect(screen.queryByLabelText('ノード3')).toBe(null)
    // Excel のセル内改行の手癖（Alt+Enter）も同じく既定動作に委ねる
    expect(fireEvent.keyDown(el, { key: 'Enter', altKey: true })).toBe(true)
    expect(screen.queryByLabelText('ノード3')).toBe(null)
  })

  it('ルートの上の Enter は子を作る（多重ルートを作らない）', () => {
    const onChange = vi.fn()
    render(<Harness initial={file([[1, null, '親']])} onChange={onChange} />)
    fireEvent.keyDown(screen.getByLabelText('ノード1'), { key: 'Enter' })
    expect(screen.getByLabelText('ノード2')).toBeDefined()
    expect(screen.queryByLabelText('ノード3')).toBe(null)
    // **ルートが増えていないことは親で見る。** 兄弟として足しても
    // ノードは2つのままなので、ラベルの数では区別が付かない
    const nodes = onChange.mock.calls[0][0].nodes
    expect(nodes[1].parentId).toBe(ID(1))
    expect(nodes.filter((n: { parentId: string | null }) => n.parentId === null)).toHaveLength(1)
  })

  it('Tab で子を追加する', () => {
    const onChange = vi.fn()
    render(<Harness initial={file([[1, null, '親'], [2, 1, '子']])} onChange={onChange} />)
    // 止め損なうと、新しいノードに移した直後に既定の Tab 送りでフォーカスが逃げる
    expect(fireEvent.keyDown(screen.getByLabelText('ノード2'), { key: 'Tab' })).toBe(false)
    expect(document.activeElement).toBe(screen.getByLabelText('ノード3'))
    // 追加されたのは「押した節の子」であること（Enter の兄弟追加と区別する）
    expect(onChange.mock.calls[0][0].nodes[2].parentId).toBe(ID(2))
  })

  it('空欄で Backspace すると部分木ごと消える', () => {
    render(<Harness initial={file([[1, null, '親'], [2, 1, ''], [3, 2, '孫']])} />)
    expect(fireEvent.keyDown(screen.getByLabelText('ノード2'), { key: 'Backspace' })).toBe(false)
    expect(screen.queryByLabelText('ノード2')).toBe(null)
    expect(screen.getByLabelText('ノード1')).toBeDefined()
  })

  it('文言が残っているノードは Backspace で消えない', () => {
    render(<Harness initial={file([[1, null, '親'], [2, 1, '子']])} />)
    fireEvent.keyDown(screen.getByLabelText('ノード2'), { key: 'Backspace' })
    expect(screen.getByLabelText('ノード2')).toBeDefined()
  })

  it('Alt+↑ で兄弟の順が入れ替わる', () => {
    render(<Harness initial={file([[1, null, '親'], [2, 1, 'A'], [3, 1, 'B']])} />)
    fireEvent.keyDown(screen.getByLabelText('ノード3'), { key: 'ArrowUp', altKey: true })
    expect((screen.getByLabelText('ノード2') as HTMLTextAreaElement).value).toBe('B')
    expect((screen.getByLabelText('ノード3') as HTMLTextAreaElement).value).toBe('A')
  })

  it('Alt+↓ で兄弟の順が入れ替わる', () => {
    // ↑ と向きが対称なだけに見えるが、**delta の符号は別々に写像している**ので
    // 片方だけでは反転を検出できない
    render(<Harness initial={file([[1, null, '親'], [2, 1, 'A'], [3, 1, 'B']])} />)
    fireEvent.keyDown(screen.getByLabelText('ノード2'), { key: 'ArrowDown', altKey: true })
    expect((screen.getByLabelText('ノード2') as HTMLTextAreaElement).value).toBe('B')
    expect((screen.getByLabelText('ノード3') as HTMLTextAreaElement).value).toBe('A')
  })

  it('端の兄弟を外へ動かそうとしても履歴を積まない（Undo の空振りを作らない）', () => {
    // 動かなかった編集は同じ参照を返す（commands.ts の契約）。それを
    // apply が早期 return で落とさないと、内容が同一のコミットが mergeKey: null で
    // 履歴に積まれ、**Undo が1回空振りする**
    const onChange = vi.fn()
    render(
      <Harness initial={file([[1, null, '親'], [2, 1, 'A'], [3, 1, 'B']])} onChange={onChange} />,
    )
    fireEvent.keyDown(screen.getByLabelText('ノード2'), { key: 'ArrowUp', altKey: true })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('↑ で前の兄弟へフォーカスが移る（先頭にいるときだけ）', () => {
    render(<Harness initial={file([[1, null, '親'], [2, 1, 'A'], [3, 1, 'B']])} />)
    const from = screen.getByLabelText('ノード3') as HTMLTextAreaElement
    from.focus()
    // 文中では欄の中の行移動なので、兄弟へは移らない
    from.setSelectionRange(1, 1)
    fireEvent.keyDown(from, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(from)

    from.setSelectionRange(0, 0)
    fireEvent.keyDown(from, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(screen.getByLabelText('ノード2'))
  })

  it('↓ で次の兄弟へフォーカスが移る（末尾にいるときだけ）', () => {
    // **キャレットは明示的に置く。** jsdom は初期選択位置を 0 にし、React は
    // 同じ値の再代入では動かさないので、文言があっても既定は先頭になる
    //（GlossaryEditor.dom.test.tsx と同じ作法）
    render(<Harness initial={file([[1, null, '親'], [2, 1, 'A'], [3, 1, 'B']])} />)
    const from = screen.getByLabelText('ノード2') as HTMLTextAreaElement
    from.focus()
    // 途中では欄の中の行移動なので、兄弟へは移らない
    from.setSelectionRange(0, 0)
    fireEvent.keyDown(from, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(from)

    from.setSelectionRange(1, 1)
    fireEvent.keyDown(from, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByLabelText('ノード3'))
  })

  it('← で親へ、→ で最初の子へ移る（キャレットが端にあるときだけ）', () => {
    render(<Harness initial={file([[1, null, '親'], [2, 1, 'A']])} />)
    const child = screen.getByLabelText('ノード2') as HTMLTextAreaElement
    child.focus()
    // **文中の ← は文字を戻るためのキー。** ここで親へ飛ぶと、
    // ノードの文言をカーソルで編集する手段が無くなる
    child.setSelectionRange(1, 1)
    fireEvent.keyDown(child, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(child)

    child.setSelectionRange(0, 0)
    fireEvent.keyDown(child, { key: 'ArrowLeft' })
    const parent = screen.getByLabelText('ノード1') as HTMLTextAreaElement
    expect(document.activeElement).toBe(parent)
    parent.setSelectionRange(parent.value.length, parent.value.length)
    fireEvent.keyDown(parent, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByLabelText('ノード2'))
  })

  it('Esc でフォーカスが外れる', () => {
    render(<Harness initial={file([[1, null, '親']])} />)
    const el = screen.getByLabelText('ノード1')
    el.focus()
    expect(fireEvent.keyDown(el, { key: 'Escape' })).toBe(false)
    expect(document.activeElement).not.toBe(el)
  })

  it('モーダルが開いている間は操作言語が止まる', () => {
    const onChange = vi.fn()
    render(
      <LogicTreeEditor
        data={file([[1, null, '親'], [2, 1, '子']])}
        onChange={onChange}
        issues={[]}
        modalOpen
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('ノード2'), { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('構造の変更は履歴をまとめない（1操作1コミット）', () => {
    const onChange = vi.fn()
    render(
      <LogicTreeEditor
        data={file([[1, null, '親'], [2, 1, '子']])}
        onChange={onChange}
        issues={[]}
        modalOpen={false}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('ノード2'), { key: 'Enter' })
    expect(onChange.mock.calls[0][1]).toBe(null)
  })

  it('Space の押下はキャンバスの操作に回るが、ノードの編集中は文字として通す', () => {
    // **ここを抜くとノードにスペースが打てなくなる**（入力欄は常に textarea）。
    // rev 10章の境界規則を、フックの単体ではなく実際の画面で見ておく
    const { container } = render(<Harness initial={file([[1, null, '親']])} />)
    const root = container.firstElementChild as HTMLElement
    const node = screen.getByLabelText('ノード1')
    node.focus()
    expect(fireEvent.keyDown(node, { code: 'Space', key: ' ' })).toBe(true)
    expect(root.className).not.toContain('cursor-grab')

    // 入力欄から外れていれば同じキーがパンの押下になる
    node.blur()
    expect(fireEvent.keyDown(window, { code: 'Space', key: ' ' })).toBe(false)
    expect(root.className).toContain('cursor-grab')
    fireEvent.keyUp(window, { code: 'Space', key: ' ' })
    expect(root.className).not.toContain('cursor-grab')
  })

  it('モーダルが開いている間はキャンバスの Space も止まる', () => {
    // 額縁のモーダルにフォーカスが渡っている間、window に張った Space の監視が
    // 生きていると**モーダルの中のボタンが Space で押せなくなる**（rev 10章）
    const { container } = render(
      <LogicTreeEditor data={file([[1, null, '親']])} onChange={() => {}} issues={[]} modalOpen />,
    )
    expect(fireEvent.keyDown(window, { code: 'Space', key: ' ' })).toBe(true)
    expect((container.firstElementChild as HTMLElement).className).not.toContain('cursor-grab')
  })

  it('新しいノードへのフォーカスでコンテナをスクロールさせない', () => {
    // 根の div は overflow-hidden（＝プログラム的にはスクロールできる）。
    // 画面外の要素に focus すると**ブラウザが祖先の scrollLeft/scrollTop を
    // 動かす**が、位置は transform で持っており panIntoView はスクロール量を
    // 見ていないので、追従と二重に動いて以後ずれ続ける。
    // **jsdom はスクロールを持たないので、渡した引数までしか見られない**
    //（実際にずれないことは実機確認で見る）
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus')
    render(<Harness initial={file([[1, null, '親']])} />)
    fireEvent.keyDown(screen.getByLabelText('ノード1'), { key: 'Tab' })
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    focus.mockRestore()
  })

  it('矢印キーでのフォーカス移動でもコンテナをスクロールさせない', () => {
    // I-1: pendingFocus の effect と同じ機構が、矢印キーの移動
    // （focus-prev / focus-next / focus-parent / focus-child）にも要る。
    // overflow-hidden にはスクロールバーが無いので、一度ずれると UI から戻す手段が無い
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus')
    render(<Harness initial={file([[1, null, '親'], [2, 1, '子']])} />)
    fireEvent.keyDown(screen.getByLabelText('ノード2'), { key: 'ArrowLeft' })
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    focus.mockRestore()
  })

  it('キーボードで足したノードが画面の外なら、見えるところまで視点が動く', () => {
    // 打った直後のノードが画面外だと、何を打っているか見えないまま入力に
    // なる。**ここは配線の検査**——寄せ方そのものは viewport.test.ts が見る
    const { container } = render(<Harness initial={file([[1, null, '親']])} />)
    const root = container.firstElementChild as HTMLElement
    // jsdom は寸法を持たない。狭いキャンバスを差し込む（子は x=144 に出る）
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 200 })
    Object.defineProperty(root, 'clientHeight', { configurable: true, value: 100 })
    const layer = container.querySelector('[data-layer="nodes"]') as HTMLElement
    expect(layer.style.transform).toBe('translate(40px, 40px) scale(1)')

    fireEvent.keyDown(screen.getByLabelText('ノード1'), { key: 'Tab' })
    // 追従したので左へ寄っている（倍率は変わらない）
    const moved = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(
      layer.style.transform,
    )
    expect(moved).not.toBe(null)
    expect(Number(moved?.[1])).toBeLessThan(0)
    expect(Number(moved?.[3])).toBe(1)
    // 3レイヤは同じ transform を共有する（ズレるとエッジがノードから外れる）
    const background = container.querySelector('[data-layer="background"]') as HTMLElement
    expect(background.style.transform).toBe(layer.style.transform)
  })

  it('Undo で戻した内容が表示に反映される', () => {
    // 額縁と同じ経路（履歴の present を data に流す）を張る
    function UndoHarness() {
      const [history, setHistory] = useState(() => createHistory(file([[1, null, '親']])))
      return (
        <div>
          <button type="button" onClick={() => setHistory((h) => undoHistory(h))}>
            元に戻す
          </button>
          <LogicTreeEditor
            data={history.present}
            onChange={(next) => setHistory((h) => record(h, next, null, Date.now()))}
            issues={[]}
            modalOpen={false}
          />
        </div>
      )
    }
    render(<UndoHarness />)
    fireEvent.keyDown(screen.getByLabelText('ノード1'), { key: 'Tab' })
    expect(screen.getByLabelText('ノード2')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }))
    expect(screen.queryByLabelText('ノード2')).toBe(null)
  })
})

describe('額縁の帯', () => {
  // ファイル名を出すのは額縁（FileHeader）で、エディタではない（rev 6章）。
  // ここに戻すと帯と二重になる
  it('ファイル名はエディタが出さない', () => {
    const data = file([[1, null, '退会できない']])
    render(<Harness initial={{ ...data, title: '退会の導線' }} />)
    expect(screen.queryByRole('heading', { name: '退会の導線' })).toBe(null)
  })

  it('操作ヒントを常時出す', () => {
    // KeyHints は各項目を <span> で包み、キー部分をさらに <span class="text-ink"> で
    // 入れ子にする。getByText の既定マッチャーは直下のテキストノードしか見ないため
    // 拾えない（子要素のテキストが無視される）。要素の textContent 全体で問い合わせる
    render(<Harness initial={file([[1, null, '退会できない']])} />)
    const hintSpan = (text: string) =>
      screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === text)
    expect(hintSpan('Enter: 兄弟を追加')).toBeDefined()
    expect(hintSpan('Tab: 子を追加')).toBeDefined()
    expect(hintSpan('←→: 親子移動')).toBeDefined()
    // $alt は KeyHints が解決する。jsdom は mac 判定にならないので Alt になる
    expect(hintSpan('Alt+↑↓: 並び替え')).toBeDefined()
  })
})
