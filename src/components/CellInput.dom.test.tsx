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

describe('CellInput: 複数行', () => {
  it('multiline なら textarea として描かれる', () => {
    render(<CellInput multiline value="" onValueChange={() => {}} aria-label="定義" />)
    expect(screen.getByLabelText('定義').tagName).toBe('TEXTAREA')
  })

  it('multiline でない既定は input のまま', () => {
    render(<CellInput value="" onValueChange={() => {}} aria-label="名称" />)
    expect(screen.getByLabelText('名称').tagName).toBe('INPUT')
  })

  it('textarea でも変換中は親へ値を上げない（IME の巻き戻り防止）', () => {
    const onValueChange = vi.fn()
    render(<CellInput multiline value="" onValueChange={onValueChange} aria-label="定義" />)
    const el = screen.getByLabelText('定義') as HTMLTextAreaElement

    fireEvent.compositionStart(el)
    fireEvent.change(el, { target: { value: 'じゅちゅう' } })
    expect(onValueChange).not.toHaveBeenCalled()

    fireEvent.compositionEnd(el, { target: { value: '受注' } })
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith('受注')
  })

  it('改行を含む値をそのまま扱える（外部が書いた複数行の定義）', () => {
    const onValueChange = vi.fn()
    render(<CellInput multiline value="" onValueChange={onValueChange} aria-label="定義" />)
    fireEvent.change(screen.getByLabelText('定義'), { target: { value: '1行目\n2行目' } })
    expect(onValueChange).toHaveBeenCalledWith('1行目\n2行目')
  })

  it('autoSize={false} のとき rows を自分で決めない（高さは CSS に委ねる）', () => {
    render(
      <CellInput
        multiline
        autoSize={false}
        aria-label="ノード"
        value={'あ\nい\nう'}
        onValueChange={() => {}}
      />,
    )
    const el = screen.getByLabelText('ノード') as HTMLTextAreaElement
    expect(el.rows).toBe(1)
  })

  it('autoSize={false} でも IME 変換中は親へ値を上げない', () => {
    const onValueChange = vi.fn()
    render(
      <CellInput multiline autoSize={false} aria-label="ノード" value="" onValueChange={onValueChange} />,
    )
    const el = screen.getByLabelText('ノード')
    fireEvent.compositionStart(el)
    fireEvent.change(el, { target: { value: 'じゅちゅう' } })
    expect(onValueChange).not.toHaveBeenCalled()
    fireEvent.compositionEnd(el, { target: { value: '受注' } })
    expect(onValueChange).toHaveBeenCalledWith('受注')
  })
})
