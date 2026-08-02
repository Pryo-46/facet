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

  it('in-flight と同内容の update は write 失敗後に再試行される', async () => {
    // 呼び出しごとに独立した deferred を返す（前回の promise を使い回すと
    // 「2回目の成功」を検証したつもりでも実は1回目の reject 済み promise を
    // 再利用してしまい、テストが失敗を検出できなくなる）
    const deferreds: { resolve: () => void; reject: (err: unknown) => void }[] = []
    const write = vi.fn(() => {
      let resolve!: () => void
      let reject!: (err: unknown) => void
      const promise = new Promise<void>((res, rej) => {
        resolve = res
        reject = rej
      })
      deferreds.push({ resolve, reject })
      return promise
    })
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    await vi.runAllTimersAsync()
    // この時点で write('B') が呼ばれて in-flight
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenNthCalledWith(1, 'B')
    // in-flight 中に同じ内容を update（スケジュールされる）
    saver.update('B')
    // 1回目の write を reject させて失敗を起こす
    deferreds[0].reject(new Error('write failed'))
    await vi.runAllTimersAsync()
    // pending に残っているので flush で再試行される
    const flushPromise = saver.flush()
    await vi.runAllTimersAsync()
    // write が新しい呼び出しとして再試行される（1回目とは別の promise インスタンス）
    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenNthCalledWith(2, 'B')
    // 2回目を成功させる
    deferreds[1].resolve()
    await flushPromise
    // 成功後、同内容を再度 update しても重複書き込みは起きない
    saver.update('B')
    await vi.runAllTimersAsync()
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('write 失敗後、update を挟まなくても flush() が失敗内容を再書き込みする', async () => {
    const deferreds: { resolve: () => void; reject: (err: unknown) => void }[] = []
    const write = vi.fn(() => {
      let resolve!: () => void
      let reject!: (err: unknown) => void
      const promise = new Promise<void>((res, rej) => {
        resolve = res
        reject = rej
      })
      deferreds.push({ resolve, reject })
      return promise
    })
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    await vi.runAllTimersAsync()
    // write('B') が呼ばれてタイマー経由で走った
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenNthCalledWith(1, 'B')
    // update を挟まず write('B') を失敗させる
    deferreds[0].reject(new Error('write failed'))
    await vi.runAllTimersAsync()
    // 失敗した内容が pending に復元され、flush() だけで再試行される
    const flushPromise = saver.flush()
    await vi.runAllTimersAsync()
    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenNthCalledWith(2, 'B')
    deferreds[1].resolve()
    await flushPromise
  })

  it('flush は書き残しが無ければ true を返す', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    await expect(saver.flush()).resolves.toBe(true)
  })

  it('write が失敗し続けたら flush は false を返す（pending は破棄されない）', async () => {
    const write = vi.fn(() => Promise.reject(new Error('disk full')))
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    await expect(saver.flush()).resolves.toBe(false)
    // 復元された pending は次の flush で再試行される
    write.mockImplementation(() => Promise.resolve())
    await expect(saver.flush()).resolves.toBe(true)
    expect(write).toHaveBeenLastCalledWith('B')
  })

  it('write 失敗で onError、成功で onSuccess が呼ばれる', async () => {
    const onError = vi.fn()
    const onSuccess = vi.fn()
    const write = vi.fn(() => Promise.reject(new Error('boom')))
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write, onError, onSuccess })
    saver.update('B')
    await saver.flush()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onSuccess).not.toHaveBeenCalled()
    write.mockImplementation(() => Promise.resolve())
    await saver.flush()
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })
})
