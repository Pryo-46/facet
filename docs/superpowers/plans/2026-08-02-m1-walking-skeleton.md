# M1: 歩けるスケルトン 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** フォルダを開く → JSON 読込 → スキーマ検証 → リスト描画 → 編集 → 自動保存（正規形で書き込み）→ Git diff が編集箇所だけに出る、という一周を通す。

**Architecture:** ロジックはすべて純粋な TypeScript モジュール（`src/core/`）に置き、Tauri 依存は薄いアダプタ（`src/fs/`）に隔離する。用語集はモジュール規約（rev 6章）に従い、コアは「type からモジュールを引く」レジストリ経由で動く。正規形シリアライザは Skill 側 `glossary-write.mjs` の `reorder`/`deref` の忠実な移植であり、バイト一致を回帰テストで担保する。

**Tech Stack:** Tauri 2（fs / dialog プラグインのみ。Rust は書かない）＋ Vite ＋ React 19 ＋ TypeScript（strict）＋ Tailwind v4 ＋ Vitest。スキーマ検証は ajv（draft 2020-12）を新規導入。

## Global Constraints

- **正規形（1文字もずらさない）**: キー順＝スキーマの properties 記載順から**実行時導出**（ハードコード禁止）／インデント スペース2／改行 LF／末尾改行あり（1つ）／BOM なし（読み込み時は除去）／非ASCII エスケープしない。参照実装: `.claude/skills/glossary-term-register/scripts/glossary-write.mjs`
- **スキーマの正は `schemas/glossary.schema.json` の1ファイル。コピーを作らない**（アプリは import で同じ実体を読む）
- **型は手書きしない**: `src/types/glossary.ts` は生成物（gitignore 済み、`pretest`/`predev` 等で自動再生成）。手書きの型と二重管理しない
- **Rust を書かない。Tauri コマンドを追加しない**（fs / dialog プラグインで足りる）
- **色値の直書き禁止**: 役割トークン（`text-ink` / `bg-warning` / `border-rule` / `bg-surface` / `text-ink-muted` / `bg-canvas` / `text-ok` 等）のみ使用
- Tailwind は **v4**（`tailwind.config.js` は存在しない）。`src/components/ui/**` は生成物なので手で編集しない
- **読み込み・閲覧では書き戻さない**（開いただけでファイルが変わると閲覧だけで Git diff が出る）。書き込みは編集起点のみ
- **M1 のスコープ外（実装しないこと）**: 整合性検証・warning 表示・未知 type の本格対応（M2）／キーボード操作・IME・Undo・検索（M3）／ファイル新規作成・削除（M4）／外部変更検知（M5）／Markdown 出力（M6）。ただしモジュールインターフェイスは後続が足せる形にしておく
- テストは Vitest（environment: node）。UI コンポーネントは DOM 環境を入れず、Task 10 の手動 E2E で検証する（実装スコープ定義書 5節が挙げるテスト価値の高い箇所——正規形バイト一致・スキーマ検証合否・マイグレータ恒等性——はすべて純ロジックで、ユニットテストで担保する）
- コミットメッセージは日本語・`M1:` プレフィクス。各コミット末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` を付ける

## ファイル構成（M1 完了時）

```
src/
  core/                     # コア（ツール非依存の機構）
    canonical.ts            # 正規形シリアライザ（stripBom / serialize）
    canonical.test.ts
    schema-validation.ts    # ajv ラッパ（レベル1判定）
    schema-validation.test.ts
    registry.ts             # ToolModule インターフェイス＋モジュールレジストリ
    registry.test.ts
    load.ts                 # 読み込みパイプライン（editable / rejected / listOnly の区分け）
    load.test.ts
    autosave.ts             # デバウンス付き自動保存（純ロジック）
    autosave.test.ts
  modules/
    index.ts                # appRegistry（モジュール登録の一元点）
    glossary/
      module.ts             # 用語集モジュール定義（規約6点セットの M1 分）
      migrate.ts            # マイグレータ（初版につき恒等）
      migrate.test.ts
      GlossaryEditor.tsx    # 用語集エディタ（5列テーブル）
  fs/
    project-fs.ts           # Tauri fs/dialog の薄いアダプタ
  App.tsx                   # 額縁（フォルダを開く／ファイル一覧／エディタ枠／自動保存の配線）
```

---

### Task 1: 正規形シリアライザ（コア）

プロジェクト最大のリスク箇所。Skill 側 `glossary-write.mjs` の `reorder`/`deref` をそのまま TypeScript に移植し、バイト一致を回帰テストで固定する。

**Files:**
- Create: `src/core/canonical.ts`
- Test: `src/core/canonical.test.ts`

**Interfaces:**
- Consumes: なし（依存ゼロの純関数）
- Produces:
  - `type JsonSchema = Record<string, unknown>`
  - `stripBom(text: string): string`
  - `serialize(value: unknown, schema: JsonSchema): string` — 正規形の文字列（LF・末尾改行付き）を返す

- [ ] **Step 1: 失敗するテストを書く**

`src/core/canonical.test.ts` を作成:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { serialize, stripBom, type JsonSchema } from './canonical'

const schema = JSON.parse(
  readFileSync(new URL('../../schemas/glossary.schema.json', import.meta.url), 'utf8'),
) as JsonSchema

const sampleRaw = readFileSync(
  new URL('../../sample-project/glossary.json', import.meta.url),
  'utf8',
)

describe('serialize（正規形）', () => {
  it('Skill が書いたファイルを読み→直列化してバイト単位で不変（最重要の回帰テスト）', () => {
    expect(serialize(JSON.parse(sampleRaw), schema)).toBe(sampleRaw)
  })

  it('1フィールドの変更が該当行だけの差分になる', () => {
    const data = JSON.parse(sampleRaw) as { terms: { definition: string }[] }
    data.terms[1].definition = data.terms[1].definition + '。追記'
    const before = sampleRaw.split('\n')
    const after = serialize(data, schema).split('\n')
    expect(after.length).toBe(before.length)
    const changed = before.filter((line, i) => line !== after[i])
    expect(changed.length).toBe(1)
  })

  it('キー順が乱れた入力をスキーマの properties 記載順に並べ替える（$ref の入れ子含む）', () => {
    const scrambled = {
      terms: [
        {
          notes: '',
          aliases: [],
          definition: 'd',
          kind: 'data',
          name: 'n',
          id: 'term_AAAAAAAAAA',
        },
      ],
      title: 't',
      type: 'glossary',
      schemaVersion: 1,
    }
    const parsed = JSON.parse(serialize(scrambled, schema)) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(['schemaVersion', 'type', 'title', 'terms'])
    const term = (parsed.terms as Record<string, unknown>[])[0]
    expect(Object.keys(term)).toEqual(['id', 'name', 'kind', 'definition', 'aliases', 'notes'])
  })

  it('LF・末尾改行1つ・非ASCIIエスケープなし・空配列は1行', () => {
    const text = serialize(
      { schemaVersion: 1, type: 'glossary', title: '日本語タイトル', terms: [] },
      schema,
    )
    expect(text.includes('\r')).toBe(false)
    expect(text.endsWith('}\n')).toBe(true)
    expect(text.endsWith('}\n\n')).toBe(false)
    expect(text).toContain('"日本語タイトル"')
    expect(text).not.toContain('\\u')
    expect(text).toContain('"terms": []')
  })
})

describe('stripBom', () => {
  it('先頭の BOM を除去する（BOM なしはそのまま）', () => {
    expect(stripBom('\uFEFF{}')).toBe('{}')
    expect(stripBom('{}')).toBe('{}')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`./canonical` が存在しない）

- [ ] **Step 3: 実装を書く**

`src/core/canonical.ts` を作成。`reorder`/`deref` は `glossary-write.mjs:188-215` の移植であり、ロジックを変えないこと:

```ts
/**
 * 正規形シリアライザ（全ツール共通・コア）。
 * Skill 側 .claude/skills/glossary-term-register/scripts/glossary-write.mjs と
 * バイト単位で同一の出力を返すこと（canonical.test.ts の回帰テストで担保）。
 * キー順はスキーマの properties 記載順から実行時に導出する（ハードコード禁止）。
 */
export type JsonSchema = Record<string, unknown>

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export function serialize(value: unknown, schema: JsonSchema): string {
  return JSON.stringify(reorder(value, schema, schema), null, 2) + '\n'
}

function reorder(value: unknown, node: unknown, root: JsonSchema): unknown {
  const s = deref(node, root) as JsonSchema | undefined
  if (Array.isArray(value)) {
    return s?.items ? value.map((v) => reorder(v, s.items, root)) : value
  }
  if (value && typeof value === 'object') {
    const props = (s?.properties ?? {}) as Record<string, unknown>
    const record = value as Record<string, unknown>
    const inSchema = Object.keys(props).filter((k) => k in record)
    const rest = Object.keys(record).filter((k) => !(k in props))
    const out: Record<string, unknown> = {}
    for (const k of [...inSchema, ...rest]) {
      out[k] = reorder(record[k], props[k] ?? {}, root)
    }
    return out
  }
  return value
}

function deref(node: unknown, root: JsonSchema): unknown {
  let s = node as { $ref?: string } | undefined
  for (let i = 0; s && typeof s.$ref === 'string' && i < 20; i++) {
    if (!s.$ref.startsWith('#/')) return s
    s = s.$ref
      .slice(2)
      .split('/')
      .map((seg) => decodeURIComponent(seg).replace(/~1/g, '/').replace(/~0/g, '~'))
      .reduce<unknown>(
        (acc, k) => (acc == null ? acc : (acc as Record<string, unknown>)[k]),
        root,
      ) as { $ref?: string } | undefined
  }
  return s
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS（canonical.test.ts の5件すべて）

- [ ] **Step 5: コミット**

```bash
git add src/core/canonical.ts src/core/canonical.test.ts
git commit -m "M1: 正規形シリアライザ（Skill とのバイト一致を回帰テストで担保）" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: スキーマ検証器（レベル1判定）

**Files:**
- Create: `src/core/schema-validation.ts`
- Test: `src/core/schema-validation.test.ts`
- Modify: `package.json`（ajv 追加）

**Interfaces:**
- Consumes: `JsonSchema`（Task 1）
- Produces:
  - `interface SchemaValidationResult { ok: boolean; errors: string[] }`
  - `createSchemaValidator(schema: JsonSchema): (data: unknown) => SchemaValidationResult`

- [ ] **Step 1: ajv をインストール**

Run: `npm install ajv`
Expected: package.json の dependencies に `ajv` が入る

- [ ] **Step 2: 失敗するテストを書く**

`src/core/schema-validation.test.ts` を作成:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { JsonSchema } from './canonical'
import { createSchemaValidator } from './schema-validation'

const schema = JSON.parse(
  readFileSync(new URL('../../schemas/glossary.schema.json', import.meta.url), 'utf8'),
) as JsonSchema

const validate = createSchemaValidator(schema)

const validData = JSON.parse(
  readFileSync(new URL('../../sample-project/glossary.json', import.meta.url), 'utf8'),
) as Record<string, unknown>

function withTermPatch(patch: Record<string, unknown>, remove?: string) {
  const clone = structuredClone(validData) as { terms: Record<string, unknown>[] }
  Object.assign(clone.terms[0], patch)
  if (remove) delete clone.terms[0][remove]
  return clone
}

describe('createSchemaValidator', () => {
  it('Skill 生成のサンプルは合格する', () => {
    expect(validate(validData).ok).toBe(true)
  })

  it('必須キー欠落（notes なし）は不合格になり、理由が読める', () => {
    const result = validate(withTermPatch({}, 'notes'))
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('notes')
  })

  it('ID 規約違反（パターン不一致）は不合格', () => {
    expect(validate(withTermPatch({ id: 'term_abc' })).ok).toBe(false)
  })

  it('enum 外の kind は不合格', () => {
    expect(validate(withTermPatch({ kind: 'unknown-kind' })).ok).toBe(false)
  })

  it('未知キー（additionalProperties）は不合格', () => {
    expect(validate(withTermPatch({ tags: [] })).ok).toBe(false)
  })

  it('name の空文字（minLength: 1）は不合格', () => {
    expect(validate(withTermPatch({ name: '' })).ok).toBe(false)
  })
})
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`./schema-validation` が存在しない）

- [ ] **Step 4: 実装を書く**

`src/core/schema-validation.ts` を作成。ajv の設定は Skill 側（`glossary-write.mjs:81`）と同じ `{ allErrors: true, strict: false }` にして判定を一致させる:

```ts
import Ajv2020 from 'ajv/dist/2020.js'
import type { JsonSchema } from './canonical'

export interface SchemaValidationResult {
  ok: boolean
  /** 不合格時の人間可読メッセージ（レベル1「開けない」の理由表示に使う） */
  errors: string[]
}

export function createSchemaValidator(
  schema: JsonSchema,
): (data: unknown) => SchemaValidationResult {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const validate = ajv.compile(schema)
  return (data) => {
    if (validate(data)) return { ok: true, errors: [] }
    const errors = (validate.errors ?? []).map(
      (e) => `${e.instancePath || '(ルート)'}: ${e.message ?? ''}`,
    )
    return { ok: false, errors }
  }
}
```

注: `import Ajv2020 from 'ajv/dist/2020.js'` で型エラーが出る場合は `import { Ajv2020 } from 'ajv/dist/2020.js'`（名前付き）に切り替える。どちらも ajv v8 が公式に提供している。

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test`
Expected: PASS（schema-validation.test.ts の6件すべて）

- [ ] **Step 6: コミット**

```bash
git add src/core/schema-validation.ts src/core/schema-validation.test.ts package.json package-lock.json
git commit -m "M1: スキーマ検証器（ajv 2020-12、レベル1判定）" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: ToolModule インターフェイスとモジュールレジストリ

コアが「type からモジュールを引く」ための機構（rev 6章）。用語集1本でもここを経由する。登録時に ID プレフィクスの重複を検査する（rev 5章）。

**Files:**
- Create: `src/core/registry.ts`
- Test: `src/core/registry.test.ts`

**Interfaces:**
- Consumes: `JsonSchema`(Task 1)、React の `ComponentType`
- Produces:
  - `interface EditorProps<TData> { data: TData; onChange: (next: TData) => void }`
  - `interface ToolModule<TData> { type; schemaVersion; schema; idPrefixes; Editor; migrate }`
  - `type AnyToolModule = ToolModule<any>`
  - `interface ModuleRegistry { register(m: AnyToolModule): void; get(type: string): AnyToolModule | undefined }`
  - `createRegistry(): ModuleRegistry`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/registry.test.ts` を作成:

```ts
import { describe, expect, it } from 'vitest'
import { createRegistry, type AnyToolModule } from './registry'

function fakeModule(type: string, prefixes: string[]): AnyToolModule {
  return {
    type,
    schemaVersion: 1,
    schema: {},
    idPrefixes: prefixes,
    Editor: () => null,
    migrate: (d) => d,
  }
}

describe('createRegistry', () => {
  it('登録したモジュールを type で引ける', () => {
    const registry = createRegistry()
    const mod = fakeModule('glossary', ['term'])
    registry.register(mod)
    expect(registry.get('glossary')).toBe(mod)
  })

  it('未知の type は undefined', () => {
    const registry = createRegistry()
    expect(registry.get('stateMachine')).toBeUndefined()
  })

  it('type の重複登録は例外', () => {
    const registry = createRegistry()
    registry.register(fakeModule('glossary', ['term']))
    expect(() => registry.register(fakeModule('glossary', ['word']))).toThrow()
  })

  it('ID プレフィクスの重複登録は例外（rev 5章の衝突防止）', () => {
    const registry = createRegistry()
    registry.register(fakeModule('glossary', ['term']))
    expect(() => registry.register(fakeModule('stateMachine', ['state', 'term']))).toThrow(
      /term/,
    )
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`./registry` が存在しない）

- [ ] **Step 3: 実装を書く**

`src/core/registry.ts` を作成:

```ts
import type { ComponentType } from 'react'
import type { JsonSchema } from './canonical'

export interface EditorProps<TData> {
  data: TData
  onChange: (next: TData) => void
}

/**
 * ツールモジュール規約（rev 6章）の M1 時点の枠。
 * 整合性検証ルール（M2）と出力ロジック（M6）は該当マイルストーンでスロットを追加する。
 */
export interface ToolModule<TData = unknown> {
  /** 規約1: type 識別子 */
  type: string
  /** 現行の schemaVersion。これと異なる版のファイルは「一覧表示のみ」に落ちる */
  schemaVersion: number
  /** 規約2: JSON Schema（schemas/ の実体を import する。コピー禁止） */
  schema: JsonSchema
  /** ID 規約の entityPrefix。レジストリが登録時に重複検査する（rev 5章） */
  idPrefixes: readonly string[]
  /** 規約3: エディタコンポーネント */
  Editor: ComponentType<EditorProps<TData>>
  /** 規約6: マイグレータ（旧 schemaVersion → 現行版。初版は恒等） */
  migrate: (data: unknown, fromVersion: number) => TData
}

// Editor の data 型はモジュールごとに異なるため、レジストリ内では any で保持する
// （取り出した側が type で分岐して扱う。EditorProps が TData に対して不変なため
//   unknown では代入できない）
// biome-ignore / oxlint 上 any が警告される場合はこの1箇所に限り抑止してよい
export type AnyToolModule = ToolModule<any>

export interface ModuleRegistry {
  register(module: AnyToolModule): void
  get(type: string): AnyToolModule | undefined
}

export function createRegistry(): ModuleRegistry {
  const byType = new Map<string, AnyToolModule>()
  const prefixOwner = new Map<string, string>()
  return {
    register(module) {
      if (byType.has(module.type)) {
        throw new Error(`type が重複しています: ${module.type}`)
      }
      for (const p of module.idPrefixes) {
        const owner = prefixOwner.get(p)
        if (owner) {
          throw new Error(`ID プレフィクスが重複しています: ${p}（${owner} と ${module.type}）`)
        }
      }
      byType.set(module.type, module)
      for (const p of module.idPrefixes) prefixOwner.set(p, module.type)
    },
    get(type) {
      return byType.get(type)
    },
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS（registry.test.ts の4件すべて）

- [ ] **Step 5: コミット**

```bash
git add src/core/registry.ts src/core/registry.test.ts
git commit -m "M1: ToolModule 規約とモジュールレジストリ（プレフィクス重複検査つき）" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 読み込みパイプライン（editable / rejected / listOnly）

ファイル内容の文字列を受け取り、rev 5章の規定どおりに区分する。type / schemaVersion は**スキーマ検証より先に**読む（新版ファイルを「一覧表示のみ」に落とすため）。

**Files:**
- Create: `src/core/load.ts`
- Test: `src/core/load.test.ts`

**Interfaces:**
- Consumes: `stripBom`(Task 1)、`createSchemaValidator`(Task 2)、`ModuleRegistry` / `AnyToolModule`(Task 3)
- Produces:
  - `type LoadResult =`
    - `{ status: 'editable'; type: string; title: string; data: unknown }`
    - `| { status: 'rejected'; title: string | null; reason: string; errors: string[] }`
    - `| { status: 'listOnly'; type: string | null; title: string | null; reason: string }`
  - `classifyFile(text: string, registry: ModuleRegistry): LoadResult`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/load.test.ts` を作成。テスト用モジュールには本物の用語集スキーマを渡し、現実の判定を検証する:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { JsonSchema } from './canonical'
import { classifyFile } from './load'
import { createRegistry, type AnyToolModule } from './registry'

const glossarySchema = JSON.parse(
  readFileSync(new URL('../../schemas/glossary.schema.json', import.meta.url), 'utf8'),
) as JsonSchema

const sampleRaw = readFileSync(
  new URL('../../sample-project/glossary.json', import.meta.url),
  'utf8',
)

function makeRegistry() {
  const registry = createRegistry()
  const mod: AnyToolModule = {
    type: 'glossary',
    schemaVersion: 1,
    schema: glossarySchema,
    idPrefixes: ['term'],
    Editor: () => null,
    migrate: (d) => d,
  }
  registry.register(mod)
  return registry
}

describe('classifyFile', () => {
  it('スキーマ検証を通るファイルは editable（title と data つき）', () => {
    const result = classifyFile(sampleRaw, makeRegistry())
    expect(result.status).toBe('editable')
    if (result.status === 'editable') {
      expect(result.type).toBe('glossary')
      expect(result.title).toBe('facet 動作確認用サンプル 用語集')
    }
  })

  it('BOM つきでも editable（読み込み時に除去）', () => {
    const result = classifyFile('\uFEFF' + sampleRaw, makeRegistry())
    expect(result.status).toBe('editable')
  })

  it('JSON として壊れたテキストは rejected', () => {
    const result = classifyFile('{ こわれてる', makeRegistry())
    expect(result.status).toBe('rejected')
  })

  it('オブジェクトでない JSON（配列）は rejected', () => {
    expect(classifyFile('[]', makeRegistry()).status).toBe('rejected')
  })

  it('スキーマ検証に落ちるファイルは rejected でエラー理由を持つ（レベル1）', () => {
    const broken = JSON.parse(sampleRaw) as { terms: Record<string, unknown>[] }
    delete broken.terms[0].notes
    const result = classifyFile(JSON.stringify(broken), makeRegistry())
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') {
      expect(result.errors.length).toBeGreaterThan(0)
    }
  })

  it('未知の type は listOnly（クラッシュしない・前方互換）', () => {
    const text = JSON.stringify({ schemaVersion: 1, type: 'stateMachine', title: '遷移表' })
    const result = classifyFile(text, makeRegistry())
    expect(result.status).toBe('listOnly')
    if (result.status === 'listOnly') expect(result.title).toBe('遷移表')
  })

  it('未知の新しい schemaVersion は listOnly（レベル1拒否にしない）', () => {
    const data = JSON.parse(sampleRaw) as Record<string, unknown>
    data.schemaVersion = 2
    expect(classifyFile(JSON.stringify(data), makeRegistry()).status).toBe('listOnly')
  })

  it('type を持たないただの JSON は listOnly', () => {
    expect(classifyFile('{"name": "package"}', makeRegistry()).status).toBe('listOnly')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`./load` が存在しない）

- [ ] **Step 3: 実装を書く**

`src/core/load.ts` を作成:

```ts
import { stripBom } from './canonical'
import { createSchemaValidator, type SchemaValidationResult } from './schema-validation'
import type { AnyToolModule, ModuleRegistry } from './registry'

/**
 * ファイル読み込みの区分（rev 5章の2レベル検証のレベル1側）。
 * - editable: スキーマ検証まで通過。エディタで開ける
 * - rejected: レベル1（拒否）。構造が解釈できないため開けない
 * - listOnly: 未知 type / 未知の新しい schemaVersion。一覧表示のみ・編集不可
 *   （M2 で赤バッジ等の本格対応。M1 ではクラッシュしない受け皿として持つ）
 */
export type LoadResult =
  | { status: 'editable'; type: string; title: string; data: unknown }
  | { status: 'rejected'; title: string | null; reason: string; errors: string[] }
  | { status: 'listOnly'; type: string | null; title: string | null; reason: string }

const validatorCache = new WeakMap<AnyToolModule, (data: unknown) => SchemaValidationResult>()

export function classifyFile(text: string, registry: ModuleRegistry): LoadResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripBom(text))
  } catch (e) {
    return {
      status: 'rejected',
      title: null,
      reason: 'JSON として解釈できません',
      errors: [e instanceof Error ? e.message : String(e)],
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      status: 'rejected',
      title: null,
      reason: 'オブジェクトではありません',
      errors: [],
    }
  }
  const record = parsed as Record<string, unknown>
  const title = typeof record.title === 'string' ? record.title : null
  const type = typeof record.type === 'string' ? record.type : null

  // type / schemaVersion はスキーマ検証より先に読む（rev 5章。
  // 新版ファイルを「開けない」でなく「一覧表示のみ」に落とすため）
  if (type === null) {
    return {
      status: 'listOnly',
      type: null,
      title,
      reason: 'ツールのファイルではありません（type がありません）',
    }
  }
  const module = registry.get(type)
  if (!module) {
    return {
      status: 'listOnly',
      type,
      title,
      reason: `このバージョンでは編集できない type です: ${type}`,
    }
  }
  if (record.schemaVersion !== module.schemaVersion) {
    // 既知の旧版が生まれたら module.migrate による移行をここに挟む
    // （glossary は schemaVersion 1 が初版のため、現状「異なる版」は新版しかない）
    return {
      status: 'listOnly',
      type,
      title,
      reason: `このバージョンでは編集できない schemaVersion です: ${String(record.schemaVersion)}`,
    }
  }

  let validate = validatorCache.get(module)
  if (!validate) {
    validate = createSchemaValidator(module.schema)
    validatorCache.set(module, validate)
  }
  const result = validate(record)
  if (!result.ok) {
    return {
      status: 'rejected',
      title,
      reason: 'スキーマ検証に失敗しました（このファイルは開けません）',
      errors: result.errors,
    }
  }
  return { status: 'editable', type, title: title ?? '(無題)', data: record }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS(load.test.ts の8件すべて)

- [ ] **Step 5: コミット**

```bash
git add src/core/load.ts src/core/load.test.ts
git commit -m "M1: 読み込みパイプライン（editable/rejected/listOnly の区分け）" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 用語集エディタコンポーネント

5列テーブル（名称／種別／定義／別名／備考）。M1 は「セルを直接編集できる」ことだけを提供する。行の追加・削除・並び替え・キーボード操作・warning 表示はスコープ外（M2/M3）。

入力欄は**非制御（defaultValue）**にする。理由: M1 では IME の composition 対応（M3）を入れないため、制御コンポーネントで日本語入力が乱れるリスクを避け、ブラウザネイティブの入力挙動に任せる。`key={term.id}` で行のアイデンティティを固定する。

**Files:**
- Create: `src/modules/glossary/GlossaryEditor.tsx`
- Modify: `tsconfig.app.json`（`resolveJsonModule` 追加。スキーマ JSON を import するため）

**Interfaces:**
- Consumes: `EditorProps<TData>`(Task 3)、生成型 `GlossarySchemaVersion1` / `Term`（`src/types/glossary.ts`）、`schemas/glossary.schema.json`（import）
- Produces: `GlossaryEditor: (props: EditorProps<GlossarySchemaVersion1>) => JSX 要素`（Task 6 が `ToolModule.Editor` として登録する）

- [ ] **Step 1: tsconfig.app.json に resolveJsonModule を足す**

`tsconfig.app.json` の `compilerOptions` に1行追加（`"skipLibCheck": true,` の直後）:

```json
    "resolveJsonModule": true,
```

- [ ] **Step 2: コンポーネントを実装する**

`src/modules/glossary/GlossaryEditor.tsx` を作成:

```tsx
import type { EditorProps } from '@/core/registry'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'

// 種別の選択肢はスキーマの enum から実行時に導出する（ハードコードすると enum 改訂時に静かにずれる）
const KIND_OPTIONS = glossarySchema.$defs.term.properties.kind.enum

// M1 の別名セルは読点・カンマ区切りの1入力欄（暫定）。M3 で操作性ごと作り直す
function parseAliases(raw: string): string[] {
  return raw
    .split(/[、,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

const cellInput =
  'w-full bg-transparent px-2 py-1 text-ink outline-none focus:bg-surface rounded-sm'

export function GlossaryEditor({ data, onChange }: EditorProps<GlossarySchemaVersion1>) {
  const updateTerm = (index: number, patch: Partial<Term>) => {
    const terms = data.terms.map((t, i) => (i === index ? { ...t, ...patch } : t))
    onChange({ ...data, terms })
  }

  return (
    <div className="p-4">
      <h2 className="mb-3 text-base font-bold text-ink">{data.title}</h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-ink-muted">
            <th className="w-40 px-2 py-1 font-normal">名称</th>
            <th className="w-32 px-2 py-1 font-normal">種別</th>
            <th className="px-2 py-1 font-normal">定義</th>
            <th className="w-44 px-2 py-1 font-normal">別名</th>
            <th className="w-44 px-2 py-1 font-normal">備考</th>
          </tr>
        </thead>
        <tbody>
          {data.terms.map((term, i) => (
            <tr key={term.id} className="border-b border-rule align-top">
              <td>
                <input
                  className={cellInput}
                  defaultValue={term.name}
                  onChange={(e) => {
                    // 空名称は保存対象にしない（スキーマ minLength: 1。空のまま
                    // 書き込むとレベル1違反ファイルを自分で作ることになる）。
                    // 空の間は直前の name がデータ側に残る
                    const v = e.target.value
                    if (v.trim() !== '') updateTerm(i, { name: v })
                  }}
                />
              </td>
              <td>
                <select
                  className={cellInput}
                  defaultValue={term.kind}
                  onChange={(e) => updateTerm(i, { kind: e.target.value as Term['kind'] })}
                >
                  {KIND_OPTIONS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  className={cellInput}
                  defaultValue={term.definition}
                  onChange={(e) => updateTerm(i, { definition: e.target.value })}
                />
              </td>
              <td>
                <input
                  className={cellInput}
                  defaultValue={term.aliases.join('、')}
                  onChange={(e) => updateTerm(i, { aliases: parseAliases(e.target.value) })}
                />
              </td>
              <td>
                <input
                  className={cellInput}
                  defaultValue={term.notes}
                  onChange={(e) => updateTerm(i, { notes: e.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: 型チェックが通ることを確認**

Run: `npx tsc -b`
Expected: エラーなし（`glossarySchema.$defs.term.properties.kind.enum` は resolveJsonModule により string[] として型付けされる。もし型エラーになる場合は `(glossarySchema.$defs.term.properties.kind.enum as string[])` と明示する）

- [ ] **Step 4: コミット**

```bash
git add src/modules/glossary/GlossaryEditor.tsx tsconfig.app.json
git commit -m "M1: 用語集エディタ（5列テーブル・セル直接編集）" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 用語集モジュールの組み立てと登録

規約6点セットの M1 分（type 識別子・スキーマ・エディタ・恒等マイグレータ）を1つの `ToolModule` に束ね、アプリ全体のレジストリに登録する。

**Files:**
- Create: `src/modules/glossary/migrate.ts`
- Create: `src/modules/glossary/module.ts`
- Create: `src/modules/index.ts`
- Test: `src/modules/glossary/migrate.test.ts`

**Interfaces:**
- Consumes: `ToolModule`/`createRegistry`(Task 3)、`GlossaryEditor`(Task 5)、`JsonSchema`(Task 1)、生成型 `GlossarySchemaVersion1`
- Produces:
  - `migrateGlossary(data: unknown, fromVersion: number): GlossarySchemaVersion1`
  - `glossaryModule: ToolModule<GlossarySchemaVersion1>`
  - `appRegistry: ModuleRegistry`（glossary 登録済み。App が使う唯一のレジストリ）

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/glossary/migrate.test.ts` を作成。マイグレータの恒等性は実装スコープ定義書 5節が名指しするテスト対象:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { migrateGlossary } from './migrate'

describe('migrateGlossary（schemaVersion 1 は初版）', () => {
  it('恒等変換である（同一参照をそのまま返す）', () => {
    const data = JSON.parse(
      readFileSync(new URL('../../../sample-project/glossary.json', import.meta.url), 'utf8'),
    ) as unknown
    expect(migrateGlossary(data, 1)).toBe(data)
  })
})

describe('appRegistry', () => {
  it('glossary モジュールが登録されている', async () => {
    const { appRegistry } = await import('@/modules')
    const mod = appRegistry.get('glossary')
    expect(mod?.type).toBe('glossary')
    expect(mod?.schemaVersion).toBe(1)
    expect(mod?.idPrefixes).toEqual(['term'])
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`./migrate` / `@/modules` が存在しない）

- [ ] **Step 3: 実装を書く**

`src/modules/glossary/migrate.ts`:

```ts
import type { GlossarySchemaVersion1 } from '@/types/glossary'

/**
 * 規約6: マイグレータ。schemaVersion 1 が初版のため旧版が存在せず、
 * 恒等変換の枠だけを置く。schemaVersion 2 が生まれた時点で最初の変換を実装する。
 */
export function migrateGlossary(data: unknown, _fromVersion: number): GlossarySchemaVersion1 {
  return data as GlossarySchemaVersion1
}
```

`src/modules/glossary/module.ts`:

```ts
import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { GlossarySchemaVersion1 } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'
import { GlossaryEditor } from './GlossaryEditor'
import { migrateGlossary } from './migrate'

export const glossaryModule: ToolModule<GlossarySchemaVersion1> = {
  type: 'glossary',
  schemaVersion: 1,
  schema: glossarySchema as JsonSchema,
  idPrefixes: ['term'],
  Editor: GlossaryEditor,
  migrate: migrateGlossary,
}
```

`src/modules/index.ts`:

```ts
import { createRegistry } from '@/core/registry'
import { glossaryModule } from './glossary/module'

/** アプリ全体で使うレジストリ。新ツールはここに register を1行足す（rev 6章）。 */
export const appRegistry = createRegistry()
appRegistry.register(glossaryModule)
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS（migrate.test.ts の2件を含む全件）

- [ ] **Step 5: コミット**

```bash
git add src/modules/glossary/migrate.ts src/modules/glossary/migrate.test.ts src/modules/glossary/module.ts src/modules/index.ts
git commit -m "M1: 用語集モジュールの組み立て（恒等マイグレータ・appRegistry 登録）" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 自動保存コア（デバウンス・差分なし書き込み抑止）

React 非依存の純ロジックとして実装し、フェイクタイマーでテストする。重要な仕様は2つ: **baseline（読み込み時点の正規形）と同じ内容は書かない**（「読み込み・閲覧では書き戻さない」原則）、**書き込みは直列化する**（前の書き込み完了を待つ）。

**Files:**
- Create: `src/core/autosave.ts`
- Test: `src/core/autosave.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `interface AutoSaver { update(text: string): void; flush(): Promise<void>; dispose(): void }`
  - `createAutoSaver(opts: { delayMs: number; baseline: string; write: (text: string) => Promise<void> }): AutoSaver`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/autosave.test.ts` を作成:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutoSaver } from './autosave'

describe('createAutoSaver', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('baseline と同じ内容は書かない（閲覧では書き戻さない）', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('A')
    await vi.runAllTimersAsync()
    expect(write).not.toHaveBeenCalled()
  })

  it('変更はデバウンス後に1回だけ書かれる', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    expect(write).not.toHaveBeenCalled()
    await vi.runAllTimersAsync()
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('B')
  })

  it('連続更新は最後の内容だけが1回書かれる', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    saver.update('BC')
    saver.update('BCD')
    await vi.runAllTimersAsync()
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('BCD')
  })

  it('変更後に保存済み内容へ戻したら書かない', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    saver.update('A')
    await vi.runAllTimersAsync()
    expect(write).not.toHaveBeenCalled()
  })

  it('保存後は保存済み内容が新しい基準になる（同じ内容の再書き込みなし）', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    await vi.runAllTimersAsync()
    saver.update('B')
    await vi.runAllTimersAsync()
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('flush はデバウンスを待たず即時に書く', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    await saver.flush()
    expect(write).toHaveBeenCalledWith('B')
  })

  it('dispose 後は保留中の書き込みが破棄される', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    saver.dispose()
    await vi.runAllTimersAsync()
    expect(write).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`./autosave` が存在しない）

- [ ] **Step 3: 実装を書く**

`src/core/autosave.ts` を作成:

```ts
/**
 * デバウンス付き自動保存（コア・純ロジック。React 非依存）。
 * - baseline（読み込み時点の正規形）と同じ内容は書かない
 *   （「読み込み・閲覧では書き戻さない」原則。rev 5章）
 * - 書き込みは直列化する（前の write の完了を待ってから次を書く）
 * - write の失敗は console に出すにとどめる（UI への通知は M5 の外部変更検知と併せて設計する）
 */
export interface AutoSaver {
  update(text: string): void
  /** 保留中の書き込みを即時実行して完了を待つ（ファイル切替・終了時用） */
  flush(): Promise<void>
  dispose(): void
}

export function createAutoSaver(opts: {
  delayMs: number
  baseline: string
  write: (text: string) => Promise<void>
}): AutoSaver {
  let lastSaved = opts.baseline
  let pending: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let chain: Promise<void> = Promise.resolve()

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const commit = (): Promise<void> => {
    const text = pending
    pending = null
    clearTimer()
    if (text === null || text === lastSaved) return chain
    chain = chain
      .then(() => opts.write(text))
      .then(() => {
        lastSaved = text
      })
      .catch((err: unknown) => {
        console.error('自動保存に失敗しました', err)
      })
    return chain
  }

  return {
    update(text) {
      if (text === lastSaved) {
        pending = null
        clearTimer()
        return
      }
      pending = text
      clearTimer()
      timer = setTimeout(() => {
        void commit()
      }, opts.delayMs)
    },
    flush() {
      return commit()
    },
    dispose() {
      clearTimer()
      pending = null
    },
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: PASS（autosave.test.ts の7件すべて）

- [ ] **Step 5: コミット**

```bash
git add src/core/autosave.ts src/core/autosave.test.ts
git commit -m "M1: 自動保存コア（デバウンス・無変更書き込み抑止・直列書き込み）" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: ファイル I/O アダプタと capabilities

Tauri プラグイン呼び出しを1ファイルに隔離する。**capabilities の追加が必要**: 現状の `fs:default` はアプリ専用ディレクトリの読みしか許可しておらず、`readDir` / `readTextFile` / `writeTextFile` コマンドの許可を明示する必要がある（パスの scope はダイアログでフォルダを選んだ時点で実行時付与される。`recursive: true` でフォルダ配下まで入る）。静的な scope 追加はしない（M2/M5 の管轄）。

**Files:**
- Create: `src/fs/project-fs.ts`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `package.json`（`@tauri-apps/api` を直接依存に追加）

**Interfaces:**
- Consumes: `@tauri-apps/plugin-dialog` の `open`、`@tauri-apps/plugin-fs` の `readDir`/`readTextFile`/`writeTextFile`、`@tauri-apps/api/path` の `join`
- Produces:
  - `pickProjectFolder(): Promise<string | null>`
  - `listJsonFiles(dir: string): Promise<string[]>`（フォルダ直下の .json の絶対パス）
  - `readProjectFile(path: string): Promise<string>`
  - `writeProjectFile(path: string, text: string): Promise<void>`

- [ ] **Step 1: @tauri-apps/api をインストール**

Run: `npm install @tauri-apps/api`
Expected: dependencies に追加される（プラグインの推移的依存として既に node_modules にはあるが、直接 import するため明示する）

- [ ] **Step 2: capabilities に fs コマンド許可を足す**

`src-tauri/capabilities/default.json` の `permissions` を次の内容にする:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "既定の権限。fs はコマンド許可のみで、パスの scope はダイアログで選んだフォルダ（recursive）に実行時付与される",
  "windows": [
    "main"
  ],
  "permissions": [
    "core:default",
    "fs:default",
    "fs:allow-read-dir",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "dialog:default"
  ]
}
```

- [ ] **Step 3: アダプタを実装する**

`src/fs/project-fs.ts` を作成:

```ts
import { join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

/**
 * Tauri のファイルアクセスをここに隔離する（コアは Tauri を知らない）。
 * scope はダイアログ選択で実行時に付与されるため、recursive: true が必須
 * （これがないとフォルダ配下のファイルが scope に入らない）。
 */
export async function pickProjectFolder(): Promise<string | null> {
  const selected = await open({ directory: true, recursive: true })
  return typeof selected === 'string' ? selected : null
}

/** フォルダ直下の .json ファイルの絶対パス一覧（サブフォルダは見ない） */
export async function listJsonFiles(dir: string): Promise<string[]> {
  const entries = await readDir(dir)
  const files: string[] = []
  for (const entry of entries) {
    if (entry.isFile && entry.name.toLowerCase().endsWith('.json')) {
      files.push(await join(dir, entry.name))
    }
  }
  return files
}

export async function readProjectFile(path: string): Promise<string> {
  return readTextFile(path)
}

export async function writeProjectFile(path: string, text: string): Promise<void> {
  await writeTextFile(path, text)
}
```

- [ ] **Step 4: 型チェックとテストが通ることを確認**

Run: `npx tsc -b && npm test`
Expected: 型エラーなし・全テスト PASS（このタスクの動作実証は Task 10 の手動 E2E で行う。Tauri ランタイムが必要なためユニットテストは書かない）

- [ ] **Step 5: コミット**

```bash
git add src/fs/project-fs.ts src-tauri/capabilities/default.json package.json package-lock.json
git commit -m "M1: ファイルI/Oアダプタと fs コマンド許可の追加" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: App 統合（額縁：フォルダを開く→一覧→編集→自動保存）

M0 のプレースホルダ画面を丸ごと置き換える（App.tsx のコメントにも「M1 で丸ごと置き換わる」と明記済み）。テーマ切替は額縁機能として残す。

**Files:**
- Modify: `src/App.tsx`（全面書き換え）

**Interfaces:**
- Consumes: `serialize`(Task 1)、`classifyFile`/`LoadResult`(Task 4)、`appRegistry`(Task 6)、`createAutoSaver`/`AutoSaver`(Task 7)、`pickProjectFolder`/`listJsonFiles`/`readProjectFile`/`writeProjectFile`(Task 8)、shadcn `Button`
- Produces: 動くアプリ（Task 10 で検証）

- [ ] **Step 1: App.tsx を書き換える**

`src/App.tsx` を次の内容で全面置換:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createAutoSaver, type AutoSaver } from '@/core/autosave'
import { serialize } from '@/core/canonical'
import { classifyFile, type LoadResult } from '@/core/load'
import {
  listJsonFiles,
  pickProjectFolder,
  readProjectFile,
  writeProjectFile,
} from '@/fs/project-fs'
import { appRegistry } from '@/modules'

const AUTOSAVE_DELAY_MS = 500

interface ProjectFile {
  path: string
  name: string
  result: LoadResult
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function App() {
  const [dark, setDark] = useState(false)
  const [projectDir, setProjectDir] = useState<string | null>(null)
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  // 編集中データ。selected が editable のときだけ非 null
  const [editingData, setEditingData] = useState<unknown>(null)
  const saverRef = useRef<AutoSaver | null>(null)

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }

  // アンマウント時に保留中の保存を流す
  useEffect(() => {
    return () => {
      void saverRef.current?.flush()
      saverRef.current?.dispose()
    }
  }, [])

  const closeCurrentFile = async () => {
    await saverRef.current?.flush()
    saverRef.current?.dispose()
    saverRef.current = null
    setSelectedPath(null)
    setEditingData(null)
  }

  const openFolder = async () => {
    const dir = await pickProjectFolder()
    if (dir === null) return
    await closeCurrentFile()
    const paths = await listJsonFiles(dir)
    const loaded: ProjectFile[] = []
    for (const path of paths) {
      const text = await readProjectFile(path)
      loaded.push({ path, name: fileName(path), result: classifyFile(text, appRegistry) })
    }
    setProjectDir(dir)
    setFiles(loaded)
  }

  const selectFile = async (file: ProjectFile) => {
    await closeCurrentFile()
    setSelectedPath(file.path)
    if (file.result.status !== 'editable') return
    const module = appRegistry.get(file.result.type)
    if (!module) return
    // baseline は「読み込んだ内容の正規形」。無編集ならバイト一致で書き込みが起きず、
    // 非正規ファイルでも最初の編集まで書き戻さない（rev 5章）
    saverRef.current = createAutoSaver({
      delayMs: AUTOSAVE_DELAY_MS,
      baseline: serialize(file.result.data, module.schema),
      write: (text) => writeProjectFile(file.path, text),
    })
    setEditingData(file.result.data)
  }

  const selected = files.find((f) => f.path === selectedPath) ?? null
  const selectedModule =
    selected && selected.result.status === 'editable'
      ? appRegistry.get(selected.result.type)
      : undefined

  return (
    <main className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="flex items-center gap-4 border-b border-rule px-6 py-3">
        <h1 className="text-lg font-bold text-ink">facet</h1>
        <Button onClick={() => void openFolder()}>フォルダを開く</Button>
        {projectDir && <span className="text-sm text-ink-muted">{projectDir}</span>}
        <button
          type="button"
          className="ml-auto text-sm text-ink-muted underline"
          onClick={toggleTheme}
        >
          {dark ? 'ライト' : 'ダーク'}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 border-r border-rule">
          {files.length === 0 ? (
            <p className="p-4 text-sm text-ink-muted">
              プロジェクトフォルダを開くと JSON ファイルの一覧が出ます。
            </p>
          ) : (
            <ul>
              {files.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    className={`block w-full px-4 py-2 text-left text-sm hover:bg-surface ${
                      file.path === selectedPath ? 'bg-surface' : ''
                    }`}
                    onClick={() => void selectFile(file)}
                  >
                    <span className="block text-ink">{file.name}</span>
                    <span className="block text-xs text-ink-muted">
                      {file.result.status === 'editable' && file.result.title}
                      {file.result.status === 'rejected' && (
                        <span className="text-warning">開けない</span>
                      )}
                      {file.result.status === 'listOnly' && '編集不可'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="min-w-0 flex-1 overflow-auto">
          {selected === null && (
            <p className="p-6 text-sm text-ink-muted">ファイルを選ぶとここで編集できます。</p>
          )}
          {selected?.result.status === 'rejected' && (
            <div className="p-6">
              <h2 className="mb-2 font-bold text-warning">
                このファイルは開けません（{selected.result.reason}）
              </h2>
              <ul className="list-disc pl-5 text-sm text-ink">
                {selected.result.errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-ink-muted">
                外部エディタで修正してからフォルダを開き直してください。
              </p>
            </div>
          )}
          {selected?.result.status === 'listOnly' && (
            <p className="p-6 text-sm text-ink-muted">{selected.result.reason}</p>
          )}
          {selected?.result.status === 'editable' &&
            selectedModule &&
            editingData !== null && (
              <selectedModule.Editor
                data={editingData}
                onChange={(next: unknown) => {
                  setEditingData(next)
                  saverRef.current?.update(serialize(next, selectedModule.schema))
                }}
              />
            )}
        </section>
      </div>
    </main>
  )
}

export default App
```

- [ ] **Step 2: 型チェック・テスト・ビルドが通ることを確認**

Run: `npx tsc -b && npm test && npm run build`
Expected: すべて成功（`<selectedModule.Editor>` の data が any 受けになるのは AnyToolModule の設計どおり）

- [ ] **Step 3: コミット**

```bash
git add src/App.tsx
git commit -m "M1: 額縁の統合（フォルダを開く→一覧→編集→自動保存の配線）" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: E2E 手動検証（M1 完了条件の確認）

実装スコープ定義書の M1 完了条件2つを実アプリで確認する。**このタスクは手動操作を含む**ため、実行者は各確認の結果（成功／失敗と観察内容）を記録すること。

**Files:**
- 一時作成→削除: `sample-project\broken.json`（検証用の壊れたファイル）
- 一時変更→復元: `sample-project\glossary.json`

- [ ] **Step 1: アプリを起動する**

Run: `npm run tauri dev`（バックグラウンド起動）
Expected: ウィンドウが開き、ヘッダに「フォルダを開く」ボタンが出る

- [ ] **Step 2: 完了条件1 — Git diff が編集箇所だけに出る**

1. 「フォルダを開く」→ `C:\Dev\Projects\facet\sample-project` を選択
2. 一覧に `glossary.json`（title「facet 動作確認用サンプル 用語集」）が出ることを確認
3. クリックして開き、「未定義」の行の備考（notes）セルに `（M1動作確認）` と追記
4. 1秒待つ（自動保存のデバウンス 500ms）
5. 確認:

```bash
git diff --numstat sample-project/glossary.json
```

Expected: `1  1  sample-project/glossary.json`（追加1行・削除1行＝該当行だけの差分）。さらに `git diff sample-project/glossary.json` で変更行が notes の行のみであること、CRLF 化していないこと（diff に `^M` が出ない）を目視確認

- [ ] **Step 3: 無編集で開き直しても diff が増えないことを確認**

1. アプリでいったん別ファイル（なければ同じファイル）を選び直し、`glossary.json` を再度開いて**何も編集しない**
2. 確認:

```bash
git diff --numstat sample-project/glossary.json
```

Expected: Step 2 と同じ `1 1` のまま（閲覧で書き戻していない）

- [ ] **Step 4: 完了条件2 — スキーマ検証に落ちるファイルは「開けない」**

1. 壊れたファイルを作る:

```bash
cat > sample-project/broken.json <<'EOF'
{
  "schemaVersion": 1,
  "type": "glossary",
  "title": "壊れた用語集",
  "terms": [
    {
      "id": "term_x",
      "name": "ID規約違反",
      "kind": "data",
      "definition": "",
      "aliases": [],
      "notes": ""
    }
  ]
}
EOF
```

2. アプリで「フォルダを開く」から `sample-project` を開き直す
3. 一覧の `broken.json` に「開けない」と表示されることを確認
4. クリックすると右側に理由（スキーマ検証失敗と `/terms/0/id` のパターン違反）が表示され、**アプリがクラッシュしない**ことを確認

Expected: レベル1拒否として扱われ、編集画面には入れない

- [ ] **Step 5: 後片付け**

```bash
rm sample-project/broken.json
git checkout -- sample-project/glossary.json
git status
```

Expected: working tree clean（検証用の変更が残っていない）

- [ ] **Step 6: 記録とアプリ停止**

起動したままの `npm run tauri dev` を停止する。検証結果（完了条件1・2の成否）を報告する。

**トラブルシューティング（発生時のみ）**: フォルダ選択後に `readDir` / `readTextFile` / `writeTextFile` が forbidden エラーになる場合、Task 8 の capabilities 変更後に Rust 側の再ビルドが走っていない可能性がある。`npm run tauri dev` を再起動する。それでも失敗する場合は `pickProjectFolder` の `recursive: true` が効いているかを確認する（scope 不足はエラーメッセージに path が出る）。

---

## 計画外にしたものと理由（実行者への注意）

- **行の追加・削除・並び替え**: M3（キーボード操作の一元化）の管轄。M1 のエディタは既存セルの編集のみ
- **warning 表示（undecided / definition 空のセル強調）**: M2 の管轄
- **整合性検証（ID 重複・name 重複・alias 衝突・単一性）**: M2 の管轄。`ToolModule` へのスロット追加も M2 で行う
- **別名セルの区切り文字方式**: M1 の暫定仕様（読点・カンマ区切りの1入力欄）。M3 で作り直す
- **IME 対応・制御コンポーネント化**: M3。M1 は非制御入力でブラウザネイティブの挙動に任せる
- **保存インジケータ・エラートースト**: 自動保存の失敗は console 出力のみ。UI 通知は M5 と併せて設計する
