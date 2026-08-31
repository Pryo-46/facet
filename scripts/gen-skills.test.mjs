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

/** 生成物と原本の対（重複を除いた共有ソースごとに1組） */
const SHARED_PAIRS = [...new Set(Object.values(SKILL_SOURCES).flatMap((v) => v.shared))].map(
  (app) => {
    const found = Object.entries(SKILL_SOURCES).find(([, v]) => v.shared.includes(app))
    if (!found) throw new Error(`SKILL_SOURCES に shared=${app} が無い`)
    return { app, skill: found[0], base: path.basename(app).replace(/\.ts$/, '.mjs') }
  },
)

describe.each(SHARED_PAIRS)('生成した $base', ({ app, skill, base }) => {
  it('import 文が1つも残らない（自己完結している）', () => {
    // 値 import があると置いた先で解決できず、書き出しスクリプトが落ちる。
    // 型のみの import は transpileModule が落とすので、残るなら値 import である
    const src = readFileSync(generatedPath(skill, base), 'utf8')
    expect(src).not.toMatch(/^\s*import\b/m)
  })

  it('原本が消去できない構文（enum / パラメータプロパティ）を持たない', () => {
    // transpileModule は型注釈しか落とせない。enum は実行時の値を持つ
    const src = readFileSync(app, 'utf8')
    expect(src).not.toMatch(/^\s*(export\s+)?(const\s+)?enum\s/m)
    expect(src).not.toMatch(/constructor\s*\([^)]*\b(public|private|protected|readonly)\s/)
  })
})

describe('生成した canonical.mjs', () => {
  it.each(SAMPLES)('%s の正規形がアプリ側と一致する', async (file, schemaName) => {
    // バイト一致コピーを捨てた代わりに、**出力の一致**で変換の健全性を見る
    const skill = skillOf(schemaName)
    const gen = await import(
      pathToFileURL(path.resolve(generatedPath(skill, 'canonical.mjs'))).href
    )
    const app = await import('../src/core/canonical.ts')
    const data = JSON.parse(readFileSync(path.join('sample-project', file), 'utf8'))
    const schema = JSON.parse(
      readFileSync(path.join('schemas', `${schemaName}.schema.json`), 'utf8'),
    )
    expect(gen.serialize(data, schema)).toBe(app.serialize(data, schema))
  })
})

describe('生成した derive.mjs', () => {
  it('お手本の集計行がアプリ側と一致する', async () => {
    const gen = await import(
      pathToFileURL(path.resolve(generatedPath('issue-tree-register', 'derive.mjs'))).href
    )
    const app = await import('../src/modules/issue-tree/derive.ts')
    const data = JSON.parse(readFileSync(path.join('sample-project', '課題ツリー.json'), 'utf8'))
    // 計画の誤り: poseQuestions は `{ issues, hypotheses }` を取る（data.issues 単体ではない）。
    // src/modules/issue-tree/derive.ts の型注釈で確認した
    expect(gen.tallyLine(gen.tallyQuestions(gen.poseQuestions(data)))).toBe(
      app.tallyLine(app.tallyQuestions(app.poseQuestions(data))),
    )
  })
})

describe('生成した flat-tree-core.mjs', () => {
  it('お手本の並べ直しがアプリ側と一致する', async () => {
    const gen = await import(
      pathToFileURL(path.resolve(generatedPath('logic-tree-register', 'flat-tree-core.mjs'))).href
    )
    const app = await import('../src/core/canvas/flat-tree-core.ts')
    const data = JSON.parse(
      readFileSync(path.join('sample-project', '応募が書類選考に進まないケース.json'), 'utf8'),
    )
    expect(gen.orderFlatNodes(data.nodes).map((n) => n.id)).toEqual(
      app.orderFlatNodes(data.nodes).map((n) => n.id),
    )
  })
})

describe('生成した questions.mjs', () => {
  it('お手本の先頭ステップの問いがアプリ側と一致する', async () => {
    const gen = await import(
      pathToFileURL(path.resolve(generatedPath('sequence-register', 'questions.mjs'))).href
    )
    const app = await import('../src/modules/sequence/questions.ts')
    const data = JSON.parse(
      readFileSync(path.join('sample-project', '応募から書類選考まで.json'), 'utf8'),
    )
    const step = data.steps[0]
    expect(gen.presentAnswers(step)).toEqual(app.presentAnswers(step))
    expect(gen.questionLabels(step)).toEqual(app.questionLabels(step))
  })
})
