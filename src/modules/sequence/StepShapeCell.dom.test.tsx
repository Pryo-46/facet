// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StepShapeCell } from './StepShapeCell'

afterEach(cleanup)

describe('StepShapeCell', () => {
  it('現在の形をラベルで表示する', () => {
    render(
      <StepShapeCell value="call-sync" aria-label="形" data-cell="s1:shape" onChange={() => {}} />,
    )
    expect(screen.getByLabelText('形').textContent).toBe('呼出')
  })

  it('↓ で次、↑ で前の形（4値の循環。call-sync から両方向）', () => {
    const onChange = vi.fn()
    render(
      <StepShapeCell value="call-sync" aria-label="形" data-cell="s1:shape" onChange={onChange} />,
    )
    const el = screen.getByLabelText('形')
    fireEvent.keyDown(el, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith('call-async')
    fireEvent.keyDown(el, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith('self')
  })

  it('self から ↓ で先頭へ回り込む', () => {
    const onChange = vi.fn()
    render(<StepShapeCell value="self" aria-label="形" data-cell="s1:shape" onChange={onChange} />)
    fireEvent.keyDown(screen.getByLabelText('形'), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith('call-sync')
  })

  it('Alt+↓ は形を変えず、onFieldKeyDown へ委譲する', () => {
    const onChange = vi.fn()
    const onFieldKeyDown = vi.fn()
    render(
      <StepShapeCell
        value="call-sync"
        aria-label="形"
        data-cell="s1:shape"
        onChange={onChange}
        onFieldKeyDown={onFieldKeyDown}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('形'), { key: 'ArrowDown', altKey: true })
    expect(onChange).not.toHaveBeenCalled()
    expect(onFieldKeyDown).toHaveBeenCalledOnce()
  })

  it('クリックでメニューが開き、選んだ形になる', async () => {
    const onChange = vi.fn()
    render(
      <StepShapeCell value="call-sync" aria-label="ステップ1の形" data-cell="k:shape" onChange={onChange} />,
    )
    // Radix のトリガーは pointerdown で開く（ExportMenu の DOM テストと同じ作法）
    fireEvent.pointerDown(screen.getByLabelText('ステップ1の形'), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: '内部処理' }))
    expect(onChange).toHaveBeenCalledWith('self')
  })

  it('メニューには4値すべてが出る', async () => {
    render(
      <StepShapeCell value="call-sync" aria-label="ステップ1の形" data-cell="k:shape" onChange={() => {}} />,
    )
    fireEvent.pointerDown(screen.getByLabelText('ステップ1の形'), { button: 0, ctrlKey: false })
    await screen.findByRole('menuitem', { name: '呼出' })
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      '呼出',
      '呼出（応答なし）',
      '応答',
      '内部処理',
    ])
  })

  it('開閉を onOpenChange で伝える（キャンバスのズームを止めるため）', async () => {
    const onOpenChange = vi.fn()
    render(
      <StepShapeCell
        value="call-sync"
        aria-label="ステップ1の形"
        data-cell="k:shape"
        onChange={() => {}}
        onOpenChange={onOpenChange}
      />,
    )
    fireEvent.pointerDown(screen.getByLabelText('ステップ1の形'), { button: 0, ctrlKey: false })
    await screen.findByRole('menuitem', { name: '呼出' })
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('↓ は巡回のままで、メニューを開かない（キーボード動線を変えない）', () => {
    const onChange = vi.fn()
    render(
      <StepShapeCell value="call-sync" aria-label="ステップ1の形" data-cell="k:shape" onChange={onChange} />,
    )
    fireEvent.keyDown(screen.getByLabelText('ステップ1の形'), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenCalledWith('call-async')
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('Enter はメニューを開かず onFieldKeyDown へ委譲する（ステップ追加の経路を塞がない）', () => {
    const onFieldKeyDown = vi.fn()
    render(
      <StepShapeCell
        value="call-sync"
        aria-label="ステップ1の形"
        data-cell="k:shape"
        onChange={() => {}}
        onFieldKeyDown={onFieldKeyDown}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('ステップ1の形'), { key: 'Enter' })
    expect(onFieldKeyDown).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menuitem')).toBeNull()
  })
})
