# プロジェクトの登録と切り替え 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 登録済みプロジェクトを名前で選んで切り替えられるようにし、ヘッダ左の枠をその入口にする。

**Architecture:** `settings.json` に `projects` 配列を足す。型・正規化・並び順は `src/core/projects.ts` の純関数が持ち、往復は `src/fs/settings-fs.ts`、UI は `ProjectMenu` が持つ。切り替えの後始末は既存の `switchFolder` に合流させ、新しい経路を作らない。

**Tech Stack:** TypeScript / React / Radix（`src/components/ui/dropdown-menu.tsx`, `src/components/ui/dialog.tsx`）/ Tauri 2 / Vitest

**Spec:** `docs/superpowers/specs/2026-09-13-m37-project-registry-design.md`

## Global Constraints

- 文書は現在形で書く。経緯・マイルストーン番号・日付・「消した／足した」の記録を書かない
- コメントは「いまの値・構造の理由」と「踏むと壊れる罠」を現在形で書く。罠は「X を条件にすると Y を取り逃がす」の形で書く
- テストの名前は番号ではなく、守っている性質を書く
- 1項目は2文まで。太字は1段落に1箇所まで。全角括弧の入れ子を作らない
- コアは Tauri を知らない。`src/core/` から `@tauri-apps/*` を import しない
- Rust 側に判断を置かない。対象パスは TypeScript が決めて渡す
- 計画の指示が矛盾していたら辻褄を合わせず「計画の矛盾」として報告する
- 各タスクの最後に `npm test && npx tsc -b && npm run lint` を通す。Rust を触ったタスクは `(cd src-tauri && cargo test)` も通す

---

## File Structure

| ファイル | 責務 |
| --- | --- |
| `src/core/projects.ts`（新規） | 登録の型・正規化・並び順・表示名の既定。Tauri もファイルも知らない |
| `src/core/projects.test.ts`（新規） | 上の純関数のユニットテスト |
| `src/fs/settings-fs.ts`（変更） | `readProjects` / `saveProjects` と `lastProjectDir` からの移行 |
| `src-tauri/src/lib.rs`（変更） | `dirs_exist` コマンド |
| `src/fs/project-fs.ts`（変更） | `dirsExist` の薄い口 |
| `src/components/ProjectMenu.tsx`（新規） | 切り替え・お気に入り・省略記号メニュー |
| `src/components/RenameProjectDialog.tsx`（新規） | 表示名の変更 |
| `src/App.tsx`（変更） | 状態の保持・保存・起動時復元・ヘッダの差し替え |
| `src/components/settings/GeneralSettings.tsx`（変更） | 版番号の表示 |

---

## Task 1: 登録の値（`src/core/projects.ts`）

**Files:**
- Create: `src/core/projects.ts`
- Test: `src/core/projects.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `RegisteredProject`（`{ path: string; name: string; favorite: boolean; lastOpenedAt: string }`）、`normalizeProjects(raw: unknown): RegisteredProject[]`、`sortProjects(projects: readonly RegisteredProject[]): RegisteredProject[]`、`folderName(path: string): string`、`touchProject(projects: readonly RegisteredProject[], path: string, now: string): RegisteredProject[]`、`duplicatedNames(projects: readonly RegisteredProject[]): ReadonlySet<string>`、`canonicalPath(path: string): string`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/projects.test.ts` を作る。

```ts
import { describe, expect, it } from 'vitest'
import {
  duplicatedNames,
  folderName,
  normalizeProjects,
  sortProjects,
  touchProject,
  type RegisteredProject,
} from './projects'

const EPOCH = '1970-01-01T00:00:00.000Z'

const project = (over: Partial<RegisteredProject> = {}): RegisteredProject => ({
  path: 'C:\\work\\a',
  name: 'a',
  favorite: false,
  lastOpenedAt: EPOCH,
  ...over,
})

describe('folderName', () => {
  it('Windows の区切りで末尾を取る', () => {
    expect(folderName('C:\\work\\juchu')).toBe('juchu')
  })

  it('POSIX の区切りで末尾を取る', () => {
    expect(folderName('/home/me/juchu')).toBe('juchu')
  })

  it('末尾に区切りが付いていても末尾の名前を取る', () => {
    expect(folderName('/home/me/juchu/')).toBe('juchu')
    expect(folderName('C:\\work\\juchu\\')).toBe('juchu')
  })

  it('区切りを含まない入力はそのまま返す', () => {
    expect(folderName('juchu')).toBe('juchu')
  })
})

describe('normalizeProjects', () => {
  it('配列でない入力は空配列', () => {
    expect(normalizeProjects(null)).toEqual([])
    expect(normalizeProjects({ path: 'C:\\work\\a' })).toEqual([])
    expect(normalizeProjects('C:\\work\\a')).toEqual([])
  })

  it('path が空文字列の要素を落とす', () => {
    // 空パスは allow_project_dir で fs の実行時 scope をルート全体へ広げる
    expect(normalizeProjects([{ path: '', name: 'a' }])).toEqual([])
  })

  it('path が文字列でない要素を落とす', () => {
    expect(normalizeProjects([{ path: 3 }, { name: 'a' }, null, 'x'])).toEqual([])
  })

  it('name が無ければフォルダ名で埋める', () => {
    expect(normalizeProjects([{ path: 'C:\\work\\juchu' }])).toEqual([
      { path: 'C:\\work\\juchu', name: 'juchu', favorite: false, lastOpenedAt: EPOCH },
    ])
  })

  it('name が空文字列でもフォルダ名で埋める', () => {
    expect(normalizeProjects([{ path: '/home/me/zaiko', name: '' }])[0].name).toBe('zaiko')
  })

  it('favorite と lastOpenedAt の型違いを既定で埋める', () => {
    const [only] = normalizeProjects([
      { path: 'C:\\work\\a', name: 'a', favorite: 'yes', lastOpenedAt: 5 },
    ])
    expect(only.favorite).toBe(false)
    expect(only.lastOpenedAt).toBe(EPOCH)
  })

  it('path が重なる要素は先に現れた方を残す', () => {
    const got = normalizeProjects([
      { path: 'C:\\work\\a', name: '先' },
      { path: 'C:\\work\\a', name: '後' },
    ])
    expect(got.map((p) => p.name)).toEqual(['先'])
  })

  it('末尾の区切りを落として同一性を揃える', () => {
    const got = normalizeProjects([
      { path: 'C:\\work\\a\\', name: '先' },
      { path: 'C:\\work\\a', name: '後' },
    ])
    expect(got).toEqual([
      { path: 'C:\\work\\a', name: '先', favorite: false, lastOpenedAt: EPOCH },
    ])
  })
})

describe('sortProjects', () => {
  it('お気に入りを先に置き、どちらの群も最終オープンの降順にする', () => {
    const got = sortProjects([
      project({ path: 'p1', name: '普通の古い', lastOpenedAt: '2026-01-01T00:00:00.000Z' }),
      project({ path: 'p2', name: 'お気に入りの古い', favorite: true, lastOpenedAt: '2026-01-02T00:00:00.000Z' }),
      project({ path: 'p3', name: '普通の新しい', lastOpenedAt: '2026-03-01T00:00:00.000Z' }),
      project({ path: 'p4', name: 'お気に入りの新しい', favorite: true, lastOpenedAt: '2026-03-02T00:00:00.000Z' }),
    ])
    expect(got.map((p) => p.name)).toEqual([
      'お気に入りの新しい',
      'お気に入りの古い',
      '普通の新しい',
      '普通の古い',
    ])
  })

  it('入力の配列を書き換えない', () => {
    const input = [
      project({ path: 'p1', lastOpenedAt: '2026-01-01T00:00:00.000Z' }),
      project({ path: 'p2', lastOpenedAt: '2026-03-01T00:00:00.000Z' }),
    ]
    sortProjects(input)
    expect(input.map((p) => p.path)).toEqual(['p1', 'p2'])
  })
})

describe('touchProject', () => {
  const NOW = '2026-05-05T00:00:00.000Z'

  it('登録済みのパスは最終オープンだけを更新する', () => {
    const got = touchProject(
      [project({ path: 'C:\\work\\a', name: '手で付けた名前', favorite: true })],
      'C:\\work\\a',
      NOW,
    )
    expect(got).toEqual([
      { path: 'C:\\work\\a', name: '手で付けた名前', favorite: true, lastOpenedAt: NOW },
    ])
  })

  it('未登録のパスはフォルダ名を表示名として足す', () => {
    const got = touchProject([], 'C:\\work\\juchu', NOW)
    expect(got).toEqual([
      { path: 'C:\\work\\juchu', name: 'juchu', favorite: false, lastOpenedAt: NOW },
    ])
  })

  it('末尾に区切りが付いたパスを別の登録として足さない', () => {
    const got = touchProject([project({ path: 'C:\\work\\a' })], 'C:\\work\\a\\', NOW)
    expect(got).toHaveLength(1)
    expect(got[0].lastOpenedAt).toBe(NOW)
  })
})

describe('duplicatedNames', () => {
  it('2件以上が同じ表示名を持つときだけその名前を返す', () => {
    const got = duplicatedNames([
      project({ path: 'p1', name: '検証用' }),
      project({ path: 'p2', name: '検証用' }),
      project({ path: 'p3', name: '受注' }),
    ])
    expect([...got]).toEqual(['検証用'])
  })

  it('重なりが無ければ空', () => {
    expect(duplicatedNames([project({ path: 'p1', name: 'a' })]).size).toBe(0)
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/core/projects.test.ts`
Expected: FAIL（`Failed to resolve import "./projects"`）

- [ ] **Step 3: 実装する**

`src/core/projects.ts` を作る。

```ts
/**
 * 開いたプロジェクトフォルダの登録。
 *
 * **ファイルもストアも知らない。** 往復は `src/fs/settings-fs.ts` が持つ
 * （コアは Tauri を知らないという分担）。
 *
 * **`AppSettings` に入れない。** 同じ `settings.json` に載るが、設定画面で
 * 選ぶ値ではなく開いたフォルダの記録である
 */

export interface RegisteredProject {
  /** 同一性の鍵。末尾の区切りを落とした形で持つ */
  path: string
  /** 表示名。既定は開いたフォルダの名前で、利用者が変えられる */
  name: string
  favorite: boolean
  /** ISO8601 */
  lastOpenedAt: string
}

const EPOCH = '1970-01-01T00:00:00.000Z'

/**
 * 末尾の区切りを落とす。**同一性の鍵を作る唯一の口。**
 * フォルダ選択ダイアログが返すパスと手で直した設定ファイルの値で末尾が
 * 揃わないため、比較の前に必ずここを通す。
 *
 * **区切りを1文字だけ落とす。** ルート（`/` や `C:\`）を空文字列に潰すと、
 * `allow_project_dir` が空パスを受け取る経路ができる
 */
export function canonicalPath(path: string): string {
  return path.length > 1 && (path.endsWith('/') || path.endsWith('\\'))
    ? path.slice(0, -1)
    : path
}

/**
 * パスの末尾の名前。`/` と `\` の両方を区切りとして見る——Windows のパスだけで
 * 確かめると、POSIX の区切りを取り逃がす
 */
export function folderName(path: string): string {
  const trimmed = canonicalPath(path)
  const at = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return at === -1 ? trimmed : trimmed.slice(at + 1)
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/**
 * 読み込んだ JSON を登録の一覧に均す。**壊れていても投げない**——設定が
 * 読めないことは起動を止める理由にならない。
 *
 * **`path` が空文字列の要素は必ず落とす。** 素通しすると
 * `allowProjectDir("")` に届き、tauri-2.11.5 の scope 実装は空パスに
 * `MAIN_SEPARATOR + "**"` を足すため、unix では fs の実行時 scope が
 * ファイルシステム全体へ広がる
 */
export function normalizeProjects(raw: unknown): RegisteredProject[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const projects: RegisteredProject[] = []
  for (const item of raw) {
    const source = asRecord(item)
    if (typeof source.path !== 'string' || source.path === '') continue
    const path = canonicalPath(source.path)
    if (path === '' || seen.has(path)) continue
    seen.add(path)
    projects.push({
      path,
      name: typeof source.name === 'string' && source.name !== '' ? source.name : folderName(path),
      favorite: source.favorite === true,
      lastOpenedAt: typeof source.lastOpenedAt === 'string' ? source.lastOpenedAt : EPOCH,
    })
  }
  return projects
}

/** お気に入りを先に置き、どちらの群も最終オープンの降順にする */
export function sortProjects(projects: readonly RegisteredProject[]): RegisteredProject[] {
  return [...projects].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
    return b.lastOpenedAt.localeCompare(a.lastOpenedAt)
  })
}

/**
 * 開いたことを記録する。登録済みなら最終オープンだけを更新し、未登録なら
 * フォルダ名を表示名として足す。**並べ替えはしない**——並び順は
 * `sortProjects` が描画の直前に決める
 */
export function touchProject(
  projects: readonly RegisteredProject[],
  path: string,
  now: string,
): RegisteredProject[] {
  const key = canonicalPath(path)
  if (projects.some((p) => p.path === key)) {
    return projects.map((p) => (p.path === key ? { ...p, lastOpenedAt: now } : p))
  }
  return [...projects, { path: key, name: folderName(key), favorite: false, lastOpenedAt: now }]
}

/**
 * 2件以上が持っている表示名。同じ名前を許す代わりに、重なった行にだけ
 * パスを添えて見分けられるようにする
 */
export function duplicatedNames(projects: readonly RegisteredProject[]): ReadonlySet<string> {
  const count = new Map<string, number>()
  for (const p of projects) count.set(p.name, (count.get(p.name) ?? 0) + 1)
  return new Set([...count].filter(([, n]) => n > 1).map(([name]) => name))
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/core/projects.test.ts`
Expected: PASS

- [ ] **Step 5: 壊して赤くなることを確かめる**

`normalizeProjects` の `source.path === ''` の判定を一時的に外し、`npx vitest run src/core/projects.test.ts` が「path が空文字列の要素を落とす」で落ちることを確認してから戻す。出力を PR 本文に貼る。

- [ ] **Step 6: 検証して commit**

```bash
npm test && npx tsc -b && npm run lint
git add src/core/projects.ts src/core/projects.test.ts
git commit -m "feat(m37): プロジェクトの登録の型と正規化を置く"
```

---

## Task 2: 保存と移行（`src/fs/settings-fs.ts`）

**Files:**
- Modify: `src/fs/settings-fs.ts`
- Test: `src/fs/settings-fs.test.ts`

**Interfaces:**
- Consumes: Task 1 の `normalizeProjects`, `folderName`, `RegisteredProject`
- Produces: `readProjects(): Promise<RegisteredProject[]>`、`saveProjects(projects: readonly RegisteredProject[]): Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**

`src/fs/settings-fs.test.ts` の動的 import に2本足す。

```ts
const { readLastProjectDir, saveLastProjectDir, readSettings, saveSettings, readProjects, saveProjects } =
  await import('./settings-fs')
```

ファイル末尾に足す。

```ts
describe('readProjects', () => {
  it('保存済みの一覧を正規化して返す', async () => {
    readTextFileMock.mockResolvedValue(
      '{"projects":[{"path":"C:\\\\work\\\\a","name":"受注","favorite":true,"lastOpenedAt":"2026-03-01T00:00:00.000Z"}]}',
    )
    await expect(readProjects()).resolves.toEqual([
      { path: 'C:\\work\\a', name: '受注', favorite: true, lastOpenedAt: '2026-03-01T00:00:00.000Z' },
    ])
  })

  it('ファイルが無ければ空（例外を投げない）', async () => {
    readTextFileMock.mockRejectedValue(new Error('not found'))
    await expect(readProjects()).resolves.toEqual([])
  })

  it('JSON が壊れていても空（例外を投げない）', async () => {
    readTextFileMock.mockResolvedValue('{not json')
    await expect(readProjects()).resolves.toEqual([])
  })

  it('projects が無ければ lastProjectDir を1件目として取り込む', async () => {
    readTextFileMock.mockResolvedValue('{"lastProjectDir":"C:\\\\work\\\\juchu"}')
    await expect(readProjects()).resolves.toEqual([
      {
        path: 'C:\\work\\juchu',
        name: 'juchu',
        favorite: false,
        lastOpenedAt: '1970-01-01T00:00:00.000Z',
      },
    ])
  })

  it('projects があれば lastProjectDir を見ない', async () => {
    readTextFileMock.mockResolvedValue(
      '{"projects":[{"path":"C:\\\\work\\\\a"}],"lastProjectDir":"C:\\\\work\\\\old"}',
    )
    const got = await readProjects()
    expect(got.map((p) => p.path)).toEqual(['C:\\work\\a'])
  })

  it('projects が空配列なら lastProjectDir を見ない', async () => {
    // 全部を一覧から外した状態を、移行前と取り違えない
    readTextFileMock.mockResolvedValue('{"projects":[],"lastProjectDir":"C:\\\\work\\\\old"}')
    await expect(readProjects()).resolves.toEqual([])
  })

  it('lastProjectDir が空文字列なら取り込まない', async () => {
    readTextFileMock.mockResolvedValue('{"lastProjectDir":""}')
    await expect(readProjects()).resolves.toEqual([])
  })
})

describe('saveProjects', () => {
  it('設定を保ったまま書く', async () => {
    existsMock.mockResolvedValue(true)
    readTextFileMock.mockResolvedValue('{"theme":"dark","canvas":{"panWithRightDrag":true}}')
    await saveProjects([
      { path: 'C:\\work\\a', name: '受注', favorite: false, lastOpenedAt: '2026-03-01T00:00:00.000Z' },
    ])
    expect(JSON.parse(writeTextFileMock.mock.calls[0][1] as string)).toEqual({
      theme: 'dark',
      canvas: { panWithRightDrag: true },
      projects: [
        { path: 'C:\\work\\a', name: '受注', favorite: false, lastOpenedAt: '2026-03-01T00:00:00.000Z' },
      ],
    })
  })

  it('設定を書いても projects が残る', async () => {
    existsMock.mockResolvedValue(true)
    readTextFileMock.mockResolvedValue('{"projects":[{"path":"C:\\\\work\\\\a"}]}')
    await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' })
    const written = JSON.parse(writeTextFileMock.mock.calls[0][1] as string) as Record<string, unknown>
    expect(written.projects).toEqual([{ path: 'C:\\work\\a' }])
  })

  it('設定ディレクトリが無ければ作ってから書き込む', async () => {
    existsMock.mockResolvedValue(false)
    await saveProjects([])
    expect(mkdirMock).toHaveBeenCalledWith('C:\\config', { recursive: true })
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/fs/settings-fs.test.ts`
Expected: FAIL（`readProjects is not a function`）

- [ ] **Step 3: 実装する**

`src/fs/settings-fs.ts` の import に足す。

```ts
import { normalizeProjects, folderName, type RegisteredProject } from '@/core/projects'
```

ファイル末尾に足す。

```ts
/**
 * 登録済みプロジェクトを読む。読めない・壊れているのいずれでも空配列を返し、
 * 例外を投げない。
 *
 * **`projects` キーが無いときだけ `lastProjectDir` を取り込む。**
 * 空配列を「まだ移行していない」と読むと、全部を一覧から外した利用者に
 * 消したはずの1件が毎回戻る
 */
export async function readProjects(): Promise<RegisteredProject[]> {
  const parsed = await readFile()
  if (parsed.projects !== undefined) return normalizeProjects(parsed.projects)
  const dir = parsed.lastProjectDir
  if (typeof dir !== 'string' || dir === '') return []
  return normalizeProjects([{ path: dir, name: folderName(dir) }])
}

/** 登録済みプロジェクトを保存する。`theme` と `canvas` は触らない */
export async function saveProjects(projects: readonly RegisteredProject[]): Promise<void> {
  await writeMerged({ projects: [...projects] })
}
```

`writeMerged` の JSDoc の「`lastProjectDir`（起動時の復元）と設定は書き手が別」を「登録済みプロジェクトと設定は書き手が別」に置き換える。

`saveLastProjectDir` はこのタスクでは残す。Task 6 で呼び出し元を外してから消す。

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/fs/settings-fs.test.ts`
Expected: PASS

- [ ] **Step 5: 検証して commit**

```bash
npm test && npx tsc -b && npm run lint
git add src/fs/settings-fs.ts src/fs/settings-fs.test.ts
git commit -m "feat(m37): 登録済みプロジェクトの読み書きと移行を置く"
```

---

## Task 3: 存在確認（`dirs_exist`）

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/fs/project-fs.ts`
- Test: `src/fs/project-fs.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `dirsExist(paths: readonly string[]): Promise<boolean[]>`（入力と同じ長さ・同じ順序で返る）

**なぜ自前コマンドか:** `fileExists` は fs プラグインの `exists` で、実行時 scope の中しか見えない。開いていないフォルダの存在を確かめるために `allowProjectDir` を全件へ掛けると、開いてもいないフォルダへ fs の実行時 scope が広がる。自前コマンドは ACL の対象外で、できるのは存在の確認だけになる。

- [ ] **Step 1: 失敗するテストを書く**

`src/fs/project-fs.test.ts` の動的 import に `dirsExist` を足し、`allowProjectDir` の describe の後ろに足す。

```ts
describe('dirsExist', () => {
  it('自前コマンド dirs_exist に paths を渡す', async () => {
    invoke.mockResolvedValue([true, false])
    await expect(dirsExist(['C:\a', 'C:\b'])).resolves.toEqual([true, false])
    expect(invoke).toHaveBeenCalledWith('dirs_exist', { paths: ['C:\a', 'C:\b'] })
  })

  it('空の入力ではコマンドを呼ばない', async () => {
    await expect(dirsExist([])).resolves.toEqual([])
    expect(invoke).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/fs/project-fs.test.ts`
Expected: FAIL（`dirsExist is not a function`）

- [ ] **Step 3: Rust のコマンドを書く**

`src-tauri/src/lib.rs` の `read_clipboard_html` の後ろに足す。

```rust
/// 渡したパスのそれぞれについて、フォルダとして存在するかを返す。
///
/// fs プラグインの `exists` は実行時 scope の中しか見えず、登録済み
/// プロジェクトの一覧を確かめるには全件へ `allow_project_dir` を掛けることに
/// なる。**開いてもいないフォルダへ fs の実行時 scope を広げないため**に
/// ここを通す。できるのは存在の確認だけで、読み書きの経路は開かない。
///
/// **ワーカースレッドで実行する。** Tauri v2 は `async` でないコマンドを
/// メインスレッド上で実行するため、ネットワークドライブ上のパスを含むと
/// 一覧を開いた瞬間にウィンドウが固まる。判断は一切置かない（rev 7章）
#[tauri::command]
async fn dirs_exist(paths: Vec<String>) -> Result<Vec<bool>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .map(|path| std::path::Path::new(path).is_dir())
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}
```

`invoke_handler` の `generate_handler!` に `dirs_exist,` を足す（`read_clipboard_html,` の後ろ）。

- [ ] **Step 4: TypeScript の口を書く**

`src/fs/project-fs.ts` の `allowProjectDir` の後ろに足す。

```ts
/**
 * 渡したパスのそれぞれがフォルダとして存在するか。入力と同じ長さ・同じ順序で返る。
 *
 * **`fileExists` で代用しないこと。** あちらは fs プラグインの `exists` で
 * 実行時 scope の中しか見えず、登録済みの全件を確かめるには開いてもいない
 * フォルダへ scope を広げることになる
 */
export async function dirsExist(paths: readonly string[]): Promise<boolean[]> {
  if (paths.length === 0) return []
  return invoke('dirs_exist', { paths: [...paths] })
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npx vitest run src/fs/project-fs.test.ts`
Expected: PASS

- [ ] **Step 6: 検証して commit**

```
npm test && npx tsc -b && npm run lint
```
```
cd src-tauri && cargo test && cargo clippy -- -D warnings
```
```
git add src-tauri/src/lib.rs src/fs/project-fs.ts src/fs/project-fs.test.ts
git commit -m "feat(m37): scope を広げずにフォルダの存在を確かめる口を置く"
```

---

## Task 4: `ProjectMenu`

**Files:**
- Create: `src/components/ProjectMenu.tsx`
- Test: `src/components/ProjectMenu.dom.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `RegisteredProject`, `sortProjects`, `duplicatedNames`
- Produces:

```ts
export interface ProjectMenuProps {
  projects: readonly RegisteredProject[]
  /** いま開いているプロジェクトのパス。未選択なら null */
  activePath: string | null
  /** 存在しないと分かっているパス。中身は親が持つ */
  missing: ReadonlySet<string>
  /** メニューが開いた瞬間に1回だけ呼ぶ。親が dirsExist を叩いて missing を作る */
  onCheckMissing: () => void
  onSwitch: (project: RegisteredProject) => void
  onAdd: () => void
  onToggleFavorite: (project: RegisteredProject) => void
  onRename: (project: RegisteredProject) => void
  onRemove: (project: RegisteredProject) => void
  /** 見つからない登録のパスを選び直す */
  onRelocate: (project: RegisteredProject) => void
}
```

**画面に出る文言はここが正:**

| 場所 | 文言 |
| --- | --- |
| 1件も登録が無いときのトリガー | `プロジェクトを追加` |
| メニュー末尾の項目 | `プロジェクトを追加` |
| 省略記号のボタンの `aria-label` | `<表示名> の操作` |
| 省略記号の中身 | `プロジェクト名を変更` と `一覧から外す` |
| お気に入りのボタンの `aria-label` | `<表示名> をお気に入りにする` と `<表示名> のお気に入りを外す` |
| 見つからない行に添える文 | `見つからない — 押して選び直す` |

- [ ] **Step 1: Radix の構造を実物で確かめる**

この部品は1行の中に「行そのもの」「お気に入り」「省略記号のサブメニュー」の3つを並べる。`DropdownMenuContent` の直下でない要素をメニュー項目として扱うか、`DropdownMenuSub` を行を包む要素の中に置けるかは、計画の時点で未検証である。

最小の部品を `src/components/ProjectMenu.tsx` に書き、DOM テストで次の2点だけを確かめる。

1. 行を包む `<div>` の中に置いた `DropdownMenuItem` が `role="menuitem"` として引ける
2. 行の中の `DropdownMenuSubTrigger` を押すと `DropdownMenuSubContent` の項目が引ける

開く操作は `src/components/ExportMenu.dom.test.tsx:88` と同じ形を使う。

```ts
fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
const item = await screen.findByRole('menuitem', { name: '受注管理' })
```

**サブメニューが jsdom で開かないと分かったら、そこで止めて「計画の前提が外れた」と報告する。** 代案は省略記号を押したときにメニューの中身を2階層目へ差し替える形だが、選ぶのは実測の後にする。

- [ ] **Step 2: 性質のテストを書く**

`src/components/ProjectMenu.dom.test.tsx` を作る。Radix を操作する部分は Step 1 で確かめた形をそのまま使い、要素は role とアクセシブル名で引く。

見る性質は7つ。

1. お気に入りの行がその他の行より前に出る（`compareDocumentPosition` で見る）
2. お気に入りのボタンを押すと `onToggleFavorite` が呼ばれ、押した後も一覧の項目が引ける
3. 行を押すと `onSwitch` がその登録で呼ばれる
4. `missing` に入っているパスの行が `見つからない — 押して選び直す` を持ち、押すと `onSwitch` ではなく `onRelocate` が呼ばれる
5. `activePath` と同じ行の省略記号メニューに `一覧から外す` が出ない
6. 表示名が重なっている行にだけパスが出る。重なっていない行には出ない
7. 登録が空のときトリガーのアクセシブル名が `プロジェクトを追加` で、押すと `onAdd` が呼ばれる

- [ ] **Step 3: 落ちることを確かめる**

Run: `npx vitest run src/components/ProjectMenu.dom.test.tsx`
Expected: FAIL

- [ ] **Step 4: 実装する**

行を `<div>` で包み、その中に3つのメニュー項目を並べる。3つとも Radix の項目にすることで矢印キーが届く。

```tsx
<DropdownMenuSub key={project.path}>
  <div className="group flex items-center">
    <DropdownMenuItem className="min-w-0 flex-1" onSelect={() => pick(project)}>
      …表示名と、重なっているときのパス…
    </DropdownMenuItem>
    <DropdownMenuItem
      aria-label={favoriteLabel(project)}
      onSelect={(event) => {
        event.preventDefault()
        onToggleFavorite(project)
      }}
    >
      <Star aria-hidden className="size-4" />
    </DropdownMenuItem>
    <DropdownMenuSubTrigger aria-label={`${project.name} の操作`}>
      <MoreHorizontal aria-hidden className="size-4" />
    </DropdownMenuSubTrigger>
  </div>
  <DropdownMenuSubContent>…</DropdownMenuSubContent>
</DropdownMenuSub>
```

守る点を4つコメントに書く。

- **`onSelect` で `preventDefault` を呼ばないとメニューが閉じる。** お気に入りは続けて別の行を触れることが要点なので、ここだけ既定を止める
- **ホバーで出す操作を `opacity-0 group-hover:opacity-100` だけで隠すと、キーボードで到達したとき見えない。** `focus-visible:opacity-100` を併せる
- **`onCheckMissing` は `onOpenChange` が true のときだけ呼ぶ。** 描画のたびに呼ぶと、一覧を開いていない間もコマンドが飛ぶ
- **お気に入りとその他を分ける区切りは、両方の群が空でないときだけ置く**

`pick` は `missing.has(project.path)` なら `onRelocate`、そうでなければ `onSwitch` を呼ぶ。`一覧から外す` は `project.path !== activePath` の行にだけ出す。

- [ ] **Step 5: 通ることを確かめる**

Run: `npx vitest run src/components/ProjectMenu.dom.test.tsx`
Expected: PASS

- [ ] **Step 6: 壊して赤くなることを確かめる**

`sortProjects` の呼び出しを外し、性質1のテストが落ちることを確認してから戻す。出力を PR 本文に貼る。

- [ ] **Step 7: 検証して commit**

```
npm test && npx tsc -b && npm run lint
```
```
git add src/components/ProjectMenu.tsx src/components/ProjectMenu.dom.test.tsx
git commit -m "feat(m37): プロジェクトの切り替えメニューを置く"
```

---

## Task 5: `RenameProjectDialog`

**Files:**
- Create: `src/components/RenameProjectDialog.tsx`
- Test: `src/components/RenameProjectDialog.dom.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `RegisteredProject`, `folderName`
- Produces:

```ts
export interface RenameProjectDialogProps {
  /** 対象。null の間は閉じている */
  project: RegisteredProject | null
  /** 確定した表示名を返す。空で確定したときはフォルダ名が入って届く */
  onSubmit: (project: RegisteredProject, name: string) => void
  onClose: () => void
}
```

**なぜメニューの中で編集しないか:** Radix の `DropdownMenu` は項目のキー入力を頭文字ジャンプに使うので、項目の中に `<input>` を置くと打った文字が入力欄と項目の移動の両方に取られる。`Esc` もメニューを閉じる側に先に効く。

**画面に出る文言はここが正:**

| 場所 | 文言 |
| --- | --- |
| `DialogTitle` | `プロジェクト名を変更` |
| 入力欄の `aria-label` | `プロジェクト名` |
| ボタン | `キャンセル` と `変更する` |

- [ ] **Step 1: 失敗するテストを書く**

`src/components/RenameProjectDialog.dom.test.tsx` を作る。土台は `src/components/ui/dialog.tsx` で、`SettingsDialog.dom.test.tsx` と同じ引き方をする。

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RegisteredProject } from '@/core/projects'
import { RenameProjectDialog } from './RenameProjectDialog'

afterEach(cleanup)

const target: RegisteredProject = {
  path: 'C:\work\juchu',
  name: '受注管理',
  favorite: false,
  lastOpenedAt: '2026-03-01T00:00:00.000Z',
}

describe('RenameProjectDialog', () => {
  it('対象が null なら開かない', () => {
    render(<RenameProjectDialog project={null} onSubmit={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('いまの表示名を入れた状態で開き、パスを読める', () => {
    render(<RenameProjectDialog project={target} onSubmit={vi.fn()} onClose={vi.fn()} />)
    expect((screen.getByLabelText('プロジェクト名') as HTMLInputElement).value).toBe('受注管理')
    expect(screen.getByText('C:\work\juchu')).toBeTruthy()
  })

  it('入れ替えた名前で確定する', () => {
    const onSubmit = vi.fn()
    render(<RenameProjectDialog project={target} onSubmit={onSubmit} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('プロジェクト名'), { target: { value: '受注リプレイス' } })
    fireEvent.click(screen.getByRole('button', { name: '変更する' }))
    expect(onSubmit).toHaveBeenCalledWith(target, '受注リプレイス')
  })

  it('空で確定するとフォルダ名に戻る', () => {
    const onSubmit = vi.fn()
    render(<RenameProjectDialog project={target} onSubmit={onSubmit} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('プロジェクト名'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '変更する' }))
    expect(onSubmit).toHaveBeenCalledWith(target, 'juchu')
  })

  it('キャンセルは名前を返さない', () => {
    const onSubmit = vi.fn()
    const onClose = vi.fn()
    render(<RenameProjectDialog project={target} onSubmit={onSubmit} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('プロジェクト名'), { target: { value: '別の名前' } })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('対象が差し替わると入力欄も差し替わる', () => {
    // 閉じずに別の行の改名を開いたとき、前の行の名前が残らない
    const { rerender } = render(
      <RenameProjectDialog project={target} onSubmit={vi.fn()} onClose={vi.fn()} />,
    )
    rerender(
      <RenameProjectDialog
        project={{ ...target, path: 'C:\work\zaiko', name: '在庫照会' }}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect((screen.getByLabelText('プロジェクト名') as HTMLInputElement).value).toBe('在庫照会')
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/components/RenameProjectDialog.dom.test.tsx`
Expected: FAIL（`Failed to resolve import "./RenameProjectDialog"`）

- [ ] **Step 3: 実装する**

`Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle`（`src/components/ui/dialog.tsx`）と `Button`（`src/components/ui/button.tsx`）で組む。

守る点を3つコメントに書く。

- **入力欄の初期値は `project.path` を鍵にした `key` で入れ直す。** `useState` の初期値だけに頼ると、閉じずに別の行の改名を開いたとき前の行の名前が残る
- **空白だけの入力はフォルダ名へ戻す。** 名前の無い行を作れないようにするためで、エラーを出すより手数が少ない
- **`Esc` とオーバーレイのクリックは `onClose` に落ちる。** `onOpenChange(false)` の経路は1本にする

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/components/RenameProjectDialog.dom.test.tsx`
Expected: PASS

- [ ] **Step 5: 検証して commit**

```
npm test && npx tsc -b && npm run lint
```
```
git add src/components/RenameProjectDialog.tsx src/components/RenameProjectDialog.dom.test.tsx
git commit -m "feat(m37): プロジェクト名を変えるダイアログを置く"
```

---

## Task 6: 結線（`src/App.tsx`）

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/fs/settings-fs.ts`（`saveLastProjectDir` を消す）
- Modify: `src/fs/settings-fs.test.ts`（消した関数のテストを `saveProjects` へ移す）
- Test: `src/App.dom.test.tsx`

**Interfaces:**
- Consumes: Task 1〜5 のすべて
- Produces: なし（画面の結線）

**このタスクが壊す既存のテスト:** `src/App.dom.test.tsx` は 29 箇所で `フォルダを開く` のボタンを押してフォルダを開いている。ボタンを消すので、全部をメニュー経由のヘルパーに移す。

- [ ] **Step 1: 既存テストの入口をヘルパーに寄せる**

`src/App.dom.test.tsx` の `openPane` の直前に足す。

```tsx
/**
 * フォルダを開く。**帯にボタンは無い**——プロジェクトのメニューを開いて
 * 「プロジェクトを追加」を押す1本の経路しかないので、テストもそこを通す。
 * 開く操作は Radix の作法に合わせて pointerDown で起こす（ExportMenu.dom.test.tsx と同じ）
 */
async function openProjectFolder() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'プロジェクトを追加' }), {
    button: 0,
    ctrlKey: false,
  })
  fireEvent.click(await screen.findByRole('menuitem', { name: 'プロジェクトを追加' }))
}
```

`fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))` を全部 `await openProjectFolder()` に置き換える。囲っている `it` が `async` でなければ `async` にする。`openPane` の中の1箇所も同じ。

`src/App.dom.test.tsx:858` の `expect(screen.getByRole('button', { name: 'フォルダを開く' })).toBeTruthy()` は、額縁が描画されていることを見ている。`{ name: 'プロジェクトを追加' }` に差し替える。

置換後に残りが無いことを確かめる。

Run: `grep -c "フォルダを開く" src/App.dom.test.tsx`
Expected: `0`

- [ ] **Step 2: 起動時復元のテストを書き換える**

`src/App.dom.test.tsx` の `restoreConfig` を登録の一覧に変える。

```ts
restoreConfig: {
  projects: [] as RegisteredProject[],
  exists: false,
  allowError: null as Error | null,
},
```

`vi.mock('@/fs/settings-fs', …)` を差し替える。`readLastProjectDir` は App から呼ばれなくなるので外す。

```ts
vi.mock('@/fs/settings-fs', () => ({
  readProjects: async () => restoreConfig.projects,
  saveProjects: saveProjectsMock,
  readSettings: async () => settingsConfig.stored,
  saveSettings: saveSettingsMock,
}))
```

`saveLastProjectDirMock` を `saveProjectsMock` に改名する（`vi.hoisted` の中と `beforeEach` のリセットも）。`RegisteredProject` を `@/core/projects` から型として import する。

`describe('起動時のフォルダ復元')` の5本を、`restoreConfig.lastDir = '/restored'` から `restoreConfig.projects = [{ path: '/restored', name: 'restored', favorite: false, lastOpenedAt: '2026-03-01T00:00:00.000Z' }]` の形に書き換える。「保存済みパスが無ければ」は `projects: []` にする。

同じ describe に1本足す。

```ts
it('登録が複数あれば最終オープンが最も新しいものを開く', async () => {
  restoreConfig.projects = [
    { path: '/old', name: 'old', favorite: true, lastOpenedAt: '2026-01-01T00:00:00.000Z' },
    { path: '/new', name: 'new', favorite: false, lastOpenedAt: '2026-03-01T00:00:00.000Z' },
  ]
  restoreConfig.exists = true
  render(<App />)
  await waitFor(() => expect(screen.getByTitle('/new')).toBeTruthy())
  // お気に入りは並び順の都合であって、復元先を決める材料ではない
  expect(allowProjectDirCalls).toEqual(['/new'])
})
```

- [ ] **Step 3: 落ちることを確かめる**

Run: `npx vitest run src/App.dom.test.tsx`
Expected: FAIL（`プロジェクトを追加` のボタンが無い）

- [ ] **Step 4: 状態と保存を置く**

`src/App.tsx` に足す。`projectsRef` は `projectDirRef`（`src/App.tsx:375`）と同じ形にする。

```tsx
const [projects, setProjects] = useState<RegisteredProject[]>([])
const projectsRef = useRef(projects)
projectsRef.current = projects
const [missingProjects, setMissingProjects] = useState<ReadonlySet<string>>(new Set())
const [renameTarget, setRenameTarget] = useState<RegisteredProject | null>(null)

/**
 * 登録を差し替えて保存する。**保存に失敗してもトーストは出さない**——
 * 次回の起動で復元されないだけで、このセッションの作業には響かない
 */
const persistProjects = (next: readonly RegisteredProject[]) => {
  setProjects([...next])
  saveProjects(next).catch((err: unknown) => {
    console.error('プロジェクトの登録の保存に失敗しました', err)
  })
}
```

- [ ] **Step 5: 開く経路を差し替える**

`openProject`（`src/App.tsx:696`）の `saveLastProjectDir(dir)` の呼び出しを次に差し替える。

```tsx
persistProjects(touchProject(projectsRef.current, dir, new Date().toISOString()))
```

**`projectsRef` から読む。** `openProject` は毎レンダー作り直されるが、確認ダイアログの `onConfirm` に渡ると古いクロージャのまま後で走る。

`openFolder`（`src/App.tsx:799`）を2つに割る。`pickProjectFolder` を呼ぶ部分と、`hasRunning` を見て確認を挟む部分を分け、後者をメニューからの切り替えでも使う。

```tsx
/** フォルダ切替の唯一の入口。実行中のタブがあるときだけ確認を挟む */
const requestSwitch = async (dir: string) => {
  if (!hasRunning(terminals)) {
    await switchFolder(dir)
    return
  }
  setModals((prev) => pushModal(prev, /* 既存の openFolder が持つ confirm の
    引数をそのまま移す。kind・key・title・description・confirmLabel・onConfirm を
    1文字も変えない */))
}

const addProject = async () => {
  const dir = await pickProjectFolder()
  if (dir === null) return
  await requestSwitch(dir)
}

/**
 * 登録済みの行から切り替える。**`allowProjectDir` を先に呼ぶ**——
 * ダイアログを経由しない経路なので、fs の実行時 scope を取り直さないと
 * 走査が forbidden path で落ちる
 */
const switchToProject = async (project: RegisteredProject) => {
  try {
    await allowProjectDir(project.path)
  } catch (err: unknown) {
    console.error('fs scope の再付与に失敗しました', err)
    return
  }
  await requestSwitch(project.path)
}
```

- [ ] **Step 6: 起動時復元を登録から引く**

`src/App.tsx:745` の effect の中身を差し替える。

```tsx
const stored = await readProjects()
setProjects(stored)
const latest = stored.reduce<RegisteredProject | null>(
  (best, p) => (best === null || p.lastOpenedAt > best.lastOpenedAt ? p : best),
  null,
)
if (latest === null) return
await allowProjectDir(latest.path)
if (!(await fileExists(latest.path))) return
await openProject(latest.path)
```

**復元先はお気に入りを見ない。** お気に入りは一覧の並び順の都合で、最後に開いていたものとは別である。

一回性ガード（`hasAttemptedRestoreRef`）と、失敗を通常起動として握りつぶす扱いはそのまま残す。

- [ ] **Step 7: メニューの残りの操作を配線する**

```tsx
const checkMissingProjects = () => {
  const paths = projectsRef.current.map((p) => p.path)
  dirsExist(paths).then(
    (found) => setMissingProjects(new Set(paths.filter((_, i) => !found[i]))),
    (err: unknown) => console.error('プロジェクトの存在を確認できませんでした', err),
  )
}

/** 見つからない登録のパスを選び直す。表示名とお気に入りは保つ */
const relocateProject = async (project: RegisteredProject) => {
  const dir = await pickProjectFolder()
  if (dir === null) return
  persistProjects(
    projectsRef.current.map((p) => (p.path === project.path ? { ...p, path: dir } : p)),
  )
  await requestSwitch(dir)
}
```

`onToggleFavorite` は `favorite` を反転した配列を `persistProjects` に渡す。`onRemove` は `path` が一致しない要素だけを渡す。`onRename` は `setRenameTarget(project)`。

`RenameProjectDialog` の `onSubmit` は表示名を差し替えて `persistProjects` を呼び、`setRenameTarget(null)` する。

- [ ] **Step 8: ヘッダを差し替える**

`src/App.tsx:1089-1092` の `h1` と版番号を差し替える。

```tsx
<div className="-ml-6 flex w-64 shrink-0 items-center gap-2 pl-6">
  {/* **見出しを消さない。** 見える位置にはプロジェクト名が出るが、
      文書の見出しは `facet` のまま残す */}
  <h1 className="sr-only">facet</h1>
  <ProjectMenu … />
</div>
```

`src/App.tsx:1095` の `フォルダを開く` ボタンを削る。`appVersion` の state はそのまま残し、`SettingsDialog` に `appVersion={appVersion}` で渡す。

`RenameProjectDialog` は `SettingsDialog`（`src/App.tsx:1407`）の隣に置く。

`modalOpen`（`src/App.tsx:400`）の式に `renameTarget !== null` を足す。**開いている間は操作言語を止める**（rev 10章の境界規則）。`settingsOpen` と同じく、利用者が能動的に開く画面なのでモーダルキューには積まない。

同じ式を見るテストを `src/App.dom.test.tsx` に足す。改名ダイアログを開いている間、グローバル層の `Ctrl+Z` が効かないことを見る。

- [ ] **Step 9: `saveLastProjectDir` を消す**

`src/fs/settings-fs.ts` から `saveLastProjectDir` を消す。`readLastProjectDir` は `readProjects` の移行が使うので残す。

`src/fs/settings-fs.test.ts` の `describe('saveLastProjectDir')` を消し、`describe('書き込みは読んで merge する')` の中の `saveLastProjectDir` を使う2本を `saveProjects` で書き直す。

呼び出し元が残っていないことを確かめる。

Run: `grep -rn "saveLastProjectDir" src/`
Expected: 出力なし

- [ ] **Step 10: 通ることを確かめる**

Run: `npx vitest run src/App.dom.test.tsx src/fs/settings-fs.test.ts`
Expected: PASS

- [ ] **Step 11: 検証して commit**

```
npm test && npx tsc -b && npm run lint
```
```
git add src/App.tsx src/fs/settings-fs.ts src/fs/settings-fs.test.ts src/App.dom.test.tsx
git commit -m "feat(m37): ヘッダ左をプロジェクトの切り替え口にする"
```

---

## Task 7: 版番号を設定画面へ

**Files:**
- Modify: `src/components/settings/types.ts`
- Modify: `src/components/settings/GeneralSettings.tsx`
- Modify: `src/components/SettingsDialog.tsx`
- Test: `src/components/SettingsDialog.dom.test.tsx`

**Interfaces:**
- Consumes: Task 6 が `SettingsDialog` に渡す `appVersion`
- Produces: `SettingsPanelProps` に `appVersion: string | null` が増える

**仕様書との差:** 仕様書は「版番号のためだけに `SettingsPanelProps` を広げない」と書いているが、`SettingsDialog` はタブの配列を回して全パネルへ同じ props を渡す形になっている（`src/components/SettingsDialog.tsx:19`）。`GeneralSettings` だけ別扱いにすると、「パネルを1本書いて配列に1行足す」という既存の作りが崩れる。**props を広げる方を採る。** 実装者はこれを計画の矛盾として報告しなくてよい。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/SettingsDialog.dom.test.tsx` の既存の render 呼び出しに `appVersion` を足し、末尾に足す。

```tsx
it('一般タブに版番号が出る', () => {
  render(<SettingsDialog {…既存の props} appVersion="1.3.0" />)
  expect(screen.getByText('facet v1.3.0')).toBeTruthy()
})

it('版番号が読めなければ行ごと出さない', () => {
  render(<SettingsDialog {…既存の props} appVersion={null} />)
  expect(screen.queryByText(/^facet v/)).toBeNull()
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/components/SettingsDialog.dom.test.tsx`
Expected: FAIL（型エラー、または `facet v1.3.0` が見つからない）

- [ ] **Step 3: 実装する**

`src/components/settings/types.ts` の `SettingsPanelProps` に足す。

```ts
  /** アプリの版番号。読めなかったときは null */
  appVersion: string | null
```

`src/components/settings/GeneralSettings.tsx` のテーマの `fieldset` の後ろに足す。

```tsx
{appVersion !== null && (
  <p className="border-t border-rule pt-2 text-sm text-ink-muted">facet v{appVersion}</p>
)}
```

**読めなかったときは行ごと出さない。** 意味の無い記号を見出しの隣に残さない扱いを、移設先でも保つ。

`src/components/SettingsDialog.tsx` の `SettingsDialogProps` に `appVersion: string | null` を足し、`<Panel …>` に渡す。

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/components/SettingsDialog.dom.test.tsx`
Expected: PASS

- [ ] **Step 5: 検証して commit**

```
npm test && npx tsc -b && npm run lint
```
```
git add src/components/settings/types.ts src/components/settings/GeneralSettings.tsx src/components/SettingsDialog.tsx src/components/SettingsDialog.dom.test.tsx
git commit -m "feat(m37): 版番号を設定画面の一般タブへ移す"
```

---

## Task 8: 文書の更新

**Files:**
- Modify: `docs/overview-rev.md`
- Modify: `docs/open-issues.md`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: 6章に額縁の機能として1項足す**

`docs/overview-rev.md` の「ファイル一覧の額縁機能：」の箇条書き（`docs/overview-rev.md:223` から）に足す。

- **プロジェクトの登録と切り替え。** アプリが持つのは名前とパスとお気に入りと最終オープン日時だけで、説明・ステータス・タグは持たない。中身の情報はフォルダの中が正で、アプリに持たせると二重管理になる。

- [ ] **Step 2: 7章の自前コマンドの一覧に足す**

`docs/overview-rev.md:296` の「認めた例外は5件。」を「認めた例外は6件。」に直し、`read_clipboard_html` の項の後ろに足す。

6. **登録済みプロジェクトの存在確認**（`dirs_exist`）。fs プラグインの `exists` は実行時 scope の中しか見えず、一覧の全件を確かめると開いてもいないフォルダへ scope が広がるため。

**件数の文を直し忘れると、一覧と数が食い違う。**

- [ ] **Step 3: `open-issues.md` の該当項目を書き直す**

`writeMerged` の項の「フォルダを開く保存と設定の保存が近接すると」を、書き手が3人になった形に直す。

- **`writeMerged` の read-modify-write に直列化が無い**（`src/fs/settings-fs.ts`）。プロジェクトの登録と設定の保存が近接すると、後発が古い読み取りの上に書いて片方が落ちる。

- [ ] **Step 4: 決定を1つずつ突き合わせる**

仕様書の「設計」の各節を1つずつ挙げ、それを述べている文が `docs/overview-rev.md` にあるか、または書く必要が無いかを言う。**「矛盾していない」を「書いてある」と読み替えない。**

- [ ] **Step 5: 検証して commit**

```
npm test && npx tsc -b && npm run lint
```
```
git add docs/overview-rev.md docs/open-issues.md
git commit -m "docs(m37): プロジェクトの登録と存在確認のコマンドを書く"
```

---

## 実機確認（人間の作業）

サブエージェントは GUI を操作できない。次の6点は PR 本文のチェックリストに置き、人間に依頼する。

1. 旧版の `settings.json`（`lastProjectDir` だけを持つもの）で起動し、そのフォルダが1件目として一覧に出ること
2. フォルダを2つ登録し、メニューから往復できること。端末のタブを開いた状態で切り替えると確認が出ること
3. 登録したフォルダを OS 側で移動し、メニューを開いたときグレーになること。押して選び直すと表示名とお気に入りが残ること
4. アプリを再起動し、最後に開いていたプロジェクトが復元されること（お気に入りの並び順に引きずられないこと）
5. 版番号が設定の一般タブに出ること
6. mac と Windows の両方で 1〜4 を確かめること。パスの区切りと `folderName` の分岐が OS で反転しうる

## 完了の確認

```
npm test && npx tsc -b && npm run lint
```
```
cd src-tauri && cargo test
```
