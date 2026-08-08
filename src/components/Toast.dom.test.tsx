// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ToastItem } from '@/core/toasts'
import { ToastStack } from './Toast'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup(toasts: ToastItem[]) {
  const onDismiss = vi.fn()
  render(<ToastStack toasts={toasts} onDismiss={onDismiss} />)
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

  it('時間が経っても消えない（閉じるまで残る）', () => {
    vi.useFakeTimers()
    // 操作の有無を問わず時間では消えない。6秒の自動消去を入れていたときは、
    // 実機確認で「見逃したのか出ていないのか」が区別できず検証を妨げた
    const { onDismiss } = setup([
      { id: 7, message: '増えました' },
      { id: 8, message: '取り込みました', action: { label: '取り込み前に戻す', run: vi.fn() } },
    ])
    vi.advanceTimersByTime(60_000)
    expect(onDismiss).not.toHaveBeenCalled()
    expect(screen.queryAllByRole('status')).toHaveLength(2)
  })
})
