import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FACET_SKILLS } from './skills'

/**
 * `FACET_SKILLS` の各要素は、ディレクトリ名であると同時に
 * `plugins/facet/skills/<名前>/SKILL.md` の frontmatter `name:` でもある
 * （skills.ts の doc 参照）。**この一致は何も強制していなかった**——
 * ディレクトリ名か frontmatter の `name` だけを変えても、他のテストは
 * 気づかない（書き込み Skill 5本は `skill-schema-copy.test.ts` が
 * 別の観点でたまたま拾うが、`read-project` はどのテストからも触られていない）
 */
describe('FACET_SKILLS とディレクトリ名・SKILL.md の name の一致', () => {
  it.each(FACET_SKILLS)('%s の SKILL.md frontmatter name が配列の要素と一致する', (name) => {
    const src = readFileSync(`plugins/facet/skills/${name}/SKILL.md`, 'utf8')
    const match = /^name:\s*(\S+)\s*$/m.exec(src)
    expect(match?.[1]).toBe(name)
  })
})
