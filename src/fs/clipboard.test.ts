import { beforeEach, describe, expect, it, vi } from 'vitest'

const writeText = vi.fn<(text: string) => Promise<void>>()
const writeImage = vi.fn<(image: unknown) => Promise<void>>()
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText, writeImage }))

const fromBytes = vi.fn<(bytes: Uint8Array) => Promise<{ __brand: 'Image' }>>()
vi.mock('@tauri-apps/api/image', () => ({ Image: { fromBytes } }))

const { copyToClipboard, copyImageToClipboard } = await import('./clipboard')

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

describe('copyImageToClipboard', () => {
  beforeEach(() => {
    writeImage.mockReset()
    fromBytes.mockReset()
  })

  it('PNGバイト列を Image.fromBytes でデコードしてから writeImage へ渡す', async () => {
    const decoded = { __brand: 'Image' as const }
    fromBytes.mockResolvedValue(decoded)
    writeImage.mockResolvedValue(undefined)

    const bytes = new Uint8Array([137, 80, 78, 71])
    await copyImageToClipboard(bytes)

    expect(fromBytes).toHaveBeenCalledWith(bytes)
    expect(writeImage).toHaveBeenCalledWith(decoded)
  })

  it('失敗はそのまま投げる（呼び出し側がバナーを出す）', async () => {
    fromBytes.mockRejectedValue(new Error('decode failed'))
    await expect(copyImageToClipboard(new Uint8Array([1]))).rejects.toThrow('decode failed')
  })
})
