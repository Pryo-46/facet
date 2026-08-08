import { describe, expect, it } from 'vitest'
import { dismissToast, dismissToastByKey, MAX_TOASTS, pushToast, type ToastItem } from './toasts'

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

  it('上限を超えても操作付きの通知は残る（退避の復元手段を追い出しで失わない）', () => {
    let list: ToastItem[] = [toast(1, { action: { label: '取り込み前に戻す', run: () => {} } })]
    for (let id = 2; id <= MAX_TOASTS + 2; id++) list = pushToast(list, toast(id))
    expect(list).toHaveLength(MAX_TOASTS)
    expect(list.some((t) => t.id === 1)).toBe(true)
  })

  it('押し込んだ通知は落とさない（操作付きが上限まで溜まっていても表示する）', () => {
    const withAction = (id: number) =>
      toast(id, { action: { label: '取り込み前に戻す', run: () => {} } })
    let list: ToastItem[] = []
    for (let id = 1; id <= MAX_TOASTS; id++) list = pushToast(list, withAction(id))
    // 操作付きばかりで埋まっている状態へ、操作の無い通知を押し込む
    const next = pushToast(list, toast(99))
    expect(next).toHaveLength(MAX_TOASTS)
    // 新しい通知は必ず残る（落とすと「出来事を知らせる」役目を果たせないまま消える）
    expect(next[next.length - 1].id).toBe(99)
    // 追い出されるのは最古の1件
    expect(next.some((t) => t.id === 1)).toBe(false)
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

describe('dismissToastByKey', () => {
  it('同じ key の通知を消す（key の無い通知は残す）', () => {
    const list = [
      { id: 1, message: 'a', key: 'external:X' },
      { id: 2, message: 'b' },
      { id: 3, message: 'c', key: 'external:Y' },
    ]
    expect(dismissToastByKey(list, 'external:X').map((t) => t.id)).toEqual([2, 3])
  })

  it('該当が無ければそのまま', () => {
    const list = [{ id: 1, message: 'a', key: 'external:X' }]
    expect(dismissToastByKey(list, 'external:Z')).toEqual(list)
  })
})
