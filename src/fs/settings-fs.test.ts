import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@/core/settings'
import type { RegisteredProject } from '@/core/projects'

const juchu: RegisteredProject = {
  path: 'C:\\work\\juchu',
  name: '受注',
  favorite: false,
  lastOpenedAt: '2026-03-01T00:00:00.000Z',
}

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
const { readLastProjectDir, readSettings, saveSettings, readProjects, saveProjects } =
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

  it('登録を書いても設定が残る', async () => {
    existsMock.mockResolvedValue(true)
    readTextFileMock.mockResolvedValue('{"theme":"dark","canvas":{"panWithRightDrag":true}}')
    await saveProjects([juchu])
    const written: unknown = JSON.parse(writeTextFileMock.mock.calls[0][1] as string)
    expect(written).toEqual({
      theme: 'dark',
      canvas: { panWithRightDrag: true },
      projects: [juchu],
    })
  })

  it('読めないファイルの上へは新しい内容だけを書く', async () => {
    existsMock.mockResolvedValue(true)
    readTextFileMock.mockRejectedValue(new Error('not found'))
    await saveProjects([juchu])
    expect(JSON.parse(writeTextFileMock.mock.calls[0][1] as string)).toEqual({
      projects: [juchu],
    })
  })
})

describe('readProjects', () => {
  it('保存済みの一覧を正規化して返す', async () => {
    readTextFileMock.mockResolvedValue(
      '{"projects":[{"path":"C:\\\\work\\\\a","name":"受注","favorite":true,"lastOpenedAt":"2026-03-01T00:00:00.000Z"}]}',
    )
    await expect(readProjects()).resolves.toEqual([
      { path: 'C:\\work\\a', name: '受注', favorite: true, lastOpenedAt: '2026-03-01T00:00:00.000Z' },
    ])
  })

  it('ファイルが無ければ空（例外を投げない）', async () => {
    readTextFileMock.mockRejectedValue(new Error('not found'))
    await expect(readProjects()).resolves.toEqual([])
  })

  it('JSON が壊れていても空（例外を投げない）', async () => {
    readTextFileMock.mockResolvedValue('{not json')
    await expect(readProjects()).resolves.toEqual([])
  })

  it('projects が無ければ lastProjectDir を1件目として取り込む', async () => {
    readTextFileMock.mockResolvedValue('{"lastProjectDir":"C:\\\\work\\\\juchu"}')
    await expect(readProjects()).resolves.toEqual([
      {
        path: 'C:\\work\\juchu',
        name: 'juchu',
        favorite: false,
        lastOpenedAt: '1970-01-01T00:00:00.000Z',
      },
    ])
  })

  it('projects があれば lastProjectDir を見ない', async () => {
    readTextFileMock.mockResolvedValue(
      '{"projects":[{"path":"C:\\\\work\\\\a"}],"lastProjectDir":"C:\\\\work\\\\old"}',
    )
    const got = await readProjects()
    expect(got.map((p) => p.path)).toEqual(['C:\\work\\a'])
  })

  it('projects が空配列なら lastProjectDir を見ない', async () => {
    // 全部を一覧から外した状態を、移行前と取り違えない
    readTextFileMock.mockResolvedValue('{"projects":[],"lastProjectDir":"C:\\\\work\\\\old"}')
    await expect(readProjects()).resolves.toEqual([])
  })

  it('lastProjectDir が空文字列なら取り込まない', async () => {
    readTextFileMock.mockResolvedValue('{"lastProjectDir":""}')
    await expect(readProjects()).resolves.toEqual([])
  })
})

describe('saveProjects', () => {
  it('設定を保ったまま書く', async () => {
    existsMock.mockResolvedValue(true)
    readTextFileMock.mockResolvedValue('{"theme":"dark","canvas":{"panWithRightDrag":true}}')
    await saveProjects([
      { path: 'C:\\work\\a', name: '受注', favorite: false, lastOpenedAt: '2026-03-01T00:00:00.000Z' },
    ])
    expect(JSON.parse(writeTextFileMock.mock.calls[0][1] as string)).toEqual({
      theme: 'dark',
      canvas: { panWithRightDrag: true },
      projects: [
        { path: 'C:\\work\\a', name: '受注', favorite: false, lastOpenedAt: '2026-03-01T00:00:00.000Z' },
      ],
    })
  })

  it('設定を書いても projects が残る', async () => {
    existsMock.mockResolvedValue(true)
    readTextFileMock.mockResolvedValue('{"projects":[{"path":"C:\\\\work\\\\a"}]}')
    await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' })
    const written = JSON.parse(writeTextFileMock.mock.calls[0][1] as string) as Record<string, unknown>
    expect(written.projects).toEqual([{ path: 'C:\\work\\a' }])
  })

  it('設定ディレクトリが無ければ作ってから書き込む', async () => {
    existsMock.mockResolvedValue(false)
    await saveProjects([])
    expect(mkdirMock).toHaveBeenCalledWith('C:\\config', { recursive: true })
  })
})
