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

  it('write 実行中に保存済み内容へ戻しても最終的にディスクが一致する', async () => {
    const deferred = (() => {
      let resolve: () => void, reject: (err: unknown) => void
      const promise = new Promise<void>((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve: resolve!, reject: reject! }
    })()
    const write = vi.fn(() => deferred.promise)
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    await vi.runAllTimersAsync()
    // この時点で write('B') が呼ばれたが未解決
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenNthCalledWith(1, 'B')
    // write 中に baseline に戻す
    saver.update('A')
    // write('B') を解決
    deferred.resolve()
    await vi.runAllTimersAsync()
    // A へ戻す操作が無視されず、B が実装中なので A へ書き込まれる
    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenNthCalledWith(2, 'A')
  })

  it('書き込みは直列化される', async () => {
    const writes: string[] = []
    const deferred1 = (() => {
      let resolve: () => void, reject: (err: unknown) => void
      const promise = new Promise<void>((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve: resolve!, reject: reject! }
    })()
    const write = vi.fn((text: string) => {
      writes.push(text)
      if (writes.length === 1) {
        return deferred1.promise
      }
      return Promise.resolve()
    })
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    await vi.runAllTimersAsync()
    // write('B') が呼ばれて in-flight
    expect(writes).toEqual(['B'])
    // 別の内容に更新（pending に格納）
    saver.update('C')
    // 1本目の write が完了してないので 2本目は呼ばれない
    expect(writes).toEqual(['B'])
    // 1本目を解決
    deferred1.resolve()
    await vi.runAllTimersAsync()
    // 2本目が順番に呼ばれる
    expect(writes).toEqual(['B', 'C'])
  })
})
