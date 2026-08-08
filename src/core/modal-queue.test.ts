import { describe, expect, it, vi } from 'vitest'
import { clearModals, dropModal, pushModal, shiftModal, type ModalRequest } from './modal-queue'

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

describe('dropModal', () => {
  it('同じ key の要求を取り下げる（表示中でも待機中でも）', () => {
    const a: ModalRequest = { kind: 'confirm', key: 'delete:X', title: 't', description: 'd', confirmLabel: 'ok', onConfirm: () => {} }
    const b: ModalRequest = { kind: 'confirm', key: 'close', title: 't', description: 'd', confirmLabel: 'ok', onConfirm: () => {} }
    expect(dropModal([a, b], 'delete:X')).toEqual([b])
    expect(dropModal([a, b], 'nope')).toEqual([a, b])
  })
})

describe('clearModals', () => {
  it('全部取り下げる（フォルダを切り替えたら前のフォルダの要求は意味を失う）', () => {
    expect(clearModals()).toEqual([])
  })
})
