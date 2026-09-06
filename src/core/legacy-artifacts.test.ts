import { describe, expect, it } from 'vitest'
import { describeLegacyArtifacts } from './legacy-artifacts'

describe('旧版の成果物の知らせ', () => {
  it('何も無ければ知らせない', () => {
    expect(describeLegacyArtifacts({ skills: [], guide: false })).toBeNull()
  })

  it('Skill だけがあるときは、その名前を挙げて消すよう促す', () => {
    const message = describeLegacyArtifacts({ skills: ['glossary-term-register'], guide: false })
    expect(message).toContain('.claude/skills/glossary-term-register')
    expect(message).toContain('消してください')
  })

  it('ガイドだけがあるときは、そのファイル名を挙げる', () => {
    const message = describeLegacyArtifacts({ skills: [], guide: true })
    expect(message).toContain('README-for-AI.md')
  })

  it('両方あるときは1つの知らせにまとめる', () => {
    const message = describeLegacyArtifacts({ skills: ['sequence-register'], guide: true })
    expect(message).toContain('.claude/skills/sequence-register')
    expect(message).toContain('README-for-AI.md')
  })
})
