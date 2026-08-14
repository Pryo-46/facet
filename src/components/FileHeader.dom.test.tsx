// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FileHeader } from './FileHeader'

afterEach(cleanup)

function setup(over: Partial<Parameters<typeof FileHeader>[0]> = {}) {
  const onTitleChange = vi.fn()
  render(
    <FileHeader
      title="受注フロー"
      fileName="シーケンス-2.json"
      typeLabel="シーケンス"
      editable
      onTitleChange={onTitleChange}
      {...over}
    />,
  )
  return { onTitleChange }
}

describe('FileHeader', () => {
  it('title を入力欄に出し、ファイル名と種類を添える', () => {
    setup()
    expect(screen.getByRole('textbox', { name: 'ファイルの名前' })).toHaveProperty(
      'value',
      '受注フロー',
    )
    expect(screen.getByText('シーケンス-2.json')).not.toBeNull()
    expect(screen.getByText('シーケンス')).not.toBeNull()
  })

  it('入力で onTitleChange を呼ぶ', () => {
    const { onTitleChange } = setup()
    fireEvent.change(screen.getByRole('textbox', { name: 'ファイルの名前' }), {
      target: { value: '返品フロー' },
    })
    expect(onTitleChange).toHaveBeenCalledWith('返品フロー')
  })

  it('空にもできる（空欄は未決の意思表示。拒否しない）', () => {
    const { onTitleChange } = setup()
    fireEvent.change(screen.getByRole('textbox', { name: 'ファイルの名前' }), {
      target: { value: '' },
    })
    expect(onTitleChange).toHaveBeenCalledWith('')
  })

  it('editable が false なら読み取り専用（書けないファイルに書き込む入口を作らない）', () => {
    const { onTitleChange } = setup({ editable: false })
    const input = screen.getByRole('textbox', { name: 'ファイルの名前' })
    expect(input).toHaveProperty('readOnly', true)
    fireEvent.change(input, { target: { value: 'X' } })
    expect(onTitleChange).not.toHaveBeenCalled()
  })

  it('typeLabel が null でも壊れない（未対応 type のファイル）', () => {
    setup({ typeLabel: null })
    expect(screen.getByRole('textbox', { name: 'ファイルの名前' })).not.toBeNull()
  })
})
