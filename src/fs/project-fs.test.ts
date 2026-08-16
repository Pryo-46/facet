import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
const watch = vi.fn()
const save = vi.fn()
// project-fs が読む @tauri-apps/* は全部モックする。テストは node 環境で走り、
// 実物は Tauri の webview を前提にしているため
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }))
vi.mock('@tauri-apps/api/path', () => ({ join: async (...parts: string[]) => parts.join('\\') }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: (...args: unknown[]) => save(...args) }))
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(),
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  watch: (...args: unknown[]) => watch(...args),
}))

// モックの登録後に読む必要があるので動的 import にする
const { allowProjectDir, askSaveMarkdownPath, moveFileToTrash, watchFolder, WATCH_DEBOUNCE_MS } = await import(
  './project-fs'
)

beforeEach(() => {
  invoke.mockReset()
  invoke.mockResolvedValue(undefined)
  watch.mockReset()
  save.mockReset()
})

describe('allowProjectDir', () => {
  it('自前コマンド allow_project_dir に dir を渡す', async () => {
    await allowProjectDir('C:\\proj')
    expect(invoke).toHaveBeenCalledWith('allow_project_dir', { dir: 'C:\\proj' })
  })

  it('コマンドが失敗したら例外がそのまま伝わる（呼び出し側が扱う）', async () => {
    invoke.mockRejectedValue(new Error('forbidden path'))
    await expect(allowProjectDir('C:\\proj')).rejects.toThrow('forbidden path')
  })
})

describe('moveFileToTrash', () => {
  it('自前コマンド move_to_trash に path を渡す', async () => {
    await moveFileToTrash('C:\\proj\\用語集.json')
    expect(invoke).toHaveBeenCalledWith('move_to_trash', { path: 'C:\\proj\\用語集.json' })
  })

  it('コマンドが失敗したら例外がそのまま伝わる（呼び出し側が UI に出す）', async () => {
    invoke.mockRejectedValue(new Error('アクセスが拒否されました'))
    await expect(moveFileToTrash('C:\\proj\\用語集.json')).rejects.toThrow('アクセスが拒否されました')
  })
})

describe('watchFolder', () => {
  it('フォルダを非再帰・デバウンス付きで監視する（rev 3章。ファイル単位では見ない）', async () => {
    const unwatch = vi.fn()
    watch.mockResolvedValue(unwatch)
    const onEvent = vi.fn()
    const stop = await watchFolder('C:\\proj', onEvent)

    expect(watch).toHaveBeenCalledTimes(1)
    const [path, , options] = watch.mock.calls[0]
    expect(path).toBe('C:\\proj')
    expect(options).toEqual({ recursive: false, delayMs: WATCH_DEBOUNCE_MS })

    // イベントの中身は見ない（「何か起きた」だけを伝える）
    const forwarded = watch.mock.calls[0][1] as (event: unknown) => void
    forwarded({ type: 'any', paths: ['C:\\proj\\用語集.json'], attrs: {} })
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith()

    stop()
    expect(unwatch).toHaveBeenCalledTimes(1)
  })
})

describe('askSaveMarkdownPath', () => {
  it('Markdown のフィルタと既定パスを渡し、選ばれたパスを返す', async () => {
    save.mockResolvedValue('C:\\out\\用語集.md')
    await expect(askSaveMarkdownPath('C:\\proj\\用語集.md')).resolves.toBe('C:\\out\\用語集.md')
    expect(save).toHaveBeenCalledWith({
      defaultPath: 'C:\\proj\\用語集.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
  })

  it('キャンセルは null（失敗ではない）', async () => {
    save.mockResolvedValue(null)
    await expect(askSaveMarkdownPath('C:\\proj\\用語集.md')).resolves.toBeNull()
  })
})
