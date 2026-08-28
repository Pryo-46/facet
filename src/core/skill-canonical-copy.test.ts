import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUNDLED_SKILLS } from './skill-sync'

/**
 * すべての同梱 Skill は src/core/canonical.ts のバイト一致コピーを持つ
 *（sequence-register が確立した方式——手複製は追従漏れが検知されない）。
 *
 * **この表は網羅を強制するためにある。** かつて検査は3ファイルに散っていて
 *（旧2本＝ここ／sequence・issue-tree＝各モジュールの skill-copy.test.ts）、
 * 新しい Skill がコピーを持ったのに検査を書き忘れても緑で通った。
 * logic-tree-m2 で1箇所へ集約し、`SCHEMA_COPIES` と同型の網羅アサーションを
 * 置いた。**6本目を足した人は、ここに足さないと赤くなる。**
 *
 * 「値 import を持たないこと」の検査は元ファイル共通なので各モジュールの
 * skill-copy.test.ts に任せる（あちらは自分のモジュール固有のコピーも見る）
 */
const CANONICAL_COPIES = [
  { skill: 'glossary-term-register' },
  { skill: 'error-catalog-register' },
  { skill: 'sequence-register' },
  { skill: 'issue-tree-register' },
  { skill: 'logic-tree-register' },
]

describe('canonical.ts のバイト一致コピー', () => {
  it('BUNDLED_SKILLS のすべてを網羅する', () => {
    expect(CANONICAL_COPIES.map((c) => c.skill).sort()).toEqual([...BUNDLED_SKILLS].sort())
  })

  it.each(CANONICAL_COPIES)('$skill が src/core/canonical.ts とバイト一致する', ({ skill }) => {
    expect(readFileSync(`.claude/skills/${skill}/scripts/canonical.ts`)).toEqual(
      readFileSync('src/core/canonical.ts'),
    )
  })
})
