import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LEGACY_GUIDE_MARK } from '@/core/legacy-artifacts'

const invokeMock = vi.fn()
const existsMock = vi.fn()
const readTextFileMock = vi.fn()

// legacy-artifacts-io.ts が読む @tauri-apps/* は全部モックする。claude-plugin.test.ts と
// 同じ理由（テストは node 環境で走り、実物は Tauri の webview を前提にしているため）
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))
vi.mock('@tauri-apps/api/path', () => ({
  join: async (...parts: string[]) => parts.join('/'),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: (...args: unknown[]) => existsMock(...args),
  readTextFile: (...args: unknown[]) => readTextFileMock(...args),
}))

// モックの登録後に読む必要があるので動的 import にする
const { findLegacyArtifacts } = await import('./legacy-artifacts-io')

beforeEach(() => {
  invokeMock.mockReset()
  existsMock.mockReset()
  readTextFileMock.mockReset()
  invokeMock.mockResolvedValue(undefined)
  existsMock.mockResolvedValue(false)
  readTextFileMock.mockResolvedValue('')
})

describe('findLegacyArtifacts', () => {
  it('旧版の Skill を見つける', async () => {
    existsMock.mockImplementation(async (path: string) =>
      path.endsWith('.claude/skills/glossary-term-register'),
    )
    const found = await findLegacyArtifacts('/proj')
    expect(found.skills).toEqual(['glossary-term-register'])
  })

  it('目印のあるガイドは旧版のものとして扱う', async () => {
    existsMock.mockImplementation(async (path: string) => path.endsWith('README-for-AI.md'))
    readTextFileMock.mockResolvedValue(`前置き\n${LEGACY_GUIDE_MARK}\n続き`)
    const found = await findLegacyArtifacts('/proj')
    expect(found.guide).toBe(true)
  })

  it('目印の無い同名ファイルは旧版のものとして扱わない', async () => {
    existsMock.mockImplementation(async (path: string) => path.endsWith('README-for-AI.md'))
    readTextFileMock.mockResolvedValue('利用者が自分で書いた文章')
    const found = await findLegacyArtifacts('/proj')
    expect(found.guide).toBe(false)
  })

  it('exists が読めなくても例外を投げず「無い」に倒れる', async () => {
    existsMock.mockRejectedValue(new Error('forbidden path'))
    await expect(findLegacyArtifacts('/proj')).resolves.toEqual({ skills: [], guide: false })
  })

  it('readTextFile が読めなくても例外を投げず「無い」に倒れる', async () => {
    existsMock.mockImplementation(async (path: string) => path.endsWith('README-for-AI.md'))
    readTextFileMock.mockRejectedValue(new Error('denied'))
    await expect(findLegacyArtifacts('/proj')).resolves.toEqual({ skills: [], guide: false })
  })

  it('allow_dot_claude の許可が取れなくても例外を投げず「無い」に倒れる', async () => {
    invokeMock.mockRejectedValue(new Error('scope error'))
    await expect(findLegacyArtifacts('/proj')).resolves.toEqual({ skills: [], guide: false })
  })
})
