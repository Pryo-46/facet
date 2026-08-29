# M28 実装計画: Claude Code ペインへのファイル受け渡しと右クリック

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ファイルの参照を Claude Code ペインへ渡す動線を3つ（起動時・一覧の `@` ボタン・エクスプローラからのドロップ）作り、端末の右クリックを OS のメニューからコピー／貼り付けへ置き換える。

**Architecture:** 4つのトリガーはすべて **xterm の `term.paste(文字列)` という1本の口**に集約する。`ptyIo.write()` で PTY へ直接送らないのは、bracketed paste で囲まれる性質と、既存の `send`（起動待ちのキュー・書き込み失敗の表示）をそのまま使えるため。`TerminalTab` に命令的 API（ref）は生やさず、`insertion: { seq, text } | null` を props で渡して `seq` の変化で消化する。

**Tech Stack:** React 19 / TypeScript / Tauri 2 / xterm 6 / vitest（+ jsdom）/ Tailwind 4

**Spec:** [`2026-08-29-m28-claude-pane-handoff-design.md`](./2026-08-29-m28-claude-pane-handoff-design.md)（コミット `47d891f`）

## Global Constraints

- **作業場所**: worktree `.claude/worktrees/m28-claude-pane-handoff`（ブランチ `worktree-m28-claude-pane-handoff`）。**主チェックアウトでは作業しない**（`CLAUDE.md`）
- **最初に1回 `npm install` を走らせる。** この worktree にはまだ `node_modules` が無い
- **緑の確認コマンド**: `npm test && npx tsc -b && npm run lint`。Rust は触らないので `cargo test` は不要（Task 10 の最終確認では回す）
- **コアは React も Tauri も知らない**（`src/core/**`）。額縁が実装を注入する
- **コンポーネントは `@/fs/` を import しない。** 現在 `src/components/` と `src/modules/` からの `@/fs/` 参照は**0件**であり、これを壊さない。I/O は props で受け取る
- **Rust 側は増やさない。** 自前 Tauri コマンドは5本のまま
- **コメントは「なぜ」を書く。** 既存ファイル（`TerminalTab.tsx` など）の密度に合わせる。日本語
- **`docs/` の文言も日本語。** アクセシブル名・`title` も日本語
- **jsdom にレイアウトは無い。** 寸法・OS のメニュー・DPI に依存する主張はテストにせず、Task 10 の実機確認へ回す（M11 の教訓）

---

## ファイル構成

| 種別 | パス | 責務 |
| --- | --- | --- |
| 新規 | `src/core/terminal/file-reference.ts` | パス → 端末へ差し込む参照文字列（純関数） |
| 新規 | `src/core/terminal/file-reference.test.ts` | 同上のテスト |
| 新規 | `src/core/terminal/clipboard-io.ts` | 端末のコピー／貼り付けの口（型だけ） |
| 変更 | `src/core/terminal/sessions.ts` | `TerminalSession.initialText` を追加 |
| 変更 | `src/core/terminal/sessions.test.ts` | 同上のテスト |
| 変更 | `src/components/TerminalTab.tsx` | 差し込みの消化・右クリック |
| 変更 | `src/components/TerminalTab.dom.test.tsx` | 同上のテスト＋`renderTab` ヘルパ導入 |
| 変更 | `src/components/TerminalPane.tsx` | `insertion` の宛先振り分け・外枠の右クリック抑止・中継 |
| 変更 | `src/components/TerminalPane.dom.test.tsx` | 同上のテスト |
| 変更 | `src/components/FileList.tsx` | 行の `@` ボタン |
| 変更 | `src/components/FileList.dom.test.tsx` | 同上のテスト |
| 変更 | `src/fs/clipboard.ts` | `readClipboardText` と `tauriClipboardIo` |
| 変更 | `src/fs/clipboard.test.ts` | 同上のテスト |
| 変更 | `src/App.tsx` | 配線・ドロップの受け口 |
| 変更 | `src-tauri/capabilities/default.json` | `clipboard-manager:allow-read-text` |
| 新規 | `docs/history/m28-core-claude-pane-handoff.md` | 申し送り |
| 変更 | `docs/open-issues.md` / `docs/overview-rev.md` | 残件と正の反映 |

---

### Task 1: 参照文字列を組み立てる純関数

**Files:**
- Create: `src/core/terminal/file-reference.ts`
- Test: `src/core/terminal/file-reference.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `fileReference(projectDir: string, filePath: string): string`
  - `fileReferences(projectDir: string, filePaths: readonly string[]): string`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/terminal/file-reference.test.ts` を新規作成:

```ts
import { describe, expect, it } from 'vitest'
import { fileReference, fileReferences } from './file-reference'

const DIR = 'C:\\Dev\\Projects\\facet'

describe('fileReference', () => {
  it('プロジェクト配下は @相対パス（区切りは / ・末尾にスペース）', () => {
    // 末尾のスペースは「続けて文が打てる」ため。claude の cwd は projectDir
    expect(fileReference(DIR, 'C:\\Dev\\Projects\\facet\\docs\\用語集.json')).toBe(
      '@docs/用語集.json ',
    )
  })

  it('直下のファイルも @ が付く', () => {
    expect(fileReference(DIR, 'C:\\Dev\\Projects\\facet\\README.md')).toBe('@README.md ')
  })

  it('大文字小文字が違っても配下と判定する（Windows のパスは区別しない）', () => {
    expect(fileReference(DIR, 'c:\\dev\\projects\\FACET\\docs\\a.json')).toBe('@docs/a.json ')
  })

  it('返す相対パスは元の綴りのまま（判定のための正規化を出力へ持ち込まない）', () => {
    expect(fileReference(DIR, 'C:\\Dev\\Projects\\facet\\Docs\\Aa.json')).toBe('@Docs/Aa.json ')
  })

  it('projectDir の末尾に区切りがあっても同じ', () => {
    expect(fileReference('C:\\Dev\\Projects\\facet\\', 'C:\\Dev\\Projects\\facet\\a.json')).toBe(
      '@a.json ',
    )
  })

  it('プロジェクトの外は @ を付けず素の絶対パスを返す', () => {
    // @ は cwd 相対のファイル参照。Windows の絶対パス（コロンとバックスラッシュを
    // 含む）が @ の後ろで解決する保証がないので、素の絶対パスを本文へ置く
    expect(fileReference(DIR, 'D:\\会議資料\\議事録.md')).toBe('D:\\会議資料\\議事録.md ')
  })

  it('前方一致だけで判定しない（似た名前の隣のフォルダは外）', () => {
    expect(fileReference('C:\\proj', 'C:\\project\\a.json')).toBe('C:\\project\\a.json ')
  })

  it('projectDir そのものは配下ではない', () => {
    expect(fileReference(DIR, DIR)).toBe(`${DIR} `)
  })

  it('POSIX の区切りでも動く（テストは node で走るので mac も通る）', () => {
    expect(fileReference('/home/me/proj', '/home/me/proj/docs/a.json')).toBe('@docs/a.json ')
  })
})

describe('fileReferences', () => {
  it('複数ファイルを連結する（各要素が末尾スペースを持つので区切りは入れない）', () => {
    expect(
      fileReferences(DIR, [
        'C:\\Dev\\Projects\\facet\\a.json',
        'C:\\Dev\\Projects\\facet\\docs\\b.json',
      ]),
    ).toBe('@a.json @docs/b.json ')
  })

  it('空の配列は空文字', () => {
    expect(fileReferences(DIR, [])).toBe('')
  })
})
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/core/terminal/file-reference.test.ts`
Expected: FAIL（`Failed to resolve import "./file-reference"`）

- [ ] **Step 3: 最小の実装を書く**

`src/core/terminal/file-reference.ts` を新規作成:

```ts
/**
 * 端末へ差し込むファイル参照を組み立てる（コア・純関数。React も Tauri も知らない）。
 *
 * **プロジェクト配下は `@相対パス`、外は素の絶対パス。** `@` は cwd 相対の
 * ファイル参照として作られており、Windows の絶対パス（ドライブレターのコロンと
 * バックスラッシュを含む）が `@` の後ろで解決する保証がない。`@` を付けずに素の
 * 絶対パスを本文へ置けば、Claude が自分で読みに行く（設計 §3.1）
 */

/**
 * 比較のための正規化。**戻り値の組み立てには使わない**——`toLowerCase()` は
 * 文字数を変えうる（例: `İ` → `i̇`）ので、ここで得た文字列の長さで元のパスを
 * 切ってはいけない
 */
function normalize(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

/** `filePath` が `dir` の配下か。**前方一致だけでは足りない**——`C:\proj` が
 * `C:\project\a.json` に一致してしまうので、区切りまで含めて見る */
function isInside(dir: string, filePath: string): boolean {
  return normalize(filePath).startsWith(`${normalize(dir)}/`)
}

/**
 * ファイル1件の参照文字列。**末尾にスペースを付ける**——続けて文が打てるように
 */
export function fileReference(projectDir: string, filePath: string): string {
  // 末尾の区切りを落とす。**元の綴りのまま**落とす（下で length を使うため）
  const dir = projectDir.replace(/[\\/]+$/, '')
  if (!isInside(dir, filePath)) return `${filePath} `
  const relative = filePath
    .slice(dir.length)
    .replace(/^[\\/]+/, '')
    .replace(/\\/g, '/')
  return `@${relative} `
}

/**
 * 複数ファイルを1つの文字列にする（エクスプローラは複数選択のまま落とせる）。
 * **上限は設けない**——落とした人が落としたぶんだけ渡す（設計 §3.3）
 */
export function fileReferences(projectDir: string, filePaths: readonly string[]): string {
  return filePaths.map((path) => fileReference(projectDir, path)).join('')
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run src/core/terminal/file-reference.test.ts`
Expected: PASS（11件）

- [ ] **Step 5: コミット**

```bash
git add src/core/terminal/file-reference.ts src/core/terminal/file-reference.test.ts
git commit -m "feat(m28): 端末へ差し込むファイル参照を組み立てる純関数"
```

---

### Task 2: 台帳に「起動時に差し込む文字列」を持たせる

**Files:**
- Modify: `src/core/terminal/sessions.ts`
- Test: `src/core/terminal/sessions.test.ts`

**Interfaces:**
- Consumes: Task 1 の `fileReference`（呼ぶのは Task 8。ここでは型だけ）
- Produces:
  - `TerminalSession.initialText: string | null`（読み取り専用）
  - `openSession(state: TerminalState, initialText?: string | null): TerminalState`
    — **第2引数は省略可能**（既定 `null`）。既存の呼び出しとテストを壊さないため

- [ ] **Step 1: 失敗するテストを書く**

`src/core/terminal/sessions.test.ts` の `describe('openSession', ...)` の末尾へ追記:

```ts
  it('起動時に差し込む文字列を持てる', () => {
    const s = openSession(emptyTerminalState, '@docs/a.json ').sessions[0]
    expect(s?.initialText).toBe('@docs/a.json ')
  })

  it('省略したら null（ペインを開くだけのときは何も差し込まない）', () => {
    const s = openSession(emptyTerminalState).sessions[0]
    expect(s?.initialText).toBeNull()
  })
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/core/terminal/sessions.test.ts`
Expected: FAIL（`Expected 1 arguments, but got 2` / `initialText` が `undefined`）

- [ ] **Step 3: 実装する**

`src/core/terminal/sessions.ts` の `TerminalSession` に1フィールド足す:

```ts
export interface TerminalSession {
  /** facet 側の連番。**PTY の ID とは別物**（起動前は PTY がまだ無い） */
  readonly id: number
  readonly label: string
  readonly ptyId: number | null
  readonly status: SessionStatus
  /** exited / failed のときタブの中に出す文言。それ以外は null */
  readonly message: string | null
  /**
   * 起動直後に1回だけ差し込む文字列。無ければ null（M28）。
   *
   * **`insertion` の仕組み（`TerminalTab` の props）には乗せない。** あちらは
   * 「動いているタブへ差し込む」もので、ここは **PTY がまだ無い**段階の話
   */
  readonly initialText: string | null
}
```

`openSession` を差し替える:

```ts
/**
 * タブを1本足す。`initialText` は起動直後に1回だけ差し込む文字列。
 * **省略可能にしてある**——ペインを開くだけの経路（何も渡さない）が既存の
 * 呼び出しのまま動くようにするため
 */
export function openSession(
  state: TerminalState,
  initialText: string | null = null,
): TerminalState {
  const session: TerminalSession = {
    id: state.nextSeq,
    label: `Claude ${state.nextSeq}`,
    ptyId: null,
    status: 'starting',
    message: null,
    initialText,
  }
  return {
    sessions: [...state.sessions, session],
    activeId: session.id,
    nextSeq: state.nextSeq + 1,
  }
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run src/core/terminal/sessions.test.ts`
Expected: PASS（既存分もすべて）

- [ ] **Step 5: 型を通す**

Run: `npx tsc -b`
Expected: PASS。**落ちたら `TerminalSession` を手で組み立てている場所**（`src/components/TerminalTab.dom.test.tsx` の `session()` ヘルパなど）に `initialText: null` を足す:

```ts
function session(over: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id: 1,
    label: 'Claude 1',
    ptyId: null,
    status: 'starting',
    message: null,
    initialText: null,
    ...over,
  }
}
```

- [ ] **Step 6: コミット**

```bash
git add src/core/terminal/sessions.ts src/core/terminal/sessions.test.ts src/components/TerminalTab.dom.test.tsx
git commit -m "feat(m28): 端末セッションに起動時の差し込み文字列を持たせる"
```

---

### Task 3: `TerminalTab` が差し込みを消化する

**Files:**
- Modify: `src/components/TerminalTab.tsx`
- Test: `src/components/TerminalTab.dom.test.tsx`

**Interfaces:**
- Consumes: Task 2 の `TerminalSession.initialText`
- Produces:
  - `TerminalTabProps.insertion: { seq: number; text: string } | null`
  - テストヘルパ `renderTab(overrides)`（Task 6 が props を足すときにここ1箇所だけ触ればよくなる）

- [ ] **Step 1: テストヘルパを導入して既存の render を畳む**

`src/components/TerminalTab.dom.test.tsx` の `session()` の下へ足す。既存の
`render(<TerminalTab … />)` はすべてこのヘルパ経由に書き換える（**動作は変えない**）:

```tsx
type TabProps = React.ComponentProps<typeof TerminalTab>

/**
 * 既定の props を1箇所に集める。**props が増えるたびに全テストを触らずに済む**
 * ようにするため（M28 で insertion / clipboardIo / onError が増える）。
 * `rerender` するテストは、この戻り値を展開してから差分だけ上書きする
 */
function tabProps(over: Partial<TabProps> & { ptyIo: PtyIo }): TabProps {
  return {
    session: session(),
    cwd: '/proj',
    hidden: false,
    dark: false,
    insertion: null,
    onRunning: vi.fn(),
    onExited: vi.fn(),
    onFailed: vi.fn(),
    ...over,
  }
}

function renderTab(over: Partial<TabProps> & { ptyIo: PtyIo }) {
  const props = tabProps(over)
  return { ...render(<TerminalTab {...props} />), props }
}
```

書き換えの例（1本目のテスト）:

```tsx
  it('マウントで PTY を1本起動し、running を知らせる', async () => {
    const pty = fakePty()
    const onRunning = vi.fn()
    renderTab({ ptyIo: pty.io, onRunning })
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    expect(pty.spawned).toEqual([{ cwd: '/proj', program: 'claude' }])
  })
```

- [ ] **Step 2: xterm のモックへ `paste` を足す**

同ファイル冒頭の `term` オブジェクトへ追加（`hasSelection` 以下は Task 6 で使う）:

```ts
const term = {
  open: vi.fn(),
  write: vi.fn(),
  paste: vi.fn(),
  hasSelection: vi.fn(() => false),
  getSelection: vi.fn(() => ''),
  clearSelection: vi.fn(),
  onData: vi.fn(),
  dispose: vi.fn(),
  loadAddon: vi.fn(),
  attachCustomKeyEventHandler: vi.fn(),
  options: {} as Record<string, unknown>,
  cols: 80,
  rows: 24,
}
```

`beforeEach` に既定へ戻す行を足す（`vi.clearAllMocks()` は実装を消さないが、
`mockReturnValue` を書き換えるテストがあるため）:

```ts
  term.hasSelection.mockReturnValue(false)
  term.getSelection.mockReturnValue('')
```

- [ ] **Step 3: 失敗するテストを書く**

同ファイルの `describe('TerminalTab', ...)` 内へ追記:

```tsx
  it('起動時の差し込みを spawn 解決後に1回だけ流す', async () => {
    const pty = fakePty()
    renderTab({ ptyIo: pty.io, session: session({ initialText: '@docs/a.json ' }) })
    await waitFor(() => expect(term.paste).toHaveBeenCalledWith('@docs/a.json '))
    expect(term.paste).toHaveBeenCalledTimes(1)
  })

  it('initialText が null なら何も差し込まない', async () => {
    const pty = fakePty()
    renderTab({ ptyIo: pty.io })
    await waitFor(() => expect(pty.spawned).toHaveLength(1))
    expect(term.paste).not.toHaveBeenCalled()
  })

  it('insertion.seq が変わったときだけ差し込む', async () => {
    const pty = fakePty()
    const { rerender, props: base } = renderTab({ ptyIo: pty.io })
    await waitFor(() => expect(pty.spawned).toHaveLength(1))
    rerender(<TerminalTab {...base} insertion={{ seq: 1, text: '@a.json ' }} />)
    expect(term.paste).toHaveBeenCalledTimes(1)
    expect(term.paste).toHaveBeenCalledWith('@a.json ')

    // **同じ seq で再描画しても二度は流さない。** ここが「同じ指示が二度
    // 実行されない」という主張そのもの
    rerender(<TerminalTab {...base} insertion={{ seq: 1, text: '@a.json ' }} />)
    expect(term.paste).toHaveBeenCalledTimes(1)

    // **同じ text でも seq が進めば流す**（同じファイルを続けて2回渡す操作）
    rerender(<TerminalTab {...base} insertion={{ seq: 2, text: '@a.json ' }} />)
    expect(term.paste).toHaveBeenCalledTimes(2)
  })

  it('StrictMode の二重マウントでも起動時の差し込みは1回だけ', async () => {
    const pty = fakePtyMultiSpawn()
    render(
      <StrictMode>
        <TerminalTab {...tabProps({ ptyIo: pty.io, session: session({ initialText: '@a.json ' }) })} />
      </StrictMode>,
    )
    // 捨てられた側は disposed で弾かれ、生き残った側だけが流す
    await waitFor(() => expect(term.paste).toHaveBeenCalledTimes(1))
  })
```

- [ ] **Step 4: 失敗することを確かめる**

Run: `npx vitest run src/components/TerminalTab.dom.test.tsx`
Expected: FAIL（`insertion` が props に無い型エラー、`term.paste` が呼ばれない）

- [ ] **Step 5: `TerminalTabProps` へ `insertion` を足す**

`src/components/TerminalTab.tsx` の `TerminalTabProps` へ:

```ts
  /**
   * 動いているタブへの差し込み指示（M28）。**`seq` が変わったときだけ**流す。
   * `seq` は App が持つ単調増加の連番で、同じ指示が二度実行されないための鍵。
   *
   * **`text` を effect の依存に入れないこと**——同じファイルを続けて2回渡す
   * 操作で2回目が落ちる
   */
  insertion: { seq: number; text: string } | null
```

`props` の分割代入へ `insertion` を加える:

```ts
  const { session, cwd, ptyIo, hidden, dark, insertion, onRunning, onExited, onFailed } = props
```

- [ ] **Step 6: 起動時の差し込みを実装する**

起動 effect の `.then((ptyId) => { … })` の中、**待ち行列を流し切った直後**（`for (const data of queued) send(data)` の次の行）へ:

```ts
        // 起動時の差し込み（M28）。**待ち行列の後**——起動待ちに打たれた文字より
        // 先に参照を入れると、打った文字が参照の前へ出てしまう。
        // **`hidden` は見ない**（`fit()` と違い寸法を測らないので、隠れていても
        // 差し込んでよい）。`disposed` の判定は上の分岐で済んでいる
        if (session.initialText !== null) term.paste(session.initialText)
```

- [ ] **Step 7: `insertion` の消化を実装する**

`dark` の effect の下へ新しい effect を足す:

```tsx
  /**
   * 動いているタブへの差し込み（M28）。
   *
   * **消化済みの `seq` を ref で覚える。** effect の依存を `seq` だけにしても、
   * StrictMode の二重マウントでは mount → cleanup → mount で2回走る。
   * マウント時点で `insertion` が入っている経路は現状無いが、ここを守っておけば
   * 「二度差し込まれた」という追いにくい不具合の余地が消える
   */
  const lastInsertedRef = useRef<number | null>(null)
  const insertionSeq = insertion?.seq ?? null
  useEffect(() => {
    const term = termRef.current
    if (term === null || insertion === null) return
    if (lastInsertedRef.current === insertion.seq) return
    lastInsertedRef.current = insertion.seq
    term.paste(insertion.text)
    // **依存は `seq` だけ。** `insertion` そのものを入れると、App が同じ内容で
    // 作り直したオブジェクトでも走る。`text` を入れてもいけない（上の注釈）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertionSeq])
```

- [ ] **Step 8: テストが通ることを確かめる**

Run: `npx vitest run src/components/TerminalTab.dom.test.tsx`
Expected: PASS（既存分＋新規4件）

- [ ] **Step 9: コミット**

```bash
git add src/components/TerminalTab.tsx src/components/TerminalTab.dom.test.tsx
git commit -m "feat(m28): TerminalTab が起動時と会話中の差し込みを消化する"
```

---

### Task 4: `TerminalPane` が宛先を振り分け、外枠で既定メニューを止める

**Files:**
- Modify: `src/components/TerminalPane.tsx`
- Test: `src/components/TerminalPane.dom.test.tsx`

**Interfaces:**
- Consumes: Task 3 の `TerminalTabProps.insertion`
- Produces: `TerminalPaneProps.insertion: { targetId: number; seq: number; text: string } | null`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/TerminalPane.dom.test.tsx` のモックを、`insertion` を見えるようにする形へ差し替える:

```tsx
vi.mock('./TerminalTab', () => ({
  TerminalTab: ({
    session,
    hidden,
    insertion,
  }: {
    session: { label: string }
    hidden: boolean
    insertion: { seq: number; text: string } | null
  }) => (
    <div
      data-testid={`tab-body-${session.label}`}
      data-hidden={String(hidden)}
      data-insertion={insertion === null ? '' : `${insertion.seq}:${insertion.text}`}
    />
  ),
}))
```

`setup` の `render` へ `insertion={null}` を足し、`insertion` を差し替えられるようにする:

```tsx
function setup(state = openSession(emptyTerminalState), insertion = null as
  | { targetId: number; seq: number; text: string }
  | null) {
  const handlers = { /* 既存のまま */ }
  render(
    <TerminalPane
      state={state}
      cwd="/proj"
      ptyIo={ptyIo}
      paneVisible
      dark={false}
      insertion={insertion}
      {...handlers}
    />,
  )
  return handlers
}
```

テストを追記:

```tsx
  it('差し込みは宛先のタブにだけ渡す', () => {
    const two = openSession(openSession(emptyTerminalState))
    const second = two.sessions[1]?.id ?? 0
    setup(two, { targetId: second, seq: 3, text: '@a.json ' })
    expect(screen.getByTestId('tab-body-Claude 1').dataset.insertion).toBe('')
    expect(screen.getByTestId('tab-body-Claude 2').dataset.insertion).toBe('3:@a.json ')
  })

  it('ペインの中では OS の既定メニューを出さない', () => {
    setup()
    // タブバーを含むペイン全体で既定メニューを止める。**ここでは何も起こさない**
    //（貼り付けは端末の中だけ。TerminalTab の担当）
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    const dispatched = screen.getByRole('button', { name: 'タブを追加' }).dispatchEvent(event)
    expect(dispatched).toBe(false) // preventDefault された
  })
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/components/TerminalPane.dom.test.tsx`
Expected: FAIL（`insertion` が props に無い／`dispatched` が `true`）

- [ ] **Step 3: 実装する**

`src/components/TerminalPane.tsx` の `TerminalPaneProps` へ追加:

```ts
  /**
   * 差し込み指示（M28）。App が**1つだけ**持ち、ここで宛先のタブへ振り分ける。
   * `targetId` と一致しないタブには `null` を渡す
   */
  insertion: { targetId: number; seq: number; text: string } | null
```

分割代入へ `insertion` を加え、外枠へハンドラを付ける:

```tsx
  const { state, cwd, ptyIo, paneVisible, dark, insertion, onOpen, onClose, onActivate } = props
  const { onRunning, onExited, onFailed } = props

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface"
      /*
       * **ペインの中では OS の既定メニューを出さない**（M28）。ここが受けるのは
       * タブバーと余白の分で、**止めるだけで何も起こさない**——タブバーで
       * 右クリックして貼り付けが起きるのはおかしい。端末の中身は `TerminalTab`
       * が先に拾ってコピー／貼り付けへ割り当てる（バブリングで両方が
       * `preventDefault` を呼ぶが無害）。
       * **アプリ全体では止めない**（人間の裁定）——エディタ側のテキスト欄では
       * OS のメニューからの貼り付けが使えたままになる
       */
      onContextMenu={(event) => event.preventDefault()}
    >
```

`TerminalTab` へ渡す:

```tsx
            insertion={
              insertion !== null && insertion.targetId === session.id ? insertion : null
            }
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run src/components/TerminalPane.dom.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/TerminalPane.tsx src/components/TerminalPane.dom.test.tsx
git commit -m "feat(m28): ペインが差し込みの宛先を振り分け、既定メニューを止める"
```

---

### Task 5: クリップボードの読み取りを額縁に用意する

**Files:**
- Create: `src/core/terminal/clipboard-io.ts`
- Modify: `src/fs/clipboard.ts`
- Modify: `src-tauri/capabilities/default.json`
- Test: `src/fs/clipboard.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `ClipboardIo { readText(): Promise<string>; writeText(text: string): Promise<void> }`（`@/core/terminal/clipboard-io`）
  - `readClipboardText(): Promise<string>` / `tauriClipboardIo: ClipboardIo`（`@/fs/clipboard`）

- [ ] **Step 1: 失敗するテストを書く**

`src/fs/clipboard.test.ts` の冒頭のモックへ `readText` を足す:

```ts
const readText = vi.fn<() => Promise<string>>()
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText, writeHtml, readText }))
```

import 行を差し替える:

```ts
const { copyToClipboard, copyHtmlToClipboard, readClipboardHtml, readClipboardText, tauriClipboardIo } =
  await import('./clipboard')
```

末尾へ describe を追記:

```ts
describe('readClipboardText', () => {
  beforeEach(() => {
    readText.mockReset()
  })

  it('プラグインの readText の結果をそのまま返す', async () => {
    readText.mockResolvedValue('こんにちは')
    await expect(readClipboardText()).resolves.toBe('こんにちは')
  })

  it('テキストが載っていなければ空文字（投げない）', async () => {
    // プラグインはテキストが無いとエラーを返す。**それは異常ではなく日常的な状態**
    //（readClipboardHtml と同じ扱い）
    readText.mockRejectedValue(new Error('ClipboardNotSupported'))
    await expect(readClipboardText()).resolves.toBe('')
  })
})

describe('tauriClipboardIo', () => {
  beforeEach(() => {
    readText.mockReset()
    writeText.mockReset()
    writeText.mockResolvedValue(undefined)
  })

  it('読み書きの両方をプラグインへ繋ぐ', async () => {
    readText.mockResolvedValue('x')
    await expect(tauriClipboardIo.readText()).resolves.toBe('x')
    await tauriClipboardIo.writeText('y')
    expect(writeText).toHaveBeenCalledWith('y')
  })
})
```

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/fs/clipboard.test.ts`
Expected: FAIL（`readClipboardText` / `tauriClipboardIo` が undefined）

- [ ] **Step 3: 口の型を作る**

`src/core/terminal/clipboard-io.ts` を新規作成:

```ts
/**
 * 端末のコピー／貼り付けの口（コア・型だけ）。**コアは Tauri を知らない**——
 * 額縁が `src/fs/clipboard.ts` の実装を注入する（`PtyIo` と同じ流儀）。
 *
 * この型が要るのは、`src/components/` から `@/fs/` を import しないため。
 * I/O は props で受け取る
 */
export interface ClipboardIo {
  /** クリップボードのテキスト。**載っていなければ空文字**（投げない） */
  readText(): Promise<string>
  writeText(text: string): Promise<void>
}
```

- [ ] **Step 4: 額縁の実装を書く**

`src/fs/clipboard.ts` の import を差し替え、末尾へ足す:

```ts
import { readText, writeHtml, writeText } from '@tauri-apps/plugin-clipboard-manager'
import type { ClipboardIo } from '@/core/terminal/clipboard-io'
```

```ts
/**
 * クリップボードのテキストを読む（端末の右クリック貼り付け。M28）。
 *
 * **`clipboard-manager:allow-read-text` が要る**（`src-tauri/capabilities/default.json`）。
 * テキストが載っていないときプラグインはエラーを返すので、**空文字に潰して
 * 呼び出し側を単純にする**——「テキストが無い」は異常ではなく日常的な状態である
 *（`readClipboardHtml` と同じ扱い）
 */
export async function readClipboardText(): Promise<string> {
  try {
    return await readText()
  } catch {
    return ''
  }
}

/**
 * 端末へ注入するクリップボードの口（M28）。`tauriPtyIo` と同じく、
 * **額縁がここで組み立ててコンポーネントへ props で渡す**
 */
export const tauriClipboardIo: ClipboardIo = {
  readText: readClipboardText,
  writeText: copyToClipboard,
}
```

- [ ] **Step 5: 権限を足す**

`src-tauri/capabilities/default.json` の `permissions` の
`"clipboard-manager:allow-write-html",` の直後へ1行足す:

```json
    "clipboard-manager:allow-read-text",
```

同ファイルの `description` の該当箇所を書き換える。**「プラグインの読み取り権限は
与えない」は HTML の話だと明示する**:

置換前:
```
**プラグインの読み取り権限は与えない**——HTML の読み取りはプラグインに API が無く、自前コマンド `read_clipboard_html`（arboard）を通すため。
```

置換後:
```
clipboard-manager:allow-read-text は端末ペインの右クリック貼り付けのため（M28）。**HTML の読み取り権限だけは与えない**——プラグインに API が無く、自前コマンド `read_clipboard_html`（arboard）を通すため。
```

- [ ] **Step 6: テストが通ることを確かめる**

Run: `npx vitest run src/fs/clipboard.test.ts && npx tsc -b`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/core/terminal/clipboard-io.ts src/fs/clipboard.ts src/fs/clipboard.test.ts src-tauri/capabilities/default.json
git commit -m "feat(m28): クリップボードのテキスト読み取りと注入用の口を用意する"
```

---

### Task 6: 端末の右クリックをコピー／貼り付けにする

**Files:**
- Modify: `src/components/TerminalTab.tsx`
- Modify: `src/components/TerminalPane.tsx`
- Test: `src/components/TerminalTab.dom.test.tsx`, `src/components/TerminalPane.dom.test.tsx`

**Interfaces:**
- Consumes: Task 5 の `ClipboardIo`
- Produces:
  - `TerminalTabProps.clipboardIo: ClipboardIo` / `TerminalTabProps.onError: (message: string) => void`
  - `TerminalPaneProps.clipboardIo: ClipboardIo` / `TerminalPaneProps.onError: (message: string) => void`

- [ ] **Step 1: テストヘルパへ新しい props を足す**

`src/components/TerminalTab.dom.test.tsx` の `tabProps` の既定へ2つ加える（**Task 3 で
ヘルパへ畳んであるので、触るのはここ1箇所**。`rerender` するテストも StrictMode の
テストも同じ既定を通る）:

```tsx
function fakeClipboard(text = '') {
  return {
    readText: vi.fn(async () => text),
    writeText: vi.fn(async () => undefined),
  }
}
```

```tsx
    insertion: null,
    clipboardIo: fakeClipboard(),
    onError: vi.fn(),
```

- [ ] **Step 2: 失敗するテストを書く**

同ファイルへ追記:

```tsx
  it('選択があればコピーして選択を解除する（メニューは出さない）', async () => {
    const pty = fakePty()
    const clipboardIo = fakeClipboard()
    term.hasSelection.mockReturnValue(true)
    term.getSelection.mockReturnValue('選択したところ')
    const { container } = renderTab({ ptyIo: pty.io, clipboardIo })
    await waitFor(() => expect(pty.spawned).toHaveLength(1))

    const host = container.querySelector('.min-h-0.flex-1')
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    const dispatched = host?.dispatchEvent(event)

    expect(dispatched).toBe(false) // preventDefault された＝既定メニューは出ない
    await waitFor(() => expect(clipboardIo.writeText).toHaveBeenCalledWith('選択したところ'))
    expect(term.clearSelection).toHaveBeenCalledTimes(1)
    expect(clipboardIo.readText).not.toHaveBeenCalled()
  })

  it('選択が無ければクリップボードを貼り付ける', async () => {
    const pty = fakePty()
    const clipboardIo = fakeClipboard('貼るテキスト')
    const { container } = renderTab({ ptyIo: pty.io, clipboardIo })
    await waitFor(() => expect(pty.spawned).toHaveLength(1))

    const host = container.querySelector('.min-h-0.flex-1')
    host?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))

    await waitFor(() => expect(term.paste).toHaveBeenCalledWith('貼るテキスト'))
    expect(clipboardIo.writeText).not.toHaveBeenCalled()
  })

  it('クリップボードが空なら何もしない', async () => {
    const pty = fakePty()
    const clipboardIo = fakeClipboard('')
    const { container } = renderTab({ ptyIo: pty.io, clipboardIo })
    await waitFor(() => expect(pty.spawned).toHaveLength(1))

    const host = container.querySelector('.min-h-0.flex-1')
    host?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))

    await waitFor(() => expect(clipboardIo.readText).toHaveBeenCalled())
    expect(term.paste).not.toHaveBeenCalled()
  })

  it('コピーの失敗は握り潰さず onError へ出す（セッションは殺さない）', async () => {
    const pty = fakePty()
    const clipboardIo = fakeClipboard()
    clipboardIo.writeText.mockRejectedValue(new Error('denied'))
    term.hasSelection.mockReturnValue(true)
    term.getSelection.mockReturnValue('x')
    const onError = vi.fn()
    const onFailed = vi.fn()
    const { container } = renderTab({ ptyIo: pty.io, clipboardIo, onError, onFailed })
    await waitFor(() => expect(pty.spawned).toHaveLength(1))

    const host = container.querySelector('.min-h-0.flex-1')
    host?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))

    await waitFor(() => expect(onError).toHaveBeenCalledWith('コピーできませんでした: denied'))
    // **`onFailed` は呼ばない。** あれはセッションが死んだときの経路で、
    // コピーの失敗でタブを「終了」扱いにしてはいけない
    expect(onFailed).not.toHaveBeenCalled()
  })
```

- [ ] **Step 3: 失敗することを確かめる**

Run: `npx vitest run src/components/TerminalTab.dom.test.tsx`
Expected: FAIL（`clipboardIo` / `onError` が props に無い）

- [ ] **Step 4: `TerminalTab` を実装する**

import を足す:

```ts
import type { ClipboardIo } from '@/core/terminal/clipboard-io'
```

`TerminalTabProps` へ:

```ts
  /** コピー／貼り付けの口。**額縁が注入する**（コンポーネントは `@/fs/` を知らない） */
  clipboardIo: ClipboardIo
  /**
   * セッションを殺さない失敗の通知先（M28。App のトーストへ出る）。
   * **`session.message` を使わないこと**——あれは `exited` / `failed` の欄で、
   * コピーの失敗でタブを死んだ扱いにしてはいけない
   */
  onError: (message: string) => void
```

分割代入を更新:

```ts
  const { session, cwd, ptyIo, hidden, dark, insertion, clipboardIo } = props
  const { onRunning, onExited, onFailed, onError } = props
```

ファイル上部（`SHIFT_ENTER_SEQUENCE` の下）へ小さなヘルパ:

```ts
/** 例外を人に見せる文字列にする */
const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))
```

`return` の直前へハンドラを置く。**`useCallback` は使わない**——描画ごとに作り直す
ことで最新の props をそのまま読める:

```tsx
  /**
   * 端末の中の右クリック（M28）。**メニューは出さず1動作で済ませる**
   *（Windows Terminal と同じ作法）。選択があればコピーして選択を解除、
   * 無ければ貼り付ける。
   *
   * **`preventDefault()` がすべての要。** 呼ばなければ WebView2 の既定メニューが出る
   */
  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const term = termRef.current
    if (term === null) return
    if (term.hasSelection()) {
      const selected = term.getSelection()
      term.clearSelection()
      void clipboardIo.writeText(selected).catch((err: unknown) => {
        onError(`コピーできませんでした: ${errorText(err)}`)
      })
      return
    }
    void clipboardIo
      .readText()
      .then((text) => {
        // 空は日常的な状態（クリップボードが空／テキストでない）。黙って何もしない
        if (text === '') return
        term.paste(text)
      })
      .catch((err: unknown) => {
        onError(`貼り付けできませんでした: ${errorText(err)}`)
      })
  }
```

ホスト要素へ付ける:

```tsx
      <div ref={hostRef} className="min-h-0 flex-1" onContextMenu={handleContextMenu} />
```

- [ ] **Step 5: `TerminalPane` で中継する**

`TerminalPaneProps` へ2つ足し（`clipboardIo: ClipboardIo` / `onError: (message: string) => void`。
コメントは `TerminalTab` と同じ趣旨を1行で）、分割代入に加え、`<TerminalTab>` へ
`clipboardIo={clipboardIo}` と `onError={onError}` を渡す。

`src/components/TerminalPane.dom.test.tsx` の `setup` の `render` へも
`clipboardIo={{ readText: vi.fn(async () => ''), writeText: vi.fn(async () => undefined) }}` と
`onError={vi.fn()}` を足す。

- [ ] **Step 6: テストが通ることを確かめる**

Run: `npx vitest run src/components/ && npx tsc -b`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/components/TerminalTab.tsx src/components/TerminalTab.dom.test.tsx src/components/TerminalPane.tsx src/components/TerminalPane.dom.test.tsx
git commit -m "feat(m28): 端末の右クリックをコピー／貼り付けにする"
```

---

### Task 7: ファイル一覧の行に `@` ボタンを置く

**Files:**
- Modify: `src/components/FileList.tsx`
- Test: `src/components/FileList.dom.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: `FileListProps.onHandoff: (file: ProjectFile) => void`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/FileList.dom.test.tsx` の `setup` の `handlers` へ `onHandoff` を足す:

```tsx
  const handlers = { onSelect: vi.fn(), onCreate: vi.fn(), onDelete: vi.fn(), onHandoff: vi.fn() }
```

`describe('FileList', ...)` 内へ追記する。**アクセシブル名の `を` の前にはスペースが入る**
——`aria-label={`${fullName} を Claude Code に渡す`}` の形で、既存の
`'用語集（用語集.json） を開く'` と同じ組み立てになる:

```tsx
  it('@ ボタンでファイルを Claude Code へ渡す', () => {
    const { onHandoff } = setup([file('用語集.json')])
    fireEvent.click(
      screen.getByRole('button', { name: '用語集（用語集.json） を Claude Code に渡す' }),
    )
    expect(onHandoff).toHaveBeenCalledWith(expect.objectContaining({ name: '用語集.json' }))
  })

  it('@ ボタンは選択を動かさない（編集中のファイルを離れずに渡せることが要点）', () => {
    const { onSelect } = setup([file('用語集.json')])
    fireEvent.click(
      screen.getByRole('button', { name: '用語集（用語集.json） を Claude Code に渡す' }),
    )
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('開けないファイルにも @ ボタンを出す（渡す先は Claude であって facet ではない）', () => {
    setup([file('壊れた.json', { result: { status: 'rejected', title: null, reason: '壊れている' } })])
    expect(
      screen.getByRole('button', { name: '壊れた.json を Claude Code に渡す' }),
    ).not.toBeNull()
  })
```

**3本目の `result` の形は既存テスト**（「開けないファイル・編集不可のファイルも一覧に出す」）
**からそのまま写すこと。** `LoadResult` の `rejected` の形はこの計画の関心事ではない。

- [ ] **Step 2: 失敗することを確かめる**

Run: `npx vitest run src/components/FileList.dom.test.tsx`
Expected: FAIL（そのボタンが見つからない）

- [ ] **Step 3: 実装する**

`src/components/FileList.tsx` の import へ `AtSign` を足す:

```ts
import { AtSign, Folder, Plus, Trash2 } from 'lucide-react'
```

`FileListProps` へ:

```ts
  /**
   * そのファイルを Claude Code ペインへ渡す（M28）。**選択は動かさない**——
   * 編集中のファイルを開いたまま別のファイルを渡せることが、この動線の要点
   */
  onHandoff: (file: ProjectFile) => void
```

`FileRow` の props へ `onHandoff: () => void` を足し、**削除ボタンの直前**へ置く:

```tsx
      {/* Claude Code へ渡す（M28）。**選択状態は動かさない**——編集中のファイルを
          開いたまま、別のファイルを渡せるのがこのボタンの存在理由。
          開けない・編集不可のファイルにも出す——渡す先は Claude であって
          facet ではないので、facet が開けないことは渡せない理由にならない
          （削除ボタンと同じ判断） */}
      <button
        type="button"
        aria-label={`${fullName} を Claude Code に渡す`}
        title={`${fullName} を Claude Code に渡す`}
        className={`${buttonBase} shrink-0 px-3 text-ink-muted hover:bg-canvas hover:text-ink`}
        onClick={props.onHandoff}
      >
        <AtSign aria-hidden className="size-4" />
      </button>
```

`FileRow` の呼び出しへ `onHandoff={() => props.onHandoff(file)}` を足す。

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run src/components/FileList.dom.test.tsx`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/FileList.tsx src/components/FileList.dom.test.tsx
git commit -m "feat(m28): ファイル一覧の行から Claude Code へ渡すボタンを置く"
```

---

### Task 8: App の配線

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.dom.test.tsx`

**Interfaces:**
- Consumes: Task 1・2・4・6・7 のすべて
- Produces:
  - `openTerminal(initialText?: string): void`（**省略時は選択中ファイルの参照**）
  - `handoffToTerminal(text: string): void`（`@` ボタンとドロップが共有）

- [ ] **Step 1: 失敗するテストを書く**

`src/App.dom.test.tsx` は `@xterm/xterm` を差し替え済みだが、**`new Terminal()` の
たびに新しいオブジェクトを返す**ので、そのままでは `paste` を外から観測できない。
共有の配列を用意して覗けるようにする。

`vi.hoisted(...)` の戻り値へ1つ足す（`disk` の隣）:

```ts
    pasted: [] as string[],
```

分割代入の変数一覧（`disk,` の隣）へ `pasted,` を足し、`beforeEach` の `disk.clear()` の
隣へ `pasted.length = 0` を足す。xterm のモックへ `paste` を生やす:

```ts
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(function Terminal() {
    return {
      open: vi.fn(),
      write: vi.fn(),
      // 差し込みを額縁レベルで観測するための口（M28）。**タブごとに別の
      // オブジェクトが返るので、共有の配列へ積む**
      paste: vi.fn((text: string) => {
        pasted.push(text)
      }),
      hasSelection: vi.fn(() => false),
      getSelection: vi.fn(() => ''),
      clearSelection: vi.fn(),
      onData: vi.fn(),
      loadAddon: vi.fn(),
      dispose: vi.fn(),
      attachCustomKeyEventHandler: vi.fn(),
      cols: 80,
      rows: 24,
    }
  }),
}))
```

テストを追記する（`disk` と「フォルダを開く」の使い方は既存の
`describe('名前の帯（M13）', ...)` と同じ）:

```tsx
describe('Claude Code へファイルを渡す（M28）', () => {
  const GLOSSARY_PATH = '/proj/用語集.json'

  const putGlossary = () => {
    disk.set(
      GLOSSARY_PATH,
      JSON.stringify({ schemaVersion: 1, type: 'glossary', title: '用語集', terms: [] }),
    )
  }

  it('選択中のファイルの参照を持ってペインが開く', async () => {
    putGlossary()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    fireEvent.click(await screen.findByRole('button', { name: '用語集（用語集.json） を開く' }))
    fireEvent.click(screen.getByRole('button', { name: 'Claude Code ペインを開く' }))

    await waitFor(() => expect(pasted).toEqual(['@用語集.json ']))
  })

  it('ファイルを選んでいなければ何も差し込まない', async () => {
    putGlossary()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    await screen.findByRole('button', { name: '用語集（用語集.json） を開く' })
    fireEvent.click(screen.getByRole('button', { name: 'Claude Code ペインを開く' }))

    // 起動は待つが、差し込みは起きない
    await waitFor(() => expect(screen.getByRole('button', { name: 'タブを追加' })).not.toBeNull())
    expect(pasted).toEqual([])
  })

  it('@ ボタンは、ペインが閉じていても開いて渡す', async () => {
    putGlossary()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    // **ファイルを選ばずに** @ を押す。選択と無関係に渡せることが要点
    fireEvent.click(
      await screen.findByRole('button', { name: '用語集（用語集.json） を Claude Code に渡す' }),
    )

    await waitFor(() => expect(pasted).toEqual(['@用語集.json ']))
  })
})
```

**`fireEvent` / `waitFor` / `App` の import は既存ファイルに揃っている**ので追加不要。

- [ ] **Step 2: `openTerminal` と `handoffToTerminal` を実装する**

`src/App.tsx` の import へ:

```ts
import { fileReference, fileReferences } from '@/core/terminal/file-reference'
import { tauriClipboardIo } from '@/fs/clipboard'
```

`openTerminal` を差し替える（**既存の doc コメントは残す**。Skill 同期の注意書きは
そのまま意味を持つ）:

```tsx
  /**
   * いま選択しているファイルの参照。無ければ null。
   * ペインを開く／タブを足すときの初期テキストになる（設計 §4.4）
   */
  const selectedReference = (): string | null =>
    projectDir === null || selectedPath === null ? null : fileReference(projectDir, selectedPath)

  const openTerminal = (initialText?: string) =>
    setTerminals((prev) => openSession(prev, initialText ?? selectedReference()))
```

**呼び出し側を直す。** `onOpen={openTerminal}` のままだと React が `MouseEvent` を
第1引数に渡してしまうので、必ず包む:

```tsx
                onOpen={() => openTerminal()}
```

（ヘッダのボタン内の `void openTerminal()` は引数無しなのでそのままでよい）

差し込みの state を足す（`terminals` の近く）:

```tsx
  /**
   * 差し込み指示（M28）。**1つだけ持つ**——宛先の振り分けは `TerminalPane`、
   * 同じ指示を二度実行しない保証は `seq` の単調増加（`TerminalTab` が消化条件に使う）
   */
  const [insertion, setInsertion] = useState<{
    targetId: number
    seq: number
    text: string
  } | null>(null)
  const insertionSeq = useRef(0)

  /**
   * ファイルを Claude Code へ渡す（M28。一覧の `@` ボタンとエクスプローラからの
   * ドロップが共有する）。**押した人がやりたいのは「渡すこと」**なので、ペインが
   * 閉じていても・タブが1本も無くても、開いて起動するところまで面倒を見る
   */
  const handoffToTerminal = (text: string) => {
    setPaneOpen(true)
    // **`terminals` を直読みしない。** ドロップのリスナは1回しか張らないので、
    // 最新の台帳は ref から読む（closeTerminalNow と同じ理由）
    const active = terminalsRef.current.activeId
    if (active === null) {
      openTerminal(text)
      return
    }
    // **採番は updater の外。** setState の updater は純粋でなければならない
    //（StrictMode の二重実行で seq を余分に消費する。showToast の id と同じ理由）
    const seq = ++insertionSeq.current
    setInsertion({ targetId: active, seq, text })
  }
```

- [ ] **Step 3: 一覧とペインへ配線する**

`<FileList … />` へ:

```tsx
              onHandoff={(file) => {
                if (projectDir === null) return
                handoffToTerminal(fileReference(projectDir, file.path))
              }}
```

`<TerminalPane … />` へ:

```tsx
                insertion={insertion}
                clipboardIo={tauriClipboardIo}
                onError={(message) => showToast({ message })}
```

- [ ] **Step 4: 緑を確かめる**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/App.tsx src/App.dom.test.tsx
git commit -m "feat(m28): ファイルを Claude Code へ渡す動線を配線する"
```

---

### Task 9: エクスプローラからのドロップを受ける

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 1 の `fileReferences`、Task 8 の `handoffToTerminal`、既存の `terminalPaneRef`
- Produces: なし（App 内で閉じる）

- [ ] **Step 1: `payload` の形を確認する**

`node_modules/@tauri-apps/api/webview.d.ts` の `DragDropEvent` は**4つ**:

```ts
type DragDropEvent =
  | { type: 'enter'; paths: string[]; position: PhysicalPosition }
  | { type: 'over'; position: PhysicalPosition }   // ← paths は無い
  | { type: 'drop'; paths: string[]; position: PhysicalPosition }
  | { type: 'leave' }                               // ← position も無い
```

**`over` に `paths` は無い。** 分岐を書くときに参照しないこと。

- [ ] **Step 2: ドロップ中の強調用の state を足す**

```tsx
  /** エクスプローラからファイルを持ってこられている最中か（M28。設計 §6.3） */
  const [dropActive, setDropActive] = useState(false)
```

- [ ] **Step 3: 最新値を読むための ref を足す**

リスナは1回しか張らないので、`projectDir` と `handoffToTerminal` は ref 経由で読む
（`terminalPaneRef` の隣のコメントと同じ理由）:

```tsx
  const projectDirRef = useRef(projectDir)
  projectDirRef.current = projectDir
  const handoffRef = useRef(handoffToTerminal)
  handoffRef.current = handoffToTerminal
```

**`handoffToTerminal` の定義より後ろに置くこと。**

- [ ] **Step 4: リスナを張る**

`src/App.tsx` の import へ:

```ts
import { getCurrentWebview } from '@tauri-apps/api/webview'
```

effect を足す（他の window リスナの effect の近く）:

```tsx
  /**
   * エクスプローラからのドロップ（M28）。
   *
   * **HTML5 の D&D は使わない。** Tauri の `dragDropEnabled` は既定で `true` で、
   * その状態では Windows の HTML5 D&D が効かない（両立しない）。facet は HTML5
   * D&D を1箇所も使っていない（仕切りもキャンバスもポインタイベント）ので、
   * 既定のまま Tauri のイベントを受ける方が得（設計 §6.1）。
   *
   * **イベントはウィンドウ全体で発火する**ので、位置がペインの矩形の中に
   * あるときだけ受ける。**畳んでいるペインは `display:none` で矩形が 0 になり、
   * 必ず「外」と判定される**——見えていない場所へは落とせない、という結果に
   * なるが、狙いどおりである（落とし先が見えないドロップは成立しない）
   */
  useEffect(() => {
    const inPane = (position: { x: number; y: number }): boolean => {
      const pane = terminalPaneRef.current
      if (pane === null) return false
      // position は**物理ピクセル**。CSS ピクセルへ直してから矩形と比べる
      const ratio = window.devicePixelRatio || 1
      const x = position.x / ratio
      const y = position.y / ratio
      const rect = pane.getBoundingClientRect()
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    }

    let unlisten: (() => void) | null = null
    let disposed = false
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload
        if (payload.type === 'leave') {
          setDropActive(false)
          return
        }
        const inside = inPane(payload.position)
        if (payload.type !== 'drop') {
          // enter / over。**`over` に paths は無い**ので触らない
          setDropActive(inside)
          return
        }
        setDropActive(false)
        if (!inside) return
        const dir = projectDirRef.current
        if (dir === null) return
        if (payload.paths.length === 0) return
        handoffRef.current(fileReferences(dir, payload.paths))
      })
      .then((fn) => {
        // 解決までにアンマウントされていたら、その場で外す
        if (disposed) {
          fn()
          return
        }
        unlisten = fn
      })
      .catch(() => {
        // ドロップを受けられなくても他の動線（@ ボタン）は生きている。
        // ここで画面を汚さない
      })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])
```

- [ ] **Step 5: ペインの枠を強調する**

`<aside ref={terminalPaneRef} …>` の `className` を差し替える:

```tsx
              className={`${paneOpen ? 'flex' : 'hidden'} shrink-0 flex-col border-l ${
                dropActive ? 'border-ink' : 'border-rule'
              }`}
```

- [ ] **Step 6: 緑を確かめる**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

**自動テストは足さない。** 位置判定は `getBoundingClientRect` と
`devicePixelRatio` に依存し、jsdom ではどちらも実体が無いため、書いても必ず通る
だけのテストになる（M11 で削除した「はみ出しは守られている」テストと同じ形）。
Task 10 の実機確認 #4・#5 で見る。

- [ ] **Step 7: コミット**

```bash
git add src/App.tsx
git commit -m "feat(m28): エクスプローラから落としたファイルをペインへ渡す"
```

---

### Task 10: 実機確認と文書の更新

**Files:**
- Create: `docs/history/m28-core-claude-pane-handoff.md`
- Modify: `docs/open-issues.md`, `docs/overview-rev.md`

**Interfaces:**
- Consumes: Task 1〜9 すべて
- Produces: なし

- [ ] **Step 1: 緑をすべて確かめる**

```bash
npm test && npx tsc -b && npm run lint
cd src-tauri && cargo test && cd ..
```
Expected: すべて PASS（Rust は触っていないが、`CLAUDE.md` の手順どおり回す）

- [ ] **Step 2: 実機で確認する（人間が行う）**

`npm run tauri dev` で起動し、`sample-project` を開いて次を順に見る。
**サブエージェントは Tauri の GUI を操作できないので、ここは人間の作業。**

| # | 確かめること | ダメだったときの手 |
| --- | --- | --- |
| 1 | ファイルを選んでペインを開くと、入力欄に `@…` が入って**消えていない** | `spawn` 解決直後ではなく「最初の出力から N ms 静穏」で差し込む形へ差し替える |
| 2 | その `@…` がファイル検索のポップアップに食われず、そのまま文字列として残る | `fileReference` から `@` を外し、素の相対パスにする |
| 3 | 端末で右クリック → **OS のメニューが出ない**。選択ありでコピー、無しで貼り付け | — |
| 4 | エクスプローラからペインへドロップ → 参照が入る。**ドラッグ中に枠が強調される** | `devicePixelRatio` の換算式を実測に合わせる |
| 5 | 複数ファイルを一度に落とす → スペース区切りで全部入る | — |
| 6 | 日本語を含むテキストを右クリックで貼り付けても化けない | — |
| 7 | 一覧の `@` ボタンを押しても**選択中のファイルが変わらない** | — |
| 8 | ペインを畳んだ状態で `@` ボタン → ペインが開いてタブが立ち、参照が入る | — |
| 9 | タブバーで右クリック → メニューは出ないが**何も起きない** | — |
| 10 | エディタ側のテキスト欄で右クリック → **OS のメニューは今までどおり出る** | — |

- [ ] **Step 3: 実機確認の痕跡を捨てる**

`CLAUDE.md` の後片付けの手順1（`sample-project/` は追跡対象なので必ず戻す）:

```bash
git checkout -- sample-project/ && git clean -fdx sample-project/
git status --short   # 空になること
```

- [ ] **Step 4: 申し送りを書く**

`docs/history/m28-core-claude-pane-handoff.md` を新規作成。**実装・レビュー・実機確認で
新たに確定した事実だけ**を書く（設計文書の再掲はしない）。最低限これらを含める:

- 実機確認 #1・#2 の結果——**差し込みのタイミングと `@` の扱いが最終的にどう決まったか**
- ドロップは**ペインが見えているときだけ**受ける（畳んでいると矩形が 0 になり外と判定される）という、設計 §6.4 から動いた点。**`@` ボタンは畳んでいても効く**ので、2つの動線で挙動が違うことになった理由も添える
- App レベルの DOM テスト（Task 8 Step 1）で `pasted` という共有配列を xterm のモックに足したこと——**`new Terminal()` がタブごとに別のオブジェクトを返す**ため、外から差し込みを観測する口が他に無かった
- `capabilities/default.json` の `description` を書き換えたこと（「読み取り権限は与えない」が HTML 限定になった）
- 実機確認で見つかった欠陥があればその原因と直し方

- [ ] **Step 5: `open-issues.md` を更新する**

冒頭の要約（「最終更新: … **消したのは N 件・足したのは N 件・書き換えたのは N 件**」）を
**必ず本文と揃える**。足す候補:

- 実機確認 #1・#2 の結果によっては、差し込みの安定性が Claude Code の版に依存しうること
- **エクスプローラからのドロップにテストが1本も無いこと**（位置判定が `getBoundingClientRect` と `devicePixelRatio` に依存し、jsdom では実体が無い。Task 9 Step 6）
- 右クリックの「既定メニューが実際に消える」ことを守っているのは実機確認だけで、テストは `preventDefault` が呼ばれたことしか見ていないこと

- [ ] **Step 6: `overview-rev.md` へ反映する**

- **4章**: 端末ペインへファイル参照を渡す動線があること。**渡すのは参照だけで、facet は
  ファイルの中身も会話も読まない**こと（既存の「AI はアプリに組み込まない」の例外記述の隣）
- **10章**: 操作言語の境界へ、**ペイン内の右クリックは facet が握る**ことを追加
  （既存の「端末ペインは操作言語の管轄外」の隣。既定メニューを止める範囲はペインの中だけで、
  エディタ側では OS のメニューが残る）

**TODO として申し送りに残さないこと**（M4 の教訓。次の計画者は rev を「正」として読む）。

- [ ] **Step 7: コミットして PR を出す**

```bash
git add docs/
git commit -m "docs(m28): 申し送り・残件・rev への反映"
git push -u origin worktree-m28-claude-pane-handoff
gh pr create --title "M28: Claude Code ペインへのファイル受け渡しと右クリック" --body "..."
```

---

## 実装順の依存

```
Task 1（参照文字列）─┐
Task 2（台帳）───────┼─▶ Task 3（TerminalTab 差し込み）─▶ Task 4（Pane 中継）─┐
                     │                                                        ├─▶ Task 8（App 配線）─▶ Task 9（ドロップ）─▶ Task 10
Task 5（クリップボード）──────────────────────▶ Task 6（右クリック）─────────┤
Task 7（一覧の @ ボタン。独立）────────────────────────────────────────────┘
```

Task 5 と Task 7 は他と独立しているので、並行して進めてよい。
