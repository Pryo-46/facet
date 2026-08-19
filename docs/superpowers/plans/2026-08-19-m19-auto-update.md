# 自動アップデート（M19）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows 版 facet に「新版の存在を知らせ、押せばその場で更新される」経路を作る。

**Architecture:** Tauri v2 の updater プラグインを入れ、GitHub Releases に置いた静的な `latest.json` をエンドポイントにする。判断は Rust 側に置かない（rev 7章）——Rust はプラグインの登録だけで、チェックも適用も TypeScript から呼ぶ。TypeScript 側は既存の層分けに従って2枚に割る: `src/fs/updater.ts`（Tauri API を隔離する副作用の境界）と `src/core/update-check.ts`（React も Tauri も知らない純粋な状態機械。テストはここに書く）。リリース作業は手元ビルドのままで、`latest.json` の生成だけ `scripts/make-latest-json.mjs` にする。

**Tech Stack:** Tauri v2（`@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`, `tauri-plugin-updater`, `tauri-plugin-process`）、React 19、TypeScript、Vitest、oxlint、lucide-react。

**Spec:** `docs/superpowers/specs/2026-08-19-m19-auto-update-design.md`

## Global Constraints

- **対象は Windows（NSIS の x64 インストーラ）のみ。** macOS の自動アップデートは対象外で、`latest.json` に `darwin-*` を載せない（spec スコープ節）
- **mac では更新ボタンを描画しない。** `latest.json` に `darwin-*` が無い以上、mac で押せば必ず「最新版です」と表示する**嘘をつくボタン**になる。判定は既存の `currentPlatform() === 'mac'`（`src/core/keyboard/platform.ts`）を使う（spec 6節）
- **`installMode` という名前のキーが2つあり、意味が違う**（spec 3節）。`bundle.windows.nsis.installMode` は `"currentUser"`、`plugins.updater.windows.installMode` は `"passive"`。取り違えないこと
- **CSP は変更しない。** 更新の取得は Rust 側が行うため webview の `connect-src` の対象外（spec 3節）
- **起動時チェックの失敗は静かに握り潰す**（`console.error` のみ）。エラーを利用者に見せるのは、利用者が自分でボタンを押したときだけ（spec 6節）
- **判断を Rust に置かない**（rev 7章）。`lib.rs` はプラグインの登録のみ
- **色値・フォントサイズの直書きは禁止**（rev 9章）。`src/styles/conventions.test.ts` が `src/` 配下の `.ts`/`.tsx` 全部（`components/ui/` を除く）を走査して落とす。使える段は `text-xs / text-sm / text-base / text-lg / text-2xl` の5段のみ、色は役割名（`text-ink` / `text-ink-muted` / `bg-surface-accent` …）のみ
- **新しい役割トークンを足さない。** 強調は `bg-surface-accent text-ink`（`src/components/TerminalPane.tsx:52` の選択中タブと同じ）を使う（spec 6節）
- **秘密鍵をエージェントが生成・保存・出力しない。** 鍵の生成は人間の作業として Task 1 に明記してある

## 実装者への指示

- **この計画のコードは検証済みの正ではない。** レビューを通す前提の下書きとして扱うこと。**指示が矛盾していたら、辻褄を合わせずに「計画の矛盾」として報告する。**
- **ただし例外がある: 既存実装と一致すべきものは、計画ではなく実物が正。** 本計画が引用している既存コード（`buttonBase`、`showToast`、`pushModal`、`hasRunning`）と食い違ったら実物に従い、その旨を報告すること。
- **ライブラリの API は、入っている実物で確かめてから書く。** Task 3 にそのための手順を置いてある。Web 上の解説も記憶も、たいてい一つ前のメジャー版を指している。
- **作業の完了を報告するときは、実行した検証コマンドとその出力を貼ること。**

---

### Task 1: プラグインと設定の導入

**Files:**
- Modify: `package.json`（依存2本）
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: なし
- Produces: `@tauri-apps/plugin-updater` の `check()` と `@tauri-apps/plugin-process` の `relaunch()` が呼べる状態（Task 3 が使う）

- [ ] **Step 1: 署名鍵を作る（人間の作業。エージェントは実行しない）**

**この手順はエージェントが行わない。** 秘密鍵とそのパスワードをエージェントに渡さないため。人間に次を依頼し、**公開鍵の文字列だけ**を受け取る。

PowerShell:

```powershell
npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\facet.key"
```

- パスワードを聞かれるので設定する（空にしない）
- `facet.key`（秘密鍵）と `facet.key.pub`（公開鍵）ができ、公開鍵の内容が標準出力にも出る
- **秘密鍵とパスワードは、この場でパスワードマネージャへバックアップする。** 失うと以後どのバージョンからも自動更新できなくなる（配布済みのアプリに公開鍵が焼き込まれているため、別の鍵で署名した更新は検証に失敗する）

受け取った公開鍵は Step 5 で `tauri.conf.json` に貼る。**公開鍵はコミットしてよい**（むしろ配布物に埋め込む必要がある）。

- [ ] **Step 2: npm の依存を足す**

Run: `npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process`
Expected: `package.json` の `dependencies` に2本増え、`package-lock.json` が更新される

- [ ] **Step 3: cargo の依存を足す**

`src-tauri/Cargo.toml` の末尾に、**デスクトップ限定のターゲットセクション**として追加する。既存の `[dependencies]` に入れないこと——`tauri.conf.json` に `bundle.android` の設定が残っており、モバイル向けビルドでこの2本は存在しない:

```toml
# 自動アップデート（M19）。**デスクトップ限定**——updater / process は
# モバイル向けターゲットに存在しない。lib.rs 側も #[cfg(desktop)] で囲う
[target.'cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))'.dependencies]
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

- [ ] **Step 4: プラグインを登録する**

`src-tauri/src/lib.rs` の `run()` を、チェーン1本から「builder を一度束ねて `#[cfg(desktop)]` でシャドウイングする」形に変える。**`invoke_handler` 以降は一切触らない**:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init());

    // 自動アップデート（M19）。**デスクトップ限定のプラグインなので分けてある。**
    // ここでも判断は持たない——チェックも適用も TypeScript 側から呼ぶ（rev 7章）
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .manage(pty::PtyState::default())
        .invoke_handler(tauri::generate_handler![
            move_to_trash,
            allow_skill_dir,
            allow_project_dir,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: capabilities に権限を足す**

`src-tauri/capabilities/default.json` の `permissions` 配列に2つ足す。置き場所は `"clipboard-manager:allow-write-text"` の直後（オブジェクト形式の項の手前）:

```json
"updater:default",
"process:allow-restart",
```

**`process:default` は使わない。** それは `allow-exit` も含むが、アプリを終了させる権限は要らない。

あわせて同ファイルの `description` の末尾に、既存の書式（各許可の理由を短く書き添えるスタイル）で一文足す:

> `updater:default` と `process:allow-restart` は自動アップデートのため（M19。Windows のみが対象で、更新の取得は Rust 側が行うので CSP の `connect-src` は関係しない。`process:default` は使わない——アプリを終了させる権限は要らない）。

- [ ] **Step 6: `tauri.conf.json` を書き換える**

3箇所を触る。**`installMode` という名前のキーが2つあり、意味が違うので取り違えないこと。**

(a) `bundle` の直下に `createUpdaterArtifacts` を足す（`"active": true` の次の行）:

```json
"createUpdaterArtifacts": true,
```

(b) `bundle.windows.nsis` に `installMode` を足す。**既定と同じ値だが明示する**——`perMachine` は管理者昇格を要求し、昇格が要る NSIS では updater が動かない報告がある（tauri#7184）。既定に頼ると、将来ここを触った人が更新経路を黙って壊せる:

```json
"nsis": {
  "installMode": "currentUser",
  "languages": ["Japanese", "English"],
  "installerIcon": "icons/icon.ico",
  "uninstallerIcon": "icons/icon.ico"
}
```

(c) `plugins` に `updater` を足す（既存の `fs` と並べる）:

```json
"plugins": {
  "fs": {
    "requireLiteralLeadingDot": false
  },
  "updater": {
    "pubkey": "<Step 1 で人間から受け取った公開鍵をそのまま貼る>",
    "endpoints": ["https://github.com/Pryo-46/facet/releases/latest/download/latest.json"],
    "windows": { "installMode": "passive" }
  }
}
```

`plugins.updater.windows.installMode` を `"quiet"` にしないこと——更新後にアプリが再起動しない報告がある（tauri#7560）。

- [ ] **Step 7: Rust 側がビルドできることを確認する**

Run: `(cd src-tauri && cargo build)`
Expected: ビルド成功。`tauri-plugin-updater` / `tauri-plugin-process` が解決される

**サブシェルの括弧を外さないこと。** 外すと以降の手順が `src-tauri/` からの相対パスで走る。

- [ ] **Step 8: フロントエンドが壊れていないことを確認する**

Run: `npm test`
Expected: 既存の全件 PASS（この時点では新しいテストは無い）

Run: `npx tsc -b`
Expected: エラー無し

Run: `npm run lint`
Expected: エラー無し

- [ ] **Step 9: コミット**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json src-tauri/tauri.conf.json
git commit -m "feat(m19): updater / process プラグインを入れる"
```

---

### Task 2: 更新状態の機械（`src/core/update-check.ts`）

React も Tauri も知らない純ロジック。**このマイルストーンのテストはほぼここに集まる。**

**Files:**
- Create: `src/core/update-check.ts`
- Test: `src/core/update-check.test.ts`

**Interfaces:**
- Consumes: なし
- Produces（Task 4 が使う）:
  - `type UpdateState`（下の判別共用体）
  - `const initialUpdateState: UpdateState`
  - `startCheck(state: UpdateState): UpdateState`
  - `foundUpdate(state: UpdateState, version: string): UpdateState`
  - `foundNone(state: UpdateState): UpdateState`
  - `startInstall(state: UpdateState): UpdateState`
  - `progress(state: UpdateState, chunk: number, total: number | null): UpdateState`
  - `failed(state: UpdateState, message: string): UpdateState`
  - `canCheck(state: UpdateState): boolean`
  - `buttonLabel(state: UpdateState): string`
  - `isEmphasized(state: UpdateState): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/update-check.test.ts` を新規作成する:

```ts
import { describe, expect, it } from 'vitest'
import {
  buttonLabel,
  canCheck,
  failed,
  foundNone,
  foundUpdate,
  initialUpdateState,
  isEmphasized,
  progress,
  startCheck,
  startInstall,
} from '@/core/update-check'

describe('チェックの開始', () => {
  it('idle から checking へ入る', () => {
    expect(startCheck(initialUpdateState)).toEqual({ kind: 'checking' })
  })

  it('error からやり直せる', () => {
    expect(startCheck({ kind: 'error', message: '繋がらない' })).toEqual({ kind: 'checking' })
  })

  it('**checking 中の要求は無視する**（同じ state をそのまま返す）', () => {
    // 手動ボタンの連打と起動時チェックが重なりうる。参照ごと同じものを返して
    // React の再描画も起こさない
    const state = startCheck(initialUpdateState)
    expect(startCheck(state)).toBe(state)
  })

  it('**installing 中の要求は無視する**', () => {
    const state = startInstall(foundUpdate(startCheck(initialUpdateState), '1.2.3'))
    expect(startCheck(state)).toBe(state)
  })
})

describe('チェックの結果', () => {
  it('checking から available へ入る', () => {
    expect(foundUpdate(startCheck(initialUpdateState), '1.2.3')).toEqual({
      kind: 'available',
      version: '1.2.3',
    })
  })

  it('checking から none へ入る', () => {
    expect(foundNone(startCheck(initialUpdateState))).toEqual({ kind: 'none' })
  })

  it('**checking でないときの結果は捨てる**', () => {
    // 「常に available にする」実装と区別するための検査。遅れて届いた
    // チェック結果が installing を巻き戻さないことを守る
    const installing = startInstall(foundUpdate(startCheck(initialUpdateState), '1.2.3'))
    expect(foundUpdate(installing, '9.9.9')).toBe(installing)
    expect(foundNone(installing)).toBe(installing)
  })
})

describe('インストール', () => {
  it('available からだけ installing へ入る', () => {
    const available = foundUpdate(startCheck(initialUpdateState), '1.2.3')
    expect(startInstall(available)).toEqual({
      kind: 'installing',
      version: '1.2.3',
      downloaded: 0,
      total: null,
    })
    expect(startInstall(initialUpdateState)).toBe(initialUpdateState)
    expect(startInstall({ kind: 'none' })).toEqual({ kind: 'none' })
  })

  it('**進捗は積み上がる**', () => {
    // チャンクの大きさを変えてあるのは、「合計する」実装と「最後のチャンクを
    // そのまま入れる」実装を区別するため。同じ値を2回足すと両者が一致する
    let state = startInstall(foundUpdate(startCheck(initialUpdateState), '1.2.3'))
    state = progress(state, 0, 8000)
    state = progress(state, 1000, 8000)
    state = progress(state, 2500, 8000)
    expect(state).toEqual({
      kind: 'installing',
      version: '1.2.3',
      downloaded: 3500,
      total: 8000,
    })
  })

  it('総量が分からないままでも進捗を積める', () => {
    let state = startInstall(foundUpdate(startCheck(initialUpdateState), '1.2.3'))
    state = progress(state, 1000, null)
    state = progress(state, 2500, null)
    expect(state).toEqual({
      kind: 'installing',
      version: '1.2.3',
      downloaded: 3500,
      total: null,
    })
  })

  it('**一度分かった総量は null で上書きしない**', () => {
    let state = startInstall(foundUpdate(startCheck(initialUpdateState), '1.2.3'))
    state = progress(state, 0, 8000)
    state = progress(state, 1000, null)
    expect(state).toEqual({
      kind: 'installing',
      version: '1.2.3',
      downloaded: 1000,
      total: 8000,
    })
  })

  it('installing でないときの進捗は捨てる', () => {
    expect(progress(initialUpdateState, 1000, 8000)).toBe(initialUpdateState)
  })
})

describe('失敗', () => {
  it('checking からも installing からも error へ抜ける', () => {
    expect(failed(startCheck(initialUpdateState), '繋がらない')).toEqual({
      kind: 'error',
      message: '繋がらない',
    })
    const installing = startInstall(foundUpdate(startCheck(initialUpdateState), '1.2.3'))
    expect(failed(installing, '書き込めない')).toEqual({
      kind: 'error',
      message: '書き込めない',
    })
  })

  it('動いていないときの失敗は捨てる', () => {
    expect(failed(initialUpdateState, '繋がらない')).toBe(initialUpdateState)
  })
})

describe('ボタンの見え方', () => {
  it('動いている間は押せない', () => {
    expect(canCheck(initialUpdateState)).toBe(true)
    expect(canCheck({ kind: 'none' })).toBe(true)
    expect(canCheck({ kind: 'error', message: 'x' })).toBe(true)
    expect(canCheck(foundUpdate(startCheck(initialUpdateState), '1.2.3'))).toBe(true)
    expect(canCheck(startCheck(initialUpdateState))).toBe(false)
    expect(
      canCheck(startInstall(foundUpdate(startCheck(initialUpdateState), '1.2.3'))),
    ).toBe(false)
  })

  it('新版があるときだけ版番号を名乗り、強調する', () => {
    const available = foundUpdate(startCheck(initialUpdateState), '1.2.3')
    expect(buttonLabel(available)).toBe('v1.2.3 に更新')
    expect(isEmphasized(available)).toBe(true)

    expect(buttonLabel(initialUpdateState)).toBe('更新を確認')
    expect(buttonLabel({ kind: 'none' })).toBe('更新を確認')
    expect(buttonLabel({ kind: 'error', message: 'x' })).toBe('更新を確認')
    expect(buttonLabel(startCheck(initialUpdateState))).toBe('更新を確認')
    expect(buttonLabel(startInstall(available))).toBe('更新中')

    expect(isEmphasized(initialUpdateState)).toBe(false)
    expect(isEmphasized(startInstall(available))).toBe(false)
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/core/update-check.test.ts`
Expected: FAIL（`Failed to resolve import "@/core/update-check"`）

- [ ] **Step 3: 実装する**

`src/core/update-check.ts` を新規作成する:

```ts
/**
 * 自動アップデートの状態（コア・純ロジック。React も Tauri も知らない）。
 *
 * **持たせる判断は3つだけ**（M19 の設計）:
 * - checking / installing の間は新しいチェックを受け付けない
 *   （手動ボタンの連打と起動時チェックが重なりうる）
 * - installing からは error にしか抜けない——成功するとアプリが終了するので、
 *   成功の状態を持つ意味が無い
 * - ボタンの見え方を状態から導く（App.tsx に kind の分岐を散らさない）
 *
 * 遷移関数は**受け付けない要求に対して同じ参照を返す。** 新しいオブジェクトを
 * 作って返すと、React が「変わった」と見て再描画する
 */
export type UpdateState =
  | { kind: 'idle' }
  /** 確認中 */
  | { kind: 'checking' }
  /** 確認したが最新だった */
  | { kind: 'none' }
  | { kind: 'available'; version: string }
  /** `total` は Started イベントが総量を知らせるまで null */
  | { kind: 'installing'; version: string; downloaded: number; total: number | null }
  | { kind: 'error'; message: string }

export const initialUpdateState: UpdateState = { kind: 'idle' }

export function startCheck(state: UpdateState): UpdateState {
  if (state.kind === 'checking' || state.kind === 'installing') return state
  return { kind: 'checking' }
}

export function foundUpdate(state: UpdateState, version: string): UpdateState {
  // 遅れて届いた結果が installing を巻き戻さないようにする
  if (state.kind !== 'checking') return state
  return { kind: 'available', version }
}

export function foundNone(state: UpdateState): UpdateState {
  if (state.kind !== 'checking') return state
  return { kind: 'none' }
}

export function startInstall(state: UpdateState): UpdateState {
  if (state.kind !== 'available') return state
  return { kind: 'installing', version: state.version, downloaded: 0, total: null }
}

/**
 * ダウンロードの進捗。`chunk` は今回届いたバイト数（累計ではない）。
 * **一度分かった総量を null で上書きしない**——Started は1回しか来ず、
 * その後の Progress は総量を運ばない
 */
export function progress(state: UpdateState, chunk: number, total: number | null): UpdateState {
  if (state.kind !== 'installing') return state
  return { ...state, downloaded: state.downloaded + chunk, total: total ?? state.total }
}

export function failed(state: UpdateState, message: string): UpdateState {
  if (state.kind !== 'checking' && state.kind !== 'installing') return state
  return { kind: 'error', message }
}

export function canCheck(state: UpdateState): boolean {
  return state.kind !== 'checking' && state.kind !== 'installing'
}

/**
 * ボタンの名前。**「今どちらか」でなく「押すとどうなるか」**を名乗る
 * （額縁の他のアイコンボタンと同じ規則。App.tsx のテーマトグルのコメント）
 */
export function buttonLabel(state: UpdateState): string {
  if (state.kind === 'available') return `v${state.version} に更新`
  if (state.kind === 'installing') return '更新中'
  return '更新を確認'
}

export function isEmphasized(state: UpdateState): boolean {
  return state.kind === 'available'
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/core/update-check.test.ts`
Expected: 全件 PASS

- [ ] **Step 5: テストが実装を守っていることを確認する**

**1行ずつ壊して、対応するテストが落ちることを目で見る。** 落ちなければテストの側が誤っているので報告すること:

1. `progress` の `state.downloaded + chunk` を `chunk` にする → 「進捗は積み上がる」が落ちる
2. `progress` の `total ?? state.total` を `total` にする → 「一度分かった総量は null で上書きしない」が落ちる
3. `startCheck` の早期 return を消す → 「checking 中の要求は無視する」「installing 中の要求は無視する」が落ちる
4. `foundUpdate` の `state.kind !== 'checking'` ガードを消す → 「checking でないときの結果は捨てる」が落ちる

壊した4箇所は必ず元に戻す。**戻したことを `git diff` の出力で示すこと。**

- [ ] **Step 6: コミット**

```bash
git add src/core/update-check.ts src/core/update-check.test.ts
git commit -m "feat(m19): 更新状態の機械をコアに置く"
```

---

### Task 3: Tauri の updater API を隔離する（`src/fs/updater.ts`）

**Files:**
- Create: `src/fs/updater.ts`

**Interfaces:**
- Consumes: Task 1 で入れた `@tauri-apps/plugin-updater` / `@tauri-apps/plugin-process`
- Produces（Task 4 が使う）:
  - `interface AvailableUpdate { version: string; install: (onProgress: (downloaded: number, total: number | null) => void) => Promise<void> }`
  - `checkForUpdate(): Promise<AvailableUpdate | null>`

**このファイルに単体テストは置かない。** 既存の `src/fs/*`（`project-fs.ts` 以外）と同じ扱いで、Tauri の API を呼ぶだけの層だから。**このタスクの検証は `npx tsc -b`** ——入っている実物の型定義と噛み合うことを型検査が保証する。

- [ ] **Step 1: 入っている実物の型定義を読む**

Run: `cat node_modules/@tauri-apps/plugin-updater/dist-js/index.d.ts`
Run: `cat node_modules/@tauri-apps/plugin-process/dist-js/index.d.ts`

**次の4点を実物で確かめてから Step 2 に進む。計画の記述と違ったら、実物に従い、違いを報告すること:**

1. `check()` の戻り値の型（`Promise<Update | null>` を想定）
2. `Update` が持つプロパティ名（`version` を想定）
3. `downloadAndInstall(onEvent)` に渡ってくるイベントの形（`{ event: 'Started', data: { contentLength?: number } }` / `{ event: 'Progress', data: { chunkLength: number } }` / `{ event: 'Finished' }` を想定）
4. `relaunch()` の export 名

- [ ] **Step 2: 実装する**

`src/fs/updater.ts` を新規作成する:

```ts
import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'

/**
 * 自動アップデート。**Tauri の updater API をここに隔離する。**
 * コアは Tauri を知らない（他の src/fs/* と同じ役割）。
 *
 * 進捗イベントの累計をここで取るのは、Tauri のイベント型をコアへ漏らさない
 * ため。コア側（core/update-check.ts）が受け取るのは「今回届いたバイト数」と
 * 「総量（分かっていれば）」の2つの数だけ
 */
export interface AvailableUpdate {
  version: string
  /**
   * ダウンロードしてインストールする。**成功しても戻ってこない**——
   * Windows ではインストールの実行時に OS がプロセスを落とす
   */
  install: (onProgress: (downloaded: number, total: number | null) => void) => Promise<void>
}

/**
 * 新版があれば返す。無ければ null。
 *
 * **例外はそのまま投げる。** 握り潰すか見せるかは呼び出し側が決める——
 * 起動時のチェックは静かに諦め、利用者が押したときだけ見せる（M19 の設計）
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  const update = await check()
  if (update === null) return null
  return {
    version: update.version,
    install: async (onProgress) => {
      let downloaded = 0
      let total: number | null = null
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? null
          onProgress(0, total)
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          onProgress(event.data.chunkLength, total)
        }
      })
      // **Windows ではここへ到達しない見込み**——インストールの実行時に OS が
      // プロセスを落とすため。到達したときのために呼んでおく（害は無い）
      await relaunch()
    },
  }
}
```

**`onProgress` の第1引数は「今回届いたバイト数」であって累計ではない。** 累計は `core/update-check.ts` の `progress()` が持つ（`downloaded` の局所変数はイベント側の総量計算には使っていない。将来の読み手が累計だと誤読しないよう、この点は Step 3 の型検査だけでは守れないので注意）。

- [ ] **Step 3: 型検査を通す**

Run: `npx tsc -b`
Expected: エラー無し

Run: `npm run lint`
Expected: エラー無し（未使用変数 `downloaded` を oxlint が指摘したら、`onProgress(event.data.chunkLength, total)` に渡す形に統一されているか確認し、不要なら局所変数ごと削る。**その場合は上のコメントも合わせて直す**）

- [ ] **Step 4: 既存のテストが壊れていないことを確認する**

Run: `npm test`
Expected: 既存の全件 PASS

- [ ] **Step 5: コミット**

```bash
git add src/fs/updater.ts
git commit -m "feat(m19): Tauri の updater API を src/fs に隔離する"
```

---

### Task 4: 額縁への配線（起動時チェック・ボタン・確認・進捗）

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.dom.test.tsx`

**Interfaces:**
- Consumes: Task 2 の `update-check.ts` の全 export、Task 3 の `checkForUpdate` / `AvailableUpdate`
- Produces: なし（額縁の最終形）

- [ ] **Step 1: 失敗するテストを書く**

`src/App.dom.test.tsx` に手を入れる。**既存テストの前提を崩さないこと**——このファイルの `vi.hoisted` / `vi.mock` の並びは既存の describe が依存している。

(a) `vi.hoisted(() => ({ ... }))` のオブジェクトに、更新用の可変状態を足す（既存のキーは触らない）:

```ts
  // 自動アップデート専用の可変状態（M19）。**既定は「更新なし」**——
  // 既存テストはどれも更新を前提にしていないので、既定を変えない
  updateConfig: {
    available: null as { version: string } | null,
    checkError: null as Error | null,
  },
  installMock: vi.fn(async (_onProgress: (d: number, t: number | null) => void) => undefined),
```

分割代入にも `updateConfig` と `installMock` を足す。

(b) 既存の `vi.mock` の並びの最後に、`@/fs/updater` のモックを足す:

```ts
vi.mock('@/fs/updater', () => ({
  checkForUpdate: async () => {
    if (updateConfig.checkError !== null) throw updateConfig.checkError
    if (updateConfig.available === null) return null
    return { version: updateConfig.available.version, install: installMock }
  },
}))
```

(c) `afterEach` に後片付けを足す:

```ts
  updateConfig.available = null
  updateConfig.checkError = null
  installMock.mockClear()
  restoreUserAgent?.()
  restoreUserAgent = null
```

(d) `const App = (await import('./App')).default` の直後、`afterEach(cleanup)` の手前に、UA を差し替えるヘルパを置く:

```ts
/**
 * `currentPlatform()` は navigator.userAgent を見る（core/keyboard/platform.ts）。
 * mac での描画を確かめるテストだけがこれを呼ぶ。afterEach が必ず戻す
 */
let restoreUserAgent: (() => void) | null = null
function pretendMac(): void {
  const original = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent')
  Object.defineProperty(window.navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    configurable: true,
  })
  restoreUserAgent = () => {
    if (original === undefined) delete (window.navigator as { userAgent?: string }).userAgent
    else Object.defineProperty(window.navigator, 'userAgent', original)
  }
}
```

(e) ファイル末尾に describe を1つ足す:

```ts
describe('自動アップデート（M19）', () => {
  /**
   * 起動時チェックが解決しきるまで待つ。**待たずに手動クリックすると、
   * 多重起動の錠前（updateBusyRef）に握り潰されて何も起きない。**
   * 「押しても出ない」という誤った赤／緑になるので、手で押すテストは必ず通す
   */
  const settleStartupCheck = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it('起動時に新版が見つかると、ボタンが版番号を名乗る', async () => {
    updateConfig.available = { version: '1.2.3' }
    render(<App />)
    expect(await screen.findByRole('button', { name: 'v1.2.3 に更新' })).toBeTruthy()
  })

  it('**起動時チェックが失敗しても画面には何も出ない**', async () => {
    updateConfig.checkError = new Error('繋がらない')
    render(<App />)
    await settleStartupCheck()
    expect(screen.queryByText(/繋がらない/)).toBeNull()
    // **「出ていない」だけでは、まだ走っていないのか黙っているのかを
    // 区別できない。** 走り終わっていた証拠として、同じ失敗を手で押すと
    // 今度はトーストが出ることまで見る
    fireEvent.click(screen.getByRole('button', { name: '更新を確認' }))
    expect(await screen.findByText(/繋がらない/)).toBeTruthy()
  })

  it('**手動チェックが失敗するとトーストが出る**', async () => {
    render(<App />)
    await settleStartupCheck()
    updateConfig.checkError = new Error('繋がらない')
    fireEvent.click(screen.getByRole('button', { name: '更新を確認' }))
    expect(await screen.findByText(/繋がらない/)).toBeTruthy()
  })

  it('手動チェックで最新だったらトーストで知らせる', async () => {
    render(<App />)
    await settleStartupCheck()
    // 起動時チェックは黙って終わっている（トーストを出すのは manual だけ）
    expect(screen.queryByText('facet は最新版です')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '更新を確認' }))
    expect(await screen.findByText('facet は最新版です')).toBeTruthy()
  })

  it('**確認を承諾するまでインストールは始まらない**', async () => {
    updateConfig.available = { version: '1.2.3' }
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'v1.2.3 に更新' }))
    expect(await screen.findByText('facet を更新する')).toBeTruthy()
    expect(installMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '更新する' }))
    await waitFor(() => expect(installMock).toHaveBeenCalledTimes(1))
  })

  it('確認を取り消すとインストールされない', async () => {
    updateConfig.available = { version: '1.2.3' }
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'v1.2.3 に更新' }))
    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))
    // ダイアログが閉じたことまで見る。**「呼ばれていない」だけでは、手前で
    // 例外が飛んで止まっていても緑になる**（lessons-for-planning）
    await waitFor(() => expect(screen.queryByText('facet を更新する')).toBeNull())
    expect(installMock).not.toHaveBeenCalled()
  })

  it('**端末が動いているときは切断を警告する**', async () => {
    updateConfig.available = { version: '1.2.3' }
    await openPane()
    fireEvent.click(await screen.findByRole('button', { name: 'v1.2.3 に更新' }))
    expect(await screen.findByText(/Claude Code のセッションは切断されます/)).toBeTruthy()
  })

  it('端末が動いていなければ切断の警告は出ない', async () => {
    updateConfig.available = { version: '1.2.3' }
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'v1.2.3 に更新' }))
    expect(await screen.findByText('facet を更新する')).toBeTruthy()
    expect(screen.queryByText(/Claude Code のセッションは切断されます/)).toBeNull()
  })

  it('**mac ではボタンを出さない**', async () => {
    pretendMac()
    updateConfig.available = { version: '1.2.3' }
    render(<App />)
    // 起動時チェックが走りうる時間を与えてから見る。**待たないと「まだ
    // 出ていないだけ」でも緑になる**
    await settleStartupCheck()
    expect(screen.queryByRole('button', { name: 'v1.2.3 に更新' })).toBeNull()
    expect(screen.queryByRole('button', { name: '更新を確認' })).toBeNull()
    // 額縁自体は描画されている（描画そのものが落ちていて全部 null、を弾く）
    expect(screen.getByRole('button', { name: 'フォルダを開く' })).toBeTruthy()
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/App.dom.test.tsx -t '自動アップデート'`
Expected: FAIL（ボタンが存在しない）。**既存の describe が緑のままであることも確認する**——`npx vitest run src/App.dom.test.tsx` で新規分だけが赤いこと

- [ ] **Step 3: `App.tsx` に配線する**

(a) import を足す（既存の並び順に合わせる）:

```ts
import { Download, Moon, PanelLeft, Redo2, RefreshCw, Sun, SquareTerminal, Undo2 } from 'lucide-react'
```

```ts
import {
  buttonLabel,
  canCheck,
  failed,
  foundNone,
  foundUpdate,
  initialUpdateState,
  isEmphasized,
  progress as advanceProgress,
  startCheck,
  startInstall,
  type UpdateState,
} from '@/core/update-check'
import { checkForUpdate, type AvailableUpdate } from '@/fs/updater'
```

`progress` は `as advanceProgress` で受ける。衝突しているからではなく（`App.tsx` に `progress` という名前は無い）、**`App.tsx` の文脈では「何の進捗か」が読めないから**。

(b) 状態を持つ。`available` の実体（`install` を持つオブジェクト）は state に入れず ref に持つ——関数を state に入れると `useState` の遅延初期化と取り違えられる:

```ts
  const [updateState, setUpdateState] = useState<UpdateState>(initialUpdateState)
  const availableUpdateRef = useRef<AvailableUpdate | null>(null)
  /**
   * 更新の非同期処理が走っている間の錠前。**state で判定しないこと**——
   * `setUpdateState` に渡す更新関数が同期に呼ばれる保証は無いため、そこで
   * 「始まったか」を見ると、連打や「起動時チェックと手動チェックの重なり」で
   * 2本走る隙間ができる。`canCheck(state)` はボタンの `disabled` を導く役で、
   * こちらは実際の多重起動を止める役。**役が違うので両方要る**
   */
  const updateBusyRef = useRef(false)
```

(c) チェックを1本にまとめる。**起動時と手動の違いは「失敗を見せるかどうか」だけ**:

```ts
  /**
   * 更新を確認する。**起動時は静かに諦める**——ネットワークが無い環境で
   * 起動するたびにエラーが出るのは雑音でしかない。見せるのは利用者が
   * 自分でボタンを押したときだけ（M19 の設計）
   */
  const runUpdateCheck = useCallback(
    async (manual: boolean) => {
      if (updateBusyRef.current) return
      updateBusyRef.current = true
      setUpdateState(startCheck)
      try {
        const update = await checkForUpdate()
        availableUpdateRef.current = update
        setUpdateState((prev) =>
          update === null ? foundNone(prev) : foundUpdate(prev, update.version),
        )
        if (manual && update === null) showToast({ message: 'facet は最新版です', key: 'update' })
      } catch (err: unknown) {
        console.error('更新の確認に失敗しました', err)
        const message = err instanceof Error ? err.message : String(err)
        setUpdateState((prev) => failed(prev, message))
        if (manual) showToast({ message: `更新を確認できませんでした: ${message}`, key: 'update' })
      } finally {
        updateBusyRef.current = false
      }
    },
    [showToast],
  )
```

(d) 起動時チェックの effect。**`readLastProjectDir` の復元と同じ形**（`useRef` の一回性ガード＋`cancelled`）:

```ts
  const updateCheckedRef = useRef(false)
  useEffect(() => {
    // StrictMode の二重マウントで2回チェックしない（起動時復元と同じ形）
    if (updateCheckedRef.current) return
    updateCheckedRef.current = true
    void runUpdateCheck(false)
  }, [runUpdateCheck])
```

`cancelled` は要らない——`runUpdateCheck` の中の setState はアンマウント後でも React 18 以降は警告を出さず、実害が無い。**要らないと判断した理由をコメントに残すこと。**

(e) インストールの要求。確認ダイアログは既存のモーダルキューに乗せる:

```ts
  const requestInstall = useCallback(
    (version: string) => {
      const running = hasRunning(terminals)
      setModals((prev) =>
        pushModal(prev, {
          kind: 'confirm',
          key: 'update',
          title: 'facet を更新する',
          description: [
            `v${version} をダウンロードしてインストールします。`,
            '更新のため facet を終了します。編集内容は自動保存済みです。',
            ...(running ? ['**Claude Code のセッションは切断されます。**'] : []),
            '更新後に facet を開き直してください。',
          ].join('\n'),
          confirmLabel: '更新する',
          onConfirm: async () => {
            const update = availableUpdateRef.current
            if (update === null || updateBusyRef.current) return
            updateBusyRef.current = true
            setUpdateState((prev) => startInstall(prev))
            try {
              await update.install((chunk, total) => {
                setUpdateState((prev) => advanceProgress(prev, chunk, total))
              })
              // **成功してもここへは来ない見込み**（プロセスが落ちる）。
              // 来てしまった場合は installing のまま置く——`canCheck` が false を
              // 返し続けるので、更新中に見えるボタンのまま止まる。
              // **錠前をここで開けないのは意図的**（spec 5節「installing からは
              // error にしか抜けない」）
            } catch (err: unknown) {
              updateBusyRef.current = false
              console.error('更新のインストールに失敗しました', err)
              const message = err instanceof Error ? err.message : String(err)
              setUpdateState((prev) => failed(prev, message))
              showToast({ message: `更新できませんでした: ${message}`, key: 'update' })
            }
          },
        }),
      )
    },
    [showToast, terminals],
  )
```

**`description` の `**…**` は Markdown ではなくただの文字列**——`ConfirmDialog` は `whitespace-pre-line` で改行を活かすだけで、強調記法は解釈しない。**実装時に確認し、太字が出ないなら記号を外すこと**（テストは `/Claude Code のセッションは切断されます/` で引いているので、記号の有無に依存しない）。

(f) 進捗の Toast。`installing` の間だけ出す:

```ts
  useEffect(() => {
    if (updateState.kind !== 'installing') return
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1)
    const message =
      updateState.total === null
        ? `更新をダウンロード中… ${mb(updateState.downloaded)} MB`
        : `更新をダウンロード中… ${mb(updateState.downloaded)} / ${mb(updateState.total)} MB`
    showToast({ message, key: 'update' })
  }, [updateState, showToast])
```

**`key: 'update'` で置き換える**ので積み上がらない（`src/core/toasts.ts` の `pushToast` が同じ key を差し替える）。チェックのエラーと最新通知にも同じ key を使っているので、更新まわりのトーストは常に1本に保たれる。

(g) ヘッダにボタンを足す。**テーマトグルの直前**（`ml-auto` の div の中、`SquareTerminal` のボタンとテーマトグルの間）:

```tsx
          {/* 自動アップデート（M19）。**mac では出さない**——latest.json に
              darwin-* を載せないので、押せば必ず「最新版です」と言う
              嘘をつくボタンになる。強調は TerminalPane の選択中タブと
              同じ bg-surface-accent（新しい役割トークンは足さない） */}
          {currentPlatform() !== 'mac' && (
            <button
              type="button"
              aria-label={buttonLabel(updateState)}
              title={buttonLabel(updateState)}
              disabled={!canCheck(updateState)}
              className={
                isEmphasized(updateState)
                  ? `${buttonBase} gap-1 bg-surface-accent px-2 py-1 text-ink`
                  : `${buttonBase} p-1 text-ink-muted`
              }
              onClick={() => {
                if (updateState.kind === 'available') requestInstall(updateState.version)
                else void runUpdateCheck(true)
              }}
            >
              {isEmphasized(updateState) ? (
                <>
                  <Download aria-hidden className="size-4" />
                  <span className="text-xs">{buttonLabel(updateState)}</span>
                </>
              ) : (
                <RefreshCw aria-hidden className="size-4" />
              )}
            </button>
          )}
```

**`currentPlatform()` を描画のたびに呼ぶこと。** モジュールスコープの定数にすると、テストが UA を差し替えても効かない（`App.tsx:177` が既に描画時に呼んでいるので、そちらの流儀に揃う）。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/App.dom.test.tsx`
Expected: 新規9件を含めて全件 PASS

- [ ] **Step 5: 新しい accessible name が既存のクエリと衝突していないことを確認する**

Run: `grep -rn "更新" src/ --include=*.test.tsx --include=*.test.ts`
Expected: 本タスクで足したもの以外に「更新を確認」「更新する」で始まるクエリが無いこと。**衝突していたら、直すのは既存テストの正規表現の側**（新しい文言が確定事項のため。M8 の教訓）

- [ ] **Step 6: 全体が緑であることを確認する**

Run: `npm test`
Expected: 全件 PASS

Run: `npx tsc -b`
Expected: エラー無し

Run: `npm run lint`
Expected: エラー無し

**`src/styles/conventions.test.ts` が落ちたら、それは色値かフォントサイズの直書き。** 使える段は `text-xs / text-sm / text-base / text-lg / text-2xl` の5段のみ、色は役割名のみ。

- [ ] **Step 7: コミット**

```bash
git add src/App.tsx src/App.dom.test.tsx
git commit -m "feat(m19): 額縁に更新ボタンと起動時チェックを足す"
```

---

### Task 5: リリース手順（`scripts/make-latest-json.mjs` と `docs/release.md`）

**Files:**
- Create: `scripts/make-latest-json.mjs`
- Create: `scripts/make-latest-json.test.mjs`
- Modify: `vite.config.ts`（Vitest の走査対象に `scripts/` を足す）
- Create: `docs/release.md`

**Interfaces:**
- Consumes: なし（アプリのコードとは独立）
- Produces: `packageVersion(text)` / `tauriConfVersion(text)` / `cargoPackageVersion(text)` / `resolveVersion({...})` / `buildLatestJson({...})`

- [ ] **Step 1: Vitest が `scripts/` を見るようにする**

`vite.config.ts` の `test.include` を書き換える:

```ts
    // src-tauri 配下（Rust）は Vitest の対象外。
    // scripts/ はリリース補助スクリプト（M19）。src/ の下に置けないので
    // 走査対象を明示して足す
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.test.mjs'],
```

- [ ] **Step 2: 失敗するテストを書く**

`scripts/make-latest-json.test.mjs` を新規作成する:

```js
import { describe, expect, it } from 'vitest'
import {
  buildLatestJson,
  cargoPackageVersion,
  packageVersion,
  resolveVersion,
  tauriConfVersion,
} from './make-latest-json.mjs'

// **依存の version 行を紛れ込ませてある。** [package] の版だけを取る実装と
// 「最初に見つかった version 行」を取る実装を区別するため
const CARGO = `[package]
name = "facet"
version = "1.2.3"
edition = "2021"

[dependencies]
tauri = { version = "9.9.9", features = [] }
version = "8.8.8"
`

describe('版番号の取り出し', () => {
  it('package.json から取る', () => {
    expect(packageVersion('{"name":"facet","version":"1.2.3"}')).toBe('1.2.3')
  })

  it('tauri.conf.json から取る', () => {
    expect(tauriConfVersion('{"productName":"facet","version":"1.2.3"}')).toBe('1.2.3')
  })

  it('**Cargo.toml は [package] の版を取る**（依存の version 行に釣られない）', () => {
    expect(cargoPackageVersion(CARGO)).toBe('1.2.3')
  })

  it('[package] が無ければ落とす', () => {
    expect(() => cargoPackageVersion('[dependencies]\nversion = "8.8.8"\n')).toThrow(/\[package\]/)
  })
})

describe('3箇所の整合', () => {
  it('揃っていればその版を返す', () => {
    expect(
      resolveVersion({
        packageJson: '{"version":"1.2.3"}',
        tauriConf: '{"version":"1.2.3"}',
        cargoToml: CARGO,
      }),
    ).toBe('1.2.3')
  })

  it('**揃っていなければ落とす。メッセージに3つの実際の値が出る**', () => {
    let thrown = null
    try {
      resolveVersion({
        packageJson: '{"version":"1.2.4"}',
        tauriConf: '{"version":"1.2.3"}',
        cargoToml: CARGO,
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).not.toBeNull()
    expect(thrown.message).toContain('1.2.4')
    expect(thrown.message).toContain('1.2.3')
    expect(thrown.message).toContain('package.json')
    expect(thrown.message).toContain('tauri.conf.json')
    expect(thrown.message).toContain('Cargo.toml')
  })
})

describe('latest.json の組み立て', () => {
  it('windows-x86_64 だけを載せ、URL にタグと版を埋める', () => {
    expect(
      buildLatestJson({ version: '1.2.3', signature: 'SIG', pubDate: '2026-08-19T00:00:00.000Z' }),
    ).toEqual({
      version: '1.2.3',
      notes: 'https://github.com/Pryo-46/facet/releases/tag/v1.2.3',
      pub_date: '2026-08-19T00:00:00.000Z',
      platforms: {
        'windows-x86_64': {
          signature: 'SIG',
          url: 'https://github.com/Pryo-46/facet/releases/download/v1.2.3/facet_1.2.3_x64-setup.exe',
        },
      },
    })
  })

  it('**darwin のキーを作らない**（mac は対象外）', () => {
    const json = buildLatestJson({
      version: '1.2.3',
      signature: 'SIG',
      pubDate: '2026-08-19T00:00:00.000Z',
    })
    expect(Object.keys(json.platforms)).toEqual(['windows-x86_64'])
  })
})
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `npx vitest run scripts/make-latest-json.test.mjs`
Expected: FAIL（`./make-latest-json.mjs` が解決できない）

- [ ] **Step 4: 実装する**

`scripts/make-latest-json.mjs` を新規作成する:

```js
/**
 * リリースに添付する latest.json を作る（M19）。
 *
 * updater は「全成果物に署名」と「latest.json を毎回添付」が必須になる。
 * 手で書くと版番号と署名がずれ、**「更新したのに更新されない」という
 * 最も分かりにくい壊れ方**をするので、ここで機械にやらせる。
 *
 * **判断は置かない。** 版が3箇所で揃っていなければ落とすだけで、
 * どれかに揃えにいくことはしない。
 *
 * 使い方（ビルド後に実行する。詳しくは docs/release.md）:
 *   node scripts/make-latest-json.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const REPO = 'https://github.com/Pryo-46/facet'

export function packageVersion(text) {
  return JSON.parse(text).version
}

export function tauriConfVersion(text) {
  return JSON.parse(text).version
}

/**
 * Cargo.toml の `[package]` セクションの version を取る。
 *
 * **セクションを切ってから探すこと。** 素の `/^version\s*=/m` は
 * `[dependencies]` に裸の version 行があると先にそちらを拾いうる
 */
export function cargoPackageVersion(text) {
  const start = text.search(/^\[package\]\s*$/m)
  if (start < 0) throw new Error('Cargo.toml に [package] セクションが無い')
  const rest = text.slice(start + '[package]'.length)
  const end = rest.search(/^\[/m)
  const section = end < 0 ? rest : rest.slice(0, end)
  const match = section.match(/^version\s*=\s*"([^"]+)"/m)
  if (match === null) throw new Error('Cargo.toml の [package] に version が無い')
  return match[1]
}

/**
 * 3箇所の版が一致することを確かめ、その版を返す。
 * 揃っていなければ、3つの実際の値を並べて落とす
 */
export function resolveVersion({ packageJson, tauriConf, cargoToml }) {
  const versions = {
    'package.json': packageVersion(packageJson),
    'src-tauri/tauri.conf.json': tauriConfVersion(tauriConf),
    'src-tauri/Cargo.toml': cargoPackageVersion(cargoToml),
  }
  const unique = [...new Set(Object.values(versions))]
  if (unique.length !== 1) {
    const lines = Object.entries(versions).map(([file, v]) => `  ${file}: ${v}`)
    throw new Error(`版番号が揃っていない:\n${lines.join('\n')}`)
  }
  return unique[0]
}

export function buildLatestJson({ version, signature, pubDate }) {
  return {
    version,
    notes: `${REPO}/releases/tag/v${version}`,
    pub_date: pubDate,
    platforms: {
      // **mac は載せない**（M19 のスコープ。載せると未署名の .app が配られる）
      'windows-x86_64': {
        signature,
        url: `${REPO}/releases/download/v${version}/facet_${version}_x64-setup.exe`,
      },
    },
  }
}

function main() {
  const version = resolveVersion({
    packageJson: readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
    tauriConf: readFileSync(path.join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8'),
    cargoToml: readFileSync(path.join(ROOT, 'src-tauri/Cargo.toml'), 'utf8'),
  })
  const sigPath = path.join(
    ROOT,
    'src-tauri/target/release/bundle/nsis',
    `facet_${version}_x64-setup.exe.sig`,
  )
  const signature = readFileSync(sigPath, 'utf8').trim()
  const out = path.join(ROOT, 'latest.json')
  writeFileSync(out, `${JSON.stringify(buildLatestJson({ version, signature, pubDate: new Date().toISOString() }), null, 2)}\n`)
  console.log(`latest.json を書き出した（v${version}）: ${out}`)
}

// 直接実行されたときだけ走らせる（テストからは import されるだけ）
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run scripts/make-latest-json.test.mjs`
Expected: 全件 PASS

- [ ] **Step 6: テストが実装を守っていることを確認する**

`cargoPackageVersion` のセクション切り出しを消して `text.match(/^version\s*=\s*"([^"]+)"/m)` だけにする → 「Cargo.toml は [package] の版を取る」が落ちること（`CARGO` の `[dependencies]` にある裸の `version = "8.8.8"` を拾う）を確認し、元に戻す。**戻したことを `git diff` の出力で示すこと。**

- [ ] **Step 7: `latest.json` を成果物として追跡しない**

`.gitignore` に1行足す（既にあれば不要）:

```
# リリースのたびに作り直す成果物（M19。GitHub Releases の asset として上げる）
/latest.json
```

- [ ] **Step 8: `docs/release.md` を書く**

`docs/release.md` を新規作成する。次を必ず含めること:

1. **鍵の生成**（初回のみ、人間の作業）: `npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\facet.key"`。**秘密鍵とパスワードをパスワードマネージャへバックアップする。失うと以後どのバージョンからも自動更新できなくなる**
2. **版番号を3箇所そろえて上げる**: `package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`。スクリプトが検査するが、上げるのは手作業
3. **環境変数を置く**（PowerShell）:
   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\facet.key"
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<パスワード>"
   ```
   **`.env` に書かないこと**（リポジトリに入りうる）
4. **ビルド**: `npm run tauri build`。`src-tauri/target/release/bundle/nsis/` に `facet_<v>_x64-setup.exe` と `.exe.sig` ができる
5. **`latest.json` を作る**: `node scripts/make-latest-json.mjs`
6. **リリースを作る**:
   ```bash
   gh release create v<v> --title "v<v>" --notes-file <リリースノート> \
     "src-tauri/target/release/bundle/nsis/facet_<v>_x64-setup.exe" \
     latest.json
   ```
   **`latest.json` を上げ忘れると更新経路が止まる。**
7. **mac の dmg は mac 実機で別に作り、同じリリースへ足す**: `gh release upload v<v> <dmg のパス>`。**mac は自動アップデートの対象外**なので `latest.json` には載せない
8. **インストーラの種類は一致していなければならない**（NSIS で入れたなら NSIS で更新する）。MSI は `bundle.targets` から外してある（理由は `docs/open-issues.md`）

- [ ] **Step 9: 全体が緑であることを確認する**

Run: `npm test`
Expected: 全件 PASS（`scripts/` のテストも走ること。**走っていなければ Step 1 の `include` が効いていない**）

Run: `npx tsc -b`
Expected: エラー無し

Run: `npm run lint`
Expected: エラー無し

- [ ] **Step 10: コミット**

```bash
git add scripts/make-latest-json.mjs scripts/make-latest-json.test.mjs vite.config.ts .gitignore docs/release.md
git commit -m "feat(m19): latest.json の生成スクリプトとリリース手順を置く"
```

---

### Task 6: 全体検証と申し送り

**Files:**
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/overview-rev.md`（7章に小節を1つ足す）
- Modify: `docs/open-issues.md`
- Create: `docs/history/m19-core-auto-update.md`

**Interfaces:**
- Consumes: Task 1〜5 の全成果物
- Produces: なし（マイルストーンの締め）

- [ ] **Step 1: フロントエンドの全テストを実行する**

Run: `npm test`
Expected: 全件 PASS

- [ ] **Step 2: 型チェックと lint を実行する**

Run: `npx tsc -b`
Expected: エラー無し

Run: `npm run lint`
Expected: エラー無し

- [ ] **Step 3: Rust 側のビルドとテストを実行する**

Run: `(cd src-tauri && cargo build && cargo test)`
Expected: ビルド成功、既存テスト（`pty.rs`）が全件 PASS。**プラグイン登録だけなので Rust 側に新しいテストは足していない**（`allow_skill_dir` / `allow_project_dir` と同じ扱い。spec テスト方針節）

- [ ] **Step 4: README を直す**

`README.md` の「1. インストールする」の表の下、「署名していないので上の警告は必ず出る。社内配布の前提でそう割り切っている。」の直後に1段落足す:

> **Windows は2回目以降の更新がアプリ内でできる。** 新しい版が出ていると額縁の右上のボタンが「v◯.◯.◯ に更新」に変わるので、押せばダウンロードから再インストールまで進む（更新のためアプリは一度終了する）。**macOS は対象外**——このページから落とし直してほしい。

- [ ] **Step 5: `docs/README.md` の地図に `release.md` を登録する**

「どれを読むか」の表の `project-setup.md` の行の直後に足す:

```markdown
| リリースの出し方・署名鍵の扱い | [`release.md`](release.md) |
```

- [ ] **Step 6: `docs/overview-rev.md` の7章に反映する**

7章（技術スタック）の末尾に小節を1つ足す。**章番号は動かさない**（`rev N章` は 249 箇所から参照されている）。書く内容:

- 配布は GitHub Releases。**Windows のみ Tauri の updater プラグインで自動更新する**（エンドポイントは `releases/latest/download/latest.json`）
- **mac を対象にしないのは updater の制約ではなく、未署名の `.app` が Gatekeeper に弾かれる現状が updater の手前にあるため。** 署名（Apple Developer Program）は別の意思決定
- **minisign の秘密鍵は1台にしか置かない。** 失うと以後どのバージョンからも自動更新できなくなる。手順は `docs/release.md`
- 更新の適用はアプリを終了させる（Windows の制約）ので、**利用者が押したときにしか走らせない**

- [ ] **Step 7: `docs/open-issues.md` を更新する**

- 「挙動の穴」に、実機確認で確定しなかった項目を `[m19]` のタグで足す（自動再起動の有無・SmartScreen の有無のうち、Step 8 で解決しなかったもの）
- 「次に手を付ける候補」に**未署名配布そのもの**（mac の Gatekeeper・Windows の SmartScreen）を1件足す。M19 はこれを解決していない
- **解消したものがあれば消す。** 消し忘れると残件が幽霊として残る

- [ ] **Step 8: 実機で確認する（人間の作業。エージェントは実行しない）**

**エージェントは Tauri の GUI を操作できない。** 人間に次を依頼する。

まず開発ビルドで見える範囲を確認する（`npm run tauri dev`）:

1. ネットワークを切って起動し、**何も表示されないこと**（静かな失敗）
2. ネットワークを切って更新ボタンを押し、**トーストにエラーが出ること**
3. ネットワークを繋いで押し、**「facet は最新版です」が出ること**（v1.0.0 のままなら最新なので）

次に、**中身の変更がほぼ無い v1.0.1 を本物のリリースとして出し**、v1.0.0 から実際に更新されるかを見る。ローカルの静的サーバで代用しないこと——本番と経路（HTTPS・GitHub のリダイレクト・`releases/latest/download` の解決）が違い、確認したいことが確認できない:

4. v1.0.0 を起動して、ボタンが「v1.0.1 に更新」に変わるか
5. 押して確認ダイアログ → ダウンロード進捗のトースト → インストールまで通るか
6. **UAC が出ないか**（`nsis.installMode: currentUser` の想定どおりか）
7. **SmartScreen が出ないか**（updater が起動するインストーラに mark-of-the-web が付かない想定どおりか）
8. **更新後にアプリが自動で戻ってくるか**
9. 戻ってきた（あるいは手で開いた）アプリが 1.0.1 になっているか

**8 が「戻ってこない」でも不具合として追わない**——確認ダイアログの文面（「更新後に facet を開き直してください」）が既に吸収している。戻ってくることが確認できたら、その一文を削って `App.tsx` を直し、テストも合わせて直す。

- [ ] **Step 9: 申し送りを書く**

`docs/history/m19-core-auto-update.md` を新規作成する。書くこと:

- 実装で確定した事項（`installMode` が2つあること、`#[cfg(desktop)]` でプラグインを分けた理由、`latest.json` の形）
- mac を外した判断とその理由
- **実機確認の結果**（Step 8 の1〜9それぞれ。未実施なら「未実施」と書く。`open-issues.md` の「次に手を付ける候補」にも載せる）
- 見つかった欠陥があれば

**以後この文書は変えない。**

- [ ] **Step 10: コミット**

```bash
git add README.md docs/README.md docs/overview-rev.md docs/open-issues.md docs/history/m19-core-auto-update.md
git commit -m "docs(m19): 申し送りを書き、rev 7章に配布と更新の方針を反映する"
```
