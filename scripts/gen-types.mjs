/**
 * JSON Schema から TypeScript の型を生成する（正は schemas/ の実体。
 * コピーを作らない——Skill 側も同じファイルを読む）。
 *
 * **schemas/*.schema.json を走査する。** 1本ずつコマンドに書き並べると、
 * ツールを増やしたときに pretest / prebuild / predev の3経路のうち
 * どれかを直し忘れ、「テストは通るがビルドで落ちる」になる
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileFromFile } from 'json-schema-to-typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCHEMA_DIR = path.join(ROOT, 'schemas')
const OUT_DIR = path.join(ROOT, 'src', 'types')

const names = (await readdir(SCHEMA_DIR))
  .filter((n) => n.endsWith('.schema.json'))
  .sort()

// 0件のまま黙って成功すると、型が無いことに tsc で初めて気づく
if (names.length === 0) {
  console.error(`schemas/ に *.schema.json がありません: ${SCHEMA_DIR}`)
  process.exit(1)
}

await mkdir(OUT_DIR, { recursive: true })

for (const name of names) {
  const base = name.replace(/\.schema\.json$/, '')
  const ts = await compileFromFile(path.join(SCHEMA_DIR, name), {
    bannerComment: `/* schemas/${name} から自動生成。手で編集しないこと（npm run gen:types で再生成される）。 */`,
    additionalProperties: false,
  })
  await writeFile(path.join(OUT_DIR, `${base}.ts`), ts, 'utf8')
  console.log(`gen:types  ${name} -> src/types/${base}.ts`)
}
