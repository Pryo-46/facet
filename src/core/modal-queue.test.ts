import { describe, expect, it, vi } from 'vitest'
import { pushModal, shiftModal, type ModalRequest } from './modal-queue'

function confirmReq(title: string, key?: string): ModalRequest {
  return {
    kind: 'confirm',
    key,
    title,
    description: '',
    confirmLabel: 'OK',
    onConfirm: vi.fn(),
  }
}

describe('pushModal', () => {
  it('空のキューへ足す', () => {
    expect(pushModal([], confirmReq('A'))).toHaveLength(1)
  })

  it('key が無い要求は積まれる（先頭は表示中なので入れ替えない）', () => {
    const queue = pushModal(pushModal([], confirmReq('A')), confirmReq('B'))
    expect(queue.map((r) => r.title)).toEqual(['A', 'B'])
  })

  it('同じ key の要求は位置を保ったまま置き換える', () => {
    const queue = [confirmReq('A', 'close'), confirmReq('B')]
    const next = pushModal(queue, confirmReq('A2', 'close'))
    expect(next.map((r) => r.title)).toEqual(['A2', 'B'])
  })
})

describe('shiftModal', () => {
  it('先頭を落とす', () => {
    const queue = [confirmReq('A'), confirmReq('B')]
    expect(shiftModal(queue).map((r) => r.title)).toEqual(['B'])
  })

  it('空のキューでも落ちない', () => {
    expect(shiftModal([])).toEqual([])
  })
})
