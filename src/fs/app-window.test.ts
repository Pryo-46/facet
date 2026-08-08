import { beforeEach, describe, expect, it, vi } from 'vitest'

const destroy = vi.fn()
const close = vi.fn()
const onCloseRequested = vi.fn()
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ destroy, close, onCloseRequested }),
}))

const { forceClose } = await import('./app-window')

beforeEach(() => {
  destroy.mockReset()
  destroy.mockResolvedValue(undefined)
  close.mockReset()
})

describe('forceClose', () => {
  it('destroy を呼ぶ（close だと onCloseRequested が再発火して閉じられなくなる）', async () => {
    await forceClose()
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()
  })

  it('destroy の失敗は呼び出し側へ伝わる（脱出口が無音で失敗しないため）', async () => {
    destroy.mockRejectedValue(new Error('ACL 拒否'))
    await expect(forceClose()).rejects.toThrow('ACL 拒否')
  })
})
