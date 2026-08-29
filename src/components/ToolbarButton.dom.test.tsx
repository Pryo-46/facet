// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ToolbarButton } from './ToolbarButton'

afterEach(cleanup)

describe('ToolbarButton: 押せるとき（unusable === null）', () => {
  it('クリックすると onClick が呼ばれる', () => {
    const onClick = vi.fn()
    render(
      <ToolbarButton unusable={null} onClick={onClick}>
        実行する
      </ToolbarButton>,
    )
    fireEvent.click(screen.getByRole('button', { name: '実行する' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('aria-disabled を持たない', () => {
    render(
      <ToolbarButton unusable={null} onClick={vi.fn()}>
        実行する
      </ToolbarButton>,
    )
    expect(screen.getByRole('button', { name: '実行する' }).getAttribute('aria-disabled')).toBeNull()
  })
})

describe('ToolbarButton: 押せないとき（unusable が文字列）', () => {
  it('クリックしても onClick は呼ばれない', () => {
    const onClick = vi.fn()
    render(
      <ToolbarButton unusable="ファイルを選んでください" onClick={onClick}>
        実行する
      </ToolbarButton>,
    )
    fireEvent.click(screen.getByRole('button', { name: '実行する' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('aria-disabled が立ち、title に理由がそのまま入る', () => {
    render(
      <ToolbarButton unusable="ファイルを選んでください" onClick={vi.fn()}>
        実行する
      </ToolbarButton>,
    )
    const button = screen.getByRole('button', { name: '実行する' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.getAttribute('title')).toBe('ファイルを選んでください')
  })

  it('DOM の disabled プロパティは false のまま', () => {
    // ここが本題。**`disabled` にすると `title` のツールチップがブラウザの
    // 仕様で二度と出なくなる**ため、押せない状態でも DOM の disabled は
    // 立てないことが load-bearing な性質になる
    render(
      <ToolbarButton unusable="ファイルを選んでください" onClick={vi.fn()}>
        実行する
      </ToolbarButton>,
    )
    const button = screen.getByRole('button', { name: '実行する' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  it('フォーカスできる（キーボードで辿り着ける）', () => {
    render(
      <ToolbarButton unusable="ファイルを選んでください" onClick={vi.fn()}>
        実行する
      </ToolbarButton>,
    )
    const button = screen.getByRole('button', { name: '実行する' }) as HTMLButtonElement
    button.focus()
    expect(document.activeElement).toBe(button)
  })
})
