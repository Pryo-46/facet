# M17 端末の残件 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** M11 で作った Claude Code 端末ペインに残った6つの穴（配色・起動待ちの入力消失・全殺しの取りこぼし・アンマウント時の kill 漏れ・フォルダ切替の残骸・`pty_write` のロック粒度）を塞ぐ。

**Architecture:** 端末は3層に分かれている——**額縁の React 層**（`src/components/TerminalTab.tsx` / `TerminalPane.tsx` / `src/App.tsx`）、**Tauri の口**（`src/fs/pty.ts`）、**Rust のホスト**（`src-tauri/src/pty.rs`）。6件はこの3層に散っており、層をまたぐ設計変更は1件も要らない。新規に作るのは配色を組み立てるコアの純関数（`src/core/terminal/theme.ts`）1本だけで、残りは既存ファイルの局所的な修正である。

**Tech Stack:** React 19 / TypeScript / Vitest（jsdom）/ Tailwind v4 / Tauri 2.11 / Rust（`portable-pty` 0.9）/ `@xterm/xterm`

**Spec:** [`docs/open-issues.md`](../../open-issues.md) の「挙動の穴（実害は小さいが残っている）」にある `[M11]` の6項目。設計判断は本計画の「設計判断」節で確定させる（別途のスペック文書は作らない）。

---

## Global Constraints

- **色値をソースに書かない。** 色値を持ってよいのは `src/styles/palette.css` だけで、`src/styles/conventions.test.ts` が `src/**/*.ts(x)`（テストファイルを除く）を走査して `#rrggbb` / `rgb(` / `hsl(` / `oklch(` を弾く。**JSDoc の中も対象**（コメントは `stripComments` で除去されるので、コメントに色を書くのは違反ではない）。
- **Tailwind 標準パレット（`bg-red-500` など）を使わない。** 同じ検査が弾く。
- **フォントサイズは `text-xs` / `text-sm` / `text-base` / `text-lg` / `text-2xl` の5段のみ。** 任意値 `text-[13px]` も禁止（同じ検査）。
- **Rust 側に判断を置かない**（rev 7章の例外3つ目）。`src-tauri/src/pty.rs` に `claude` という文字列を現れさせない。実行ファイル名・引数・作業ディレクトリは TypeScript 側が決めて渡す。
- **端末ペインはアンマウントしない**（設計 決定6）。畳む＝`hidden` で隠すだけ。アンマウントするとスクロールバックと会話が消える。
- **隠れている間は測らない。** `display:none` では `clientWidth` が 0 になるので、`hidden` の間に `fit()` を呼ばない。
- **書き込みの失敗はタブの中に出す**（設計 決定13）。握り潰すと「打っても何も起きない端末」になり、原因が画面から読めない。
- **検証コマンド**は毎タスクの最後に**対象を絞らずに**回す: `npm test && npx tsc -b && npm run lint`。Task 6 だけ追加で `cargo test`（`src-tauri` で）。
- **計画の指示が矛盾していたら、辻褄を合わせずに「計画の矛盾」として報告すること。** ただし例外がある——**既存の実装と一致すべきもの（文言・トークン名・関数名）は実物が正**で、計画の記述と食い違ったら実物に合わせたうえで報告する。
- **「直した」と報告するときは、実行した検証コマンドとその出力を報告に貼ること。**

---

## 設計判断

計画時に実物（`node_modules` / `~/.cargo/registry`）で確かめた事実と、それを踏まえて確定させた判断を先に置く。実装者はこの節を「正」として読んでよい。

### 決定1: 端末の配色は「面・文字・カーソル・選択」だけを役割トークンから流し込み、ANSI の16色は xterm の既定のままにする

`@xterm/xterm` の `ITheme` は `foreground` / `background` / `cursor` / `cursorAccent` / `selectionBackground` に加えて ANSI 16色（`black`〜`brightWhite`）を持つ（`node_modules/@xterm/xterm/typings/xterm.d.ts:343`）。facet の役割トークンは11個で、**16色に対応物が無い。** 16色を新設すると「配色を差し替える」作業が「16色を選び直す」作業になり、`palette-retheme` Skill の前提（外部テーマの変数から機械的に埋める）も壊れる。

一方、**16色を xterm の既定のまま背景だけ明るくすると、既定の bright 系（明るい黄・明るい白）がライトの面で読めなくなる。** ここは xterm 自身が持つ `minimumContrastRatio`（同 `xterm.d.ts:207`）で解く——背景に対して比が足りない前景色を xterm が自動で寄せる仕組みで、**ソースに色値を1つも書かずに済む。** 値は facet が本文に課している 4.5:1 に揃える。

### 決定2: 色値の変換には `src/styles/contrast.ts` を使い、同じ変換式を2本持たない

`palette.css` の値は `oklch(L C H)` で、**xterm は oklch を解釈しない。** 実行時に sRGB の16進へ変換する必要がある。変換式は既に `src/styles/contrast.ts` が持っている（`parseOklch` / `oklchToLinear` / `toHex`）ので、それを呼ぶ。

**ただしこのファイルの JSDoc は現在「アプリの実行時には使わない（テストからのみ呼ぶ）」と書いており、`toHex` は「テストの出力に人が読める色を出すため。判定には使わない」と書いている。** 本マイルストーンでこの契約を変えるので、**両方の JSDoc を書き替える**（Task 5 の手順に含める）。式を複製するより契約を書き替えるほうが安い、という判断である。なお `contrast.ts` は `.claude/skills/palette-retheme/scripts/palette-fit.mjs` から Node の型ストリップで import されているが、**アプリ側から import が1本増えることはこの制約に影響しない**（消去可能な構文しか書かない、という制約は変わらない）。

### 決定3: フォルダ切替の後始末は `switchFolder` の1本に寄せる

現在 `src/App.tsx` の `openFolder` は `hasRunning(terminals)` が false のとき `openProject(dir)` だけ呼んで返る。`hasRunning` は `starting` / `running` しか見ない（`src/core/terminal/sessions.ts`）ので、`exited` / `failed` のタブが旧フォルダの残骸として残る。**`hasRunning` は「確認ダイアログの要否」だけに使い、後始末はどちらの経路も `switchFolder` を通す。**

帰結として、実行中のタブが1本も無い場合でも「フォルダを開く」でペインが畳まれる（`switchFolder` が `setPaneOpen(false)` を呼ぶため）。**これは意図した変更である**——旧フォルダのために開いていたペインを新フォルダでそのまま開いたままにする理由が無い。

### 決定4: `pty_write` は同期コマンドのままにし、`sessions` の錠前だけを外す

`src-tauri/src/pty.rs` の `pty_write` は `state.sessions.lock()` を握ったまま `write_all` / `flush` を呼ぶ。**この錠前を外す**（書き手を `Arc<Mutex<…>>` に隔離し、`sessions` の錠前は書き手を取り出した時点で解放する）。

**`#[tauri::command(async)]` にはしない。** `tauri-macros` 2.6.3 の `src/command/wrapper.rs` を読むと、既定は `ExecutionContext::Blocking`（`:50`）で `kind = "sync"`（`:266`）。`(async)` を付けた同期関数は `"sync_threadpool"`（`:264`）になり、`:249` 経由で `body_async`（`respond_async_serialized`）へ渡ってスレッドプールへ投げられる。**投げた瞬間、複数の `pty_write` の到着順が保証されなくなる**——`src/components/TerminalTab.tsx` は `void ptyIo.write(...)` で待たずに撃つので、打鍵が入れ替わりうる。**打鍵の並び替えは、いま塞ごうとしている穴より重い。**

したがって本タスクで消えるのは「`pty_write` と `pty_kill` が同じ錠前を取り合う」という**設計上の欠陥**であって、「詰まった端末を必ず殺せる」という**保証ではない**（同期コマンドは main thread で走るため、書き込みが本当に返らなければ後続の IPC ごと止まる）。**根治は「セッションごとの書き込みスレッド＋エラーを `Channel` で返す」だが、それは設計 決定13（書き込み失敗をタブの中に出す）の同期的なエラー経路を作り替える変更なので、本マイルストーンではやらない。** 残る穴として `open-issues.md` に書き直す（Task 8）。

### 決定5: `killAllPtys` の取りこぼしは「世代」と「in-flight の待ち合わせ」の2つで塞ぐ

`src/fs/pty.ts` の `live` への登録は `pty_spawn` の解決後なので、invoke が in-flight の間に `killAllPtys` が走ると素通りする。**片方だけでは足りない:**

- **世代（`generation`）だけ**だと、解決後に投げる kill が `killAllPtys` の解決より後になる——アプリ終了経路（`interceptClose` → `killAllPtys` → close）では**間に合わずに孤児が残る**。
- **in-flight の待ち合わせだけ**だと、待ち合わせが済んだ後に spawn 側が `live.add(id)` してしまい、**空にしたはずの台帳に1本だけ生き残る。**

両方入れる。kill を飛ばすのは `killAllPtys` 側の1箇所だけにして、spawn 側は「台帳へ入れない」だけにする（二重に kill を飛ばさない）。**`generation` は単調増加のカウンタで、フォルダ切替のたびに進む**——真偽値のフラグにすると「1回全殺ししたらそれ以降どの端末も台帳に載らない」になる。

### 決定6: 起動待ちの入力は待ち行列に積んで、解決後に打たれた順で流す

`term.onData` の登録を `spawn` の解決後から**マウント直後**へ移し、`ptyIdRef.current` が `null` の間は待ち行列へ積む。`Shift+Enter` のハンドラも同じ送信口を通す（いまは `ptyId !== null` のとき**だけ**書き込み、null なら黙って落としている）。

**待ち行列に上限は設けない。** 溜まるのは spawn が解決するまでの約1秒ぶんで、上限を設けると「どこから捨てるか」という新しい判断が要る。上限が無いことは残る留意点として `open-issues.md` に書く（Task 8）。

---

## File Structure

| ファイル | 役割 | 本計画での扱い |
| --- | --- | --- |
| `src/core/terminal/theme.ts` | 役割トークン → xterm の配色（純関数） | **新規** |
| `src/core/terminal/theme.test.ts` | 上の単体テスト | **新規** |
| `src/fs/pty.test.ts` | `src/fs/pty.ts` の単体テスト | **新規** |
| `src/components/TerminalTab.tsx` | xterm 1個と PTY 1本 | Task 1・2・5 で修正 |
| `src/components/TerminalTab.dom.test.tsx` | 同上のテスト | Task 1・2・5 でテスト追加 |
| `src/components/TerminalPane.tsx` | 端末ペインの枠とタブバー | Task 5 で `dark` を通す |
| `src/fs/pty.ts` | PTY の Tauri 実装＋生存台帳 | Task 3 で修正 |
| `src/App.tsx` | 額縁。フォルダ切替と端末の配線 | Task 4・5 で修正 |
| `src/App.dom.test.tsx` | 額縁の DOM テスト | Task 4 でテスト追加 |
| `src/styles/contrast.ts` | 色の計算 | Task 5 で JSDoc の契約だけ修正 |
| `src-tauri/src/pty.rs` | PTY のホスト（Rust） | Task 6 で修正＋**このプロジェクト初の Rust テスト** |

---

### Task 1: 起動待ちに打った入力を捨てない

**Files:**
- Modify: `src/components/TerminalTab.tsx`
- Test: `src/components/TerminalTab.dom.test.tsx`

**Interfaces:**
- Consumes: `PtyIo`（`src/core/terminal/pty-io.ts`）の `write(id: number, data: string): Promise<void>`
- Produces: なし（`TerminalTab` の外から見える型は変わらない）

**背景:** `term.onData` の登録が `ptyIo.spawn(...).then(...)` の中にあるため、解決するまでの約1秒に打った文字はどこにも届かず無音で消える。`Shift+Enter` のハンドラも `if (ptyId !== null)` で黙って落としている。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TerminalTab.dom.test.tsx` の `describe('TerminalTab', …)` の中に足す（既存のテストの後ろでよい）。

```tsx
  it('起動待ちの間に打った入力を捨てず、spawn の解決後に打った順で送る', async () => {
    // `term.onData` の登録が spawn の解決後だと、ここで打った文字はどこにも
    // 届かない（M11 の残件「起動待ちの間に端末へ打った入力が無音で消える」）。
    // spawn の解決をテストから握って、その窓を作る
    const writes: Array<[number, string]> = []
    let release: () => void = () => undefined
    const io: PtyIo = {
      spawn: async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return 7
      },
      write: vi.fn(async (id: number, data: string) => {
        writes.push([id, data])
      }),
      resize: vi.fn(async () => undefined),
      kill: vi.fn(async () => undefined),
    }
    const onRunning = vi.fn()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={io}
        hidden={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )

    // **spawn の解決前に onData が登録されていること**が穴そのもの
    await waitFor(() => expect(term.onData).toHaveBeenCalled())
    const emit = term.onData.mock.calls.at(-1)?.[0] as (data: string) => void
    emit('a')
    emit('b')
    // まだ PTY の ID が無いので送れない
    expect(writes).toEqual([])

    release()
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    // 溜めた2文字が、打った順で流れる
    expect(writes).toEqual([
      [7, 'a'],
      [7, 'b'],
    ])
  })

  it('起動待ちの間の Shift+Enter も捨てず、解決後に送る', async () => {
    // Shift+Enter のハンドラは `ptyId !== null` のときだけ書き込んでいたので、
    // 起動待ちの改行は黙って落ちていた。上のテストと分けるのは、こちらが
    // 通る別の経路（attachCustomKeyEventHandler）だから
    const writes: string[] = []
    let release: () => void = () => undefined
    const io: PtyIo = {
      spawn: async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return 7
      },
      write: vi.fn(async (_id: number, data: string) => {
        writes.push(data)
      }),
      resize: vi.fn(async () => undefined),
      kill: vi.fn(async () => undefined),
    }
    const onRunning = vi.fn()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={io}
        hidden={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(term.attachCustomKeyEventHandler).toHaveBeenCalled())
    const handler = term.attachCustomKeyEventHandler.mock.calls[0]?.[0] as (
      event: KeyboardEvent,
    ) => boolean
    handler(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }))
    expect(writes).toEqual([])

    release()
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    expect(writes).toEqual([`${String.fromCharCode(27)}\r`])
  })
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/components/TerminalTab.dom.test.tsx`
Expected: 追加した2本が FAIL。1本目は `term.onData` が呼ばれないまま `waitFor` がタイムアウトする。2本目は `writes` が `[]` のままになる。

- [ ] **Step 3: 送信口を1本にして待ち行列を持たせる**

`src/components/TerminalTab.tsx` の `ptyIdRef` の宣言の直後に足す。

```tsx
  /**
   * **起動待ちの間に打たれた入力。** `spawn` が解決するまで PTY の ID が
   * 無いので送れない。捨てると起動までの約1秒だけ打鍵が無音で消えるので、
   * ここへ積んで解決後に打たれた順で流す。
   *
   * **上限は設けない**（溜まるのは約1秒ぶん。上限を設けると「どこから
   * 捨てるか」という新しい判断が要る）
   */
  const pendingRef = useRef<string[]>([])
```

起動 effect の `let disposed = false` の直後に、送信口を1本置く。

```tsx
    /**
     * 端末への送信口。**書き込みはすべてここを通す。** ID がまだ無い間は
     * 待ち行列へ積むだけにして、`spawn` の解決時に同じ順で流し直す
     */
    const send = (data: string): void => {
      const ptyId = ptyIdRef.current
      if (ptyId === null) {
        pendingRef.current.push(data)
        return
      }
      // 書き込みの失敗もタブの中に出す（設計 決定13）。握り潰すと
      // 「打っても何も起きない端末」になり、原因が画面から読めない
      void ptyIo.write(ptyId, data).catch((err: unknown) => {
        // **disposed で守る**——StrictMode で捨てられた側のハンドラが
        // 書き込みに失敗しても、生きているセッションを failed にしない
        if (disposed) return
        cb.current.onFailed(
          session.id,
          `端末へ書き込めませんでした: ${err instanceof Error ? err.message : String(err)}`,
        )
      })
    }
```

`attachCustomKeyEventHandler` の中の書き込みを `send` へ差し替える（`event.preventDefault()` の後ろ）。**`const ptyId = ptyIdRef.current` と `if (ptyId !== null)` の入れ子ごと消す。**

```tsx
      event.preventDefault()
      send(SHIFT_ENTER_SEQUENCE)
      return false
```

`attachCustomKeyEventHandler(...)` の呼び出しの直後（`void ptyIo.spawn({…})` の**前**）に、xterm からの入力の受け口を置く。

```tsx
    // **登録は spawn の前。** 解決を待って登録すると、起動までの約1秒に
    // 打った文字がどこにも届かない
    term.onData(send)
```

`.then((ptyId) => {…})` の中を差し替える。`ptyIdRef.current = ptyId` の直後に待ち行列を流し、**`term.onData(…)` の登録は丸ごと消す**（上へ移したため）。

```tsx
        ptyIdRef.current = ptyId
        // 起動待ちに積んだ入力を、打たれた順で流す。**配列を先に空にする**
        // ——send() の中でまた積まれる余地を残さない
        const queued = pendingRef.current
        pendingRef.current = []
        for (const data of queued) send(data)
```

`.catch((err: unknown) => {…})` の `if (disposed) return` の直後に1行足す。

```tsx
        // 起動できなかったので、溜まった入力は行き先が無い
        pendingRef.current = []
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/components/TerminalTab.dom.test.tsx`
Expected: このファイルの `it` がすべて緑。**既存のテストも1本も落ちないこと**——特に「アンマウント後に term.onData 経由の書き込みが遅れて失敗しても onFailed は呼ばれない」と「StrictMode で捨てられた側の Shift+Enter ハンドラの……」は `send` を経由する形に変わったので、ここで壊れていないかが分かる。

- [ ] **Step 5: 全体の検証**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。

- [ ] **Step 6: コミット**

```bash
git add src/components/TerminalTab.tsx src/components/TerminalTab.dom.test.tsx
git commit -m "fix(terminal): 起動待ちに打った入力を待ち行列へ積み、解決後に打った順で流す"
```

---

### Task 2: アンマウント時に自分の PTY を殺す

**Files:**
- Modify: `src/components/TerminalTab.tsx`（起動 effect の cleanup）
- Test: `src/components/TerminalTab.dom.test.tsx`

**Interfaces:**
- Consumes: Task 1 で置いた `ptyIdRef` / `pendingRef`、`PtyIo.kill(id: number): Promise<void>`
- Produces: なし

**背景:** cleanup は `disposed = true; term.dispose()` だけで、`ptyIdRef.current` を kill しない。プロセスの寿命は台帳（`App.tsx` の `closeTerminalNow`）に一本化してあるが、**`spawn` の解決と台帳への反映（`onRunning`）の隙間で閉じられると台帳は `ptyId` を知らない。**

- [ ] **Step 1: 失敗するテストを書く**

```tsx
  it('アンマウントすると自分の PTY を殺す（台帳が ptyId を知る前に閉じられても孤児にしない）', async () => {
    // プロセスの寿命は台帳（App の closeTerminalNow）に一本化してあるが、
    // spawn の解決と台帳への反映（onRunning）の隙間で閉じられると台帳は
    // ptyId を知らない。cleanup でも殺しておけばその窓が消える
    const pty = fakePty()
    const onRunning = vi.fn()
    const { unmount } = render(
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
    expect(pty.io.kill).not.toHaveBeenCalled()

    unmount()

    await waitFor(() => expect(pty.io.kill).toHaveBeenCalledWith(7))
  })
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/components/TerminalTab.dom.test.tsx -t 'アンマウントすると自分の PTY を殺す'`
Expected: FAIL。`pty.io.kill` が一度も呼ばれず `waitFor` がタイムアウトする。

- [ ] **Step 3: cleanup で殺す**

`src/components/TerminalTab.tsx` の起動 effect の `return () => {…}` を差し替える。

```tsx
    return () => {
      disposed = true
      // **自分の PTY を殺してから捨てる。** 台帳（App.tsx の
      // closeTerminalNow）も殺すが、`spawn` の解決と台帳への反映
      //（onRunning）の隙間で閉じられると台帳は ptyId を知らない。
      // **二重に殺しても無害**——pty_kill は既に消えた id に対して
      // 何もしない（src-tauri/src/pty.rs の sessions.remove が None を返す）。
      // ここで ref を null に落とすので、StrictMode で捨てられた側の
      // cleanup が生き残った側の ID を掴むこともない
      const ptyId = ptyIdRef.current
      ptyIdRef.current = null
      if (ptyId !== null) void ptyIo.kill(ptyId).catch(() => undefined)
      term.dispose()
    }
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/components/TerminalTab.dom.test.tsx`
Expected: このファイルの `it` がすべて緑。

**特に「StrictMode の二重マウントでも running は生き残った1本だけに通知し、捨てた側は kill で回収する」が緑のままであることを確認すること。** React は「effect 1 → cleanup 1 → effect 2」を同じコミットの中で同期的に走らせ、`spawn` の解決はそのあとのマイクロタスクなので、cleanup 1 の時点で `ptyIdRef.current` は `null` のままのはずである。**もしここで `killedIds` が2件になったら、その前提が崩れているということなので、辻褄を合わせずに「計画の前提の誤り」として報告すること。**

- [ ] **Step 5: 全体の検証**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。

- [ ] **Step 6: コミット**

```bash
git add src/components/TerminalTab.tsx src/components/TerminalTab.dom.test.tsx
git commit -m "fix(terminal): アンマウント時に自分の PTY を殺し、台帳へ載る前の窓を塞ぐ"
```

---

### Task 3: `killAllPtys` が起動中の PTY を取りこぼさない

**Files:**
- Modify: `src/fs/pty.ts`
- Create: `src/fs/pty.test.ts`（このファイル初のテスト）

**Interfaces:**
- Consumes: `PtyIo` / `PtySpawnSpec`（`src/core/terminal/pty-io.ts`）
- Produces: `tauriPtyIo: PtyIo` と `killAllPtys(): Promise<void>` の**シグネチャは変えない**。変わるのは内部の台帳の扱いだけ

**背景:** `live` への登録は `pty_spawn` の解決後なので、invoke が in-flight の間に `killAllPtys` が呼ばれると漏れる。塞ぎ方は「設計判断 決定5」を読むこと。

- [ ] **Step 1: 失敗するテストを書く**

`src/fs/pty.test.ts` を新規作成する。

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PtySpawnSpec } from '@/core/terminal/pty-io'

/**
 * `src/fs/pty.ts` の生存台帳のテスト。**Tauri の口そのもの（invoke の
 * 引数）ではなく、「どの PTY がいつ殺されるか」を見る。**
 *
 * `Channel` は `onmessage` を持つだけの器として置き換える——pty.ts は
 * new して invoke へ渡し、Rust から届いたイベントを onmessage で受ける。
 * テストからは invoke の引数経由でその器を掴み、exit を差し込む
 */
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  Channel: class {
    onmessage: ((message: unknown) => void) | null = null
  },
}))

const { killAllPtys, tauriPtyIo } = await import('./pty')

function spec(over: Partial<PtySpawnSpec> = {}): PtySpawnSpec {
  return {
    program: 'claude',
    args: [],
    cwd: '/proj',
    cols: 80,
    rows: 24,
    onData: () => undefined,
    onExit: () => undefined,
    ...over,
  }
}

/** `pty_spawn` の応答をテストから握るためのモック実装 */
function gatedSpawn(): { resolve: (id: number) => void } {
  const gate = { resolve: (_id: number) => undefined as void }
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd !== 'pty_spawn') return undefined
    return await new Promise<number>((r) => {
      gate.resolve = r
    })
  })
  return gate
}

/** その spawn に渡された Channel（テストから exit を差し込む口） */
function spawnedChannel(): { onmessage: ((message: unknown) => void) | null } {
  const call = invokeMock.mock.calls.find((c) => c[0] === 'pty_spawn')
  const args = call?.[1] as { channel: { onmessage: ((message: unknown) => void) | null } }
  return args.channel
}

beforeEach(() => {
  invokeMock.mockReset()
})

// **台帳はモジュールの中に残るので、テストごとに空にして次へ渡す**
afterEach(async () => {
  invokeMock.mockImplementation(async () => undefined)
  await killAllPtys()
  invokeMock.mockReset()
})

describe('killAllPtys', () => {
  it('起動を終えた PTY を殺す', async () => {
    invokeMock.mockImplementation(async (cmd: string) => (cmd === 'pty_spawn' ? 7 : undefined))
    await tauriPtyIo.spawn(spec())
    invokeMock.mockClear()

    await killAllPtys()

    expect(invokeMock).toHaveBeenCalledWith('pty_kill', { id: 7 })
  })

  it('**spawn の解決前に呼ばれても取りこぼさない**', async () => {
    // `live` への登録は pty_spawn の解決後なので、invoke が in-flight の
    // 間に全殺しが走ると素通りしていた（M11 の残件）
    const gate = gatedSpawn()
    const spawning = tauriPtyIo.spawn(spec())

    const killing = killAllPtys()
    gate.resolve(9)
    await spawning
    await killing

    expect(invokeMock).toHaveBeenCalledWith('pty_kill', { id: 9 })
  })

  it('起動中だった PTY の kill が終わるまで解決しない', async () => {
    // ここで待たないと、アプリ終了経路（interceptClose → killAllPtys →
    // close）で kill が間に合わず孤児が残る
    let killDone = false
    const gate = { resolve: (_id: number) => undefined as void }
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'pty_spawn') {
        return await new Promise<number>((r) => {
          gate.resolve = r
        })
      }
      if (cmd === 'pty_kill') {
        await new Promise((r) => setTimeout(r, 10))
        killDone = true
      }
      return undefined
    })
    const spawning = tauriPtyIo.spawn(spec())

    const killing = killAllPtys()
    gate.resolve(9)
    await spawning
    await killing

    expect(killDone).toBe(true)
  })

  it('全殺しのあとに起動した PTY は通常どおり台帳へ載る（判定が居座らない）', async () => {
    // 「1回全殺ししたらそれ以降どの端末も台帳に載らない」実装でも上の
    // 2本は通ってしまう。フォルダ切替のたびに全殺しは走るので、ここが
    // 居座ると次のフォルダの端末が終了時に回収されなくなる
    invokeMock.mockImplementation(async (cmd: string) => (cmd === 'pty_spawn' ? 11 : undefined))
    await killAllPtys()
    await tauriPtyIo.spawn(spec())
    invokeMock.mockClear()

    await killAllPtys()

    expect(invokeMock).toHaveBeenCalledWith('pty_kill', { id: 11 })
  })

  it('（既存の挙動）exit が invoke の解決より先に届いたら台帳へ載せず、その場で片付ける', async () => {
    const gate = gatedSpawn()
    const onExit = vi.fn()
    const spawning = tauriPtyIo.spawn(spec({ onExit }))

    spawnedChannel().onmessage?.({ event: 'exit', data: { code: 0 } })
    expect(onExit).toHaveBeenCalledWith(0)

    gate.resolve(13)
    await spawning
    expect(invokeMock).toHaveBeenCalledWith('pty_kill', { id: 13 })

    // 台帳に載っていないので、次の全殺しでは何も飛ばない
    invokeMock.mockClear()
    invokeMock.mockImplementation(async () => undefined)
    await killAllPtys()
    expect(invokeMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/fs/pty.test.ts`
Expected: 「**spawn の解決前に呼ばれても取りこぼさない**」「起動中だった PTY の kill が終わるまで解決しない」の2本が FAIL。残る3本（`起動を終えた PTY を殺す` / `全殺しのあとに……` / `（既存の挙動）……`）は PASS する。

- [ ] **Step 3: 台帳に世代と in-flight を持たせる**

`src/fs/pty.ts` の `const live = new Set<number>()` の直後に足す。

```ts
/**
 * 起動中（`pty_spawn` の invoke が in-flight）の spawn。**`killAllPtys` が
 * 取りこぼさないために要る**——`live` への登録は解決後なので、この間に
 * 全殺しが走ると素通りしてしまう
 */
const inflight = new Set<Promise<number>>()

/**
 * 全殺しの世代。`killAllPtys` のたびに1つ進む。in-flight だった spawn は
 * 解決時に自分が始まった世代と比べ、違っていれば `live` へ入れない
 *（`live` は既に空にされているので、入れると次の全殺しまで生き残る）。
 *
 * **真偽値のフラグにしないこと。** 全殺しはアプリ終了だけでなくフォルダ
 * 切替でも走るので、立てっぱなしにすると次のフォルダの端末が台帳に
 * 載らなくなる
 */
let generation = 0
```

`spawn` の中の `id = await invoke<number>('pty_spawn', {…})` から `else live.add(id)` までを差し替える。**先頭の `const channel = new Channel<PtyEvent>()` の直前に世代を控えること。**

```ts
  async spawn(spec: PtySpawnSpec): Promise<number> {
    const startedAt = generation
    const channel = new Channel<PtyEvent>()
```

（`let id` から `channel.onmessage = …` までは変更しない）

```ts
    const request = invoke<number>('pty_spawn', {
      program: spec.program,
      args: spec.args,
      cwd: spec.cwd,
      cols: spec.cols,
      rows: spec.rows,
      channel,
    })
    inflight.add(request)
    try {
      id = await request
    } finally {
      inflight.delete(request)
    }
    // exit が先着していたら、その場で Rust 側の台帳を片付ける
    if (exited) void invoke('pty_kill', { id }).catch(() => undefined)
    // 待っている間に全殺しが走っていたら `live` へ入れない。**kill は
    // ここから飛ばさない**——`killAllPtys` がこの spawn の解決を待って
    // 殺すので、二重に飛ばす必要がない
    else if (generation === startedAt) live.add(id)
    return id
  },
```

`killAllPtys` を差し替える。

```ts
/** 生きている PTY を全部殺す（アプリを閉じる経路とフォルダ切替から呼ぶ） */
export async function killAllPtys(): Promise<void> {
  generation += 1
  const ids = [...live]
  live.clear()
  // **起動中の spawn も待って殺す。** ここで待たないと、解決した PTY を
  // 殺す invoke がアプリの終了に間に合わず孤児になる
  const starting = [...inflight].map((request) =>
    request.then((id) => invoke('pty_kill', { id })).catch(() => undefined),
  )
  await Promise.all([
    ...ids.map((id) => invoke('pty_kill', { id }).catch(() => undefined)),
    ...starting,
  ])
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/fs/pty.test.ts`
Expected: このファイルの `it` がすべて緑。

- [ ] **Step 5: 全体の検証**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。**`src/App.dom.test.tsx` は `@/fs/pty` を丸ごとモックしている**ので、この変更の影響を受けないはずである。

- [ ] **Step 6: コミット**

```bash
git add src/fs/pty.ts src/fs/pty.test.ts
git commit -m "fix(terminal): 起動中の PTY を killAllPtys が取りこぼさないよう、世代と待ち合わせを入れる"
```

---

### Task 4: フォルダ切替で終了済みのタブも消す

**Files:**
- Modify: `src/App.tsx`（`switchFolder` の JSDoc と `openFolder`）
- Test: `src/App.dom.test.tsx`（`describe('フォルダ切替', …)` に追加）

**Interfaces:**
- Consumes: `hasRunning(state: TerminalState): boolean`・`closeAll(state: TerminalState): TerminalState`（`src/core/terminal/sessions.ts`）、`killAllPtys()`（`src/fs/pty.ts`）
- Produces: なし

**背景と方針:** 「設計判断 決定3」を読むこと。

- [ ] **Step 1: 失敗するテストを書く**

`src/App.dom.test.tsx` の `describe('フォルダ切替', () => {…})` の中に足す。

```tsx
  it('**終了済みのタブしか無くてもフォルダ切替で消える**（確認は出ない）', async () => {
    // `hasRunning` は starting / running しか見ないので、exited のタブだけが
    // 残っていると openFolder が確認も後始末もせず素通りしていた——旧フォルダ
    // の残骸がタブバーに残る（M11 の残件）
    await openPane()
    await screen.findByRole('button', { name: 'Claude 1' })

    // 子が自然終了した状態にする（starting / running ではなくなる）
    act(() => {
      ptyExitHandlers.get(1)?.(0)
    })
    await screen.findByText('終了しました（コード 0）')

    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))

    // 旧フォルダの残骸が消える
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Claude 1' })).toBeNull())
    // 実行中のタブが無いので、確認ダイアログは出ていない
    expect(screen.queryByRole('button', { name: '終了して切り替える' })).toBeNull()
  })
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/App.dom.test.tsx -t '終了済みのタブしか無くても'`
Expected: FAIL。`Claude 1` のタブが残り続けて `waitFor` がタイムアウトする。

- [ ] **Step 3: 後始末を `switchFolder` の1本に寄せる**

`src/App.tsx` の `openFolder` を差し替える。

```tsx
  const openFolder = async () => {
    const dir = await pickProjectFolder()
    if (dir === null) return
    // **実行中のタブが無くても switchFolder を通す。** `hasRunning` は
    // starting / running しか見ないので、ここで素通りさせると exited /
    // failed のタブが旧フォルダの残骸として画面に残る。`hasRunning` は
    // **確認ダイアログの要否だけ**に使い、後始末は1本の経路に寄せる
    if (!hasRunning(terminals)) {
      await switchFolder(dir)
      return
    }
    setModals((prev) =>
```

（`pushModal` 以降は変更しない）

`switchFolder` の JSDoc の末尾に1段落足す。

```tsx
   * **フォルダ切替の唯一の経路。** 実行中のタブが1本も無い場合もここを通る
   *（確認ダイアログを挟むかどうかだけが `openFolder` 側の判断）。終了済み
   * （exited / failed）のタブは殺す PTY を持たないが、旧フォルダの残骸なので
   * 画面からも消す。**帰結として、端末を使っていなくてもフォルダを切り替えると
   * ペインは畳まれる**——旧フォルダのために開いていたペインを新フォルダで
   * そのまま開いたままにする理由が無い
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/App.dom.test.tsx`
Expected: このファイルの `it` がすべて緑。

- [ ] **Step 5: 全体の検証**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。

- [ ] **Step 6: コミット**

```bash
git add src/App.tsx src/App.dom.test.tsx
git commit -m "fix(terminal): フォルダ切替の後始末を switchFolder に寄せ、終了済みのタブも消す"
```

---

### Task 5: 端末の中を facet の配色に合わせる

**Files:**
- Create: `src/core/terminal/theme.ts`
- Create: `src/core/terminal/theme.test.ts`
- Modify: `src/styles/contrast.ts`（JSDoc の契約2箇所だけ）
- Modify: `src/components/TerminalTab.tsx`（`dark` prop・配色の適用・冒頭の JSDoc）
- Modify: `src/components/TerminalPane.tsx`（`dark` prop の中継・冒頭の JSDoc）
- Modify: `src/components/TerminalPane.dom.test.tsx`（`dark` prop を足すだけ）
- Modify: `src/App.tsx`（`TerminalPane` へ `dark` を渡す）
- Test: `src/components/TerminalTab.dom.test.tsx`

**Interfaces:**
- Consumes: `parseOklch(value: string): Oklch | null`・`oklchToLinear(color: Oklch): LinearRgb`・`toHex(rgb: LinearRgb): string`（すべて `src/styles/contrast.ts` の既存の export）
- Produces:
  - `export interface TerminalTheme { background: string; foreground: string; cursor: string; cursorAccent: string; selectionBackground: string }`
  - `export function buildTerminalTheme(readToken: (name: string) => string): TerminalTheme | null`
  - `export const TERMINAL_MIN_CONTRAST: number`
  - `TerminalTabProps` / `TerminalPaneProps` に `dark: boolean` が増える

**背景:** 「設計判断 決定1・決定2」を読むこと。

- [ ] **Step 1: 純関数の失敗するテストを書く**

`src/core/terminal/theme.test.ts` を新規作成する。

```ts
import { describe, expect, it } from 'vitest'
import { buildTerminalTheme, TERMINAL_MIN_CONTRAST } from './theme'
import { contrastRatio, parseAnyCssColor, relativeLuminance } from '@/styles/contrast'

/**
 * 役割トークンの値。**`src/styles/palette.css` から逐語で写したもの**で、
 * ここでの役目は「入力の形が本物と同じであること」だけ。パレットを
 * 差し替えたらここも古くなるが、**このテストが検証するのは変換と
 * 組み立てであってパレットの値ではない**（パレットの値は
 * `src/styles/palette.test.ts` の仕事）
 */
const LIGHT: Record<string, string> = {
  '--surface': 'oklch(0.961 0.007 88.6)',
  '--ink': 'oklch(0.205 0 89.9)',
  '--surface-accent': 'oklch(0.87 0.04 126)',
}
const DARK: Record<string, string> = {
  '--surface': 'oklch(0.205 0 89.9)',
  '--ink': 'oklch(0.85 0.007 88.6)',
  '--surface-accent': 'oklch(0.28 0.04 126)',
}

const reader =
  (tokens: Record<string, string>) =>
  (name: string): string =>
    tokens[name] ?? ''

const rgb = (hex: string) => {
  const parsed = parseAnyCssColor(hex)
  if (parsed === null) throw new Error(`読めない色: ${hex}`)
  return parsed.rgb
}

describe('buildTerminalTheme', () => {
  it('役割トークンを sRGB の16進へ変換して返す', () => {
    // xterm は oklch を解釈しないので、#rrggbb にして渡す必要がある
    const theme = buildTerminalTheme(reader(LIGHT))
    expect(theme).not.toBeNull()
    for (const value of Object.values(theme ?? {})) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('ライトでは明るい面に暗い文字、ダークではその逆になる', () => {
    // 「トークンを読まずに固定値を返す実装」と区別するため、2つのトークン
    // 集合で結果が入れ替わることを見る
    const light = buildTerminalTheme(reader(LIGHT))
    const dark = buildTerminalTheme(reader(DARK))
    expect(light).not.toBeNull()
    expect(dark).not.toBeNull()
    if (light === null || dark === null) return

    expect(relativeLuminance(rgb(light.background))).toBeGreaterThan(
      relativeLuminance(rgb(light.foreground)),
    )
    expect(relativeLuminance(rgb(dark.background))).toBeLessThan(
      relativeLuminance(rgb(dark.foreground)),
    )
  })

  it('文字と面のコントラストが本文の要件を満たす', () => {
    for (const tokens of [LIGHT, DARK]) {
      const theme = buildTerminalTheme(reader(tokens))
      expect(theme).not.toBeNull()
      if (theme === null) continue
      expect(
        contrastRatio(rgb(theme.foreground), rgb(theme.background)),
      ).toBeGreaterThanOrEqual(TERMINAL_MIN_CONTRAST)
    }
  })

  it('カーソルは文字と同じ色、その上に乗る文字は面と同じ色', () => {
    // ブロックカーソルの下の1文字が読めるために要る対応
    const theme = buildTerminalTheme(reader(LIGHT))
    expect(theme?.cursor).toBe(theme?.foreground)
    expect(theme?.cursorAccent).toBe(theme?.background)
  })

  it('トークンが1つでも読めなければ null を返す', () => {
    // 半端に流し込むと、面だけ変わって文字が読めない端末になる。
    // 「無い」と「読めない形」の両方を見る（jsdom では前者、パレットに
    // 別記法が紛れ込んだときは後者になる）
    const missing = { ...LIGHT }
    delete missing['--ink']
    expect(buildTerminalTheme(reader(missing))).toBeNull()
    expect(buildTerminalTheme(reader({ ...LIGHT, '--surface': 'rebeccapurple' }))).toBeNull()
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/core/terminal/theme.test.ts`
Expected: FAIL（`./theme` が存在しないので import の解決に失敗する）。

- [ ] **Step 3: 純関数を書く**

`src/core/terminal/theme.ts` を新規作成する。

```ts
import { oklchToLinear, parseOklch, toHex } from '@/styles/contrast'

/**
 * 端末（xterm）の配色を facet の役割トークンから作る（コア・純関数）。
 *
 * **ソースに色値を書かない**（rev 9章。`src/styles/conventions.test.ts` が
 * 直書きを弾く）ため、`palette.css` の役割トークンを実行時に読んで
 * sRGB の16進へ変換する。**xterm は `oklch()` を解釈しない**ので、
 * 変換は `src/styles/contrast.ts` の既存の式を使う（同じ式を2本持たない）。
 *
 * **ANSI の16色は xterm の既定のままにする。** 16色は facet の役割
 * トークン（11個）に対応物が無く、持つと「配色を差し替える」作業が
 * 「16色を選び直す」作業になる。代わりに `TERMINAL_MIN_CONTRAST` を
 * xterm の `minimumContrastRatio` へ渡し、ライトの面でも既定の16色が
 * 読める濃さへ xterm 自身に寄せさせる
 */

/** xterm の `ITheme` のうち facet が決める分だけ。値はすべて `#rrggbb` */
export interface TerminalTheme {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
}

/**
 * 端末の文字が面に対して満たすべきコントラスト比。**本文の 4.5:1 に揃える**
 *（rev 9章）。xterm はこの値を下回る前景色を自動で寄せる
 */
export const TERMINAL_MIN_CONTRAST = 4.5

/**
 * 役割トークンの値（`oklch(L C H)` の文字列）を返す関数を渡すと、xterm へ
 * 渡せる配色を返す。
 *
 * **1つでも読めなければ null。** 半端に流し込むと、面だけ変わって文字が
 * 読めない端末になる。null のときは呼び出し側が xterm の既定に任せる
 */
export function buildTerminalTheme(readToken: (name: string) => string): TerminalTheme | null {
  const hex = (token: string): string | null => {
    const parsed = parseOklch(readToken(token))
    return parsed === null ? null : toHex(oklchToLinear(parsed))
  }
  const background = hex('--surface')
  const foreground = hex('--ink')
  // 選択の面は見出しの面を流用する。**ink / ink-muted が載ることを
  // palette.test.ts が既に検証している唯一の淡い面**だから
  const selectionBackground = hex('--surface-accent')
  if (background === null || foreground === null || selectionBackground === null) return null
  return {
    background,
    foreground,
    // カーソルは文字と同じ色。その上に乗る文字（ブロックカーソルの下の
    // 1文字）は面と同じ色にして、反転しても読めるようにする
    cursor: foreground,
    cursorAccent: background,
    selectionBackground,
  }
}
```

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run src/core/terminal/theme.test.ts`
Expected: このファイルの `it` がすべて緑。

- [ ] **Step 5: `contrast.ts` の契約を書き替える**

`src/styles/contrast.ts` の冒頭の JSDoc の1行目を差し替える。

現在:
```
 * 色の検証に使う計算。**アプリの実行時には使わない**（テストからのみ呼ぶ）。
```

差し替え後:
```
 * 色の計算。**主な用途は色の検証（テスト）だが、実行時にも1箇所から呼ぶ**
 * ——端末（xterm）は `oklch()` を解釈しないので、役割トークンを sRGB の
 * 16進へ変換する必要がある（M17。`src/core/terminal/theme.ts`）。
```

`toHex` の JSDoc も差し替える。

現在:
```
/** テストの出力に人が読める色を出すため。判定には使わない */
```

差し替え後:
```
/**
 * 線形 sRGB を `#rrggbb` へ。**判定には使わない**（丸めが入る）。
 * テストの出力に人が読める色を出すためと、oklch を解釈しない相手
 *（xterm）へ色を渡すために使う
 */
```

- [ ] **Step 6: xterm への配線の失敗するテストを書く**

`src/components/TerminalTab.dom.test.tsx` に3箇所の変更を入れる。

**(a) 偽の `term` に `options` を持たせる**（ファイル冒頭の `const term = {…}`）。`cols: 80,` の直前に足す。

```tsx
  // xterm の `options` は書き換え可能で（typings/xterm.d.ts の
  // `options: ITerminalOptions`）、配色の差し替えはここへ代入する
  options: {} as Record<string, unknown>,
```

**(b) モックした `Terminal` を掴めるようにする**（`const { TerminalTab } = await import('./TerminalTab')` の直前）。

```tsx
const { Terminal: TerminalMock } = await import('@xterm/xterm')
```

**(c) `beforeEach` で `options` を空へ戻す**（`term.rows = 24` の直後）。

```tsx
  term.options = {}
```

そのうえで、新しい `describe` をファイル末尾（既存の `describe('TerminalTab', …)` の閉じ括弧の後ろ）に足す。

```tsx
describe('端末の配色', () => {
  /**
   * jsdom は `palette.css` を読まないので `getPropertyValue` は空文字を返す。
   * ルート要素への問い合わせだけを差し替え、**他の要素は実物へ委ねる**
   *（testing-library の内部も getComputedStyle を使うため、丸ごと
   * 差し替えるとクエリが壊れる）
   */
  const tokens: Record<string, string> = {}
  let spy: { mockRestore: () => void } | null = null

  const LIGHT: Record<string, string> = {
    '--surface': 'oklch(0.961 0.007 88.6)',
    '--ink': 'oklch(0.205 0 89.9)',
    '--surface-accent': 'oklch(0.87 0.04 126)',
  }
  const DARK: Record<string, string> = {
    '--surface': 'oklch(0.205 0 89.9)',
    '--ink': 'oklch(0.85 0.007 88.6)',
    '--surface-accent': 'oklch(0.28 0.04 126)',
  }

  const setTokens = (next: Record<string, string>): void => {
    for (const key of Object.keys(tokens)) delete tokens[key]
    Object.assign(tokens, next)
  }

  beforeEach(() => {
    const real = window.getComputedStyle.bind(window)
    spy = vi.spyOn(window, 'getComputedStyle').mockImplementation(((
      element: Element,
      pseudo?: string | null,
    ) =>
      element === document.documentElement
        ? ({
            getPropertyValue: (name: string) => tokens[name] ?? '',
          } as unknown as CSSStyleDeclaration)
        : real(element, pseudo)) as typeof window.getComputedStyle)
  })
  afterEach(() => {
    spy?.mockRestore()
    spy = null
  })

  it('マウント時に役割トークンから配色を作って xterm へ渡す', async () => {
    setTokens(LIGHT)
    const pty = fakePty()
    const onRunning = vi.fn()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        dark={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))

    const options = (TerminalMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      minimumContrastRatio?: number
      theme?: { background?: string }
    }
    // 16色は xterm の既定のまま。ライトの面でも読める濃さへ寄せさせる
    expect(options.minimumContrastRatio).toBe(4.5)
    expect(options.theme?.background).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('ライトからダークへ切り替えると配色を渡し直す', async () => {
    setTokens(LIGHT)
    const pty = fakePty()
    const props = {
      session: session(),
      cwd: '/proj',
      ptyIo: pty.io,
      hidden: false,
      onRunning: vi.fn(),
      onExited: vi.fn(),
      onFailed: vi.fn(),
    }
    const { rerender } = render(<TerminalTab {...props} dark={false} />)
    await waitFor(() => expect(term.options.theme).toBeDefined())
    const light = (term.options.theme as { background: string }).background

    setTokens(DARK)
    rerender(<TerminalTab {...props} dark />)

    await waitFor(() =>
      expect((term.options.theme as { background: string }).background).not.toBe(light),
    )
  })

  it('トークンが読めなければ配色を渡さない（xterm の既定に任せる）', async () => {
    setTokens({})
    const pty = fakePty()
    const onRunning = vi.fn()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        dark={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))

    const options = (TerminalMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      theme?: unknown
    }
    expect(options.theme).toBeUndefined()
  })
})
```

**既存の `<TerminalTab …>` の呼び出しすべてに `dark={false}` を足すこと**（`src/components/TerminalTab.dom.test.tsx` の中。`tsc` が漏れを教えてくれる）。

- [ ] **Step 7: 落ちることを確かめる**

Run: `npx vitest run src/components/TerminalTab.dom.test.tsx`
Expected: 新しい `describe('端末の配色', …)` の3本のうち少なくとも2本が FAIL（`minimumContrastRatio` が undefined、`term.options.theme` が設定されない）。`dark` prop がまだ無いので `npx tsc -b` も落ちる。

- [ ] **Step 8: `TerminalTab` に配線する**

`src/components/TerminalTab.tsx` の冒頭の JSDoc を差し替える。

現在:
```tsx
/**
 * 端末タブ1本。xterm 1個と PTY 1本が対応する。
 *
 * **端末の中は xterm の既定配色にする。** 端末は端末として読む面であり、
 * rev 9章の「地は方眼、作業する面は無地」の対象外。facet の役割トークンを
 * 流し込まないことで、ソースに色値が現れずに済む（conventions.test.ts）
 */
```

差し替え後:
```tsx
/**
 * 端末タブ1本。xterm 1個と PTY 1本が対応する。
 *
 * **面・文字・カーソル・選択は facet の役割トークンから流し込む**（M17）。
 * 色値はソースに現れない——`palette.css` のトークンを実行時に読んで
 * 変換する（`src/core/terminal/theme.ts`。conventions.test.ts）。
 * **ANSI の16色は xterm の既定のまま**で、ライトの面での読みやすさは
 * `minimumContrastRatio` に任せる（理由は theme.ts）
 */
```

import を足す。

```tsx
import { buildTerminalTheme, TERMINAL_MIN_CONTRAST } from '@/core/terminal/theme'
```

ファイル内の `SHIFT_ENTER_SEQUENCE` の宣言の下に、トークンの読み取り口を置く。

```tsx
/**
 * 役割トークンを実行時に読む。**jsdom では空文字が返る**ので、テスト環境
 * では配色を渡さず xterm の既定に落ちる
 */
const readToken = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name)
```

`TerminalTabProps` に足す（`hidden` の下）。

```tsx
  /**
   * ダーク表示か。**色そのものは渡さない**——色は `palette.css` が持ち、
   * この値は「トークンを読み直す合図」としてだけ使う
   */
  dark: boolean
```

分割代入に `dark` を足す。

```tsx
  const { session, cwd, ptyIo, hidden, dark, onRunning, onExited, onFailed } = props
```

`new Terminal({…})` を差し替える。

```tsx
    const initialTheme = buildTerminalTheme(readToken)
    const term = new Terminal({
      convertEol: false,
      fontSize: 13,
      // 16色は xterm の既定のまま。ライトの面でも読める濃さへ xterm 自身に
      // 寄せさせる（core/terminal/theme.ts）
      minimumContrastRatio: TERMINAL_MIN_CONTRAST,
      // 読めなければ渡さない。**空の theme を渡さないこと**——xterm の既定を
      // 上書きして真っ黒でも真っ白でもない中途半端な面になる
      ...(initialTheme === null ? {} : { theme: initialTheme }),
    })
```

「隠れている間は測らない」effect の**直前**に、配色を追従させる effect を置く。

```tsx
  /**
   * ライト／ダークの切り替えに追従する。**色の入れ替えは CSS 側で起きる**
   * ので、ここは「読み直して xterm へ渡し直す」だけ。`dark` はその合図で、
   * 値そのものは使わない（起動 effect より後に走るので、マウント時は
   * 同じ配色をもう一度渡すことになるが実害は無い）
   */
  useEffect(() => {
    const term = termRef.current
    if (term === null) return
    const theme = buildTerminalTheme(readToken)
    if (theme !== null) term.options.theme = theme
    // `dark` は合図として依存に入れる。値は読まない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark])
```

- [ ] **Step 9: `TerminalPane` と `App` に通す**

`src/components/TerminalPane.tsx` の冒頭 JSDoc を差し替える。

現在:
```tsx
 * **ペインの枠は facet の役割トークン、端末の中は xterm の既定配色**
 *（理由は TerminalTab.tsx）
```

差し替え後:
```tsx
 * **枠も端末の中も facet の役割トークンに合わせる**（M17。ANSI の16色
 * だけは xterm の既定のまま。理由は `src/core/terminal/theme.ts`）
```

`TerminalPaneProps` に足す（`paneVisible` の下）。

```tsx
  /** ダーク表示か。`TerminalTab` へ中継するだけ（配色の読み直しの合図） */
  dark: boolean
```

分割代入と受け渡しを直す。

```tsx
  const { state, cwd, ptyIo, paneVisible, dark, onOpen, onClose, onActivate } = props
```

`<TerminalTab …>` に `dark={dark}` を足す（`hidden={…}` の直後）。

`src/App.tsx` の `<TerminalPane …>` に `dark={dark}` を足す（`paneVisible={paneOpen}` の直後）。

`src/components/TerminalPane.dom.test.tsx` の `<TerminalPane …>` の呼び出しすべてに `dark={false}` を足す。**`npx tsc -b` が漏れを教えてくれる**ので、まず回して落ちた箇所を潰すこと。

```bash
grep -n "TerminalPane\|TerminalTab" src/components/TerminalPane.dom.test.tsx
```

- [ ] **Step 10: 通ることを確かめる**

Run: `npx vitest run src/components/TerminalTab.dom.test.tsx src/components/TerminalPane.dom.test.tsx src/core/terminal/theme.test.ts src/styles/conventions.test.ts`
Expected: 3ファイルの `it` がすべて緑。**`conventions.test.ts` を明示的に回すのは、新しく増えたファイルが走査対象に入るため**（走査の母集合は `src/` 配下のディレクトリ全体なので、`src/core/terminal/theme.ts` は自動的に対象になる）。

- [ ] **Step 11: 生成 CSS には影響しないことを確かめる**

Run: `npx vite build`
Expected: 成功する。**このタスクは CSS を1行も足していない**（配色は実行時に JS が読む）ので、生成 CSS の内容は変わらないはずである。差分が出たら報告すること。

- [ ] **Step 12: 全体の検証**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。

- [ ] **Step 13: コミット**

```bash
git add src/core/terminal/theme.ts src/core/terminal/theme.test.ts src/styles/contrast.ts \
        src/components/TerminalTab.tsx src/components/TerminalTab.dom.test.tsx \
        src/components/TerminalPane.tsx src/components/TerminalPane.dom.test.tsx src/App.tsx
git commit -m "feat(terminal): 端末の面・文字・カーソル・選択を役割トークンから流し込む"
```

---

### Task 6: `pty_write` が `sessions` の錠前を握ったまま書き込まない

**Files:**
- Modify: `src-tauri/src/pty.rs`（`PtySession` の書き手・`pty_write` / `pty_kill`・`#[cfg(test)] mod tests` の新設）

**Interfaces:**
- Consumes: `portable_pty::{MasterPty, ChildKiller, native_pty_system}`（既に import 済み）
- Produces: `PtyState` に非公開の inherent メソッドが3つ増える（`writer` / `write` / `kill`）。**Tauri コマンドの名前・引数・戻り値は変えない**（`pty_spawn` / `pty_write` / `pty_resize` / `pty_kill`）

**背景:** 「設計判断 決定4」を読むこと。**このタスクはこのプロジェクト初の Rust テストを入れる。** `cargo test` は `npm test` に含まれないので、明示的に回す。

- [ ] **Step 1: 失敗するテストを書く（先に「古いロックのまま」で通す口を作る）**

まず `src-tauri/src/pty.rs` の末尾に、**古い錠前の取り方のまま**の inherent メソッドを足す。TDD の赤を「コンパイルエラー」ではなく「テストのタイムアウト」で見るためである。

```rust
impl PtyState {
    /// **いまはまだ `sessions` を握ったまま書く**（Step 3 で直す）
    fn write(&self, id: u32, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions.get_mut(&id).ok_or("その端末はもうありません")?;
        session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())
    }

    fn kill(&self, id: u32) -> Result<(), String> {
        // **`remove` の結果を先に束縛する。** そうすることで `sessions` の
        // 錠前はこの文の終わりで外れ、`killer.kill()` は錠前の外で走る
        let removed = self.sessions.lock().map_err(|e| e.to_string())?.remove(&id);
        if let Some(mut session) = removed {
            let _ = session.killer.kill();
        }
        Ok(())
    }
}
```

そのうえで、同じファイルの末尾にテストモジュールを足す。

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc;
    use std::time::Duration;

    /// 相手が読むまで返らない書き手。`write` に入ったことを `entered` で
    /// 知らせ、`gate` に何か届くまで戻らない——「詰まった端末」の再現
    struct BlockingWriter {
        entered: mpsc::Sender<()>,
        gate: mpsc::Receiver<()>,
    }
    impl Write for BlockingWriter {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            let _ = self.entered.send(());
            let _ = self.gate.recv();
            Ok(buf.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    /// 殺されたことだけを記録する killer。子プロセスは起動しない
    #[derive(Debug)]
    struct FakeKiller(std::sync::Arc<AtomicBool>);
    impl ChildKiller for FakeKiller {
        fn kill(&mut self) -> std::io::Result<()> {
            self.0.store(true, Ordering::SeqCst);
            Ok(())
        }
        fn clone_killer(&self) -> Box<dyn ChildKiller + Send + Sync> {
            Box::new(FakeKiller(std::sync::Arc::clone(&self.0)))
        }
    }

    /// 詰まった端末を殺せること。**`pty_write` が `sessions` を握ったまま
    /// ブロッキング書き込みをしていると、`pty_kill` が錠前待ちで返らない**
    #[test]
    fn kill_is_not_blocked_by_a_stuck_write() {
        // master は実物を1つ作る（子プロセスは起動しない）。openpty は
        // mac / Windows のどちらでも通る
        let pair = native_pty_system()
            .openpty(size(80, 24))
            .expect("openpty に失敗した");
        drop(pair.slave);

        let (entered_tx, entered_rx) = mpsc::channel();
        let (gate_tx, gate_rx) = mpsc::channel();
        let killed = std::sync::Arc::new(AtomicBool::new(false));

        let state = PtyState::default();
        state.sessions.lock().unwrap().insert(
            1,
            PtySession {
                master: pair.master,
                writer: make_writer(Box::new(BlockingWriter {
                    entered: entered_tx,
                    gate: gate_rx,
                })),
                killer: Box::new(FakeKiller(std::sync::Arc::clone(&killed))),
            },
        );

        std::thread::scope(|scope| {
            scope.spawn(|| {
                let _ = state.write(1, "a");
            });
            // 書き込みが始まって、まだ返っていない状態を作る
            entered_rx
                .recv_timeout(Duration::from_secs(5))
                .expect("書き込みが始まらなかった");

            let (done_tx, done_rx) = mpsc::channel();
            scope.spawn(|| {
                let _ = state.kill(1);
                let _ = done_tx.send(());
            });
            done_rx.recv_timeout(Duration::from_secs(2)).expect(
                "書き込みが詰まっている間に kill が返らなかった（sessions の錠前を握ったままになっている）",
            );
            assert!(killed.load(Ordering::SeqCst), "killer.kill() が呼ばれていない");

            // 書き込みを解放してスレッドを畳む
            let _ = gate_tx.send(());
        });
    }
}
```

`make_writer` はまだ無いので、**この Step ではテストモジュールの `make_writer(Box::new(…))` を素の `Box::new(…)` に置き換えて**（つまり `writer: Box::new(BlockingWriter { … })`）コンパイルを通すこと。Step 3 で `make_writer` を導入したときに戻す。

- [ ] **Step 2: 落ちることを確かめる**

Run: `cd src-tauri && cargo test`
Expected: `kill_is_not_blocked_by_a_stuck_write` が **2秒後に FAIL**し、`書き込みが詰まっている間に kill が返らなかった（sessions の錠前を握ったままになっている）` が出る。

**初回のコンパイルは数分かかる**（tauri をテストプロファイルで一式ビルドするため）。

**`openpty に失敗した` で落ちた場合は、テストを消さずに「計画の前提の誤り」として報告すること**——このプロジェクトで PTY が開けないなら、それ自体が本体の前提の問題である。

- [ ] **Step 3: 書き手を別の錠前へ隔離する**

`src-tauri/src/pty.rs` の import を差し替える。

```rust
use std::sync::{Arc, Mutex};
```

`PtySession` の上に型別名と組み立ての口を置き、`PtySession` の `writer` の型を差し替える。

```rust
/**
 * 書き手。**`sessions` とは別の錠前に入れる**——書き込みは相手（端末の中の
 * プログラム）が読むまで返らないことがあり、その間 `sessions` を握っていると
 * `pty_kill` が錠前待ちになって「詰まった端末を殺せない」になる。
 *
 * **これで消えるのは「同じ錠前を取り合う」という設計上の欠陥であって、
 * 「必ず殺せる」という保証ではない**——Tauri の同期コマンドは main thread で
 * 走るので（`tauri-macros` の `command/wrapper.rs` の `ExecutionContext::Blocking`）、
 * 書き込みが本当に返らなければ後続の IPC ごと止まる。根治は「セッションごとの
 * 書き込みスレッド＋エラーを Channel で返す」で、`docs/open-issues.md` に残す
 */
type SharedWriter = Arc<Mutex<Box<dyn Write + Send>>>;

fn make_writer(writer: Box<dyn Write + Send>) -> SharedWriter {
    Arc::new(Mutex::new(writer))
}

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: SharedWriter,
    killer: Box<dyn ChildKiller + Send + Sync>,
}
```

`pty_spawn` の中の `insert` を差し替える。

```rust
        .insert(id, PtySession { master: pair.master, writer: make_writer(writer), killer });
```

Step 1 で置いた `PtyState::write` を差し替える。

```rust
    /// `id` の書き手だけを取り出す。**`sessions` の錠前はこの関数を抜けた
    /// 時点で外れる**
    fn writer(&self, id: u32) -> Result<SharedWriter, String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions.get(&id).ok_or("その端末はもうありません")?;
        Ok(Arc::clone(&session.writer))
    }

    fn write(&self, id: u32, data: &str) -> Result<(), String> {
        let writer = self.writer(id)?;
        let mut writer = writer.lock().map_err(|e| e.to_string())?;
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())
    }
```

コマンド2本を委譲だけにする。

```rust
#[tauri::command]
pub fn pty_write(state: tauri::State<'_, PtyState>, id: u32, data: String) -> Result<(), String> {
    state.write(id, &data)
}
```

```rust
#[tauri::command]
pub fn pty_kill(state: tauri::State<'_, PtyState>, id: u32) -> Result<(), String> {
    state.kill(id)
}
```

テストモジュールの `writer:` を `make_writer(Box::new(BlockingWriter { … }))` に戻す。

- [ ] **Step 4: 通ることを確かめる**

Run: `cd src-tauri && cargo test`
Expected: `kill_is_not_blocked_by_a_stuck_write` が PASS。

- [ ] **Step 5: アプリが従来どおりビルドできることを確かめる**

Run: `cd src-tauri && cargo build`
Expected: 成功する（警告は許容。エラーは出ないこと）。

- [ ] **Step 6: 全体の検証**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑（この変更は TypeScript 側に影響しないが、対象は絞らない）。

- [ ] **Step 7: コミット**

```bash
git add src-tauri/src/pty.rs
git commit -m "fix(pty): 書き手を別の錠前へ隔離し、詰まった書き込みが pty_kill を待たせないようにする"
```

---

### Task 7: 実機確認（mac。人間の作業）

**Files:** なし（アプリを動かす）

**Interfaces:** なし

**サブエージェントは GUI を操作できない。このタスクは人間が行う。** 結果は Task 8 の申し送りに転記する。

- [ ] **Step 1: 起動する**

```bash
npm install
npm run tauri dev
```

- [ ] **Step 2: チェックリストを埋める**

| # | 確認すること | 結果 |
| --- | --- | --- |
| 1 | **ライト表示**でフォルダを開き、端末ペインを開く。端末の中の面が明るく、文字が読める |  |
| 2 | 端末で Claude Code を1往復させ、**色の付いた出力**（見出し・差分の赤緑・薄いグレーの補足）がライトの面で読める |  |
| 3 | ヘッダの月／太陽ボタンで**ダークへ切り替える**。端末を開いたまま、中の面と文字が追従する（再起動不要） |  |
| 4 | ダークへ切り替えた状態で、Claude Code の色付き出力が読める |  |
| 5 | 端末の文字を**選択**する。選択の面の上で文字が読める |  |
| 6 | 「Claude Code を開く」を押して**1秒以内に文字を打つ**。打った文字が消えずに Claude Code の入力欄へ現れる |  |
| 7 | 同じく**1秒以内に `Shift+Enter`** を打つ。改行が入る（送信されない） |  |
| 8 | タブを実行中のまま `×` で閉じる。確認が出て、承認後に `ps -ax \| grep "[c]laude"` が空になる |  |
| 9 | 端末で `/exit` して **exited のタブ**にしてから「フォルダを開く」。確認は出ず、旧フォルダのタブが消え、ペインが畳まれる |  |
| 10 | タブを開いた**直後（1秒以内）に「フォルダを開く」**で別フォルダへ切り替える。承認後に `ps -ax \| grep "[c]laude"` が空になる |  |
| 11 | 端末で大量出力を出しながら（例: `yes` を実行）、**別のタブ**の `×` を押す。閉じられる |  |
| 12 | ウィンドウを `×` で閉じる。`ps -ax \| grep "[c]laude"` が空になる |  |

**#8 / #10 / #12 の `ps` は、閉じてから2〜3秒おいて実行すること**（kill の invoke が着地する時間）。

- [ ] **Step 3: 観察を書き留める**

見つかった欠陥は「**症状（何が起きるか）**」と「**言葉（何が嫌か）**」を分けて書く。対策は Task 8 ではなく、必要なら追加タスクとして起こす。

**（任意・スコープ外）** 同じ `npm run tauri dev` の1回で、`docs/open-issues.md` の「次に手を付ける候補」1番にある **M15 の実機確認**（`docs/superpowers/plans/2026-08-15-m15-skill-hygiene.md` Task 7）も埋められる。埋めた場合は Task 8 でその旨も反映すること。

---

### Task 8: 文書へ反映する

**Files:**
- Create: `docs/history/m17-core-terminal-fixes.md`
- Modify: `docs/open-issues.md`
- Modify: `docs/overview-rev.md`（9章）
- Modify: `docs/lessons-for-planning.md`
- Modify: `docs/README.md`（履歴表）
- Modify: `CLAUDE.md`（検証コマンドに `cargo test` を足す）

**Interfaces:** なし

- [ ] **Step 1: 申し送りを書く**

`docs/history/m17-core-terminal-fixes.md` を新規作成する。**以後書き換えない記録**なので、含めるのは「実装・レビュー・実機確認で新たに確定した事実」だけにする。最低限これらを書く:

- **`ExecutionContext::Blocking` の発見**（`tauri-macros` 2.6.3 の `src/command/wrapper.rs:50` が既定、`:248-266` が実行文脈の2つの `match`）。PTY コマンド4本はすべて同期コマンドで main thread を使う。**`pty_write` の錠前を外しても「詰まった端末を必ず殺せる」にはならない**——`#[tauri::command(async)]` にしなかった理由（打鍵の並び替え）も書く
- **`killAllPtys` の取りこぼしは、世代と待ち合わせの両方が要る**こと（片方だけでは足りない理由）
- **`src/styles/contrast.ts` の契約を変えた**こと（テスト専用 → 実行時にも1箇所から呼ぶ）
- **端末の ANSI 16色は持たない判断**と、代わりに `minimumContrastRatio` を使ったこと
- **フォルダ切替の後始末を `switchFolder` 1本に寄せた**帰結（端末を使っていなくてもペインが畳まれる）
- **このプロジェクト初の Rust テストを入れた**こと。`cargo test` は `npm test` に含まれない
- **実機確認（Task 7）の結果**。未実施なら「**未実施**」と明記し、チェックリストを空のまま残す

- [ ] **Step 2: `open-issues.md` から6件を消し、残る穴を書く**

「挙動の穴」から**次の6項目を削除する**（本文の書き出しで引く）:

- 「**端末の中だけライト表示でも暗い**」
- 「**起動待ちの間に端末へ打った入力が無音で消える**」
- 「**`killAllPtys` が `starting` 状態の PTY を取りこぼしうる**」
- 「**`TerminalTab` がアンマウント時に自分の PTY を殺さない**」
- 「**実行中のタブが無いフォルダ切替では `closeAll` を通らない**」
- 「**`pty_write` が Mutex を保持したままブロッキング書き込みをする**」

**消してよいのは上の6件だけ。** 同じ `[M11]` でも「一度端末をクリックするとキーボードだけでは本体へ戻れない」「ペインが壁に当たった状態で……」は本マイルストーンのスコープ外なので残す。「小さな負債」の「`TerminalTab` の根 div が `flex` と `hidden` を同時に出している」も**触っていないので残す**。

そのうえで「挙動の穴」に**次の3件を足す**（いずれも `[M17]`）:

- **`pty_write` は同期コマンドのままなので、本当に詰まると UI ごと止まる**（`src-tauri/src/pty.rs`）: M17 で `sessions` の錠前は外したが、Tauri の同期コマンドは main thread で走る（`tauri-macros` の `ExecutionContext::Blocking`）ため、書き込みが返らなければ後続の IPC も処理されない。根治は「セッションごとの書き込みスレッド＋エラーを `Channel` で返す」だが、設計 決定13（書き込み失敗をタブの中に出す）の同期的なエラー経路を作り替える変更になる。`#[tauri::command(async)]` は**採ってはいけない**——複数の `pty_write` が待たれずに撃たれるので打鍵が並び替わる
- **起動待ちの入力の待ち行列に上限が無い**（`src/components/TerminalTab.tsx`）: 溜まるのは `spawn` が解決するまでの約1秒ぶんで、上限を設けると「どこから捨てるか」という新しい判断が要るため意図的に持たない。`spawn` が永遠に解決しない経路ができたときに踏む
- **端末の ANSI 16色は xterm の既定のまま**（`src/core/terminal/theme.ts`）: facet の役割トークン（11個）に対応物が無いため持たない判断で、ライトの面での読みやすさは xterm の `minimumContrastRatio`（4.5）に任せている。**実機で「色が寄りすぎて区別が付かない」と感じたら、値を下げるか16色を持つかを決め直す**

- [ ] **Step 3: rev 9章へ反映する**

`docs/overview-rev.md` の「## 9. デザインシステム」の「### 確定要素」に、**箇条書きを1つ足す**（方眼紙背景の項の後ろあたり）。趣旨:

- 端末（xterm）の中も役割トークンに合わせる（M17 で確定）。流し込むのは面（`surface`）・文字（`ink`）・カーソル・選択の面（`surface-accent`）の4系統で、**ANSI の16色は持たない**——役割トークンに対応物が無く、持つと配色の差し替えが「16色を選び直す」作業になるため。ライトの面での読みやすさは xterm の `minimumContrastRatio`（本文と同じ 4.5:1）に任せる。**色値はソースに現れない**——`palette.css` のトークンを実行時に読んで sRGB へ変換する（`src/core/terminal/theme.ts`。変換式は `src/styles/contrast.ts` の既存のものを使い、2本持たない）

**「端末は 9章 の対象外」と読める記述が rev に無いことは確認済み**（その判断は `TerminalTab.tsx` の JSDoc と `open-issues.md` にだけあった）。もし見つかったら、そちらも直すこと。

- [ ] **Step 4: 教訓を足す**

`docs/lessons-for-planning.md` の「## 設計判断の扱い」または「## 検証手順」に、**次の趣旨で1つ足す**:

- **「錠前の粒度を直す」計画を書いたら、そもそも競合しうる主体が2つ以上いるかを1回問う。** M17 は `pty_write` が `sessions` の Mutex を握ったままブロッキング書き込みをする件を扱ったが、実物を読むと Tauri のコマンド4本は**すべて同期コマンドで main thread を使う**（`tauri-macros` の `ExecutionContext::Blocking`）ため、その Mutex は IPC 側からは**そもそも競合しない**。症状（「詰まった端末を殺せない」）は正しかったが、原因は錠前ではなくスレッドだった。**「Aを直せば症状Bが消える」と書くときは、AとBの間に本当に因果があるかを実物で1回確かめる。** なお実行の主体を増やす（`#[tauri::command(async)]`）解決は、**打鍵の到着順の保証を失う**という別の代償を連れてくる——直し方を選ぶときは「消える欠陥」と「増える失敗モード」を並べて書く

- [ ] **Step 5: `README.md` の履歴表に M17 の行を足す**

`docs/README.md` の履歴表に M17 の行を足す。**M12 の欠落行は本マイルストーンのスコープ外**（`open-issues.md` の「小さな負債」に残っている）なので触らない。

- [ ] **Step 6: `CLAUDE.md` の検証コマンドに `cargo test` を足す**

`CLAUDE.md` の「マージ後の後片付け」の

```
npm test && npx tsc -b && npm run lint   # ここで緑を確認してから次へ
```

を差し替える。

```
npm test && npx tsc -b && npm run lint   # ここで緑を確認してから次へ
cd src-tauri && cargo test               # Rust 側（M17 から。npm test には含まれない）
```

- [ ] **Step 7: 反映の確認**

Run: `grep -c "M11\]" docs/open-issues.md`
Expected: 削除前より6件少ないこと（削除前の件数を先に数えておく: `grep -c "M11\]" docs/open-issues.md`）。

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑（文書だけの変更だが、対象は絞らない）。

- [ ] **Step 8: コミット**

```bash
git add docs/ CLAUDE.md
git commit -m "docs(m17): 申し送りを書き、open-issues・rev 9章・教訓・履歴表へ反映する"
```

---

## 実装前の後片付け（マージ前に必ず行う）

`sample-project/` は動作確認の遊び場である。実機確認で編集した用語集や書き出した `.md` を**コミットしない。**

```bash
git checkout -- sample-project/ && git clean -fd sample-project/
git status --short          # 空になること
```
