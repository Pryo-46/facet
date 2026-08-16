import { beforeEach, describe, expect, it, vi } from 'vitest'

const existsMock = vi.fn()
const mkdirMock = vi.fn()
const readTextFileMock = vi.fn()
const writeTextFileMock = vi.fn()

// settings-fs が読む @tauri-apps/* は全部モックする。project-fs.test.ts と同じ理由
// （テストは node 環境で走り、実物は Tauri の webview を前提にしているため）
vi.mock('@tauri-apps/api/path', () => ({
  appConfigDir: async () => 'C:\\config',
  join: async (...parts: string[]) => parts.join('\\'),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: (...args: unknown[]) => existsMock(...args),
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  readTextFile: (...args: unknown[]) => readTextFileMock(...args),
  writeTextFile: (...args: unknown[]) => writeTextFileMock(...args),
}))

// モックの登録後に読む必要があるので動的 import にする
const { readLastProjectDir, saveLastProjectDir } = await import('./settings-fs')

beforeEach(() => {
  existsMock.mockReset()
  mkdirMock.mockReset()
  readTextFileMock.mockReset()
  writeTextFileMock.mockReset()
})

describe('readLastProjectDir', () => {
  it('保存済みのパスを返す', async () => {
    readTextFileMock.mockResolvedValue('{"lastProjectDir":"C:\\\\proj"}')
    await expect(readLastProjectDir()).resolves.toBe('C:\\proj')
    expect(readTextFileMock).toHaveBeenCalledWith('C:\\config\\settings.json')
  })

  it('ファイルが無ければ null（例外を投げない）', async () => {
    readTextFileMock.mockRejectedValue(new Error('not found'))
    await expect(readLastProjectDir()).resolves.toBeNull()
  })

  it('JSON が壊れていても null（例外を投げない）', async () => {
    readTextFileMock.mockResolvedValue('{not json')
    await expect(readLastProjectDir()).resolves.toBeNull()
  })

  it('lastProjectDir キーが無ければ null', async () => {
    readTextFileMock.mockResolvedValue('{}')
    await expect(readLastProjectDir()).resolves.toBeNull()
  })

  it('lastProjectDir が空文字列でも null（fs scope をルート全体に広げないため）', async () => {
    readTextFileMock.mockResolvedValue('{"lastProjectDir":""}')
    await expect(readLastProjectDir()).resolves.toBeNull()
  })
})

describe('saveLastProjectDir', () => {
  it('設定ディレクトリが無ければ作ってから書き込む', async () => {
    existsMock.mockResolvedValue(false)
    await saveLastProjectDir('C:\\proj')
    expect(existsMock).toHaveBeenCalledWith('C:\\config')
    expect(mkdirMock).toHaveBeenCalledWith('C:\\config', { recursive: true })
    expect(writeTextFileMock).toHaveBeenCalledWith(
      'C:\\config\\settings.json',
      JSON.stringify({ lastProjectDir: 'C:\\proj' }),
    )
  })

  it('設定ディレクトリが既にあれば mkdir を呼ばない', async () => {
    existsMock.mockResolvedValue(true)
    await saveLastProjectDir('C:\\proj')
    expect(mkdirMock).not.toHaveBeenCalled()
    expect(writeTextFileMock).toHaveBeenCalled()
  })
})
