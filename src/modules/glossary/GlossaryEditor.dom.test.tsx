// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createHistory, record, redo as redoHistory, undo as undoHistory } from '@/core/history'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import { glossaryColumnWidths, RESIZE_STEP } from './column-widths'
import { DEFAULT_WIDTHS } from './columns'
import { GlossaryEditor } from './GlossaryEditor'

afterEach(cleanup)

function term(over: Partial<Term> & { id: string; name: string }): Term {
  return { kind: 'other', definition: '定義あり', aliases: [], notes: '', ...over }
}

function glossary(terms: Term[]): GlossarySchemaVersion1 {
  return { schemaVersion: 1, type: 'glossary', title: 'テスト用語集', terms }
}

/** 額縁の代わり。onChange を受けて data を差し替える最小の親 */
function Harness(props: {
  initial: GlossarySchemaVersion1
  onChange: (next: GlossarySchemaVersion1, mergeKey?: string | null) => void
  modalOpen?: boolean
}) {
  const [data, setData] = useState(props.initial)
  return (
    <GlossaryEditor
      data={data}
      issues={[]}
      modalOpen={props.modalOpen ?? false}
      onChange={(next, mergeKey) => {
        setData(next)
        props.onChange(next, mergeKey)
      }}
    />
  )
}

function renderEditor(initial: GlossarySchemaVersion1, modalOpen = false) {
  const onChange = vi.fn()
  render(<Harness initial={initial} onChange={onChange} modalOpen={modalOpen} />)
  const latest = () => onChange.mock.calls.at(-1)?.[0] as GlossarySchemaVersion1 | undefined
  return { onChange, latest }
}

const twoTerms = glossary([
  term({ id: 'term_aaaaaaaaaa', name: '受注' }),
  term({ id: 'term_bbbbbbbbbb', name: '発注' }),
])

describe('GlossaryEditor: IME', () => {
  it('変換確定の Enter では行が増えない（日本語入力アプリ最大の地雷）', () => {
    renderEditor(twoTerms)
    const cell = screen.getByLabelText('名称（1行目）')
    fireEvent.compositionStart(cell)
    fireEvent.keyDown(cell, { key: 'Enter', isComposing: true })
    expect(screen.getAllByLabelText(/^名称（/)).toHaveLength(2)
  })
})

describe('GlossaryEditor: 行の操作言語', () => {
  it('Enter で直後に行が増え、新しい行の名称セルにフォーカスが移る', () => {
    const { latest } = renderEditor(twoTerms)
    fireEvent.keyDown(screen.getByLabelText('名称（1行目）'), { key: 'Enter' })
    const names = screen.getAllByLabelText(/^名称（/) as HTMLInputElement[]
    expect(names).toHaveLength(3)
    expect(names[1].value).toBe('新しい用語')
    expect(document.activeElement).toBe(names[1])
    // 既定名は全選択で渡す（打ち始めればそのまま置き換わる）
    expect(names[1].selectionStart).toBe(0)
    expect(names[1].selectionEnd).toBe(names[1].value.length)
    // 新規行は kind=undecided / definition="" で warning が見える状態
    expect(latest()?.terms[1].kind).toBe('undecided')
    expect(latest()?.terms[1].id).toMatch(/^term_[A-Za-z0-9]{10}$/)
  })

  it('空の名称セルで Backspace すると行が消える', () => {
    renderEditor(twoTerms)
    const cell = screen.getByLabelText('名称（2行目）')
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(screen.getAllByLabelText(/^名称（/)).toHaveLength(1)
  })

  it('空の定義セルで Backspace しても行は消えない（未定義は常態なので事故になる）', () => {
    renderEditor(twoTerms)
    const cell = screen.getByLabelText('定義（2行目）')
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(screen.getAllByLabelText(/^名称（/)).toHaveLength(2)
  })

  it('Tab で右のセルへ移る', () => {
    renderEditor(twoTerms)
    fireEvent.keyDown(screen.getByLabelText('名称（1行目）'), { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByLabelText('種別（1行目）'))
  })

  it('セル先頭での↑で上の行へ、途中では移らない', () => {
    renderEditor(twoTerms)
    const second = screen.getByLabelText('名称（2行目）') as HTMLInputElement
    second.setSelectionRange(0, 0)
    fireEvent.keyDown(second, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(screen.getByLabelText('名称（1行目）'))

    const first = screen.getByLabelText('名称（1行目）') as HTMLInputElement
    first.setSelectionRange(1, 1)
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(first)
  })

  it('Alt+↑ で行が入れ替わる', () => {
    const { latest } = renderEditor(twoTerms)
    fireEvent.keyDown(screen.getByLabelText('名称（2行目）'), { key: 'ArrowUp', altKey: true })
    expect(latest()?.terms.map((t) => t.name)).toEqual(['発注', '受注'])
  })

  it('検索中は Alt+↑↓ で並び替えできない（導出表示中の境界規則）', () => {
    const { onChange } = renderEditor(twoTerms)
    fireEvent.change(screen.getByLabelText('用語を検索'), { target: { value: '注' } })
    onChange.mockClear()
    fireEvent.keyDown(screen.getByLabelText('名称（2行目）'), { key: 'ArrowUp', altKey: true })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('検索中の Enter では行が増えない（絞り込みに掛からない見えない行を作らない）', () => {
    const { onChange } = renderEditor(twoTerms)
    fireEvent.change(screen.getByLabelText('用語を検索'), { target: { value: '受' } })
    onChange.mockClear()
    fireEvent.keyDown(screen.getByLabelText('名称（1行目）'), { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getAllByLabelText(/^名称（/)).toHaveLength(1)
    expect(screen.getByText(/行の追加（Enter）/)).toBeTruthy()
  })

  it('導出表示中は空の状態の「用語を追加」ボタンを出さない（行追加を止めるのと揃える）', () => {
    renderEditor(glossary([]))
    expect(screen.getByText('用語を追加')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'その他' }))
    expect(screen.queryByText('用語を追加')).toBeNull()
  })

  it('先頭行を削除するとフォーカスが新しい先頭行へ移る（body に落ちない）', () => {
    renderEditor(twoTerms)
    const cell = screen.getByLabelText('名称（1行目）')
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    const names = screen.getAllByLabelText(/^名称（/) as HTMLInputElement[]
    expect(names).toHaveLength(1)
    expect(document.activeElement).toBe(names[0])
  })

  it('定義セルの Enter は行追加として消費される（改行にしない）', () => {
    renderEditor(twoTerms)
    const cell = screen.getByLabelText('定義（1行目）')
    // fireEvent は preventDefault されると false を返す
    expect(fireEvent.keyDown(cell, { key: 'Enter' })).toBe(false)
    expect(screen.getAllByLabelText(/^名称（/)).toHaveLength(3)
  })

  it('定義セルの Shift+Enter は既定動作に委ねる（セル内改行。M8 決定6）', () => {
    renderEditor(twoTerms)
    const cell = screen.getByLabelText('定義（1行目）')
    // 止めない＝ブラウザが改行を入れる。行は増えない
    expect(fireEvent.keyDown(cell, { key: 'Enter', shiftKey: true })).toBe(true)
    expect(screen.getAllByLabelText(/^名称（/)).toHaveLength(2)
  })

  it('定義セルの Alt+Enter も既定動作に委ねる（Excel のセル内改行の手癖）', () => {
    renderEditor(twoTerms)
    const cell = screen.getByLabelText('定義（1行目）')
    expect(fireEvent.keyDown(cell, { key: 'Enter', altKey: true })).toBe(true)
    expect(screen.getAllByLabelText(/^名称（/)).toHaveLength(2)
  })
})

describe('GlossaryEditor: 表示', () => {
  it('種別セルは日本語ラベルで表示する', () => {
    renderEditor(glossary([term({ id: 'term_aaaaaaaaaa', name: '受注', kind: 'undecided' })]))
    const select = screen.getByLabelText('種別（1行目）') as HTMLSelectElement
    expect(select.selectedOptions[0].textContent).toBe('未分類')
  })

  it('検索は別名も横断する', () => {
    renderEditor(
      glossary([
        term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: ['オーダー'] }),
        term({ id: 'term_bbbbbbbbbb', name: '担当者' }),
      ]),
    )
    fireEvent.change(screen.getByLabelText('用語を検索'), { target: { value: 'オーダー' } })
    const names = screen.getAllByLabelText(/^名称（/) as HTMLInputElement[]
    expect(names.map((el) => el.value)).toEqual(['受注'])
  })
})

describe('GlossaryEditor: 別名パネル', () => {
  it('セルにフォーカスするとパネルが開き、Enter で別名が増える', () => {
    const { latest } = renderEditor(glossary([term({ id: 'term_aaaaaaaaaa', name: '受注' })]))
    fireEvent.focus(screen.getByLabelText('別名（1行目）'))
    const first = screen.getByLabelText('別名1')
    expect(document.activeElement).toBe(first)

    fireEvent.change(first, { target: { value: 'オーダー' } })
    fireEvent.keyDown(first, { key: 'Enter' })
    fireEvent.change(screen.getByLabelText('別名2'), { target: { value: '受注書' } })
    expect(latest()?.terms[0].aliases).toEqual(['オーダー', '受注書'])
  })

  it('空欄 Backspace で別名を1件だけ消せる', () => {
    const { latest } = renderEditor(
      glossary([term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: ['オーダー', '受注書'] })]),
    )
    fireEvent.focus(screen.getByLabelText('別名（1行目）'))
    const second = screen.getByLabelText('別名2')
    fireEvent.change(second, { target: { value: '' } })
    fireEvent.keyDown(second, { key: 'Backspace' })
    expect(latest()?.terms[0].aliases).toEqual(['オーダー'])
  })

  it('改行を含む貼り付けは複数の別名に分割される', () => {
    const { latest } = renderEditor(glossary([term({ id: 'term_aaaaaaaaaa', name: '受注' })]))
    fireEvent.focus(screen.getByLabelText('別名（1行目）'))
    fireEvent.paste(screen.getByLabelText('別名1'), {
      clipboardData: { getData: () => 'オーダー\n受注書\n注文' },
    })
    expect(latest()?.terms[0].aliases).toEqual(['オーダー', '受注書', '注文'])
  })

  it('パネル末尾での↓は下の行の別名セルへ抜ける（別名列だけ縦移動が途切れない）', () => {
    renderEditor(twoTerms)
    fireEvent.focus(screen.getByLabelText('別名（1行目）'))
    fireEvent.keyDown(screen.getByLabelText('別名1'), { key: 'ArrowDown' })
    // 下の行の別名セルにフォーカスが移ると onFocus でそのパネルが開く
    expect(document.activeElement).toBe(screen.getByLabelText('別名1'))
    expect(screen.queryByLabelText('別名（2行目）')).toBeNull()
    expect(screen.getByLabelText('別名（1行目）')).toBeTruthy()
  })

  it('移動先が無い端では↑でパネルを閉じない（フォーカスが body に落ちない）', () => {
    renderEditor(glossary([term({ id: 'term_aaaaaaaaaa', name: '受注' })]))
    fireEvent.focus(screen.getByLabelText('別名（1行目）'))
    const input = screen.getByLabelText('別名1')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    // 閉じてしまうと入力欄がアンマウントされ、activeElement が body になる
    expect(document.activeElement).toBe(screen.getByLabelText('別名1'))
    expect(document.activeElement).not.toBe(document.body)
  })
})

/** 実際の履歴を持つ親。App の Undo/Redo 配線と同じ形にする */
function HistoryHarness({ initial }: { initial: GlossarySchemaVersion1 }) {
  const [history, setHistory] = useState(() => createHistory<GlossarySchemaVersion1>(initial))
  return (
    <div>
      <button type="button" onClick={() => setHistory((h) => undoHistory(h))}>
        元に戻す
      </button>
      <button type="button" onClick={() => setHistory((h) => redoHistory(h))}>
        やり直す
      </button>
      <GlossaryEditor
        data={history.present}
        issues={[]}
        modalOpen={false}
        onChange={(next, mergeKey) =>
          setHistory((h) => record(h, next, mergeKey ?? null, Date.now()))
        }
      />
    </div>
  )
}

describe('GlossaryEditor: 履歴との継ぎ目', () => {
  it('別名パネルを開いたまま Undo→Redo しても、パネルの表示がデータに追従する', () => {
    render(<HistoryHarness initial={glossary([term({ id: 'term_aaaaaaaaaa', name: '受注' })])} />)
    fireEvent.focus(screen.getByLabelText('別名（1行目）'))
    const input = screen.getByLabelText('別名1') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'オーダー' } })

    fireEvent.click(screen.getByText('元に戻す'))
    expect((screen.getByLabelText('別名1') as HTMLInputElement).value).toBe('')

    fireEvent.click(screen.getByText('やり直す'))
    // 参照比較のままだと、Redo は apply 済みの配列をそのまま戻すので
    // 下書きが再構築されず、ここが空のままになる（表示とデータの乖離）
    expect((screen.getByLabelText('別名1') as HTMLInputElement).value).toBe('オーダー')
  })

  it('別名の連続入力は1履歴にまとまり、空行の追加は履歴を積まない', () => {
    render(<HistoryHarness initial={glossary([term({ id: 'term_aaaaaaaaaa', name: '受注' })])} />)
    fireEvent.focus(screen.getByLabelText('別名（1行目）'))
    const input = screen.getByLabelText('別名1')
    for (const v of ['オ', 'オー', 'オーダー']) fireEvent.change(input, { target: { value: v } })
    // 空行の追加は cleaned が変わらないので履歴を積まない
    fireEvent.keyDown(screen.getByLabelText('別名1'), { key: 'Enter' })

    fireEvent.click(screen.getByText('元に戻す'))
    const inputs = screen.getAllByLabelText(/^別名\d/) as HTMLInputElement[]
    expect(inputs.map((el) => el.value)).toEqual([''])
  })
})

/** 外部変更の取り込みと同じ形の親：data を丸ごと別のオブジェクトに差し替える */
function ImportHarness({ initial, imported }: {
  initial: GlossarySchemaVersion1
  imported: GlossarySchemaVersion1
}) {
  const [data, setData] = useState(initial)
  return (
    <div>
      <button type="button" onClick={() => setData(imported)}>
        外部変更を取り込む
      </button>
      {/* App は key={selected.path} なので、同じパスへの取り込みでは
          エディタは再マウントされない（＝ローカル下書きが残る） */}
      <GlossaryEditor data={data} issues={[]} modalOpen={false} onChange={setData} />
    </div>
  )
}

describe('GlossaryEditor: 外部変更の取り込みとの継ぎ目', () => {
  it('別名パネルを開いたまま取り込みが来ても、パネルの表示がディスクの内容に追随する', () => {
    render(
      <ImportHarness
        initial={glossary([term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: ['オーダー'] })])}
        imported={glossary([term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: ['注文'] })])}
      />,
    )
    fireEvent.focus(screen.getByLabelText('別名（1行目）'))
    expect((screen.getByLabelText('別名1') as HTMLInputElement).value).toBe('オーダー')

    fireEvent.click(screen.getByText('外部変更を取り込む'))
    // ここが古いまま残ると、次の打鍵で取り込んだ内容が消える
    //（参照比較の事故と同じ壊れ方。M3 の申し送り）
    expect((screen.getByLabelText('別名1') as HTMLInputElement).value).toBe('注文')
  })

  it('取り込みで別名が消えた場合も表示が空になる', () => {
    render(
      <ImportHarness
        initial={glossary([term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: ['オーダー'] })])}
        imported={glossary([term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: [] })])}
      />,
    )
    fireEvent.focus(screen.getByLabelText('別名（1行目）'))
    fireEvent.click(screen.getByText('外部変更を取り込む'))
    const inputs = screen.getAllByLabelText(/^別名\d/) as HTMLInputElement[]
    expect(inputs.map((el) => el.value)).toEqual([''])
  })
})

describe('用語0件の空状態', () => {
  it('最後の1行を消したら「用語を追加」ボタンへフォーカスが移る', async () => {
    renderEditor(glossary([term({ id: 'term_AAAAAAAAAA', name: '受注' })]))
    const cell = screen.getByRole('textbox', { name: '名称（1行目）' }) as HTMLInputElement
    cell.focus()
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    const add = await screen.findByRole('button', { name: '用語を追加' })
    expect(document.activeElement).toBe(add)
  })

  it('検索中に最後の1行を消しても絞り込みが解けてボタンが出る', async () => {
    renderEditor(glossary([term({ id: 'term_AAAAAAAAAA', name: '受注' })]))
    fireEvent.change(screen.getByRole('searchbox', { name: '用語を検索' }), {
      target: { value: '受注' },
    })
    const cell = screen.getByRole('textbox', { name: '名称（1行目）' }) as HTMLInputElement
    cell.focus()
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    const add = await screen.findByRole('button', { name: '用語を追加' })
    expect(document.activeElement).toBe(add)
  })
})

describe('モーダル表示中', () => {
  it('Enter で行が増えない（キーはモーダル側が取る。rev 10章の境界規則）', () => {
    const { latest } = renderEditor(glossary([term({ id: 'term_AAAAAAAAAA', name: '受注' })]), true)
    const cell = screen.getByRole('textbox', { name: '名称（1行目）' })
    fireEvent.keyDown(cell, { key: 'Enter' })
    expect(latest()).toBeUndefined()
  })

  it('空欄 Backspace でも行が消えない', () => {
    const { latest } = renderEditor(glossary([term({ id: 'term_AAAAAAAAAA', name: '受注' })]), true)
    const cell = screen.getByRole('textbox', { name: '名称（1行目）' }) as HTMLInputElement
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(latest()?.terms.length ?? 1).toBe(1)
  })
})

describe('GlossaryEditor: 列幅', () => {
  // モジュールスコープの store はテスト間で漏れる
  beforeEach(() => glossaryColumnWidths.reset())

  it('→ で広げ、← で狭められる', () => {
    renderEditor(twoTerms)
    const handle = screen.getByRole('separator', { name: '名称の列幅を変更' })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(glossaryColumnWidths.getSnapshot()[0]).toBe(DEFAULT_WIDTHS[0] + RESIZE_STEP)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(glossaryColumnWidths.getSnapshot()[0]).toBe(DEFAULT_WIDTHS[0])
  })

  it('Home でその列だけ既定へ戻る', () => {
    renderEditor(twoTerms)
    const name = screen.getByRole('separator', { name: '名称の列幅を変更' })
    const notes = screen.getByRole('separator', { name: '備考の列幅を変更' })
    fireEvent.keyDown(name, { key: 'ArrowRight' })
    fireEvent.keyDown(notes, { key: 'ArrowRight' })
    fireEvent.keyDown(name, { key: 'Home' })
    expect(glossaryColumnWidths.getSnapshot()[0]).toBe(DEFAULT_WIDTHS[0])
    // 他の列は戻さない
    expect(glossaryColumnWidths.getSnapshot()[3]).toBe(DEFAULT_WIDTHS[3] + RESIZE_STEP)
  })

  it('幅を持たない定義列にも、右隣の別名列を掴むハンドルが出る（定義｜別名の境界）', () => {
    renderEditor(twoTerms)
    expect(screen.queryByRole('separator', { name: '定義の列幅を変更' })).not.toBeNull()
  })

  it('定義列のハンドルを → で操作すると、別名列が狭まる（反転）', () => {
    renderEditor(twoTerms)
    const handle = screen.getByRole('separator', { name: '定義の列幅を変更' })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    // widths は固定幅4列を並び順で持つ（名称・種別・別名・備考）。
    // 定義列右端のハンドルが掴むのは右隣の別名列の幅なので、そこが変わる
    expect(glossaryColumnWidths.getSnapshot()[2]).toBe(DEFAULT_WIDTHS[2] - RESIZE_STEP)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(glossaryColumnWidths.getSnapshot()[2]).toBe(DEFAULT_WIDTHS[2])
  })

  it('エディタを作り直しても幅が残る（ファイル切替をまたぐ）', () => {
    renderEditor(twoTerms)
    fireEvent.keyDown(screen.getByRole('separator', { name: '名称の列幅を変更' }), {
      key: 'ArrowRight',
    })
    const widened = glossaryColumnWidths.getSnapshot()[0]
    // App は key={selected.path} でエディタを作り直す。それを再現する
    cleanup()
    renderEditor(twoTerms)
    expect(glossaryColumnWidths.getSnapshot()[0]).toBe(widened)
  })
})
