import { beforeEach, describe, expect, it, vi } from 'vitest'

const readTextFileMock = vi.fn()

// claude-plugin.ts が読む @tauri-apps/* は全部モックする。settings-fs.test.ts と
// 同じ理由（テストは node 環境で走り、実物は Tauri の webview を前提にしているため）
vi.mock('@tauri-apps/api/path', () => ({
  homeDir: async () => 'C:\\home',
  join: async (...parts: string[]) => parts.join('\\'),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: (...args: unknown[]) => readTextFileMock(...args),
}))

// モックの登録後に読む必要があるので動的 import にする
const { readFacetPluginEnabled } = await import('./claude-plugin')

beforeEach(() => {
  readTextFileMock.mockReset()
})

describe('readFacetPluginEnabled', () => {
  it('導入・有効化済みなら true', async () => {
    readTextFileMock.mockResolvedValue(
      JSON.stringify({ enabledPlugins: { 'facet@facet': true } }),
    )
    await expect(readFacetPluginEnabled()).resolves.toBe(true)
    expect(readTextFileMock).toHaveBeenCalledWith('C:\\home\\.claude\\settings.json')
  })

  it('キーが無ければ未導入として扱う', async () => {
    readTextFileMock.mockResolvedValue(JSON.stringify({ enabledPlugins: {} }))
    await expect(readFacetPluginEnabled()).resolves.toBe(false)
  })

  it('値が true でなければ未導入として扱う（false や文字列も同様）', async () => {
    readTextFileMock.mockResolvedValue(
      JSON.stringify({ enabledPlugins: { 'facet@facet': false } }),
    )
    await expect(readFacetPluginEnabled()).resolves.toBe(false)
  })

  it('読めなければ未導入として扱う（例外を投げない）', async () => {
    readTextFileMock.mockRejectedValue(new Error('not found'))
    await expect(readFacetPluginEnabled()).resolves.toBe(false)
  })

  it('JSON が壊れていても未導入として扱う（例外を投げない）', async () => {
    readTextFileMock.mockResolvedValue('{not json')
    await expect(readFacetPluginEnabled()).resolves.toBe(false)
  })

  it('enabledPlugins が無い／オブジェクトでなくても未導入として扱う', async () => {
    readTextFileMock.mockResolvedValue(JSON.stringify({ enabledPlugins: 'not-an-object' }))
    await expect(readFacetPluginEnabled()).resolves.toBe(false)
  })
})
