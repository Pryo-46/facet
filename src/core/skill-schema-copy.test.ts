import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUNDLED_SKILLS, shouldSyncSkillFile } from './skill-sync'

/**
 * 同梱 Skill は、自分が検証に使う JSON Schema のバイト一致コピーを持つ。
 *
 * **なぜコピーなのか。** 書き出しスクリプトはスキーマを実行時に探索するが、
 * 探索先に実体が無ければ見つからない——`schemas/` は facet のリポジトリに
 * しか無く、アプリが同梱・配布するのは `.claude/skills/` だけである。
 * したがって **facet のチェックアウトを持たないマシン（＝出荷先のすべて）では
 * 3本の登録 Skill が最初の書き込みで `die(2)` する。** `--schema` /
 * 環境変数という逃げ道も、指す先のファイルがどこにも無いので使えない。
 *
 * rev 3章の当初の判断は「スキーマの正は一つ。コピーを同梱しない」だったが、
 * その根拠（正が2つあると片方だけ古いまま検証が通る）は sequence-m4 で
 * 確立した機構——**バイト一致のコピー＋一致を強制するテスト**——が無効化する。
 * ズレた瞬間にここが赤くなるので、手複製とは質が違う（`skill-copy.test.ts`
 * がアプリのソース2本に対して行っているのと同じことを、スキーマに対して行う）。
 *
 * **置き場所は `<Skill>/schemas/<名前>.schema.json` でなければならない。**
 * 書き出しスクリプトの `findSchema` は SKILL_DIR を起点に上へ辿りながら
 * 各階層で `<dir>/<名前>.schema.json` と `<dir>/schemas/<名前>.schema.json` を
 * 見るので、この位置なら第1階層で当たる。動かすと探索から外れる
 */
const SCHEMA_COPIES = [
  {
    skill: 'glossary-term-register',
    schema: 'glossary.schema.json',
    script: 'scripts/glossary-write.mjs',
  },
  {
    skill: 'error-catalog-register',
    schema: 'error-catalog.schema.json',
    script: 'scripts/error-catalog-write.mjs',
  },
  {
    skill: 'sequence-register',
    schema: 'sequence.schema.json',
    script: 'scripts/sequence-write.mjs',
  },
  {
    skill: 'issue-tree-register',
    schema: 'issue-tree.schema.json',
    script: 'scripts/issue-tree-write.mjs',
  },
  {
    skill: 'logic-tree-register',
    schema: 'logic-tree.schema.json',
    script: 'scripts/logic-tree-write.mjs',
  },
]

describe('同梱 Skill が配布するスキーマ', () => {
  it('BUNDLED_SKILLS のすべてを網羅する', () => {
    // 同梱 Skill を増やしたらここも増やす（増やし忘れると、その Skill だけが
    // 出荷先で「スキーマが見つかりません」に戻る）
    expect(SCHEMA_COPIES.map((c) => c.skill).sort()).toEqual([...BUNDLED_SKILLS].sort())
  })

  describe.each(SCHEMA_COPIES)('$skill', ({ skill, schema, script }) => {
    const copyPath = `.claude/skills/${skill}/schemas/${schema}`

    it(`schemas/${schema} とバイト一致する`, () => {
      expect(readFileSync(copyPath)).toEqual(readFileSync(`schemas/${schema}`))
    })

    it('書き出しスクリプトが探すファイル名と一致する', () => {
      // findSchema はスキーマをファイル名で探す。スクリプト側の名前だけを
      // 変えるとコピーが探索から外れるので、名前の対応をここで固定する
      const src = readFileSync(`.claude/skills/${skill}/${script}`, 'utf8')
      expect(src).toContain(`"${schema}"`)
    })

    it('プロジェクトフォルダへ同期される', () => {
      // 置き直しの除外（evals/・.gitignore・node_modules/）に当たらないこと。
      // 除外に当たると同梱物には入るのに置いた先には現れない
      expect(shouldSyncSkillFile(`schemas/${schema}`)).toBe(true)
    })
  })
})
