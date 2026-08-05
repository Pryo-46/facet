// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CellInput } from './CellInput'

// globals: false なので自動クリーンアップは効かない。明示的に呼ぶ
afterEach(cleanup)

describe('CellInput', () => {
  it('変換中は親へ値を上げず、確定時に1回だけ上げる（IME の巻き戻り防止）', () => {
    const onValueChange = vi.fn()
    render(<CellInput value="" onValueChange={onValueChange} aria-label="名称" />)
    const el = screen.getByLabelText('名称') as HTMLInputElement

    fireEvent.compositionStart(el)
    fireEvent.change(el, { target: { value: 'じゅちゅう' } })
    expect(onValueChange).not.toHaveBeenCalled()
    // 変換中の表示は入力そのもの（親の値で巻き戻らない）
    expect(el.value).toBe('じゅちゅう')

    fireEvent.compositionEnd(el, { target: { value: '受注' } })
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith('受注')
  })

  it('変換していない入力はそのまま親へ上がる', () => {
    const onValueChange = vi.fn()
    render(<CellInput value="" onValueChange={onValueChange} aria-label="名称" />)
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'API' } })
    expect(onValueChange).toHaveBeenCalledWith('API')
  })

  it('sanitize が null を返す入力はデータに載せない（空の名称）', () => {
    const onValueChange = vi.fn()
    render(
      <CellInput
        value="受注"
        onValueChange={onValueChange}
        sanitize={(raw) => (raw.trim() === '' ? null : raw)}
        aria-label="名称"
      />,
    )
    const el = screen.getByLabelText('名称') as HTMLInputElement
    fireEvent.change(el, { target: { value: '' } })
    expect(onValueChange).not.toHaveBeenCalled()
    // 表示は空のまま編集を続けられる
    expect(el.value).toBe('')
    // セルを抜けたら確定値に戻る
    fireEvent.blur(el)
    expect(el.value).toBe('受注')
  })

  it('親から来た値の変更が表示に反映される（Undo の表示反映の経路）', () => {
    const { rerender } = render(<CellInput value="受注" onValueChange={() => {}} aria-label="名称" />)
    const el = screen.getByLabelText('名称') as HTMLInputElement
    fireEvent.change(el, { target: { value: '受注書' } })
    rerender(<CellInput value="受注書" onValueChange={() => {}} aria-label="名称" />)
    expect(el.value).toBe('受注書')
    // Undo で親が戻したら表示も戻る
    rerender(<CellInput value="受注" onValueChange={() => {}} aria-label="名称" />)
    expect(el.value).toBe('受注')
  })
})
