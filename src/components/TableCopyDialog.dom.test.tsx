// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { tableCopyPrefs } from '@/core/table-copy-options'
import { TableCopyDialog } from './TableCopyDialog'

afterEach(cleanup)
beforeEach(() => tableCopyPrefs.reset())

const base = {
  open: true,
  warning: null,
  options: ['numbering', 'showUndefined'] as const,
  variants: [{ id: 'default', label: '用語集' }],
  onCopy: vi.fn(),
  onCancel: vi.fn(),
}

describe('TableCopyDialog: 出す項目', () => {
  it('宣言した設定だけを出す（用語集に階層番号の選択は出ない）', () => {
    render(<TableCopyDialog {...base} onCopy={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'No 列を付ける' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: '未記入を（未定義）と出す' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: '階層番号（1_1_1）' })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: '親の文言を毎行くり返す' })).toBeNull()
  })

  it('読み手が1本なら選択を出さない（選択肢が1つの選択は何も選ばせない）', () => {
    render(<TableCopyDialog {...base} onCopy={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('group', { name: '読み手' })).toBeNull()
  })

  it('読み手が2本なら選択を出す', () => {
    render(
      <TableCopyDialog
        {...base}
        variants={[{ id: 'support', label: 'サポート向け' }, { id: 'dev', label: '開発向け' }]}
        onCopy={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('group', { name: '読み手' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '開発向け' })).toBeTruthy()
  })

  it('警告は渡されたときだけ出す', () => {
    const { rerender } = render(<TableCopyDialog {...base} onCopy={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('alert')).toBeNull()
    rerender(
      <TableCopyDialog {...base} warning="整合性エラーが 2 件あります。" onCopy={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByRole('alert').textContent).toContain('整合性エラーが 2 件あります。')
  })
})

describe('TableCopyDialog: No 列と形式の連動', () => {
  const withStyle = {
    ...base,
    options: ['numbering', 'numberStyle', 'repeatParent', 'showUndefined'] as const,
  }

  it('No 列オフなら形式のラジオが不活性になる（選ばせても効かない設定を押させない）', () => {
    render(<TableCopyDialog {...withStyle} onCopy={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'No 列を付ける' }))
    expect(screen.getByRole('radio', { name: '階層番号（1_1_1）' })).toHaveProperty('disabled', true)
  })
})

describe('TableCopyDialog: コピーと記憶', () => {
  it('選んだ設定と読み手で onCopy を呼ぶ', () => {
    const onCopy = vi.fn()
    render(
      <TableCopyDialog
        {...base}
        options={['numbering', 'showUndefined']}
        variants={[{ id: 'support', label: 'サポート向け' }, { id: 'dev', label: '開発向け' }]}
        onCopy={onCopy}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '開発向け' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '未記入を（未定義）と出す' }))
    fireEvent.click(screen.getByRole('button', { name: 'コピー' }))
    expect(onCopy).toHaveBeenCalledWith(
      'dev',
      expect.objectContaining({ numbering: true, showUndefined: false }),
    )
  })

  it('コピーした設定をストアへ書く（アプリを閉じるまで覚える）', () => {
    render(<TableCopyDialog {...base} onCopy={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'No 列を付ける' }))
    fireEvent.click(screen.getByRole('button', { name: 'コピー' }))
    expect(tableCopyPrefs.getSnapshot().options.numbering).toBe(false)
  })

  it('キャンセルは設定を書かない', () => {
    render(<TableCopyDialog {...base} onCopy={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'No 列を付ける' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(tableCopyPrefs.getSnapshot().options.numbering).toBe(true)
  })

  it('覚えている読み手がこのツールに無ければ先頭を選んでおく', () => {
    const onCopy = vi.fn()
    tableCopyPrefs.set({ options: tableCopyPrefs.getSnapshot().options, variantId: 'dev' })
    render(<TableCopyDialog {...base} onCopy={onCopy} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'コピー' }))
    // base の variants は 'default' 1本なので、覚えている 'dev' は先頭へ落ちる
    expect(onCopy).toHaveBeenCalledWith('default', expect.anything())
  })
})

describe('TableCopyDialog: 閉じ方と二重発火', () => {
  it('コピーは onCopy を1回だけ呼び、onCancel は呼ばない', () => {
    // AlertDialogAction の内部実装は Dialog.Close なので、onOpenChange を
    // onCancel に配線した状態でクリックすると、preventDefault を怠れば
    // onCopy と onCancel が同時に発火する（ConfirmDialog にもある罠と同じ形）
    const onCopy = vi.fn()
    const onCancel = vi.fn()
    render(<TableCopyDialog {...base} onCopy={onCopy} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'コピー' }))
    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('Esc は onCancel を呼び、onCopy は呼ばない', () => {
    // open が制御下で onOpenChange の配線が無いと、Radix の Esc ハンドラは
    // 素通りしてダイアログが閉じない（額縁の Esc も modalOpen で塞がれている
    // ので、利用者はマウスでしか閉じられなくなる）
    const onCopy = vi.fn()
    const onCancel = vi.fn()
    render(<TableCopyDialog {...base} onCopy={onCopy} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onCopy).not.toHaveBeenCalled()
  })
})

describe('TableCopyDialog: 開き直し', () => {
  it('開いている最中の変更は書き戻していなければ、閉じて開き直すとストアの値に戻る', () => {
    const { rerender } = render(<TableCopyDialog {...base} onCopy={vi.fn()} onCancel={vi.fn()} />)
    // 既定値は numbering: true。オフへ切り替えるが、まだ [コピー] は押していない
    fireEvent.click(screen.getByRole('checkbox', { name: 'No 列を付ける' }))
    expect(screen.getByRole('checkbox', { name: 'No 列を付ける' })).toHaveProperty('checked', false)

    // 閉じて開き直す。props.variants は同じ配列参照だが、open の立ち上がりで
    // ストアから読み直すことを見る（依存配列に variants だけを置く実装だと、
    // ここでは変わらないので誤って通ってしまう）
    rerender(<TableCopyDialog {...base} open={false} onCopy={vi.fn()} onCancel={vi.fn()} />)
    rerender(<TableCopyDialog {...base} open onCopy={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('checkbox', { name: 'No 列を付ける' })).toHaveProperty('checked', true)
  })
})
