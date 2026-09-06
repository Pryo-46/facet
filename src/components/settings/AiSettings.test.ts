import { describe, expect, it } from 'vitest'
import { FACET_SKILLS } from '@/core/skills'
import { SKILL_LABELS } from './AiSettings'

describe('設定の AI タブが挙げる Skill', () => {
  it('配るすべての Skill を挙げる', () => {
    expect(SKILL_LABELS.map((s) => s.name).sort()).toEqual([...FACET_SKILLS].sort())
  })
})
