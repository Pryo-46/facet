import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
// project-fs が読む @tauri-apps/* は全部モックする。テストは node 環境で走り、
// 実物は Tauri の webview を前提にしているため
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }))
vi.mock('@tauri-apps/api/path', () => ({ join: async (...parts: string[]) => parts.join('\\') }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))
vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}))

// モックの登録後に読む必要があるので動的 import にする
const { moveFileToTrash } = await import('./project-fs')

beforeEach(() => {
  invoke.mockReset()
  invoke.mockResolvedValue(undefined)
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
