/**
 * 同梱 Skill の生成物を作る（正は schemas/ と src/ の実体。コピーを手で作らない）。
 *
 * **`gen-types.mjs` と同じ思想だが、走査では決まらないので表を持つ。**
 * どの Skill がどの共有ソースを要るかはディレクトリ構造に現れないため。
 *
 * 生成物は追跡しない（`.gitignore`）。`src/types/*.ts` と同じ扱いで、
 * `pretest` / `prebuild` / `predev` / `prepare` の4経路で毎回作り直す
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)

/**
 * 同梱 Skill ごとの、スキーマ名と共有ソース。
 *
 * **手書きの表である。`BUNDLED_SKILLS` から導出しない**——導出すると
 * 恒真式になり、網羅を何も縛らなくなる（logic-tree-m2 で確立した理屈）。
 * 一致は `scripts/gen-skills.test.mjs` が強制する
 */
export const SKILL_SOURCES = {
  'glossary-term-register': { schema: 'glossary', shared: ['src/core/canonical.ts'] },
  'error-catalog-register': { schema: 'error-catalog', shared: ['src/core/canonical.ts'] },
  'sequence-register': {
    schema: 'sequence',
    shared: ['src/core/canonical.ts', 'src/modules/sequence/questions.ts'],
  },
  'issue-tree-register': {
    schema: 'issue-tree',
    shared: ['src/core/canonical.ts', 'src/modules/issue-tree/derive.ts'],
  },
  'logic-tree-register': {
    schema: 'logic-tree',
    shared: ['src/core/canonical.ts', 'src/core/canvas/flat-tree-core.ts'],
  },
}

/**
 * ajv の standalone 出力に残る CJS の `require` を潰すための実体。
 *
 * **`esm: true` を渡しても残る。** ajv は長さの数え方を
 * `ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default'`
 * という定数文字列として出力へ埋めるためで、`minLength` / `maxLength` を
 * 持つスキーマ（glossary / error-catalog / sequence）で実際に出る。
 *
 * 実体は `node_modules/ajv/dist/runtime/ucs2length.js` から逐語で写した
 */
const AJV_RUNTIME_INLINE = {
  'require("ajv/dist/runtime/ucs2length").default': `function ucs2length(str) {
  const len = str.length;
  let length = 0;
  let pos = 0;
  let value;
  while (pos < len) {
    length++;
    value = str.charCodeAt(pos++);
    if (value >= 0xd800 && value <= 0xdbff && pos < len) {
      value = str.charCodeAt(pos);
      if ((value & 0xfc00) === 0xdc00) pos++;
    }
  }
  return length;
}`,
}

/**
 * 埋め込み置換。**未知のランタイムが残ったら止める。**
 * 黙って通すと「実行するまで壊れていると分からない生成物」が配布される
 */
function inlineAjvRuntime(src, name) {
  let out = src
  for (const [needle, impl] of Object.entries(AJV_RUNTIME_INLINE)) {
    out = out.split(needle).join(`(${impl})`)
  }
  const left = [...out.matchAll(/\brequire\(([^)]*)\)/g)].map((m) => m[1])
  if (left.length > 0) {
    console.error(
      `gen:skills  ${name}: 未知の ajv ランタイムが残りました: ${JSON.stringify(left)}\n` +
        `  AJV_RUNTIME_INLINE に実体を足してください（node_modules/ajv/dist/runtime/ から逐語で写す）`,
    )
    process.exit(1)
  }
  return out
}

const entries = Object.entries(SKILL_SOURCES)

// 0件のまま黙って成功すると、生成物が無いことにテストで初めて気づく
if (entries.length === 0) {
  console.error('SKILL_SOURCES が空です')
  process.exit(1)
}

const Ajv2020 = require('ajv/dist/2020.js').default ?? require('ajv/dist/2020.js')
const standaloneCode = require('ajv/dist/standalone').default ?? require('ajv/dist/standalone')

for (const [skill, { schema: schemaName }] of entries) {
  const outDir = path.join(ROOT, '.claude', 'skills', skill, 'scripts', 'generated')
  await mkdir(outDir, { recursive: true })

  const schema = JSON.parse(
    await readFile(path.join(ROOT, 'schemas', `${schemaName}.schema.json`), 'utf8'),
  )
  const ajv = new Ajv2020({ allErrors: true, strict: false, code: { source: true, esm: true } })
  const code = inlineAjvRuntime(standaloneCode(ajv, ajv.compile(schema)), skill)
  await writeFile(path.join(outDir, 'validate.mjs'), code, 'utf8')
  console.log(`gen:skills  ${schemaName}.schema.json -> ${skill}/scripts/generated/validate.mjs`)
}
