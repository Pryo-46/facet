// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useFontGeneration } from './use-font-generation'

type Listener = (e: unknown) => void

let resolveReady: () => void
let listeners: Map<string, Set<Listener>>

beforeEach(() => {
  listeners = new Map()
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      ready: new Promise<void>((resolve) => {
        resolveReady = resolve
      }),
      addEventListener: (type: string, fn: Listener) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(fn)
      },
      removeEventListener: (type: string, fn: Listener) => {
        listeners.get(type)?.delete(fn)
      },
    },
  })
})

afterEach(() => {
  Reflect.deleteProperty(document, 'fonts')
})

const fire = (type: string, event: unknown): void => {
  for (const fn of listeners.get(type) ?? []) fn(event)
}

describe('useFontGeneration', () => {
  it('ready の解決と loadingdone の到着で世代が進む', async () => {
    const { result } = renderHook(() => useFontGeneration())
    expect(result.current).toBe(0)
    await act(async () => {
      resolveReady()
      await Promise.resolve()
    })
    expect(result.current).toBe(1)
    act(() => fire('loadingdone', { fontfaces: [{}] }))
    expect(result.current).toBe(2)
  })

  it('何も読み込まれなかった loadingdone では進まない', async () => {
    const { result } = renderHook(() => useFontGeneration())
    act(() => fire('loadingdone', { fontfaces: [] }))
    expect(result.current).toBe(0)
  })

  it('アンマウントで購読が外れ、以後のイベントで setState しない', () => {
    const { unmount } = renderHook(() => useFontGeneration())
    expect(listeners.get('loadingdone')?.size).toBe(1)
    unmount()
    expect(listeners.get('loadingdone')?.size).toBe(0)
  })
})
