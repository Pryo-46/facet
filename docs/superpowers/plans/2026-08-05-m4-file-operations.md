# M4: ファイル一覧の額縁とファイル操作 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ファイル一覧の額縁に「新規作成（type選択）／削除（OSゴミ箱へ）／用語集0個からの自動生成」を入れ、単一性違反をアプリ内で解消できるようにする。

**Architecture:** ファイル操作のロジックは `src/core/file-ops.ts` に純粋な形（`join` / `write` / `trash` を注入）で置き、`src/App.tsx` は状態の配線だけを担う。OS ゴミ箱への移動だけは Tauri の fs プラグインに API が無いため、`src-tauri` に自前コマンドを1本だけ追加する。確認ダイアログを出している間は `KeyContext.modalOpen` を true にして操作言語を止める（M3 で用意済みの配線点）。ファイル一覧は肥大化した `App.tsx` から `src/components/FileList.tsx` に切り出す。

**Tech Stack:** Tauri 2 / React 19 / TypeScript / Tailwind CSS v4 / shadcn|ui（Radix ベース）/ Vitest（＋jsdom）/ Rust（`trash` crate）

## Global Constraints

これらは全タスクの要件に暗黙で含まれる。

- **正規形は1文字もずらさない**: キー順＝JSON Schema の properties 記載順から実行時導出（ハードコード禁止）／インデント＝スペース2／改行＝LF／末尾改行あり／BOM なし／非ASCII エスケープなし。書き込みは必ず `src/core/canonical.ts` の `serialize(value, schema)` を通す。
- **型定義は書かない**: `src/types/glossary.ts` はスキーマからの生成物（`.gitignore` 済み、`pretest` 等で自動再生成）。手書きの型と二重管理しない。
- **色値の直書き禁止**: 役割トークン（`ink` / `ink-muted` / `warning` / `warning-fg` / `ok` / `canvas` / `surface` / `rule`）だけを使う。値の確定は M7。
- **キー判定は `src/core/keyboard/keymap.ts` の `resolveCommand` ただ1箇所**。`e.key` をコア以外で直接見ない。修飾キーの表示名は `src/core/keyboard/platform.ts` の `altModifierLabel` / `primaryModifierLabel` を通す。
- **コアは Tauri を知らない**: `@tauri-apps/*` の import は `src/fs/**` にだけ置く。`src/core/**` は関数注入で受け取る。
- **ファイル名は識別子ではない**（rev 5章）。判別は必ず中身の `type` で行う。
- **DOM テストは対象ファイル先頭の `// @vitest-environment jsdom` で切り替える**。グローバルの `test.environment` は `node` のまま。Vitest の `globals` は無効なので `afterEach(cleanup)` を明示する。要素は **role とアクセシブル名で引き**、クラス名やレイアウトに依存させない。
- **テストの追加先は `tsconfig.test.json`** が拾う（`src/**/*.test.ts` / `*.test.tsx`）。`node` 型が要るテストを `tsconfig.app.json` に混ぜない。
- **lint 警告ゼロを維持する**（`npm run lint`）。`src/components/ui/**` は生成物なので対象外・手で整形しない。
- **実機確認（`npm run tauri dev` の手順）は実装者が実行しない。** GUI 操作（フォルダ選択ダイアログ・OS ゴミ箱・ウィンドウの ×・読み取り専用属性）は自動化できないため、人間が全タスク完了後にまとめて行う。該当ステップは「未実施（人間が後で確認）」と報告し、代わりに `npm test` / `npx tsc -b tsconfig.test.json` / `npm run lint` / `npm run build` を必ず通しきること。
- **worktree で `npm run tauri dev` する前に、別チェックアウトの dev サーバーがポート5173を掴んでいないか確認する**（`Get-NetTCPConnection -LocalPort 5173`）。掴まれていると古いコードのアプリが表示される。
- **このタスク中に「新しい Tauri の JS API」を使うときは `src-tauri/capabilities/default.json` を確認する**（M2 で `core:window:allow-destroy` を踏んだ）。ただし**自前の `#[tauri::command]` は ACL 対象外**なので capabilities への追記は不要。

## M4 のスコープ（実装スコープ定義書 4節 / 7〜9節の申し送りより）

| 項目 | 出典 | 担当タスク |
| --- | --- | --- |
| 新規作成（type選択） | 4節 M4 | Task 1・3・5 |
| 削除（OSゴミ箱へ。完全削除しない） | 4節 M4 | Task 2・3・4・6 |
| 赤バッジ表示 | 8節「M2 で実装済み」 | 対応不要 |
| 用語集0個の状態からの自動生成 | 4節 M4 / rev 5章 | Task 3・7 |
| 単一性違反の解消手段 | 8節・9節 | Task 6（削除が入って閉じる） |
| モーダルの配線点（`KeyContext.modalOpen`）を額縁とエディタの2箇所に渡す | 9節 | Task 6 |
| 用語1件だけの行を消すとフォーカスが `document.body` に落ちる | 9節 | Task 7 |
| 保存できないと閉じられない（脱出口が無い） | 8節「いつでもよいが、忘れると実害化する残件」 | Task 8 |

**Task 8 だけはスコープ定義書 4節の M4 に明記が無い**。8節の「いつでもよいが、忘れると実害化する残件」からの繰り上げで、M4 が確認ダイアログの基盤を作るこのタイミングが最も安く済むため入れている。切りたければ Task 8 だけ落としても他タスクは成立する。

M4 で**扱わないもの**: `saveError` のクリア条件（M5）／外部変更検知（M5）／Markdown 出力（M6）／デザイントークンの確定（M7）／用語のインライン登録コンポーネント（呼び出す側の他ツールが無い。ただし自動生成のコア関数は Task 3 で作る）。

---

### Task 1: 新規ファイルの雛形と名前解決（純ロジック）

新規作成が書き込むテキストを、Tauri に一切触れずに組み立てられるようにする。**ここで作るテキストが正規形でなければ、作った直後の1回目の編集で全行 diff が出る**——このプロジェクト最大のリスク箇所（スコープ定義書3節）に新しい入口を開けることになるので、正規形とスキーマ適合を両方テストで固定する。

**Files:**
- Create: `src/core/file-naming.ts`
- Create: `src/core/file-naming.test.ts`
- Create: `src/core/new-file.ts`
- Create: `src/core/new-file.test.ts`
- Modify: `src/core/registry.ts`（`createEmpty` スロットと `list()` を追加）
- Modify: `src/core/registry.test.ts`（`list()` のテストを追加）
- Modify: `src/modules/glossary/module.ts`（`createEmpty` を実装）

**Interfaces:**
- Consumes: `serialize(value, schema)`（`src/core/canonical.ts`）、`createSchemaValidator(schema)`（`src/core/schema-validation.ts`、テストで使う）、`AnyToolModule`（`src/core/registry.ts`）
- Produces:
  - `resolveNewFileName(baseName: string, existing: readonly string[]): string`
  - `buildNewFile(module: AnyToolModule, existingNames: readonly string[]): NewFile`
  - `interface NewFile { name: string; text: string; data: unknown }`
  - `ToolModule<TData>.createEmpty: (title: string) => TData`
  - `ModuleRegistry.list(): AnyToolModule[]`

---

- [ ] **Step 1: `resolveNewFileName` の失敗するテストを書く**

Create `src/core/file-naming.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveNewFileName } from './file-naming'

describe('resolveNewFileName', () => {
  it('衝突が無ければ連番を付けない', () => {
    expect(resolveNewFileName('用語集', [])).toBe('用語集.json')
  })

  it('衝突したら 2 から連番を足す', () => {
    expect(resolveNewFileName('用語集', ['用語集.json'])).toBe('用語集-2.json')
    expect(resolveNewFileName('用語集', ['用語集.json', '用語集-2.json'])).toBe('用語集-3.json')
  })

  it('連番に穴があいていれば小さい方から埋める', () => {
    expect(resolveNewFileName('用語集', ['用語集-2.json'])).toBe('用語集.json')
  })

  it('大文字小文字違いも衝突として扱う（Windows のファイル名は大文字小文字を区別しない）', () => {
    expect(resolveNewFileName('glossary', ['GLOSSARY.JSON'])).toBe('glossary-2.json')
  })

  it('ファイル名に使えない文字を落とす', () => {
    expect(resolveNewFileName('用語:集/一覧', [])).toBe('用語_集_一覧.json')
  })

  it('関係ないファイル名は衝突とみなさない', () => {
    expect(resolveNewFileName('用語集', ['メモ.json', '用語集の下書き.json'])).toBe('用語集.json')
  })
})
```

- [ ] **Step 2: テストを走らせて落ちることを確認する**

Run: `npm test -- src/core/file-naming.test.ts`
Expected: FAIL（`Failed to resolve import "./file-naming"`）

- [ ] **Step 3: `resolveNewFileName` を実装する**

Create `src/core/file-naming.ts`:

```ts
/**
 * 新規ファイルの名前解決（コア・純関数）。
 * ファイル名は識別子ではない（rev 5章。判別は中身の type で行う）ため、
 * ここでの目的は「意味を持たせること」ではなく「既存と衝突しないこと」だけ。
 * 人間が後からエクスプローラで自由にリネームしてよい。
 */

/** Windows で使えない文字。macOS/Linux でも避けて構わないので一律で落とす */
const ILLEGAL = /[\\/:*?"<>|]/g

export function resolveNewFileName(baseName: string, existing: readonly string[]): string {
  const base = baseName.replace(ILLEGAL, '_')
  // Windows のファイル名は大文字小文字を区別しないので、比較も区別しない
  const taken = new Set(existing.map((n) => n.toLowerCase()))
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${base}.json` : `${base}-${n}.json`
    if (!taken.has(name.toLowerCase())) return name
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/core/file-naming.test.ts`
Expected: PASS（6件）

- [ ] **Step 5: レジストリに `createEmpty` と `list()` を足す**

Modify `src/core/registry.ts` — `ToolModule` の `migrate` の**直後**に次を追加する:

```ts
  /**
   * 新規作成（額縁のファイル操作。rev 6章）が使う空文書の雛形。
   * rev 6章のモジュール規約6点セットには無いスロットだが、額縁は type から
   * モジュールを引いて作るため、雛形を置ける場所はモジュール側しかない。
   * title は額縁が決めたファイル名（拡張子なし）を渡す——初期状態で
   * ファイル名と表示名を一致させ、単一性違反時にどちらの話か見分けられるようにする
   */
  createEmpty: (title: string) => TData
```

`ModuleRegistry` の `get` の直後に追加する:

```ts
  /** 登録順の全モジュール。新規作成の type 選択肢に使う */
  list(): AnyToolModule[]
```

`createRegistry()` の返り値の `get` の直後に追加する:

```ts
    list() {
      return [...byType.values()]
    },
```

- [ ] **Step 6: 用語集モジュールに `createEmpty` を実装する**

Modify `src/modules/glossary/module.ts` — `migrate: migrateGlossary,` の**直後**に追加する:

```ts
  // 用語集0個は正常な状態（新規プロジェクト）。空の terms で作り、
  // 用語は M3 の行追加または将来のインライン登録で増える（rev 5章）
  createEmpty: (title) => ({ schemaVersion: 1, type: 'glossary', title, terms: [] }),
```

- [ ] **Step 7: `list()` のテストを足す**

Modify `src/core/registry.test.ts` — ファイル末尾に追加する（既存の `describe` の中でなくファイル末尾でよい）:

```ts
describe('list', () => {
  it('登録順に全モジュールを返す', () => {
    const registry = createRegistry()
    const a = { ...baseModule, type: 'a', idPrefixes: ['a'] }
    const b = { ...baseModule, type: 'b', idPrefixes: ['b'] }
    registry.register(a)
    registry.register(b)
    expect(registry.list().map((m) => m.type)).toEqual(['a', 'b'])
  })
})
```

> 既存テストが `baseModule` 相当のダミーを別名で持っている場合は、その名前に読み替えること。ダミーモジュールに `createEmpty` が無いと型エラーになるので、ダミー定義に `createEmpty: () => ({})` を足す。

- [ ] **Step 8: `buildNewFile` の失敗するテストを書く**

Create `src/core/new-file.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { serialize } from './canonical'
import { buildNewFile } from './new-file'
import { createSchemaValidator } from './schema-validation'
import { glossaryModule } from '@/modules/glossary/module'

describe('buildNewFile', () => {
  it('衝突が無ければ displayName をそのままファイル名にする', () => {
    expect(buildNewFile(glossaryModule, []).name).toBe('用語集.json')
  })

  it('title は拡張子を除いたファイル名と一致する', () => {
    const file = buildNewFile(glossaryModule, ['用語集.json'])
    expect(file.name).toBe('用語集-2.json')
    expect((file.data as { title: string }).title).toBe('用語集-2')
  })

  it('作ったテキストはスキーマ検証を通る（＝作った直後に開ける）', () => {
    const file = buildNewFile(glossaryModule, [])
    const validate = createSchemaValidator(glossaryModule.schema)
    expect(validate(JSON.parse(file.text))).toEqual({ ok: true })
  })

  it('作ったテキストは正規形（読み直して書き直してもバイト一致）', () => {
    const file = buildNewFile(glossaryModule, [])
    expect(serialize(JSON.parse(file.text), glossaryModule.schema)).toBe(file.text)
  })

  it('キー順はスキーマの properties 記載順・インデント2・末尾改行あり', () => {
    expect(buildNewFile(glossaryModule, []).text).toBe(
      '{\n  "schemaVersion": 1,\n  "type": "glossary",\n  "title": "用語集",\n  "terms": []\n}\n',
    )
  })
})
```

> `createSchemaValidator` の成功時の戻り値が `{ ok: true }` 以外（例: `{ ok: true, errors: [] }`）なら、`src/core/schema-validation.ts` の実装に合わせて期待値を直すこと。

- [ ] **Step 9: テストを走らせて落ちることを確認する**

Run: `npm test -- src/core/new-file.test.ts`
Expected: FAIL（`Failed to resolve import "./new-file"`）

- [ ] **Step 10: `buildNewFile` を実装する**

Create `src/core/new-file.ts`:

```ts
import { serialize } from './canonical'
import { resolveNewFileName } from './file-naming'
import type { AnyToolModule } from './registry'

export interface NewFile {
  /** 拡張子込みのファイル名（プロジェクトフォルダ直下） */
  name: string
  /** 書き込むテキスト。必ず正規形（スコープ定義書3節） */
  text: string
  /** text と同じ内容のデータ。一覧へ即反映するために返す */
  data: unknown
}

/**
 * 新規ファイルの中身を組み立てる（コア・純関数。ファイルには触らない）。
 * 正規形での書き出しは新規作成にも例外なく適用する——非正規形で作ると、
 * 作った直後の最初の1文字の編集で全行 diff が出る
 */
export function buildNewFile(module: AnyToolModule, existingNames: readonly string[]): NewFile {
  const name = resolveNewFileName(module.displayName, existingNames)
  const title = name.replace(/\.json$/i, '')
  const data = module.createEmpty(title)
  return { name, text: serialize(data, module.schema), data }
}
```

- [ ] **Step 11: テスト・型・lint を通す**

Run: `npm test && npx tsc -b tsconfig.test.json && npm run lint`
Expected: すべて PASS、警告ゼロ

- [ ] **Step 12: Commit**

```bash
git add src/core/file-naming.ts src/core/file-naming.test.ts src/core/new-file.ts src/core/new-file.test.ts src/core/registry.ts src/core/registry.test.ts src/modules/glossary/module.ts
git commit -m "M4: 新規ファイルの雛形と名前解決を追加"
```

---

### Task 2: OS ゴミ箱への移動（Rust コマンドと fs 層）

rev 6章は「削除＝OSのゴミ箱へ移動。完全削除はしない」と定めているが、Tauri の fs プラグインには完全削除（`remove`）しか無く、ゴミ箱 API が存在しない。**スコープ定義書2節の「Tauri コマンドは1つも定義しておらず、追加もしない」は「ファイルアクセスは fs / dialog プラグインで足りる」を前提にした記述であり、その前提がここだけ成り立たない。** 例外として Rust コマンドを1本だけ足す（ユーザー確認済み）。

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/fs/project-fs.ts`
- Create: `src/fs/project-fs.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - Rust コマンド `move_to_trash(path: String) -> Result<(), String>`
  - `moveFileToTrash(path: string): Promise<void>`（`src/fs/project-fs.ts`）
  - `joinPath(dir: string, name: string): Promise<string>`（同上。コアが Tauri の `join` を直接呼ばないための薄い口）

---

- [ ] **Step 1: `trash` crate を依存に足す**

Modify `src-tauri/Cargo.toml` — `[dependencies]` の末尾に追加する:

```toml
# OS のゴミ箱への移動。Tauri の fs プラグインは完全削除しか持たないため、
# rev 6章「完全削除はしない」を満たすにはこのクレートが要る
trash = "5"
```

- [ ] **Step 2: Rust コマンドを追加する**

Modify `src-tauri/src/lib.rs` — ファイル先頭（`#[cfg_attr(...)]` の**前**）に追加する:

```rust
/// ファイルを OS のゴミ箱へ移す。
///
/// このアプリで唯一の自前コマンド。Tauri の fs プラグインにゴミ箱 API が無く、
/// `remove` は完全削除になるため、rev 6章「削除はOSのゴミ箱へ移動。完全削除は
/// しない」をプラグインだけでは満たせない。ロジックは TypeScript 側という
/// 原則（rev 7章）は維持し、ここには判断を一切置かない。
#[tauri::command]
fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}
```

同じファイルの `.plugin(tauri_plugin_fs::init())` の**直後**に追加する:

```rust
        .invoke_handler(tauri::generate_handler![move_to_trash])
```

- [ ] **Step 3: Rust がビルドできることを確認する**

Run: `npm run build; cargo check --manifest-path src-tauri/Cargo.toml`
Expected: `npm run build` が dist/ を生成し（`generate_context!` が参照する）、`cargo check` が `Finished` で終わる。警告が出たら消す。

> `cargo check` が「`../dist` が無い」で落ちる場合は `npm run build` が先に失敗している。その場合は先に型エラーを直す。

- [ ] **Step 4: fs 層の失敗するテストを書く**

Create `src/fs/project-fs.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
// project-fs が読む @tauri-apps/* は全部モックする。テストは node 環境で走り、
// 実物は Tauri の webview を前提にしているため
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }))
vi.mock('@tauri-apps/api/path', () => ({ join: async (...parts: string[]) => parts.join('\\') }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))
vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}))

// モックの登録後に読む必要があるので動的 import にする
const { moveFileToTrash } = await import('./project-fs')

beforeEach(() => {
  invoke.mockReset()
  invoke.mockResolvedValue(undefined)
})

describe('moveFileToTrash', () => {
  it('自前コマンド move_to_trash に path を渡す', async () => {
    await moveFileToTrash('C:\\proj\\用語集.json')
    expect(invoke).toHaveBeenCalledWith('move_to_trash', { path: 'C:\\proj\\用語集.json' })
  })

  it('コマンドが失敗したら例外がそのまま伝わる（呼び出し側が UI に出す）', async () => {
    invoke.mockRejectedValue(new Error('アクセスが拒否されました'))
    await expect(moveFileToTrash('C:\\proj\\用語集.json')).rejects.toThrow('アクセスが拒否されました')
  })
})
```

- [ ] **Step 5: テストを走らせて落ちることを確認する**

Run: `npm test -- src/fs/project-fs.test.ts`
Expected: FAIL（`moveFileToTrash is not a function` または import エラー）

- [ ] **Step 6: fs 層を実装する**

Modify `src/fs/project-fs.ts` — import 群の先頭に追加する:

```ts
import { invoke } from '@tauri-apps/api/core'
```

ファイル末尾に追加する:

```ts
/** コアが Tauri の path API を直接触らないための薄い口 */
export async function joinPath(dir: string, name: string): Promise<string> {
  return join(dir, name)
}

/**
 * ファイルを OS のゴミ箱へ移す（完全削除はしない。rev 6章）。
 * fs プラグインにゴミ箱 API が無いため、ここだけ自前の Tauri コマンドを呼ぶ。
 * 自前コマンドは ACL の対象外なので capabilities への追記は要らない
 */
export async function moveFileToTrash(path: string): Promise<void> {
  await invoke('move_to_trash', { path })
}
```

- [ ] **Step 7: テスト・型・lint を通す**

Run: `npm test && npx tsc -b tsconfig.test.json && npm run lint`
Expected: すべて PASS、警告ゼロ

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src/fs/project-fs.ts src/fs/project-fs.test.ts
git commit -m "M4: OS ゴミ箱への移動コマンドを追加"
```

---

### Task 3: ファイル操作のコアロジック

新規作成・削除・用語集の自動生成の「手順」をコアに置く。**削除で `flush()` を呼ばないこと**が最重要の不変条件——自動保存を flush してからゴミ箱へ移すと、順序次第で消したはずのファイルが書き戻って復活する。テストでこれを固定する。

**Files:**
- Create: `src/core/file-ops.ts`
- Create: `src/core/file-ops.test.ts`

**Interfaces:**
- Consumes: `buildNewFile(module, existingNames)` / `NewFile`（Task 1）、`AnyToolModule`（`src/core/registry.ts`）
- Produces:
  - `interface CreatedFile extends NewFile { path: string }`
  - `createFile(opts): Promise<CreatedFile>`
  - `trashFile(opts): Promise<void>`
  - `ensureFileOfType(opts): Promise<{ path: string; created: CreatedFile | null }>`

---

- [ ] **Step 1: 失敗するテストを書く**

Create `src/core/file-ops.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createFile, ensureFileOfType, trashFile } from './file-ops'
import { glossaryModule } from '@/modules/glossary/module'

const join = async (dir: string, name: string) => `${dir}\\${name}`

describe('createFile', () => {
  it('正規形のテキストを衝突しないパスへ書く', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const created = await createFile({
      dir: 'C:\\proj',
      module: glossaryModule,
      existingNames: ['用語集.json'],
      join,
      write,
    })
    expect(created.path).toBe('C:\\proj\\用語集-2.json')
    expect(created.name).toBe('用語集-2.json')
    expect(write).toHaveBeenCalledWith('C:\\proj\\用語集-2.json', created.text)
    expect(created.text.endsWith('\n')).toBe(true)
  })

  it('書き込みが失敗したら例外を投げる（呼び出し側が一覧に足さないため）', async () => {
    const write = vi.fn().mockRejectedValue(new Error('書けません'))
    await expect(
      createFile({ dir: 'C:\\proj', module: glossaryModule, existingNames: [], join, write }),
    ).rejects.toThrow('書けません')
  })
})

describe('trashFile', () => {
  it('自動保存を破棄してからゴミ箱へ移す（flush は絶対に呼ばない）', async () => {
    const order: string[] = []
    const saver = {
      flush: vi.fn(async () => {
        order.push('flush')
        return true
      }),
      dispose: vi.fn(() => order.push('dispose')),
    }
    const trash = vi.fn(async () => {
      order.push('trash')
    })
    await trashFile({ path: 'C:\\proj\\用語集.json', saver, trash })
    // flush すると、消したファイルを自動保存が書き戻して復活させる
    expect(saver.flush).not.toHaveBeenCalled()
    // dispose が先。後だと、ゴミ箱へ移した直後にデバウンスタイマーが発火しうる
    expect(order).toEqual(['dispose', 'trash'])
  })

  it('開いていないファイルなら saver は null でよい', async () => {
    const trash = vi.fn().mockResolvedValue(undefined)
    await trashFile({ path: 'C:\\proj\\メモ.json', saver: null, trash })
    expect(trash).toHaveBeenCalledWith('C:\\proj\\メモ.json')
  })

  it('ゴミ箱への移動が失敗したら例外を投げる', async () => {
    const trash = vi.fn().mockRejectedValue(new Error('ロックされています'))
    await expect(trashFile({ path: 'C:\\proj\\a.json', saver: null, trash })).rejects.toThrow(
      'ロックされています',
    )
  })
})

describe('ensureFileOfType', () => {
  const files = [
    { path: 'C:\\proj\\メモ.json', name: 'メモ.json', type: null },
    { path: 'C:\\proj\\語彙.json', name: '語彙.json', type: 'glossary' },
  ]

  it('既にあれば作らずそのパスを返す（ファイル名では探さない）', async () => {
    const write = vi.fn()
    const result = await ensureFileOfType({ dir: 'C:\\proj', module: glossaryModule, files, join, write })
    expect(result).toEqual({ path: 'C:\\proj\\語彙.json', created: null })
    expect(write).not.toHaveBeenCalled()
  })

  it('無ければ作る（用語集0個は正常な状態。初回登録時に自動生成する）', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const result = await ensureFileOfType({
      dir: 'C:\\proj',
      module: glossaryModule,
      files: [files[0]],
      join,
      write,
    })
    expect(result.path).toBe('C:\\proj\\用語集.json')
    expect(result.created?.name).toBe('用語集.json')
    expect(write).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: テストを走らせて落ちることを確認する**

Run: `npm test -- src/core/file-ops.test.ts`
Expected: FAIL（`Failed to resolve import "./file-ops"`）

- [ ] **Step 3: `src/core/file-ops.ts` を実装する**

Create `src/core/file-ops.ts`:

```ts
import { buildNewFile, type NewFile } from './new-file'
import type { AnyToolModule } from './registry'

/** ファイル入出力の注入口。コアは Tauri を知らない（実体は src/fs/project-fs.ts） */
export interface FileIo {
  join: (dir: string, name: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
}

export interface CreatedFile extends NewFile {
  /** 書き込んだ絶対パス */
  path: string
}

/**
 * 新規ファイルを作る（額縁の新規作成。rev 6章）。
 * 失敗は投げる——呼び出し側が「一覧に足す」前に止まる必要があるため
 *（書けていないファイルを一覧に出すと、選んだ瞬間に読み込み失敗になる）
 */
export async function createFile(
  opts: FileIo & {
    dir: string
    module: AnyToolModule
    /** フォルダ直下の既存ファイル名。衝突回避にだけ使う */
    existingNames: readonly string[]
  },
): Promise<CreatedFile> {
  const file = buildNewFile(opts.module, opts.existingNames)
  const path = await opts.join(opts.dir, file.name)
  await opts.write(path, file.text)
  return { ...file, path }
}

/**
 * ファイルを OS のゴミ箱へ移す。
 *
 * 開いているファイルなら、自動保存を **flush せずに** dispose する。
 * flush すると、消したはずのファイルを書き戻して復活させる。順序も逆にしない
 * ——先にゴミ箱へ移すと、その直後にデバウンスタイマーが発火して同じことが起きる。
 *
 * この結果、ゴミ箱への移動が失敗した場合はデバウンス窓（500ms）内の編集が失われる。
 * 「このファイルを消す」という明示的な操作の副作用としては許容する
 */
export async function trashFile(opts: {
  path: string
  /** 対象が現在開いているファイルのときだけ渡す */
  saver: { dispose(): void } | null
  trash: (path: string) => Promise<void>
}): Promise<void> {
  opts.saver?.dispose()
  await opts.trash(opts.path)
}

/** ensureFileOfType が見る、走査済み一覧の最小形 */
export interface ScannedFile {
  path: string
  name: string
  /** classifyFile が読み取った type（読めなかったファイルは null） */
  type: string | null
}

/**
 * singleton モジュール（用語集）のファイルを1つ確保する。
 *
 * 用語集0個は正常な状態（新規プロジェクト）で、初めて用語登録が発生した時点で
 * アプリが自動生成する（rev 5章）。将来のインライン登録コンポーネントも
 * この関数を呼ぶ——生成の条件と正規形をそちらで書き直さないため。
 *
 * 探索は必ず type で行い、ファイル名では探さない（rev 5章。人間が
 * リネームしても壊れないこと）。2つ以上あるのは単一性違反で、
 * その検出と表示は checkProjectConsistency の担当なのでここでは作らない
 */
export async function ensureFileOfType(
  opts: FileIo & {
    dir: string
    module: AnyToolModule
    files: readonly ScannedFile[]
  },
): Promise<{ path: string; created: CreatedFile | null }> {
  const existing = opts.files.find((f) => f.type === opts.module.type)
  if (existing) return { path: existing.path, created: null }
  const created = await createFile({
    dir: opts.dir,
    module: opts.module,
    existingNames: opts.files.map((f) => f.name),
    join: opts.join,
    write: opts.write,
  })
  return { path: created.path, created }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/core/file-ops.test.ts`
Expected: PASS（7件）

- [ ] **Step 5: 型・lint を通す**

Run: `npx tsc -b tsconfig.test.json && npm run lint`
Expected: エラー・警告ゼロ

- [ ] **Step 6: Commit**

```bash
git add src/core/file-ops.ts src/core/file-ops.test.ts
git commit -m "M4: ファイル作成・ゴミ箱移動・用語集自動生成のコアロジックを追加"
```

---

### Task 4: 確認ダイアログ部品

削除確認と、Task 8 の「破棄して閉じる」で使う共通のモーダル。**開いている間は `KeyContext.modalOpen` を true にする**という規約とセットで意味を持つ（配線は Task 6）。

**Files:**
- Create: `src/components/ui/alert-dialog.tsx`（shadcn の生成物。手で書かない）
- Create: `src/components/ConfirmDialog.tsx`
- Create: `src/components/ConfirmDialog.dom.test.tsx`

**Interfaces:**
- Consumes: shadcn の `AlertDialog` 一式
- Produces: `ConfirmDialog(props: ConfirmDialogProps)` — `props` は `{ open, title, description, confirmLabel, cancelLabel?, onConfirm, onCancel }`

---

- [ ] **Step 1: shadcn の alert-dialog を追加する**

Run: `npx shadcn@latest add alert-dialog`
Expected: `src/components/ui/alert-dialog.tsx` が生成される。`components.json` は `-b radix` 初期化済みなので `import { AlertDialog as AlertDialogPrimitive } from "radix-ui"` の形になる（既存の `button.tsx` と同じ）。生成物は lint 対象外なので手で整形しない。

- [ ] **Step 2: 失敗するテストを書く**

Create `src/components/ConfirmDialog.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConfirmDialog } from './ConfirmDialog'

afterEach(cleanup)

function setup(open = true) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDialog
      open={open}
      title="ファイルを削除しますか？"
      description="用語集.json を OS のゴミ箱へ移動します。"
      confirmLabel="ゴミ箱へ移動"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmDialog', () => {
  it('open が false のときは何も出さない', () => {
    setup(false)
    expect(screen.queryByText('ファイルを削除しますか？')).toBeNull()
  })

  it('見出しと説明を出す', () => {
    setup()
    expect(screen.getByText('ファイルを削除しますか？')).not.toBeNull()
    expect(screen.getByText('用語集.json を OS のゴミ箱へ移動します。')).not.toBeNull()
  })

  it('確認ボタンで onConfirm を呼ぶ', () => {
    const { onConfirm, onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'ゴミ箱へ移動' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('既定のキャンセルラベルは「キャンセル」で、押すと onCancel を呼ぶ', () => {
    const { onConfirm, onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('Esc でも onCancel を呼ぶ（モーダル中の Esc はダイアログが取る。rev 10章）', () => {
    const { onCancel } = setup()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: テストを走らせて落ちることを確認する**

Run: `npm test -- src/components/ConfirmDialog.dom.test.tsx`
Expected: FAIL（`Failed to resolve import "./ConfirmDialog"`）

- [ ] **Step 4: `ConfirmDialog` を実装する**

Create `src/components/ConfirmDialog.tsx`:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  /** 既定は「キャンセル」 */
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 確認ダイアログ（額縁のファイル操作用）。
 *
 * **開いている間は呼び出し側が KeyContext.modalOpen を true にすること。**
 * 操作言語を止めないと、Esc をダイアログとエディタで取り合う（rev 10章の
 * 境界規則。M3 で resolveCommand に配線点を作ってある）。
 *
 * 用語の削除に確認は挟まない（rev 5章。会議中の入力速度を削ぐため）。
 * 確認するのは「ファイルの削除」など、Undo で取り消せない操作だけ。
 * 見た目は shadcn の既定トークンのままで、役割トークンへの寄せは M7
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(next) => {
        // Esc・オーバーレイクリックはどちらも「閉じる」に落ちてくる
        if (!next) props.onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={props.onCancel}>
            {props.cancelLabel ?? 'キャンセル'}
          </AlertDialogCancel>
          <AlertDialogAction onClick={props.onConfirm}>{props.confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm test -- src/components/ConfirmDialog.dom.test.tsx`
Expected: PASS（5件）

> `AlertDialogCancel` / `AlertDialogAction` はクリックでダイアログを閉じ、`onOpenChange(false)` も発火する。「キャンセル」で `onCancel` が2回呼ばれる場合は `toHaveBeenCalledTimes(1)` を `toHaveBeenCalled()` に緩めるのではなく、`AlertDialogCancel` から `onClick` を外して `onOpenChange` 側に一本化すること（経路を1つにする）。

- [ ] **Step 6: 型・lint・全テストを通す**

Run: `npm test && npx tsc -b tsconfig.test.json && npm run lint`
Expected: すべて PASS、警告ゼロ

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/alert-dialog.tsx src/components/ConfirmDialog.tsx src/components/ConfirmDialog.dom.test.tsx package.json package-lock.json
git commit -m "M4: 確認ダイアログ部品を追加"
```

---

### Task 5: ファイル一覧の切り出しと新規作成の配線

`App.tsx` は 372 行あり、M4 で 140 行ほど増える。一覧の描画を `FileList` に出して、`App.tsx` は状態の配線に専念させる。あわせて新規作成ボタンを付ける。

**Files:**
- Create: `src/core/project-file.ts`
- Create: `src/core/project-file.test.ts`
- Create: `src/components/FileList.tsx`
- Create: `src/components/FileList.dom.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `createFile`（Task 3）、`joinPath` / `writeProjectFile`（Task 2 / 既存）、`ModuleRegistry.list()`（Task 1）
- Produces:
  - `interface ProjectFile { path: string; name: string; result: LoadResult; issues: ConsistencyIssue[] }`（`src/core/project-file.ts`）
  - `fileName(path: string): string`
  - `computeIssues(files: ProjectFile[], registry: ModuleRegistry): ProjectFile[]`
  - `FileList` コンポーネント（props は Step 5 参照）

---

- [ ] **Step 1: `ProjectFile` を core へ移すテストを書く**

Create `src/core/project-file.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeIssues, fileName, type ProjectFile } from './project-file'
import { appRegistry } from '@/modules'

function editable(path: string): ProjectFile {
  return {
    path,
    name: fileName(path),
    result: {
      status: 'editable',
      type: 'glossary',
      title: '用語集',
      data: { schemaVersion: 1, type: 'glossary', title: '用語集', terms: [] },
    },
    issues: [],
  }
}

describe('fileName', () => {
  it('Windows の区切りでも POSIX の区切りでも末尾を返す', () => {
    expect(fileName('C:\\proj\\用語集.json')).toBe('用語集.json')
    expect(fileName('/home/p/用語集.json')).toBe('用語集.json')
  })
})

describe('computeIssues', () => {
  it('問題が無ければ issues は空', () => {
    const out = computeIssues([editable('C:\\proj\\用語集.json')], appRegistry)
    expect(out[0].issues).toEqual([])
  })

  it('用語集が2つあるとコア横断検証の単一性違反が両方に付く', () => {
    const out = computeIssues(
      [editable('C:\\proj\\a.json'), editable('C:\\proj\\b.json')],
      appRegistry,
    )
    expect(out.map((f) => f.issues.map((i) => i.rule))).toEqual([
      ['singleton-violation'],
      ['singleton-violation'],
    ])
  })

  it('モジュール内検証とコア横断検証の両方を連結する', () => {
    const dup: ProjectFile = {
      path: 'C:\\proj\\a.json',
      name: 'a.json',
      result: {
        status: 'editable',
        type: 'glossary',
        title: '用語集',
        data: {
          schemaVersion: 1,
          type: 'glossary',
          title: '用語集',
          terms: [
            { id: 'term_AAAAAAAAAA', name: '受注', kind: 'other', definition: 'x', aliases: [], notes: '' },
            { id: 'term_AAAAAAAAAA', name: '出荷', kind: 'other', definition: 'y', aliases: [], notes: '' },
          ],
        },
      },
      issues: [],
    }
    const out = computeIssues([dup, editable('C:\\proj\\b.json')], appRegistry)
    const rules = out[0].issues.map((i) => i.rule)
    // ID 重複（モジュール内検証）と単一性違反（コア横断検証）が両方載る
    expect(rules).toContain('singleton-violation')
    expect(rules.length).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: テストを走らせて落ちることを確認する**

Run: `npm test -- src/core/project-file.test.ts`
Expected: FAIL（`Failed to resolve import "./project-file"`）

- [ ] **Step 3: `src/core/project-file.ts` を実装する（App.tsx からの移設）**

Create `src/core/project-file.ts`:

```ts
import type { ConsistencyIssue } from './consistency'
import type { LoadResult } from './load'
import { checkProjectConsistency } from './project-consistency'
import type { ModuleRegistry } from './registry'

/** 走査済みプロジェクトファイル1件。額縁の一覧・エディタの赤表示が共有する */
export interface ProjectFile {
  path: string
  name: string
  result: LoadResult
  /** モジュール内検証＋コア横断検証の結果（レベル2）。一覧バッジとエディタ赤表示に使う */
  issues: ConsistencyIssue[]
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/**
 * 全ファイルの整合性検証（レベル2）をやり直す。
 * 現在の呼び出し経路は「フォルダ走査時」「編集時」「ファイル作成・削除時」。
 * M5 の外部変更の取り込みも必ずここを通すこと
 */
export function computeIssues(files: ProjectFile[], registry: ModuleRegistry): ProjectFile[] {
  const cross = checkProjectConsistency(
    files.map((f) => ({ path: f.path, type: f.result.type })),
    registry,
  )
  return files.map((f) => {
    const local =
      f.result.status === 'editable'
        ? (registry.get(f.result.type)?.checkConsistency(f.result.data) ?? [])
        : []
    return { ...f, issues: [...local, ...(cross.get(f.path) ?? [])] }
  })
}
```

Modify `src/App.tsx` — `interface ProjectFile`（32〜38行）・`function fileName`（40〜42行）・`function computeIssues`（44〜57行）を**削除**し、import に追加する:

```ts
import { computeIssues, fileName, type ProjectFile } from '@/core/project-file'
```

使わなくなる import を外す: `import type { ConsistencyIssue } from '@/core/consistency'` と `import { checkProjectConsistency } from '@/core/project-consistency'` の2本（`AnyToolModule` は `applyEdit` の引数型で使い続けるので残す）。`computeIssues(...)` の呼び出し3箇所（`applyEdit` 内・`openFolder` 内・`selectFile` 内）すべてに第2引数 `appRegistry` を足す。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/core/project-file.test.ts && npx tsc -b tsconfig.test.json`
Expected: PASS（5件）、型エラーなし

- [ ] **Step 5: `FileList` の失敗するテストを書く**

Create `src/components/FileList.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ProjectFile } from '@/core/project-file'
import { appRegistry } from '@/modules'
import { FileList } from './FileList'

afterEach(cleanup)

function file(name: string, over: Partial<ProjectFile> = {}): ProjectFile {
  return {
    path: `C:\\proj\\${name}`,
    name,
    result: { status: 'editable', type: 'glossary', title: '用語集', data: {} },
    issues: [],
    ...over,
  }
}

function setup(files: ProjectFile[], projectOpen = true) {
  const handlers = { onSelect: vi.fn(), onCreate: vi.fn() }
  render(
    <FileList
      files={files}
      selectedPath={null}
      modules={appRegistry.list()}
      projectOpen={projectOpen}
      {...handlers}
    />,
  )
  return handlers
}

describe('FileList', () => {
  it('フォルダ未選択なら案内文だけを出す', () => {
    setup([], false)
    expect(screen.getByText(/プロジェクトフォルダを開くと/)).not.toBeNull()
    // ボタンのラベルは「＋ 用語集を新規作成」なので部分一致で引く
    expect(screen.queryByRole('button', { name: /用語集を新規作成/ })).toBeNull()
  })

  it('登録モジュールごとに新規作成ボタンを出す（type 選択。rev 6章）', () => {
    const { onCreate } = setup([])
    fireEvent.click(screen.getByRole('button', { name: /用語集を新規作成/ }))
    expect(onCreate).toHaveBeenCalledWith(appRegistry.get('glossary'))
  })

  it('ファイルが0件なら空状態を出す（ボタンは出したまま）', () => {
    setup([])
    expect(screen.getByText(/JSON ファイルがありません/)).not.toBeNull()
    expect(screen.getByRole('button', { name: /用語集を新規作成/ })).not.toBeNull()
  })

  it('行のクリックで onSelect を呼ぶ', () => {
    const { onSelect } = setup([file('用語集.json')])
    fireEvent.click(screen.getByRole('button', { name: /用語集\.json を開く/ }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: '用語集.json' }))
  })

  it('開けないファイル・編集不可のファイルも一覧に出す', () => {
    setup([
      file('壊れた.json', {
        result: { status: 'rejected', type: null, title: null, reason: 'JSON として解釈できません', errors: [] },
      }),
      file('新版.json', {
        result: { status: 'listOnly', type: 'glossary', title: null, reason: '編集できない schemaVersion' },
      }),
    ])
    expect(screen.getByText('開けない')).not.toBeNull()
    expect(screen.getByText('編集不可')).not.toBeNull()
  })

  it('issues があれば件数バッジを出す', () => {
    setup([
      file('用語集.json', {
        issues: [{ rule: 'singleton-violation', message: '用語集が2件あります', locations: [] }],
      }),
    ])
    expect(screen.getByText('1')).not.toBeNull()
  })
})
```

- [ ] **Step 6: テストを走らせて落ちることを確認する**

Run: `npm test -- src/components/FileList.dom.test.tsx`
Expected: FAIL（`Failed to resolve import "./FileList"`）

- [ ] **Step 7: `FileList` を実装する**

Create `src/components/FileList.tsx`:

```tsx
import type { ProjectFile } from '@/core/project-file'
import type { AnyToolModule } from '@/core/registry'

export interface FileListProps {
  files: ProjectFile[]
  selectedPath: string | null
  /** 新規作成の選択肢。レジストリの登録順（rev 6章。ツールは増える前提） */
  modules: AnyToolModule[]
  /** プロジェクトフォルダを開いているか。未選択なら操作を一切出さない */
  projectOpen: boolean
  onSelect: (file: ProjectFile) => void
  onCreate: (module: AnyToolModule) => void
}

/**
 * ファイル一覧の額縁（rev 6章）。新規作成・赤バッジを持つ（削除は Task 6）。
 * 表示だけを担い、状態も I/O も持たない（配線は App）
 */
export function FileList(props: FileListProps) {
  if (!props.projectOpen) {
    return (
      <p className="p-4 text-sm text-ink-muted">
        プロジェクトフォルダを開くと JSON ファイルの一覧が出ます。
      </p>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-rule p-2">
        {props.modules.map((module) => (
          <button
            key={module.type}
            type="button"
            className="rounded-sm border border-rule px-2 py-1 text-xs text-ink hover:bg-surface"
            onClick={() => props.onCreate(module)}
          >
            ＋ {module.displayName}を新規作成
          </button>
        ))}
      </div>
      {props.files.length === 0 ? (
        <p className="p-4 text-sm text-ink-muted">
          このフォルダに JSON ファイルがありません。上のボタンで作成できます。
        </p>
      ) : (
        <ul>
          {props.files.map((file) => (
            <li key={file.path} className="flex items-start">
              <button
                type="button"
                aria-label={`${file.name} を開く`}
                className={`min-w-0 flex-1 px-4 py-2 text-left text-sm hover:bg-surface ${
                  file.path === props.selectedPath ? 'bg-surface' : ''
                }`}
                onClick={() => props.onSelect(file)}
              >
                <span className="block truncate text-ink">{file.name}</span>
                <span className="block text-xs text-ink-muted">
                  {file.result.status === 'editable' && file.result.title}
                  {file.result.status === 'rejected' && <span className="text-warning">開けない</span>}
                  {file.result.status === 'listOnly' && '編集不可'}
                  {file.issues.length > 0 && (
                    <span className="ml-1 rounded-sm bg-warning px-1 text-xs text-warning-fg">
                      {file.issues.length}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 8: テストが通ることを確認する**

Run: `npm test -- src/components/FileList.dom.test.tsx`
Expected: PASS（6件）

- [ ] **Step 9: App から一覧を差し替え、新規作成を配線する**

Modify `src/App.tsx` — import に追加する:

```ts
import { FileList } from '@/components/FileList'
import { createFile } from '@/core/file-ops'
```

既存の `import { listJsonFiles, pickProjectFolder, readProjectFile, writeProjectFile } from '@/fs/project-fs'` に `joinPath` を足す（`moveFileToTrash` は Task 6 で足す。ここで入れると未使用 import で lint 警告が出る）。

`selectFile` の**直後**に追加する:

```ts
  /** 新規作成（額縁のファイル操作。rev 6章）。作ったファイルはそのまま開く */
  const createNewFile = async (module: AnyToolModule) => {
    if (projectDir === null) return
    try {
      const created = await createFile({
        dir: projectDir,
        module,
        existingNames: files.map((f) => f.name),
        join: joinPath,
        write: writeProjectFile,
      })
      // 書いたテキストをそのまま分類する。ここが editable にならないなら
      // 雛形かシリアライザが壊れているので、一覧に出す前に気付ける
      const entry: ProjectFile = {
        path: created.path,
        name: created.name,
        result: classifyFile(created.text, appRegistry),
        issues: [],
      }
      setFiles((prev) => computeIssues([...prev, entry], appRegistry))
      setIoError(null)
      await selectFile(entry)
    } catch (err) {
      setIoError(
        `ファイルを作成できませんでした: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
```

`<aside>` の中身（288〜320行の `files.length === 0 ? ... : <ul>...</ul>` 全体）を次に差し替える:

```tsx
          <FileList
            files={files}
            selectedPath={selectedPath}
            modules={appRegistry.list()}
            projectOpen={projectDir !== null}
            onSelect={(file) => void selectFile(file)}
            onCreate={(module) => void createNewFile(module)}
          />
```

- [ ] **Step 10: テスト・型・lint・ビルドを通す**

Run: `npm test && npx tsc -b tsconfig.test.json && npm run lint && npm run build`
Expected: すべて PASS、警告ゼロ

- [ ] **Step 11: 実機で新規作成を確認する**

Run: `npm run tauri dev`（先に `Get-NetTCPConnection -LocalPort 5173` で他プロセスが掴んでいないことを確認する）

確認手順:
1. 空のフォルダを作って「フォルダを開く」で開く → 「＋ 用語集を新規作成」ボタンが出る
2. 押す → `用語集.json` が作られて開き、「用語を追加」ボタンが出る
3. エクスプローラで中身を見る → `schemaVersion` / `type` / `title` / `terms` の順、インデント2、末尾改行あり
4. もう一度押す → `用語集-2.json` ができ、両方の行に単一性違反の赤バッジ「1」が付く
5. `git init` 済みのフォルダで、作った直後に用語を1件足して `git diff` → 追加行だけの diff になる（全行 diff にならない）

- [ ] **Step 12: Commit**

```bash
git add src/core/project-file.ts src/core/project-file.test.ts src/components/FileList.tsx src/components/FileList.dom.test.tsx src/App.tsx
git commit -m "M4: ファイル一覧を FileList に切り出し、新規作成を配線"
```

---

### Task 6: 削除の配線（確認ダイアログとモーダル中の操作言語停止）

M3 の申し送りが指定した配線点——`GLOBAL_KEY_CONTEXT`（`src/App.tsx`）とエディタの `onCellKeyDown`（`src/modules/glossary/GlossaryEditor.tsx`）の2箇所——に `modalOpen` を通す。**開いているファイルを消すときに `flush()` を呼ばないこと**が最重要（Task 3 の `trashFile` が守るが、App 側で `closeCurrentFile()` を呼ばないことも必要）。

**Files:**
- Modify: `src/core/registry.ts`（`EditorProps` に `modalOpen` を追加）
- Modify: `src/components/FileList.tsx`（削除ボタンを追加）
- Modify: `src/components/FileList.dom.test.tsx`
- Modify: `src/modules/glossary/GlossaryEditor.tsx`
- Modify: `src/modules/glossary/GlossaryEditor.dom.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `trashFile`（Task 3）、`moveFileToTrash`（Task 2）、`ConfirmDialog`（Task 4）、`FileList`（Task 5）
- Produces: `EditorProps<TData>.modalOpen: boolean`、`FileListProps.onDelete: (file: ProjectFile) => void`

---

- [ ] **Step 1: エディタが `modalOpen` を尊重する失敗するテストを書く**

Modify `src/modules/glossary/GlossaryEditor.dom.test.tsx` — `Harness` に `modalOpen` を渡せるようにする。`Harness` の props に `modalOpen?: boolean` を足し、`<GlossaryEditor ... modalOpen={props.modalOpen ?? false} />` にする。`renderEditor` にも第2引数 `modalOpen = false` を足して `Harness` へ渡す。

ファイル末尾に追加する:

```tsx
describe('モーダル表示中', () => {
  it('Enter で行が増えない（キーはモーダル側が取る。rev 10章の境界規則）', () => {
    const { latest } = renderEditor(glossary([term({ id: 'term_AAAAAAAAAA', name: '受注' })]), true)
    const cell = screen.getByRole('textbox', { name: '名称（1行目）' })
    fireEvent.keyDown(cell, { key: 'Enter' })
    expect(latest()).toBeUndefined()
  })

  it('空欄 Backspace でも行が消えない', () => {
    const { latest } = renderEditor(glossary([term({ id: 'term_AAAAAAAAAA', name: '受注' })]), true)
    const cell = screen.getByRole('textbox', { name: '名称（1行目）' }) as HTMLInputElement
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(latest()?.terms.length ?? 1).toBe(1)
  })
})
```

> `renderEditor` の戻り値に `latest` が無い場合は、既存テストが使っている取り出し方（`onChange.mock.calls.at(-1)?.[0]` 相当）に読み替えること。

- [ ] **Step 2: テストを走らせて落ちることを確認する**

Run: `npm test -- src/modules/glossary/GlossaryEditor.dom.test.tsx`
Expected: FAIL（型エラー、または Enter で行が増えてしまう）

- [ ] **Step 3: `EditorProps` に `modalOpen` を追加する**

Modify `src/core/registry.ts` — `EditorProps` の `issues` の**直後**に追加する:

```ts
  /**
   * モーダル（確認ダイアログ等）が開いているか。true の間は操作言語を止める
   *（Esc をモーダルとエディタで取り合わないため。rev 10章の境界規則）。
   * 各エディタはこれを KeyContext.modalOpen へそのまま渡すだけでよい
   */
  modalOpen: boolean
```

- [ ] **Step 4: エディタで `modalOpen` を使う**

Modify `src/modules/glossary/GlossaryEditor.tsx`:

関数シグネチャを変える:

```tsx
export function GlossaryEditor({ data, onChange, issues, modalOpen }: EditorProps<GlossarySchemaVersion1>) {
```

`onCellKeyDown` 内の `modalOpen: false,` とその上のコメント2行を次に置き換える:

```tsx
      modalOpen,
```

`AliasCell` にも渡す必要があるか確認する: `AliasCell` が内部で `resolveCommand` を呼んでいるなら、`modalOpen` を prop で渡して同じく `KeyContext.modalOpen` に流す（`src/modules/glossary/AliasCell.tsx`）。呼んでいなければ何もしない。

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm test -- src/modules/glossary/GlossaryEditor.dom.test.tsx`
Expected: PASS

- [ ] **Step 5b: FileList に削除ボタンを足す（先に失敗するテスト）**

Modify `src/components/FileList.dom.test.tsx` — `setup` の `handlers` に `onDelete: vi.fn()` を足す（`{ onSelect: vi.fn(), onCreate: vi.fn(), onDelete: vi.fn() }`）。ファイル末尾に追加する:

```tsx
describe('削除', () => {
  it('行ごとの削除ボタンで onDelete を呼ぶ', () => {
    const { onDelete } = setup([file('用語集.json')])
    fireEvent.click(screen.getByRole('button', { name: '用語集.json を削除' }))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ name: '用語集.json' }))
  })

  it('開けないファイルにも削除ボタンを出す', () => {
    setup([
      file('壊れた.json', {
        result: { status: 'rejected', type: null, title: null, reason: 'JSON として解釈できません', errors: [] },
      }),
    ])
    expect(screen.getByRole('button', { name: '壊れた.json を削除' })).not.toBeNull()
  })
})
```

Run: `npm test -- src/components/FileList.dom.test.tsx`
Expected: FAIL（削除ボタンが見つからない）

Modify `src/components/FileList.tsx` — `FileListProps` の `onCreate` の直後に追加する:

```ts
  onDelete: (file: ProjectFile) => void
```

行の `</button>` と `</li>` の間に追加する:

```tsx
              {/* 開けない・編集不可のファイルにも削除を出す——単一性違反の解消には
                  「壊れている方の用語集を消す」が必要で、そこを塞ぐと外部エディタを
                  強いることになる（rev 5章「拒否は最小限に」のファイル操作への適用） */}
              <button
                type="button"
                aria-label={`${file.name} を削除`}
                className="shrink-0 px-2 py-2 text-xs text-ink-muted hover:bg-surface hover:text-warning"
                onClick={() => props.onDelete(file)}
              >
                削除
              </button>
```

コンポーネント冒頭の doc コメントの「（削除は Task 6）」を消す。

Run: `npm test -- src/components/FileList.dom.test.tsx`
Expected: PASS

- [ ] **Step 6: App に確認ダイアログの状態と削除を配線する**

Modify `src/App.tsx`:

import に追加する:

```ts
import { ConfirmDialog } from '@/components/ConfirmDialog'
```

既存の `import { createFile } from '@/core/file-ops'` を `import { createFile, trashFile } from '@/core/file-ops'` にする。既存の `import { joinPath, listJsonFiles, ... } from '@/fs/project-fs'` に `moveFileToTrash` を足す。

`GLOBAL_KEY_CONTEXT`（64〜74行の定数）を関数に置き換える:

```ts
/**
 * 額縁が取るグローバル層のキー文脈（rev 10章）。Undo/Redo だけを扱うため
 * 構造依存層の文脈は固定値でよい。modalOpen は確認ダイアログが開いている間 true
 *（M5 の二択ダイアログもここへ合流させる）
 */
function globalKeyContext(modalOpen: boolean): KeyContext {
  return {
    platform: currentPlatform(),
    modalOpen,
    editing: false,
    fieldEmpty: false,
    deletableField: false,
    caretAtStart: false,
    caretAtEnd: false,
    arrowsOwnedByField: false,
    reorderEnabled: false,
  }
}
```

`const selectSeq = useRef(0)` の直後に追加する:

```ts
  // 確認ダイアログ。開いている間は操作言語を止める（rev 10章の境界規則）
  const [confirm, setConfirm] = useState<{
    title: string
    description: string
    confirmLabel: string
    onConfirm: () => void | Promise<void>
  } | null>(null)
  const modalOpen = confirm !== null
  // window リスナーはマウント時の1回しか張らないので、最新値は ref から読む
  const modalOpenRef = useRef(modalOpen)
  modalOpenRef.current = modalOpen
```

グローバル層の `useEffect`（251〜260行）内の `GLOBAL_KEY_CONTEXT` を差し替える:

```ts
      const cmd = resolveCommand(toKeyEventLike(e), globalKeyContext(modalOpenRef.current))
```

`createNewFile` の直後に追加する:

```ts
  /**
   * ファイルを OS のゴミ箱へ移す（rev 6章。完全削除はしない）。
   * 開いているファイルなら closeCurrentFile を通さない——あれは flush する経路で、
   * 消したファイルを書き戻して復活させる。trashFile が dispose だけを行う
   */
  const deleteFile = async (file: ProjectFile) => {
    const wasSelected = file.path === selectedPath
    try {
      // 進行中の selectFile / openFolder があれば、その結果を捨てさせる
      if (wasSelected) selectSeq.current++
      await trashFile({
        path: file.path,
        saver: wasSelected ? saverRef.current : null,
        trash: moveFileToTrash,
      })
      if (wasSelected) {
        saverRef.current = null
        setSelectedPath(null)
        setHistory(null)
        setSaveError(null)
      }
      // 単一性違反はここで解消されうるので、必ず検証をやり直す
      setFiles((prev) => computeIssues(prev.filter((f) => f.path !== file.path), appRegistry))
      setIoError(null)
    } catch (err) {
      setIoError(
        `ファイルを削除できませんでした: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /** 削除は Undo で戻せないので確認を挟む（用語の削除に確認を挟まないのとは別。rev 5章） */
  const requestDelete = (file: ProjectFile) => {
    setConfirm({
      title: 'ファイルを削除しますか？',
      description: `${file.name} を OS のゴミ箱へ移動します。完全には削除しないので、ゴミ箱から戻せます。`,
      confirmLabel: 'ゴミ箱へ移動',
      onConfirm: () => deleteFile(file),
    })
  }
```

`FileList` に `onDelete` を追加する（`onCreate` の直後）:

```tsx
            onDelete={requestDelete}
```

`<selectedModule.Editor ... />` に `modalOpen` を足す（`issues` の直後）:

```tsx
                issues={selected.issues}
                modalOpen={modalOpen}
```

`</main>` の**直前**に追加する:

```tsx
      <ConfirmDialog
        open={modalOpen}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        confirmLabel={confirm?.confirmLabel ?? ''}
        onConfirm={() => {
          const pending = confirm
          setConfirm(null)
          void pending?.onConfirm()
        }}
        onCancel={() => setConfirm(null)}
      />
```

- [ ] **Step 7: テスト・型・lint・ビルドを通す**

Run: `npm test && npx tsc -b tsconfig.test.json && npm run lint && npm run build`
Expected: すべて PASS、警告ゼロ

- [ ] **Step 8: 実機で削除と単一性違反の解消を確認する**

Run: `npm run tauri dev`

確認手順:
1. `sample-project-broken` を開く → `glossary-main.json` / `glossary-newer.json` / `glossary-schema-violation.json` / `glossary-second.json` に単一性違反のバッジが出ている
2. `glossary-second.json` の「削除」を押す → 確認ダイアログが出る。**この間に Enter を押しても行が増えない／Esc はダイアログだけが閉じる**
3. 「ゴミ箱へ移動」→ 一覧から消え、ゴミ箱に入っている。単一性違反のバッジが1件分減る
4. 開けないファイル（`broken-syntax.json`）も削除できる
5. **開いているファイルの削除**: 用語集を開いて名称セルを1文字打ち、**500ms 経つ前に**そのファイルの「削除」→「ゴミ箱へ移動」を押す → ファイルが復活しないこと（エクスプローラで確認）。エディタは「ファイルを選ぶとここで編集できます。」に戻る
6. 残った用語集ファイル群を消して1つだけにする → 赤バッジが完全に消える（8節「単一性違反の解消手段が無い」が閉じたことの確認）

- [ ] **Step 9: Commit**

```bash
git add src/core/registry.ts src/components/FileList.tsx src/components/FileList.dom.test.tsx src/modules/glossary/GlossaryEditor.tsx src/modules/glossary/GlossaryEditor.dom.test.tsx src/App.tsx
git commit -m "M4: ファイル削除（OSゴミ箱）とモーダル中の操作言語停止を配線"
```

---

### Task 7: 用語集0個からの自動生成と空状態

用語集0個は正常な状態（新規プロジェクト）で、初回の用語登録時にアプリが自動生成する（rev 5章）。**発火点となるインライン登録コンポーネントは M4 の対象外**なので、ここでは自動生成のコア関数（Task 3 の `ensureFileOfType`）を UI から呼べる形にして、額縁の空状態から使えるようにする。あわせて M3 の申し送り「用語が1件だけの状態でその行を消すとフォーカスが `document.body` に落ちる」を塞ぐ。

**Files:**
- Modify: `src/modules/glossary/GlossaryEditor.tsx`
- Modify: `src/modules/glossary/GlossaryEditor.dom.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ensureFileOfType`（Task 3）、`joinPath` / `writeProjectFile`（Task 2 / 既存）
- Produces: なし（既存コンポーネントの挙動追加のみ）

---

- [ ] **Step 1: 最後の1行を消したときのフォーカスの失敗するテストを書く**

Modify `src/modules/glossary/GlossaryEditor.dom.test.tsx` — ファイル末尾に追加する:

```tsx
describe('用語0件の空状態', () => {
  it('最後の1行を消したら「用語を追加」ボタンへフォーカスが移る', async () => {
    renderEditor(glossary([term({ id: 'term_AAAAAAAAAA', name: '受注' })]))
    const cell = screen.getByRole('textbox', { name: '名称（1行目）' }) as HTMLInputElement
    cell.focus()
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    const add = await screen.findByRole('button', { name: '用語を追加' })
    expect(document.activeElement).toBe(add)
  })

  it('検索中に最後の1行を消しても絞り込みが解けてボタンが出る', async () => {
    renderEditor(glossary([term({ id: 'term_AAAAAAAAAA', name: '受注' })]))
    fireEvent.change(screen.getByRole('searchbox', { name: '用語を検索' }), {
      target: { value: '受注' },
    })
    const cell = screen.getByRole('textbox', { name: '名称（1行目）' }) as HTMLInputElement
    cell.focus()
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    const add = await screen.findByRole('button', { name: '用語を追加' })
    expect(document.activeElement).toBe(add)
  })
})
```

- [ ] **Step 2: テストを走らせて落ちることを確認する**

Run: `npm test -- src/modules/glossary/GlossaryEditor.dom.test.tsx`
Expected: FAIL（`document.activeElement` が `document.body`／2件目はボタンが見つからない）

- [ ] **Step 3: エディタの空状態を直す**

Modify `src/modules/glossary/GlossaryEditor.tsx`:

`const [pendingFocus, setPendingFocus] = useState(...)` の直後に追加する:

```tsx
  // 用語0件になったときの移動先。行が無いのでセルの鍵では指せない
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const [focusAddButton, setFocusAddButton] = useState(false)
```

`pendingFocus` の `useEffect` の直後に追加する:

```tsx
  useEffect(() => {
    if (!focusAddButton) return
    addButtonRef.current?.focus()
    setFocusAddButton(false)
  }, [focusAddButton])
```

`deleteRow` を差し替える:

```tsx
  const deleteRow = (index: number) => {
    const terms = removeAt(data.terms, index)
    onChange({ ...data, terms }, null)
    if (terms.length === 0) {
      // 0件の一覧に絞り込みを残す意味は無く、残すと導出表示扱いで
      //「用語を追加」が出ずフォーカスの行き先が消える
      setFilter(EMPTY_FILTER)
      setFocusAddButton(true)
      return
    }
    // 削除後の配列から鍵を引く。先頭行を消したときは新しい先頭行へ移る
    // （前の行が無いからとフォーカスを放置すると body に落ちて操作不能になる）
    setPendingFocus({
      rowKey: computeRowKeys(terms)[Math.min(index, terms.length - 1)],
      field: 'name',
    })
  }
```

末尾の「用語を追加」ボタンに `ref` を付ける:

```tsx
        <button
          ref={addButtonRef}
          type="button"
          className="mt-3 rounded-sm border border-rule px-3 py-1 text-sm text-ink hover:bg-surface"
          onClick={() => insertRowAfter(-1)}
        >
          用語を追加
        </button>
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/modules/glossary/GlossaryEditor.dom.test.tsx`
Expected: PASS

- [ ] **Step 5: 額縁側に用語集の自動生成を配線する**

Modify `src/App.tsx`:

import の `createFile, trashFile` を `createFile, ensureFileOfType, trashFile` にする。

`requestDelete` の直後に追加する:

```ts
  /**
   * 用語集を1つ確保して開く。用語集0個は正常な状態（新規プロジェクト）で、
   * 本来の発火点は用語のインライン登録（rev 5章。呼び出す側の他ツールが
   * まだ無いため M4 では額縁の空状態から呼ぶ）。生成の条件と正規形は
   * コアの ensureFileOfType が持つので、将来の発火点はそちらを呼べばよい
   */
  const ensureGlossary = async () => {
    const module = appRegistry.get('glossary')
    if (projectDir === null || module === undefined) return
    try {
      const { path, created } = await ensureFileOfType({
        dir: projectDir,
        module,
        files: files.map((f) => ({ path: f.path, name: f.name, type: f.result.type })),
        join: joinPath,
        write: writeProjectFile,
      })
      if (created === null) {
        // 既にあった。走査済みの一覧から引いて開くだけ
        const existing = files.find((f) => f.path === path)
        if (existing) await selectFile(existing)
        return
      }
      const entry: ProjectFile = {
        path: created.path,
        name: created.name,
        result: classifyFile(created.text, appRegistry),
        issues: [],
      }
      setFiles((prev) => computeIssues([...prev, entry], appRegistry))
      setIoError(null)
      await selectFile(entry)
    } catch (err) {
      setIoError(
        `用語集を作成できませんでした: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
```

`const selected = files.find(...)` の周辺（`selectedModule` の定義の直後）に追加する:

```ts
  // 用語集0個は正常な状態（新規プロジェクト）。押せば作れることを空状態で示す
  const hasGlossary = files.some((f) => f.result.type === 'glossary')
```

`{selected === null && (<p ...>ファイルを選ぶとここで編集できます。</p>)}` を差し替える:

```tsx
          {selected === null && (
            <div className="p-6">
              <p className="text-sm text-ink-muted">ファイルを選ぶとここで編集できます。</p>
              {projectDir !== null && !hasGlossary && (
                <div className="mt-4">
                  <p className="text-sm text-ink-muted">
                    このプロジェクトにはまだ用語集がありません（新規プロジェクトでは正常な状態です）。
                  </p>
                  <button
                    type="button"
                    className="mt-2 rounded-sm border border-rule px-3 py-1 text-sm text-ink hover:bg-surface"
                    onClick={() => void ensureGlossary()}
                  >
                    用語集を作る
                  </button>
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 6: テスト・型・lint・ビルドを通す**

Run: `npm test && npx tsc -b tsconfig.test.json && npm run lint && npm run build`
Expected: すべて PASS、警告ゼロ

- [ ] **Step 7: 実機で空状態を確認する**

Run: `npm run tauri dev`

確認手順:
1. 空フォルダを開く → 右ペインに「このプロジェクトにはまだ用語集がありません」＋「用語集を作る」が出る
2. 押す → `用語集.json` が作られて開き、「用語を追加」ボタンが出る。左の空状態案内は消える
3. 「用語を追加」→ 名称が `新しい用語` で全選択状態になる
4. 名称を全部消して Backspace → 行が消え、**フォーカスが「用語を追加」ボタンに乗る**（Tab を押さずに Enter で再追加できる）
5. 用語を2件足し、検索欄に片方の名称を入れて絞り込み、その行を消す → 絞り込みが解けて残りの行が見える
6. 用語1件の状態で検索して絞り込み、その行を消す → 検索欄が空になり「用語を追加」にフォーカスが乗る

- [ ] **Step 8: Commit**

```bash
git add src/modules/glossary/GlossaryEditor.tsx src/modules/glossary/GlossaryEditor.dom.test.tsx src/App.tsx
git commit -m "M4: 用語集の自動生成と用語0件の空状態を追加"
```

---

### Task 8: 保存できないまま閉じられない問題の脱出口

M1 で入れた close 横取りは、flush が失敗している間ウィンドウを閉じない。ファイルが恒久的に書けない状態（権限・ロック・別プロセスが掴んでいる）だと**終了手段が無くなる**（8節「いつでもよいが、忘れると実害化する残件」）。Task 4 の確認ダイアログを使って「破棄して閉じる」を出す。

**Files:**
- Modify: `src/fs/app-window.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `interceptClose`（既存）、`ConfirmDialog` と `setConfirm`（Task 4・6）
- Produces: `forceClose(): Promise<void>`（`src/fs/app-window.ts`）

---

- [ ] **Step 1: `forceClose` を追加する**

Modify `src/fs/app-window.ts` — ファイル末尾に追加する:

```ts
/**
 * 保留中の編集を書き切らずにウィンドウを閉じる（保存できない状態からの脱出口）。
 * interceptClose が false を返し続ける状況（権限・ロック等でファイルが恒久的に
 * 書けない）でアプリを終了できなくなるのを防ぐ。destroy は onCloseRequested を
 * 再発火させないので、横取りループには入らない
 */
export async function forceClose(): Promise<void> {
  await getCurrentWindow().destroy()
}
```

- [ ] **Step 2: App の close 横取りに脱出口を配線する**

Modify `src/App.tsx` — import を `import { forceClose, interceptClose } from '@/fs/app-window'` にする。

close 横取りの `useEffect`（135〜143行）を差し替える:

```ts
  // ウィンドウ close を横取りして保留中の編集を書き切る。
  // flush が失敗したら閉じず、代わりに脱出口を出す——書けていない編集を
  // 黙って捨てないが、閉じられなくなる状態も作らない
  useEffect(() => {
    const unlisten = interceptClose(async () => {
      const saver = saverRef.current
      if (saver === null) return true
      if (await saver.flush()) return true
      setConfirm({
        title: '保存できないため閉じられません',
        description:
          '保存していない編集があります。もう一度閉じる操作をすると保存を再試行します。破棄して閉じると、この編集は失われます（ファイルの内容は最後に保存できた状態のままです）。',
        confirmLabel: '破棄して閉じる',
        onConfirm: async () => {
          saverRef.current?.dispose()
          await forceClose()
        },
      })
      return false
    })
    return () => {
      void unlisten.then((f) => f())
    }
  }, [])
```

> `setConfirm` は `useState` のセッターなので参照が安定しており、依存配列を空のままにしてよい（lint も警告しない）。

- [ ] **Step 3: テスト・型・lint・ビルドを通す**

Run: `npm test && npx tsc -b tsconfig.test.json && npm run lint && npm run build`
Expected: すべて PASS、警告ゼロ

- [ ] **Step 4: 実機で脱出口を確認する**

Run: `npm run tauri dev`

確認手順（書けない状態を作る）:
1. プロジェクトフォルダを開き、用語集を開く
2. エクスプローラで `用語集.json` のプロパティ →「読み取り専用」にチェック（または PowerShell で `Set-ItemProperty -Path <path> -Name IsReadOnly -Value $true`）
3. アプリで名称セルを1文字編集 → 500ms 後に自動保存が失敗し、`saveError` バナーが出る
4. ウィンドウの × を押す → 閉じず、「保存できないため閉じられません」ダイアログが出る
5. 「キャンセル」→ 閉じない。× をもう一度押す → 再試行してまた失敗し、ダイアログが出る
6. 読み取り専用を外して × → 保存されて閉じる
7. もう一度読み取り専用にして編集 → × →「破棄して閉じる」→ アプリが閉じる。ファイルの中身は編集前のまま
8. **後片付け**: 読み取り専用属性を外す

- [ ] **Step 5: Commit**

```bash
git add src/fs/app-window.ts src/App.tsx
git commit -m "M4: 保存できないまま閉じられない状態の脱出口を追加"
```

---

### Task 9: ドキュメント反映と M4 完了の申し送り

`docs/impl-scope-glossary.md` は「実装計画への入力」であり、各マイルストーンの完了時に申し送りを追記してきた（7節＝M1、8節＝M2、9節＝M3）。M4 の 10 節を足す。

**Files:**
- Modify: `docs/impl-scope-glossary.md`
- Modify: `docs/overview-rev.md`

**Interfaces:**
- Consumes: Task 1〜8 の実装結果
- Produces: なし（ドキュメント）

---

- [ ] **Step 1: rev への反映事項を反映する**

Modify `docs/overview-rev.md`:

7章「Rust は原則書かない」に相当する記述の近くに、次の趣旨を1行足す:

> ただし OS のゴミ箱への移動だけは fs プラグインに API が無く、自前の Tauri コマンド `move_to_trash` を1本だけ持つ（6章「完全削除はしない」を満たすため。ロジックは持たず `trash` クレートを呼ぶだけ）。

6章のモジュール規約6点セットの直後に、次の趣旨を1行足す:

> 規約6点に加えて、額縁の新規作成が使う**空文書の雛形**（`createEmpty(title)`）をモジュールが提供する。額縁は `type` からモジュールを引いて作るため、雛形を置ける場所はモジュール側しかない。

（M3 完了時の申し送り 9節「rev への反映事項」——10章の Ctrl+Y / 編集中の Undo/Redo / 導出表示中に止める操作の一般化——が未反映なら、ここでまとめて反映する。）

- [ ] **Step 2: 実装スコープ定義書に 10 節を足す**

Modify `docs/impl-scope-glossary.md` — 9節の末尾（ファイル末尾）に追加する。以下は骨格で、**実装中に実際に踏んだことを書くこと**（テンプレートを埋めるのではなく、レビューと E2E で出た指摘を書く）:

```markdown
---

## 10. M4 完了に伴う申し送り（YYYY-MM-DD 追記）

M4 は実装・レビュー・E2E 完了。新規作成（type選択）／削除（OSゴミ箱）／用語集0個からの自動生成が入り、8節・9節の「単一性違反の解消手段が無い」「モーダルの配線点」「用語1件の行を消すとフォーカスが body に落ちる」「保存できないと閉じられない」は解消した。

### 実装で確定した事項（計画の前提に昇格）

- **自前の Tauri コマンドは `move_to_trash` の1本だけ**: 2節の「Tauri コマンドは追加しない」は「fs / dialog で足りる」を前提にした記述で、OS ゴミ箱だけはその前提が成り立たない。Rust 側は `trash::delete` を呼ぶだけで判断を持たない（rev 7章の原則は維持）。**自前コマンドは ACL 対象外なので capabilities への追記は要らない**——M2 で確定した「新しい Tauri JS API を使うたびに権限追加が要る」はプラグイン／コアコマンドの話
- **削除の経路は flush してはいけない**: 開いているファイルをゴミ箱へ移すとき `closeCurrentFile()`（flush する経路）を通すと、消したファイルを自動保存が書き戻して復活させる。`src/core/file-ops.ts` の `trashFile` が dispose → trash の順を守る。M5 の外部変更検知でも「外部で消えたファイル」に対して同じ注意が要る
- **モジュール規約に `createEmpty(title)` が加わった**: rev 6章の6点セットには無いが、額縁の新規作成が type からモジュールを引く以上モジュール側にしか置けない。**2本目のモジュールもこれを実装する**（`src/core/registry.ts`）。残る空きスロットは出力ロジック（規約5・M6）のみ
- **新規ファイルも正規形で書く**: 非正規形で作ると、作った直後の最初の1文字の編集で全行 diff が出る。`buildNewFile` のテストが「スキーマ適合」と「再シリアライズでバイト一致」の両方を固定している（`src/core/new-file.test.ts`）
- **ファイル名は `<displayName>.json`、衝突時は `-2` から連番**（`src/core/file-naming.ts`）。ファイル名は識別子ではない（rev 5章）ので意味は持たせず、衝突回避だけを目的とする。Windows は大文字小文字を区別しないので比較も区別しない。`title` は拡張子を除いたファイル名を初期値にする
- **`ProjectFile` / `computeIssues` は `src/core/project-file.ts` に移した**（App.tsx の肥大化対策）。検証の呼び出し経路は「フォルダ走査時」「編集時」「ファイル作成・削除時」の3本になった。**M5 の外部変更の取り込みが4本目**

### M5 で扱うもの

- （8節・9節の M5 項目は引き続き有効。M4 で新たに積んだものをここに書く）
- **削除・新規作成は監視の自己書き込み除外の対象になる**: フォルダ監視を入れると、アプリ自身のファイル作成・ゴミ箱移動が外部変更として跳ね返る
- **`ioError` / `saveError` / トーストの整理**: M4 でファイル操作の失敗も `ioError` バナーに合流させた。M5 のトースト設計と併せて、どれをバナーでどれをトーストにするか決める

### M6 で扱うもの

- （9節の M6 項目は引き続き有効）

### M7 で扱うもの

- **確認ダイアログの見た目は shadcn の既定トークンのまま**（`src/components/ui/alert-dialog.tsx` は生成物）。`ConfirmDialog` を役割トークンへ寄せるのは M7
- **新規作成ボタン・削除ボタン・空状態の文字色は既存の役割トークンの流用で仮置き**

### いつでもよいが、忘れると実害化する残件

- （8節・9節の残件のうち未解消のものを再掲し、M4 で新たに見つかったものを足す）
```

- [ ] **Step 3: 全体を通して確認する**

Run: `npm test && npx tsc -b tsconfig.test.json && npm run lint && npm run build`
Expected: すべて PASS、警告ゼロ

- [ ] **Step 4: Commit**

```bash
git add docs/impl-scope-glossary.md docs/overview-rev.md
git commit -m "M4: 完了に伴う申し送りを実装スコープ定義書に追記"
```

---

## 完了条件

M4 の完了は次で判定する（4節 M4 ＋ 8節・9節の申し送り）:

1. 空フォルダから「＋ 用語集を新規作成」または「用語集を作る」で用語集が作られ、そのまま開ける
2. 作られたファイルが正規形で、最初の編集の `git diff` が該当行だけに出る
3. 用語集が2つある状態から片方を削除すると、単一性違反の赤バッジが消える
4. 削除は OS のゴミ箱に入り、ゴミ箱から戻せる（完全削除されていない）
5. 開けないファイル（スキーマ違反・未知 type）も削除できる
6. 開いているファイルをデバウンス窓の中で削除しても、そのファイルが復活しない
7. 確認ダイアログが開いている間、Enter で行が増えず、Esc はダイアログだけが閉じる
8. 用語1件だけの行を消しても、フォーカスが `document.body` に落ちない
9. 書けないファイルを開いた状態でも「破棄して閉じる」でアプリを終了できる
