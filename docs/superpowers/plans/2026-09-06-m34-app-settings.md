# アプリの設定 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 利用者がテーマとキャンバスの操作手段を選べる設定画面を作り、選んだ値を `settings.json` に残す。

**Architecture:** 設定の値・既定・正規化は Tauri を知らない純ロジック（`src/core/settings.ts`）に置き、ディスクとの往復は `src/fs/settings-fs.ts` が担う。実行時の値はモジュールスコープの外部ストア（`src/core/settings-store.ts`）が持ち、`useViewport` はフックの中でそれを読むので、キャンバス3モジュールと `ToolModule` の型には触らない。設定画面は Radix の Dialog と Tabs で組み、タブを配列で宣言してカテゴリを足せる形にする。

**Tech Stack:** React 19 / TypeScript / Tailwind 4 / radix-ui（統合パッケージ、導入済み）/ d3-zoom / Vitest + Testing Library / Tauri 2

**Spec:** `docs/superpowers/specs/2026-09-06-m34-app-settings-design.md`

## Global Constraints

- **文書の書き方（`CLAUDE.md`)**: 現在形で書く。経緯・マイルストーン番号・日付・「消した／足した」の記録を書かない。1項目は2文まで。太字は1段落に1箇所まで。全角括弧の入れ子を作らない
- **コメントの書き方（`CLAUDE.md`)**: 「いまの値・構造の理由」と「踏むと壊れる罠」を現在形で書く。罠は「X を条件にすると Y を取り逃がす」の形で書く。マイルストーン番号・レビュー指摘・変更前の状態を書かない
- **テストの名前**: 番号ではなく、守っている性質を名前にする
- **色**: 色値と Tailwind 標準パレット（`bg-red-500` 等）を書かない。役割名（`text-ink` / `bg-surface` / `border-rule` …）を使う。`src/styles/conventions.test.ts` が機械検査する。**例外は `src/components/ui/` だけ**で、そこは shadcn の生成物として検査から除外されている
- **フォントサイズ**: `text-sm` / `text-base` / `text-xl` 以外を使わない（同じ検査が見る）
- **コミットの末尾**: 全てのコミットメッセージを次の2行で終えること

  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CVBHPrfajrqTkJGBTnSFtz
  ```

- **作業ディレクトリ**: worktree `C:\Dev\Projects\facet\.claude\worktrees\m34-app-settings` の中。主チェックアウトへ `cd` しない
- **テストの実行**: 全体は `npm test`、1ファイルは `npx vitest run <path>`。型は `npx tsc -b`、lint は `npm run lint`

---

### Task 1: 設定の値と正規化

設定の型・既定値・壊れた入力の正規化を持つ純ロジック。ファイルもストアも知らない。

**Files:**
- Create: `src/core/settings.ts`
- Test: `src/core/settings.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `Theme`（`'light' | 'dark' | 'system'`）、`CanvasSettings`、`AppSettings`、`DEFAULT_SETTINGS: AppSettings`、`PAN_KEYS: readonly (keyof CanvasSettings)[]`、`normalizeSettings(raw: unknown): AppSettings`

- [ ] **Step 1: 依存を入れる**

worktree には `node_modules` が無い。

```bash
npm install
```

- [ ] **Step 2: 失敗するテストを書く**

`src/core/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from './settings'

describe('normalizeSettings', () => {
  it('空の入力を既定で埋める', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('オブジェクトでない入力も既定になる', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('settings')).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('保存された値を読む', () => {
    const raw = {
      theme: 'dark',
      canvas: {
        panWithEmptyDrag: false,
        panWithSpaceDrag: true,
        panWithMiddleDrag: false,
        panWithRightDrag: true,
        zoomWithoutModifier: false,
      },
    }
    expect(normalizeSettings(raw)).toEqual(raw)
  })

  it('列挙に無いテーマは既定に落ちる', () => {
    expect(normalizeSettings({ theme: 'sepia' }).theme).toBe('system')
  })

  it('真偽値でないキャンバスの値は既定に落ちる', () => {
    const canvas = normalizeSettings({ canvas: { panWithEmptyDrag: 'yes', zoomWithoutModifier: 0 } }).canvas
    expect(canvas.panWithEmptyDrag).toBe(true)
    expect(canvas.zoomWithoutModifier).toBe(true)
  })

  it('欠けたキーだけを既定で埋め、あるキーは保つ', () => {
    const canvas = normalizeSettings({ canvas: { panWithMiddleDrag: false } }).canvas
    expect(canvas.panWithMiddleDrag).toBe(false)
    expect(canvas.panWithSpaceDrag).toBe(true)
  })

  it('パンの手段が1つも無い入力は空きドラッグを起こす', () => {
    const canvas = normalizeSettings({
      canvas: {
        panWithEmptyDrag: false,
        panWithSpaceDrag: false,
        panWithMiddleDrag: false,
        panWithRightDrag: false,
      },
    }).canvas
    expect(canvas.panWithEmptyDrag).toBe(true)
    // 起こすのは1つだけ。他の選択は保つ
    expect(canvas.panWithSpaceDrag).toBe(false)
    expect(canvas.panWithMiddleDrag).toBe(false)
    expect(canvas.panWithRightDrag).toBe(false)
  })

  it('lastProjectDir のような無関係のキーを持ち込まない', () => {
    expect(normalizeSettings({ lastProjectDir: 'C:\\proj' })).toEqual(DEFAULT_SETTINGS)
  })

  it('入力のオブジェクトを共有しない', () => {
    const raw = { canvas: { panWithSpaceDrag: false } }
    const normalized = normalizeSettings(raw)
    normalized.canvas.panWithSpaceDrag = true
    expect(raw.canvas.panWithSpaceDrag).toBe(false)
  })
})
```

- [ ] **Step 3: 落ちることを確かめる**

Run: `npx vitest run src/core/settings.test.ts`
Expected: FAIL（`./settings` が解決できない）

- [ ] **Step 4: 実装する**

`src/core/settings.ts`:

```ts
/**
 * アプリの設定の値・既定・正規化。
 *
 * **ファイルもストアも知らない。** 往復は `src/fs/settings-fs.ts`、実行時の値は
 * `src/core/settings-store.ts` が持つ（コアは Tauri を知らないという分担）。
 *
 * **`lastProjectDir` はここに入れない。** 同じ `settings.json` に載るが、
 * 利用者が選ぶ値ではなく前回の状態の記録で、設定画面にも出ない
 */

export type Theme = 'light' | 'dark' | 'system'

export interface CanvasSettings {
  /** 地（箱もチップも無い面）の上の左ドラッグでパンする */
  panWithEmptyDrag: boolean
  panWithSpaceDrag: boolean
  panWithMiddleDrag: boolean
  /** 有効な間はキャンバスの `contextmenu` を止める */
  panWithRightDrag: boolean
  /** 修飾キーの無いホイールでズームする。`Ctrl+ホイール` は設定に関わらず効く */
  zoomWithoutModifier: boolean
}

export interface AppSettings {
  theme: Theme
  canvas: CanvasSettings
}

/**
 * 右ドラッグだけ既定を落とす。rev 10章が右クリックをコンテキストメニューに
 * 予約しているので、選んだ人にだけ `contextmenu` の抑止が掛かる形にする
 */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  canvas: {
    panWithEmptyDrag: true,
    panWithSpaceDrag: true,
    panWithMiddleDrag: true,
    panWithRightDrag: false,
    zoomWithoutModifier: true,
  },
}

/** パンの手段。設定画面が「最後の1つ」を無効化する判定にも使う */
export const PAN_KEYS = [
  'panWithEmptyDrag',
  'panWithSpaceDrag',
  'panWithMiddleDrag',
  'panWithRightDrag',
] as const satisfies readonly (keyof CanvasSettings)[]

const THEMES: readonly Theme[] = ['light', 'dark', 'system']

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function readBool(source: Record<string, unknown>, key: keyof CanvasSettings): boolean {
  const value = source[key]
  return typeof value === 'boolean' ? value : DEFAULT_SETTINGS.canvas[key]
}

/**
 * 読み込んだ JSON を設定に均す。**壊れていても投げない**——設定が読めないことは
 * 起動を止める理由にならないので、欠けたキー・型の違う値・列挙に無い文字列を
 * 既定で埋める。
 *
 * **パンの手段が4つとも false の入力は空きドラッグを起こす。** 盤面を動かせない
 * アプリになる状態をファイルから作れないようにする（起こすのは1つだけで、
 * 他の選択には触らない）
 */
export function normalizeSettings(raw: unknown): AppSettings {
  const root = asRecord(raw)
  const source = asRecord(root.canvas)
  const canvas: CanvasSettings = {
    panWithEmptyDrag: readBool(source, 'panWithEmptyDrag'),
    panWithSpaceDrag: readBool(source, 'panWithSpaceDrag'),
    panWithMiddleDrag: readBool(source, 'panWithMiddleDrag'),
    panWithRightDrag: readBool(source, 'panWithRightDrag'),
    zoomWithoutModifier: readBool(source, 'zoomWithoutModifier'),
  }
  if (!PAN_KEYS.some((key) => canvas[key])) canvas.panWithEmptyDrag = true
  return {
    theme: THEMES.find((theme) => theme === root.theme) ?? DEFAULT_SETTINGS.theme,
    canvas,
  }
}
```

- [ ] **Step 5: 通ることを確かめる**

Run: `npx vitest run src/core/settings.test.ts`
Expected: PASS（9件）

- [ ] **Step 6: コミット**

```bash
git add src/core/settings.ts src/core/settings.test.ts
git commit
```

メッセージ本文:

```
feat(m34): アプリの設定の型・既定・正規化を置く

壊れた JSON でも投げず既定へ均す。パンの手段が全て false の入力は
空きドラッグを起こし、盤面を動かせない状態をファイルから作れないようにする。
```

---

### Task 2: `settings.json` を読んで merge して書く

`saveLastProjectDir` はファイルを丸ごと上書きする。設定を同じファイルに置く前に、書き込みを merge へ揃える。

**Files:**
- Modify: `src/fs/settings-fs.ts`
- Modify: `src/fs/settings-fs.test.ts`
- Modify: `src/core/table-copy-options.ts:22-27`（JSDoc のみ）
- Test: `src/fs/settings-fs.test.ts`

**Interfaces:**
- Consumes: `AppSettings`、`normalizeSettings`（Task 1）
- Produces: `readSettings(): Promise<AppSettings>`、`saveSettings(settings: AppSettings): Promise<void>`。既存の `readLastProjectDir` / `saveLastProjectDir` はシグネチャを変えない

- [ ] **Step 1: 失敗するテストを書く**

`src/fs/settings-fs.test.ts` の末尾に足す。冒頭の動的 import の行も、新しい2本を取れるように書き換える。

```ts
const { readLastProjectDir, saveLastProjectDir, readSettings, saveSettings } =
  await import('./settings-fs')
```

```ts
describe('readSettings', () => {
  it('保存済みの設定を読む', async () => {
    readTextFileMock.mockResolvedValue(
      '{"theme":"dark","canvas":{"panWithRightDrag":true}}',
    )
    const settings = await readSettings()
    expect(settings.theme).toBe('dark')
    expect(settings.canvas.panWithRightDrag).toBe(true)
    // 欠けたキーは既定で埋まる
    expect(settings.canvas.zoomWithoutModifier).toBe(true)
  })

  it('ファイルが無ければ既定（例外を投げない）', async () => {
    readTextFileMock.mockRejectedValue(new Error('not found'))
    await expect(readSettings()).resolves.toEqual(DEFAULT_SETTINGS)
  })

  it('JSON が壊れていても既定（例外を投げない）', async () => {
    readTextFileMock.mockResolvedValue('{not json')
    await expect(readSettings()).resolves.toEqual(DEFAULT_SETTINGS)
  })
})

describe('書き込みは読んで merge する', () => {
  it('設定を書いても lastProjectDir が残る', async () => {
    existsMock.mockResolvedValue(true)
    readTextFileMock.mockResolvedValue('{"lastProjectDir":"C:\\\\proj"}')
    await saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark' })
    const written: unknown = JSON.parse(writeTextFileMock.mock.calls[0][1] as string)
    expect(written).toEqual({
      lastProjectDir: 'C:\\proj',
      theme: 'dark',
      canvas: DEFAULT_SETTINGS.canvas,
    })
  })

  it('フォルダを開いても設定が残る', async () => {
    existsMock.mockResolvedValue(true)
    readTextFileMock.mockResolvedValue('{"theme":"dark","canvas":{"panWithRightDrag":true}}')
    await saveLastProjectDir('C:\\proj')
    const written: unknown = JSON.parse(writeTextFileMock.mock.calls[0][1] as string)
    expect(written).toEqual({
      theme: 'dark',
      canvas: { panWithRightDrag: true },
      lastProjectDir: 'C:\\proj',
    })
  })

  it('読めないファイルの上へは新しい内容だけを書く', async () => {
    existsMock.mockResolvedValue(true)
    readTextFileMock.mockRejectedValue(new Error('not found'))
    await saveLastProjectDir('C:\\proj')
    expect(JSON.parse(writeTextFileMock.mock.calls[0][1] as string)).toEqual({
      lastProjectDir: 'C:\\proj',
    })
  })
})
```

ファイル冒頭の import に `DEFAULT_SETTINGS` を足す。

```ts
import { DEFAULT_SETTINGS } from '@/core/settings'
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/fs/settings-fs.test.ts`
Expected: FAIL（`readSettings` / `saveSettings` が undefined）

- [ ] **Step 3: 実装する**

`src/fs/settings-fs.ts` を次の内容にする。`readLastProjectDir` の JSDoc にある空文字列の罠は残す。

```ts
import { appConfigDir, join } from '@tauri-apps/api/path'
import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { normalizeSettings, type AppSettings } from '@/core/settings'

const SETTINGS_FILE_NAME = 'settings.json'

async function settingsFilePath(): Promise<string> {
  return join(await appConfigDir(), SETTINGS_FILE_NAME)
}

/** ファイル全体を読む。無い・読めない・壊れているのいずれでも空のオブジェクト */
async function readFile(): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readTextFile(await settingsFilePath()))
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/**
 * 読んでから重ねて書く。**丸ごと上書きしないこと。**
 * `lastProjectDir`（起動時の復元）と設定は書き手が別なので、片方が全体を
 * 書くと他方が毎回消える
 */
async function writeMerged(patch: Record<string, unknown>): Promise<void> {
  const current = await readFile()
  const configDir = await appConfigDir()
  if (!(await exists(configDir))) {
    await mkdir(configDir, { recursive: true })
  }
  await writeTextFile(await settingsFilePath(), JSON.stringify({ ...current, ...patch }))
}

/**
 * 直近に開いていたフォルダのパスを読む。ファイル不在・読み込み失敗・JSON が
 * 壊れている・`lastProjectDir` が無い・`lastProjectDir` が空文字列、の
 * いずれでも例外を投げず `null` を返す（起動時復元は「無ければ通常起動」で
 * 扱う。spec スコープ節）。
 *
 * **空文字列を素通ししないこと。** `""` を
 * そのまま返すと `allowProjectDir("")` → Rust 側 `scope.allow_directory(Path::new(""), true)`
 * に届き、tauri-2.11.5 の scope 実装は空パスに `MAIN_SEPARATOR + "**"` を
 * 足すため、unix では `/**`——fs の実行時 scope をファイルシステム全体へ
 * 広げてしまう。
 */
export async function readLastProjectDir(): Promise<string | null> {
  const parsed = await readFile()
  return typeof parsed.lastProjectDir === 'string' && parsed.lastProjectDir !== ''
    ? parsed.lastProjectDir
    : null
}

/** 直近に開いていたフォルダのパスを保存する。設定ディレクトリが無ければ作る */
export async function saveLastProjectDir(dir: string): Promise<void> {
  await writeMerged({ lastProjectDir: dir })
}

/** 設定を読む。読めない・壊れているのいずれでも既定を返し、例外を投げない */
export async function readSettings(): Promise<AppSettings> {
  return normalizeSettings(await readFile())
}

/** 設定を保存する。`lastProjectDir` は触らない */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeMerged({ theme: settings.theme, canvas: settings.canvas })
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/fs/settings-fs.test.ts`
Expected: PASS。既存の `saveLastProjectDir` の2件も緑のまま（`mkdir` の有無を見る判定は変わらない）

- [ ] **Step 5: 表コピーの JSDoc から消えた前提を落とす**

`src/core/table-copy-options.ts` の `createTableCopyPrefsStore` の JSDoc から、丸ごと上書きを理由に永続化を避ける段落を落とす。置き換える文:

```
 * 列幅ストア（`createColumnWidthStore`）と同じ作り・同じ理由。**永続化はしない**
 * ——アプリを閉じるまでの好みとして扱う。
```

- [ ] **Step 6: 全体が緑であることを確かめる**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/fs/settings-fs.ts src/fs/settings-fs.test.ts src/core/table-copy-options.ts
git commit
```

メッセージ本文:

```
fix(m34): settings.json の書き込みを読んで merge する形に直す

丸ごと上書きだったので、フォルダを開くたび設定が消える。設定の
読み書き（readSettings / saveSettings）もここに足す。
```

---

### Task 3: 設定ストア

実行時の設定を持つモジュールスコープの外部ストア。ファイルは知らない。

**Files:**
- Create: `src/core/settings-store.ts`
- Test: `src/core/settings-store.test.ts`

**Interfaces:**
- Consumes: `AppSettings`、`DEFAULT_SETTINGS`（Task 1）
- Produces: `SettingsStore`（`getSnapshot` / `subscribe` / `set` / `reset`）、`createSettingsStore()`、`appSettings`（アプリ全体で1個）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/settings-store.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from './settings'
import { createSettingsStore } from './settings-store'

describe('createSettingsStore', () => {
  it('既定から始まる', () => {
    expect(createSettingsStore().getSnapshot()).toEqual(DEFAULT_SETTINGS)
  })

  it('変えない限り同じ参照を返す', () => {
    // useSyncExternalStore は getSnapshot が毎回新しい値を返すと無限ループする
    const store = createSettingsStore()
    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })

  it('set した値を返し、購読者へ知らせる', () => {
    const store = createSettingsStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.set({ ...DEFAULT_SETTINGS, theme: 'dark' })
    expect(store.getSnapshot().theme).toBe('dark')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('set した後のオブジェクトを呼び手と共有しない', () => {
    const store = createSettingsStore()
    const next = { ...DEFAULT_SETTINGS, canvas: { ...DEFAULT_SETTINGS.canvas } }
    store.set(next)
    next.canvas.panWithSpaceDrag = false
    expect(store.getSnapshot().canvas.panWithSpaceDrag).toBe(true)
  })

  it('購読を解いた後は呼ばれない', () => {
    const store = createSettingsStore()
    const listener = vi.fn()
    store.subscribe(listener)()
    store.set({ ...DEFAULT_SETTINGS, theme: 'dark' })
    expect(listener).not.toHaveBeenCalled()
  })

  it('reset で既定に戻る', () => {
    const store = createSettingsStore()
    store.set({ ...DEFAULT_SETTINGS, theme: 'dark' })
    store.reset()
    expect(store.getSnapshot()).toEqual(DEFAULT_SETTINGS)
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/core/settings-store.test.ts`
Expected: FAIL（`./settings-store` が解決できない）

- [ ] **Step 3: 実装する**

`src/core/settings-store.ts`:

```ts
import { DEFAULT_SETTINGS, type AppSettings } from './settings'

export interface SettingsStore {
  getSnapshot: () => AppSettings
  subscribe: (listener: () => void) => () => void
  set: (settings: AppSettings) => void
  reset: () => void
}

/**
 * 実行時の設定を持つ外部ストア。作りも理由も `createTableCopyPrefsStore` と同じ。
 *
 * **ディスクは知らない。** 起動時に読んだ値を入れるのも、変更のたび書き出すのも
 * `src/App.tsx` の担当で、コアは Tauri を知らないという分担をそのまま守る。
 *
 * **モジュールスコープの可変状態はテスト間で漏れる。**
 * テストの `beforeEach` で `reset()` を呼ぶこと
 */
export function createSettingsStore(): SettingsStore {
  const initial: AppSettings = DEFAULT_SETTINGS
  // **同一参照を返し続けること。** useSyncExternalStore は getSnapshot が
  // 毎回新しいオブジェクトを返すと無限ループする
  let current: AppSettings = initial
  const listeners = new Set<() => void>()
  const emit = (): void => {
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (settings) => {
      current = { theme: settings.theme, canvas: { ...settings.canvas } }
      emit()
    },
    reset: () => {
      current = initial
      emit()
    },
  }
}

/** アプリ全体で1個 */
export const appSettings = createSettingsStore()
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/core/settings-store.test.ts`
Expected: PASS（6件）

- [ ] **Step 5: コミット**

```bash
git add src/core/settings-store.ts src/core/settings-store.test.ts
git commit
```

メッセージ本文:

```
feat(m34): 実行時の設定を持つ外部ストアを置く

useSyncExternalStore に渡す形。ディスクとの往復は App が担い、
ストアは Tauri を知らない。
```

---

### Task 4: テーマの解決

設定と OS の状態から実効テーマを決める純関数と、OS 側の購読。

**Files:**
- Create: `src/core/theme.ts`
- Test: `src/core/theme.test.ts`

**Interfaces:**
- Consumes: `Theme`（Task 1）
- Produces: `resolveTheme(setting: Theme, systemPrefersDark: boolean): 'light' | 'dark'`、`prefersDark(): boolean`、`watchPrefersDark(listener: (dark: boolean) => void): () => void`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/theme.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefersDark, resolveTheme, watchPrefersDark } from './theme'

describe('resolveTheme', () => {
  it('明示の選択はそのまま効く', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('system は OS の状態に従う', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})

/** matchMedia を持たない jsdom へ、変更を流せる偽物を差す */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>()
  const mql = {
    matches,
    addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
  }
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => mql })
  return {
    emit: (next: boolean) => {
      for (const fn of listeners) fn({ matches: next } as MediaQueryListEvent)
    },
    listenerCount: () => listeners.size,
  }
}

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('prefersDark', () => {
  it('matchMedia を持たない環境はライト扱い', () => {
    // jsdom の既定がこれ。ここで投げると起動そのものが止まる
    expect(prefersDark()).toBe(false)
  })

  it('OS がダークなら true', () => {
    stubMatchMedia(true)
    expect(prefersDark()).toBe(true)
  })
})

describe('watchPrefersDark', () => {
  it('OS の切り替えを流す', () => {
    const media = stubMatchMedia(false)
    const listener = vi.fn()
    watchPrefersDark(listener)
    media.emit(true)
    expect(listener).toHaveBeenCalledWith(true)
  })

  it('返り値を呼ぶと購読が外れる', () => {
    const media = stubMatchMedia(false)
    watchPrefersDark(vi.fn())()
    expect(media.listenerCount()).toBe(0)
  })

  it('matchMedia を持たない環境でも投げず、外す関数を返す', () => {
    expect(() => watchPrefersDark(vi.fn())()).not.toThrow()
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/core/theme.test.ts`
Expected: FAIL（`./theme` が解決できない）

- [ ] **Step 3: 実装する**

`src/core/theme.ts`:

```ts
import type { Theme } from './settings'

const QUERY = '(prefers-color-scheme: dark)'

/** 設定と OS の状態から、いま当てる面を決める */
export function resolveTheme(setting: Theme, systemPrefersDark: boolean): 'light' | 'dark' {
  if (setting === 'system') return systemPrefersDark ? 'dark' : 'light'
  return setting
}

/**
 * OS がダークを求めているか。
 *
 * **`matchMedia` を持たない環境はライト扱いに落とす。** jsdom の既定がそれで、
 * ここで投げると起動そのものが止まる
 */
export function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(QUERY).matches
}

/** OS の切り替えを購読する。返り値を呼ぶと外れる */
export function watchPrefersDark(listener: (dark: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined
  }
  const media = window.matchMedia(QUERY)
  const handler = (event: MediaQueryListEvent): void => listener(event.matches)
  media.addEventListener('change', handler)
  return () => media.removeEventListener('change', handler)
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/core/theme.test.ts`
Expected: PASS（7件）

- [ ] **Step 5: コミット**

```bash
git add src/core/theme.ts src/core/theme.test.ts
git commit
```

メッセージ本文:

```
feat(m34): テーマの解決と OS 追従を置く

matchMedia を持たない環境はライト扱いに落とす。適用の口は
documentElement の dark クラスのままなので、端末ペインと palette.css は
変わらない。
```

---

### Task 5: ビューポートを設定で動かす

`useViewport` の `filter` が設定を見る。ここが issue #34 と #35 の本体。

**Files:**
- Modify: `src/core/canvas/use-viewport.ts`
- Test: `src/core/canvas/use-viewport.dom.test.tsx`

**Interfaces:**
- Consumes: `appSettings`（Task 3）
- Produces: `useViewport(ref, enabled)` のシグネチャは変えない。呼び出し元3モジュールは無改修

- [ ] **Step 1: 失敗するテストを書く**

`src/core/canvas/use-viewport.dom.test.tsx` の import に足す。

```ts
import { beforeEach } from 'vitest'
import { DEFAULT_SETTINGS } from '../settings'
import { appSettings } from '../settings-store'
```

`Harness` を、地とノードを見分けられる形にする。既存の `<textarea>` と `<button>` はそのまま残し、ノード相当の子を1つ足す。

```tsx
      <div
        ref={ref}
        data-testid="canvas"
        data-x={transform.x}
        data-y={transform.y}
        data-k={transform.k}
        data-space={String(spaceHeld)}
      >
        {/* 箱に相当する子。pointer-events を持つのでヒットテストで target になる */}
        <div data-testid="node" />
        <textarea aria-label="文言" />
```

ファイル冒頭（`afterEach(cleanup)` の隣）に足す。

```ts
// モジュールスコープのストアはテスト間で漏れる
beforeEach(() => appSettings.reset())
```

既存の「修飾キーの無いホイールはズームしない」と「素の左ドラッグではパンしない」の2件は、既定が変わるので**期待を書き換える**。次の内容へ差し替える。

```ts
  it('修飾キーの無いホイールでズームする', () => {
    render(<Harness />)
    fireEvent.wheel(canvas(), { deltaY: -100 })
    expect(read().k).toBeCloseTo(ONE_NOTCH, 5)
  })

  it('zoomWithoutModifier を切ると修飾キーの無いホイールを取らない', () => {
    appSettings.set({
      ...DEFAULT_SETTINGS,
      canvas: { ...DEFAULT_SETTINGS.canvas, zoomWithoutModifier: false },
    })
    render(<Harness />)
    fireEvent.wheel(canvas(), { deltaY: -100 })
    expect(read()).toEqual(INITIAL_TRANSFORM)
  })

  it('zoomWithoutModifier を切っても Ctrl+ホイールは効く', () => {
    appSettings.set({
      ...DEFAULT_SETTINGS,
      canvas: { ...DEFAULT_SETTINGS.canvas, zoomWithoutModifier: false },
    })
    render(<Harness />)
    fireEvent.wheel(canvas(), { deltaY: -100, ctrlKey: true })
    expect(read().k).toBeCloseTo(ONE_NOTCH, 5)
  })
```

パンの describe には、既存の「素の左ドラッグではパンしない」を次の群へ差し替える。

```ts
  it('地の上の左ドラッグでパンする', () => {
    render(<Harness />)
    drag(canvas(), { button: 0 })
    expect(read().x).toBe(INITIAL_TRANSFORM.x + 30)
  })

  it('箱の上の左ドラッグではパンしない', () => {
    // 箱の中の文字選択に要る。奪うと編集できなくなる
    render(<Harness />)
    drag(screen.getByTestId('node'), { button: 0 })
    expect(read()).toEqual(INITIAL_TRANSFORM)
  })

  it('panWithEmptyDrag を切ると地の上の左ドラッグを取らない', () => {
    appSettings.set({
      ...DEFAULT_SETTINGS,
      canvas: { ...DEFAULT_SETTINGS.canvas, panWithEmptyDrag: false },
    })
    render(<Harness />)
    drag(canvas(), { button: 0 })
    expect(read()).toEqual(INITIAL_TRANSFORM)
  })

  it('panWithSpaceDrag を切ると Space+ドラッグを取らない', () => {
    appSettings.set({
      ...DEFAULT_SETTINGS,
      canvas: { ...DEFAULT_SETTINGS.canvas, panWithSpaceDrag: false, panWithEmptyDrag: false },
    })
    render(<Harness />)
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    // Space を奪わないので、押下の状態も立たない
    expect(canvas().dataset.space).toBe('false')
    drag(canvas(), { button: 0 })
    expect(read()).toEqual(INITIAL_TRANSFORM)
  })

  it('panWithMiddleDrag を切ると中ボタンドラッグを取らない', () => {
    appSettings.set({
      ...DEFAULT_SETTINGS,
      canvas: { ...DEFAULT_SETTINGS.canvas, panWithMiddleDrag: false },
    })
    render(<Harness />)
    drag(canvas(), { button: 1 })
    expect(read()).toEqual(INITIAL_TRANSFORM)
  })

  it('既定では右ドラッグでパンしない', () => {
    render(<Harness />)
    drag(canvas(), { button: 2 })
    expect(read()).toEqual(INITIAL_TRANSFORM)
  })

  it('panWithRightDrag を立てると右ドラッグでパンする', () => {
    appSettings.set({
      ...DEFAULT_SETTINGS,
      canvas: { ...DEFAULT_SETTINGS.canvas, panWithRightDrag: true },
    })
    render(<Harness />)
    drag(canvas(), { button: 2 })
    expect(read().x).toBe(INITIAL_TRANSFORM.x + 30)
  })

  it('既定では contextmenu を止めない', () => {
    render(<Harness />)
    expect(fireEvent.contextMenu(canvas())).toBe(true)
  })

  it('右ドラッグをパンに使う間は contextmenu を止める', () => {
    // 止めないと、押した瞬間に OS のメニューが出てドラッグが続かない
    appSettings.set({
      ...DEFAULT_SETTINGS,
      canvas: { ...DEFAULT_SETTINGS.canvas, panWithRightDrag: true },
    })
    render(<Harness />)
    expect(fireEvent.contextMenu(canvas())).toBe(false)
  })
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/core/canvas/use-viewport.dom.test.tsx`
Expected: FAIL（新しい期待が通らない。既定のホイールとパンがまだ設定を見ていない）

- [ ] **Step 3: 実装する**

`src/core/canvas/use-viewport.ts` を次のとおり変える。

import に足す:

```ts
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { appSettings } from '../settings-store'
```

`isTextEntry` の隣に足す:

```ts
/**
 * 地（箱もチップも無い面）の上で起きたか。
 *
 * **容器そのものが `target` かどうかで見る。** 背景・エッジ・ノードの層はいずれも
 * `pointer-events-none` でヒットテストを透過し、箱・行・チップだけが `auto` に
 * 戻る構造なので、地に当たった押下の `target` は容器になる。
 * **地の位置に `pointer-events` を持つ要素を足すと、その上のドラッグがパンから漏れる**
 */
function isGroundTarget(event: MouseEvent, container: HTMLElement): boolean {
  return event.target === container
}
```

フックの JSDoc の操作の並びを書き換える:

```
 * - ホイール ＝ カーソル中心ズーム（`Ctrl` の要否は設定。`Ctrl+ホイール`は常に効く）
 * - 地の左ドラッグ・`Space+ドラッグ`・中ボタン・右ドラッグ ＝ パン（手段ごとに設定）
```

フックの本体、`enabledRef` の下に足す:

```ts
  // **effect の依存に使う値。** d3 の filter はこれを読まない——ハンドラは
  // マウント時に1回しか張らないので、閉じ込めた値は最初の設定で凍る
  const settings = useSyncExternalStore(appSettings.subscribe, appSettings.getSnapshot)
  const panWithSpaceDrag = settings.canvas.panWithSpaceDrag
  const panWithRightDrag = settings.canvas.panWithRightDrag
```

`filter` を差し替える:

```ts
      .filter((event: Event) => {
        // モーダル・ポップアップが開いている間はキャンバスの操作言語を止める
        //（rev 10章の境界規則）。**キー監視だけでは足りない**——ホイールと
        // ドラッグは d3 が直接取るので、ここで弾かないと裏で視点が動く
        if (!enabledRef.current) return false
        // **ここで毎回読むこと。** ハンドラは張り直されないので、閉じ込めると
        // 設定を変えても最初の値のまま動く（enabledRef と同じ理由）
        const canvas = appSettings.getSnapshot().canvas
        if (event.type === 'wheel') {
          const e = event as WheelEvent
          return e.ctrlKey || e.metaKey || canvas.zoomWithoutModifier
        }
        if (event.type === 'mousedown') {
          const e = event as MouseEvent
          if (e.button === 1) return canvas.panWithMiddleDrag
          if (e.button === 2) return canvas.panWithRightDrag
          if (e.button !== 0) return false
          if (spaceHeldRef.current) return canvas.panWithSpaceDrag
          return canvas.panWithEmptyDrag && isGroundTarget(e, el)
        }
        // ダブルクリックズームとタッチは使わない
        return false
      })
```

Space の押下監視の effect を、設定でも止まるようにする。`if (!enabled) {` の行を次に替え、依存配列に `panWithSpaceDrag` を足す。

```ts
    if (!enabled || !panWithSpaceDrag) {
```

```ts
  }, [enabled, panWithSpaceDrag, ref])
```

その effect の JSDoc の末尾に1文足す:

```
   * `panWithSpaceDrag` を切っている間も張らない。**取らないなら奪わない**
   *——ページ既定の `Space` に返す
```

`ensureVisible` の上に effect を足す:

```ts
  // 右ドラッグをパンに使う間は OS のメニューを止める。**押した瞬間に開くと
  // ドラッグが続かない。** 使わない間は張らないので、既定のメニューは出る
  useEffect(() => {
    const el = ref.current
    if (el === null || !panWithRightDrag) return
    const block = (event: MouseEvent): void => event.preventDefault()
    el.addEventListener('contextmenu', block)
    return () => el.removeEventListener('contextmenu', block)
  }, [panWithRightDrag, ref])
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/core/canvas/use-viewport.dom.test.tsx`
Expected: PASS

- [ ] **Step 5: 3モジュールのテストが緑のままか確かめる**

キャンバス3種の DOM テストは既定の挙動に依存している。既定が変わったので、影響が無いことをここで見る。

Run: `npx vitest run src/modules/issue-tree src/modules/logic-tree src/modules/sequence`
Expected: PASS。落ちる場合は、テストが「素の左ドラッグでは何も起きない」に依存していないか確認し、性質を名前にしたまま期待を直す

- [ ] **Step 6: コミット**

```bash
git add src/core/canvas/use-viewport.ts src/core/canvas/use-viewport.dom.test.tsx
git commit
```

メッセージ本文:

```
feat(m34): キャンバスのパンとズームの手段を設定で選べるようにする

既定を Miro 準拠へ倒す。地の左ドラッグでパン、修飾キーの無いホイールで
ズームし、手段ごとに設定で切れる。右ドラッグは既定で使わず、
立てている間だけ contextmenu を止める。

issue #34 #35
```

---

### Task 6: Dialog と Tabs の土台

shadcn の生成物を2本置く。`src/components/ui/` は色とフォントサイズの規約検査から除外されている。

**Files:**
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/tabs.tsx`

**Interfaces:**
- Consumes: なし
- Produces: `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription`、`Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`

- [ ] **Step 1: Dialog を置く**

`src/components/ui/dialog.tsx`:

```tsx
import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  closeLabel = "閉じる",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  closeLabel?: string
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 rounded-md bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          data-slot="dialog-close"
          aria-label={closeLabel}
          className="absolute top-3 right-3 rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring hover:text-foreground"
        >
          <X aria-hidden className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("grid gap-1.5", className)}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-base font-medium", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
}
```

- [ ] **Step 2: Tabs を置く**

`src/components/ui/tabs.tsx`:

```tsx
import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-md bg-muted p-1",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center rounded-sm px-3 py-1 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
```

- [ ] **Step 3: 型と規約検査を通す**

Run: `npx tsc -b`
Expected: エラー無し

Run: `npx vitest run src/styles/conventions.test.ts`
Expected: PASS（`components/ui/` は除外されているので、shadcn の字面は検査されない）

- [ ] **Step 4: コミット**

```bash
git add src/components/ui/dialog.tsx src/components/ui/tabs.tsx
git commit
```

メッセージ本文:

```
feat(m34): 設定画面の土台に Dialog と Tabs を置く

役割は alertdialog ではなく dialog。応答を要する通知ではないため。
radix-ui は導入済みで追加依存は無い。
```

---

### Task 7: 設定画面

タブ2枚と、その中身。値の変更は親へ渡し、保存は App が行う。

**Files:**
- Create: `src/components/settings/types.ts`
- Create: `src/components/settings/GeneralSettings.tsx`
- Create: `src/components/settings/InputSettings.tsx`
- Create: `src/components/SettingsDialog.tsx`
- Test: `src/components/SettingsDialog.dom.test.tsx`

**Interfaces:**
- Consumes: `AppSettings` / `CanvasSettings` / `PAN_KEYS`（Task 1）、Task 6 の Dialog と Tabs
- Produces: `SettingsDialog`（props: `open: boolean`、`settings: AppSettings`、`onChange: (next: AppSettings) => void`、`onClose: () => void`）、`SettingsPanelProps`（`settings` と `onChange` を持つ）

**パネル共通の型を1本のファイルに置く理由**: パネルどうしが型を貸し借りすると読む順で意味が変わり、ダイアログ側に置くと `SettingsDialog` とパネルが互いを import する形になる。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/SettingsDialog.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DEFAULT_SETTINGS, type AppSettings } from '@/core/settings'
import { SettingsDialog } from './SettingsDialog'

afterEach(cleanup)

function show(settings: AppSettings = DEFAULT_SETTINGS) {
  const onChange = vi.fn()
  const onClose = vi.fn()
  render(
    <SettingsDialog open settings={settings} onChange={onChange} onClose={onClose} />,
  )
  return { onChange, onClose }
}

describe('SettingsDialog', () => {
  it('一般のタブから始まる', () => {
    show()
    expect(screen.getByRole('radio', { name: 'システムに合わせる' })).toBeTruthy()
  })

  it('テーマを選ぶと渡される', () => {
    const { onChange } = show()
    fireEvent.click(screen.getByRole('radio', { name: 'ダーク' }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, theme: 'dark' })
  })

  it('操作のタブへ切り替えるとパンとズームが出る', () => {
    show()
    fireEvent.click(screen.getByRole('tab', { name: '操作' }))
    expect(screen.getByRole('checkbox', { name: '空きスペースの左ドラッグ' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: '修飾キーなしのホイールでズームする' })).toBeTruthy()
  })

  it('パンの手段を切ると渡される', () => {
    const { onChange } = show()
    fireEvent.click(screen.getByRole('tab', { name: '操作' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '中ボタンのドラッグ' }))
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      canvas: { ...DEFAULT_SETTINGS.canvas, panWithMiddleDrag: false },
    })
  })

  it('最後に残ったパンの手段は切れない', () => {
    // 盤面を動かせない状態を設定から作らせない
    const { onChange } = show({
      ...DEFAULT_SETTINGS,
      canvas: {
        ...DEFAULT_SETTINGS.canvas,
        panWithSpaceDrag: false,
        panWithMiddleDrag: false,
      },
    })
    fireEvent.click(screen.getByRole('tab', { name: '操作' }))
    const last = screen.getByRole('checkbox', { name: '空きスペースの左ドラッグ' })
    expect(last.hasAttribute('disabled')).toBe(true)
    fireEvent.click(last)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ズームは最後の1つでも切れる', () => {
    // Ctrl+ホイールが常に効くので、切っても操作できなくならない
    const { onChange } = show()
    fireEvent.click(screen.getByRole('tab', { name: '操作' }))
    const zoom = screen.getByRole('checkbox', { name: '修飾キーなしのホイールでズームする' })
    expect(zoom.hasAttribute('disabled')).toBe(false)
    fireEvent.click(zoom)
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      canvas: { ...DEFAULT_SETTINGS.canvas, zoomWithoutModifier: false },
    })
  })

  it('閉じるボタンで閉じる', () => {
    const { onClose } = show()
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/components/SettingsDialog.dom.test.tsx`
Expected: FAIL（`./SettingsDialog` が解決できない）

- [ ] **Step 3: パネル共通の型と、一般のパネルを書く**

`src/components/settings/types.ts`:

```ts
import type { AppSettings } from '@/core/settings'

/** 設定のパネルはどれもこの形。`SETTINGS_TABS` の `Panel` がこれを取る */
export interface SettingsPanelProps {
  settings: AppSettings
  /** 値が変わるたび呼ぶ。保存はダイアログの呼び手が行う */
  onChange: (next: AppSettings) => void
}
```

`src/components/settings/GeneralSettings.tsx`:

```tsx
import type { Theme } from '@/core/settings'
import type { SettingsPanelProps } from './types'

const THEME_LABELS: readonly { value: Theme; label: string }[] = [
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
  { value: 'system', label: 'システムに合わせる' },
]

/**
 * 見た目の設定。
 *
 * **ラジオはネイティブを使う。** `TableCopyDialog` と同じ理由で、インラインで
 * 完結する入力に `<select>` を避ける動機は当たらない
 */
export function GeneralSettings({ settings, onChange }: SettingsPanelProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm text-ink-muted">テーマ</legend>
      {THEME_LABELS.map(({ value, label }) => (
        <label key={value} className="flex items-center gap-2 text-base text-ink">
          <input
            type="radio"
            name="theme"
            value={value}
            checked={settings.theme === value}
            onChange={() => onChange({ ...settings, theme: value })}
          />
          {label}
        </label>
      ))}
    </fieldset>
  )
}
```

- [ ] **Step 4: 操作のパネルを書く**

`src/components/settings/InputSettings.tsx`:

```tsx
import { PAN_KEYS, type CanvasSettings } from '@/core/settings'
import type { SettingsPanelProps } from './types'

const PAN_LABELS: Record<(typeof PAN_KEYS)[number], string> = {
  panWithEmptyDrag: '空きスペースの左ドラッグ',
  panWithSpaceDrag: 'Space を押しながらの左ドラッグ',
  panWithMiddleDrag: '中ボタンのドラッグ',
  panWithRightDrag: '右ドラッグ',
}

/**
 * キャンバスの操作の設定。
 *
 * **有効なパンの手段が1つだけになったら、それを無効化する。** 盤面を動かせない
 * 状態を設定から作らせないため（`normalizeSettings` が読み込み側で守る不変条件と
 * 同じもの）。ズームに同じ縛りが要らないのは、`Ctrl+ホイール` が設定に関わらず
 * 効くからである
 */
export function InputSettings({ settings, onChange }: SettingsPanelProps) {
  const canvas = settings.canvas
  const enabledPans = PAN_KEYS.filter((key) => canvas[key])
  // **キーを1つ受けて1つ書く形にすること。** `Partial<CanvasSettings>` を受けて
  // `{ [key]: value }` を渡すと、算出キーの型が広がって代入できない
  const update = (key: keyof CanvasSettings, value: boolean): void => {
    onChange({ ...settings, canvas: { ...canvas, [key]: value } })
  }
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-ink-muted">盤面を動かす</legend>
        {PAN_KEYS.map((key) => {
          const isLast = enabledPans.length === 1 && enabledPans[0] === key
          return (
            <label key={key} className="flex items-center gap-2 text-base text-ink">
              <input
                type="checkbox"
                checked={canvas[key]}
                disabled={isLast}
                title={isLast ? '盤面を動かす手段が無くなるので、これは外せません' : undefined}
                onChange={(e) => update(key, e.target.checked)}
              />
              {PAN_LABELS[key]}
            </label>
          )
        })}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-ink-muted">拡大・縮小</legend>
        <label className="flex items-center gap-2 text-base text-ink">
          <input
            type="checkbox"
            checked={canvas.zoomWithoutModifier}
            onChange={(e) => update('zoomWithoutModifier', e.target.checked)}
          />
          修飾キーなしのホイールでズームする
        </label>
        <p className="text-sm text-ink-muted">Ctrl+ホイールはこの設定に関わらず効きます。</p>
      </fieldset>
    </div>
  )
}
```

- [ ] **Step 5: ダイアログを書く**

`src/components/SettingsDialog.tsx`:

```tsx
import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GeneralSettings } from './settings/GeneralSettings'
import { InputSettings } from './settings/InputSettings'
import type { SettingsPanelProps } from './settings/types'
import type { AppSettings } from '@/core/settings'

/**
 * 設定のカテゴリ。**足すときはパネルを1本書いてここへ1行足す。**
 * ダイアログ本体はこの配列を回すだけなので触らない
 */
const SETTINGS_TABS = [
  { id: 'general', label: '一般', Panel: GeneralSettings },
  { id: 'input', label: '操作', Panel: InputSettings },
] as const satisfies readonly {
  id: string
  label: string
  Panel: (props: SettingsPanelProps) => ReactNode
}[]

export interface SettingsDialogProps {
  open: boolean
  settings: AppSettings
  /** 値が変わるたび呼ぶ。保存は呼び手の担当 */
  onChange: (next: AppSettings) => void
  onClose: () => void
}

/**
 * 設定画面。
 *
 * **モーダルキューには積まない。** キューはアプリが出す要求を並べる器で、
 * 利用者が能動的に開く画面は性質が違う。**開いている間は呼び出し側が
 * `KeyContext.modalOpen` を true にすること**（rev 10章の境界規則）。
 *
 * **OK とキャンセルを置かない。** 5つとも独立したトグルなので、まとめて確定する
 * 意味がない。切り替えた時点で効き、そのまま保存される。
 *
 * タブの選択は覚えず、開くたび先頭から始める
 */
export function SettingsDialog({ open, settings, onChange, onClose }: SettingsDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>設定</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue={SETTINGS_TABS[0].id}>
          <TabsList>
            {SETTINGS_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {SETTINGS_TABS.map(({ id, Panel }) => (
            <TabsContent key={id} value={id}>
              <Panel settings={settings} onChange={onChange} />
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 6: 通ることを確かめる**

Run: `npx vitest run src/components/SettingsDialog.dom.test.tsx`
Expected: PASS（7件）

- [ ] **Step 7: 規約検査と型を通す**

Run: `npx vitest run src/styles/conventions.test.ts`
Expected: PASS（自作の3本は役割名と3サイズだけを使っている）

Run: `npx tsc -b`
Expected: エラー無し

- [ ] **Step 8: コミット**

```bash
git add src/components/SettingsDialog.tsx src/components/SettingsDialog.dom.test.tsx src/components/settings
git commit
```

メッセージ本文:

```
feat(m34): 設定画面を置く

一般（テーマ）と操作（パン・ズーム）の2タブ。カテゴリはタブの配列で
宣言し、足すときはパネルを1本書いて1行足す。有効なパンの手段が1つに
なったらそれを無効化する。
```

---

### Task 8: App へ配線する

起動時の読み込み、テーマの適用、歯車の入口、保存。

**Files:**
- Modify: `src/App.tsx`（`dark` state / `toggleTheme` / `modalOpen` / トップバー / 起動時の effect）
- Modify: `src/App.dom.test.tsx`（`@/fs/settings-fs` のモック）
- Test: `src/App.dom.test.tsx`

**Interfaces:**
- Consumes: `appSettings`（Task 3）、`readSettings` / `saveSettings`（Task 2）、`resolveTheme` / `prefersDark` / `watchPrefersDark`（Task 4）、`SettingsDialog`（Task 7）
- Produces: なし（アプリの端）

- [ ] **Step 1: 失敗するテストを書く**

`src/App.dom.test.tsx` のモックを差し替える。ファイル上部、他の `vi.fn()` の宣言の隣に足す。

```ts
const saveSettingsMock = vi.fn(async () => undefined)
```

`@/fs/settings-fs` のモックを次にする。

```ts
vi.mock('@/fs/settings-fs', () => ({
  readLastProjectDir: async () => restoreConfig.lastDir,
  saveLastProjectDir: saveLastProjectDirMock,
  readSettings: async () => settingsConfig.stored,
  saveSettings: saveSettingsMock,
}))
```

`restoreConfig` の隣に足す。

```ts
// 起動時に読ませる設定。テストごとに差し替える
const settingsConfig: { stored: AppSettings } = { stored: DEFAULT_SETTINGS }
```

import に足す。

```ts
import { DEFAULT_SETTINGS, type AppSettings } from '@/core/settings'
import { appSettings } from '@/core/settings-store'
```

`beforeEach` に足す。

```ts
  settingsConfig.stored = DEFAULT_SETTINGS
  saveSettingsMock.mockClear()
  appSettings.reset()
```

テストを足す。

```tsx
describe('設定', () => {
  it('保存されたテーマを起動時に当てる', async () => {
    settingsConfig.stored = { ...DEFAULT_SETTINGS, theme: 'dark' }
    render(<App />)
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
  })

  it('テーマのトグルは明示の選択として保存される', async () => {
    settingsConfig.stored = { ...DEFAULT_SETTINGS, theme: 'light' }
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'ダークにする' }))
    await waitFor(() => {
      expect(saveSettingsMock).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, theme: 'dark' })
    })
  })

  it('歯車で設定を開き、変えると保存される', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '設定' }))
    fireEvent.click(await screen.findByRole('tab', { name: '操作' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '右ドラッグ' }))
    await waitFor(() => {
      expect(saveSettingsMock).toHaveBeenCalledWith({
        ...DEFAULT_SETTINGS,
        canvas: { ...DEFAULT_SETTINGS.canvas, panWithRightDrag: true },
      })
    })
  })

  it('歯車で開き、閉じるボタンで閉じる', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '設定' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/App.dom.test.tsx`
Expected: FAIL（「設定」のボタンが無い）

- [ ] **Step 3: App を書き換える**

import に足す。

```ts
import { Settings } from 'lucide-react'
import { SettingsDialog } from '@/components/SettingsDialog'
import { type AppSettings } from '@/core/settings'
import { appSettings } from '@/core/settings-store'
import { prefersDark, resolveTheme, watchPrefersDark } from '@/core/theme'
import { readLastProjectDir, readSettings, saveLastProjectDir, saveSettings } from '@/fs/settings-fs'
```

`const [dark, setDark] = useState(false)` を次に替える。

```ts
  const settings = useSyncExternalStore(appSettings.subscribe, appSettings.getSnapshot)
  const [systemDark, setSystemDark] = useState(prefersDark)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const dark = resolveTheme(settings.theme, systemDark) === 'dark'
```

`modalOpen` の行を次に替える。

```ts
  // 設定画面はキューに積まないので、ここで数に足す（rev 10章の境界規則）
  const modalOpen = modals.length > 0 || settingsOpen
```

`toggleTheme` を次に替える。

```ts
  const updateSettings = useCallback((next: AppSettings) => {
    appSettings.set(next)
    // 保存に失敗しても次回復元されないだけで、このセッションの作業には影響しない
    void saveSettings(next).catch((err: unknown) => {
      console.error('設定の保存に失敗しました', err)
    })
  }, [])

  // 押すとライトかダークの明示選択になり、その時点で system 追従から外れる
  const toggleTheme = () => {
    updateSettings({ ...settings, theme: dark ? 'light' : 'dark' })
  }

  // OS 側の切り替えは system のときだけ効くが、購読は常に張っておく
  //（設定を system に戻した瞬間から正しい値で始まる）
  useEffect(() => watchPrefersDark(setSystemDark), [])

  // **クラスの付け外しという形を保つこと。** 端末ペインは palette.css の
  // `.dark` セレクタに依存しているので、別の当て方にすると端末だけ追従しない
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  // 起動時に設定を読む。readSettings は読めなくても既定を返す
  useEffect(() => {
    void (async () => {
      try {
        appSettings.set(await readSettings())
      } catch (err: unknown) {
        console.error('設定の読み込みに失敗しました', err)
      }
    })()
  }, [])
```

トップバーのテーマのボタンの**前**に歯車を足す。

```tsx
          <button
            type="button"
            aria-label="設定"
            title="設定"
            className={`${buttonBase} p-1 text-ink-muted`}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings aria-hidden className="size-4" />
          </button>
```

`ToastStack` の隣に足す。

```tsx
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
      />
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/App.dom.test.tsx`
Expected: PASS

- [ ] **Step 5: 全体を確かめる**

Run: `npm test`
Expected: PASS

Run: `npx tsc -b`
Expected: エラー無し

Run: `npm run lint`
Expected: エラー無し

- [ ] **Step 6: コミット**

```bash
git add src/App.tsx src/App.dom.test.tsx
git commit
```

メッセージ本文:

```
feat(m34): 設定を App へ配線する

起動時に読み、変えるたび保存する。テーマの適用は documentElement の
dark クラスのままで、端末ペインの追従は変わらない。設定が開いている間は
操作言語を止める。
```

---

### Task 9: 文書を合わせる

**Files:**
- Modify: `docs/overview-rev.md`（10章「キャンバス」の標準操作の行）
- Modify: `docs/open-issues.md`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: rev 10章の標準操作を置き換える**

`docs/overview-rev.md` 10章「キャンバス」の2つ目の箇条書きを次に替える。矩形選択は落とす。

```
- 標準操作は、ホイール＝カーソル中心ズーム、地の左ドラッグ・Space+ドラッグ・中ボタン＝パン、Shift+クリック＝追加選択、ドラッグ＝移動、ダブルクリック＝テキスト編集、右クリック＝コンテキストメニュー。
- **パンの手段とホイールにCtrlを要るかはアプリの設定で選ぶ。** 既定は Miro に揃え、`Ctrl+ホイール`は設定に関わらず効く。右ドラッグのパンは既定で使わず、有効な間だけキャンバスの `contextmenu` を止める。
```

- [ ] **Step 2: `open-issues.md` に1件足す**

「将来の機能を作った瞬間に踏むもの」の節へ足す。

```
- **右ドラッグのパンを有効にしている間はキャンバスの `contextmenu` を止める**（`src/core/canvas/use-viewport.ts`）。rev 10章が右クリックに予約しているコンテキストメニューを作ると、この設定を選んだ利用者だけ開けない。
```

- [ ] **Step 3: 文書の規則に合っているか読み返す**

現在形か。経緯・マイルストーン番号・日付を書いていないか。1項目が2文までか。太字が1段落に1箇所までか。全角括弧の入れ子が無いか。

- [ ] **Step 4: コミット**

```bash
git add docs/overview-rev.md docs/open-issues.md
git commit
```

メッセージ本文:

```
docs(m34): キャンバスの標準操作を設定のある形に書き換える

既定を Miro 準拠にし、矩形選択の予約を落とす。右ドラッグと
コンテキストメニューの衝突を残件に足す。
```

---

## 実機確認（人間の作業）

`npm run tauri dev` で起動して確かめる。

- 初回起動で OS がダークなら、アプリもダークで開く
- 歯車 → 一般 → ライトを選ぶと即座に切り替わり、再起動しても残る
- 端末ペインはライトを選んでもダークのまま
- 操作タブ → 右ドラッグを入れると、キャンバスの右ドラッグでパンでき、右クリックのメニューが出ない。外すとメニューが戻る
- キャンバスの地をドラッグすると盤面が動き、箱の中の文字はドラッグで選べる
- 修飾キー無しのホイールでズームし、`Ctrl+ホイール`でもズームする
- パンの手段を1つまで減らすと、最後のチェックボックスが押せなくなる
- フォルダを開き直しても設定が消えない
