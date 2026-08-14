# M13: ファイルに名前をつける／一覧を種類でまとめる 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** JSON の `title` を額縁から編集できるようにし、ファイル一覧を種類ごとの見出しでまとめて `title` の五十音順に並べる。

**Architecture:** ファイル名は変えない。名前の実体は既にスキーマにある `title` フィールドで、編集は既存の `onChange`（`record` + `applyEdit`）経路にそのまま乗せる。一覧のグループ化とソートはコアの純関数（`groupFiles`）に閉じ、`FileList` は受け取った `groups` を描くだけにする。`AppController` に新しい API は足さない。

**Tech Stack:** TypeScript / React 19 / Tailwind / vitest（`vitest run`）/ @testing-library/react（jsdom）/ Tauri 2

## Global Constraints

- **スキーマを変更しない。** `title` は全4スキーマの既存の必須 string。`schemaVersion` は上げない。マイグレータも `scripts/gen-types.mjs` の再生成も不要
- **`AppController` インターフェース（`src/core/app-controller.ts:60-112`）に新しいメソッドを足さない。** 帯は既存の `applyEdit` を使う
- **ソースに色値を直書きしない**（`conventions.test.ts` が検査する）。役割トークンのクラス（`text-ink` / `text-ink-muted` / `text-warning` / `border-rule` / `bg-surface` / `bg-surface-accent` / `bg-canvas`）だけを使う
- **`display` は三項で切り替える。** `hidden` と `flex` を同じ `className` に並べない（`src/App.tsx` のコメント参照）
- 空の `title` は**許す**。表示は `(無題)`。整合性エラー（赤）にしない
- 検証コマンドは `npm test && npx tsc -b && npm run lint`
- コミットメッセージ末尾に `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` を付ける

**参照スペック:** `docs/superpowers/specs/2026-08-14-m13-file-titles-and-list-grouping-design.md`

## File Structure

| ファイル | 責務 | 変更 |
| --- | --- | --- |
| `src/core/load.ts` | 生の文書レコード ↔ `title` の読み書き | 変更（`UNTITLED` / `titleOf` / `withTitle` を追加） |
| `src/core/app-controller.ts` | 編集の反映 | 変更（`applyEdit` が `result.title` を引き直す） |
| `src/core/project-file.ts` | `ProjectFile` → 表示 | 変更（`displayTitle` を追加） |
| `src/core/file-grouping.ts` | 一覧のグループ化と並び順 | **新規** |
| `src/components/FileList.tsx` | 一覧の描画 | 変更（見出し・主副入れ替え・accessible name） |
| `src/components/FileHeader.tsx` | 選択中ファイルの名前の帯 | **新規** |
| `src/App.tsx` | 配線 | 変更（帯の設置・`groups` の受け渡し） |
| `src/modules/glossary/GlossaryEditor.tsx` | 用語集エディタ | 変更（`<h2>` 削除） |
| `src/modules/error-catalog/ErrorCatalogEditor.tsx` | エラーカタログエディタ | 変更（`<h2>` 削除） |

---

### Task 1: `titleOf` / `withTitle` と、`applyEdit` の `result.title` 引き直し

`applyEdit` は `result.data` を差し替えるのに `result.title` を放置している。いま `title` を編集する手段が無いので誰も踏んでいないが、Task 5〜6 で帯を足した瞬間に「名前を変えても一覧が変わらない」という形で機能の中心が動かなくなる。**先に塞ぐ。**

**Files:**
- Modify: `src/core/load.ts`（`UNTITLED` / `titleOf` / `withTitle` を追加し、`classifyFile` の editable 分岐を `titleOf` に寄せる）
- Modify: `src/core/app-controller.ts:290`
- Test: `src/core/load.test.ts`, `src/core/app-controller.test.ts`

**Interfaces:**
- Produces:
  - `export const UNTITLED = '(無題)'`
  - `export function titleOf(data: unknown): string`
  - `export function withTitle(data: unknown, title: string): unknown`

- [ ] **Step 1: `load.test.ts` に失敗するテストを足す**

ファイル末尾に追記する。既存の import 行に `UNTITLED`, `titleOf`, `withTitle` を足すこと（現在は `classifyFile` 等を `./load` から import している）。

```ts
describe('titleOf', () => {
  it('title が文字列ならそのまま返す', () => {
    expect(titleOf({ title: '受注フロー' })).toBe('受注フロー')
  })

  it('空文字もそのまま返す（空欄は未決の意思表示。潰さない）', () => {
    expect(titleOf({ title: '' })).toBe('')
  })

  it('title が無い・文字列でない・レコードでないなら (無題)', () => {
    expect(titleOf({})).toBe(UNTITLED)
    expect(titleOf({ title: 42 })).toBe(UNTITLED)
    expect(titleOf(null)).toBe(UNTITLED)
    expect(titleOf('文字列')).toBe(UNTITLED)
  })
})

describe('withTitle', () => {
  it('title だけを差し替え、他のキーは保つ', () => {
    const before = { schemaVersion: 1, type: 'sequence', title: '旧', steps: [] }
    expect(withTitle(before, '受注フロー')).toEqual({
      schemaVersion: 1,
      type: 'sequence',
      title: '受注フロー',
      steps: [],
    })
  })

  it('元のオブジェクトを破壊しない', () => {
    const before = { title: '旧' }
    withTitle(before, '新')
    expect(before.title).toBe('旧')
  })
})
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/core/load.test.ts`
Expected: FAIL（`titleOf is not a function` / import が解決できない）

- [ ] **Step 3: `load.ts` に実装する**

`LoadResult` の型定義の直後（`const validatorCache` の手前）に追加する。

```ts
/** title が読めないときの表示。一覧と帯が共有する */
export const UNTITLED = '(無題)'

/**
 * 文書レコードから表示用の title を読む。読めなければ `(無題)`。
 * **空文字はそのまま返す**——空欄は「まだ決めていない」という意思表示なので、
 * ここで潰すと未決が見えなくなる（表示側が `(無題)` に落とすかを決める）。
 * `classifyFile` と `applyEdit` の両方から呼ぶので、判定はここ1箇所に閉じる
 */
export function titleOf(data: unknown): string {
  if (typeof data !== 'object' || data === null) return UNTITLED
  const t = (data as Record<string, unknown>).title
  return typeof t === 'string' ? t : UNTITLED
}

/** 文書レコードの title だけを差し替えた新しいレコードを返す（額縁の帯が使う） */
export function withTitle(data: unknown, title: string): unknown {
  return { ...(data as Record<string, unknown>), title }
}
```

続けて `classifyFile` の最終行（editable を返す行）を書き換える。

変更前:
```ts
  return { status: 'editable', type, title: title ?? '(無題)', data: record }
```

変更後:
```ts
  return { status: 'editable', type, title: titleOf(record), data: record }
```

（`title ?? '(無題)'` と `titleOf(record)` は等価。`title` は同じ `typeof === 'string'` 判定から作られている）

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/core/load.test.ts`
Expected: PASS（新規5件＋既存すべて）

- [ ] **Step 5: `app-controller.test.ts` に失敗するテストを足す**

`describe('applyEdit', ...)`（`src/core/app-controller.test.ts:393`）の中、既存の `it` の直後に追加する。

```ts
  it('result.title を新しい title で引き直す（一覧の表示が古いまま残らない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    const module = h.registry.get('note')!
    h.controller.applyEdit(p('a.json'), module, {
      schemaVersion: 1,
      type: 'note',
      title: '受注フロー',
      body: '',
    })
    const entry = h.files().find((f) => f.path === p('a.json'))!
    expect(entry.result.status === 'editable' && entry.result.title).toBe('受注フロー')
  })
```

- [ ] **Step 6: 失敗を確認する**

Run: `npx vitest run src/core/app-controller.test.ts -t "result.title を新しい title で引き直す"`
Expected: FAIL（`'A'` が返り `'受注フロー'` にならない）

- [ ] **Step 7: `app-controller.ts` を直す**

`applyEdit`（`src/core/app-controller.ts:285-293`）の `files.map` の中身を書き換える。

変更前:
```ts
          ? { ...f, result: { ...f.result, data: next } }
```

変更後:
```ts
          // title も引き直す。**data だけ差し替えると一覧の表示が古いまま残る**
          //（額縁の帯で名前を変えても一覧が変わらない、という形で出る）
          ? { ...f, result: { ...f.result, data: next, title: titleOf(next) } }
```

`load` からの import に `titleOf` を足す（ファイル先頭の `import ... from './load'` 行。無ければ追加する）。

- [ ] **Step 8: テストが通ることを確認する**

Run: `npx vitest run src/core/app-controller.test.ts`
Expected: PASS（新規1件＋既存すべて）

- [ ] **Step 9: コミット**

```bash
git add src/core/load.ts src/core/load.test.ts src/core/app-controller.ts src/core/app-controller.test.ts
git commit -m "$(cat <<'EOF'
fix(core): applyEdit が result.title を引き直すようにする

title の判定を load.ts の titleOf に一本化し、classifyFile と applyEdit
の両方がそこを通るようにした。applyEdit は data だけを差し替えていたため、
title を編集できるようになった瞬間「名前を変えても一覧が変わらない」形で
壊れる。帯を足す前に塞ぐ。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `displayTitle`（一覧の行の主表示を決める純関数）

**Files:**
- Modify: `src/core/project-file.ts`（`fileName()` の直後に追加）
- Test: `src/core/project-file.test.ts`

**Interfaces:**
- Consumes: `UNTITLED`（Task 1、`src/core/load.ts`）
- Produces: `export function displayTitle(file: ProjectFile): string`

- [ ] **Step 1: `project-file.test.ts` に失敗するテストを足す**

ファイル末尾に追記する。`displayTitle` を `./project-file` の import に足すこと。

```ts
describe('displayTitle', () => {
  function f(name: string, result: ProjectFile['result']): ProjectFile {
    return { path: `C:\\proj\\${name}`, name, result, issues: [] }
  }

  it('editable なら title を返す', () => {
    expect(
      displayTitle(f('シーケンス-2.json', { status: 'editable', type: 'sequence', title: '受注フロー', data: {} })),
    ).toBe('受注フロー')
  })

  it('editable で title が空文字なら (無題)', () => {
    expect(
      displayTitle(f('シーケンス-2.json', { status: 'editable', type: 'sequence', title: '', data: {} })),
    ).toBe('(無題)')
  })

  it('rejected でも title が読めていればそれを返す（スキーマ検証より前に読まれるため）', () => {
    expect(
      displayTitle(
        f('シーケンス-2.json', {
          status: 'rejected',
          type: 'sequence',
          title: '受注フロー',
          reason: 'スキーマ検証に失敗しました（このファイルは開けません）',
          errors: [],
        }),
      ),
    ).toBe('受注フロー')
  })

  it('title が null（パースすらできない）ならファイル名に落ちる', () => {
    expect(
      displayTitle(
        f('メモ.json', {
          status: 'rejected',
          type: null,
          title: null,
          reason: 'JSON として解釈できません',
          errors: [],
        }),
      ),
    ).toBe('メモ.json')
  })

  it('listOnly で title が空文字ならファイル名に落ちる', () => {
    expect(
      displayTitle(
        f('注文の状態遷移.json', {
          status: 'listOnly',
          type: 'stateMachine',
          title: '',
          reason: '編集できない schemaVersion',
        }),
      ),
    ).toBe('注文の状態遷移.json')
  })
})
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/core/project-file.test.ts`
Expected: FAIL（`displayTitle is not a function`）

- [ ] **Step 3: `project-file.ts` に実装する**

`fileName()` の直後に追加し、先頭の import に `UNTITLED` を足す（`import { UNTITLED, type LoadResult } from './load'` の形。現在は `import type { LoadResult } from './load'` なので、型 import から値 import へ変える）。

```ts
/**
 * 一覧の行の主表示（rev 5章。ファイル名は識別子ではないので、
 * 大きく出すのは人間がつけた名前の方）。
 *
 * **開けないファイルでも title を出す**——`classifyFile` は title を
 * スキーマ検証より前に読む（`src/core/load.ts`）ので、壊れたシーケンスでも
 * 「受注フロー」だと分かることが多い。パースすらできなければ null なので
 * ファイル名に落ちる
 */
export function displayTitle(file: ProjectFile): string {
  const { result } = file
  if (result.status === 'editable') return result.title === '' ? UNTITLED : result.title
  return result.title !== null && result.title !== '' ? result.title : file.name
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/core/project-file.test.ts`
Expected: PASS（新規5件＋既存すべて）

- [ ] **Step 5: コミット**

```bash
git add src/core/project-file.ts src/core/project-file.test.ts
git commit -m "$(cat <<'EOF'
feat(core): 一覧の行の主表示を決める displayTitle を足す

editable は title（空文字なら (無題)）、開けないファイルは読めていれば
title、読めなければファイル名。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `groupFiles`（一覧のグループ化と並び順）

**Files:**
- Create: `src/core/file-grouping.ts`
- Test: `src/core/file-grouping.test.ts`（新規）

**Interfaces:**
- Consumes: `displayTitle`（Task 2）、`ProjectFile`（`src/core/project-file.ts`）、`AnyToolModule`（`src/core/registry.ts`）
- Produces:
  - `export interface FileGroup { key: string; heading: string; files: ProjectFile[] }`
  - `export function groupFiles(files: readonly ProjectFile[], modules: readonly AnyToolModule[]): FileGroup[]`

- [ ] **Step 1: 失敗するテストを書く**

Create `src/core/file-grouping.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { groupFiles } from './file-grouping'
import type { ProjectFile } from './project-file'
import type { AnyToolModule } from './registry'

/** 見出しの検証に要るのは type と displayName だけなので、そこだけ持つ偽物を使う */
function mod(type: string, displayName: string): AnyToolModule {
  return { type, displayName } as unknown as AnyToolModule
}

const MODULES = [
  mod('glossary', '用語集'),
  mod('errorCatalog', 'エラーカタログ'),
  mod('logicTree', 'ロジックツリー'),
  mod('sequence', 'シーケンス'),
]

function editable(name: string, type: string, title: string): ProjectFile {
  return {
    path: `C:\\proj\\${name}`,
    name,
    result: { status: 'editable', type, title, data: {} },
    issues: [],
  }
}

function unreadable(name: string): ProjectFile {
  return {
    path: `C:\\proj\\${name}`,
    name,
    result: { status: 'rejected', type: null, title: null, reason: 'JSON として解釈できません', errors: [] },
    issues: [],
  }
}

describe('groupFiles', () => {
  it('見出しはレジストリの登録順に並ぶ（新規作成ボタンと同じ順）', () => {
    const groups = groupFiles(
      [editable('b.json', 'sequence', 'あ'), editable('a.json', 'glossary', 'い')],
      MODULES,
    )
    expect(groups.map((g) => g.heading)).toEqual(['用語集', 'シーケンス'])
  })

  it('ファイルが1つも無い種類は見出しごと出さない', () => {
    const groups = groupFiles([editable('a.json', 'glossary', '用語集')], MODULES)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('glossary')
  })

  it('グループ内は title の五十音順', () => {
    const groups = groupFiles(
      [
        editable('シーケンス.json', 'sequence', '問合せフロー'),
        editable('シーケンス-2.json', 'sequence', '受注フロー'),
        editable('シーケンス-3.json', 'sequence', '返品フロー'),
      ],
      MODULES,
    )
    expect(groups[0].files.map((f) => f.name)).toEqual([
      'シーケンス-2.json',
      'シーケンス-3.json',
      'シーケンス.json',
    ])
  })

  it('title が同じならファイル名で決める（順が揺れないため）', () => {
    const groups = groupFiles(
      [editable('b.json', 'sequence', '同じ'), editable('a.json', 'sequence', '同じ')],
      MODULES,
    )
    expect(groups[0].files.map((f) => f.name)).toEqual(['a.json', 'b.json'])
  })

  it('登録に無い type は type 文字列を見出しにし、登録済みの後ろに昇順で並ぶ', () => {
    const groups = groupFiles(
      [
        editable('z.json', 'stateMachine', '注文の状態遷移'),
        editable('y.json', 'dataModel', '在庫'),
        editable('a.json', 'glossary', '用語集'),
      ],
      MODULES,
    )
    expect(groups.map((g) => g.heading)).toEqual([
      '用語集',
      'dataModel（未対応）',
      'stateMachine（未対応）',
    ])
  })

  it('type が読めないファイルは「種類不明」で最後', () => {
    const groups = groupFiles(
      [unreadable('メモ.json'), editable('z.json', 'stateMachine', 'X'), editable('a.json', 'glossary', '用語集')],
      MODULES,
    )
    expect(groups.map((g) => g.heading)).toEqual(['用語集', 'stateMachine（未対応）', '種類不明'])
    expect(groups[2].key).toBe('__unknown__')
  })

  it('入力の配列を破壊しない', () => {
    const files = [editable('b.json', 'sequence', 'い'), editable('a.json', 'sequence', 'あ')]
    groupFiles(files, MODULES)
    expect(files.map((f) => f.name)).toEqual(['b.json', 'a.json'])
  })

  it('ファイルが0件なら空配列', () => {
    expect(groupFiles([], MODULES)).toEqual([])
  })
})
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/core/file-grouping.test.ts`
Expected: FAIL（`Cannot find module './file-grouping'`）

- [ ] **Step 3: `src/core/file-grouping.ts` を書く**

```ts
import { displayTitle, type ProjectFile } from './project-file'
import type { AnyToolModule } from './registry'

/** type が読めないファイルを入れるグループのキー。type 文字列と衝突しない形にする */
export const UNKNOWN_TYPE_KEY = '__unknown__'

/** 一覧の1グループ（種類の見出し＋その中のファイル） */
export interface FileGroup {
  /** React の key と、テストが参照する安定識別子。登録済みなら type 文字列 */
  key: string
  /** 見出しの表示名 */
  heading: string
  files: ProjectFile[]
}

/**
 * ファイル一覧を種類でまとめて並べる（コアの純関数。`FileList` は結果を描くだけ）。
 *
 * 順序は **① レジストリの登録順 → ② 登録に無い type（type 文字列の昇順）
 * → ③ type が読めないもの**。①が登録順なのは、新規作成ボタンが既に同じ順に
 * 並んでいるため（`src/components/FileList.tsx` の `modules` prop）。
 * ファイルが1つも無い種類は見出しごと出さない
 */
export function groupFiles(
  files: readonly ProjectFile[],
  modules: readonly AnyToolModule[],
): FileGroup[] {
  const buckets = new Map<string, ProjectFile[]>()
  for (const file of files) {
    const key = file.result.type ?? UNKNOWN_TYPE_KEY
    const bucket = buckets.get(key)
    if (bucket) bucket.push(file)
    else buckets.set(key, [file])
  }

  const groups: FileGroup[] = []
  const registered = new Set(modules.map((m) => m.type))

  for (const module of modules) {
    const bucket = buckets.get(module.type)
    if (bucket) groups.push({ key: module.type, heading: module.displayName, files: sorted(bucket) })
  }

  // 未対応の type は type 文字列そのものを見出しにする。「ツールがまだ無い」と
  // 「ファイルが壊れている」を一覧の上で区別するため
  const unregistered = [...buckets.keys()]
    .filter((key) => key !== UNKNOWN_TYPE_KEY && !registered.has(key))
    .sort()
  for (const type of unregistered) {
    groups.push({ key: type, heading: `${type}（未対応）`, files: sorted(buckets.get(type)!) })
  }

  const unknown = buckets.get(UNKNOWN_TYPE_KEY)
  if (unknown) groups.push({ key: UNKNOWN_TYPE_KEY, heading: '種類不明', files: sorted(unknown) })

  return groups
}

/**
 * title の五十音順。**同値のときはファイル名で決める**——これが無いと、
 * 同じ名前のファイルが2つあるだけで順が揺れる（`Array.sort` の安定性は
 * 入力順に依存し、入力順は `readDir` まかせなので当てにできない）
 */
function sorted(files: ProjectFile[]): ProjectFile[] {
  return [...files].sort((a, b) => {
    const byTitle = displayTitle(a).localeCompare(displayTitle(b), 'ja')
    return byTitle !== 0 ? byTitle : a.name.localeCompare(b.name, 'ja')
  })
}
```

`unregistered` の `.sort()` は既定の UTF-16 比較。type は ASCII の識別子なので、ロケールに依存しない決定的な順になる（`localeCompare` を使わないのはこのため）。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/core/file-grouping.test.ts`
Expected: PASS（8件）

- [ ] **Step 5: コミット**

```bash
git add src/core/file-grouping.ts src/core/file-grouping.test.ts
git commit -m "$(cat <<'EOF'
feat(core): ファイル一覧を種類でまとめて並べる groupFiles を足す

登録順 → 未対応 type（昇順）→ 種類不明。グループ内は title の五十音順で、
同値はファイル名で決める（順が揺れないため）。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `FileList` を見出し付きにし、主表示を `title` に入れ替える

**Files:**
- Modify: `src/components/FileList.tsx`
- Test: `src/components/FileList.dom.test.tsx`

**Interfaces:**
- Consumes: `FileGroup` / `groupFiles`（Task 3）、`displayTitle`（Task 2）
- Produces: `FileListProps` の `files: ProjectFile[]` が `groups: FileGroup[]` に変わる（Task 6 の App 配線が依存する）

- [ ] **Step 1: テストを新しい形に書き換える**

`src/components/FileList.dom.test.tsx` の `setup` を `groups` を渡す形にする。冒頭の import に `groupFiles` を足す。

```ts
import { groupFiles } from '@/core/file-grouping'
```

`setup` を差し替える:

```ts
function setup(
  files: ProjectFile[],
  projectOpen = true,
  existingTypes: readonly (string | null)[] = files.map((f) => f.result.type),
) {
  const handlers = { onSelect: vi.fn(), onCreate: vi.fn(), onDelete: vi.fn() }
  render(
    <FileList
      groups={groupFiles(files, appRegistry.list())}
      selectedPath={null}
      modules={appRegistry.list()}
      existingTypes={existingTypes}
      projectOpen={projectOpen}
      {...handlers}
    />,
  )
  return handlers
}
```

既存テストのうち accessible name でボタンを引いているのは**3箇所だけ**なので、次のとおり直す（`file()` ヘルパの既定の title は `'用語集'`）。

| 行 | 変更前 | 変更後 |
| --- | --- | --- |
| 61 | `{ name: /用語集\.json を開く/ }` | `{ name: '用語集（用語集.json） を開く' }` |
| 133 | `{ name: '用語集.json を削除' }` | `{ name: '用語集（用語集.json） を削除' }` |
| 143 | `{ name: '壊れた.json を削除' }` | **変更しない** |

143 は `title: null` の rejected ファイルなので `displayTitle` がファイル名に落ち、`fullName` の重複回避が働いて既存の文字列のままになる。**このテストが変わらないこと自体が、重複回避が効いている証拠になる。**

`describe('行の説明（aria-describedby）')` 直前のコメント（`src/components/FileList.dom.test.tsx:148` 付近）も実態に合わせて書き換える:

```ts
  // アクセシブル名は「<title>（<ファイル名>）を開く」。title は読まれるが、
  //「開けない」「編集不可」・issue 件数バッジは aria-describedby 側なので
  // 読まれない（M8 残件4 のうち title の部分だけが解消した）。
```

そのうえで、末尾に新規テストを足す:

```ts
describe('種類の見出しとソート（M13）', () => {
  it('種類ごとに見出しを出す', () => {
    setup([
      file('シーケンス.json', {
        result: { status: 'editable', type: 'sequence', title: '受注フロー', data: {} },
      }),
      file('用語集.json'),
    ])
    expect(screen.getByRole('heading', { name: '用語集' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'シーケンス' })).not.toBeNull()
  })

  it('行の主表示は title、副表示はファイル名', () => {
    setup([
      file('シーケンス-2.json', {
        result: { status: 'editable', type: 'sequence', title: '受注フロー', data: {} },
      }),
    ])
    expect(screen.getByText('受注フロー')).not.toBeNull()
    expect(screen.getByText('シーケンス-2.json')).not.toBeNull()
  })

  it('アクセシブル名に title とファイル名の両方が入る（同名の title があっても引ける）', () => {
    setup([
      file('a.json', { result: { status: 'editable', type: 'sequence', title: '同じ', data: {} } }),
      file('b.json', { result: { status: 'editable', type: 'sequence', title: '同じ', data: {} } }),
    ])
    expect(screen.getByRole('button', { name: '同じ（a.json） を開く' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '同じ（b.json） を削除' })).not.toBeNull()
  })

  it('title が読めずファイル名に落ちたときは同じ文字列を2度言わない', () => {
    setup([
      file('メモ.json', {
        result: {
          status: 'rejected',
          type: null,
          title: null,
          reason: 'JSON として解釈できません',
          errors: [],
        },
      }),
    ])
    expect(screen.getByRole('button', { name: 'メモ.json を開く' })).not.toBeNull()
  })
})
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/components/FileList.dom.test.tsx`
Expected: FAIL（`groups` prop が型に無い／見出しが見つからない）

- [ ] **Step 3: `FileList.tsx` の props を差し替える**

`import type { ProjectFile } from '@/core/project-file'` を次に変える:

```ts
import type { FileGroup } from '@/core/file-grouping'
import { displayTitle, type ProjectFile } from '@/core/project-file'
```

`FileListProps` の `files: ProjectFile[]` を差し替える:

```ts
  /** 種類ごとにまとめて並べ替え済みの一覧（`groupFiles` の結果。順序はコアが決める） */
  groups: FileGroup[]
```

- [ ] **Step 4: `FileRow` の主副を入れ替える**

`FileRow` の `return` を丸ごと差し替える。

```tsx
  const { file } = props
  const label = displayTitle(file)
  // **同じ文字列を2度言わない。** displayTitle がファイル名に落ちたとき
  //（title が読めないファイル）、素朴に併記すると
  //「壊れた.json（壊れた.json）」になる
  const fullName = label === file.name ? label : `${label}（${file.name}）`
  const descId = useId()
  return (
    // items-stretch で削除ボタンが行の高さいっぱいになる（要望8）。
    // 行の区切りは grid（薄い装飾の罫。要望9）
    <li className="flex items-stretch border-b border-grid">
      <button
        type="button"
        // **title だけにしないこと。** title は空にも重複にもなりうるので、
        // 一意なファイル名を併記して accessible name の一意性を保つ。
        // 逆にファイル名だけにすると、見えているラベル（主表示＝title）が
        // accessible name に含まれない（WCAG 2.5.3 Label in Name）
        aria-label={`${fullName} を開く`}
        aria-describedby={descId}
        className={`min-w-0 flex-1 border-l-2 px-4 py-2 text-left text-sm ${
          props.selected ? 'border-ink bg-canvas' : 'border-transparent hover:bg-canvas'
        }`}
        onClick={props.onSelect}
      >
        <span className="block truncate text-ink">{label}</span>
        <span id={descId} className="block truncate text-xs text-ink-muted">
          {file.name}
          {file.result.status === 'rejected' && <span className="ml-1 text-warning">開けない</span>}
          {file.result.status === 'listOnly' && <span className="ml-1">編集不可</span>}
          {file.issues.length > 0 && (
            <span className="ml-1 rounded-sm bg-warning px-1 text-xs text-warning-fg">
              {file.issues.length}
            </span>
          )}
        </span>
      </button>
      {/* 開けない・編集不可のファイルにも削除を出す——単一性違反の解消には
          「壊れている方の用語集を消す」が必要で、そこを塞ぐと外部エディタを
          強いることになる（rev 5章「拒否は最小限に」のファイル操作への適用） */}
      <button
        type="button"
        aria-label={`${fullName} を削除`}
        className={`${buttonBase} shrink-0 px-2 text-xs text-ink-muted hover:bg-canvas hover:text-warning`}
        onClick={props.onDelete}
      >
        削除
      </button>
    </li>
  )
```

- [ ] **Step 5: 一覧の本体をグループごとの見出し＋`<ul>` に変える**

`FileList` の `props.files.length === 0 ? ... : (<ul>...</ul>)` の三項を丸ごと差し替える。

```tsx
      {props.groups.length === 0 ? (
        <p className="p-4 text-sm text-ink-muted">
          このフォルダに JSON ファイルがありません。上のボタンで作成できます。
        </p>
      ) : (
        props.groups.map((group) => (
          <div key={group.key}>
            {/* 見出しは装飾ではなく文書構造なので heading。面は M8 の
                「見出しの面」トークンを使う（rev 9章） */}
            <h3 className="border-b border-rule bg-surface-accent px-4 py-1 text-xs font-bold text-ink-muted">
              {group.heading}
            </h3>
            <ul>
              {group.files.map((file) => (
                <FileRow
                  key={file.path}
                  file={file}
                  selected={file.path === props.selectedPath}
                  onSelect={() => props.onSelect(file)}
                  onDelete={() => props.onDelete(file)}
                />
              ))}
            </ul>
          </div>
        ))
      )}
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `npx vitest run src/components/FileList.dom.test.tsx`
Expected: PASS（新規3件＋既存すべて）

型は Task 6 まで `App.tsx` が古い prop を渡すので通らない。ここでは `npx tsc -b` を求めない。

- [ ] **Step 7: コミット**

```bash
git add src/components/FileList.tsx src/components/FileList.dom.test.tsx
git commit -m "$(cat <<'EOF'
feat(core): ファイル一覧に種類の見出しを出し、主表示を title にする

groups prop を受け取る形に変え、行の主表示を displayTitle、副表示を
ファイル名にした。アクセシブル名は「<title>（<ファイル名>）を開く」——
title は空にも重複にもなりうるので、一意なファイル名を併記する。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `FileHeader`（選択中ファイルの名前の帯）

**Files:**
- Create: `src/components/FileHeader.tsx`
- Test: `src/components/FileHeader.dom.test.tsx`（新規）

**Interfaces:**
- Produces:
  ```ts
  export interface FileHeaderProps {
    title: string
    fileName: string
    typeLabel: string | null
    editable: boolean
    onTitleChange: (next: string) => void
  }
  export function FileHeader(props: FileHeaderProps): JSX.Element
  ```

- [ ] **Step 1: 失敗するテストを書く**

Create `src/components/FileHeader.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FileHeader } from './FileHeader'

afterEach(cleanup)

function setup(over: Partial<Parameters<typeof FileHeader>[0]> = {}) {
  const onTitleChange = vi.fn()
  render(
    <FileHeader
      title="受注フロー"
      fileName="シーケンス-2.json"
      typeLabel="シーケンス"
      editable
      onTitleChange={onTitleChange}
      {...over}
    />,
  )
  return { onTitleChange }
}

describe('FileHeader', () => {
  it('title を入力欄に出し、ファイル名と種類を添える', () => {
    setup()
    expect(screen.getByRole('textbox', { name: 'ファイルの名前' })).toHaveProperty(
      'value',
      '受注フロー',
    )
    expect(screen.getByText('シーケンス-2.json')).not.toBeNull()
    expect(screen.getByText('シーケンス')).not.toBeNull()
  })

  it('入力で onTitleChange を呼ぶ', () => {
    const { onTitleChange } = setup()
    fireEvent.change(screen.getByRole('textbox', { name: 'ファイルの名前' }), {
      target: { value: '返品フロー' },
    })
    expect(onTitleChange).toHaveBeenCalledWith('返品フロー')
  })

  it('空にもできる（空欄は未決の意思表示。拒否しない）', () => {
    const { onTitleChange } = setup()
    fireEvent.change(screen.getByRole('textbox', { name: 'ファイルの名前' }), {
      target: { value: '' },
    })
    expect(onTitleChange).toHaveBeenCalledWith('')
  })

  it('editable が false なら読み取り専用（書けないファイルに書き込む入口を作らない）', () => {
    const { onTitleChange } = setup({ editable: false })
    const input = screen.getByRole('textbox', { name: 'ファイルの名前' })
    expect(input).toHaveProperty('readOnly', true)
    fireEvent.change(input, { target: { value: 'X' } })
    expect(onTitleChange).not.toHaveBeenCalled()
  })

  it('typeLabel が null でも壊れない（未対応 type のファイル）', () => {
    setup({ typeLabel: null })
    expect(screen.getByRole('textbox', { name: 'ファイルの名前' })).not.toBeNull()
  })
})
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run src/components/FileHeader.dom.test.tsx`
Expected: FAIL（`Cannot find module './FileHeader'`）

- [ ] **Step 3: `src/components/FileHeader.tsx` を書く**

```tsx
export interface FileHeaderProps {
  /** 現在の title（空文字もそのまま渡す） */
  title: string
  /** 副表示。ファイル名は識別子ではないので小さく出す（rev 5章） */
  fileName: string
  /** モジュールの displayName。登録に無い type なら null */
  typeLabel: string | null
  /**
   * false なら読み取り専用。**rejected / listOnly のファイルに書き込む入口を
   * 作らないため**——データを書けないファイルに編集 UI を出すと、
   * 保存されない入力を受け付けることになる
   */
  editable: boolean
  onTitleChange: (next: string) => void
}

/**
 * 選択中ファイルの名前の帯（額縁。rev 6章）。
 * 表示だけを担い、状態も I/O も持たない（配線は App）。
 *
 * **4ツール共通でここに置く。** キャンバス系（ロジックツリー・シーケンス）は
 * エディタ側に title の置き場所が無く、モジュールごとに実装すると
 * 4箇所に散る。用語集・エラーカタログのエディタが持っていた見出しは
 * ここへ一本化した
 */
export function FileHeader(props: FileHeaderProps) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-rule bg-surface px-6 py-2">
      <input
        type="text"
        aria-label="ファイルの名前"
        value={props.title}
        readOnly={!props.editable}
        placeholder="(無題)"
        className={`min-w-0 flex-1 border-b bg-transparent text-base font-bold outline-none ${
          props.editable
            ? 'border-transparent text-ink focus:border-ink'
            : 'border-transparent text-ink-muted'
        }`}
        onChange={(e) => props.onTitleChange(e.target.value)}
      />
      {props.typeLabel !== null && (
        <span className="shrink-0 text-xs text-ink-muted">{props.typeLabel}</span>
      )}
      <span className="shrink-0 truncate text-xs text-ink-muted">{props.fileName}</span>
    </div>
  )
}
```

`readOnly` の input には `onChange` が発火しないため、Step 1 の4件目のテストが通る。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/components/FileHeader.dom.test.tsx`
Expected: PASS（5件）

- [ ] **Step 5: コミット**

```bash
git add src/components/FileHeader.tsx src/components/FileHeader.dom.test.tsx
git commit -m "$(cat <<'EOF'
feat(core): 選択中ファイルの名前の帯 FileHeader を足す

4ツール共通で額縁が持つ。キャンバス系（ロジックツリー・シーケンス）は
エディタ側に title の置き場所が無いため。rejected / listOnly では
読み取り専用にして、書けないファイルに書き込む入口を作らない。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: App に配線し、エディタの `<h2>` を削除する

**Files:**
- Modify: `src/App.tsx`（import・`modules`/`groups` の memo・`FileList` の props・エディタ `<section>` への帯の設置）
- Modify: `src/modules/glossary/GlossaryEditor.tsx:212`（`<h2>` 削除）
- Modify: `src/modules/error-catalog/ErrorCatalogEditor.tsx:311`（`<h2>` 削除）

**Interfaces:**
- Consumes: `groupFiles` / `FileGroup`（Task 3）、`FileHeader`（Task 5）、`withTitle` / `titleOf`（Task 1）、`displayTitle`（Task 2）、`FileList` の `groups` prop（Task 4）

- [ ] **Step 1: import を足す**

`src/App.tsx` の import 群に追加する。

```ts
import { FileHeader } from '@/components/FileHeader'
import { groupFiles } from '@/core/file-grouping'
import { titleOf, withTitle } from '@/core/load'
```

`react` からの import に `useMemo` が無ければ足す。

- [ ] **Step 2: `modules` と `groups` を memo 化する**

`const selectedModule = ...`（`src/App.tsx:418` 付近）の近くに追加する。

```ts
  // **`appRegistry.list()` を JSX の中で呼ばないこと。** 毎レンダーで新しい
  // 配列が返るため、下の groups の useMemo が毎回作り直しになる
  const modules = useMemo(() => appRegistry.list(), [])
  const groups = useMemo(() => groupFiles(files, modules), [files, modules])
```

- [ ] **Step 3: `FileList` の props を差し替える**

`src/App.tsx:588-597` の `files={files}` と `modules={appRegistry.list()}` を書き換える。

変更前:
```tsx
              files={files}
              selectedPath={selectedPath}
              modules={appRegistry.list()}
```

変更後:
```tsx
              groups={groups}
              selectedPath={selectedPath}
              modules={modules}
```

- [ ] **Step 4: エディタの `<section>` に帯を置く**

`src/App.tsx:604` の `<section className="min-w-0 flex-1 overflow-auto">` を、帯が固定で中身だけスクロールする形に変える。

変更前:
```tsx
          <section className="min-w-0 flex-1 overflow-auto">
```

変更後（開きタグの差し替えと、直後への挿入）:
```tsx
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {selected !== null && (
              <FileHeader
                title={
                  selected.result.status === 'editable' && editingData !== null
                    ? titleOf(editingData)
                    : (selected.result.title ?? '')
                }
                fileName={selected.name}
                typeLabel={selectedModule?.displayName ?? null}
                editable={selected.result.status === 'editable' && editingData !== null}
                onTitleChange={(next) => {
                  if (editingData === null || selectedModule === undefined) return
                  const updated = withTitle(editingData, next)
                  // エディタの onChange と同じ2本立て。**片方だけにしないこと**
                  //（record が無いと Undo が効かず、applyEdit が無いと保存されない）
                  setHistory((h) =>
                    h === null ? h : record(h, updated, 'title', Date.now()),
                  )
                  controller.applyEdit(selected.path, selectedModule, updated)
                }}
              />
            )}
            <div className="min-h-0 flex-1 overflow-auto">
```

そして `</section>` の直前に `</div>` を1つ足して、この新しい `<div>` を閉じる（`src/App.tsx:660` 付近、`<selectedModule.Editor ... />` の閉じの後）。

`mergeKey` に `'title'` を渡しているので、連続入力は1つの Undo にまとまる。

- [ ] **Step 5: 用語集エディタの `<h2>` を消す**

`src/modules/glossary/GlossaryEditor.tsx:212` の行を削除する。

```tsx
      <h2 className="mb-3 text-base font-bold text-ink">{data.title}</h2>
```

- [ ] **Step 6: エラーカタログエディタの `<h2>` を消す**

`src/modules/error-catalog/ErrorCatalogEditor.tsx:311` の同じ行を削除する。

- [ ] **Step 7: 全体を検証する**

Run: `npm test`
Expected: PASS（全件）

Run: `npx tsc -b`
Expected: エラー無し

Run: `npm run lint`
Expected: エラー無し

（両エディタとも `data.title` はプロパティ参照で、`data` prop 自体は他でも使うため、`<h2>` を消しても未使用の変数は生じない）

- [ ] **Step 8: コミット**

```bash
git add src/App.tsx src/modules/glossary/GlossaryEditor.tsx src/modules/error-catalog/ErrorCatalogEditor.tsx
git commit -m "$(cat <<'EOF'
feat(core): 額縁に名前の帯を配線し、エディタの見出しを一本化する

帯の onTitleChange はエディタの onChange と同じ record + applyEdit の
2本立て。mergeKey は 'title' 固定で連続入力を1履歴にまとめる。
用語集・エラーカタログの h2 は帯に寄せて削除した。

appRegistry.list() を JSX から巻き上げた——毎レンダーで新しい配列が返り、
groups の useMemo が毎回作り直しになるため。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 実機確認

**Files:** なし（確認のみ。`sample-project/` の変更はコミットしない）

- [ ] **Step 1: アプリを起動する**

Run: `npm run tauri dev`

- [ ] **Step 2: 一覧の見出しとソートを確認する**

`sample-project/` を開き、次を確かめる。

1. 用語集が「用語集」の見出しの下に出る
2. 「＋ シーケンスを新規作成」を3回押し、3本とも「シーケンス」の見出しの下に並ぶ
3. 見出しの順が新規作成ボタンの並び順と一致する

- [ ] **Step 3: 名前をつける動作を確認する**

1. シーケンスを1つ選び、帯の入力欄に「受注フロー」と打つ
2. **一覧の行の主表示がその場で「受注フロー」に変わる**（Task 1 の修正がここで効く）
3. 別のシーケンスに「返品フロー」、もう1つに「問合せフロー」と打つ
4. 3本が五十音順（受注 → 返品 → 問合せ）に並ぶ
5. 「元に戻す」を押すと、打った文字列がまとめて1回で戻る（`mergeKey: 'title'`）
6. 名前を全部消すと一覧に `(無題)` が出る
7. フォルダを開き直しても名前が残っている（ディスクに保存されている）

- [ ] **Step 4: 開けないファイルを確認する**

`sample-project/` に壊れた JSON（例 `{ "type": "sequence", "schemaVersion": 1, "title": "壊れたやつ" }`——`actors` と `steps` が無いのでスキーマ検証に落ちる）を外から置き、フォルダを開き直す。

1. 「シーケンス」の見出しの下に「壊れたやつ」として出る（title は読める）
2. 選ぶと帯が**読み取り専用**になっている（打っても何も起きない）

確認後、`sample-project/` は元に戻す:

```bash
git checkout -- sample-project/ && git clean -fd sample-project/
git status --short   # 空になること
```

- [ ] **Step 5: 見つかった不具合を直す**

直した場合はここでコミットする。無ければこのステップは飛ばす。

---

### Task 8: マイルストーン完了処理（CLAUDE.md の義務）

**Files:**
- Create: `docs/history/m13-core-file-titles-and-list-grouping.md`
- Modify: `docs/open-issues.md`
- Modify: `docs/overview-rev.md`
- Modify: `docs/README.md`（履歴の表に M13 の行を足す）

- [ ] **Step 1: 申し送りを書く**

`docs/history/m13-core-file-titles-and-list-grouping.md` を新規作成し、次を書く（**書いた後は変えない**）。

- 実装で確定した事項: 名前の実体は `title` でファイル名は変えないこと、その判断根拠（リネームは Claude を壊さないが、実装コストが桁で違い、外部リネームで乖離する）
- 見つかった欠陥: `applyEdit` が `result.title` を更新していなかったこと（Task 1）
- 実機確認の結果（Task 7 で観察したこと）

- [ ] **Step 2: `open-issues.md` を更新する**

「テストが無い箇所」に追記する:

```markdown
- **額縁の帯の `onTitleChange` が `record` と `applyEdit` の両方を呼ぶことを、どのテストも見ていない**（`src/App.tsx`）: `App` に配線レベルのテストが1件も無いという既存の穴（同節の M4 の項）と同じ性質だが、**これは M13 の中心の配線**で、`record` が落ちると Undo が効かず、`applyEdit` が落ちると保存されない。どちらも型では検出できない。`FileHeader` 単体テストは `onTitleChange` が呼ばれることまでしか見ない `[M13]`
```

- [ ] **Step 3: `overview-rev.md` に反映する**

額縁の責務を書いている箇所（6章）に、**選択中ファイルの `title` の編集**が額縁の仕事であることを書く。あわせて次を書く。

- 一覧の行は主が `title`、副がファイル名（ファイル名は識別子ではないので、大きく出すのは人間がつけた名前の方）
- 一覧は種類ごとにまとめ、見出しの順はレジストリの登録順、グループ内は `title` の五十音順
- モジュールのエディタは `title` を描かない（額縁が持つ）

**TODO として申し送りに残さず、この完了コミットで済ませること**（M4 の教訓）。

- [ ] **Step 4: `docs/README.md` の履歴の表に行を足す**

```markdown
| [M13](history/m13-core-file-titles-and-list-grouping.md) | ファイルの名前と一覧の種類別ソート | コア |
```

- [ ] **Step 5: 最終検証**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑

Run: `git status --short`
Expected: `sample-project/` の変更が残っていないこと

- [ ] **Step 6: コミット**

```bash
git add docs/
git commit -m "$(cat <<'EOF'
docs(m13): 申し送り・残件・rev への反映

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```
