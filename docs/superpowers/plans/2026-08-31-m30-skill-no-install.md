# Skill の前準備をなくす 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同梱 Skill が利用者に要求している2つの前準備——Skill ごとの `npm install` と Node 22.18+（型ストリップ）——を両方とも消す。

**Architecture:** スキーマ検証を ajv の standalone コンパイル済み関数へ、共有 `.ts` を `transpileModule` した `.mjs` へ置き換える。どちらもビルド時の生成物にして、`gen:types` と同じ4経路（`pretest` / `prebuild` / `predev` / `prepare`）に載せる。生成物は追跡せず、`src/types/*.ts` と同じ扱いにする。

**Tech Stack:** Node / ESM、`ajv`（既にルートの `dependencies`）、`typescript`（既に devDependencies）、vitest。**新しい依存は入れない。**

**Spec:** `docs/superpowers/specs/2026-08-31-m30-skill-no-install-design.md`

## Global Constraints

- **worktree の基底 SHA を、最初のコミットを積む前に確認する。** 期待値は `4d8e4d1`（`origin/main` = ローカル `main`、2026-08-31 時点）。`git log --oneline` で計画コミットの親がこれであること
- **計画のコードは検証済みの正ではない。** レビューを通す前提の下書きとして扱う。**指示が矛盾していたら辻褄を合わせず「計画の矛盾」として報告する。** 報告には**実行した検証コマンドとその出力を貼る**（やっていない作業を「やった」と報告する経路を塞ぐため）
- **検証手順の対象を絞らない。** どのタスクでも最後は `npm test && npx tsc -b && npm run lint` を**全件**回す。「このタスクに関係するテストだけ」は依存の見落としを隠す
- **テストの件数を報告に書かない。** 期待値は「このファイルの `it` がすべて緑」
- **生成物は追跡しない。** `.claude/skills/*/scripts/generated/` は `.gitignore` に入る。`git add` するときにここが混ざっていないこと
- **変換ターゲットは ES2022**（`ts.ScriptTarget.ES2022` / `ts.ModuleKind.ESNext`）。下限 Node は 18
- **ドキュメントの日本語表記**：既存文書と同じく全角括弧・`——`（2倍ダッシュ）を使う。ASCII で代用しない

---

### Task 1: 生成スクリプトと validator（層1）

**Files:**
- Create: `scripts/gen-skills.mjs`
- Create: `scripts/gen-skills.test.mjs`
- Modify: `package.json:9,11,13,15`（`predev` / `prebuild` / `pretest` / `prepare`）と `scripts` への `gen:skills` 追加
- Modify: `.gitignore`（`src/types/*.ts` の行の近く）

> **テストを `scripts/` に置く理由（計画時に検証済み）：** `tsconfig.test.json` の `include` は `src` だけなので、`src/` 配下のテストから `scripts/gen-skills.mjs` を import すると `tsc -b` が解決できない。`vite.config.ts:33` の `include` は既に `scripts/**/*.test.mjs` を含んでおり（`scripts/make-latest-json.test.mjs` の前例）、**そこから `../src/**/*.ts` を import できることは実際に走らせて確認してある。** `.mjs` なので型注釈は書けない。

**Interfaces:**
- Produces: `scripts/gen-skills.mjs` が `export const SKILL_SOURCES` を持つ。形は `Record<string, { schema: string; shared: string[] }>`。Task 2 が `shared` を使い、Task 3・4 が生成物のパスを前提にする
- Produces: 生成物 `.claude/skills/<skill>/scripts/generated/validate.mjs`。default export が ajv 互換の検証関数（`fn(data): boolean`、`fn.errors` に `{ instancePath, keyword, params, message }[]`）

- [ ] **Step 1: 失敗するテストを書く**

`scripts/gen-skills.test.mjs` を新規作成:

```js
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
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run scripts/gen-skills.test.mjs`
Expected: FAIL。`scripts/gen-skills.mjs` が存在しないため import が解決できない。

- [ ] **Step 3: `scripts/gen-skills.mjs` を実装する**

```js
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
```

- [ ] **Step 4: 生成を走らせる**

Run: `node scripts/gen-skills.mjs`
Expected: 5行の `gen:skills ...` が出て終了コード 0。`.claude/skills/*/scripts/generated/validate.mjs` が5本できる。

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npx vitest run scripts/gen-skills.test.mjs`
Expected: このファイルの `it` がすべて緑。

- [ ] **Step 6: npm scripts と `.gitignore` に載せる**

`package.json` の4経路を、`gen:types` に `gen:skills` を続ける形へ:

```json
    "predev": "npm run gen:types && npm run gen:skills",
    "prebuild": "npm run gen:types && npm run gen:skills",
    "pretest": "npm run gen:types && npm run gen:skills",
    "gen:types": "node scripts/gen-types.mjs",
    "gen:skills": "node scripts/gen-skills.mjs",
    "prepare": "npm run gen:types && npm run gen:skills",
```

`.gitignore` の `src/types/*.ts` の直後へ:

```
# 同梱 Skill の生成物（正は schemas/*.schema.json と src/ の実体。npm run gen:skills で再生成）
.claude/skills/*/scripts/generated/
```

- [ ] **Step 7: 生成物が追跡されないことを確かめる**

Run: `git status --short`
Expected: `.claude/skills/*/scripts/generated/` が1つも出てこない（`scripts/gen-skills.mjs`、`scripts/gen-skills.test.mjs`、`package.json`、`.gitignore` の4つだけ）。

- [ ] **Step 8: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。`npm test` の冒頭で `gen:skills` が走ること（`pretest` の配線確認を兼ねる）。

- [ ] **Step 9: コミット**

```bash
git add scripts/gen-skills.mjs scripts/gen-skills.test.mjs package.json .gitignore
git commit -m "feat(m30): スキーマ検証を standalone 生成物へ"
```

---

### Task 2: 共有 `.ts` の変換（層2）

**Files:**
- Modify: `scripts/gen-skills.mjs`（`SKILL_SOURCES` の `shared` を使う生成を追加）
- Modify: `scripts/gen-skills.test.mjs`（生成物の出力一致を追加）

**Interfaces:**
- Consumes: Task 1 の `SKILL_SOURCES`
- Produces: 生成物 `.claude/skills/<skill>/scripts/generated/<basename>.mjs`。`canonical.mjs` は `serialize(value, schema)` と `stripBom(text)` を、`derive.mjs` は `poseQuestions` / `tallyQuestions` / `tallyLine` などを、`questions.mjs` は `poseQuestions` / `questionLabels` などを、`flat-tree-core.mjs` は `buildFlatTree` / `orderFlatNodes` などを、いずれもアプリ側と同名で export する

- [ ] **Step 1: 失敗するテストを書く**

`scripts/gen-skills.test.mjs` の末尾へ追加:

```js
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
    expect(gen.tallyLine(gen.tallyQuestions(gen.poseQuestions(data.issues)))).toBe(
      app.tallyLine(app.tallyQuestions(app.poseQuestions(data.issues))),
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
```

> **計画からの注記：** `poseQuestions` / `orderFlatNodes` / `presentAnswers` / `questionLabels` の引数の形は `src/` の実物で確かめること。**お手本 JSON のキー名（`issues` / `nodes` / `steps`）が違っていたら、辻褄を合わせずに報告する。**

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npx vitest run scripts/gen-skills.test.mjs`
Expected: FAIL。`canonical.mjs` などが生成されていないため。

- [ ] **Step 3: 変換を実装する**

`scripts/gen-skills.mjs` の import に typescript を足す:

```js
const ts = require('typescript')
```

生成ループの中、`validate.mjs` を書いたあとへ:

```js
  for (const rel of SKILL_SOURCES[skill].shared) {
    const src = await readFile(path.join(ROOT, rel), 'utf8')
    const out = ts.transpileModule(src, {
      // ES2022 に落とすと Node 18 で動く。`module: ESNext` は import/export をそのまま残す
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      fileName: rel,
    })
    const base = path.basename(rel).replace(/\.ts$/, '.mjs')
    await writeFile(path.join(outDir, base), out.outputText, 'utf8')
    console.log(`gen:skills  ${rel} -> ${skill}/scripts/generated/${base}`)
  }
```

- [ ] **Step 4: 生成してテストを通す**

Run: `node scripts/gen-skills.mjs && npx vitest run scripts/gen-skills.test.mjs`
Expected: 生成が5 Skill ぶん（validator 5本＋共有 9本）出て、このファイルの `it` がすべて緑。

- [ ] **Step 5: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。

- [ ] **Step 6: コミット**

```bash
git add scripts/gen-skills.mjs scripts/gen-skills.test.mjs
git commit -m "feat(m30): 共有 .ts の変換を生成へ足す"
```

---

### Task 3: `issue-tree-register` を生成物へ切り替える

代表として最も複雑な1本（共有2本＋ajv）を先に通し、形を確定させる。

**Files:**
- Modify: `.claude/skills/issue-tree-register/scripts/issue-tree-write.mjs`

**Interfaces:**
- Consumes: Task 1・2 の生成物（`generated/validate.mjs`、`generated/canonical.mjs`、`generated/derive.mjs`）

- [ ] **Step 1: 切り替え前の出力を控える**

Run: `node .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs --check sample-project/課題ツリー.json`
Expected: 終了コード 0。**この出力を報告に貼る**（切り替え後と突き合わせるため）。

- [ ] **Step 2: 冒頭の import と診断を差し替える（`:33-56` 付近）**

`createRequire` の import と `const require = ...` を削除する。`SKILL_DIR` と `fileURLToPath` は**残す**（スキーマの固定パスに要る）。

```js
// ---------- アプリのロジック（生成物。手で複製しない） ----------
//
// derive.mjs   = 問いの導出と抑制（src/modules/issue-tree/derive.ts から生成）
// canonical.mjs = 正規形シリアライザ（src/core/canonical.ts から生成）
// validate.mjs = スキーマ検証（schemas/issue-tree.schema.json から生成）
// いずれも npm run gen:skills が作り、アプリが .claude/skills/ へ置き直す

let D, C, validate;
try {
  const [d, c, v] = await Promise.all([
    import("./generated/derive.mjs"),
    import("./generated/canonical.mjs"),
    import("./generated/validate.mjs"),
  ]);
  [D, C, validate] = [d, c, v.default];
} catch (e) {
  die(
    2,
    `Skill の生成物が見つかりません。facet でプロジェクトフォルダを開き直してください（アプリが .claude/skills/ を置き直します）\n  ${e.message}`
  );
}
```

- [ ] **Step 3: スキーマ探索を固定パスへ（`:78-97` 付近）**

`findSchema()` の関数まるごとと、`--schema` の引数解析（`:67`）、`opt` の `schema: null`（`:61` 付近）を削除し:

```js
// スキーマは同梱物を読む。**検証は生成物に焼き付いており、ここで読むのは
// 正規形のキー順を properties の記載順から導出するため**（canonical.mjs）。
// 差し替えを許すと「検証は同梱・キー順は外部」のちぐはぐが起きるので探索しない
const schemaPath = path.join(SKILL_DIR, "schemas", "issue-tree.schema.json");
const schema = readJson(schemaPath, "スキーマ");
```

- [ ] **Step 4: ajv の解決とコンパイルを削除する（`:106-114` 付近）**

`let AjvCtor;` から `const validate = ajv.compile(schema);` までを削除する（`validate` は Step 2 で入っている）。`if (!validate(data)) {` 以降の整形コードは**触らない**。

- [ ] **Step 5: `スキーマ:` の出力2箇所を削る（`:118` と `:303` 付近）**

`console.error(\`  スキーマ: ${schemaPath}\`);` と `console.log(\`  スキーマ: ${schemaPath}\`);` の行を削除する。常に同梱スキーマを指すようになり情報を運ばないため。

- [ ] **Step 6: ヘッダのコメントを直す（`:24-31` 付近）**

`./derive.ts は src/modules/issue-tree/derive.ts の バイト一致コピーで、ズレは ... skill-copy.test.ts が検知する` を、生成物である旨へ書き換える。使い方の `（--schema <path> でスキーマを明示指定できる。省略時は自動探索）` の行を削除する。

- [ ] **Step 7: 切り替え後の出力が同じであることを確かめる**

Run: `node .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs --check sample-project/課題ツリー.json`
Expected: 終了コード 0。**Step 1 で控えた出力と、`スキーマ:` の行が消えたこと以外は一字一句同じ。** 差があれば報告する。

- [ ] **Step 8: 往復で差分が出ないことを確かめる**

```bash
node .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs --in sample-project/課題ツリー.json --out /tmp/m30-issue-tree.json
diff sample-project/課題ツリー.json /tmp/m30-issue-tree.json
```

Expected: `diff` が無出力（お手本は既に正規形なので、書き直しても変わらない）。

- [ ] **Step 9: スキーマ違反が弾かれることを確かめる**

```bash
node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync('sample-project/課題ツリー.json','utf8'));d.schemaVersion='x';fs.writeFileSync('/tmp/m30-broken.json',JSON.stringify(d))"
node .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs --check /tmp/m30-broken.json
```

Expected: 終了コード 1。`✗ スキーマ検証に失敗しました` と、`/schemaVersion` を指すエラー行が出る。

- [ ] **Step 10: 全件検証してコミット**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑（`skill-copy.test.ts` のバイト一致はまだ生きている。`.ts` コピーは Task 5 まで消さないので緑のまま）。

```bash
git add .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs
git commit -m "feat(m30): issue-tree-register を生成物へ切り替える"
```

---

### Task 4: 残り4本を同じ形に切り替える

**Files:**
- Modify: `.claude/skills/glossary-term-register/scripts/glossary-write.mjs`
- Modify: `.claude/skills/error-catalog-register/scripts/error-catalog-write.mjs`
- Modify: `.claude/skills/sequence-register/scripts/sequence-write.mjs`
- Modify: `.claude/skills/logic-tree-register/scripts/logic-tree-write.mjs`

**Interfaces:**
- Consumes: Task 3 で確定した形

**4本の違いは、共有ソースの本数と変数名だけである:**

| Skill | 共有の import | 変数 | スキーマ名 |
| --- | --- | --- | --- |
| `glossary-term-register` | `canonical.mjs` のみ | `C` | `glossary` |
| `error-catalog-register` | `canonical.mjs` のみ | `C` | `error-catalog` |
| `sequence-register` | `questions.mjs`, `canonical.mjs` | `Q`, `C` | `sequence` |
| `logic-tree-register` | `flat-tree-core.mjs`, `canonical.mjs` | `T`, `C` | `logic-tree` |

- [ ] **Step 1: 4本それぞれの切り替え前の出力を控える**

```bash
node .claude/skills/glossary-term-register/scripts/glossary-write.mjs --check sample-project/用語集.json
node .claude/skills/error-catalog-register/scripts/error-catalog-write.mjs --check sample-project/エラーカタログ.json
node .claude/skills/sequence-register/scripts/sequence-write.mjs --check sample-project/応募から書類選考まで.json
node .claude/skills/logic-tree-register/scripts/logic-tree-write.mjs --check sample-project/応募が書類選考に進まないケース.json
```

Expected: 4本とも終了コード 0。**4つの出力を報告に貼る。**

- [ ] **Step 2: 4本に Task 3 の Step 2〜6 と同じ変更を施す**

共有が1本だけの2つ（glossary / error-catalog）は、`Promise.all` ではなく単独の import になっているので（`C = await import("./canonical.ts");`）、そこへ validate を足して2本の `Promise.all` にする:

```js
let C, validate;
try {
  const [c, v] = await Promise.all([
    import("./generated/canonical.mjs"),
    import("./generated/validate.mjs"),
  ]);
  [C, validate] = [c, v.default];
} catch (e) {
  die(
    2,
    `Skill の生成物が見つかりません。facet でプロジェクトフォルダを開き直してください（アプリが .claude/skills/ を置き直します）\n  ${e.message}`
  );
}
```

`logic-tree-register` の SKILL.md は他4本と文面が違う（スキーマの解決順を明示している）が、**スクリプト側の構造は同じ**である。SKILL.md は Task 6 で扱う。

- [ ] **Step 3: 4本の出力が同じであることを確かめる**

Step 1 と同じ4コマンドを再実行。
Expected: 終了コード 0。**`スキーマ:` の行が消えたこと以外、Step 1 の出力と一字一句同じ。**

- [ ] **Step 4: 4本の往復で差分が出ないことを確かめる**

```bash
node .claude/skills/glossary-term-register/scripts/glossary-write.mjs --in sample-project/用語集.json --out /tmp/m30-g.json && diff sample-project/用語集.json /tmp/m30-g.json
node .claude/skills/error-catalog-register/scripts/error-catalog-write.mjs --in sample-project/エラーカタログ.json --out /tmp/m30-e.json && diff sample-project/エラーカタログ.json /tmp/m30-e.json
node .claude/skills/sequence-register/scripts/sequence-write.mjs --in sample-project/応募から書類選考まで.json --out /tmp/m30-s.json && diff sample-project/応募から書類選考まで.json /tmp/m30-s.json
node .claude/skills/logic-tree-register/scripts/logic-tree-write.mjs --in sample-project/応募が書類選考に進まないケース.json --out /tmp/m30-l.json && diff sample-project/応募が書類選考に進まないケース.json /tmp/m30-l.json
```

Expected: 4本とも `diff` が無出力。

- [ ] **Step 5: 全件検証してコミット**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。

```bash
git add .claude/skills/glossary-term-register/scripts/glossary-write.mjs .claude/skills/error-catalog-register/scripts/error-catalog-write.mjs .claude/skills/sequence-register/scripts/sequence-write.mjs .claude/skills/logic-tree-register/scripts/logic-tree-write.mjs
git commit -m "feat(m30): 残り4本の Skill を生成物へ切り替える"
```

---

### Task 5: 旧コピーを消し、テストを組み替える

ここで初めて `.ts` コピーと `package.json` を消す。**Task 4 までは消さない**——消してから切り替えると、途中でどの Skill も動かない時間ができる。

**Files:**
- Delete: `.claude/skills/glossary-term-register/scripts/canonical.ts`
- Delete: `.claude/skills/error-catalog-register/scripts/canonical.ts`
- Delete: `.claude/skills/sequence-register/scripts/canonical.ts`, `.claude/skills/sequence-register/scripts/questions.ts`
- Delete: `.claude/skills/issue-tree-register/scripts/canonical.ts`, `.claude/skills/issue-tree-register/scripts/derive.ts`
- Delete: `.claude/skills/logic-tree-register/scripts/canonical.ts`, `.claude/skills/logic-tree-register/scripts/flat-tree-core.ts`
- Delete: `.claude/skills/*/package.json`（5本）
- Delete: `src/core/skill-canonical-copy.test.ts`
- Delete: `src/modules/issue-tree/skill-copy.test.ts`, `src/modules/sequence/skill-copy.test.ts`, `src/modules/logic-tree/skill-copy.test.ts`
- Create: `src/core/import-analysis.test.ts`
- Modify: `src/core/skill-sync.ts`（コメント3箇所。**ロジックは変えない**）

**Interfaces:**
- Consumes: Task 2 の `scripts/gen-skills.test.mjs`（「値 import なし」「enum なし」の検査は既にそこにある）

- [ ] **Step 1: `isValueImportStatement` のケース表を移す**

`src/modules/sequence/skill-copy.test.ts` の末尾にある `describe('isValueImportStatement', ...)` を、`src/core/import-analysis.test.ts` として新規作成し**ケースを1つも減らさずに**移す:

```ts
import { describe, expect, it } from 'vitest'
import { isValueImportStatement } from './import-analysis'

/**
 * **`src/modules/sequence/skill-copy.test.ts` から移した。**
 * あちらは同梱コピーのバイト一致を見るテストで、m30 でコピー自体が
 * 生成物になったため役目を終えた。**混在ケースの回帰はここで見つかった
 * ものなので、ケースは1つも減らさずに持ってきている**——判定関数と
 * 同居させることで、次に触る人が実装の隣でケースを読める
 */
describe('isValueImportStatement', () => {
  const cases: [name: string, statement: string, expected: boolean][] = [
    ['単純な named import', "import { foo } from './bar'", true],
    ['複数行の named import', "import {\n  foo,\n} from './bar'", true],
    ['type 修飾と値 specifier の混在（回帰ケース）', "import { type Foo, bar } from './bar'", true],
    ['import type 節', "import type { Foo } from './bar'", false],
    ['単一の type 修飾 specifier', "import { type Foo } from './bar'", false],
    ['全て type 修飾された複数 specifier', "import { type Foo, type Bar } from './bar'", false],
    ['副作用 import（引用符のみ）', "import './side-effect'", true],
    ['副作用 import（セミコロン付き）', 'import "./side-effect";', true],
  ]

  it.each(cases)('%s → %s', (_name, statement, expected) => {
    expect(isValueImportStatement(statement)).toBe(expected)
  })
})
```

- [ ] **Step 2: 移せたことを確かめる**

Run: `npx vitest run src/core/import-analysis.test.ts`
Expected: このファイルの `it` がすべて緑。

- [ ] **Step 3: 「値 import なし」の検査が生成物側に残っていることを確かめる**

Task 2 で `scripts/gen-skills.test.mjs` に入れた「import 文が1つも残らない」は生成物を見る検査で、**原本の値 import を直接は見ていない**。原本側の検査を `SHARED_PAIRS` の `describe.each` へ足す:

```js
  it('原本が値 import を持たない（変換後に自己完結する条件）', () => {
    const src = readFileSync(app, 'utf8')
    expect(extractImportStatements(src).filter(isValueImportStatement)).toEqual([])
  })
```

冒頭の import に足す:

```js
import { extractImportStatements, isValueImportStatement } from '../src/core/import-analysis.ts'
```

Run: `npx vitest run scripts/gen-skills.test.mjs`
Expected: このファイルの `it` がすべて緑。

- [ ] **Step 4: 旧テスト4本を消す**

```bash
git rm src/core/skill-canonical-copy.test.ts src/modules/issue-tree/skill-copy.test.ts src/modules/sequence/skill-copy.test.ts src/modules/logic-tree/skill-copy.test.ts
```

- [ ] **Step 5: 旧コピーと `package.json` を消す**

```bash
git rm .claude/skills/*/scripts/canonical.ts .claude/skills/issue-tree-register/scripts/derive.ts .claude/skills/sequence-register/scripts/questions.ts .claude/skills/logic-tree-register/scripts/flat-tree-core.ts .claude/skills/*/package.json
```

- [ ] **Step 6: 消し残しが無いことを確かめる**

Run: `git ls-files .claude/skills | grep -E "\.ts$|package\.json$"`
Expected: 無出力。**`grep` に件数の上限が効いていないこと**（`git ls-files` は打ち切らない）。

- [ ] **Step 7: `skill-sync.ts` のコメントを直す（ロジックは変えない）**

3箇所。**関数の中身は1文字も変えない。**

1. `shouldSyncSkillFile` の JSDoc から、`**`package.json` は除外しない（レビュー指摘。以前は除外していた）。**` で始まる段落をまるごと削除する（同梱物から消えたため）
2. `SKILL_DEPS_DIR` の JSDoc——「両方が揃って初めて『ユーザーの `npm install` が残る』になる」を、**旧版が作った残骸を消さないための保護である**旨へ書き換える。`npm install` の指示はもう無いこと、それでも消さないのは人間の裁定（アプリが数百 MB を黙って消さない）であることを書く
3. `SKILL_LOCK_FILE` と `isRemovableSkillEntry` の JSDoc——同じ理由で「次の `npm install` がロックを見ずに解決し直す」を、残骸の保護として書き直す

- [ ] **Step 8: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。**`skill-sync.test.ts` と `skill-schema-copy.test.ts` は無改修で緑のまま**（ロジックもスキーマのコピーも変えていない）。赤くなったら計画の見落としとして報告する。

- [ ] **Step 9: 生成物が紛れ込んでいないことを確かめてコミット**

Run: `git status --short`
Expected: `generated/` が1つも出てこない。

```bash
git add -A
git commit -m "refactor(m30): 旧コピーと package.json を消し、検査を生成物側へ寄せる"
```

---

### Task 6: SKILL.md 5本を直す

**Files:**
- Modify: `.claude/skills/glossary-term-register/SKILL.md:23,158`
- Modify: `.claude/skills/error-catalog-register/SKILL.md:25,202`
- Modify: `.claude/skills/sequence-register/SKILL.md:27,133`
- Modify: `.claude/skills/issue-tree-register/SKILL.md:27,178`
- Modify: `.claude/skills/logic-tree-register/SKILL.md:16,71`

- [ ] **Step 1: 前準備の段落を5本とも消す**

5本とも同じ1行である:

```
初回のみ、Skillディレクトリで `npm install`（ajv が必要）。`ajv が見つかりません` と言われたら実行する。あわせて **Node は型ストリップがフラグ無しで動く版が要る**（22.18+ / 23.6+ / 24+）——スクリプトが同梱の `.ts` を直接 import するため。`同梱の .ts を読み込めません` と言われたら Node を上げる。
```

**行ごと削除する。** 前後の空行が二重にならないよう整えること。

- [ ] **Step 2: スキーマの段落を5本とも直す**

4本（glossary / error-catalog / sequence / issue-tree）は同じ形:

```
スキーマはスクリプトが実行時に探索する。**この Skill は `schemas/<名前>.schema.json` に自分のコピーを持つ**ので、facet のチェックアウトが無いマシンでも見つかる（コピーは facet の原本とのバイト一致をアプリのテストが強制している。ズレたまま古い版で検証が通ることはない）。それでも見つからないと言われたら `--schema <path>` か環境変数 `FACET_<TOOL>_SCHEMA` で指定する。
```

これを次の趣旨へ書き換える（各 Skill のスキーマ名に合わせる）:

```
スキーマ検証は同梱の生成物（`scripts/generated/validate.mjs`）が行う。**スキーマの差し替えはできない**——検証は生成時に焼き付いており、アプリが開けるかどうかの基準は同梱スキーマそのものだからである。`schemas/<名前>.schema.json` は正規形のキー順を決めるために読まれ、facet の原本とのバイト一致はアプリのテストが強制している。
```

`logic-tree-register:71` は文面が違う（「スキーマの解決順は `--schema <path>` → 環境変数 → 自動探索である」）ので、**同じ趣旨へ書き換えたうえで解決順の記述を落とす。**

- [ ] **Step 3: `--schema` の記述が1つも残っていないことを確かめる**

Run: `grep -rn "npm install\|--schema\|FACET_.*_SCHEMA\|型ストリップ" .claude/skills/*/SKILL.md`
Expected: 無出力。

- [ ] **Step 4: 全件検証してコミット**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。

```bash
git add .claude/skills/*/SKILL.md
git commit -m "docs(m30): SKILL.md から前準備とスキーマ差し替えの記述を落とす"
```

---

### Task 7: 正の文書へ反映する

**実機確認（Task 8）とは別のタスクにしてある。** 束ねると、申し送りが書かれてコミットが積まれた状態が「終わった」ように見え、未実施の実機確認が静かに埋没するため（logic-tree M1 の教訓）。

**Files:**
- Modify: `docs/overview-rev.md`（4章に2箇所、5章に1箇所）
- Modify: `CLAUDE.md`（「マージ後の後片付け」の `clean -fdx` の理由書き）
- Modify: `docs/open-issues.md`（「次に手を付ける候補」の4・7・9番）
- Create: `docs/history/m30-core-skill-no-install.md`

- [ ] **Step 1: rev 4章「アプリのロジックを同梱スクリプトから使う方法」を直す**

いまの記述は「**値 import を持たないファイルに限り、バイト一致のコピーを同梱し、一致をアプリのユニットテストで強制する**」で、代償として型ストリップ依存を挙げている。これを**生成方式**へ書き換える。残すべき理屈は3つ:

- 値 import を持たないという制約は**生成の前提条件として残る**（`transpileModule` は import を解決しない）
- **網羅の強制は残り、対象が `CANONICAL_COPIES` から `SKILL_SOURCES` へ移った**
- **`BUNDLED_SKILLS` から導出しない**（導出すると恒真式になる）

型ストリップ依存の記述は削除する。

- [ ] **Step 2: rev 4章「Skillの配布と同期」を直す**

`その `package.json` も同梱物として置く` を削除し、`node_modules` と `package-lock.json` を消さない理由を「各Skillの手順書が初回の `npm install` を指示するため」から**旧版が作った残骸を消さないため（人間の裁定）**へ書き換える。`.gitignore` を同期する理由も同じ趣旨へ。

- [ ] **Step 3: rev 5章のスキーマ共有の項を直す**

コピーは引き続き実行時に読まれる（`serialize` のキー順導出）が、**検証の入力ではなくなり、探索ではなく固定パスで読む**旨を足す。

- [ ] **Step 4: `CLAUDE.md` を直す**

`-x` を付ける理由の `（.claude/skills/ は npm install 済みで数百 MB になる）` を、生成物 `.claude/skills/*/scripts/generated/` の話へ差し替える。

- [ ] **Step 5: `docs/open-issues.md` の3項目を直す**

「次に手を付ける候補」の4番（issue-tree-m2）・7番（logic-tree-m2）・9番（issue-tree-m4/m5）が、確認事項として「**置かれた先で `npm install` した後の状態**（sequence M4 はこの一手で欠陥を2つ連続で掘り当てた）」を挙げている。3箇所とも「**置かれた先で追加の手順なしに動くこと**」へ書き換える。**項目そのものは消さない**（実機確認は未実施のまま）。

**この文書は増減を検算する規約がある。** 冒頭の「最終更新」段落に、今回の書き換えを同じ形式で追記すること（消した箇条・足した箇条・書き換えた箇所を数え、`^- ` の箇条行で検算する）。

- [ ] **Step 6: 申し送りを書く**

`docs/history/m30-core-skill-no-install.md` を新規作成する。書くこと:

- 実装で確定した事項（`esm: true` でも `ucs2length` の `require` が残ること、`serialize` がスキーマを実行時に要ること、消えたのは `createRequire` だけで `SKILL_DIR` は残ること）
- 実測値（validator 11〜60KB、共有4本の変換サイズ、`import` 残りゼロ）
- **実機確認は未実施であること、および Task 8 のチェックリストを空のまま写す**

- [ ] **Step 7: 全件検証してコミット**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。

Run: `git diff --numstat` に加えて、NUL バイトの混入をバイト単位で確かめる:

```bash
grep -aPc $'\x00' docs/history/m30-core-skill-no-install.md docs/open-issues.md docs/overview-rev.md CLAUDE.md
```

Expected: 4ファイルとも `0`。（`numstat` が数値を返すことは NUL 非混入の証明にならない——M29 で2回踏んでいる）

```bash
git add docs/overview-rev.md CLAUDE.md docs/open-issues.md docs/history/m30-core-skill-no-install.md
git commit -m "docs(m30): 正の文書へ反映し、申し送りを置く"
```

---

### Task 8: 実機確認（人間の手が要る）

**サブエージェントは Tauri の GUI を操作できない。** このタスクは人間が踏む。結果が出るまで、申し送りのチェックリストは空のまま残す。

- [ ] `npm run tauri dev` でアプリを起動する
- [ ] **新しい空フォルダを開き、`npm install` を一切せずに5本の Skill それぞれで書き出しをさせる**（用語集・エラーカタログ・シーケンス・課題ツリー・ロジックツリー）
- [ ] 開いたフォルダの `.claude/skills/*/scripts/generated/` に生成物が置かれている
- [ ] 同じフォルダに `node_modules` と `package.json` が**作られていない**
- [ ] **旧版を使っていたフォルダを開く**——`node_modules` と `package-lock.json` が残ったまま、書き出しが新しい経路で通る
- [ ] スキーマ違反のファイルを Claude に `--check` させ、エラー表示が読める（`スキーマ:` の行が消えたこと以外は従来どおり）
- [ ] 生成物を1つ手で消してから書き出させ、`Skill の生成物が見つかりません。facet でプロジェクトフォルダを開き直してください` が出る。**開き直すと直る**
- [ ] **開発機と違う OS（mac）** ——`.gitignore` が書けること（`allow_skill_dir` の `allow_file` 経路）、`.DS_Store` の消し残し警告が従来どおり出ること
- [ ] **Node 18 系で書き出しスクリプトが通る**（下限の実証。開発機は 22.20 なので別に用意する）
- [ ] 済んだら `docs/open-issues.md` と申し送りのチェックリストを埋める

---

## 参照

- 設計: `docs/superpowers/specs/2026-08-31-m30-skill-no-install-design.md`
- `docs/lessons-for-planning.md` — 本計画が従った規則（検証の対象を絞らない／件数を書かない／実機確認とドキュメントを束ねない／NUL バイトの走査）
- `scripts/gen-types.mjs` — 生成物の扱いの前例
- `docs/history/sequence-m4-register-skill.md` — `package.json` を同梱物にした経緯（本計画が覆す判断）
