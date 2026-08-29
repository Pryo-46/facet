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
 * logic-tree-m2 で `SCHEMA_COPIES` と同型の網羅アサーションをここへ置いた。
 * **6本目を足した人は、ここに足さないと赤くなる。**
 *
 * **1箇所に寄せたのは網羅の強制だけである。** バイト一致の検査そのものは
 * 各モジュールの skill-copy.test.ts にも**意図して残してある**——あちらは
 * 「値 import を持たない」「消去できない構文が無い」の検査を一緒に回し、
 * 自分のモジュール固有のコピーも見るためで、消すとその検査まで落ちる
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
