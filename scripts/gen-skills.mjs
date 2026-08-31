/**
 * 同梱 Skill の生成物を作る（正は schemas/ と src/ の実体。コピーを手で作らない）。
 *
 * **`gen-types.mjs` と同じ思想だが、走査では決まらないので表を持つ。**
 * どの Skill がどの共有ソースを要るかはディレクトリ構造に現れないため。
 *
 * 生成物は追跡しない（`.gitignore`）。`src/types/*.ts` と同じ扱いで、
 * `pretest` / `prebuild` / `predev` / `prepare` の4経路で毎回作り直す
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const ts = require('typescript')

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
 * needle（`.code`）も実体（`.toString()`）も ajv が実行時に持っているので、
 * 手で書き写さずそこから取る。ajv を上げて同名のまま実装だけ変わっても、
 * ここは自動で追従する——手写しだと追従できない
 */
const ucs2length = require('ajv/dist/runtime/ucs2length').default
const AJV_RUNTIME_INLINE = { [ucs2length.code]: ucs2length.toString() }

/**
 * 埋め込み置換。**未知のランタイムが残ったら止める。**
 * 黙って通すと「実行するまで壊れていると分からない生成物」が配布される
 *
 * **走査は `ajv/dist/runtime/` を require するパターンだけに絞る。** ajv の
 * runtime/*.js はどれも自分の `.code` をこの形の文字列で持ち、他の場所で
 * この文字列が作られることは無い（実測で確認済み）。`\brequire\(([^)]*)\)`
 * のような素の走査だと、standalone 出力が丸ごと抱えるスキーマの description
 * （日本語の長文）に "require(" の4文字がたまたま現れただけで、
 * 的外れな理由（生成の失敗）で止まる
 */
function inlineAjvRuntime(src, name) {
  let out = src
  for (const [needle, impl] of Object.entries(AJV_RUNTIME_INLINE)) {
    out = out.split(needle).join(`(${impl})`)
  }
  const left = [...out.matchAll(/require\("ajv\/dist\/runtime\/[^"]*"\)(?:\.default)?/g)].map(
    (m) => m[0],
  )
  if (left.length > 0) {
    console.error(
      `gen:skills  ${name}: 未知の ajv ランタイムが残りました: ${JSON.stringify(left)}\n` +
        `  AJV_RUNTIME_INLINE に実体を足してください（require('ajv/dist/runtime/<name>').default の\n` +
        `  .code / .toString() から取る。node_modules/ajv/dist/runtime/ から手で写さない）`,
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
  // SKILL_SOURCES から共有ソースを外す・改名する・Skill を1本外すと、対応する古い
  // .mjs は書き直されず残ってしまう。tauri.conf.json は .claude/skills をディレクトリ
  // ごとバンドルするので、掃除しないと残骸がそのまま配布物に載る。作り直す前に空にする
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  const schema = JSON.parse(
    await readFile(path.join(ROOT, 'schemas', `${schemaName}.schema.json`), 'utf8'),
  )
  const ajv = new Ajv2020({ allErrors: true, strict: false, code: { source: true, esm: true } })
  const code = inlineAjvRuntime(standaloneCode(ajv, ajv.compile(schema)), skill)
  await writeFile(path.join(outDir, 'validate.mjs'), code, 'utf8')
  console.log(`gen:skills  ${schemaName}.schema.json -> ${skill}/scripts/generated/validate.mjs`)

  for (const rel of SKILL_SOURCES[skill].shared) {
    const src = await readFile(path.join(ROOT, rel), 'utf8')
    const out = ts.transpileModule(src, {
      // ES2022 に落とすと Node 18 で動く。`module: ESNext` は import/export をそのまま残す
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      fileName: rel,
      reportDiagnostics: true,
    })
    // 素の構文エラーに対する安い belt。ただし `enum` などの「消去できない構文」は
    // ここでは捕まらない（transpileModule は型注釈しか落とさないので構文としては
    // 成立してしまう）——そちらは gen-skills.test.mjs の正規表現が引き続き番人
    if (out.diagnostics && out.diagnostics.length > 0) {
      const messages = out.diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
      console.error(
        `gen:skills  ${rel}: TypeScript の診断が ${messages.length} 件あります:\n` +
          messages.map((m) => `  - ${m}`).join('\n'),
      )
      process.exit(1)
    }
    const base = path.basename(rel).replace(/\.ts$/, '.mjs')
    await writeFile(path.join(outDir, base), out.outputText, 'utf8')
    console.log(`gen:skills  ${rel} -> ${skill}/scripts/generated/${base}`)
  }
}
