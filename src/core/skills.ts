/**
 * facet がプラグインとして配る Skill の名前。
 *
 * **ディレクトリ名・`SKILL.md` の `name`・この配列の3つが一致する。**
 * ズレると、同梱物には入るのに `plugins/facet/skills/<名前>` が見つからない
 */
export const WRITE_SKILLS: readonly string[] = [
  'write-term',
  'write-error',
  'write-sequence',
  'write-issue-tree',
  'write-logic-tree',
]

/** データを読むだけの Skill */
export const READ_SKILL = 'read-project'

/** facet が配る Skill のすべて */
export const FACET_SKILLS: readonly string[] = [READ_SKILL, ...WRITE_SKILLS]
