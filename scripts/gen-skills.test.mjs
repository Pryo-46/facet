import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SKILL_SOURCES } from './gen-skills.mjs'
import { BUNDLED_SKILLS } from '../src/core/skill-sync.ts'

/**
 * 同梱 Skill の生成物（`scripts/generated/`）を検査する。
 *
 * **バイト一致コピーの検査を置き換えたもの。** かつては Skill 側に置いた
 * `.ts` がアプリ側とバイト一致することを見ていたが、生成物になった以上
 * ズレようがない。代わりに見るのは「**変換が壊れていないか**」である
 * ——生成物が実際に動き、アプリ側と同じ結果を返すこと。
 *
 * **網羅の強制はここへ引き継いだ**（旧 `skill-canonical-copy.test.ts`）。
 * `SKILL_SOURCES` は手書きの表で、`BUNDLED_SKILLS` から導出していない
 * ——導出すると恒真式になり何も縛らない。**6本目の Skill を足した人が
 * 表に足し忘れると、ここが赤くなる。**
 */

/** お手本ファイルと、それを検証するスキーマ名 */
const SAMPLES = [
  ['用語集.json', 'glossary'],
  ['エラーカタログ.json', 'error-catalog'],
  ['応募から書類選考まで.json', 'sequence'],
  ['課題ツリー.json', 'issue-tree'],
  ['応募が書類選考に進まないケース.json', 'logic-tree'],
]

function skillOf(schema) {
  const found = Object.entries(SKILL_SOURCES).find(([, v]) => v.schema === schema)
  if (!found) throw new Error(`SKILL_SOURCES に schema=${schema} が無い`)
  return found[0]
}

/** vitest の cwd はプロジェクトルート。相対のまま組み立ててよい */
function generatedPath(skill, file) {
  return path.join('.claude', 'skills', skill, 'scripts', 'generated', file)
}

describe('SKILL_SOURCES', () => {
  it('BUNDLED_SKILLS のすべてを網羅する', () => {
    expect(Object.keys(SKILL_SOURCES).sort()).toEqual([...BUNDLED_SKILLS].sort())
  })
})

describe.each(SAMPLES)('生成した validate.mjs（%s）', (file, schema) => {
  it('お手本を通し、スキーマ違反を弾く', async () => {
    const skill = skillOf(schema)
    const mod = await import(pathToFileURL(path.resolve(generatedPath(skill, 'validate.mjs'))).href)
    const validate = mod.default
    const data = JSON.parse(readFileSync(path.join('sample-project', file), 'utf8'))
    expect(validate(data)).toBe(true)

    const broken = structuredClone(data)
    broken.schemaVersion = 'これはスキーマ違反'
    expect(validate(broken)).toBe(false)
    // エラーの形が ajv 本体と同じであること（各スクリプトの整形コードが依存する）
    expect(validate.errors?.[0]).toMatchObject({ instancePath: '/schemaVersion', keyword: 'const' })
  })

  it('CJS の require が1件も残らない', () => {
    // ajv は minLength / maxLength を持つスキーマで ucs2length を require する。
    // 埋め込み置換が効かないと、置いた先で解決できず実行時に落ちる
    const src = readFileSync(generatedPath(skillOf(schema), 'validate.mjs'), 'utf8')
    expect(src).not.toMatch(/\brequire\(/)
  })
})
