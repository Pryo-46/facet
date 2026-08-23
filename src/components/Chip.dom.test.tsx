// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Chip } from './Chip'

afterEach(cleanup)

describe('Chip', () => {
  it('選択状態を aria-pressed で表す', () => {
    render(<Chip selected onClick={() => {}}>アクター</Chip>)
    expect(screen.getByRole('button', { name: 'アクター', pressed: true })).not.toBeNull()
  })

  it('押すと onClick が呼ばれる', () => {
    const onClick = vi.fn()
    render(<Chip selected={false} onClick={onClick}>アクター</Chip>)
    fireEvent.click(screen.getByRole('button', { name: 'アクター', pressed: false }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
