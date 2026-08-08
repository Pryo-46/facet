import { describe, expect, it, vi } from 'vitest'
import { createColumnWidthStore, resizeColumns } from './column-resize'

const base = { widths: [100, 100, 100], minWidth: 88, available: 1000, flexMinWidth: 200 }

describe('resizeColumns', () => {
  it('指定した列だけを delta ぶん動かす', () => {
    expect(resizeColumns({ ...base, index: 1, delta: 50 })).toEqual([100, 150, 100])
  })

  it('最小幅より狭くしない', () => {
    expect(resizeColumns({ ...base, index: 0, delta: -500 })).toEqual([88, 100, 100])
  })

  it('残りを埋める列に flexMinWidth を残す（それ以上は広げない）', () => {
    // 他の列が 200、残りを埋める列に 200 を残すので上限は 1000-200-200=600
    expect(resizeColumns({ ...base, index: 0, delta: 5000 })).toEqual([600, 100, 100])
  })

  it('available が 0 以下なら上限を掛けない', () => {
    // jsdom には clientWidth が無い（常に 0）。ここで上限を掛けると
    // キーボード操作のテストが「広げられない」に落ちて意味を失う
    expect(resizeColumns({ ...base, index: 0, delta: 5000, available: 0 })).toEqual([
      5100, 100, 100,
    ])
  })

  it('上限が最小幅を下回っても最小幅は割らない', () => {
    expect(resizeColumns({ ...base, index: 0, delta: 10, available: 250 })).toEqual([88, 100, 100])
  })

  it('範囲外の index は素通しする', () => {
    expect(resizeColumns({ ...base, index: 9, delta: 50 })).toEqual([100, 100, 100])
  })

  it('引数の配列を書き換えない', () => {
    const widths = [100, 100, 100]
    resizeColumns({ ...base, widths, index: 0, delta: 50 })
    expect(widths).toEqual([100, 100, 100])
  })
})

describe('createColumnWidthStore', () => {
  it('getSnapshot は変化していなければ同一参照を返す', () => {
    // useSyncExternalStore は毎回新しい配列を返すと無限ループする
    const store = createColumnWidthStore([10, 20])
    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })

  it('set で値が変わり、参照も変わる', () => {
    const store = createColumnWidthStore([10, 20])
    const before = store.getSnapshot()
    store.set([30, 40])
    expect(store.getSnapshot()).toEqual([30, 40])
    expect(store.getSnapshot()).not.toBe(before)
  })

  it('reset で既定へ戻る', () => {
    const store = createColumnWidthStore([10, 20])
    store.set([30, 40])
    store.reset()
    expect(store.getSnapshot()).toEqual([10, 20])
  })

  it('defaults は set で汚れない', () => {
    const store = createColumnWidthStore([10, 20])
    store.set([30, 40])
    expect(store.defaults).toEqual([10, 20])
  })

  it('購読者へ通知し、解除すると届かなくなる', () => {
    const store = createColumnWidthStore([10, 20])
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.set([30, 40])
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    store.set([50, 60])
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
