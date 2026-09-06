// @vitest-environment jsdom
import { createElement, useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  createColumnWidthStore,
  invertDelta,
  resizeColumns,
  useColumnResize,
  type ColumnWidthStore,
} from './column-resize'

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

  it('狭めてから広げても、元の意図（widths）を渡し直せば元の幅に戻る', () => {
    // App.tsx のペイン幅追従の値そのもの（PANE_MIN_WIDTH=320, EDITOR_MIN_WIDTH=480）。
    // クランプ後の戻り値を意図として書き戻すと、意図そのものが 320 に潰れて
    // 二度と戻らなくなる。**呼び出し側が意図
    // （intent）を変えず、都度この関数に通すだけなら、ウィンドウを広げた
    // ときに自然に戻る**——それを固定する
    const intent = [420]
    const narrow = resizeColumns({
      widths: intent,
      index: 0,
      delta: 0,
      minWidth: 320,
      available: 700, // 700 - 480(flexMinWidth) = 220 < 320 なので minWidth に張り付く
      flexMinWidth: 480,
    })
    expect(narrow).toEqual([320])
    // resizeColumns は引数の配列を書き換えない。呼び出し側が narrow を
    // 意図として保存し直さない限り、intent は 420 のまま残る
    expect(intent).toEqual([420])

    const wide = resizeColumns({
      widths: intent,
      index: 0,
      delta: 0,
      minWidth: 320,
      available: 2000,
      flexMinWidth: 480,
    })
    expect(wide).toEqual([420])
  })
})

describe('invertDelta', () => {
  it('invert を指定しなければ delta をそのまま返す', () => {
    expect(invertDelta(10)).toBe(10)
    expect(invertDelta(-10)).toBe(-10)
  })

  it('invert が false なら delta をそのまま返す', () => {
    expect(invertDelta(10, false)).toBe(10)
  })

  it('invert が true なら符号を反転する', () => {
    // 定義列の右端のハンドル用。右へドラッグ（delta 正）すると、
    // 実際に動かす別名列の幅は逆に縮む
    expect(invertDelta(10, true)).toBe(-10)
    expect(invertDelta(-10, true)).toBe(10)
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

/**
 * `useColumnResize` はハンドル1個だけの最小ハーネスで直接テストする
 * （`PaneSplitter.dom.test.tsx` を経由しない。ここは `column-resize.ts`
 * 自体の挙動——`referenceWidths` の有無で基準が変わること——を主張する）。
 * JSX を使わないのは、このファイルを `.ts` のまま保つため
 */
function renderHandle(store: ColumnWidthStore, referenceWidths?: readonly number[]) {
  function Handle() {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const { getHandleProps } = useColumnResize({
      store,
      minWidth: 88,
      flexMinWidth: 200,
      step: 16,
      containerRef,
      referenceWidths,
    })
    return createElement('div', { ref: containerRef }, createElement('div', getHandleProps(0)))
  }
  render(createElement(Handle))
  const handle = screen.getByRole('separator')
  // jsdom は setPointerCapture を実装していない
  handle.setPointerCapture = () => undefined
  return handle
}

describe('useColumnResize の referenceWidths（ドラッグ／キーボードの基準）', () => {
  afterEach(cleanup)

  it('省略時は従来どおり store（意図）を基準に動く（表を持つツールの挙動が変わらないことの固定）', () => {
    const store = createColumnWidthStore([100, 100, 100])
    const handle = renderHandle(store)
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 550, pointerId: 1 })
    // store(100) + 50 = 150。referenceWidths を渡していないので、
    // これは resizeColumns の既存の挙動そのもの
    expect(store.getSnapshot()).toEqual([150, 100, 100])
  })

  it('referenceWidths を渡すと、store の値とは無関係にそこからの差分で動く（ドラッグ）', () => {
    const store = createColumnWidthStore([100, 100, 100])
    // store（意図）は 100 のままだが、画面には既に 300 まで広がった状態で
    // 出ている、というペイン（意図と表示の乖離）を模す
    const handle = renderHandle(store, [300, 100, 100])
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 550, pointerId: 1 })
    // 基準(300) + 50 = 350 が store へ書き戻る。store(100) を基準にしていたら
    // 150 になっていたはず——ここがデッドゾーンと意図の巻き戻りを直した部分
    expect(store.getSnapshot()).toEqual([350, 100, 100])
  })

  it('referenceWidths を渡すと、キーボード（→）も store の値とは無関係にそこからの差分で動く', () => {
    const store = createColumnWidthStore([100, 100, 100])
    const handle = renderHandle(store, [300, 100, 100])
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    // 基準(300) + step(16) = 316
    expect(store.getSnapshot()).toEqual([316, 100, 100])
  })
})
