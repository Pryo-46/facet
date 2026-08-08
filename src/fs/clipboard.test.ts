import { beforeEach, describe, expect, it, vi } from 'vitest'

const writeText = vi.fn<(text: string) => Promise<void>>()
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText }))

const { copyToClipboard } = await import('./clipboard')

describe('copyToClipboard', () => {
  beforeEach(() => {
    writeText.mockReset()
    writeText.mockResolvedValue(undefined)
  })

  it('プラグインの writeText へそのまま渡す', async () => {
    await copyToClipboard('## 用語集\n')
    expect(writeText).toHaveBeenCalledWith('## 用語集\n')
  })

  it('失敗はそのまま投げる（呼び出し側がバナーを出す）', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    await expect(copyToClipboard('x')).rejects.toThrow('denied')
  })
})
