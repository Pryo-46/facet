// @vitest-environment jsdom
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createColumnWidthStore } from '@/core/column-resize'
import { PaneSplitter } from './PaneSplitter'

const store = createColumnWidthStore([420])

beforeEach(() => {
  // モジュールスコープの可変状態はテスト間で漏れる
  store.reset()
})
afterEach(cleanup)

function setup() {
  const containerRef = createRef<HTMLElement>()
  render(
    <div ref={containerRef as React.RefObject<HTMLDivElement>}>
      <PaneSplitter containerRef={containerRef} store={store} />
    </div>,
  )
  return screen.getByRole('separator')
}

describe('PaneSplitter', () => {
  it('左へ引くとペインが広がる（向きが見た目どおり）', () => {
    const handle = setup()
    handle.setPointerCapture = () => undefined
    fireEvent.pointerDown(handle, { clientX: 800, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 700, pointerId: 1 })
    expect(store.getSnapshot()[0]).toBe(520)
  })

  it('← でも広がる（キーボードで届く）', () => {
    const handle = setup()
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(store.getSnapshot()[0]).toBeGreaterThan(420)
  })

  it('ダブルクリックで既定幅へ戻す', () => {
    const handle = setup()
    handle.setPointerCapture = () => undefined
    fireEvent.pointerDown(handle, { clientX: 800, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 600, pointerId: 1 })
    fireEvent.doubleClick(handle)
    expect(store.getSnapshot()[0]).toBe(420)
  })
})
