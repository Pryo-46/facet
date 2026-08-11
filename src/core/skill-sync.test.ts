import { describe, expect, it } from 'vitest'
import { syncBundledSkills, type SkillSyncIo } from './skill-sync'

function fakeIo(existing: string[] = []) {
  const removed: string[] = []
  const written: Array<{ path: string; text: string }> = []
  const dirs: string[] = []
  const io: SkillSyncIo = {
    readBundled: async (skill) => [
      { path: 'SKILL.md', text: `# ${skill}` },
      { path: 'scripts/write.mjs', text: 'export {}' },
    ],
    exists: async (path) => existing.includes(path),
    removeDir: async (path) => {
      removed.push(path)
    },
    mkdir: async (path) => {
      dirs.push(path)
    },
    writeText: async (path, text) => {
      written.push({ path, text })
    },
    join: async (...parts) => parts.join('/'),
  }
  return { io, removed, written, dirs }
}

describe('syncBundledSkills', () => {
  it('同梱 Skill を .claude/skills/<名前>/ へ置く', async () => {
    const { io, written } = fakeIo()
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    expect(written.map((w) => w.path)).toEqual([
      '/proj/.claude/skills/glossary-term-register/SKILL.md',
      '/proj/.claude/skills/glossary-term-register/scripts/write.mjs',
    ])
    expect(written[0]?.text).toBe('# glossary-term-register')
  })

  it('既にあるディレクトリは消してから置き直す（Skill の更新を取り残さない）', async () => {
    const { io, removed } = fakeIo(['/proj/.claude/skills/glossary-term-register'])
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    expect(removed).toEqual(['/proj/.claude/skills/glossary-term-register'])
  })

  it('無いディレクトリは消そうとしない', async () => {
    const { io, removed } = fakeIo()
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    expect(removed).toEqual([])
  })

  it('**ユーザーが置いた Skill には触らない**', async () => {
    // .claude/skills/ を丸ごと消すと、ユーザーの Skill が巻き添えになる。
    // facet が壊してよいのは facet が書いたものだけ
    const { io, removed } = fakeIo([
      '/proj/.claude/skills/glossary-term-register',
      '/proj/.claude/skills/my-own-skill',
    ])
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    expect(removed).toEqual(['/proj/.claude/skills/glossary-term-register'])
    expect(removed).not.toContain('/proj/.claude/skills/my-own-skill')
    expect(removed).not.toContain('/proj/.claude/skills')
  })

  it('入れ子のファイルの親ディレクトリを作る', async () => {
    const { io, dirs } = fakeIo()
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    expect(dirs).toContain('/proj/.claude/skills/glossary-term-register/scripts')
  })

  it('1本が失敗しても残りを置く', async () => {
    const { io, written } = fakeIo()
    const failing: SkillSyncIo = {
      ...io,
      readBundled: async (skill) => {
        if (skill === 'a') throw new Error('読めません')
        return [{ path: 'SKILL.md', text: skill }]
      },
    }
    await expect(syncBundledSkills('/proj', failing, ['a', 'b'])).rejects.toThrow('読めません')
    expect(written.map((w) => w.text)).toEqual(['b'])
  })
})
