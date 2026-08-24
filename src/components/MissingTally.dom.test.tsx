// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { MissingTally as Tally } from '@/core/missing-tally'
import { MissingTally } from './MissingTally'

afterEach(cleanup)

const TALLY: Tally = {
  total: 3,
  parts: [
    { kind: 'definition', label: '未定義', count: 2, variant: 'open' },
    { kind: 'kind', label: '未分類', count: 1, variant: 'open' },
  ],
}

describe('MissingTally', () => {
  it('合計と内訳を出す', () => {
    render(<MissingTally tally={TALLY} />)
    expect(screen.getByText('⚠ 要対応 3')).toBeDefined()
    expect(screen.getByText('未定義 2')).toBeDefined()
    expect(screen.getByText('未分類 1')).toBeDefined()
  })

  it('0 件なら ⚠ 無しの合計だけ', () => {
    render(<MissingTally tally={{ total: 0, parts: [] }} />)
    expect(screen.getByText('要対応 0')).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('onJump があれば内訳は押せるチップで、kind を渡す', () => {
    const onJump = vi.fn()
    render(<MissingTally tally={TALLY} onJump={onJump} />)
    fireEvent.click(screen.getByRole('button', { name: '次の未定義へ' }))
    expect(onJump).toHaveBeenCalledWith('definition')
  })

  it('onJump が無ければ button を作らない', () => {
    render(<MissingTally tally={TALLY} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('count 0 の part はチップを描かない', () => {
    const t: Tally = { total: 1, parts: [...TALLY.parts.map((p) => ({ ...p })), { kind: 'x', label: '保留', count: 0, variant: 'hold' as const }] }
    render(<MissingTally tally={t} onJump={() => {}} />)
    expect(screen.queryByRole('button', { name: '次の保留へ' })).toBeNull()
  })
})
