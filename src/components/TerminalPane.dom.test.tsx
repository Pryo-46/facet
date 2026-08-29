// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PtyIo } from '@/core/terminal/pty-io'
import { emptyTerminalState, openSession } from '@/core/terminal/sessions'

vi.mock('./TerminalTab', () => ({
  TerminalTab: ({
    session,
    hidden,
    insertion,
  }: {
    session: { label: string }
    hidden: boolean
    insertion: { seq: number; text: string } | null
  }) => (
    <div
      data-testid={`tab-body-${session.label}`}
      data-hidden={String(hidden)}
      data-insertion={insertion === null ? '' : `${insertion.seq}:${insertion.text}`}
    />
  ),
}))

const { TerminalPane } = await import('./TerminalPane')

const ptyIo: PtyIo = {
  spawn: vi.fn(async () => 1),
  write: vi.fn(async () => undefined),
  resize: vi.fn(async () => undefined),
  kill: vi.fn(async () => undefined),
}

function setup(state = openSession(emptyTerminalState), insertion = null as
  | { targetId: number; seq: number; text: string }
  | null) {
  const handlers = {
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onActivate: vi.fn(),
    onRunning: vi.fn(),
    onExited: vi.fn(),
    onFailed: vi.fn(),
  }
  render(
    <TerminalPane
      state={state}
      cwd="/proj"
      ptyIo={ptyIo}
      paneVisible
      dark={false}
      insertion={insertion}
      clipboardIo={{ readText: vi.fn(async () => ''), writeText: vi.fn(async () => undefined) }}
      onError={vi.fn()}
      {...handlers}
    />,
  )
  return handlers
}

afterEach(cleanup)

describe('TerminalPane', () => {
  it('タブが1本も無いときは開く動線だけを出す', () => {
    setup(emptyTerminalState)
    expect(screen.getByRole('button', { name: 'Claude Code を開く' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'タブを追加' })).toBeNull()
  })

  it('＋でタブの追加を要求する', () => {
    const h = setup()
    fireEvent.click(screen.getByRole('button', { name: 'タブを追加' }))
    expect(h.onOpen).toHaveBeenCalledTimes(1)
  })

  it('タブを押すとアクティブの切替を要求する', () => {
    const two = openSession(openSession(emptyTerminalState))
    const h = setup(two)
    fireEvent.click(screen.getByRole('button', { name: 'Claude 1' }))
    expect(h.onActivate).toHaveBeenCalledWith(two.sessions[0]?.id)
  })

  it('✕で終了を要求する（確認は出さない）', () => {
    const one = openSession(emptyTerminalState)
    const h = setup(one)
    fireEvent.click(screen.getByRole('button', { name: 'Claude 1 を閉じる' }))
    expect(h.onClose).toHaveBeenCalledWith(one.sessions[0]?.id)
  })

  it('**非アクティブなタブもアンマウントせず隠すだけ**', () => {
    // アンマウントするとスクロールバックとプロセスが消える（設計 決定6）
    setup(openSession(openSession(emptyTerminalState)))
    expect(screen.getByTestId('tab-body-Claude 1').dataset['hidden']).toBe('true')
    expect(screen.getByTestId('tab-body-Claude 2').dataset['hidden']).toBe('false')
  })

  it('アクティブなタブに aria-pressed を付ける', () => {
    setup(openSession(openSession(emptyTerminalState)))
    expect(screen.getByRole('button', { name: 'Claude 1' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Claude 2' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('**ペインを畳んでいる間もタブは生きていて、隠れているだけ**', () => {
    // 畳むでアンマウントすると会話とプロセスが消える（設計 決定6）
    const handlers = {
      onOpen: vi.fn(),
      onClose: vi.fn(),
      onActivate: vi.fn(),
      onRunning: vi.fn(),
      onExited: vi.fn(),
      onFailed: vi.fn(),
    }
    render(
      <TerminalPane
        state={openSession(emptyTerminalState)}
        cwd="/proj"
        ptyIo={ptyIo}
        paneVisible={false}
        dark={false}
        insertion={null}
        clipboardIo={{ readText: vi.fn(async () => ''), writeText: vi.fn(async () => undefined) }}
        onError={vi.fn()}
        {...handlers}
      />,
    )
    expect(screen.getByTestId('tab-body-Claude 1').dataset['hidden']).toBe('true')
  })

  it('差し込みは宛先のタブにだけ渡す', () => {
    const two = openSession(openSession(emptyTerminalState))
    const second = two.sessions[1]?.id ?? 0
    setup(two, { targetId: second, seq: 3, text: '@a.json ' })
    expect(screen.getByTestId('tab-body-Claude 1').dataset.insertion).toBe('')
    expect(screen.getByTestId('tab-body-Claude 2').dataset.insertion).toBe('3:@a.json ')
  })

  it('ペインの中では OS の既定メニューを出さない', () => {
    setup()
    // タブバーを含むペイン全体で既定メニューを止める。**ここでは何も起こさない**
    //（貼り付けは端末の中だけ。TerminalTab の担当）
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    const dispatched = screen.getByRole('button', { name: 'タブを追加' }).dispatchEvent(event)
    expect(dispatched).toBe(false) // preventDefault された
  })
})
