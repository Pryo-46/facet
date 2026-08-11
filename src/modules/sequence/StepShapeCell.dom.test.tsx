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
})
