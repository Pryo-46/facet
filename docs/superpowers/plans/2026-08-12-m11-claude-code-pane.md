# M11 実装計画: Claude Code ペイン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ヘッダのボタン1個で右ペインに Claude Code の端末を開き、会議中に Skill を走らせられるようにする。

**Architecture:** PTY は Rust（`portable-pty`）に持たせ、判断は一切置かず生バイトを流すだけにする。フロントは `@xterm/xterm` で描画し、タブの台帳・Skill 同期・ライフサイクルはすべて `src/core/` の純ロジック（I/O 注入）に置く。プロジェクトフォルダを開くたびに、同梱した Skill をそのフォルダの `.claude/skills/` へ置き直す。

**Tech Stack:** Tauri 2 / Rust（`portable-pty`, `base64`）/ React 19 / TypeScript / `@xterm/xterm` / Vitest（`node` 既定、DOM は jsdom）

**設計スペック:** [`2026-08-12-m11-claude-code-pane-design.md`](2026-08-12-m11-claude-code-pane-design.md)。**決定の理由はすべてそこにある。** 本書は手順だけを持つ。

## Global Constraints

- **色値をソースに直書きしない。** 役割トークン（`text-ink` / `bg-surface` / `border-rule` / `text-ink-muted` / `text-warning`）だけを使う。`src/styles/conventions.test.ts` がソースを走査して機械的に弾く（rev 9章）
- **文字サイズは `text-xs` / `text-sm` / `text-base` / `text-lg` の4段だけ。** `text-xl` 以上と任意値 `text-[...]` は同じ検査が弾く
- **UI の文言はすべて日本語。**
- **永続化しない。** `localStorage` / `sessionStorage` を使わない。ペイン幅も畳み状態も「アプリを閉じるまで」（M8 決定7）
- **Rust に判断を置かない。** 実行ファイル名・引数・作業ディレクトリは TypeScript が決めて渡す。Rust 側のコードに `claude` という文字列を書かない（rev 7章、設計 決定3）
- **新しい Tauri の JS API を使ったら `src-tauri/capabilities/default.json` を必ず確認する。** 権限が無いと**実行時に静かに動かない**（`docs/project-setup.md`。既に3回踏んでいる）
- **完了条件は毎回この3本が緑であること**: `npm test && npx tsc -b && npm run lint`
- **テストファイルも型チェック対象**（`tsconfig.test.json`）
- **`sample-project/` の変更はコミットしない。** 実機確認の遊び場（`CLAUDE.md`）。コミット前に `git status --short` を見る
- **新しいボタンは `src/components/button-styles.ts` の `buttonBase` を通す**（自前レイアウトを持つものを除く。rev 9章）

---

## File Structure

| ファイル | 責任 |
| --- | --- |
| `src-tauri/src/pty.rs` **(新)** | PTY を開き、子を起動し、バイト列を流す。判断は持たない |
| `src-tauri/src/lib.rs` | `PtyState` の `manage` と invoke_handler への登録（4行） |
| `src-tauri/Cargo.toml` | `portable-pty` / `base64` の追加 |
| `src-tauri/capabilities/default.json` | `fs:allow-mkdir` / `fs:allow-remove` と `$RESOURCE` の読み取り |
| `src-tauri/tauri.conf.json` | `bundle.resources` に `.claude/skills/` |
| `src/fs/pty.ts` **(新)** | `invoke` と `Channel` の薄いラッパ。`PtyIo` の Tauri 実装。生きている PTY の台帳と `killAllPtys` |
| `src/fs/skill-resources.ts` **(新)** | 同梱 Skill の読み出しとプロジェクトフォルダへの書き込み。`SkillSyncIo` の Tauri 実装 |
| `src/core/terminal/pty-io.ts` **(新)** | `PtyIo` の型だけ。コアは Tauri を知らない |
| `src/core/terminal/sessions.ts` **(新)** | タブの台帳。連番・開閉・アクティブ切替・一括終了の純関数 |
| `src/core/skill-sync.ts` **(新)** | 同梱 Skill の同期。同梱名の一覧を持つ |
| `src/core/keyboard/global-layer.ts` **(新)** | グローバル層がキーを無視すべきかの純関数 |
| `src/components/TerminalTab.tsx` **(新)** | xterm 1本と PTY 1本の対応。fit と resize |
| `src/components/TerminalPane.tsx` **(新)** | ペインの枠とタブバー |
| `src/components/PaneSplitter.tsx` **(新)** | ペイン幅のドラッグハンドル（`useColumnResize` を敷く） |
| `src/App.tsx` | ヘッダのボタン2つ、レイアウト、ライフサイクルの配線 |
| `src/core/column-resize.ts` | 先頭コメントに「額縁のペイン幅もここを通る」を追記 |

---

## Task 1: PTY を Rust に持たせ、実機で `claude` が立ち上がることを確認する

**このタスクが通らないと以降のすべてが無意味になる。最初に潰す**（設計 決定9）。

**Files:**
- Create: `src-tauri/src/pty.rs`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`
- Create: `src/core/terminal/pty-io.ts`, `src/fs/pty.ts`

**Interfaces:**
- Produces: Tauri コマンド `pty_spawn` / `pty_write` / `pty_resize` / `pty_kill`、TypeScript の `PtyIo`（Task 4 が使う）、`killAllPtys()`（Task 8 が使う）

**このタスクにテストは書かない。** Rust は判断を持たないため単体テストの対象にならず（設計 9章）、担保は実機確認。代わりに**手で動かす手順を Step に入れる**。

- [ ] **Step 1: クレートを足す**

```bash
cd src-tauri
cargo add portable-pty
cargo add base64
cd ..
```

`Cargo.toml` に追記されたら、なぜ要るかのコメントを既存の書き方（`trash` / `tauri-plugin-clipboard-manager` の直上コメント）に合わせて足す:

```toml
# PTY（擬似端末）。Claude Code は raw mode の TUI なので、
# tauri-plugin-shell の stdout ストリームでは描画も入力も成立しない。
# Windows では ConPTY を使う
portable-pty = "0.9"
# PTY の出力を Channel へ載せるため。生バイトを JSON の数値配列で送ると
# 4倍に膨らむので base64 の文字列にする（デコードは xterm 側）
base64 = "0.22"
```

- [ ] **Step 2: `src-tauri/src/pty.rs` を書く**

```rust
//! PTY（擬似端末）のホスト。
//!
//! **判断を一切置かない**（rev 7章の例外3つ目。`move_to_trash` と同じ性格）。
//! 実行ファイル名・引数・作業ディレクトリは TypeScript 側が決めて渡す。
//! このファイルに `claude` という文字列は現れない。

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;

use base64::Engine as _;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::ipc::Channel;

/// 1回の読み取りで運ぶ最大バイト数。TUI の1フレームが収まる程度でよい
const READ_BUF: usize = 8192;

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum PtyEvent {
    /// **base64 で運ぶ。** ここで String::from_utf8 すると、読み取りの区切りが
    /// マルチバイトの途中に落ちたときに日本語が化ける。デコードは xterm に任せる
    Data { base64: String },
    Exit { code: Option<i32> },
}

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState {
    next_id: Mutex<u32>,
    sessions: Mutex<HashMap<u32, PtySession>>,
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }
}

#[tauri::command]
pub fn pty_spawn(
    state: tauri::State<'_, PtyState>,
    program: String,
    args: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
    channel: Channel<PtyEvent>,
) -> Result<u32, String> {
    let pair = native_pty_system()
        .openpty(size(cols, rows))
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(program);
    for a in args {
        cmd.arg(a);
    }
    cmd.cwd(cwd);

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    // **spawn 後に slave を落とす。** 残すと最後の書き手が消えず、
    // 子が終了しても reader が EOF にならない
    drop(pair.slave);

    let killer = child.clone_killer();
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let id = {
        let mut n = state.next_id.lock().map_err(|e| e.to_string())?;
        *n += 1;
        *n
    };

    let out = channel.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; READ_BUF];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let base64 = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                    if out.send(PtyEvent::Data { base64 }).is_err() {
                        break;
                    }
                }
            }
        }
    });

    let done = channel.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().map(|s| s.exit_code() as i32);
        let _ = done.send(PtyEvent::Exit { code });
    });

    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id, PtySession { master: pair.master, writer, killer });
    Ok(id)
}

#[tauri::command]
pub fn pty_write(state: tauri::State<'_, PtyState>, id: u32, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions.get_mut(&id).ok_or("その端末はもうありません")?;
    session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(
    state: tauri::State<'_, PtyState>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions.get(&id).ok_or("その端末はもうありません")?;
    session.master.resize(size(cols, rows)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(state: tauri::State<'_, PtyState>, id: u32) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = sessions.remove(&id) {
        let _ = session.killer.kill();
    }
    Ok(())
}
```

- [ ] **Step 3: `lib.rs` に登録する**

`src-tauri/src/lib.rs` の先頭に `mod pty;` を足し、`run()` の中を書き換える:

```rust
        .manage(pty::PtyState::default())
        .invoke_handler(tauri::generate_handler![
            move_to_trash,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill
        ])
```

- [ ] **Step 4: コンパイルを通す**

Run: `cd src-tauri && cargo check && cd ..`
Expected: エラーなし。

**落ちたら API 名を実物で確認すること。** `portable-pty` と `tauri::ipc::Channel` の名前は版で動く。`cargo doc -p portable-pty --open` と `cargo doc -p tauri --open` を見る。特に見るのは `Channel` が `Clone` かどうか（違えば `std::sync::Arc` で包む）と `ChildKiller` のパス。

- [ ] **Step 5: `src/core/terminal/pty-io.ts` を書く**

```ts
/**
 * 端末の I/O の口（コア・型だけ）。**コアは Tauri を知らない**——
 * 額縁が `src/fs/pty.ts` の実装を注入する（`AppIo` と同じ流儀）
 */
export interface PtySpawnSpec {
  program: string
  args: string[]
  cwd: string
  cols: number
  rows: number
  onData: (bytes: Uint8Array) => void
  /** 子が終了した。code が null なら終了コードを取れなかった */
  onExit: (code: number | null) => void
}

export interface PtyIo {
  spawn(spec: PtySpawnSpec): Promise<number>
  write(id: number, data: string): Promise<void>
  resize(id: number, cols: number, rows: number): Promise<void>
  kill(id: number): Promise<void>
}

/** 端末で起動するもの。**ここが「Rust に判断を置かない」の実体** */
export const CLAUDE_PROGRAM = 'claude'
export const CLAUDE_ARGS: readonly string[] = []
```

- [ ] **Step 6: `src/fs/pty.ts` を書く**

```ts
import { Channel, invoke } from '@tauri-apps/api/core'
import type { PtyIo, PtySpawnSpec } from '@/core/terminal/pty-io'

/**
 * PTY の Tauri 実装（コアは Tauri を知らないので、額縁がこれを注入する）。
 *
 * **自前コマンドは ACL の対象外なので capabilities への追記は要らない**
 *（`moveFileToTrash` と同じ。`docs/project-setup.md`）
 */

type PtyEvent = { event: 'data'; data: { base64: string } } | { event: 'exit'; data: { code: number | null } }

/**
 * 生きている PTY の ID。**アプリを閉じるときに全部殺すために要る**——
 * Windows では ConPTY の子はホストプロセスの終了で自動的には死なず、
 * `claude` が孤児として残る
 */
const live = new Set<number>()

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export const tauriPtyIo: PtyIo = {
  async spawn(spec: PtySpawnSpec): Promise<number> {
    const channel = new Channel<PtyEvent>()
    channel.onmessage = (message) => {
      if (message.event === 'data') spec.onData(decodeBase64(message.data.base64))
      else spec.onExit(message.data.code)
    }
    const id = await invoke<number>('pty_spawn', {
      program: spec.program,
      args: spec.args,
      cwd: spec.cwd,
      cols: spec.cols,
      rows: spec.rows,
      channel,
    })
    live.add(id)
    return id
  },
  async write(id, data) {
    await invoke('pty_write', { id, data })
  },
  async resize(id, cols, rows) {
    await invoke('pty_resize', { id, cols, rows })
  },
  async kill(id) {
    live.delete(id)
    await invoke('pty_kill', { id })
  },
}

/** 生きている PTY を全部殺す（アプリを閉じる経路から呼ぶ） */
export async function killAllPtys(): Promise<void> {
  const ids = [...live]
  live.clear()
  await Promise.all(ids.map((id) => invoke('pty_kill', { id }).catch(() => undefined)))
}
```

- [ ] **Step 7: 実機で `claude` が立ち上がることを確認する**

`src/App.tsx` の `<header>` に、**このタスク限りの捨てるボタン**を足す:

```tsx
        <Button
          onClick={() => {
            void import('@/fs/pty').then(async ({ tauriPtyIo }) => {
              const id = await tauriPtyIo.spawn({
                program: 'claude',
                args: [],
                cwd: projectDir ?? '.',
                cols: 80,
                rows: 24,
                onData: (b) => console.log('[pty]', new TextDecoder().decode(b)),
                onExit: (c) => console.log('[pty] exit', c),
              })
              console.log('[pty] id', id)
              setTimeout(() => void tauriPtyIo.write(id, '\r'), 3000)
            })
          }}
        >
          PTY 検証
        </Button>
```

Run: `npm run tauri dev` → フォルダを開く → 「PTY 検証」を押す → 開発者ツールのコンソールを見る
Expected: `[pty] id 1` の後に Claude Code の起動画面が ANSI エスケープ込みで流れてくる。

**流れてこなかった場合の切り分け:**

| 症状 | 原因と対処 |
| --- | --- |
| `pty_spawn` が「program not found」で落ちる | `portable-pty` が Windows の `PATHEXT` を解決していない。`program` を `'cmd.exe'`、`args` を `['/c', 'claude']` に変えて再確認し、通ったらこの形を `pty-io.ts` の `CLAUDE_PROGRAM` / `CLAUDE_ARGS` に反映する |
| ID は返るが出力が来ない | `drop(pair.slave)` が抜けているか、`Channel` の `Clone` がハンドルを複製できていない。Step 2 の該当行を見る |
| 出力は来るが日本語が化ける | base64 の経路が壊れている（どこかで文字列化している）。`pty.rs` に `from_utf8` が無いことを確認する |

- [ ] **Step 8: 検証ボタンを消してコミットする**

Step 7 で足した `<Button>` を `src/App.tsx` から削除する。**残さないこと**——`src/App.tsx` は Task 6 で作り直す部分と重なる。

```bash
git add src-tauri/ src/core/terminal/pty-io.ts src/fs/pty.ts
git status --short   # src/App.tsx が出てこないこと（検証ボタンを消し切れている）
git commit -m "feat(m11): PTY を Rust に持たせて Claude Code を起動できるようにする"
```

---

## Task 2: タブの台帳（`src/core/terminal/sessions.ts`）

**Files:**
- Create: `src/core/terminal/sessions.ts`
- Test: `src/core/terminal/sessions.test.ts`

**Interfaces:**
- Consumes: なし（純ロジック）
- Produces: `TerminalSession` / `TerminalState` / `emptyTerminalState` / `openSession` / `closeSession` / `activateSession` / `markRunning` / `markExited` / `markFailed` / `closeAll` / `hasRunning`（Task 5・6・8 が使う）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/terminal/sessions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  activateSession,
  closeAll,
  closeSession,
  emptyTerminalState,
  hasRunning,
  markExited,
  markFailed,
  markRunning,
  openSession,
} from './sessions'

describe('openSession', () => {
  it('連番のラベルを付けて追加し、それをアクティブにする', () => {
    const a = openSession(emptyTerminalState)
    expect(a.sessions.map((s) => s.label)).toEqual(['Claude 1'])
    expect(a.activeId).toBe(a.sessions[0]?.id)

    const b = openSession(a)
    expect(b.sessions.map((s) => s.label)).toEqual(['Claude 1', 'Claude 2'])
    expect(b.activeId).toBe(b.sessions[1]?.id)
  })

  it('閉じた番号を再利用しない', () => {
    // 同じ名前が別の会話を指すのを避ける。会議中に「Claude 1 を見て」が
    // 通じなくなるのが一番困る
    const two = openSession(openSession(emptyTerminalState))
    const firstId = two.sessions[0]?.id ?? 0
    const after = openSession(closeSession(two, firstId))
    expect(after.sessions.map((s) => s.label)).toEqual(['Claude 2', 'Claude 3'])
  })

  it('起動前の状態は starting で ptyId を持たない', () => {
    const s = openSession(emptyTerminalState).sessions[0]
    expect(s?.status).toBe('starting')
    expect(s?.ptyId).toBeNull()
  })
})

describe('closeSession', () => {
  it('閉じたのがアクティブなら隣をアクティブにする', () => {
    const three = openSession(openSession(openSession(emptyTerminalState)))
    const middle = three.sessions[1]?.id ?? 0
    const after = closeSession(activateSession(three, middle), middle)
    expect(after.activeId).toBe(after.sessions[1]?.id)
    expect(after.sessions.map((s) => s.label)).toEqual(['Claude 1', 'Claude 3'])
  })

  it('末尾を閉じたら1つ前をアクティブにする', () => {
    const two = openSession(openSession(emptyTerminalState))
    const last = two.sessions[1]?.id ?? 0
    const after = closeSession(two, last)
    expect(after.activeId).toBe(after.sessions[0]?.id)
  })

  it('最後の1本を閉じたらアクティブは null になる', () => {
    const one = openSession(emptyTerminalState)
    const after = closeSession(one, one.sessions[0]?.id ?? 0)
    expect(after.sessions).toEqual([])
    expect(after.activeId).toBeNull()
  })

  it('アクティブでないものを閉じてもアクティブは動かない', () => {
    const two = openSession(openSession(emptyTerminalState))
    const first = two.sessions[0]?.id ?? 0
    const after = closeSession(two, first)
    expect(after.activeId).toBe(two.activeId)
  })

  it('知らない id は素通しする', () => {
    const one = openSession(emptyTerminalState)
    expect(closeSession(one, 999)).toBe(one)
  })
})

describe('状態の遷移', () => {
  it('markRunning が ptyId を入れて running にする', () => {
    const one = openSession(emptyTerminalState)
    const id = one.sessions[0]?.id ?? 0
    const after = markRunning(one, id, 42)
    expect(after.sessions[0]?.status).toBe('running')
    expect(after.sessions[0]?.ptyId).toBe(42)
  })

  it('markExited が文言を入れて ptyId を落とす', () => {
    const one = markRunning(openSession(emptyTerminalState), 1, 42)
    const after = markExited(one, 1, '終了しました（コード 0）')
    expect(after.sessions[0]?.status).toBe('exited')
    expect(after.sessions[0]?.ptyId).toBeNull()
    expect(after.sessions[0]?.message).toBe('終了しました（コード 0）')
  })

  it('markFailed が文言を入れる', () => {
    const one = openSession(emptyTerminalState)
    const after = markFailed(one, 1, 'Claude Code が見つかりません')
    expect(after.sessions[0]?.status).toBe('failed')
    expect(after.sessions[0]?.message).toBe('Claude Code が見つかりません')
  })
})

describe('hasRunning / closeAll', () => {
  it('running が1つでもあれば hasRunning が true', () => {
    expect(hasRunning(emptyTerminalState)).toBe(false)
    const one = openSession(emptyTerminalState)
    // starting も「動いている」に数える（起動要求が飛んでいるため）
    expect(hasRunning(one)).toBe(true)
    expect(hasRunning(markExited(one, 1, ''))).toBe(false)
  })

  it('closeAll が全部消して採番だけ引き継ぐ', () => {
    const two = openSession(openSession(emptyTerminalState))
    const after = closeAll(two)
    expect(after.sessions).toEqual([])
    expect(after.activeId).toBeNull()
    expect(openSession(after).sessions[0]?.label).toBe('Claude 3')
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/core/terminal/sessions.test.ts`
Expected: FAIL（`./sessions` が解決できない）

- [ ] **Step 3: 実装する**

`src/core/terminal/sessions.ts`:

```ts
/**
 * 端末タブの台帳（コア・純ロジック。React も Tauri も知らない）。
 *
 * **ラベルは連番固定で、会話の内容からは決めない**（rev 4章。facet が
 * Claude の出力を読んで解釈することになるため。設計 決定8）。
 * 閉じた番号は再利用しない——同じ名前が別の会話を指すと、会議中の
 *「Claude 1 を見て」が通じなくなる
 */

export type SessionStatus = 'starting' | 'running' | 'exited' | 'failed'

export interface TerminalSession {
  /** facet 側の連番。**PTY の ID とは別物**（起動前は PTY がまだ無い） */
  readonly id: number
  readonly label: string
  readonly ptyId: number | null
  readonly status: SessionStatus
  /** exited / failed のときタブの中に出す文言。それ以外は null */
  readonly message: string | null
}

export interface TerminalState {
  readonly sessions: readonly TerminalSession[]
  readonly activeId: number | null
  /** 次に振る番号。**単調増加**（閉じても戻さない） */
  readonly nextSeq: number
}

export const emptyTerminalState: TerminalState = {
  sessions: [],
  activeId: null,
  nextSeq: 1,
}

export function openSession(state: TerminalState): TerminalState {
  const session: TerminalSession = {
    id: state.nextSeq,
    label: `Claude ${state.nextSeq}`,
    ptyId: null,
    status: 'starting',
    message: null,
  }
  return {
    sessions: [...state.sessions, session],
    activeId: session.id,
    nextSeq: state.nextSeq + 1,
  }
}

export function closeSession(state: TerminalState, id: number): TerminalState {
  const at = state.sessions.findIndex((s) => s.id === id)
  if (at < 0) return state
  const sessions = state.sessions.filter((s) => s.id !== id)
  if (state.activeId !== id) return { ...state, sessions }
  // 閉じたのがアクティブなら隣へ移す。同じ位置に来たもの（＝右隣）を優先し、
  // 末尾を閉じたときだけ1つ前へ戻る
  const next = sessions[at] ?? sessions[at - 1] ?? null
  return { ...state, sessions, activeId: next?.id ?? null }
}

export function activateSession(state: TerminalState, id: number): TerminalState {
  return state.sessions.some((s) => s.id === id) ? { ...state, activeId: id } : state
}

function patch(
  state: TerminalState,
  id: number,
  change: (s: TerminalSession) => TerminalSession,
): TerminalState {
  if (!state.sessions.some((s) => s.id === id)) return state
  return { ...state, sessions: state.sessions.map((s) => (s.id === id ? change(s) : s)) }
}

export function markRunning(state: TerminalState, id: number, ptyId: number): TerminalState {
  return patch(state, id, (s) => ({ ...s, ptyId, status: 'running', message: null }))
}

export function markExited(state: TerminalState, id: number, message: string): TerminalState {
  return patch(state, id, (s) => ({ ...s, ptyId: null, status: 'exited', message }))
}

export function markFailed(state: TerminalState, id: number, message: string): TerminalState {
  return patch(state, id, (s) => ({ ...s, ptyId: null, status: 'failed', message }))
}

/** 起動中・実行中のタブが1つでもあるか（フォルダ切替の確認の要否） */
export function hasRunning(state: TerminalState): boolean {
  return state.sessions.some((s) => s.status === 'starting' || s.status === 'running')
}

export function closeAll(state: TerminalState): TerminalState {
  return { ...state, sessions: [], activeId: null }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/core/terminal/sessions.test.ts`
Expected: PASS（13件）

- [ ] **Step 5: コミット**

```bash
git add src/core/terminal/sessions.ts src/core/terminal/sessions.test.ts
git commit -m "feat(m11): 端末タブの台帳を追加する"
```

---

## Task 3: 同梱 Skill の同期

**Files:**
- Create: `src/core/skill-sync.ts`, `src/fs/skill-resources.ts`
- Test: `src/core/skill-sync.test.ts`
- Modify: `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: なし
- Produces: `BUNDLED_SKILLS` / `SkillSyncIo` / `syncBundledSkills`（Task 6 が使う）、`tauriSkillSyncIo`（Task 6 が注入する）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/skill-sync.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { syncBundledSkills, type SkillSyncIo } from './skill-sync'

function fakeIo(existing: string[] = []) {
  const removed: string[] = []
  const written: Array<{ path: string; text: string }> = []
  const dirs: string[] = []
  const io: SkillSyncIo = {
    readBundled: async (skill) => [
      { path: 'SKILL.md', text: `# ${skill}` },
      { path: 'scripts/write.mjs', text: 'export {}' },
    ],
    exists: async (path) => existing.includes(path),
    removeDir: async (path) => {
      removed.push(path)
    },
    mkdir: async (path) => {
      dirs.push(path)
    },
    writeText: async (path, text) => {
      written.push({ path, text })
    },
    join: async (...parts) => parts.join('/'),
  }
  return { io, removed, written, dirs }
}

describe('syncBundledSkills', () => {
  it('同梱 Skill を .claude/skills/<名前>/ へ置く', async () => {
    const { io, written } = fakeIo()
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    expect(written.map((w) => w.path)).toEqual([
      '/proj/.claude/skills/glossary-term-register/SKILL.md',
      '/proj/.claude/skills/glossary-term-register/scripts/write.mjs',
    ])
    expect(written[0]?.text).toBe('# glossary-term-register')
  })

  it('既にあるディレクトリは消してから置き直す（Skill の更新を取り残さない）', async () => {
    const { io, removed } = fakeIo(['/proj/.claude/skills/glossary-term-register'])
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    expect(removed).toEqual(['/proj/.claude/skills/glossary-term-register'])
  })

  it('無いディレクトリは消そうとしない', async () => {
    const { io, removed } = fakeIo()
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    expect(removed).toEqual([])
  })

  it('**ユーザーが置いた Skill には触らない**', async () => {
    // .claude/skills/ を丸ごと消すと、ユーザーの Skill が巻き添えになる。
    // facet が壊してよいのは facet が書いたものだけ
    const { io, removed } = fakeIo([
      '/proj/.claude/skills/glossary-term-register',
      '/proj/.claude/skills/my-own-skill',
    ])
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    expect(removed).toEqual(['/proj/.claude/skills/glossary-term-register'])
    expect(removed).not.toContain('/proj/.claude/skills/my-own-skill')
    expect(removed).not.toContain('/proj/.claude/skills')
  })

  it('入れ子のファイルの親ディレクトリを作る', async () => {
    const { io, dirs } = fakeIo()
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    expect(dirs).toContain('/proj/.claude/skills/glossary-term-register/scripts')
  })

  it('1本が失敗しても残りを置く', async () => {
    const { io, written } = fakeIo()
    const failing: SkillSyncIo = {
      ...io,
      readBundled: async (skill) => {
        if (skill === 'a') throw new Error('読めません')
        return [{ path: 'SKILL.md', text: skill }]
      },
    }
    await expect(syncBundledSkills('/proj', failing, ['a', 'b'])).rejects.toThrow('読めません')
    expect(written.map((w) => w.text)).toEqual(['b'])
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/core/skill-sync.test.ts`
Expected: FAIL（`./skill-sync` が解決できない）

- [ ] **Step 3: 実装する**

`src/core/skill-sync.ts`:

```ts
/**
 * 同梱 Skill をプロジェクトフォルダへ置き直す（コア・I/O 注入）。
 *
 * **これが無いと機能の目的が達成できない。** Skill は facet リポジトリの
 * `.claude/skills/` にあり、ユーザーが開くプロジェクトフォルダには入っていない。
 * 作業ディレクトリをプロジェクトフォルダにして claude を起動しても、
 * プロジェクトレベルの Skill が見つからず用語登録 Skill が使えない（設計 決定10）
 */

/**
 * アプリに同梱する Skill。**`src-tauri/tauri.conf.json` の
 * `bundle.resources` と一致していなければならない。**
 * Skill を増やすときは両方を直すこと
 */
export const BUNDLED_SKILLS: readonly string[] = [
  'glossary-term-register',
  'error-catalog-register',
]

export interface SkillSyncIo {
  /** 同梱 Skill の中身。path は Skill 名からの相対パス（`/` 区切り） */
  readBundled(skill: string): Promise<ReadonlyArray<{ path: string; text: string }>>
  exists(path: string): Promise<boolean>
  removeDir(path: string): Promise<void>
  mkdir(path: string): Promise<void>
  writeText(path: string, text: string): Promise<void>
  join(...parts: string[]): Promise<string>
}

/**
 * 同梱 Skill を置き直す。**消すのは同梱名のディレクトリだけ**——
 * `.claude/skills/` を丸ごと消すとユーザーが自分で置いた Skill も消える。
 * facet が壊してよいのは facet が書いたものに限る
 */
export async function syncBundledSkills(
  projectDir: string,
  io: SkillSyncIo,
  skills: readonly string[] = BUNDLED_SKILLS,
): Promise<void> {
  for (const skill of skills) {
    const root = await io.join(projectDir, '.claude', 'skills', skill)
    if (await io.exists(root)) await io.removeDir(root)
    const files = await io.readBundled(skill)
    for (const file of files) {
      const parts = file.path.split('/')
      const name = parts.pop()
      if (name === undefined) continue
      const dir = parts.length > 0 ? await io.join(root, ...parts) : root
      await io.mkdir(dir)
      await io.writeText(await io.join(dir, name), file.text)
    }
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/core/skill-sync.test.ts`
Expected: PASS（6件）

- [ ] **Step 5: `src/fs/skill-resources.ts` を書く**

```ts
import { join, resolveResource } from '@tauri-apps/api/path'
import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs'
import type { SkillSyncIo } from '@/core/skill-sync'

/**
 * 同梱 Skill の読み出しとプロジェクトフォルダへの書き込み（Tauri 境界）。
 *
 * **Skill のファイルはすべてテキスト**（`SKILL.md` と `scripts/*.mjs`）。
 * バイナリを同梱するようになったらこの前提が崩れるので、そのときは
 * readTextFile / writeTextFile を readFile / writeFile に替えること
 */

/** `dir` 配下のファイルを再帰的に集める（`base` からの相対パスで返す） */
async function collect(dir: string, base: string): Promise<Array<{ path: string; text: string }>> {
  const found: Array<{ path: string; text: string }> = []
  for (const entry of await readDir(dir)) {
    const full = await join(dir, entry.name)
    if (entry.isDirectory) {
      found.push(...(await collect(full, base)))
    } else if (entry.isFile) {
      found.push({
        path: full.slice(base.length + 1).split('\\').join('/'),
        text: await readTextFile(full),
      })
    }
  }
  return found
}

export const tauriSkillSyncIo: SkillSyncIo = {
  async readBundled(skill) {
    // bundle.resources で `.claude/skills/` を同梱しているので、
    // 実行時のパスは `skills/<名前>` に潰れる
    const root = await resolveResource(`skills/${skill}`)
    return collect(root, root)
  },
  exists: (path) => exists(path),
  removeDir: (path) => remove(path, { recursive: true }),
  mkdir: (path) => mkdir(path, { recursive: true }),
  writeText: (path, text) => writeTextFile(path, text),
  join: (...parts) => join(...parts),
}
```

- [ ] **Step 6: `bundle.resources` を足す**

`src-tauri/tauri.conf.json` の `bundle` に追記する:

```json
    "resources": {
      "../.claude/skills": "skills"
    },
```

- [ ] **Step 7: capabilities を足す**

**ここを落とすと実行時に静かに動かない**（`docs/project-setup.md`。既に3回踏んでいる）。
`src-tauri/capabilities/default.json` の `permissions` に追記する:

```json
    "fs:allow-mkdir",
    "fs:allow-remove",
    {
      "identifier": "fs:allow-read-dir",
      "allow": [{ "path": "$RESOURCE/skills" }, { "path": "$RESOURCE/skills/**" }]
    },
    {
      "identifier": "fs:allow-read-text-file",
      "allow": [{ "path": "$RESOURCE/skills/**" }]
    }
```

同じファイルの `description` に、なぜ増えたかを既存の書き方に合わせて追記する:

> `fs:allow-mkdir` / `fs:allow-remove` は同梱 Skill をプロジェクトフォルダの `.claude/skills/` へ置き直すため（M11。消すのは facet が同梱する名前のディレクトリだけ）。`$RESOURCE/skills` の読み取りは、その同梱物を読むため。

- [ ] **Step 8: 3本が緑であることを確認してコミット**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS

```bash
git add src/core/skill-sync.ts src/core/skill-sync.test.ts src/fs/skill-resources.ts src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git commit -m "feat(m11): 同梱 Skill をプロジェクトフォルダへ同期する"
```

---

## Task 4: `TerminalTab` — xterm 1本と PTY 1本の対応

**Files:**
- Create: `src/components/TerminalTab.tsx`
- Test: `src/components/TerminalTab.dom.test.tsx`
- Modify: `package.json`（xterm の追加）

**Interfaces:**
- Consumes: `PtyIo` / `PtySpawnSpec` / `CLAUDE_PROGRAM` / `CLAUDE_ARGS`（Task 1）、`TerminalSession`（Task 2）
- Produces: `TerminalTab`（props: `session` / `cwd` / `ptyIo` / `hidden` / `onRunning` / `onExited` / `onFailed`）を Task 5 が使う

**端末の中は xterm の既定配色にする。** facet の役割トークンを流し込まない。端末は端末として読む面であり、rev 9章の「地は方眼、作業する面は無地」の対象外。ライト表示でも右ペインだけ暗いのは見慣れた形で、かつ**ソースに色値を書かずに済む**（`conventions.test.ts` に引っかからない）。ペインの枠とタブバーは facet のトークンを使う（Task 5）。

- [ ] **Step 1: xterm を足す**

```bash
npm install @xterm/xterm @xterm/addon-fit
```

- [ ] **Step 2: 失敗するテストを書く**

`src/components/TerminalTab.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import type { PtyIo } from '@/core/terminal/pty-io'
import type { TerminalSession } from '@/core/terminal/sessions'

// xterm は canvas を使うので jsdom では動かない。まるごと差し替える
const term = {
  open: vi.fn(),
  write: vi.fn(),
  onData: vi.fn(),
  dispose: vi.fn(),
  cols: 80,
  rows: 24,
}
const fit = { fit: vi.fn() }
vi.mock('@xterm/xterm', () => ({ Terminal: vi.fn(() => term) }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: vi.fn(() => fit) }))

const { TerminalTab } = await import('./TerminalTab')

function session(over: Partial<TerminalSession> = {}): TerminalSession {
  return { id: 1, label: 'Claude 1', ptyId: null, status: 'starting', message: null, ...over }
}

function fakePty() {
  const spawned: Array<{ cwd: string; program: string }> = []
  const resized: Array<{ id: number; cols: number; rows: number }> = []
  let onData: ((b: Uint8Array) => void) | null = null
  let onExit: ((c: number | null) => void) | null = null
  const io: PtyIo = {
    spawn: async (spec) => {
      spawned.push({ cwd: spec.cwd, program: spec.program })
      onData = spec.onData
      onExit = spec.onExit
      return 7
    },
    write: vi.fn(async () => undefined),
    resize: vi.fn(async (id, cols, rows) => {
      resized.push({ id, cols, rows })
    }),
    kill: vi.fn(async () => undefined),
  }
  return { io, spawned, resized, emit: (b: Uint8Array) => onData?.(b), exit: (c: number | null) => onExit?.(c) }
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('TerminalTab', () => {
  it('マウントで PTY を1本起動し、running を知らせる', async () => {
    const pty = fakePty()
    const onRunning = vi.fn()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    expect(pty.spawned).toEqual([{ cwd: '/proj', program: 'claude' }])
  })

  it('PTY の出力を xterm へそのまま渡す', async () => {
    const pty = fakePty()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={vi.fn()}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(pty.spawned).toHaveLength(1))
    const bytes = new Uint8Array([0xe3, 0x81, 0x82])
    pty.emit(bytes)
    expect(term.write).toHaveBeenCalledWith(bytes)
  })

  it('子が終了したら exited を知らせる', async () => {
    const pty = fakePty()
    const onExited = vi.fn()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={vi.fn()}
        onExited={onExited}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(pty.spawned).toHaveLength(1))
    pty.exit(0)
    expect(onExited).toHaveBeenCalledWith(1, '終了しました（コード 0）')
  })

  it('起動に失敗したら failed を知らせる', async () => {
    const pty = fakePty()
    pty.io.spawn = async () => {
      throw new Error('program not found')
    }
    const onFailed = vi.fn()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={vi.fn()}
        onExited={vi.fn()}
        onFailed={onFailed}
      />,
    )
    await waitFor(() =>
      expect(onFailed).toHaveBeenCalledWith(
        1,
        'Claude Code を起動できませんでした: program not found',
      ),
    )
  })

  it('**隠れている間は fit しない。表示に戻った瞬間に1回だけ fit して resize する**', async () => {
    // display:none の間は xterm が寸法を測れない（clientWidth が 0）。
    // ここで測ると開き直したときだけ表示が崩れる
    const pty = fakePty()
    const props = {
      session: session({ status: 'running', ptyId: 7 }),
      cwd: '/proj',
      ptyIo: pty.io,
      onRunning: vi.fn(),
      onExited: vi.fn(),
      onFailed: vi.fn(),
    }
    const { rerender } = render(<TerminalTab {...props} hidden />)
    await waitFor(() => expect(pty.spawned).toHaveLength(1))
    expect(fit.fit).not.toHaveBeenCalled()

    rerender(<TerminalTab {...props} hidden={false} />)
    await waitFor(() => expect(fit.fit).toHaveBeenCalledTimes(1))
    expect(pty.resized).toEqual([{ id: 7, cols: 80, rows: 24 }])
  })

  it('exited のときタブの中に文言を出す', () => {
    const pty = fakePty()
    const { getByText } = render(
      <TerminalTab
        session={session({ status: 'exited', message: '終了しました（コード 0）' })}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={vi.fn()}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    expect(getByText('終了しました（コード 0）')).toBeTruthy()
  })
})
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `npx vitest run src/components/TerminalTab.dom.test.tsx`
Expected: FAIL（`./TerminalTab` が解決できない）

- [ ] **Step 4: 実装する**

`src/components/TerminalTab.tsx`:

```tsx
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import { CLAUDE_ARGS, CLAUDE_PROGRAM, type PtyIo } from '@/core/terminal/pty-io'
import type { TerminalSession } from '@/core/terminal/sessions'

/**
 * 端末タブ1本。xterm 1個と PTY 1本が対応する。
 *
 * **端末の中は xterm の既定配色にする。** 端末は端末として読む面であり、
 * rev 9章の「地は方眼、作業する面は無地」の対象外。facet の役割トークンを
 * 流し込まないことで、ソースに色値が現れずに済む（conventions.test.ts）
 */

export interface TerminalTabProps {
  session: TerminalSession
  cwd: string
  ptyIo: PtyIo
  /** 畳んでいる／非アクティブ。**アンマウントはしない**（設計 決定6） */
  hidden: boolean
  onRunning: (id: number, ptyId: number) => void
  onExited: (id: number, message: string) => void
  onFailed: (id: number, message: string) => void
}

export function TerminalTab(props: TerminalTabProps): React.JSX.Element {
  const { session, cwd, ptyIo, hidden, onRunning, onExited, onFailed } = props
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<number | null>(null)

  // コールバックは最新を ref から読む。**起動の effect は1回だけ**——
  // 依存に入れると props が変わるたびに端末がもう1本立つ
  const cb = useRef({ onRunning, onExited, onFailed })
  cb.current = { onRunning, onExited, onFailed }

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const term = new Terminal({ convertEol: false, fontSize: 13 })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    termRef.current = term
    fitRef.current = fit

    let disposed = false
    void ptyIo
      .spawn({
        program: CLAUDE_PROGRAM,
        args: [...CLAUDE_ARGS],
        cwd,
        cols: term.cols,
        rows: term.rows,
        // **バイト列のまま渡す。** ここで文字列化すると、読み取りの区切りが
        // マルチバイトの途中に落ちたときに日本語が化ける
        onData: (bytes) => term.write(bytes),
        onExit: (code) =>
          cb.current.onExited(session.id, `終了しました（コード ${code ?? '不明'}）`),
      })
      .then((ptyId) => {
        if (disposed) {
          void ptyIo.kill(ptyId)
          return
        }
        ptyIdRef.current = ptyId
        term.onData((data) => {
          // 書き込みの失敗もタブの中に出す（設計 決定13）。握り潰すと
          // 「打っても何も起きない端末」になり、原因が画面から読めない
          void ptyIo.write(ptyId, data).catch((err: unknown) => {
            cb.current.onFailed(
              session.id,
              `端末へ書き込めませんでした: ${err instanceof Error ? err.message : String(err)}`,
            )
          })
        })
        cb.current.onRunning(session.id, ptyId)
      })
      .catch((err: unknown) => {
        if (disposed) return
        cb.current.onFailed(
          session.id,
          `Claude Code を起動できませんでした: ${err instanceof Error ? err.message : String(err)}`,
        )
      })

    return () => {
      disposed = true
      term.dispose()
    }
    // 起動は1回だけ。cwd が変わる経路は「フォルダ切替」で、そのときは
    // タブごと作り直される（設計 決定12）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // **隠れている間は測らない。** display:none では clientWidth が 0 になり、
  // ここで fit すると開き直したときだけ表示が崩れる（設計 決定6）
  useEffect(() => {
    if (hidden) return
    const term = termRef.current
    const fit = fitRef.current
    const ptyId = ptyIdRef.current
    if (term === null || fit === null) return
    fit.fit()
    // リサイズの失敗は握り潰してよい。失敗するのは PTY が既に無いときで、
    // その事実は onExit が先にタブへ伝えている（書き込みと違い、握り潰しても
    // 「原因の分からない無反応」にはならない）
    if (ptyId !== null) void ptyIo.resize(ptyId, term.cols, term.rows).catch(() => undefined)
  }, [hidden, ptyIo])

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${hidden ? 'hidden' : ''}`}>
      {session.message !== null && (
        <p className="border-b border-rule px-3 py-2 text-sm text-warning">{session.message}</p>
      )}
      <div ref={hostRef} className="min-h-0 flex-1" />
    </div>
  )
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run src/components/TerminalTab.dom.test.tsx`
Expected: PASS（6件）

**「隠れている間は fit しない」が落ちたら**、`hidden` の effect が初回マウントで走っていないか見る。`hidden` が true で始まったときは何もしないのが正しい。

- [ ] **Step 6: コミット**

```bash
git add package.json package-lock.json src/components/TerminalTab.tsx src/components/TerminalTab.dom.test.tsx
git commit -m "feat(m11): xterm 1本と PTY 1本を対応させる端末タブを追加する"
```

---

## Task 5: `TerminalPane` — タブバーとペインの枠

**Files:**
- Create: `src/components/TerminalPane.tsx`
- Test: `src/components/TerminalPane.dom.test.tsx`

**Interfaces:**
- Consumes: `TerminalState`（Task 2）、`TerminalTab`（Task 4）、`PtyIo`（Task 1）
- Produces: `TerminalPane`（props: `state` / `cwd` / `ptyIo` / `onOpen` / `onClose` / `onActivate` / `onRunning` / `onExited` / `onFailed`）を Task 6 が使う

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TerminalPane.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PtyIo } from '@/core/terminal/pty-io'
import { emptyTerminalState, openSession } from '@/core/terminal/sessions'

// タブの中身は Task 4 で固定済み。ここではタブバーの配線だけを見る
vi.mock('./TerminalTab', () => ({
  TerminalTab: ({ session, hidden }: { session: { label: string }; hidden: boolean }) => (
    <div data-testid={`tab-body-${session.label}`} data-hidden={String(hidden)} />
  ),
}))

const { TerminalPane } = await import('./TerminalPane')

const ptyIo: PtyIo = {
  spawn: vi.fn(async () => 1),
  write: vi.fn(async () => undefined),
  resize: vi.fn(async () => undefined),
  kill: vi.fn(async () => undefined),
}

function setup(state = openSession(emptyTerminalState)) {
  const handlers = {
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onActivate: vi.fn(),
    onRunning: vi.fn(),
    onExited: vi.fn(),
    onFailed: vi.fn(),
  }
  render(<TerminalPane state={state} cwd="/proj" ptyIo={ptyIo} paneVisible {...handlers} />)
  return handlers
}

afterEach(cleanup)

describe('TerminalPane', () => {
  it('タブが1本も無いときは開く動線だけを出す', () => {
    setup(emptyTerminalState)
    expect(screen.getByRole('button', { name: 'Claude Code を開く' })).toBeTruthy()
  })

  it('＋でタブの追加を要求する', () => {
    const h = setup()
    fireEvent.click(screen.getByRole('button', { name: 'タブを追加' }))
    expect(h.onOpen).toHaveBeenCalledTimes(1)
  })

  it('タブを押すとアクティブの切替を要求する', () => {
    const two = openSession(openSession(emptyTerminalState))
    const h = setup(two)
    fireEvent.click(screen.getByRole('tab', { name: 'Claude 1' }))
    expect(h.onActivate).toHaveBeenCalledWith(two.sessions[0]?.id)
  })

  it('✕で終了を要求する（確認は出さない）', () => {
    const one = openSession(emptyTerminalState)
    const h = setup(one)
    fireEvent.click(screen.getByRole('button', { name: 'Claude 1 を閉じる' }))
    expect(h.onClose).toHaveBeenCalledWith(one.sessions[0]?.id)
  })

  it('**非アクティブなタブもアンマウントせず隠すだけ**', () => {
    // アンマウントするとスクロールバックとプロセスが消える（設計 決定6）
    setup(openSession(openSession(emptyTerminalState)))
    expect(screen.getByTestId('tab-body-Claude 1').dataset['hidden']).toBe('true')
    expect(screen.getByTestId('tab-body-Claude 2').dataset['hidden']).toBe('false')
  })

  it('アクティブなタブに aria-selected を付ける', () => {
    setup(openSession(openSession(emptyTerminalState)))
    expect(screen.getByRole('tab', { name: 'Claude 1' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('tab', { name: 'Claude 2' }).getAttribute('aria-selected')).toBe('true')
  })

  it('**ペインを畳んでいる間もタブは生きていて、隠れているだけ**', () => {
    // 畳むでアンマウントすると会話とプロセスが消える（設計 決定6）
    const handlers = {
      onOpen: vi.fn(),
      onClose: vi.fn(),
      onActivate: vi.fn(),
      onRunning: vi.fn(),
      onExited: vi.fn(),
      onFailed: vi.fn(),
    }
    render(
      <TerminalPane
        state={openSession(emptyTerminalState)}
        cwd="/proj"
        ptyIo={ptyIo}
        paneVisible={false}
        {...handlers}
      />,
    )
    expect(screen.getByTestId('tab-body-Claude 1').dataset['hidden']).toBe('true')
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/components/TerminalPane.dom.test.tsx`
Expected: FAIL（`./TerminalPane` が解決できない）

- [ ] **Step 3: 実装する**

`src/components/TerminalPane.tsx`:

```tsx
import { Plus, X } from 'lucide-react'
import { buttonBase } from '@/components/button-styles'
import { TerminalTab } from '@/components/TerminalTab'
import type { PtyIo } from '@/core/terminal/pty-io'
import type { TerminalState } from '@/core/terminal/sessions'

/**
 * 端末ペインの枠とタブバー。
 *
 * **ペインの枠は facet の役割トークン、端末の中は xterm の既定配色**
 *（理由は TerminalTab.tsx）
 */

export interface TerminalPaneProps {
  state: TerminalState
  cwd: string
  ptyIo: PtyIo
  /**
   * ペインが見えているか。**畳んでいる間もこのコンポーネントは生きている**
   *（アンマウントすると会話とプロセスが消える。設計 決定6）ので、
   * 「見えているか」は props で受け取る
   */
  paneVisible: boolean
  onOpen: () => void
  onClose: (id: number) => void
  onActivate: (id: number) => void
  onRunning: (id: number, ptyId: number) => void
  onExited: (id: number, message: string) => void
  onFailed: (id: number, message: string) => void
}

export function TerminalPane(props: TerminalPaneProps): React.JSX.Element {
  const { state, cwd, ptyIo, paneVisible, onOpen, onClose, onActivate } = props
  const { onRunning, onExited, onFailed } = props

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <div role="tablist" className="flex shrink-0 items-center gap-1 border-b border-rule px-2 py-1">
        {state.sessions.map((session) => (
          <span key={session.id} className="flex items-center">
            <button
              type="button"
              role="tab"
              aria-selected={state.activeId === session.id}
              className={`${buttonBase} px-2 py-1 text-xs ${
                state.activeId === session.id ? 'bg-surface-accent text-ink' : 'text-ink-muted'
              }`}
              onClick={() => onActivate(session.id)}
            >
              {session.label}
            </button>
            <button
              type="button"
              aria-label={`${session.label} を閉じる`}
              className={`${buttonBase} p-1 text-ink-muted`}
              onClick={() => onClose(session.id)}
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        <button
          type="button"
          aria-label="タブを追加"
          className={`${buttonBase} ml-1 p-1 text-ink-muted`}
          onClick={onOpen}
        >
          <Plus aria-hidden className="size-4" />
        </button>
      </div>

      {state.sessions.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <button
            type="button"
            className={`${buttonBase} border border-rule px-3 py-1 text-sm text-ink`}
            onClick={onOpen}
          >
            Claude Code を開く
          </button>
        </div>
      ) : (
        state.sessions.map((session) => (
          <TerminalTab
            key={session.id}
            session={session}
            cwd={cwd}
            ptyIo={ptyIo}
            hidden={!paneVisible || state.activeId !== session.id}
            onRunning={onRunning}
            onExited={onExited}
            onFailed={onFailed}
          />
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/components/TerminalPane.dom.test.tsx`
Expected: PASS（7件）

- [ ] **Step 5: コミット**

```bash
git add src/components/TerminalPane.tsx src/components/TerminalPane.dom.test.tsx
git commit -m "feat(m11): 端末ペインの枠とタブバーを追加する"
```

---

## Task 6: 額縁への組み込み（ヘッダ・レイアウト・幅・サイドバー畳み）

**Files:**
- Create: `src/components/PaneSplitter.tsx`
- Test: `src/components/PaneSplitter.dom.test.tsx`
- Modify: `src/App.tsx`, `src/core/column-resize.ts`

**Interfaces:**
- Consumes: `TerminalPane`（Task 5）、`sessions.ts`（Task 2）、`syncBundledSkills` / `tauriSkillSyncIo`（Task 3）、`tauriPtyIo`（Task 1）
- Produces: `PaneSplitter`（props: `containerRef` / `store`）

- [ ] **Step 1: `PaneSplitter` の失敗するテストを書く**

`src/components/PaneSplitter.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createColumnWidthStore } from '@/core/column-resize'
import { PaneSplitter } from './PaneSplitter'

const store = createColumnWidthStore([420])

beforeEach(() => {
  // モジュールスコープの可変状態はテスト間で漏れる
  store.reset()
})
afterEach(cleanup)

function setup() {
  const containerRef = createRef<HTMLElement>()
  render(
    <div ref={containerRef as React.RefObject<HTMLDivElement>}>
      <PaneSplitter containerRef={containerRef} store={store} />
    </div>,
  )
  return screen.getByRole('separator')
}

describe('PaneSplitter', () => {
  it('左へ引くとペインが広がる（向きが見た目どおり）', () => {
    const handle = setup()
    handle.setPointerCapture = () => undefined
    fireEvent.pointerDown(handle, { clientX: 800, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 700, pointerId: 1 })
    expect(store.getSnapshot()[0]).toBe(520)
  })

  it('← でも広がる（キーボードで届く）', () => {
    const handle = setup()
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(store.getSnapshot()[0]).toBeGreaterThan(420)
  })

  it('ダブルクリックで既定幅へ戻す', () => {
    const handle = setup()
    handle.setPointerCapture = () => undefined
    fireEvent.pointerDown(handle, { clientX: 800, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 600, pointerId: 1 })
    fireEvent.doubleClick(handle)
    expect(store.getSnapshot()[0]).toBe(420)
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/components/PaneSplitter.dom.test.tsx`
Expected: FAIL（`./PaneSplitter` が解決できない）

- [ ] **Step 3: `PaneSplitter` を実装する**

`src/components/PaneSplitter.tsx`:

```tsx
import { useColumnResize, type ColumnWidthStore } from '@/core/column-resize'

/**
 * 端末ペインの幅を掴むハンドル。
 *
 * **`column-resize.ts` を再利用する**（設計 決定5）。幅1要素の配列として渡すと、
 * ポインタキャプチャ・キーボード（←→）・ダブルクリックで既定へ戻す・
 * エディタが潰れない上限クランプが全部ついてくる。3本目のリサイズ実装を生やさない
 */

/** ペインをこれより狭くしない */
const PANE_MIN_WIDTH = 320
/** エディタに必ず残す幅 */
const EDITOR_MIN_WIDTH = 480
/** ←→ 1回あたり */
const STEP = 16

export interface PaneSplitterProps {
  containerRef: React.RefObject<HTMLElement | null>
  store: ColumnWidthStore
}

export function PaneSplitter({ containerRef, store }: PaneSplitterProps): React.JSX.Element {
  const { getHandleProps } = useColumnResize({
    store,
    minWidth: PANE_MIN_WIDTH,
    flexMinWidth: EDITOR_MIN_WIDTH,
    step: STEP,
    containerRef,
  })
  return (
    <div
      // ペインの左端にあるので、右へ引いたらペインが狭まる＝invert
      {...getHandleProps(0, { invert: true })}
      aria-label="Claude Code ペインの幅"
      className="w-1 shrink-0 cursor-col-resize bg-rule"
    />
  )
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/components/PaneSplitter.dom.test.tsx`
Expected: PASS（3件）

- [ ] **Step 5: `column-resize.ts` のコメントを直す**

先頭コメントの「**表を持つツールはこのモジュールを使う。** いまは用語集だけだが、状態遷移の遷移表が2本目になる」を次に差し替える:

```ts
/**
 * 表の列幅と、額縁のペイン幅（rev 10章の実装規約「キーボード・マウス処理は
 * 共通フック／モジュールに一元化し、全ツールがそれを使う」のマウス側）。
 *
 * **幅をドラッグで変えるものはこのモジュールを使う。** 表（用語集・
 * エラーカタログ）は列の配列として、額縁の端末ペインは幅1要素の配列として
 * 通す（M11）。3本目の実装を生やさないこと
 */
```

- [ ] **Step 6: `App.tsx` に組み込む**

import を足す:

```tsx
import { PanelLeft, PanelRight } from 'lucide-react'
import { PaneSplitter } from '@/components/PaneSplitter'
import { TerminalPane } from '@/components/TerminalPane'
import { createColumnWidthStore } from '@/core/column-resize'
import { BUNDLED_SKILLS, syncBundledSkills } from '@/core/skill-sync'
import {
  activateSession,
  closeSession,
  emptyTerminalState,
  markExited,
  markFailed,
  markRunning,
  openSession,
  type TerminalState,
} from '@/core/terminal/sessions'
import { tauriPtyIo } from '@/fs/pty'
import { tauriSkillSyncIo } from '@/fs/skill-resources'
```

モジュールスコープに足す（`AUTOSAVE_DELAY_MS` の近く）:

```tsx
/**
 * 端末ペインの既定幅。**永続化しない**——「アプリを閉じるまで」が
 * モジュールの生存期間とちょうど一致する（M8 決定7 と同じ扱い）
 */
const paneWidthStore = createColumnWidthStore([420])
```

`App()` の中、`const [dark, setDark] = useState(false)` の下に足す:

```tsx
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [paneOpen, setPaneOpen] = useState(false)
  const [terminals, setTerminals] = useState<TerminalState>(emptyTerminalState)
  const paneWidth = useSyncExternalStore(paneWidthStore.subscribe, paneWidthStore.getSnapshot)
  const splitRef = useRef<HTMLDivElement | null>(null)

  /**
   * タブを1本足す。**開く直前に必ず Skill を同期する**（設計 決定10）——
   * Skill の更新・追加が黙って取り残されないようにするため。
   * 同期に失敗しても起動は続ける（Skill が無くても端末は使える。設計 決定13）
   */
  const openTerminal = async () => {
    const dir = projectDir
    if (dir === null) return
    try {
      await syncBundledSkills(dir, tauriSkillSyncIo, BUNDLED_SKILLS)
    } catch (err: unknown) {
      showToast({
        message: `Skill をプロジェクトへ配置できませんでした（Skill 無しで起動します）: ${
          err instanceof Error ? err.message : String(err)
        }`,
        key: 'skill-sync',
      })
    }
    setTerminals((prev) => openSession(prev))
  }

  const closeTerminal = (id: number) => {
    // **updater の外で殺す。** setState の updater は純粋でなければならない
    //（StrictMode の二重実行で kill が2回飛ぶ。showToast の id 採番と同じ理由）
    const target = terminals.sessions.find((s) => s.id === id)
    if (target !== undefined && target.ptyId !== null) void tauriPtyIo.kill(target.ptyId)
    setTerminals((prev) => closeSession(prev, id))
  }
```

`useSyncExternalStore` を `react` の import に足す。

ヘッダの `toggleTheme` ボタンの直前に2つ足す:

```tsx
        <button
          type="button"
          aria-label={sidebarOpen ? 'ファイル一覧を畳む' : 'ファイル一覧を開く'}
          aria-pressed={sidebarOpen}
          className={`${buttonBase} ml-auto p-1 text-ink-muted`}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <PanelLeft aria-hidden className="size-4" />
        </button>
        {/* **ラベルを `Claude Code を開く` にしないこと。** TerminalPane の
            空状態のボタンと accessible name が衝突し、テストの getByRole が
            2つ拾って落ちる */}
        <button
          type="button"
          aria-label={paneOpen ? 'Claude Code ペインを畳む' : 'Claude Code ペインを開く'}
          aria-pressed={paneOpen}
          disabled={projectDir === null}
          className={`${buttonBase} p-1 text-ink-muted`}
          onClick={() => {
            const next = !paneOpen
            setPaneOpen(next)
            if (next && terminals.sessions.length === 0) void openTerminal()
          }}
        >
          <PanelRight aria-hidden className="size-4" />
        </button>
```

既存の `toggleTheme` ボタンから `ml-auto` を消す（右寄せの起点が上の `PanelLeft` へ移るため）。

本体のレイアウトを差し替える。`<div className="flex min-h-0 flex-1">` を次にする:

```tsx
      <div ref={splitRef} className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <aside className="w-64 shrink-0 overflow-y-auto border-r border-rule bg-surface">
            {/* 中身は既存の <FileList ... /> のまま。1行も触らない */}
          </aside>
        )}

        <section className="min-w-0 flex-1 overflow-auto">
          {/* 中身は既存のまま。1行も触らない */}
        </section>

        {paneOpen && projectDir !== null && (
          <PaneSplitter containerRef={splitRef} store={paneWidthStore} />
        )}
        {projectDir !== null && (
          <aside
            ref={terminalPaneRef}
            // **`paneOpen && <aside>` にしないこと。** アンマウントすると
            // xterm のスクロールバックが消え、開き直すたびに新しい claude が
            // 立ち上がる（設計 決定6）。畳む＝隠すだけ。
            // display は排他なので三項で切り替える（`hidden` と `flex` を
            // 並べてもどちらが勝つかは出力順まかせになる）
            className={`${paneOpen ? 'flex' : 'hidden'} shrink-0 flex-col border-l border-rule`}
            style={{ width: paneWidth[0] }}
          >
            <TerminalPane
              state={terminals}
              cwd={projectDir}
              ptyIo={tauriPtyIo}
              paneVisible={paneOpen}
              onOpen={() => void openTerminal()}
              onClose={closeTerminal}
              onActivate={(id) => setTerminals((prev) => activateSession(prev, id))}
              onRunning={(id, ptyId) => setTerminals((prev) => markRunning(prev, id, ptyId))}
              onExited={(id, message) => setTerminals((prev) => markExited(prev, id, message))}
              onFailed={(id, message) => setTerminals((prev) => markFailed(prev, id, message))}
            />
          </aside>
        )}
      </div>
```

**`ref={terminalPaneRef}` は Task 7 で足す。** Task 6 の時点では ref の宣言がまだ無いので、この行だけ Task 7 まで書かない。

- [ ] **Step 7: 3本が緑であることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS

**`conventions.test.ts` が落ちたら**、追加したクラスに色値の直書き（`text-[#...]` や `bg-[oklch(...)]`）か `text-xl` 以上が混ざっている。役割トークンと4段のサイズだけに直す。

- [ ] **Step 8: コミット**

```bash
git add src/App.tsx src/components/PaneSplitter.tsx src/components/PaneSplitter.dom.test.tsx src/core/column-resize.ts
git status --short   # sample-project/ が出ていないこと
git commit -m "feat(m11): ヘッダのボタンから端末ペインを開閉できるようにする"
```

---

## Task 7: キーボードの境界と App レベルの DOM テスト

**`open-issues.md` が「全ツールの Undo が同時に静かに壊れうる唯一の穴」と記録している層に、ここで初めてテストが入る**（設計 9章）。

**Files:**
- Create: `src/core/keyboard/global-layer.ts`, `src/core/keyboard/global-layer.test.ts`
- Create: `src/App.dom.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: なし
- Produces: `isOutsideGlobalLayer(target, terminalPane)`

- [ ] **Step 1: 純関数の失敗するテストを書く**

`src/core/keyboard/global-layer.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isOutsideGlobalLayer } from './global-layer'

describe('isOutsideGlobalLayer', () => {
  it('端末ペインが無ければ常に false（誰も管轄外ではない）', () => {
    expect(isOutsideGlobalLayer(document.createElement('div'), null)).toBe(false)
  })

  it('端末ペインの中の要素は管轄外', () => {
    const pane = document.createElement('div')
    const inner = document.createElement('textarea')
    pane.appendChild(inner)
    expect(isOutsideGlobalLayer(inner, pane)).toBe(true)
  })

  it('端末ペインそのものも管轄外', () => {
    const pane = document.createElement('div')
    expect(isOutsideGlobalLayer(pane, pane)).toBe(true)
  })

  it('端末ペインの外の要素は管轄内', () => {
    const pane = document.createElement('div')
    expect(isOutsideGlobalLayer(document.createElement('input'), pane)).toBe(false)
  })

  it('Node でない target は管轄内として扱う', () => {
    const pane = document.createElement('div')
    expect(isOutsideGlobalLayer(null, pane)).toBe(false)
    expect(isOutsideGlobalLayer(window, pane)).toBe(false)
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/core/keyboard/global-layer.test.ts`
Expected: FAIL（`./global-layer` が解決できない）

- [ ] **Step 3: 実装する**

`src/core/keyboard/global-layer.ts`:

```ts
/**
 * グローバル層（rev 10章）がキーを見送るべきかの判定。
 *
 * **端末ペインは操作言語の管轄外**（設計 決定11）。額縁のグローバル keydown は
 * window の bubble 段階で Ctrl+Z を横取りするので、これが無いと**端末で
 * Ctrl+Z を押したときに facet が Undo する**——Claude Code には届かず、
 * 編集中の図が勝手に巻き戻る。モーダル中に操作言語を止めるのと同じ扱い
 */
export function isOutsideGlobalLayer(
  target: EventTarget | null,
  terminalPane: HTMLElement | null,
): boolean {
  if (terminalPane === null) return false
  return target instanceof Node && terminalPane.contains(target)
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/core/keyboard/global-layer.test.ts`
Expected: PASS（5件）

- [ ] **Step 5: `App.tsx` に配線する**

`splitRef` の近くに足す:

```tsx
  // window リスナーはマウント時に1回しか張らないので、最新値は ref から読む
  //（**state 直読みに「簡潔化」しないこと**。常に初期値になる）
  const terminalPaneRef = useRef<HTMLElement | null>(null)
```

グローバル keydown の中身を差し替える:

```tsx
    const onKeyDown = (e: KeyboardEvent) => {
      // 端末ペインは操作言語の管轄外（rev 10章）。ここを通さないと
      // 端末の Ctrl+Z が Claude Code に届かず facet の Undo になる
      if (isOutsideGlobalLayer(e.target, terminalPaneRef.current)) return
      const cmd = resolveCommand(toKeyEventLike(e), globalKeyContext(modalOpenRef.current))
      if (cmd !== 'undo' && cmd !== 'redo') return
      e.preventDefault()
      runHistoryRef.current(cmd)
    }
```

Task 6 で足した端末ペインの `<aside>` に `ref={terminalPaneRef}` を足す。

- [ ] **Step 6: App レベルの失敗する DOM テストを書く**

`src/App.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * 額縁レベルの DOM テスト。**このファイルが守っているのは1点だけ**——
 * 端末にフォーカスがある間、グローバル層（rev 10章）が Ctrl+Z を横取りしないこと。
 *
 * open-issues が「全ツールの Undo が同時に静かに壊れうる唯一の穴」と
 * 記録していた層で、ここに初めてテストが入る（M11）
 */

vi.mock('@/fs/project-fs', () => ({
  pickProjectFolder: async () => '/proj',
  listJsonFiles: async () => [],
  readProjectFile: async () => '',
  writeProjectFile: async () => undefined,
  fileExists: async () => false,
  moveFileToTrash: async () => undefined,
  joinPath: async (dir: string, name: string) => `${dir}/${name}`,
  watchFolder: async () => () => undefined,
  askSaveMarkdownPath: async () => null,
}))
vi.mock('@/fs/app-window', () => ({
  interceptClose: async () => () => undefined,
  forceClose: async () => undefined,
}))
vi.mock('@/fs/clipboard', () => ({ copyToClipboard: async () => undefined }))
vi.mock('@/fs/pty', () => ({
  tauriPtyIo: {
    spawn: async () => 1,
    write: async () => undefined,
    resize: async () => undefined,
    kill: async () => undefined,
  },
  killAllPtys: async () => undefined,
}))
vi.mock('@/fs/skill-resources', () => ({ tauriSkillSyncIo: {} }))
vi.mock('@/core/skill-sync', async (orig) => ({
  ...(await orig<typeof import('@/core/skill-sync')>()),
  syncBundledSkills: async () => undefined,
}))
// xterm は canvas を使うので jsdom では動かない
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(() => ({
    open: vi.fn(),
    write: vi.fn(),
    onData: vi.fn(),
    loadAddon: vi.fn(),
    dispose: vi.fn(),
    cols: 80,
    rows: 24,
  })),
}))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: vi.fn(() => ({ fit: vi.fn() })) }))

const App = (await import('./App')).default

afterEach(cleanup)

async function openPane() {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
  const toggle = await screen.findByRole('button', { name: 'Claude Code ペインを開く' })
  await waitFor(() => expect(toggle.hasAttribute('disabled')).toBe(false))
  fireEvent.click(toggle)
  return await screen.findByRole('tablist')
}

describe('グローバル層と端末ペインの境界', () => {
  it('**端末の中の Ctrl+Z は横取りしない**', async () => {
    const tablist = await openPane()
    // fireEvent は preventDefault されていなければ true を返す
    const notPrevented = fireEvent.keyDown(tablist, { key: 'z', ctrlKey: true })
    expect(notPrevented).toBe(true)
  })

  it('端末の外の Ctrl+Z は従来どおり横取りする', async () => {
    await openPane()
    const notPrevented = fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
    expect(notPrevented).toBe(false)
  })

  it('端末の中の Ctrl+Shift+Z も横取りしない', async () => {
    const tablist = await openPane()
    const notPrevented = fireEvent.keyDown(tablist, { key: 'Z', ctrlKey: true, shiftKey: true })
    expect(notPrevented).toBe(true)
  })
})
```

- [ ] **Step 7: テストが通ることを確認する**

Run: `npx vitest run src/App.dom.test.tsx`
Expected: PASS（3件）

**「端末の外の Ctrl+Z」が落ちたら**、`fireEvent.keyDown(document.body, …)` が window まで bubble していない。`render` した要素が `document.body` の中にあることを確認する（Testing Library の既定はそう）。

- [ ] **Step 8: コミット**

```bash
git add src/core/keyboard/global-layer.ts src/core/keyboard/global-layer.test.ts src/App.tsx src/App.dom.test.tsx
git commit -m "feat(m11): 端末ペインを操作言語の管轄外にして Undo の横取りを止める"
```

---

## Task 8: フォルダ切替とアプリ終了のライフサイクル

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.dom.test.tsx`（追記）

**Interfaces:**
- Consumes: `hasRunning` / `closeAll`（Task 2）、`killAllPtys`（Task 1）、`pushModal`（既存）

- [ ] **Step 1: 失敗するテストを追記する**

`src/App.dom.test.tsx` の末尾に足す:

```tsx
describe('フォルダ切替', () => {
  it('**実行中のタブがあれば確認してから切り替える**', async () => {
    await openPane()
    await screen.findByRole('tab', { name: 'Claude 1' })
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    expect(
      await screen.findByText('Claude Code のタブを終了してフォルダを切り替えますか？'),
    ).toBeTruthy()
  })

  it('承認するとタブが消える', async () => {
    await openPane()
    await screen.findByRole('tab', { name: 'Claude 1' })
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    fireEvent.click(await screen.findByRole('button', { name: '終了して切り替える' }))
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'Claude 1' })).toBeNull())
  })

  it('取り消すとタブが残る', async () => {
    await openPane()
    await screen.findByRole('tab', { name: 'Claude 1' })
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))
    expect(screen.getByRole('tab', { name: 'Claude 1' })).toBeTruthy()
  })
})
```

**`キャンセル` のラベルは `src/components/ConfirmDialog.tsx` の実物に合わせること。** 違っていたらテスト側を実物に直す（コンポーネントは変えない）。

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/App.dom.test.tsx`
Expected: FAIL（確認ダイアログの文言が見つからない）

- [ ] **Step 3: `App.tsx` に配線する**

import に足す: `import { closeAll, hasRunning } from '@/core/terminal/sessions'`、`import { killAllPtys, tauriPtyIo } from '@/fs/pty'`。

`openFolder` を差し替える:

```tsx
  /**
   * 端末を全部終了してからフォルダを切り替える。**作業ディレクトリが
   * プロジェクトフォルダに固定されている**ので、残すと「別フォルダを見ている
   * Claude」が古い cwd のまま居座り、Skill も新しいフォルダ側に置かれる
   *（設計 決定12）
   */
  const switchFolder = async (dir: string) => {
    await killAllPtys()
    setTerminals((prev) => closeAll(prev))
    setPaneOpen(false)
    await controller.openFolder(dir)
  }

  const openFolder = async () => {
    const dir = await pickProjectFolder()
    if (dir === null) return
    if (!hasRunning(terminals)) {
      await controller.openFolder(dir)
      return
    }
    setModals((prev) =>
      pushModal(prev, {
        kind: 'confirm',
        key: 'switch-folder',
        title: 'Claude Code のタブを終了してフォルダを切り替えますか？',
        description:
          '端末の作業フォルダは開いているプロジェクトに固定されています。会話は Claude Code 側に残るので、--resume で戻せます。',
        confirmLabel: '終了して切り替える',
        onConfirm: () => switchFolder(dir),
      }),
    )
  }
```

`appIo` の `forceClose` を差し替える（モジュールスコープ）:

```ts
  // **アプリを閉じるときに端末も全部殺す。** Windows では ConPTY の子は
  // ホストプロセスの終了で自動的には死なず、claude が孤児として残る
  forceClose: async () => {
    await killAllPtys()
    await forceClose()
  },
```

`src/fs/pty.ts` の import を `App.tsx` の先頭に足す。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/App.dom.test.tsx`
Expected: PASS（6件）

- [ ] **Step 5: 3本が緑であることを確認してコミット**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS

```bash
git add src/App.tsx src/App.dom.test.tsx
git commit -m "feat(m11): フォルダ切替とアプリ終了で端末を確実に終了する"
```

---

## Task 9: 実機確認と文書への反映

**Files:**
- Create: `docs/history/m11-core-claude-code-pane.md`
- Modify: `docs/open-issues.md`, `docs/overview-rev.md`, `docs/project-setup.md`, `docs/README.md`

- [ ] **Step 1: 実機で通しの確認をする**

Run: `npm run tauri dev`

順に確認する（**開発者ツールのコンソールに `[TAURI]` の権限エラーが出ていないことも見る**——権限不足は静かに失敗する）:

- [ ] フォルダ未選択のとき `Claude Code を開く` が押せない
- [ ] `sample-project/` を開いて `Claude Code を開く` を押すと、右ペインが開いて Claude Code が立ち上がる
- [ ] `sample-project/.claude/skills/` に `glossary-term-register` と `error-catalog-register` が置かれている
- [ ] 端末で `/glossary-term-register` 系の Skill が候補に出る（プロジェクトレベルの Skill として読めている）
- [ ] 日本語を打っても化けない。日本語の出力も化けない
- [ ] `＋` でタブが増え、`Claude 2` になる。切り替えると両方の内容が保たれている
- [ ] 境界をドラッグするとペインの幅が変わり、図がその幅でレイアウトし直される
- [ ] ファイル一覧を畳むとエディタが広がる
- [ ] ペインを畳んで開き直しても会話が残っており、**表示が崩れていない**
- [ ] 端末にフォーカスがある状態で `Ctrl+Z` を押しても、編集中のファイルが巻き戻らない
- [ ] Skill で用語を登録すると、アプリ側にトーストが出て内容が反映される（外部変更検知）
- [ ] 実行中のタブがある状態で `フォルダを開く` を押すと確認ダイアログが出る
- [ ] アプリを閉じた後、タスクマネージャに `claude` が残っていない

- [ ] **Step 2: 実機確認の痕跡を捨てる**

```bash
git checkout -- sample-project/ && git clean -fd sample-project/
git status --short   # 空になること
```

**`.claude/skills/` が `sample-project/` に書かれているので、この掃除は必須**（`CLAUDE.md` の後片付け1）。

- [ ] **Step 3: `docs/history/m11-core-claude-code-pane.md` を書く**

そのとき何が起きたかだけを書く（以後変えない）。必ず含めるもの:

- Task 1 Step 7 で `claude` の起動がどの形（直接 spawn か `cmd.exe /c`）で通ったか
- 実機確認で出た観察（体感の違和感を含む。設計判断を変える理由にならなくても記録する）
- Rust の例外を1本増やしたこと、その範囲（判断を置いていないこと）

- [ ] **Step 4: `docs/open-issues.md` を更新する**

**消す:**

- 「**`Ctrl+Z` / `Ctrl+Shift+Z` をエディタが消費しないことを守るテストが、リポジトリのどこにも無い**」——Task 7 の `src/App.dom.test.tsx` が塞いだ

**足す（「挙動の穴」へ）:**

- **一度端末をクリックするとキーボードだけでは本体へ戻れない**（`src/components/TerminalPane.tsx`）: xterm が `Tab` を消費するため。ペインの開閉にショートカットを割り当てない判断（設計 決定11）の帰結で、マウスで本体をクリックする必要がある。**facet は入力速度最優先（rev 2章）を掲げているので、体験としては未達である** `[M11]`
- **端末の中だけライト表示でも暗い**（`src/components/TerminalTab.tsx`）: xterm の既定配色を使い、facet の役割トークンを流し込んでいない（端末は rev 9章の対象外という判断）。実機で違和感が出たら、CSS カスタムプロパティを実行時に解決して xterm の `theme` へ渡す形を検討する——**その際もソースに色値を書かないこと**（`conventions.test.ts`） `[M11]`

**突き合わせる:**

- 「**エラー登録 Skill が無い**（`.claude/skills/`）」は M10 完了時点の記述で、現在の `.claude/skills/` には `error-catalog-register` が実在する（同じファイルの別項がそのスクリプトを名指ししている）。**実物を確認して、解消済みなら消す**

- [ ] **Step 5: `docs/overview-rev.md` に反映する**

| 章 | 何を書くか |
| --- | --- |
| 4章 | 「AI はアプリに組み込まない」の直後に例外を明記する: **アプリ内 AI 機能は作らないが、AI を起動する場所は提供する。facet は端末のホストであって AI の対話相手ではない。「Claude の出力を読んで何かを決める」実装が現れたらこの原則の違反である**（設計 決定1） |
| 4章 | 運用推奨「**AIに作業させる間は対象ファイルをアプリで閉じる**」を**削除**し、代わりに「衝突は M5 の外部変更検知が受ける（未保存編集が無ければ再読み込み＋トーストで Undo 履歴を破棄、あれば二択）」と書く（設計 決定2） |
| 4章 | Skill の配布について1行: **同梱 Skill はアプリの resources に入っており、端末を開く直前にプロジェクトフォルダの `.claude/skills/` へ置き直される**（設計 決定10） |
| 7章 | Rust の例外に3つ目を足す: **PTY のコマンド4本**（`pty_spawn` / `pty_write` / `pty_resize` / `pty_kill`）。判断を置かず、実行ファイル名も引数も TypeScript が渡す（設計 決定3） |
| 10章 | 境界規則に足す: **端末ペインは操作言語の管轄外**。モーダル中に操作言語を止めるのと同じ扱い（設計 決定11） |

**`rev N章` は 249 箇所から参照されている通称。ファイル名と章番号は動かさないこと。**

- [ ] **Step 6: `docs/project-setup.md` に反映する**

「Rust と capabilities」節の例外の箇条書きに PTY コマンド4本を足し、権限の表に今回の3つを足す:

| API | 必要だったもの | 欠けたときの症状 |
| --- | --- | --- |
| `mkdir()` / `remove()`（Skill の配置） | `fs:allow-mkdir` / `fs:allow-remove` | Skill が置かれず、端末で Skill が見つからない |
| `resolveResource()` ＋ `readDir()`（同梱 Skill の読み出し） | `fs:allow-read-dir` / `fs:allow-read-text-file` の `$RESOURCE/skills/**` scope | 同上 |

- [ ] **Step 7: `docs/README.md` のマイルストーン表に1行足す**

```markdown
| [M11](history/m11-core-claude-code-pane.md) | Claude Code ペイン | コア |
```

- [ ] **Step 8: 3本が緑であることを確認してコミット**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS

```bash
git status --short   # sample-project/ が出ていないこと
git add docs/
git commit -m "docs(m11): 申し送りを書き、rev と残件へ反映する"
```

- [ ] **Step 9: PR を出す**

```bash
git push -u origin worktree-m11-claude-code-pane
gh pr create --title "M11: Claude Code ペイン" --body "$(cat <<'EOF'
ヘッダのボタン1個で右ペインに Claude Code の端末を開けるようにする。
会議中に Skill を走らせる動線をアプリの中に作るのが目的。

- PTY は Rust（portable-pty）に持たせる。判断は置かず生バイトを流すだけ
- 同梱 Skill をプロジェクトフォルダへ置き直してから起動する
- 端末ペインは操作言語の管轄外（Ctrl+Z の横取りを止める）

rev を3箇所改訂している（4章・7章・10章）。設計スペックは
docs/superpowers/plans/2026-08-12-m11-claude-code-pane-design.md。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**マージ後の後片付けは `CLAUDE.md` の手順に従うこと**（主チェックアウトで `git pull` → **`npm install` を飛ばさない**（今回は xterm が増えている）→ `npm test && npx tsc -b && npm run lint` → worktree を消す → `.claude/worktrees/` の残骸を掃除）。
