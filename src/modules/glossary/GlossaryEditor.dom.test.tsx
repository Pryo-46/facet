// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
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
}) {
  const [data, setData] = useState(props.initial)
  return (
    <GlossaryEditor
      data={data}
      issues={[]}
      onChange={(next, mergeKey) => {
        setData(next)
        props.onChange(next, mergeKey)
      }}
    />
  )
}

function renderEditor(initial: GlossarySchemaVersion1) {
  const onChange = vi.fn()
  render(<Harness initial={initial} onChange={onChange} />)
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
    expect(screen.getAllByLabelText(/^名称/)).toHaveLength(2)
  })
})

describe('GlossaryEditor: 行の操作言語', () => {
  it('Enter で直後に行が増え、新しい行の名称セルにフォーカスが移る', () => {
    const { latest } = renderEditor(twoTerms)
    fireEvent.keyDown(screen.getByLabelText('名称（1行目）'), { key: 'Enter' })
    const names = screen.getAllByLabelText(/^名称/) as HTMLInputElement[]
    expect(names).toHaveLength(3)
    expect(names[1].value).toBe('新しい用語')
    expect(document.activeElement).toBe(names[1])
    // 新規行は kind=undecided / definition="" で warning が見える状態
    expect(latest()?.terms[1].kind).toBe('undecided')
    expect(latest()?.terms[1].id).toMatch(/^term_[A-Za-z0-9]{10}$/)
  })

  it('空の名称セルで Backspace すると行が消える', () => {
    renderEditor(twoTerms)
    const cell = screen.getByLabelText('名称（2行目）')
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(screen.getAllByLabelText(/^名称/)).toHaveLength(1)
  })

  it('空の定義セルで Backspace しても行は消えない（未定義は常態なので事故になる）', () => {
    renderEditor(twoTerms)
    const cell = screen.getByLabelText('定義（2行目）')
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(screen.getAllByLabelText(/^名称/)).toHaveLength(2)
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
    const names = screen.getAllByLabelText(/^名称/) as HTMLInputElement[]
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
})
