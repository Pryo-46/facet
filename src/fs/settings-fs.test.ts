import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@/core/settings'

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
const { readLastProjectDir, saveLastProjectDir, readSettings, saveSettings } =
  await import('./settings-fs')

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

describe('readSettings', () => {
  it('保存済みの設定を読む', async () => {
    readTextFileMock.mockResolvedValue(
      '{"theme":"dark","canvas":{"panWithRightDrag":true}}',
    )
    const settings = await readSettings()
    expect(settings.theme).toBe('dark')
    expect(settings.canvas.panWithRightDrag).toBe(true)
    // 欠けたキーは既定で埋まる
    expect(settings.canvas.zoomWithoutModifier).toBe(true)
  })

  it('ファイルが無ければ既定（例外を投げない）', async () => {
    readTextFileMock.mockRejectedValue(new Error('not found'))
    await expect(readSettings()).resolves.toEqual(DEFAULT_SETTINGS)
  })

  it('JSON が壊れていても既定（例外を投げない）', async () => {
    readTextFileMock.mockResolvedValue('{not json')
    await expect(readSettings()).resolves.toEqual(DEFAULT_SETTINGS)
  })
})

describe('書き込みは読んで merge する', () => {
  it('設定を書いても lastProjectDir が残る', async () => {
    existsMock.mockResolvedValue(true)
    readTextFileMock.mockResolvedValue('{"lastProjectDir":"C:\\\\proj"}')
    await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' })
    const written: unknown = JSON.parse(writeTextFileMock.mock.calls[0][1] as string)
    expect(written).toEqual({
      lastProjectDir: 'C:\\proj',
      theme: 'dark',
      canvas: DEFAULT_SETTINGS.canvas,
    })
  })

  it('フォルダを開いても設定が残る', async () => {
    existsMock.mockResolvedValue(true)
    readTextFileMock.mockResolvedValue('{"theme":"dark","canvas":{"panWithRightDrag":true}}')
    await saveLastProjectDir('C:\\proj')
    const written: unknown = JSON.parse(writeTextFileMock.mock.calls[0][1] as string)
    expect(written).toEqual({
      theme: 'dark',
      canvas: { panWithRightDrag: true },
      lastProjectDir: 'C:\\proj',
    })
  })

  it('読めないファイルの上へは新しい内容だけを書く', async () => {
    existsMock.mockResolvedValue(true)
    readTextFileMock.mockRejectedValue(new Error('not found'))
    await saveLastProjectDir('C:\\proj')
    expect(JSON.parse(writeTextFileMock.mock.calls[0][1] as string)).toEqual({
      lastProjectDir: 'C:\\proj',
    })
  })
})
