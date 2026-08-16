# 起動時に最後に開いていたフォルダを復元する Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アプリ起動時に、直近に開いていたフォルダを自動で開くようにする。

**Architecture:** `src/fs/settings-fs.ts`（新規）がアプリ設定ディレクトリの `settings.json` に直近フォルダのパスを永続化する。フォルダを開いた際（`App.tsx` の `openProject`）に保存し、起動時のマウント effect で読み出して復元する。復元はダイアログを経由しないため、`src-tauri/src/lib.rs` に追加する自前コマンド `allow_project_dir`（`.claude/` 向けの既存 `allow_skill_dir` と同じパターン）で fs の実行時 scope を明示的に取り直してから開く。

**Tech Stack:** Tauri v2（`@tauri-apps/plugin-fs`, `@tauri-apps/api/path`）、React 18、TypeScript、Vitest、oxlint。新規の外部依存パッケージは追加しない。

**Spec:** `docs/superpowers/specs/2026-08-16-restore-last-folder-design.md`

## Global Constraints

- 永続化するのは直近1件のフォルダパスのみ（履歴一覧は対象外。spec スコープ節）
- 復元に失敗した場合（読み込み・JSON パース・scope 付与・フォルダ不在のいずれも）はユーザー通知をしない。`console.error` のみで握りつぶし、通常起動にフォールバックする（spec スコープ節・4節）
- `settings-fs.ts` は `BaseDirectory` を使わず、`project-fs.ts` の流儀に揃えて `appConfigDir()`（`@tauri-apps/api/path`）＋ `join` で絶対パスを解決する（spec 1節）
- プロジェクトフォルダの fs scope 再付与は `allow_skill_dir` と同じパターンの自前コマンド `allow_project_dir` で行う。capabilities への追記は不要（自前コマンドのため）（spec 3節）
- 新規の npm / cargo 依存パッケージは追加しない

---

### Task 1: 設定の永続化（`src/fs/settings-fs.ts`）

**Files:**
- Create: `src/fs/settings-fs.ts`
- Test: `src/fs/settings-fs.test.ts`

**Interfaces:**
- Produces: `readLastProjectDir(): Promise<string | null>`、`saveLastProjectDir(dir: string): Promise<void>`（Task 3・4 が使う）

- [ ] **Step 1: 失敗するテストを書く**

`src/fs/settings-fs.test.ts` を新規作成する:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const existsMock = vi.fn()
const mkdirMock = vi.fn()
const readTextFileMock = vi.fn()
const writeTextFileMock = vi.fn()

// settings-fs が読む @tauri-apps/* は全部モックする。project-fs.test.ts と同じ理由
// （テストは node 環境で走り、実物は Tauri の webview を前提にしているため）
vi.mock('@tauri-apps/api/path', () => ({
  appConfigDir: async () => 'C:\\config',
  join: async (...parts: string[]) => parts.join('\\'),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: (...args: unknown[]) => existsMock(...args),
  mkdir: (...args: unknown[]) => mkdirMock(...args),
  readTextFile: (...args: unknown[]) => readTextFileMock(...args),
  writeTextFile: (...args: unknown[]) => writeTextFileMock(...args),
}))

// モックの登録後に読む必要があるので動的 import にする
const { readLastProjectDir, saveLastProjectDir } = await import('./settings-fs')

beforeEach(() => {
  existsMock.mockReset()
  mkdirMock.mockReset()
  readTextFileMock.mockReset()
  writeTextFileMock.mockReset()
})

describe('readLastProjectDir', () => {
  it('保存済みのパスを返す', async () => {
    readTextFileMock.mockResolvedValue('{"lastProjectDir":"C:\\\\proj"}')
    await expect(readLastProjectDir()).resolves.toBe('C:\\proj')
    expect(readTextFileMock).toHaveBeenCalledWith('C:\\config\\settings.json')
  })

  it('ファイルが無ければ null（例外を投げない）', async () => {
    readTextFileMock.mockRejectedValue(new Error('not found'))
    await expect(readLastProjectDir()).resolves.toBeNull()
  })

  it('JSON が壊れていても null（例外を投げない）', async () => {
    readTextFileMock.mockResolvedValue('{not json')
    await expect(readLastProjectDir()).resolves.toBeNull()
  })

  it('lastProjectDir キーが無ければ null', async () => {
    readTextFileMock.mockResolvedValue('{}')
    await expect(readLastProjectDir()).resolves.toBeNull()
  })
})

describe('saveLastProjectDir', () => {
  it('設定ディレクトリが無ければ作ってから書き込む', async () => {
    existsMock.mockResolvedValue(false)
    await saveLastProjectDir('C:\\proj')
    expect(existsMock).toHaveBeenCalledWith('C:\\config')
    expect(mkdirMock).toHaveBeenCalledWith('C:\\config', { recursive: true })
    expect(writeTextFileMock).toHaveBeenCalledWith(
      'C:\\config\\settings.json',
      JSON.stringify({ lastProjectDir: 'C:\\proj' }),
    )
  })

  it('設定ディレクトリが既にあれば mkdir を呼ばない', async () => {
    existsMock.mockResolvedValue(true)
    await saveLastProjectDir('C:\\proj')
    expect(mkdirMock).not.toHaveBeenCalled()
    expect(writeTextFileMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `npm test -- src/fs/settings-fs.test.ts`
Expected: FAIL（`./settings-fs` が存在しない）

- [ ] **Step 3: 実装する**

`src/fs/settings-fs.ts` を新規作成する:

```ts
import { appConfigDir, join } from '@tauri-apps/api/path'
import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

const SETTINGS_FILE_NAME = 'settings.json'

interface Settings {
  lastProjectDir?: string
}

async function settingsFilePath(): Promise<string> {
  return join(await appConfigDir(), SETTINGS_FILE_NAME)
}

/**
 * 直近に開いていたフォルダのパスを読む。ファイル不在・読み込み失敗・JSON が
 * 壊れている・`lastProjectDir` が無い、のいずれでも例外を投げず `null` を
 * 返す（起動時復元は「無ければ通常起動」で扱う。spec スコープ節）
 */
export async function readLastProjectDir(): Promise<string | null> {
  try {
    const text = await readTextFile(await settingsFilePath())
    const parsed = JSON.parse(text) as Settings
    return typeof parsed.lastProjectDir === 'string' ? parsed.lastProjectDir : null
  } catch {
    return null
  }
}

/** 直近に開いていたフォルダのパスを保存する。設定ディレクトリが無ければ作る */
export async function saveLastProjectDir(dir: string): Promise<void> {
  const configDir = await appConfigDir()
  if (!(await exists(configDir))) {
    await mkdir(configDir, { recursive: true })
  }
  const settings: Settings = { lastProjectDir: dir }
  await writeTextFile(await join(configDir, SETTINGS_FILE_NAME), JSON.stringify(settings))
}
```

- [ ] **Step 4: テストを実行し、通ることを確認する**

Run: `npm test -- src/fs/settings-fs.test.ts`
Expected: PASS（6件すべて）

- [ ] **Step 5: コミット**

```bash
git add src/fs/settings-fs.ts src/fs/settings-fs.test.ts
git commit -m "feat(m18): 直近フォルダの永続化モジュールを追加"
```

---

### Task 2: プロジェクトフォルダの fs scope 再付与（Rust コマンド）

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/fs/project-fs.ts`
- Modify: `src/fs/project-fs.test.ts`
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: なし（Task 1 に依存しない、独立したタスク）
- Produces: `allowProjectDir(dir: string): Promise<void>`（`src/fs/project-fs.ts`。Task 4 が使う）。Rust コマンド `allow_project_dir`

- [ ] **Step 1: 失敗するテストを書く（JS 側ラッパー）**

`src/fs/project-fs.test.ts` の `describe('moveFileToTrash', ...)` ブロックの直前に、次の `describe` を追加する（`moveFileToTrash` と同じ `invoke` モックを使う）:

```ts
describe('allowProjectDir', () => {
  it('自前コマンド allow_project_dir に dir を渡す', async () => {
    await allowProjectDir('C:\\proj')
    expect(invoke).toHaveBeenCalledWith('allow_project_dir', { dir: 'C:\\proj' })
  })

  it('コマンドが失敗したら例外がそのまま伝わる（呼び出し側が扱う）', async () => {
    invoke.mockRejectedValue(new Error('forbidden path'))
    await expect(allowProjectDir('C:\\proj')).rejects.toThrow('forbidden path')
  })
})
```

同ファイル冒頭の import 行を更新する:

```ts
const { allowProjectDir, askSaveMarkdownPath, moveFileToTrash, watchFolder, WATCH_DEBOUNCE_MS } = await import(
  './project-fs'
)
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `npm test -- src/fs/project-fs.test.ts`
Expected: FAIL（`allowProjectDir` が `project-fs` からエクスポートされていない）

- [ ] **Step 3: JS 側ラッパーを実装する**

`src/fs/project-fs.ts` の `pickProjectFolder` の直前に追加する:

```ts
/**
 * プロジェクトフォルダを fs の実行時 scope へ入れる。**通常はダイアログ選択
 * （`recursive: true`）が自動で入れるが、その scope はセッション限りで次回
 * 起動には引き継がれない。** 起動時の自動復元はダイアログを経由しないため、
 * ここで明示的に取り直す（`.claude/` 向けの `allowSkillDir` と同じ理由。
 * Rust 側の実装は `src-tauri/src/lib.rs` の `allow_project_dir` を参照）
 */
export async function allowProjectDir(dir: string): Promise<void> {
  await invoke('allow_project_dir', { dir })
}
```

- [ ] **Step 4: テストを実行し、通ることを確認する**

Run: `npm test -- src/fs/project-fs.test.ts`
Expected: PASS

- [ ] **Step 5: Rust コマンドを実装する**

`src-tauri/src/lib.rs` の `allow_skill_dir` 関数の直後（`move_to_trash` 関数の前）に追加する:

```rust
/// プロジェクトフォルダを fs プラグインの実行時 scope に入れる。
///
/// フォルダ選択ダイアログが入れる scope はセッション限りで、次回起動には
/// 引き継がれない。**起動時に前回のフォルダを自動で復元する**ときはダイアログ
/// を経由しないため、ここで明示的に取り直す。判断は一切置かない
/// （`allow_skill_dir` と同じ姿勢。rev 7章）
#[tauri::command]
fn allow_project_dir(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    let scope = app.fs_scope();
    scope
        .allow_directory(std::path::Path::new(&dir), true)
        .map_err(|e| e.to_string())
}
```

`run()` 内の `invoke_handler(tauri::generate_handler![...])` に `allow_project_dir` を追加する（`allow_skill_dir` の次）:

```rust
        .invoke_handler(tauri::generate_handler![
            move_to_trash,
            allow_skill_dir,
            allow_project_dir,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill
        ])
```

- [ ] **Step 6: Rust 側がコンパイルできることを確認する**

Run: `cd src-tauri && cargo check`
Expected: `Finished` で終わる（エラー無し）

- [ ] **Step 7: capabilities に `$APPCONFIG` の scope を追加する**

`src-tauri/capabilities/default.json` の `permissions` 配列の末尾を、次のように変更する。旧:

```json
    "dialog:default",
    "clipboard-manager:allow-write-text"
  ]
}
```

新:

```json
    "dialog:default",
    "clipboard-manager:allow-write-text",
    {
      "identifier": "fs:allow-read-text-file",
      "allow": [{ "path": "$APPCONFIG/settings.json" }]
    },
    {
      "identifier": "fs:allow-write-text-file",
      "allow": [{ "path": "$APPCONFIG/settings.json" }]
    },
    {
      "identifier": "fs:allow-exists",
      "allow": [{ "path": "$APPCONFIG" }, { "path": "$APPCONFIG/settings.json" }]
    },
    {
      "identifier": "fs:allow-mkdir",
      "allow": [{ "path": "$APPCONFIG" }]
    }
  ]
}
```

同ファイルの `description` 文字列の末尾（「…プロジェクト側の `.claude/` は別に `allow_skill_dir`（自前コマンド）で許可する。」の直後）に、既存の書式に倣って一文追記する:

```
起動時に前回開いたフォルダを復元するため、アプリ設定ディレクトリの `settings.json` を `$APPCONFIG` スコープで読み書きする（M18）。フォルダそのものの実行時 scope 再付与はダイアログを経由しないため、`.claude/` と同じ理由で `allow_project_dir`（自前コマンド）が別途必要——capabilities への追記は不要。
```

- [ ] **Step 8: コミット**

```bash
git add src-tauri/src/lib.rs src/fs/project-fs.ts src/fs/project-fs.test.ts src-tauri/capabilities/default.json
git commit -m "feat(m18): プロジェクトフォルダの fs scope を明示的に再付与するコマンドを追加"
```

---

### Task 3: フォルダを開いたら最後に開いたフォルダとして保存する

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.dom.test.tsx`

**Interfaces:**
- Consumes: `saveLastProjectDir(dir: string): Promise<void>`（Task 1）
- Produces: なし（末端の配線）

- [ ] **Step 1: 失敗するテストを書く**

`src/App.dom.test.tsx` の `vi.hoisted` ブロック（43-67行目）に `saveLastProjectDirMock` を追加する:

```ts
const {
  closeState,
  killAllPtysMock,
  requestCloseOverride,
  ptyKillMock,
  ptyExitHandlers,
  skillCalls,
  pickedFolder,
  syncGate,
  syncReadingGuideMock,
  disk,
  writeProjectFileMock,
  saveLastProjectDirMock,
} = vi.hoisted(() => ({
  closeState: { callback: null as (() => Promise<boolean>) | null },
  killAllPtysMock: vi.fn(async () => undefined),
  requestCloseOverride: { value: null as boolean | null },
  ptyKillMock: vi.fn(async () => undefined),
  ptyExitHandlers: new Map<number, (code: number | null) => void>(),
  skillCalls: [] as string[],
  pickedFolder: { value: '/proj' },
  syncGate: { promise: null as Promise<void> | null, release: null as (() => void) | null },
  syncReadingGuideMock: vi.fn(async () => undefined),
  disk: new Map<string, string>(),
  writeProjectFileMock: vi.fn(async (_path: string, _text: string) => undefined),
  saveLastProjectDirMock: vi.fn(async (_dir: string) => undefined),
}))
```

`vi.mock('@/fs/app-window', ...)` の直前に、`@/fs/settings-fs` のモックを追加する（起動時復元は Task 4 で配線するため、ここでは常に「復元対象パス無し」を返す）:

```ts
vi.mock('@/fs/settings-fs', () => ({
  readLastProjectDir: async () => null,
  saveLastProjectDir: saveLastProjectDirMock,
}))
```

`afterEach(() => { ... })`（184-190行目、`ptyExitHandlers.clear()` などをまとめているブロック）に1行足す:

```ts
afterEach(() => {
  ptyExitHandlers.clear()
  ptyKillMock.mockClear()
  skillCalls.length = 0
  disk.clear()
  writeProjectFileMock.mockClear()
  saveLastProjectDirMock.mockClear()
})
```

`describe('読み方ガイド', ...)` ブロックの直前に新しい `describe` を追加する:

```ts
describe('最後に開いたフォルダの保存', () => {
  it('フォルダを開くと保存する', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    await waitFor(() => expect(saveLastProjectDirMock).toHaveBeenCalledWith('/proj'))
  })
})
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `npm test -- src/App.dom.test.tsx`
Expected: FAIL（新しい `it` が `saveLastProjectDirMock` が呼ばれないままタイムアウトする）

- [ ] **Step 3: `App.tsx` を配線する**

import ブロック（62-69行目の `@/fs/project-fs` からの多重 import の直後、`@/fs/pty` の import の後、`@/fs/reading-guide-io` の import の前）に追加する:

```ts
import { killAllPtys, tauriPtyIo } from '@/fs/pty'
import { tauriReadingGuideIo } from '@/fs/reading-guide-io'
import { saveLastProjectDir } from '@/fs/settings-fs'
import { allowSkillDir, tauriSkillSyncIo } from '@/fs/skill-resources'
```

`openProject`（401-415行目）を変更する。旧:

```ts
  const openProject = async (dir: string): Promise<boolean> => {
    const opened = await controller.openFolder(dir)
    if (!opened) return false
    try {
      await syncReadingGuide(dir, tauriReadingGuideIo)
    } catch (err: unknown) {
      showToast({
        message: `読み方ガイド（${READING_GUIDE_FILENAME}）を配置できませんでした: ${
          err instanceof Error ? err.message : String(err)
        }`,
        key: 'reading-guide-sync',
      })
    }
    return true
  }
```

新:

```ts
  const openProject = async (dir: string): Promise<boolean> => {
    const opened = await controller.openFolder(dir)
    if (!opened) return false
    // 保存できなくても次回単に復元されないだけで、このセッションの作業には
    // 影響しない。読み方ガイドの配置失敗（下）とは違いトーストは出さない
    try {
      await saveLastProjectDir(dir)
    } catch (err: unknown) {
      console.error('最後に開いたフォルダの保存に失敗しました', err)
    }
    try {
      await syncReadingGuide(dir, tauriReadingGuideIo)
    } catch (err: unknown) {
      showToast({
        message: `読み方ガイド（${READING_GUIDE_FILENAME}）を配置できませんでした: ${
          err instanceof Error ? err.message : String(err)
        }`,
        key: 'reading-guide-sync',
      })
    }
    return true
  }
```

- [ ] **Step 4: テストを実行し、通ることを確認する**

Run: `npm test -- src/App.dom.test.tsx`
Expected: PASS（既存テストを含め全件）

- [ ] **Step 5: コミット**

```bash
git add src/App.tsx src/App.dom.test.tsx
git commit -m "feat(m18): フォルダを開いたら直近フォルダとして保存する"
```

---

### Task 4: 起動時に直近フォルダを自動で開く

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.dom.test.tsx`

**Interfaces:**
- Consumes: `readLastProjectDir()`（Task 1）、`allowProjectDir(dir)`（Task 2）、`saveLastProjectDir`（Task 3 で配線済み）、`fileExists(path)`（既存 `@/fs/project-fs`）、`openProject(dir)`（`App.tsx` 内、Task 3 で更新済み）
- Produces: なし（末端の配線。これが機能の入口）

- [ ] **Step 1: 失敗するテストを書く**

`src/App.dom.test.tsx` 冒頭に `StrictMode` の import を追加する:

```ts
// @vitest-environment jsdom
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
```

`vi.hoisted` ブロックに `restoreConfig` と `allowProjectDirCalls` を追加する:

```ts
const {
  closeState,
  killAllPtysMock,
  requestCloseOverride,
  ptyKillMock,
  ptyExitHandlers,
  skillCalls,
  pickedFolder,
  syncGate,
  syncReadingGuideMock,
  disk,
  writeProjectFileMock,
  saveLastProjectDirMock,
  restoreConfig,
  allowProjectDirCalls,
} = vi.hoisted(() => ({
  closeState: { callback: null as (() => Promise<boolean>) | null },
  killAllPtysMock: vi.fn(async () => undefined),
  requestCloseOverride: { value: null as boolean | null },
  ptyKillMock: vi.fn(async () => undefined),
  ptyExitHandlers: new Map<number, (code: number | null) => void>(),
  skillCalls: [] as string[],
  pickedFolder: { value: '/proj' },
  syncGate: { promise: null as Promise<void> | null, release: null as (() => void) | null },
  syncReadingGuideMock: vi.fn(async () => undefined),
  disk: new Map<string, string>(),
  writeProjectFileMock: vi.fn(async (_path: string, _text: string) => undefined),
  saveLastProjectDirMock: vi.fn(async (_dir: string) => undefined),
  // 起動時復元専用の可変状態。既定は「復元対象パス無し」——このファイルの
  // 既存テストはどれも起動時復元を前提にしていないので、既定を変えない
  restoreConfig: { lastDir: null as string | null, exists: false, allowError: null as Error | null },
  allowProjectDirCalls: [] as string[],
}))
```

`@/fs/settings-fs` のモックを、`readLastProjectDir` が `restoreConfig.lastDir` を返すよう書き換える:

```ts
vi.mock('@/fs/settings-fs', () => ({
  readLastProjectDir: async () => restoreConfig.lastDir,
  saveLastProjectDir: saveLastProjectDirMock,
}))
```

`vi.mock('@/fs/project-fs', ...)` を書き換える（`fileExists` を可変化し、`allowProjectDir` を追加する）:

```ts
vi.mock('@/fs/project-fs', () => ({
  // **`pickedFolder.value` を `'/proj'` に固定し直さないこと**——フォルダ切替
  // （A→B→A）のテストがこれを書き換えて成立している
  pickProjectFolder: async () => pickedFolder.value,
  // `disk` 経由に変えたが、既定は空なので「listJsonFiles は常に []」という
  // 既存テストの前提はそのまま（M13）
  listJsonFiles: async () => [...disk.keys()],
  readProjectFile: async (path: string) => disk.get(path) ?? '',
  writeProjectFile: writeProjectFileMock,
  fileExists: async () => restoreConfig.exists,
  allowProjectDir: async (dir: string) => {
    allowProjectDirCalls.push(dir)
    if (restoreConfig.allowError !== null) throw restoreConfig.allowError
  },
  moveFileToTrash: async () => undefined,
  joinPath: async (dir: string, name: string) => `${dir}/${name}`,
  watchFolder: async () => () => undefined,
  askSaveMarkdownPath: async () => null,
}))
```

`afterEach(() => { ... })` に3行足す:

```ts
afterEach(() => {
  ptyExitHandlers.clear()
  ptyKillMock.mockClear()
  skillCalls.length = 0
  disk.clear()
  writeProjectFileMock.mockClear()
  saveLastProjectDirMock.mockClear()
  restoreConfig.lastDir = null
  restoreConfig.exists = false
  restoreConfig.allowError = null
  allowProjectDirCalls.length = 0
})
```

ファイル末尾に新しい `describe` を追加する:

```ts
describe('起動時のフォルダ復元', () => {
  it('保存済みパスがあり実在すれば自動で開く', async () => {
    restoreConfig.lastDir = '/restored'
    restoreConfig.exists = true
    render(<App />)
    await waitFor(() => expect(screen.getByTitle('/restored')).toBeTruthy())
    expect(allowProjectDirCalls).toEqual(['/restored'])
  })

  it('保存済みパスが無ければ何も開かず通常起動する', async () => {
    render(<App />)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(allowProjectDirCalls).toEqual([])
    // `disabled={projectDir === null}`（`App.tsx`）。フォルダが開いていなければ
    // 無効のまま——`openPane()` ヘルパーが「開けたか」を見るのと同じ指標
    expect(screen.getByRole('button', { name: 'Claude Code ペインを開く' }).hasAttribute('disabled')).toBe(true)
  })

  it('保存済みパスが実在しなければ何も開かず通常起動する', async () => {
    restoreConfig.lastDir = '/gone'
    restoreConfig.exists = false
    render(<App />)
    await waitFor(() => expect(allowProjectDirCalls).toEqual(['/gone']))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByTitle('/gone')).toBeNull()
  })

  it('scope の再付与が失敗しても通常起動にフォールバックする', async () => {
    restoreConfig.lastDir = '/restored'
    restoreConfig.exists = true
    restoreConfig.allowError = new Error('forbidden path')
    render(<App />)
    await waitFor(() => expect(allowProjectDirCalls).toEqual(['/restored']))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByTitle('/restored')).toBeNull()
  })

  it('StrictMode の二重マウントでも復元は1回しか走らない', async () => {
    restoreConfig.lastDir = '/restored'
    restoreConfig.exists = true
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    await waitFor(() => expect(screen.getByTitle('/restored')).toBeTruthy())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(allowProjectDirCalls).toEqual(['/restored'])
  })
})
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `npm test -- src/App.dom.test.tsx`
Expected: FAIL（`起動時のフォルダ復元` の5件がすべて失敗する。復元処理がまだ無いため `allowProjectDirCalls` が常に空、フォルダも開かない）

- [ ] **Step 3: `App.tsx` に起動時復元の effect を追加する**

import ブロックの `@/fs/project-fs` の多重 import に `allowProjectDir` を追加する（アルファベット順で先頭）:

```ts
import {
  allowProjectDir,
  askSaveMarkdownPath,
  fileExists,
  joinPath,
  listJsonFiles,
  moveFileToTrash,
  pickProjectFolder,
  readProjectFile,
  watchFolder,
  writeProjectFile,
} from '@/fs/project-fs'
```

`@/fs/settings-fs` の import に `readLastProjectDir` を足す:

```ts
import { readLastProjectDir, saveLastProjectDir } from '@/fs/settings-fs'
```

`openProject` の定義（Task 3 で更新済み）の直後、`switchFolder` の JSDoc の直前に、次のブロックを挿入する:

```ts
  // **StrictMode 対策の一回性ガード。** `cancelled` フラグだけでは、1回目の
  // マウントの後片付けが走った後に2回目のマウントが独立してもう一度
  // `readLastProjectDir` から始めてしまう。「試みたかどうか」自体をここで固定する
  const hasAttemptedRestoreRef = useRef(false)

  /**
   * 起動時に前回開いていたフォルダを自動で復元する（設計 M18）。ダイアログを
   * 経由しないため、`fileExists` の前に `allowProjectDir` で fs の実行時 scope
   * を明示的に取り直す必要がある（`allow_project_dir` 参照。ダイアログ由来の
   * scope はセッション限りで次回起動には引き継がれない）。
   *
   * あらゆる失敗（設定の読み込み・scope の再付与・存在確認）は「フォルダ
   * 未選択」の通常起動として握りつぶす——ユーザーに通知するほどの障害ではない
   */
  useEffect(() => {
    if (hasAttemptedRestoreRef.current) return
    hasAttemptedRestoreRef.current = true
    let cancelled = false
    void (async () => {
      try {
        const dir = await readLastProjectDir()
        if (dir === null || cancelled) return
        await allowProjectDir(dir)
        if (cancelled) return
        if (!(await fileExists(dir))) return
        if (cancelled) return
        await openProject(dir)
      } catch (err: unknown) {
        console.error('起動時のフォルダ復元に失敗しました', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
```

- [ ] **Step 4: テストを実行し、通ることを確認する**

Run: `npm test -- src/App.dom.test.tsx`
Expected: PASS（既存テストを含め全件）

- [ ] **Step 5: コミット**

```bash
git add src/App.tsx src/App.dom.test.tsx
git commit -m "feat(m18): 起動時に直近フォルダを自動で復元する"
```

---

### Task 5: 全体検証と申し送り

**Files:**
- Modify: `docs/history/m18-restore-last-folder.md`（新規作成）
- Modify: `docs/open-issues.md`（変更が必要な場合のみ）

**Interfaces:**
- Consumes: Task 1〜4 の全成果物
- Produces: なし（マイルストーンの締め）

- [ ] **Step 1: フロントエンドの全テストを実行する**

Run: `npm test`
Expected: 全件 PASS

- [ ] **Step 2: 型チェックを実行する**

Run: `npx tsc -b`
Expected: エラー無し

- [ ] **Step 3: lint を実行する**

Run: `npm run lint`
Expected: エラー無し

- [ ] **Step 4: Rust 側のビルドとテストを実行する**

Run: `cd src-tauri && cargo build && cargo test`
Expected: ビルド成功、既存テスト（`pty.rs`）が全件 PASS（`allow_project_dir` に専用テストは追加していない。判断を持たないコマンドで `allow_skill_dir` と同じ扱い——spec テスト方針節）

- [ ] **Step 5: 実機で確認する**

`npm run tauri dev` でアプリを起動し、フォルダを開いてからアプリを終了、再起動して同じフォルダが自動で開くことを目視で確認する。存在しないフォルダに見せかける（`settings.json` を直接編集して存在しないパスにする）場合の「静かに通常起動する」ことも確認する。

- [ ] **Step 6: 申し送りを書く**

`docs/history/m18-restore-last-folder.md` を新規作成し、実装で確定した事項（`allow_project_dir` が必要だった理由、`settings-fs.ts` の設計）と実機確認の結果を記録する。`docs/open-issues.md` に本機能に関する残件があれば追記し、無ければ触らない。

- [ ] **Step 7: コミット**

```bash
git add docs/history/m18-restore-last-folder.md docs/open-issues.md
git commit -m "docs(m18): 申し送りを書く"
```
