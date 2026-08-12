# AI向け読み方ガイド（README-for-AI.md）同梱 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** facet がプロジェクトフォルダを開いたとき、AI がこのフォルダを仕様として正しく読むための静的ガイド `README-for-AI.md` をフォルダ直下にべき等に書き出す。

**Architecture:** Skill 同期（`src/core/skill-sync.ts` + `src/fs/skill-resources.ts` + `App.tsx` 配線）と同じ三層構成。コアに I/O 注入の純ロジック `syncReadingGuide`（3分岐: 無ければ書く／一致なら触らない／不一致なら上書き）、fs 層に Tauri 実装、App.tsx の `openFolder` 成功後に配線する。ガイド原本は `src/core/reading-guide.md` に置き、Vite の `?raw` import でバンドルへ取り込む。

**Tech Stack:** TypeScript / Vite（`?raw` import。`tsconfig.app.json`・`tsconfig.test.json` とも `"types": ["vite/client"]` 設定済みで型が通る）/ vitest / @tauri-apps/plugin-fs

**Spec:** `docs/superpowers/specs/2026-08-12-ai-reading-guide-design.md`

> **スペックからの変更が1点ある。** スペック設計2は「原本はアプリの resources に同梱（Skill 群と同じ場所）」としたが、本計画は **Vite の `?raw` import でバンドルに取り込む**方式に確定する。理由: (1) ガイドは単一のテキストファイルで、Skill 群のような「ディレクトリを再帰的に集めて置き直す」機構が不要 (2) `tauri.conf.json` の `bundle.resources` と定数の二重管理（`BUNDLED_SKILLS` が抱えている「一致していなければならない」制約）を増やさない (3) 内容が同期的に手に入るので比較・テストが単純になる。スペックの意図（原本がアプリと同じリポジトリ・同じバージョン管理下にあり、アプリが書き出す）は満たしている。この判断に疑義があれば実装前に報告すること。

## Global Constraints

- **計画のコードはレビューを通す前提の下書きである。** 指示が矛盾していたら辻褄を合わせず「計画の矛盾」として報告する。作業報告には検証コマンドの実行結果（出力）を貼る（`docs/lessons-for-planning.md` 大原則）
- 各タスクの最後に必ずフルスイートを回す: `npm test && npx tsc -b && npm run lint`（対象を絞らない）
- テストの期待値は「このファイルの `it` がすべて緑」。件数を書かない・数えない
- `src/` の `.ts`/`.tsx` に色値・フォントサイズを直書きしない（`src/styles/conventions.test.ts` が走査する。今回の新規ファイルに色を書く理由は無い）
- 改行は LF（`.gitattributes` が `* text=auto eol=lf`。ガイド原本 `.md` も LF で作る）
- `sample-project/` への変更（実機確認でアプリが書く `README-for-AI.md` を含む）は**コミットしない**（`CLAUDE.md`）
- コミットメッセージはリポジトリの流儀（`feat(scope): 日本語で〜する` / `docs(scope): 〜する`）に合わせる

## ファイル構成

| ファイル | 責務 |
| --- | --- |
| Create: `src/core/reading-guide.md` | ガイド原本（静的 Markdown。プロジェクトの中身を反映した動的な記述を含めない） |
| Create: `src/core/reading-guide.ts` | ファイル名定数・`ReadingGuideIo` 型・`syncReadingGuide`（I/O 注入の純ロジック） |
| Create: `src/core/reading-guide.test.ts` | 3分岐の単体テスト |
| Create: `src/fs/reading-guide-io.ts` | `ReadingGuideIo` の Tauri 実装 |
| Modify: `src/App.tsx` | `openFolder` 成功後の配線（2箇所の呼び出しを1つのヘルパに集約） |
| Modify: `src/App.dom.test.tsx` | 配線のテスト |
| Create: `docs/history/m12-core-reading-guide.md`（Task 5） | 申し送り |
| Modify: `docs/open-issues.md` / `docs/overview-rev.md`（Task 5） | 残件更新・rev 4章反映 |

---

### Task 1: ガイド原本とコアの同期ロジック

**Files:**
- Create: `src/core/reading-guide.md`
- Create: `src/core/reading-guide.ts`
- Test: `src/core/reading-guide.test.ts`

**Interfaces:**
- Consumes: なし（Vite の `?raw` import のみ）
- Produces: `READING_GUIDE_FILENAME: string`（= `'README-for-AI.md'`）／`READING_GUIDE_TEXT: string`（原本の全文）／`interface ReadingGuideIo { readText(path: string): Promise<string | null>; writeText(path: string, text: string): Promise<void>; join(...parts: string[]): Promise<string> }`（`readText` は**ファイルが無ければ null**）／`syncReadingGuide(projectDir: string, io: ReadingGuideIo): Promise<void>`

- [ ] **Step 1: ガイド原本を書く**

`src/core/reading-guide.md` を以下の内容で作る（LF、末尾改行あり）。**この本文は Task 4 の素読み比較実験で剪定される前提の初稿である**——各項目は「素の AI が読み違えそうな規約」だけを載せており、スキーマから自明なことは書いていない。

````markdown
# このフォルダの読み方（AI向け）

> このファイルは仕様整理ツール facet が自動で管理する。手で編集しても、次に facet がこのフォルダを開いたとき原本で上書きされる。プロジェクト固有の注意は別のファイルに書くこと。

このフォルダは仕様整理ツール facet のプロジェクトである。ここにある JSON ファイル群が仕様の正であり、人間はアプリで、AI はこのファイル群を直接読んで、同じ仕様を見る。

## ファイルの見つけ方

- ファイル名ではなく、中身の `type` フィールドで種類を判別する（ファイル名は自由）。種類は現在4つ: `glossary`（用語集）／`errorCatalog`（エラーカタログ）／`sequence`（シーケンス）／`logicTree`（ロジックツリー）
- `glossary` と `errorCatalog` はプロジェクトに**1ファイルずつ**しか存在しない。複数見つけたら異常状態なので、どちらが正かを人間に確認する。`sequence` と `logicTree` は何ファイルあってもよい
- 用語集は、他のファイルが ID で参照するハブである

## ID の読み方

- ID は `term_Ab3xYz9Qw2` のように「プレフィクス + 英数字10文字」で、プレフィクスが種類を示す: `term_`＝用語／`error_`＝エラー／`actor_`＝シーケンスの参加者／`step_`＝シーケンスのステップ／`node_`＝ロジックツリーのノード
- `term_` で始まる値を見たら、用語集ファイルの `terms[].id` で引いて名前と定義に解決する
- **存在しない ID を作らない。** ID を新しく振る必要があるときは、末尾「書き込みたくなったら」の手順に従う

## 最重要: 未決を埋めない

facet の核心は「決めていないことを消せなくする」ことである。データの空欄は欠落ではなく、**「まだ決めていない」という人間の意思表示**である。

- 空文字・`undecided`・（シーケンスの）`failures` のキー欠落は、すべて「未決」を意味する
- 仕様の要約・実装・質問への回答でこれらに触れるときは、**推測で補完せず「ここは未決」と明示的に扱う**。もっともらしく埋めた瞬間、「決めていないことが見える」という仕様データの価値が壊れる
- `undecided`（後で決める＝未決）と、`other` や `none`（検討した結果の確定）は**意味が逆**である。混同しない

## ツール別の読み方

### 用語集（type: glossary）

- `definition` が空文字の用語は「未定義」（未決）。`kind: undecided` は「種別を後で決める」（未決）
- `aliases` は表記ゆれの照合キー。会話や文書に `aliases` の語が出てきたら、その用語を指していると解釈する

### エラーカタログ（type: errorCatalog）

- `resolutionLevel` は「誰が解決するか」であって原因の分類ではない。`none`＝検討した上で誰にも解決できない（確定）／`undecided`＝まだ決めていない（未決）
- `userAction`・`supportAction`・`engineerAction` の空文字が「未記入」を意味するのは、`resolutionLevel` がその主体か `none` のときだけ。それ以外の空文字は「書く必要がないので空」である

### シーケンス（type: sequence）

- **異常系は矢印では描かれていない。** 各ステップの `failures`（「失敗したら？」の問い）が異常系の仕様である。`failed`＝失敗が確定したら／`unknown`＝結果が不明（タイムアウト等）だったら／`unknown.ifExecuted`＝不明だが実は実行済みだったら（冪等性）
- どの問いが立つかは `kind` と `awaitsReply` から決まる: `self`→`failed` のみ／`call` で `awaitsReply: true`→`failed` と `unknown`／`call` で `awaitsReply: false`→`unknown` のみ／`reply`→問い無し（応答の失敗は、対になる呼出側の `unknown` が扱う）
- `failures` にキーが無い問いは「未回答」（未決）。`decision: "notApplicable"` は「考慮不要と**決めた**」（確定）であり、未回答とは別物
- 参加者の `domain` は責任ドメイン。隣り合う参加者の `domain` が異なる位置に責任境界がある

### ロジックツリー（type: logicTree）

- `parentId` の連鎖が単一ルートの木を成す。`null` がルート
- `text` が空文字のノードは「未記入」（未決）

## 書き込みたくなったら

このフォルダの JSON を直接手で編集しない。`.claude/skills/` に登録用 Skill（glossary-term-register / error-catalog-register）があれば必ずそれを使う（ID 採番・スキーマ検証・正規形書き出しを通すため）。Skill が無い種類のファイルを編集する場合も、最低限次を守る: (1) ID は既存と同じ形式で、ランダムに振る（連番にしない） (2) 既存のキー順・インデント（半角スペース2）・末尾改行を保つ。
````

- [ ] **Step 2: 失敗するテストを書く**

`src/core/reading-guide.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  READING_GUIDE_FILENAME,
  READING_GUIDE_TEXT,
  syncReadingGuide,
  type ReadingGuideIo,
} from './reading-guide'

/** 書き込みを記録する偽 I/O。disk はガイドのパスに「今あるファイルの中身」（無ければ null） */
function fakeIo(disk: string | null) {
  const writes: Array<{ path: string; text: string }> = []
  const io: ReadingGuideIo = {
    readText: async () => disk,
    writeText: async (path, text) => {
      writes.push({ path, text })
    },
    join: async (...parts) => parts.join('/'),
  }
  return { io, writes }
}

describe('syncReadingGuide', () => {
  it('ファイルが無ければ原本を書く', async () => {
    const { io, writes } = fakeIo(null)
    await syncReadingGuide('/proj', io)
    expect(writes).toEqual([{ path: `/proj/${READING_GUIDE_FILENAME}`, text: READING_GUIDE_TEXT }])
  })

  it('中身が原本と一致していれば書かない（mtime を変えない）', async () => {
    const { io, writes } = fakeIo(READING_GUIDE_TEXT)
    await syncReadingGuide('/proj', io)
    expect(writes).toEqual([])
  })

  it('中身が原本と違えば（ユーザー編集・旧版）原本で上書きする', async () => {
    // 空文字ではなく「原本＋改変」にする——空文字は「無い」と紛れ、
    // missing 分岐と区別できない退化ケースになる（lessons: 隣の実装と同じ答えになる入力を選ばない）
    const { io, writes } = fakeIo(READING_GUIDE_TEXT + '\nユーザーの追記')
    await syncReadingGuide('/proj', io)
    expect(writes).toEqual([{ path: `/proj/${READING_GUIDE_FILENAME}`, text: READING_GUIDE_TEXT }])
  })
})

describe('READING_GUIDE_TEXT', () => {
  it('先頭に自動管理の注意書きがある（スペック設計2）', () => {
    // ガイド全文はテストで固定しない（本文は Task 4 の実験で剪定される）。
    // 固定するのは「上書きされる」という契約の告知だけ
    expect(READING_GUIDE_TEXT.slice(0, 500)).toContain('facet が自動で管理する')
  })

  it('ファイル名は README-for-AI.md（スペック設計1）', () => {
    expect(READING_GUIDE_FILENAME).toBe('README-for-AI.md')
  })
})
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `npx vitest run src/core/reading-guide.test.ts`
Expected: FAIL（`./reading-guide` が存在しない旨の import エラー）

- [ ] **Step 4: 実装を書く**

`src/core/reading-guide.ts`:

```ts
/**
 * AI 向け読み方ガイドをプロジェクトフォルダへ配る（コア・I/O 注入）。
 *
 * **これが無いと、素の JSON を読む AI がドメイン規約を知る手段が無い。**
 * スキーマの自己記述性（rev 5章）は構造を説明するが、「空欄・undecided は
 * 未決の意思表示であり埋めてはいけない」「単一性フラグを持つツールは
 * 1ファイルずつ」といった読み方の規約は facet 開発リポジトリの docs にしか
 * 無く、ユーザーのプロジェクトフォルダには入っていない。
 *
 * Skill 同期（skill-sync.ts）と違い、ガイドは単一の静的テキストなので
 * 原本は Vite の `?raw` import でバンドルへ取り込む（tauri.conf.json の
 * bundle.resources と定数の二重管理を増やさない）。
 *
 * **内容が原本と一致するときは書かない**——mtime を無駄に更新すると、
 * フォルダ watcher の再走査と Git のノイズを毎回の起動で増やすため。
 * なお書いた場合も、アプリの走査は `.json` しか一覧しない
 * （src/fs/project-fs.ts）ので、ガイドがファイル一覧や外部変更検知に
 * 現れることはない
 */
import guideText from './reading-guide.md?raw'

/** プロジェクトフォルダ直下に置くガイドのファイル名（スペック設計1で確定） */
export const READING_GUIDE_FILENAME = 'README-for-AI.md'

/** ガイド原本の全文 */
export const READING_GUIDE_TEXT: string = guideText

export interface ReadingGuideIo {
  /** ファイルが無ければ null を返す */
  readText(path: string): Promise<string | null>
  writeText(path: string, text: string): Promise<void>
  join(...parts: string[]): Promise<string>
}

/** ガイドを配る。無ければ書く／一致なら触らない／不一致（旧版・ユーザー編集）なら原本で上書き */
export async function syncReadingGuide(projectDir: string, io: ReadingGuideIo): Promise<void> {
  const path = await io.join(projectDir, READING_GUIDE_FILENAME)
  if ((await io.readText(path)) === READING_GUIDE_TEXT) return
  await io.writeText(path, READING_GUIDE_TEXT)
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run src/core/reading-guide.test.ts`
Expected: PASS（このファイルの `it` がすべて緑）

- [ ] **Step 6: 変異で守りを確認する**

`syncReadingGuide` の `if ((await io.readText(path)) === READING_GUIDE_TEXT) return` を一時的に削って Step 5 を再実行し、「一致していれば書かない」の `it` が**落ちる**ことを確認してから戻す（lessons: 順序・分岐を固定するテストは壊して確認する）。

- [ ] **Step 7: フルスイートを回してコミット**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑

```bash
git add src/core/reading-guide.md src/core/reading-guide.ts src/core/reading-guide.test.ts
git commit -m "feat(core): AI向け読み方ガイドの原本と同期ロジックを足す"
```

---

### Task 2: Tauri I/O と App.tsx の配線

**Files:**
- Create: `src/fs/reading-guide-io.ts`
- Modify: `src/App.tsx`（`switchFolder` と `openFolder` の `controller.openFolder(dir)` 呼び出し2箇所をヘルパへ集約）
- Test: `src/App.dom.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `syncReadingGuide` / `READING_GUIDE_FILENAME` / `ReadingGuideIo`、既存の `controller.openFolder(dir): Promise<boolean>`、既存の `showToast`
- Produces: `tauriReadingGuideIo: ReadingGuideIo`（`src/fs/reading-guide-io.ts`）、App.tsx 内ローカルの `openProject(dir: string): Promise<boolean>`

- [ ] **Step 1: Tauri I/O を書く**

`src/fs/reading-guide-io.ts`:

```ts
import { join } from '@tauri-apps/api/path'
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import type { ReadingGuideIo } from '@/core/reading-guide'

/**
 * 読み方ガイドの読み書き（Tauri 境界）。
 * 判断はすべて src/core/reading-guide.ts（純ロジック）側にあり、ここは配線だけ。
 * exists→read の間にファイルが消える競合は、直後の書き込みが原本で埋めるので実害がない
 */
export const tauriReadingGuideIo: ReadingGuideIo = {
  async readText(path) {
    if (!(await exists(path))) return null
    return readTextFile(path)
  },
  writeText: (path, text) => writeTextFile(path, text),
  join: (...parts) => join(...parts),
}
```

- [ ] **Step 2: 失敗するテストを書く**

`src/App.dom.test.tsx` に追記する。mock はファイル先頭の既存 mock 群（`vi.mock('@/fs/skill-resources', ...)` の並び）に足す:

```tsx
const { syncReadingGuideMock } = vi.hoisted(() => ({
  syncReadingGuideMock: vi.fn(async () => undefined),
}))
vi.mock('@/fs/reading-guide-io', () => ({ tauriReadingGuideIo: {} }))
// READING_GUIDE_FILENAME 等は実物のまま、同期関数だけ差し替える（skill-sync の mock と同じ形）
vi.mock('@/core/reading-guide', async (orig) => ({
  ...(await orig<typeof import('@/core/reading-guide')>()),
  syncReadingGuide: syncReadingGuideMock,
}))
```

テスト本体（既存の「フォルダを開く」操作の書き方に合わせる。`pickProjectFolder` は `'/proj'` を返す mock 済み）:

```tsx
it('フォルダを開くと読み方ガイドを配る', async () => {
  syncReadingGuideMock.mockClear()
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
  await waitFor(() => {
    expect(syncReadingGuideMock).toHaveBeenCalledWith('/proj', expect.anything())
  })
})
```

既存テストの render・クリックの作法（`beforeEach` の掃除、`findByText` 待ち等）がこの雛形と食い違う場合は、**既存の「フォルダを開く」系テストの形に合わせて書き直してよい**（検証したい事実は「開く操作の後に `syncReadingGuideMock` が `'/proj'` で1回以上呼ばれる」だけ）。

**書かないテストと理由**: `controller.openFolder` が false を返す経路で「ガイドを書かない」ことの DOM テストは書かない。App.dom.test.tsx の部分 mock は `openFolder` を実物のまま使う方針（既存コメント）で、これを落とす注入点を作ると mock が本物の配線を覆い隠す。false 経路のガードは Step 3 のコードレビューで見る（`AppController.openFolder` の boolean 契約自体の単体テストが無いことは open-issues に既存項目 `[M11]` として記録済み）。

- [ ] **Step 3: テストが落ちることを確認する**

Run: `npx vitest run src/App.dom.test.tsx`
Expected: 新しい `it` だけが FAIL（`syncReadingGuideMock` が呼ばれていない）。既存の `it` が落ちたら mock の追加が既存配線を壊している——原因を直してから進む

- [ ] **Step 4: App.tsx を配線する**

import を足す:

```tsx
import { syncReadingGuide, READING_GUIDE_FILENAME } from '@/core/reading-guide'
import { tauriReadingGuideIo } from '@/fs/reading-guide-io'
```

`switchFolder` の直前あたりにヘルパを足し、**2箇所の `controller.openFolder(dir)` 呼び出し（`switchFolder` 内と `openFolder` の `hasRunning` でない分岐）を `openProject(dir)` に置き換える**:

```tsx
/**
 * フォルダを開き、開けたときだけ読み方ガイドを配る（スペック設計2）。
 * ガイドを書けなくても開くこと自体は成立させる——Skill 同期と同じ姿勢
 *（設計 決定13）。開けなかったフォルダには書かない（開けない場所へ
 * ファイルを増やさない）
 */
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

置き換え後の2箇所:

```tsx
// switchFolder 内
const opened = await openProject(dir)
if (!opened) return
```

```tsx
// openFolder 内
if (!hasRunning(terminals)) {
  await openProject(dir)
  return
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run src/App.dom.test.tsx`
Expected: PASS（このファイルの `it` がすべて緑。既存の `it` を1本も壊していないこと）

- [ ] **Step 6: フルスイートを回してコミット**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑

```bash
git add src/fs/reading-guide-io.ts src/App.tsx src/App.dom.test.tsx
git commit -m "feat(core): フォルダを開いたとき読み方ガイドをプロジェクトへ配る"
```

---

### Task 3: 実機確認（人間の作業。サブエージェントには任せない）

**Files:** なし（動作確認のみ）

チェックリスト（結果は Task 5 の申し送りに転記する。未実施のまま Task 5 を書くなら「未実施」と明記して空のまま残す）:

- [ ] `npm run tauri dev` で起動し、`sample-project/` を開く → 直下に `README-for-AI.md` ができる
- [ ] 一度閉じて同じフォルダを開き直す → ファイルの更新日時が**変わらない**（べき等分岐。エクスプローラ／`ls -l` で確認）
- [ ] `README-for-AI.md` の先頭行を手で書き換えてから開き直す → 原本の内容に戻る
- [ ] 確認後、`git checkout -- sample-project/ && git clean -fd sample-project/` で痕跡を消す（`git status --short` が空になること。CLAUDE.md の後片付け）

---

### Task 4: 素読み比較実験とガイド本文の剪定（人間＋Claude CLI の作業）

**Files:**
- Modify: `src/core/reading-guide.md`（実験結果に基づく剪定）

スペックの受け入れ基準そのもの。**ガイドの各記述は「素読みで実際に起きた読み違い」か「起きたら発見が遅れる読み違い」のどちらかに対応していなければならない。素読みで一度も間違えなかった項目の記述は削る。**

- [ ] **Step 1: 実験用プロジェクトを2部作る**

一時ディレクトリ（セッションの scratchpad 等。リポジトリ内に作らない）に `exp-bare/` と `exp-guided/` を作り、両方に同じデータを入れる:

1. `sample-project/glossary.json` をコピーする（「役割トークン」「応募者」が定義空・kind undecided で入っており、未決の罠として機能する）
2. エラーカタログ: `.claude/skills/error-catalog-register/evals/fixtures/existing-project/` にある `type: "errorCatalog"` の JSON をコピーする（fixture の構成が変わっていたら中身が `errorCatalog` の JSON を1つ選ぶ）
3. シーケンス: 以下を `payment-sequence.json` として置く（実験専用。ID が規約上のランダム形式でないのは fixture ゆえ。**リポジトリにコミットしない**）:

```json
{
  "schemaVersion": 1,
  "type": "sequence",
  "title": "決済の実行（実験用）",
  "actors": [
    { "id": "actor_Aaaaaaaaa1", "name": "自社アプリ", "domain": "自社" },
    { "id": "actor_Bbbbbbbbb1", "name": "決済ゲートウェイ", "domain": "決済会社" }
  ],
  "steps": [
    {
      "id": "step_Ccccccccc1",
      "kind": "call",
      "from": "actor_Aaaaaaaaa1",
      "to": "actor_Bbbbbbbbb1",
      "label": "決済を要求する",
      "awaitsReply": true,
      "failures": {
        "failed": { "decision": "handled", "text": "注文を保留にして再試行を案内する" }
      }
    },
    {
      "id": "step_Ddddddddd1",
      "kind": "reply",
      "from": "actor_Bbbbbbbbb1",
      "to": "actor_Aaaaaaaaa1",
      "label": "決済結果を返す"
    }
  ]
}
```

置いたらアプリでこのフォルダを一度開き、赤表示（整合性エラー）が出ないことを確かめる（計画が手書きした JSON は未検証の下書きである。lessons 大原則）。**このときアプリが `README-for-AI.md` を書くので、`exp-bare/` からは消し、`exp-guided/` には残す。** これでガイドの有無だけが2部の差になる。

- [ ] **Step 2: 同じ質問を両方に投げて記録する**

各ディレクトリで `claude -p "<質問>"` を実行する（毎回新しいセッション。同じ質問・同じ順序）。質問リスト:

1. このフォルダの仕様を全体像として説明して
2. 「応募者」とはどういう意味？（→ 正答: 定義は未決。推測で補完したら読み違い）
3. 「役割トークン」の種別は何？（→ 正答: 未分類（undecided）のまま）
4. 決済の要求がタイムアウトして結果が不明だったらどうなる？（→ 正答: `unknown` スロットが未回答なので未決）
5. 決済の要求が失敗したらどうなる？（→ 正答: 注文を保留にして再試行を案内する。handled の答えは読めて当然の対照群）
6. エラーカタログから1件選び、「このエラーは誰が対応する？」（→ fixture の `resolutionLevel` に忠実か。`undecided` の行があればそれを選ぶ）
7. この仕様で未決になっている箇所をすべて列挙して

各答えについて「素読みが読み違えたか／ガイドありで直ったか」を表に記録する。

- [ ] **Step 3: 剪定して確定する**

- 素読みが**全問読み違えなかった**規約に対応するガイドの記述を `src/core/reading-guide.md` から削る
- ガイドありでも読み違えた項目があれば、その記述を書き直して Step 2 の該当質問だけ再実験する
- 剪定の結果（何を削り、なぜ残したか）と Step 2 の記録表は Task 5 の申し送りに転記するため保存しておく

- [ ] **Step 4: フルスイートを回してコミット**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑（本文テストは自動管理の注意書きとファイル名しか固定していないので、剪定で落ちないはず。落ちたら注意書きを消してしまっている）

```bash
git add src/core/reading-guide.md
git commit -m "docs(core): 読み方ガイドを素読み比較実験の結果で剪定する"
```

---

### Task 5: ドキュメントの完了処理

**Files:**
- Create: `docs/history/m12-core-reading-guide.md`
- Modify: `docs/open-issues.md`
- Modify: `docs/overview-rev.md`（4章）

- [ ] **Step 1: 申し送りを書く**

`docs/history/m12-core-reading-guide.md` に、既存の history 文書（`m11-core-claude-code-pane.md` の体裁を参照）と同じ構成で書く: 実装で確定した事項（`?raw` 方式の採用理由＝スペックからの変更を含む／ガイドは書くだけでアプリは読まない）、Task 3 の実機確認の結果、Task 4 の実験の記録表と剪定の判断。**Task 3・4 が未実施ならチェックリストを空のまま「未実施」と明記する**（lessons: 実機確認とドキュメント反映を束ねて未実施を埋没させない）。

- [ ] **Step 2: open-issues を更新する**

- Task 3 または Task 4 が未実施のままなら、その旨を1項目として追加する（`[M12]`）
- Task 4 の実験で「ガイドで直せなかった読み違い」が残ったなら、1項目として追加する（`[M12]`）
- 解消した既存項目は今回は無い見込み（このマイルストーンは既存の残件に触れない）

- [ ] **Step 3: rev 4章へ反映する**

`docs/overview-rev.md` 4章「Skill群」の節の後に、読み方ガイドを AI 活用の配布物として追記する。書く内容: プロジェクトフォルダ直下の `README-for-AI.md` は facet が自動管理する静的な読み方ガイドで、フォルダを開いたときにべき等に書き出す（一致なら触らない）。原本は `src/core/reading-guide.md`。**アプリはこのファイルを読まない**（「Claude の出力を読んで何かを決める」禁止と同じ線）。Skill 同期が端末起動を契機にするのに対し、ガイドは外部の Claude Code から読まれるため「開いたとき」を契機にする。

- [ ] **Step 4: フルスイートを回してコミット**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑

```bash
git add docs/history/m12-core-reading-guide.md docs/open-issues.md docs/overview-rev.md
git commit -m "docs(m12): 読み方ガイドの申し送りと rev 反映"
```
