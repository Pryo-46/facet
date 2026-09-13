// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WEAK_TOAST_MS, type ToastItem } from '@/core/toasts'
import { ToastStack } from './Toast'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup(toasts: ToastItem[], modalOpen = false) {
  const onDismiss = vi.fn()
  render(<ToastStack toasts={toasts} onDismiss={onDismiss} modalOpen={modalOpen} />)
  return { onDismiss }
}

describe('ToastStack', () => {
  it('通知が無ければ何も出さない', () => {
    setup([])
    expect(screen.queryAllByRole('status')).toHaveLength(0)
  })

  it('メッセージを出す', () => {
    setup([{ id: 1, message: '外部の変更を読み込みました' }])
    expect(screen.getByRole('status').textContent).toContain('外部の変更を読み込みました')
  })

  it('操作ボタンを押すと run が呼ばれる', () => {
    const run = vi.fn()
    setup([{ id: 1, message: '取り込みました', action: { label: '取り込み前に戻す', run } }])
    fireEvent.click(screen.getByRole('button', { name: '取り込み前に戻す' }))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('閉じるボタンで onDismiss が呼ばれる', () => {
    const { onDismiss } = setup([{ id: 7, message: '増えました' }])
    fireEvent.click(screen.getByRole('button', { name: '通知を閉じる' }))
    expect(onDismiss).toHaveBeenCalledWith(7)
  })

  it('モーダル中は表示だけで、操作を受け付けない', () => {
    // トーストはモーダルより前面に出す（閉じられない理由を伝える唯一の手段が
    // オーバーレイの下に隠れるため）。そのぶん、回答待ちの二択の裏で
    // 古い「取り込み前に戻す」を押せないようにする必要がある
    const run = vi.fn()
    const { onDismiss } = setup(
      [{ id: 7, message: '取り込みました', action: { label: '取り込み前に戻す', run } }],
      true,
    )
    // メッセージは読めなければ意味がないので、表示は続ける
    expect(screen.getByRole('status').textContent).toContain('取り込みました')
    fireEvent.click(screen.getByRole('button', { name: '取り込み前に戻す' }))
    fireEvent.click(screen.getByRole('button', { name: '通知を閉じる' }))
    expect(run).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('弱い通知は決まった時間で消える', () => {
    vi.useFakeTimers()
    const { onDismiss } = setup([{ id: 7, message: 'コピーしました' }])
    vi.advanceTimersByTime(WEAK_TOAST_MS - 1)
    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDismiss).toHaveBeenCalledWith(7)
  })

  it('重要な通知と操作付きの通知は時間が経っても消えない（閉じるまで残る）', () => {
    vi.useFakeTimers()
    // 裏で起きた破壊的な変更は、画面から目を離していた人にも届かなければならない
    const { onDismiss } = setup([
      { id: 7, message: '外部で削除されました', important: true },
      { id: 8, message: '取り込みました', action: { label: '取り込み前に戻す', run: vi.fn() } },
    ])
    vi.advanceTimersByTime(60_000)
    expect(onDismiss).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('status')).toHaveLength(2)
  })

  it('ポインタを載せている間は弱い通知も消えない', () => {
    vi.useFakeTimers()
    const { onDismiss } = setup([{ id: 7, message: 'コピーしました' }])
    fireEvent.pointerEnter(screen.getByRole('status'))
    vi.advanceTimersByTime(60_000)
    expect(onDismiss).not.toHaveBeenCalled()
    fireEvent.pointerLeave(screen.getByRole('status'))
    vi.advanceTimersByTime(WEAK_TOAST_MS)
    expect(onDismiss).toHaveBeenCalledWith(7)
  })

  it('右端から端末ペインの幅だけ空けて置く（Claude Code の入力欄に重ねない）', () => {
    render(<ToastStack toasts={[{ id: 1, message: 'a' }]} onDismiss={vi.fn()} rightInset={480} />)
    const stack = screen.getByRole('status').parentElement as HTMLElement
    expect(stack.style.right).toBe('480px')
  })
})
