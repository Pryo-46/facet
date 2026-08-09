// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ErrorCatalogSchemaVersion1, ErrorEntry } from '@/types/error-catalog'
import { errorColumnWidths, RESIZE_STEP } from './column-widths'
import { PROFILE_COLUMNS } from './columns'
import { ErrorCatalogEditor } from './ErrorCatalogEditor'

afterEach(cleanup)
beforeEach(() => {
  // モジュールスコープの store はテスト間で漏れる
  errorColumnWidths.support.reset()
  errorColumnWidths.dev.reset()
})

function entry(over: Partial<ErrorEntry> & { id: string; name: string }): ErrorEntry {
  return {
    occurrence: '',
    resolutionLevel: 'user',
    causeForSupport: '',
    causeForSpec: '',
    userAction: 'やり直す',
    supportAction: '',
    engineerAction: '',
    notes: '',
    ...over,
  }
}

function catalog(errors: ErrorEntry[]): ErrorCatalogSchemaVersion1 {
  return { schemaVersion: 1, type: 'errorCatalog', title: 'テストカタログ', errors }
}

/** 額縁の代わり。onChange を受けて data を差し替える最小の親 */
function Harness(props: {
  initial: ErrorCatalogSchemaVersion1
  onChange: (next: ErrorCatalogSchemaVersion1, mergeKey?: string | null) => void
  modalOpen?: boolean
}) {
  const [data, setData] = useState(props.initial)
  return (
    <ErrorCatalogEditor
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

function renderEditor(initial: ErrorCatalogSchemaVersion1, modalOpen = false) {
  const onChange = vi.fn()
  render(<Harness initial={initial} onChange={onChange} modalOpen={modalOpen} />)
  const latest = () => onChange.mock.calls.at(-1)?.[0] as ErrorCatalogSchemaVersion1 | undefined
  return { onChange, latest }
}

const twoErrors = catalog([
  entry({ id: 'error_AAAAAAAAAA', name: 'ログインできない' }),
  entry({ id: 'error_BBBBBBBBBB', name: '保存に失敗する', resolutionLevel: 'engineer' }),
])

describe('ErrorCatalogEditor: IME', () => {
  it('変換確定の Enter では行が増えない（日本語入力アプリ最大の地雷）', () => {
    renderEditor(twoErrors)
    const cell = screen.getByLabelText('エラー名（No.1）')
    fireEvent.compositionStart(cell)
    fireEvent.keyDown(cell, { key: 'Enter', isComposing: true })
    expect(screen.getAllByLabelText(/^エラー名（/)).toHaveLength(2)
  })
})

describe('ErrorCatalogEditor: 行の操作言語', () => {
  it('Enter で直後に行が増え、新しい行のエラー名セルにフォーカスが移る', () => {
    const { latest } = renderEditor(twoErrors)
    fireEvent.keyDown(screen.getByLabelText('エラー名（No.1）'), { key: 'Enter' })
    const names = screen.getAllByLabelText(/^エラー名（/) as HTMLInputElement[]
    expect(names).toHaveLength(3)
    expect(names[1].value).toBe('新しいエラー')
    expect(document.activeElement).toBe(names[1])
    // 既定名は全選択で渡す（打ち始めればそのまま置き換わる）
    expect(names[1].selectionStart).toBe(0)
    expect(names[1].selectionEnd).toBe(names[1].value.length)
    expect(latest()?.errors[1].resolutionLevel).toBe('undecided')
    expect(latest()?.errors[1].id).toMatch(/^error_[A-Za-z0-9]{10}$/)
  })

  it('空のエラー名セルで Backspace すると行が消える', () => {
    renderEditor(twoErrors)
    const cell = screen.getByLabelText('エラー名（No.2）')
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(screen.getAllByLabelText(/^エラー名（/)).toHaveLength(1)
  })

  it('空のユーザーの対応セルで Backspace しても行は消えない（空が常態なので事故になる）', () => {
    renderEditor(twoErrors)
    const cell = screen.getByLabelText('ユーザーの対応（No.2）')
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(screen.getAllByLabelText(/^エラー名（/)).toHaveLength(2)
  })

  it('Tab の移動先はプロファイルの列順（サポート向けでは原因（業務）の次がユーザーの対応）', () => {
    renderEditor(twoErrors)
    fireEvent.keyDown(screen.getByLabelText('原因（業務）（No.1）'), { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByLabelText('ユーザーの対応（No.1）'))
  })

  it('Alt+↑ で行が入れ替わる', () => {
    const { latest } = renderEditor(twoErrors)
    fireEvent.keyDown(screen.getByLabelText('エラー名（No.2）'), { key: 'ArrowUp', altKey: true })
    expect(latest()?.errors.map((e) => e.name)).toEqual(['保存に失敗する', 'ログインできない'])
  })

  it('検索中は Alt+↑↓ で並び替えできない（導出表示中の境界規則）', () => {
    const { onChange } = renderEditor(twoErrors)
    fireEvent.change(screen.getByLabelText('エラーを検索'), { target: { value: 'できない' } })
    onChange.mockClear()
    fireEvent.keyDown(screen.getByLabelText('エラー名（No.1）'), { key: 'ArrowUp', altKey: true })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('検索中の Enter では行が増えない（絞り込みに掛からない見えない行を作らない）', () => {
    const { onChange } = renderEditor(twoErrors)
    fireEvent.change(screen.getByLabelText('エラーを検索'), { target: { value: 'できない' } })
    onChange.mockClear()
    fireEvent.keyDown(screen.getByLabelText('エラー名（No.1）'), { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('最後の1行を消したら「エラーを追加」ボタンへフォーカスが移る', async () => {
    renderEditor(catalog([entry({ id: 'error_AAAAAAAAAA', name: 'ログインできない' })]))
    const cell = screen.getByRole('textbox', { name: 'エラー名（No.1）' }) as HTMLInputElement
    cell.focus()
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    const add = await screen.findByRole('button', { name: 'エラーを追加' })
    expect(document.activeElement).toBe(add)
  })
})

describe('ErrorCatalogEditor: No 列', () => {
  it('No はデータ配列の位置。絞り込んでも番号が動かない', () => {
    renderEditor(
      catalog([
        entry({ id: 'error_AAAAAAAAAA', name: 'ログインできない' }),
        entry({ id: 'error_BBBBBBBBBB', name: '保存に失敗する', resolutionLevel: 'engineer' }),
        entry({ id: 'error_CCCCCCCCCC', name: '印刷できない' }),
      ]),
    )
    fireEvent.change(screen.getByLabelText('エラーを検索'), { target: { value: '印刷' } })
    // 3件目だけが残る。表示位置は1行目だが No は 3 のまま
    const names = screen.getAllByLabelText(/^エラー名（/) as HTMLInputElement[]
    expect(names).toHaveLength(1)
    expect(names[0].getAttribute('aria-label')).toBe('エラー名（No.3）')
  })
})

describe('ErrorCatalogEditor: プロファイル', () => {
  it('既定はサポート向けで、仕様レベルの原因と備考の列を出さない', () => {
    renderEditor(twoErrors)
    expect(screen.getByRole('button', { name: 'サポート向け' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.queryByLabelText('原因（仕様）（No.1）')).toBeNull()
    expect(screen.queryByLabelText('備考（No.1）')).toBeNull()
  })

  it('開発向けに切り替えると仕様レベルの原因と備考が出る', () => {
    renderEditor(twoErrors)
    fireEvent.click(screen.getByRole('button', { name: '開発向け' }))
    expect(screen.getByLabelText('原因（仕様）（No.1）')).not.toBeNull()
    expect(screen.getByLabelText('備考（No.1）')).not.toBeNull()
    // サポート向けの列は消えない（開発向けは上位集合）
    expect(screen.getByLabelText('原因（業務）（No.1）')).not.toBeNull()
  })

  it('切り替えてもデータは変わらない（onChange を呼ばない）', () => {
    const { onChange } = renderEditor(twoErrors)
    onChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '開発向け' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('ErrorCatalogEditor: 表示とフィルタ', () => {
  it('解決レベルは日本語ラベルで表示する', () => {
    renderEditor(twoErrors)
    const select = screen.getByLabelText('解決レベル（No.1）') as HTMLSelectElement
    expect(select.value).toBe('user')
    expect(screen.getAllByRole('option', { name: 'ユーザー対応' }).length).toBeGreaterThan(0)
  })

  it('解決レベルのボタンで絞り込める', () => {
    renderEditor(twoErrors)
    fireEvent.click(screen.getByRole('button', { name: 'エンジニア対応' }))
    const names = screen.getAllByLabelText(/^エラー名（/) as HTMLInputElement[]
    expect(names.map((n) => n.value)).toEqual(['保存に失敗する'])
  })

  it('検索は原因も横断する', () => {
    renderEditor(
      catalog([
        entry({ id: 'error_AAAAAAAAAA', name: 'ログインできない', causeForSupport: '入力誤り' }),
        entry({ id: 'error_BBBBBBBBBB', name: '保存に失敗する' }),
      ]),
    )
    fireEvent.change(screen.getByLabelText('エラーを検索'), { target: { value: '入力誤り' } })
    const names = screen.getAllByLabelText(/^エラー名（/) as HTMLInputElement[]
    expect(names.map((n) => n.value)).toEqual(['ログインできない'])
  })
})

describe('ErrorCatalogEditor: エラーを追加ボタン', () => {
  it('押すと末尾に行が増える', () => {
    const { latest } = renderEditor(twoErrors)
    fireEvent.click(screen.getByRole('button', { name: 'エラーを追加' }))
    expect(latest()?.errors).toHaveLength(3)
    expect(latest()?.errors[2].name).toBe('新しいエラー')
    expect(latest()?.errors[0].name).toBe('ログインできない')
  })

  it('検索・フィルタ中は出さない（行の追加が無効な状態と揃える）', () => {
    renderEditor(twoErrors)
    fireEvent.change(screen.getByLabelText('エラーを検索'), { target: { value: 'できない' } })
    expect(screen.queryByRole('button', { name: 'エラーを追加' })).toBeNull()
  })
})

describe('ErrorCatalogEditor: 列幅', () => {
  it('→ で広げ、← で狭められる', () => {
    renderEditor(twoErrors)
    const handle = screen.getByRole('separator', { name: 'エラー名の列幅を変更' })
    const before = PROFILE_COLUMNS.support.defaultWidths[1]
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(errorColumnWidths.support.getSnapshot()[1]).toBe(before + RESIZE_STEP)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(errorColumnWidths.support.getSnapshot()[1]).toBe(before)
  })

  it('No 列にはハンドルを出さない（導出列なので幅を動かさない）', () => {
    renderEditor(twoErrors)
    expect(screen.queryByRole('separator', { name: 'Noの列幅を変更' })).toBeNull()
  })

  it('幅を持たない原因（業務）列にも、右隣を掴むハンドルが出る', () => {
    renderEditor(twoErrors)
    expect(screen.queryByRole('separator', { name: '原因（業務）の列幅を変更' })).not.toBeNull()
  })

  it('プロファイルごとに幅が独立している（列数が違うので1本では持てない）', () => {
    renderEditor(twoErrors)
    fireEvent.keyDown(screen.getByRole('separator', { name: 'エラー名の列幅を変更' }), {
      key: 'ArrowRight',
    })
    expect(errorColumnWidths.support.getSnapshot()[1]).not.toBe(
      PROFILE_COLUMNS.support.defaultWidths[1],
    )
    expect([...errorColumnWidths.dev.getSnapshot()]).toEqual([
      ...PROFILE_COLUMNS.dev.defaultWidths,
    ])
  })

  it('開発向けで広げてもサポート向けの幅は変わらない（ストアをプロファイルで引き分けている）', () => {
    renderEditor(twoErrors)
    fireEvent.click(screen.getByRole('button', { name: '開発向け' }))
    fireEvent.keyDown(screen.getByRole('separator', { name: 'エラー名の列幅を変更' }), {
      key: 'ArrowRight',
    })
    expect(errorColumnWidths.dev.getSnapshot()[1]).toBe(
      PROFILE_COLUMNS.dev.defaultWidths[1] + RESIZE_STEP,
    )
    expect([...errorColumnWidths.support.getSnapshot()]).toEqual([
      ...PROFILE_COLUMNS.support.defaultWidths,
    ])
  })

  it('エディタを作り直しても幅が残る（ファイル切替をまたぐ）', () => {
    renderEditor(twoErrors)
    fireEvent.keyDown(screen.getByRole('separator', { name: 'エラー名の列幅を変更' }), {
      key: 'ArrowRight',
    })
    const widened = errorColumnWidths.support.getSnapshot()[1]
    cleanup()
    renderEditor(twoErrors)
    expect(errorColumnWidths.support.getSnapshot()[1]).toBe(widened)
  })
})

describe('ErrorCatalogEditor: モーダル表示中', () => {
  it('Enter で行が増えない（キーはモーダル側が取る。rev 10章の境界規則）', () => {
    renderEditor(twoErrors, true)
    fireEvent.keyDown(screen.getByLabelText('エラー名（No.1）'), { key: 'Enter' })
    expect(screen.getAllByLabelText(/^エラー名（/)).toHaveLength(2)
  })
})
