import { describe, expect, it } from 'vitest'
import { dismissToast, MAX_TOASTS, pushToast, type ToastItem } from './toasts'

function toast(id: number, over: Partial<ToastItem> = {}): ToastItem {
  return { id, message: `通知${id}`, ...over }
}

describe('pushToast', () => {
  it('末尾に足す', () => {
    const list = pushToast(pushToast([], toast(1)), toast(2))
    expect(list.map((t) => t.id)).toEqual([1, 2])
  })

  it('同じ key の通知は位置を保ったまま置き換える（連続する外部変更で積み上がらない）', () => {
    const list = [toast(1, { key: 'external:A' }), toast(2)]
    const next = pushToast(list, toast(3, { key: 'external:A', message: '新しい通知' }))
    expect(next.map((t) => t.id)).toEqual([3, 2])
    expect(next[0].message).toBe('新しい通知')
  })

  it('key が無い通知は常に足される', () => {
    const next = pushToast([toast(1)], toast(2))
    expect(next).toHaveLength(2)
  })

  it('上限を超えたら古い方から落とす', () => {
    let list: ToastItem[] = []
    for (let id = 1; id <= MAX_TOASTS + 2; id++) list = pushToast(list, toast(id))
    expect(list).toHaveLength(MAX_TOASTS)
    expect(list[0].id).toBe(3)
  })
})

describe('dismissToast', () => {
  it('id で1件落とす', () => {
    expect(dismissToast([toast(1), toast(2)], 1).map((t) => t.id)).toEqual([2])
  })

  it('無い id は何もしない', () => {
    expect(dismissToast([toast(1)], 9)).toHaveLength(1)
  })
})
