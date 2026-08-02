import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutoSaver } from './autosave'

describe('createAutoSaver', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('baseline と同じ内容は書かない（閲覧では書き戻さない）', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('A')
    await vi.runAllTimersAsync()
    expect(write).not.toHaveBeenCalled()
  })

  it('変更はデバウンス後に1回だけ書かれる', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    expect(write).not.toHaveBeenCalled()
    await vi.runAllTimersAsync()
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('B')
  })

  it('連続更新は最後の内容だけが1回書かれる', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    saver.update('BC')
    saver.update('BCD')
    await vi.runAllTimersAsync()
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('BCD')
  })

  it('変更後に保存済み内容へ戻したら書かない', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    saver.update('A')
    await vi.runAllTimersAsync()
    expect(write).not.toHaveBeenCalled()
  })

  it('保存後は保存済み内容が新しい基準になる（同じ内容の再書き込みなし）', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    await vi.runAllTimersAsync()
    saver.update('B')
    await vi.runAllTimersAsync()
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('flush はデバウンスを待たず即時に書く', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    await saver.flush()
    expect(write).toHaveBeenCalledWith('B')
  })

  it('dispose 後は保留中の書き込みが破棄される', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    saver.dispose()
    await vi.runAllTimersAsync()
    expect(write).not.toHaveBeenCalled()
  })
})
