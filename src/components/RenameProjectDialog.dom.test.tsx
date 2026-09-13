// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RegisteredProject } from '@/core/projects'
import { RenameProjectDialog } from './RenameProjectDialog'

afterEach(cleanup)

const target: RegisteredProject = {
  path: 'C:\\work\\juchu',
  name: '受注管理',
  favorite: false,
  lastOpenedAt: '2026-03-01T00:00:00.000Z',
}

describe('RenameProjectDialog', () => {
  it('対象が null なら開かない', () => {
    render(<RenameProjectDialog project={null} onSubmit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('いまの表示名を入れた状態で開き、パスを読める', () => {
    render(<RenameProjectDialog project={target} onSubmit={vi.fn()} onClose={vi.fn()} />)
    expect((screen.getByLabelText('プロジェクト名') as HTMLInputElement).value).toBe('受注管理')
    expect(screen.getByText('C:\\work\\juchu')).toBeTruthy()
  })

  it('入れ替えた名前で確定する', () => {
    const onSubmit = vi.fn()
    render(<RenameProjectDialog project={target} onSubmit={onSubmit} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('プロジェクト名'), { target: { value: '受注リプレイス' } })
    fireEvent.click(screen.getByRole('button', { name: '変更する' }))
    expect(onSubmit).toHaveBeenCalledWith(target, '受注リプレイス')
  })

  it('入力欄で Enter を押すと確定する', () => {
    const onSubmit = vi.fn()
    render(<RenameProjectDialog project={target} onSubmit={onSubmit} onClose={vi.fn()} />)
    const input = screen.getByLabelText('プロジェクト名')
    fireEvent.change(input, { target: { value: '受注リプレイス' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(onSubmit).toHaveBeenCalledWith(target, '受注リプレイス')
  })

  it('空で確定するとフォルダ名に戻る', () => {
    const onSubmit = vi.fn()
    render(<RenameProjectDialog project={target} onSubmit={onSubmit} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('プロジェクト名'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '変更する' }))
    expect(onSubmit).toHaveBeenCalledWith(target, 'juchu')
  })

  it('キャンセルは名前を返さない', () => {
    const onSubmit = vi.fn()
    const onClose = vi.fn()
    render(<RenameProjectDialog project={target} onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('プロジェクト名'), { target: { value: '別の名前' } })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('対象が差し替わると入力欄も差し替わる', () => {
    // 閉じずに別の行の改名を開いたとき、前の行の名前が残らない
    const { rerender } = render(
      <RenameProjectDialog project={target} onSubmit={vi.fn()} onClose={vi.fn()} />,
    )
    rerender(
      <RenameProjectDialog
        project={{ ...target, path: 'C:\\work\\zaiko', name: '在庫照会' }}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect((screen.getByLabelText('プロジェクト名') as HTMLInputElement).value).toBe('在庫照会')
  })
})
