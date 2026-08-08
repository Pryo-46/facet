import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoalescer } from './coalesce'

describe('createCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('立て続けの notify を1回の実行にまとめる', () => {
    const run = vi.fn()
    const coalescer = createCoalescer(150, run)
    coalescer.notify()
    coalescer.notify()
    coalescer.notify()
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(150)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('実行後の notify はもう一度走る', () => {
    const run = vi.fn()
    const coalescer = createCoalescer(150, run)
    coalescer.notify()
    vi.advanceTimersByTime(150)
    coalescer.notify()
    vi.advanceTimersByTime(150)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('dispose 後は走らない（監視を止めた後に再走査が飛ばないため）', () => {
    const run = vi.fn()
    const coalescer = createCoalescer(150, run)
    coalescer.notify()
    coalescer.dispose()
    vi.advanceTimersByTime(150)
    expect(run).not.toHaveBeenCalled()
  })
})
