import { beforeEach, describe, expect, it, vi } from 'vitest'

const writeText = vi.fn<(text: string) => Promise<void>>()
const writeHtml = vi.fn<(html: string, altText?: string) => Promise<void>>()
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText, writeHtml }))

const invoke = vi.fn<(cmd: string) => Promise<unknown>>()
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

const { copyToClipboard, copyHtmlToClipboard, readClipboardHtml } = await import('./clipboard')

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

describe('copyHtmlToClipboard', () => {
  beforeEach(() => {
    writeHtml.mockReset()
    writeHtml.mockResolvedValue(undefined)
  })

  it('HTML と altText の両方を渡す', async () => {
    await copyHtmlToClipboard('<span data-meta="x"></span>', '親\n子')
    expect(writeHtml).toHaveBeenCalledWith('<span data-meta="x"></span>', '親\n子')
  })

  it('失敗はそのまま投げる（呼び出し側がバナーを出す）', async () => {
    writeHtml.mockRejectedValue(new Error('denied'))
    await expect(copyHtmlToClipboard('<p>x</p>', 'x')).rejects.toThrow('denied')
  })
})

describe('readClipboardHtml', () => {
  beforeEach(() => {
    invoke.mockReset()
  })

  it('自前コマンドの結果をそのまま返す', async () => {
    invoke.mockResolvedValue('<html>…</html>')
    await expect(readClipboardHtml()).resolves.toBe('<html>…</html>')
    expect(invoke).toHaveBeenCalledWith('read_clipboard_html')
  })

  it('HTML が載っていなければ空文字（投げない）', async () => {
    // arboard は HTML が無いときエラーを返す。**それは異常ではなく日常的な状態**
    invoke.mockRejectedValue(new Error('ClipboardNotSupported'))
    await expect(readClipboardHtml()).resolves.toBe('')
  })
})
