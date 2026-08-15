import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * glossary / error-catalog の登録 Skill は src/core/canonical.ts の
 * バイト一致コピーを持つ（sequence-register が確立した方式。src/modules/
 * sequence/skill-copy.test.ts と同じ理由——手複製は追従漏れが検知されない）。
 * 「値 import を持たないこと」の検査は元ファイル共通なので sequence 側の
 * テストに任せ、ここではコピーごとのバイト一致だけを縛る
 */
const COPIES = [
  '.claude/skills/glossary-term-register/scripts/canonical.ts',
  '.claude/skills/error-catalog-register/scripts/canonical.ts',
]

describe('canonical.ts のバイト一致コピー（旧2 Skill）', () => {
  it.each(COPIES)('%s が src/core/canonical.ts とバイト一致する', (copy) => {
    expect(readFileSync(copy)).toEqual(readFileSync('src/core/canonical.ts'))
  })
})
