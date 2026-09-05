# M32 コードのコメントから経緯を落とす 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/`・`src-tauri/src/`・`scripts/`・`.claude/skills/` のコメントとテスト名から、マイルストーン番号・出典が人であること・変更前の状態を落とし、理由と罠だけを現在形で残す。挙動は変えない。

**Architecture:** コメントとテスト名だけの変更。「コメント以外が変わっていない」ことと「経緯の語が残っていない」ことを、リポジトリに一時的に置く検査スクリプト `scripts/m32-check.mjs` で機械的に確かめる。領域ごとに1タスクとし、タスク間でファイルが重ならないようにする。

**Tech Stack:** Node（検査スクリプト）、vitest、tsc、oxlint、cargo。新しい依存は入れない。

**Spec:** `docs/superpowers/specs/2026-09-06-m32-comment-history-cleanup-design.md`

## Global Constraints

- **コメントとテスト名（`describe` / `it` / `test` の第1引数）以外を変えない。** 空行の増減とコメント行の削除はよいが、コード行の並び替え・整形・改名はしない
- **削るのは経緯だけ。** マイルストーン番号（`M5`・`issue-tree-m3`・`sequence M3`・`m5` 等）、「レビュー指摘」「依頼者の指示」「実機修正」「実機確認で足した」の出典、「以前は」「当初は」「M24 より前は」「320 → 360」の変更前の状態、「〜で確定」「申し送り」「フォローアップ」「残件から落とした」の記録
- **理由と罠は残す。** いまの値・構造の理由、踏むと壊れる罠、不変条件、参照先（`rev N章`・design-notes の論点番号・ファイル名・テスト名）は消さない。判断に迷う文は残す
- **書き換えは現在形。** 罠は「当初 X していたため Y を取り逃がした」でなく「X を条件にすると Y を取り逃がす」の形にする。「以前は A だったが今は B」は B の理由だけ残す
- **`M8 決定2` のようなスペックの決定番号は番号だけ落とし、文は残す。** 中身を補うために古いスペックを読みに行かない。理由の補強とコメントの新規追加は対象外
- **削って残った文が理由も罠も言っていなければ、コメントごと消す。** 「（M19）」だけの JSDoc は1行の要約として残してよい
- **文書の書き方を継承する。** 現在形。経緯・マイルストーン番号・日付を書かない。全角括弧の入れ子を作らない。二倍ダッシュ（`——`）と太字は、書き換えた文の中でだけ整える
- **対象外**: `docs/`・`*.md`・`sample-project/`・`schemas/`・`src/core/reading-guide.md`・`.claude/skills/*/SKILL.md`・`generated/` 配下
- **各タスクは自分の領域のファイルだけを触る。** 他のタスクの領域に気付いた経緯は、報告に書くだけで直さない
- **検証コマンドの出力を報告に貼る。** 「確認した」だけの報告は不可

---

### Task 1: 規則と検査を置き、小さい領域で手順を一巡する

**Files:**
- Modify: `CLAUDE.md`（「文書の書き方」の直後に節を足す）
- Create: `scripts/m32-check.mjs`（Task 6 で消す）
- Modify: `src-tauri/src/lib.rs`, `scripts/gen-fonts-css.mjs`, `scripts/gen-skills.mjs`, `scripts/make-latest-json.mjs`, `.claude/skills/palette-retheme/scripts/palette-fit.mjs`

**Interfaces:**
- Produces: `node scripts/m32-check.mjs candidates [paths...]`（経緯の語を含む行を列挙。HARD が 0 行なら exit 0）と `node scripts/m32-check.mjs code [paths...]`（`origin/main` と比べ、コメントとテスト名以外に差が無ければ exit 0）。Task 2〜6 がこの2つを使う

- [ ] **Step 1: `CLAUDE.md` に「コードのコメントの書き方」を足す**

「## 文書の書き方」の節の直後、「## マイルストーン完了時に触る2箇所」の前に次を挿入する。

```markdown
## コードのコメントの書き方

- コメントは「いまの値・構造の理由」と「踏むと壊れる罠」を現在形で書く。マイルストーン番号・レビュー指摘・依頼者の指示・変更前の状態・「〜で確定した」の記録は書かない。経緯は git のコミットと PR にある
- 罠は「当初 X していたため Y を取り逃がした」ではなく「X を条件にすると Y を取り逃がす」の形で書く
- テストの名前も同じ規則に従う。番号ではなく、守っている性質を名前にする
```

「## 計画とレビュー」の1行目「レビューは文書の差分に対して…」の直後に、次の1行を足す。

```markdown
- コメントの差分にも同じ観点を当てる。経緯を足していたら落とす
```

- [ ] **Step 2: 検査スクリプトを置く**

`scripts/m32-check.mjs` を次の内容で作る。**heredoc ではなく Write ツールで書く**（worktree 隔離が、`git` を含む複合コマンドを拒むため）。

```js
// M32 の機械検査。worktree の直下で `node scripts/m32-check.mjs [candidates|code] [paths...]` と呼ぶ。
//   candidates: 経緯の語を含む行を列挙する（HARD は最終的に 0 行、soft は目視で判断）
//   code:       origin/main との差分のうち、コメントとテスト名以外に変更が無いことを確かめる
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const SELF = 'scripts/m32-check.mjs'
const SCOPE = ['src', 'src-tauri/src', 'scripts', '.claude/skills']
const EXT = /\.(ts|tsx|rs|mjs)$/
const [mode = 'candidates', ...paths] = process.argv.slice(2)
const targets = paths.length ? paths : SCOPE

const vcs = (...args) => execFileSync('git', args, { encoding: 'utf8' })
const tracked = vcs('ls-files', '--', ...targets)
  .split('\n')
  .filter((f) => f !== SELF && EXT.test(f) && !/\/generated\//.test(f))

// 採番はコメントとテスト名から消す。識別子（step_Ef7zM3pS6t・COM1）は境界で除く
const HARD = [
  /(^|[^A-Za-z0-9_])(M[0-9]+|(issue-tree|logic-tree|sequence)-m[0-9]+)(?![A-Za-z0-9_])/,
  /レビュー(指摘|で|の|:|：|\)|）)|依頼者|申し送り|フォローアップ|残件から|踏んだ罠|で確定|で決定|実機修正/,
]
// 現在形の文にも出うる語。列挙だけして、残すかは読んで決める
const SOFT = /当初|以前|かつて|元々|もともと|変更前|実機確認|→ ?[0-9]+|に伸ばし|から分離|へ引き上げ|へ下が|へ移し|に移した|一本化した/

if (mode === 'candidates') {
  let hard = 0
  let soft = 0
  for (const f of tracked) {
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (HARD.some((re) => re.test(line))) {
        hard++
        console.log(`HARD ${f}:${i + 1}: ${line.trim()}`)
      } else if (SOFT.test(line)) {
        soft++
        console.log(`soft ${f}:${i + 1}: ${line.trim()}`)
      }
    })
  }
  console.log(`\nhard=${hard} soft=${soft}`)
  process.exit(hard === 0 ? 0 : 1)
}

if (mode === 'code') {
  // src/styles/conventions.test.ts の stripComments と同じ規則。JSX の `{/* */}` の殻も落とす
  const strip = (s) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\{\s*\}/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
  const TEST_TITLE = /^(describe|it|test)(\.(each|skip|only|todo))?\(/
  const changed = vcs('diff', '--name-only', 'origin/main', '--', ...targets)
    .split('\n')
    .filter((f) => f && f !== SELF && EXT.test(f))
  let bad = 0
  for (const f of changed) {
    let before
    try {
      before = strip(vcs('show', `origin/main:${f}`))
    } catch {
      console.log(`NEW  ${f}: origin/main に無い（新規ファイルは本計画の対象外）`)
      bad++
      continue
    }
    const after = strip(readFileSync(f, 'utf8'))
    if (before.length !== after.length) {
      console.log(`BAD  ${f}: コメント以外の行数が ${before.length} → ${after.length}`)
      const n = Math.min(before.length, after.length)
      for (let i = 0; i < n; i++) {
        if (before[i] !== after[i]) {
          console.log(`     最初の差: ${before[i]}\n            → ${after[i]}`)
          break
        }
      }
      bad++
      continue
    }
    for (let i = 0; i < before.length; i++) {
      if (before[i] === after[i]) continue
      if (TEST_TITLE.test(before[i]) && TEST_TITLE.test(after[i])) continue
      console.log(`BAD  ${f}: コード行が変わっている\n     ${before[i]}\n   → ${after[i]}`)
      bad++
    }
  }
  console.log(`\nchanged=${changed.length} bad=${bad}`)
  process.exit(bad === 0 ? 0 : 1)
}
```

- [ ] **Step 3: 検査が変更前の木で通ることを確かめる**

Run: `node scripts/m32-check.mjs code`
Expected: 末尾が `changed=0 bad=0`

Run: `node scripts/m32-check.mjs candidates | tail -1`
Expected: `hard=547 soft=131`（`origin/main` の時点の値。多少ずれてもよいが、桁が違えば SCOPE か正規表現を疑う）

- [ ] **Step 4: 検査が壊れたら赤くなることを確かめる**

`src/core/today.ts` の末尾にコード行 `const __m32 = 1` を1行足す（コメントではなくコードを足すのが要点）。

Run: `node scripts/m32-check.mjs code src/core/today.ts`
Expected: `BAD  src/core/today.ts: コメント以外の行数が N → N+1` と `bad=1`

足した行を消す。

Run: `node scripts/m32-check.mjs code src/core/today.ts`
Expected: `changed=0 bad=0`

- [ ] **Step 5: 小さい領域の候補を列挙する**

Run: `node scripts/m32-check.mjs candidates src-tauri/src scripts .claude/skills`
Expected: HARD が 7 行前後（`lib.rs` 3・`make-latest-json.mjs` 2・`gen-skills.mjs` 1・`gen-fonts-css.mjs` 1・`palette-fit.mjs` 1）。soft は `new-id.mjs` の「→ 5件」のような使い方の例で、これは現在形なので残す

- [ ] **Step 6: 候補行を書き換える**

各行を開き、Global Constraints の規則で書き換える。この領域の実例:

```
// 前
/// クリップボードの HTML を読む（logic-tree M3）。
// 後
/// クリップボードの HTML を読む。

// 前
// 自動アップデート（M19）。**デスクトップ限定のプラグインなので分けてある。**
// 後
// 自動アップデート。**デスクトップ限定のプラグインなので分けてある。**

// 前
// **mac は載せない**（M19 のスコープ。載せると未署名の .app が配られる）
// 後
// **mac は載せない**（載せると未署名の .app が配られる）

// 前
/// 最終ブランチレビューで見つかった欠陥への防御——tauri-2.11.5 の scope 実装は
// 後（「レビューで見つかった」を落とし、罠の中身から始める）
/// tauri-2.11.5 の scope 実装は
```

`gen-skills.mjs` の「（logic-tree-m2 で確立した理屈）」は括弧ごと落とす。理屈そのものは直前の文にある。

- [ ] **Step 7: 検査を通す**

Run: `node scripts/m32-check.mjs candidates src-tauri/src scripts .claude/skills | tail -1`
Expected: `hard=0 soft=N`（soft の各行を読み、現在形でない行が無いこと）

Run: `node scripts/m32-check.mjs code src-tauri/src scripts .claude/skills`
Expected: `bad=0`

Run: `npm run lint && npx vitest run scripts`
Expected: 緑

Run: `cd src-tauri && cargo test`
Expected: 緑

- [ ] **Step 8: コミット**

```bash
git add CLAUDE.md scripts/m32-check.mjs src-tauri/src scripts .claude/skills
git commit -m "docs(m32): コードのコメントの規則を CLAUDE.md に置き、検査と小領域の書き換えを入れる"
```

---

### Task 2: `src/core`・`src/fs`・`src/styles`・`src/lib`・`src/` 直下のテスト

**Files:**
- Modify: `src/core/**`（`app-controller.ts` 33 行・`app-controller.test.ts` 13 行・`list-editor/` 13 行・`canvas/` 8 行・`registry.ts` 7 行・`skill-sync.ts` 6 行、ほか各 1〜5 行）
- Modify: `src/fs/**`（`clipboard.ts` 4 行、ほか各 1 行）
- Modify: `src/styles/**`（`palette-requirements.ts` 11 行・`conventions.test.ts` 11 行・`contrast.ts` 3 行、ほか各 1〜2 行）
- Modify: `src/smoke.test.ts`, `src/modules/index.test.ts`（各 1 行）

**Interfaces:**
- Consumes: Task 1 の `scripts/m32-check.mjs` と `CLAUDE.md` の規則

- [ ] **Step 1: 候補を列挙する**

Run: `node scripts/m32-check.mjs candidates src/core src/fs src/styles src/lib src/smoke.test.ts src/modules/index.test.ts > ../m32-task2.txt; tail -1 ../m32-task2.txt`
Expected: `hard=` が 150 行前後

- [ ] **Step 2: ファイルごとに書き換える**

HARD の行を全部、soft の行は過去の状態か出典を述べているものだけ書き換える。この領域の実例:

```ts
// 前（src/core/keyboard/ime.ts）
// 当初 `elapsed >= 0` を条件にしていたためにこの尾を取り逃がしていた。
// **「後に届いたのだから時刻も後」と決めつけないこと**（この欠陥の実物）
// 後
// `elapsed >= 0` を条件にするとこの尾を取り逃がす。
// **「後に届いたのだから時刻も後」と決めつけないこと**

// 前（src/core/app-controller.ts の冒頭 JSDoc）
 * **なぜ切り出したか**: M4・M5 の最終レビューが見つけた配線バグはほぼすべて
 * `App.tsx`——リポジトリで唯一自動テストが無いファイル——にあった。M5 では
 * 判断（`planExternalChange`）をコアへ出したが、残っていたのは**順序**
 *（dispose → 一覧差し替え → 通知/ダイアログ → saver 張り直し）であり、
 * それは純関数では表現できない。ここが「順序をテストで固定する」場所である。
// 後
 * **なぜ切り出したか**: 判断（`planExternalChange`）は純関数だが、**順序**
 *（dispose → 一覧差し替え → 通知/ダイアログ → saver 張り直し）は純関数では
 * 表現できない。`App.tsx` には自動テストが無いので、順序はここでテストに固定する。

// 前
      // 一部でも読めなければ入れ替えない（途中失敗で新旧が混ざった状態を作らない。M1 で確定）
// 後
      // 一部でも読めなければ入れ替えない（途中失敗で新旧が混ざった状態を作らない）

// 前（src/core/app-controller.test.ts）
  it('走査時のキャッシュではなくディスクから読み直す（M1 で確定した原則）', async () => {
// 後
  it('走査時のキャッシュではなくディスクから読み直す', async () => {

// 前（src/core/list-editor/cell-face.ts）
 * 淡い面は M21 の実機確認で足した——1px の輪郭だけでは、テーブルのセルが
// 後
 * 淡い面を足すのは、1px の輪郭だけでは、テーブルのセルが

// 前（src/styles/contrast.ts）
 * 依存を足さない方針（M7 設計スペック 決定4）のため、oklch → 線形 sRGB →
// 後
 * 依存を足さない方針のため、oklch → 線形 sRGB →
```

`src/core/history.ts` と `src/App.tsx` にある「それ以前への復帰は Git の担当」は現在形なので残す（soft に出るが対象外）。

- [ ] **Step 3: 検査を通す**

Run: `node scripts/m32-check.mjs candidates src/core src/fs src/styles src/lib src/smoke.test.ts src/modules/index.test.ts | tail -1`
Expected: `hard=0`

Run: `node scripts/m32-check.mjs code src/core src/fs src/styles src/lib src/smoke.test.ts src/modules/index.test.ts`
Expected: `bad=0`

Run: `npx vitest run src/core src/fs src/styles src/smoke.test.ts src/modules/index.test.ts`
Expected: 緑

- [ ] **Step 4: コミット**

```bash
git add src/core src/fs src/styles src/lib src/smoke.test.ts src/modules/index.test.ts
git commit -m "refactor(m32): core・fs・styles のコメントから経緯を落とす"
```

---

### Task 3: `src/components`・`src/App.tsx`・`src/App.dom.test.tsx`

**Files:**
- Modify: `src/App.dom.test.tsx`（41 行）, `src/App.tsx`（35 行）
- Modify: `src/components/**`（`TerminalTab.tsx` 13 行・`TerminalTab.dom.test.tsx` 9 行・`CellInput.tsx` 8 行・`TerminalPane.tsx` 6 行・`ChoiceDialog.tsx` 6 行・`FileList.tsx` 5 行、ほか各 1〜4 行）

**Interfaces:**
- Consumes: Task 1 の `scripts/m32-check.mjs` と `CLAUDE.md` の規則

- [ ] **Step 1: 候補を列挙する**

Run: `node scripts/m32-check.mjs candidates src/components src/App.tsx src/App.dom.test.tsx > ../m32-task3.txt; tail -1 ../m32-task3.txt`
Expected: `hard=` が 160 行前後

- [ ] **Step 2: ファイルごとに書き換える**

HARD の行を全部、soft の行は過去の状態か出典を述べているものだけ書き換える。この領域の実例:

```tsx
// 前（src/components/ToolbarButton.tsx）
 * 額縁の出力ボタン（ExportMenu・表形式でコピー・Miro 交換）の共通の土台
 *（M29 フォローアップ。人間が実機を触って「どのボタンがいま使えるのか、
 * なぜ押せないのかが分からない」と指摘したことに端を発する）。
// 後
 * 額縁の出力ボタン（ExportMenu・表形式でコピー・Miro 交換）の共通の土台。
 * 「どのボタンがいま使えるのか、なぜ押せないのか」を画面で答えるための部品。

// 前（同ファイル）
 * 名指しで上書きしないと `border-rule-muted` を書いた意味が消える
 *（レビュー指摘。M27 の暗い配色を回さずに気付けなかった）。
// 後
 * 名指しで上書きしないと `border-rule-muted` を書いた意味が消える。

// 前（src/components/Toast.tsx）
 * **時間では消えない。閉じるまで残す。** 当初は操作の付かない通知だけ6秒で
 * 自動消去していたが、実機確認で「外部変更のトーストを見逃したのか、
 * そもそも出ていないのか」が区別できず、検証の妨げになった。会議中に画面から
// 後
 * **時間では消えない。閉じるまで残す。** 自動で消すと「外部変更のトーストを
 * 見逃したのか、そもそも出ていないのか」が区別できない。会議中に画面から

// 前（同ファイル）
 * 「生成物は手で整形しない」というリポジトリの規約と衝突する（M5 で確定）。
 * 見た目は既存の役割トークンの流用で仮置き。確定は M7
// 後
 * 「生成物は手で整形しない」というリポジトリの規約と衝突する。

// 前（src/components/IssueBanner.tsx）
 * M14 以前は4つのエディタと額縁の計5箇所が同じ `<ul>` を持っており、
 * 面も余白もばらついていた。さらにキャンバス系（シーケンス・ロジックツリー）は
 * 絶対配置の帯の中に置いていたため、指摘が増えるほど図を覆った。
 * ここに一本化し、通常フローに置くことで「増えたぶんキャンバスが下がる」に変わる
// 後
 * 各エディタが自前の `<ul>` を持つと面も余白もばらつき、キャンバス系で
 * 絶対配置の帯に置くと指摘が増えるほど図を覆う。ここに一本化して通常フローに
 * 置くので、増えたぶんキャンバスが下がる

// 前（src/components/FileList.tsx の JSX コメント）
      {/* Claude Code へ渡す（M28）。**選択状態は動かさない**——編集中のファイルを
// 後
      {/* Claude Code へ渡す。**選択状態は動かさない**——編集中のファイルを

// 前（src/App.dom.test.tsx）
describe('表形式でコピー（M29）', () => {
// 後
describe('表形式でコピー', () => {

// 前（src/components/TableCopyDialog.dom.test.tsx）
describe('TableCopyDialog: 閉じ方と二重発火（M4 の罠）', () => {
// 後
describe('TableCopyDialog: 閉じ方と二重発火', () => {

// 前（src/components/TerminalTab.dom.test.tsx）
  describe('起動時の差し込み（M28 実機修正: 2004 かつ出力が静まってから流す）', () => {
// 後
  describe('起動時の差し込み（2004 かつ出力が静まってから流す）', () => {
```

`src/App.tsx` 157 行目付近の「（レビューの前提は測って訂正した）。レビューは…」は、レビューの誤った前提を述べる部分を落とし、測った結果として分かっている経路の説明だけ残す。

- [ ] **Step 3: 検査を通す**

Run: `node scripts/m32-check.mjs candidates src/components src/App.tsx src/App.dom.test.tsx | tail -1`
Expected: `hard=0`

Run: `node scripts/m32-check.mjs code src/components src/App.tsx src/App.dom.test.tsx`
Expected: `bad=0`

Run: `npx vitest run src/components src/App.dom.test.tsx`
Expected: 緑

- [ ] **Step 4: コミット**

```bash
git add src/components src/App.tsx src/App.dom.test.tsx
git commit -m "refactor(m32): components・App のコメントから経緯を落とす"
```

---

### Task 4: `src/modules/issue-tree`・`src/modules/logic-tree`

**Files:**
- Modify: `src/modules/issue-tree/**`（68 行。`layout.ts`・`measure.ts`・`IssueTreeEditor.tsx`・`IssueBox.tsx`・`IssueTreeEditor.dom.test.tsx`・`layout.test.ts` が大半）
- Modify: `src/modules/logic-tree/**`（29 行）

**Interfaces:**
- Consumes: Task 1 の `scripts/m32-check.mjs` と `CLAUDE.md` の規則

- [ ] **Step 1: 候補を列挙する**

Run: `node scripts/m32-check.mjs candidates src/modules/issue-tree src/modules/logic-tree > ../m32-task4.txt; tail -1 ../m32-task4.txt`
Expected: `hard=` が 100 行前後

- [ ] **Step 2: ファイルごとに書き換える**

HARD の行を全部、soft の行は過去の状態か出典を述べているものだけ書き換える。この領域の実例:

```ts
// 前（src/modules/issue-tree/measure.ts の BOX_WIDTH）
 * 課題の箱の幅（**固定。導出しない**）。**M24 で全種類の箱に広がった。**
 *
 * 箱の中には課題の文言と仮説の行という**性質の違う文章が縦に積まれる**ので、
 * 一番長い行に幅を合わせると、短い課題と長い課題で箱幅がばらつき、木が
 * 階段状に見える。シーケンスがガター幅を導出しないと決めた（design-notes
 * 論点7）のと同じ判断。
 *
 * **M24 より前、仮説も見送りも持たない箱だけはタイトルの自然幅だった。**
 * その結果、同じ列の中で右上のバッジの右端が散り、「どれが未決か」を知るには
 * 全ノードを個別に読む必要があった（rev 9章 D3 rev.3 ＝ スキャン性）。
 * いまは例外なくこの幅で、**バッジは列ごとに縦一列に揃う。**
 *
 * **値は 360 で、ロジックツリーのノード（`NODE_WIDTH`＝320）とは違う。**
 * m5 で旗のトグルが2つ（見送り／解決）になり、タイトルの右に空ける枠が
 * 広がってタイトルが 200 → 164px に痩せたので、依頼者の指示で箱の側を
 * 伸ばした（タイトルは 204px 前後に戻る）。
 *
 * **3つを共有定数に束ねていない理由は生きている**——`NODE_WIDTH`（320）は
 * 固定、シーケンスの `LABEL_MAX_WIDTH`（320）は**上限**であって固定では
 * ない。意味が違うものを1つの定数にすると、片方の事情で動かしたとき
 * （まさに今回がそれ）に無関係な図まで一緒に動く
// 後
 * 課題の箱の幅（**固定。導出しない**）。全種類の箱に共通。
 *
 * 箱の中には課題の文言と仮説の行という**性質の違う文章が縦に積まれる**ので、
 * 一番長い行に幅を合わせると、短い課題と長い課題で箱幅がばらつき、木が
 * 階段状に見える。シーケンスがガター幅を導出しないと決めた（design-notes
 * 論点7）のと同じ判断。
 *
 * 仮説も見送りも持たない箱をタイトルの自然幅にすると、同じ列の中で右上の
 * バッジの右端が散り、「どれが未決か」を知るには全ノードを個別に読む必要が
 * 出る（rev 9章 D3 rev.3 ＝ スキャン性）。例外なくこの幅にするので、
 * **バッジは列ごとに縦一列に揃う。**
 *
 * **値は 360 で、ロジックツリーのノード（`NODE_WIDTH`＝320）とは違う。**
 * 旗のトグルが2つ（見送り／解決）あり、タイトルの右に空ける枠が広い分を
 * 箱の側で吸収する（タイトルは 204px 前後）。
 *
 * **3つを共有定数に束ねない**——`NODE_WIDTH`（320）は固定、シーケンスの
 * `LABEL_MAX_WIDTH`（320）は**上限**であって固定ではない。意味が違うものを
 * 1つの定数にすると、片方の事情で動かしたときに無関係な図まで一緒に動く

// 前（src/modules/issue-tree/measure.ts の EXPANDED_BOX_WIDTH）
 * ままでは1行が細くなりすぎる。**m5 で `BOX_WIDTH` が 320 → 360 に伸びた
 * ときも、この値は動かしていない**（依頼者の指示は畳んだ箱の側だけ）。
// 後
 * ままでは1行が細くなりすぎる。**`BOX_WIDTH` とは独立に決める。**

// 前（src/modules/logic-tree/LogicTreeEditor.dom.test.tsx）
// ここに戻すと件数が増えるほど木の上部を覆う——それが M14 で直した欠陥
// 後
// ここに戻すと件数が増えるほど木の上部を覆う

// 前（src/modules/logic-tree/LogicTreeEditor.font.dom.test.tsx）
 * **観測点はノード矩形の `style.height` である（M24 で幅から移した）。**
 * ノードの幅は M24 で固定（`NODE_WIDTH`）になったので、測定器を差し替えても
// 後
 * **観測点はノード矩形の `style.height` である。**
 * ノードの幅は固定（`NODE_WIDTH`）なので、測定器を差し替えても

// 前
  it('IME 変換中の Enter ではノードが増えない（M1 の最重要要件）', () => {
// 後
  it('IME 変換中の Enter ではノードが増えない', () => {
```

- [ ] **Step 3: 検査を通す**

Run: `node scripts/m32-check.mjs candidates src/modules/issue-tree src/modules/logic-tree | tail -1`
Expected: `hard=0`

Run: `node scripts/m32-check.mjs code src/modules/issue-tree src/modules/logic-tree`
Expected: `bad=0`

Run: `npx vitest run src/modules/issue-tree src/modules/logic-tree`
Expected: 緑

- [ ] **Step 4: コミット**

```bash
git add src/modules/issue-tree src/modules/logic-tree
git commit -m "refactor(m32): issue-tree・logic-tree のコメントから経緯を落とす"
```

---

### Task 5: `src/modules/sequence`・`src/modules/glossary`・`src/modules/error-catalog`

**Files:**
- Modify: `src/modules/sequence/**`（60 行。`SequenceEditor.tsx`・`ActorRefCell.tsx`・`ActorRefCell.dom.test.tsx` が大半）
- Modify: `src/modules/glossary/**`（37 行）
- Modify: `src/modules/error-catalog/**`（24 行）

**Interfaces:**
- Consumes: Task 1 の `scripts/m32-check.mjs` と `CLAUDE.md` の規則

- [ ] **Step 1: 候補を列挙する**

Run: `node scripts/m32-check.mjs candidates src/modules/sequence src/modules/glossary src/modules/error-catalog > ../m32-task5.txt; tail -1 ../m32-task5.txt`
Expected: `hard=` が 120 行前後

- [ ] **Step 2: ファイルごとに書き換える**

HARD の行を全部、soft の行は過去の状態か出典を述べているものだけ書き換える。この領域の実例:

```tsx
// 前（src/modules/sequence/ActorRefCell.tsx）
 * from / to のアクター参照セル（sequence M3 で選択専用にした）。
// 後
 * from / to のアクター参照セル（選択専用）。

// 前（同ファイル。M1 の実機確認チェックリストに言及する段落）
 * **マウスはメニュー、キーボードは ↑↓ の即時切替。** M1 の「頭文字の
 * …
 * 受けて外した。M1 の実機確認チェックリスト自体が「『決』＋Enter でアクター
// 後（頭文字入力を採らない理由だけを現在形で残す。チェックリストへの言及は落とす）
 * **マウスはメニュー、キーボードは ↑↓ の即時切替。** 頭文字の入力で
 * 選ぶ方式は採らない: …

// 前（src/modules/glossary/AliasCell.tsx）
// focus:bg-surface ではなくリングを使う（M8 修正3）
// 後
// focus:bg-surface ではなくリングを使う

// 前（src/modules/error-catalog/ErrorCatalogEditor.tsx）
 * 列の境界の縦罫。先頭列（No）には引かない（M8 決定2）。
// 後
 * 列の境界の縦罫。先頭列（No）には引かない。

// 前（src/modules/glossary/GlossaryEditor.dom.test.tsx）
//（参照比較の事故と同じ壊れ方。M3 の申し送り）
// 後
//（参照比較の事故と同じ壊れ方）

// 前（src/modules/sequence/ActorRefCell.dom.test.tsx）
describe('ActorRefCell: キーボード（M2 までと同じ）', () => {
// 後
describe('ActorRefCell: キーボード', () => {

// 前（src/modules/error-catalog/ErrorCatalogEditor.dom.test.tsx）
describe('ErrorCatalogEditor: 表示中の行の報告（M29）', () => {
// 後
describe('ErrorCatalogEditor: 表示中の行の報告', () => {
```

- [ ] **Step 3: 検査を通す**

Run: `node scripts/m32-check.mjs candidates src/modules/sequence src/modules/glossary src/modules/error-catalog | tail -1`
Expected: `hard=0`

Run: `node scripts/m32-check.mjs code src/modules/sequence src/modules/glossary src/modules/error-catalog`
Expected: `bad=0`

Run: `npx vitest run src/modules/sequence src/modules/glossary src/modules/error-catalog`
Expected: 緑

- [ ] **Step 4: コミット**

```bash
git add src/modules/sequence src/modules/glossary src/modules/error-catalog
git commit -m "refactor(m32): sequence・glossary・error-catalog のコメントから経緯を落とす"
```

---

### Task 6: 最終検証と PR

**Files:**
- Delete: `scripts/m32-check.mjs`
- Modify: `docs/lessons-for-planning.md`（「テストの設計」の節に1行）

**Interfaces:**
- Consumes: Task 1〜5 のコミット

- [ ] **Step 1: 全体で検査を通す**

Run: `node scripts/m32-check.mjs candidates | tail -1`
Expected: `hard=0 soft=N`

Run: `node scripts/m32-check.mjs candidates | grep '^soft'`
Expected: 出た行を全部読む。過去の状態か出典を述べる行があれば、その領域の規則で書き換えて再実行する

Run: `node scripts/m32-check.mjs code`
Expected: `bad=0`。`changed=` は 150 前後

- [ ] **Step 2: 減った量を測る**

次を2行に分けて実行し、2行目の出力を PR 本文に貼る。

```bash
git ls-files 'src/**/*.ts' 'src/**/*.tsx' | grep -v '\.test\.' > ../m32-nontest.txt
cat $(cat ../m32-nontest.txt) | grep -E '^\s*(//|/\*|\*)' | wc -m
```

出力が変更後の非テストのコメント文字数。変更前はスペック2章の 262,645 で、この値と並べて PR 本文に書く。

- [ ] **Step 3: 検査スクリプトを消す**

Run: `git rm scripts/m32-check.mjs`

- [ ] **Step 4: 教訓を1行足す**

`docs/lessons-for-planning.md` の「## テストの設計」の末尾に足す。

```markdown
- コメントだけを変える計画は、コメントを剥がした行の列が変更前後で一致することを機械で確かめる（目視の diff は行の並び替えを見落とす）。
```

- [ ] **Step 5: 全体を緑にする**

Run: `npm test`
Expected: 緑（件数を報告に貼る）

Run: `npx tsc -b`
Expected: 出力なし

Run: `npm run lint`
Expected: 緑

Run: `cd src-tauri && cargo test`
Expected: 緑

- [ ] **Step 6: `docs/open-issues.md` を確かめる**

Run: `grep -nE 'コメント' docs/open-issues.md`
Expected: 本計画で解消した項目は無い（コメントの項目は載っていない）。足す項目も無い。変更しない

- [ ] **Step 7: コミットして PR を作る**

```bash
git add docs/lessons-for-planning.md
git commit -m "docs(m32): 検査スクリプトを消し、教訓を1行足す"
git push -u origin worktree-m32-comment-history-cleanup
```

PR 本文に書くこと: 目的（1段落）、Step 2 の文字数の前後、Step 5 の4コマンドの結果、`node scripts/m32-check.mjs` の最終出力（消す前の Step 1 の値）。人間に頼む実機確認は無い（挙動を変えないため）。

---

## Self-Review

- **Spec coverage**: スペック3章「削る／残す／書き換え方」は Global Constraints と各タスクの実例に対応する。4章の検証4項目は Task 1 Step 2〜4（検査の用意と赤化確認）、各タスク Step 3、Task 6 Step 1・2・5 に対応する。5章の対象外は Global Constraints に転記した
- **Placeholder scan**: 各タスクに実物からの書き換え例を載せた。「同様に」で他タスクを指す箇所は無い
- **Type consistency**: 検査の呼び名は `candidates` / `code` の2つ。パスは各タスクの Files と一致する
