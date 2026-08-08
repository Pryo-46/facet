# M6: NotePM 向け Markdown 出力 ＋ App の副作用順序の切り出し 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用語集モジュールにモジュール規約6点セット最後の空きスロット（規約5＝出力ロジック）を実装して NotePM 向け Markdown をコピー／`.md` 書き出しできるようにし、あわせて `src/App.tsx` に集中していた副作用の**順序**をテスト可能なコントローラへ切り出す。

**Architecture:** 出力ロジックは `src/modules/glossary/markdown.ts` の純関数（`ToolModule.toMarkdown`）として実装し、既存の `FIELD_LABELS` / `kind-labels.ts` / スキーマの `kind` enum を使い回して表記とグループ順を1箇所に保つ。App の副作用は `src/core/app-controller.ts`（React も Tauri も知らないコア）へ移し、I/O は `AppIo`、UI 反映は `AppHost` のコールバックとして注入する——状態を React の `state`/`ref` ではなくコントローラ内部の**クロージャ変数**に置くことで、M5 が踏んだ「レンダごとに代入する ref では過去の値を凍結できない」種の誤りを構造的に消す。`App.tsx` に残るのは「コントローラを state に繋ぐ」配線と JSX だけにする。

**Tech Stack:** TypeScript / React 19 / Vite 8 / Vitest 4（環境は既定 `node`、DOM テストのみファイル先頭で `jsdom` に切替）／Tauri 2（`@tauri-apps/plugin-fs` / `plugin-dialog` / 新規に `plugin-clipboard-manager`）／Tailwind CSS v4 ＋ shadcn/ui（Radix）。

---

## Global Constraints

以下はスコープ定義書（`docs/impl-scope-glossary.md`）と `docs/overview-rev.md` から引いたプロジェクト全体の制約。**全タスクの要件に暗黙に含まれる。**

- **正規形を1バイトも動かさない。** キー順＝スキーマの `properties` 記載順から実行時導出／インデント半角2／LF／末尾改行あり／BOM なし／非ASCII エスケープなし。`src/core/canonical.ts` の `serialize` を通す以外の書き出し経路を作らない。回帰テストは `src/core/canonical.test.ts`（**削らない**）。
- **型定義は書かない。** `src/types/glossary.ts` はスキーマからの生成物（`.gitignore` 済み。`pretest` / `prebuild` などで自動再生成）。手書きの型と二重管理しない。
- **Rust は原則書かない。** 自前 Tauri コマンドは `move_to_trash` の1本だけ。本計画で Rust に触るのは**プラグイン登録1行と Cargo 依存1行のみ**（Task 2）。判断を Rust に置かない。
- **新しい Tauri JS API を使うたびに capabilities を確認する**（`src-tauri/capabilities/default.json`）。権限が無いと**実行時に静かに動かない**（M2 の `core:window:allow-destroy`、M5 の `fs:allow-watch` と同じ罠）。
- **色値の直書き禁止。** 既存の役割トークン（`text-ink` / `text-ink-muted` / `text-warning` / `border-rule` / `bg-surface` / `bg-canvas`）を流用する。確定は M7。
- **`src/components/ui/**` は shadcn の生成物。手で整形しない。**
- **キー解釈は `src/core/keyboard/keymap.ts` の `resolveCommand` ただ1箇所。** `e.key` をコア以外で直接見ない。修飾キーの表示名は `src/core/keyboard/platform.ts` を通す。
- **DOM テストは対象ファイル先頭の `// @vitest-environment jsdom` で切り替える。** `globals` が無効なので `afterEach(cleanup)` を明示。要素は **role とアクセシブル名**で引き、クラス名やレイアウトに依存させない。DOM テストは「壊れても画面は一見正常」な回帰に絞る。
- **警告ゼロ基準。** `npm run lint`（oxlint）が警告を出したらタスク完了としない。
- **`sample-project/glossary.json` はテストの fixture**（Task 10 で専用の場所へ移すまでは触らない）。
- **実機確認（`npm run tauri dev` の GUI 操作）は人間の作業**（Task 11）。サブエージェントは GUI を操作できないので、実装タスクの完了条件に実機確認を含めない。

### 計画のコードの扱い（M3・M4・M5 で3回続けて再現した教訓）

**この計画に載っているコードは検証済みの正ではない。レビューを通す前提の下書きとして扱うこと。** 実装中に計画の指示が矛盾していたり、ライブラリの実挙動と食い違ったりしたら、**辻褄を合わせずに「計画の矛盾」として報告する**（M5 Task 2 / Task 3 で実装者がそうしたのが正しい対応だった）。

その反省から、本計画では次の書き方を採る:

- **テストの件数を書かない。** 「PASS（9件）」のような記述は M4・M5 で2回とも数え間違いだった。期待値は常に「このファイルの `it` がすべて緑」と書く。
- **既存コードの移動は「移す」と書き、書き換えを最小限に指定する。** コントローラ（Task 4〜7）の本体は `src/App.tsx` から移す機械的な変換であり、**振る舞いを変えてよいのは本計画が明示した箇所だけ**。「せっかくだから」の整理を混ぜない。
- **意図的に振る舞いを変える箇所は各タスクに「振る舞いの変更」節を置いて列挙する。** レビュアーはそこに無い差分を「計画外の変更」として指摘してよい。

---

## 状態変数の共有マップ（M5 の処方1）

M5 の Critical 3件のうち2件は「1つの状態を2つの機構が使っていることの見落とし」だった。本計画で扱う状態を、**誰が読み・誰が変えるか**で先に並べる。コントローラを実装・レビューするときはこの表を突き合わせること。

| 状態 | 持ち主 | 読む人 | 変える人 | 共有による罠 |
| --- | --- | --- | --- | --- |
| `saver`（`AutoSaver`） | controller（クロージャ変数） | `rescan` の `hasUnsavedEdits` 判定／`requestClose`／`deleteFile`／`applyEdit` | `attachSaver`／`closeCurrentFile`／`rescan` の reload・ask 分岐／`handleSelectedGone`／`deleteFile` | **ask 分岐で `dispose()` すると `hasUnsaved()` の信号が消える**（M5 の誤り3）。だから `pendingAsk` が第2の信号として要る |
| `pendingAsk`（`{path, module}`） | controller | `rescan`（`hasUnsavedEdits` と `moduleBeforeChange`）／`requestClose` | `rescan` の ask 分岐／`importExternalChange`／`overwriteWithMine`／`handleSelectedGone`／`openFolder` | 回答前の**2度目の検知が reload に落ちない**唯一の担保。`module` を一緒に持つのは、2度目の検知では一覧が既に1度目の適用後（`rejected` かもしれない）を指すため |
| `files` | controller（`host.setFiles` で App へ複製） | ほぼ全経路 | `applyFiles` ただ1つ | React state だと「変更前の一覧」を凍結できない（M5 の誤り2）。**クロージャ変数なら代入が同期で確定する**ので ref もスナップショットも要らない |
| `selectedPath` | controller | ほぼ全経路 | `setSelected` ただ1つ | 確認ダイアログを挟む操作は「確定時点の値」を読む必要がある（M4 の `selectedPathRef`）。クロージャ変数なら自動的にそうなる |
| `history`（`present`） | **App（React state）** | controller は `host.getEditingData()` 経由でだけ読む | App（`record` / `undo` / `redo` / `host.setDocument`） | controller は履歴を持たない。**取り込み＝`host.setDocument(newData)` が Undo 履歴の破棄そのもの**（rev 3章） |
| `knownDisk`（台帳） | controller | `rescan` | `writeAndRecord`／`selectFile`／`openFolder`／`deleteFile`／`handleSelectedGone`／`rescan` | **`io.write` を `writeAndRecord` の外から呼ぶと台帳がずれ、自分の書き込みが外部変更として跳ね返る**（実害＝Undo 履歴が勝手に破棄される）。例外は `.md` 書き出しのみ（走査対象は `.json` だけなので台帳に載らない） |
| モーダルキュー | App（React state） | App | controller（`showModal` / `dropModal` / `clearModals`） | 生産者は「削除確認」「破棄して閉じる」「外部変更の二択」の3人。フォルダ切替・ファイル消滅で**要求が残る**のを Task 4 で塞ぐ |
| トースト | App（React state） | App | controller（`showToast` / `dismissToast`） | **時間で消えない**＝別のファイルを開いた後・二択に答えた後でも押される（M5 の誤り4）。下記「トーストの寿命」を参照 |
| バナー（`banners`） | App（React state） | App | controller（`host.setBanner(kind, msg)`） | 単一スロットだと「監視を開始できません」（継続する状態）が次の `setIoError(null)` で消える。Task 4 で種別を持たせて解決する |

### トーストの寿命と、押せる文脈（M5 の処方3）

本計画が新たに増やすトーストは Markdown 出力の完了通知（`key: 'export'`、**操作ボタンなし**）1種だけ。操作が無いので「後から押されて事故になる」経路は無い。既存の操作付きトースト（`external:<path>` の「取り込み前に戻す」）については、Task 6 で**二択ダイアログを出す前に同じ key の古いトーストを消す**——残っていると、二択に答えた後にそれを押せてしまい、二択の前提（ディスクは検知した内容のまま）が崩れる。

### `ref` を使わない設計であることの確認（M5 の処方2）

コントローラは React の `ref` を1つも使わない。過去の値を凍結する必要がある箇所（`moduleBeforeChange`）は、**判断を起動する関数の中で引いて引数で渡す**（M5 の誤り2の正解の形）か、`pendingAsk` に**明示的に保存する**。App 側に残る ref は `historyRef`（最新値の読み取り口。`getEditingData` が使う）と `modalOpenRef`（マウント時に1回しか張らない keydown リスナーが読む）と `toastSeq`（採番カウンタ）の3つだけで、いずれも「最新値の読み取り口」としての正しい用法。

---

## File Structure

新規作成:

| ファイル | 責務 |
| --- | --- |
| `src/modules/glossary/markdown.ts` | 用語集 → NotePM 向け Markdown（モジュール規約5。純関数） |
| `src/modules/glossary/markdown.test.ts` | 上のテスト |
| `src/fs/clipboard.ts` | クリップボード書き込みの Tauri 隔離（コアは Tauri を知らない） |
| `src/fs/clipboard.test.ts` | プラグインをモックした薄い委譲テスト |
| `src/core/app-controller.ts` | 額縁の副作用の**順序**を持つコントローラ（React も Tauri も知らない） |
| `src/core/app-controller.test.ts` | 順序と有無を固定するテスト（本マイルストーン最大の成果物） |
| `src/core/__fixtures__/glossary.canonical.json` | 正規形バイト一致テストの fixture（Task 10 で `sample-project/` から移す） |

変更:

| ファイル | 変更内容 |
| --- | --- |
| `tsconfig.test.json` | テストファイルを実際に型チェック対象にする（現状 `exclude` の継承で素通りしている） |
| `src/core/registry.ts` | `ToolModule` に `toMarkdown` スロットを追加（規約5） |
| `src/modules/glossary/module.ts` | `toMarkdown` を実装（規約6点セット充足） |
| `src/core/toasts.ts` | `dismissToastByKey` を追加 |
| `src/core/modal-queue.ts` | `dropModal` / `clearModals` を追加 |
| `src/fs/project-fs.ts` | `askSaveMarkdownPath`（保存ダイアログ）を追加 |
| `src/App.tsx` | コントローラへ乗せ換え（約 956 行 → 約 330 行）／バナーの種別化／Markdown 出力ボタン／`beforeunload` での監視停止 |
| `src/core/canonical.test.ts` / `src/core/load.test.ts` | fixture の参照先を差し替え |
| `src/core/load.test.ts` / `src/core/project-consistency.test.ts` / `src/core/autosave.test.ts` | 型チェック有効化で出るエラーの修正 |
| `src-tauri/Cargo.toml` / `src-tauri/src/lib.rs` / `src-tauri/capabilities/default.json` | クリップボードプラグインの追加 |
| `package.json` | `@tauri-apps/plugin-clipboard-manager` の追加 |

---

## 事前準備（Task 1 に着手する前に1回だけ）

- [ ] **依存関係を入れる**

現在のチェックアウトでは `jsdom` が `node_modules` に無く、DOM テストが「Cannot find package 'jsdom'」で起動に失敗する（テスト自体は 32 ファイル・223 件が緑）。worktree を作った場合も同じなので、まず:

```bash
npm install
```

- [ ] **ベースラインを確認する**

```bash
npm test
npx tsc -b
npm run lint
```

Expected: `npm test` が**エラー0で**全件 PASS（`Errors 6 errors` が出るなら `npm install` が効いていない）。`tsc -b` と `lint` は無出力。

---

## Task 1: テストファイルを型チェック対象にする

**なぜ最初にやるか:** 本マイルストーンは `src/core/app-controller.test.ts` という大きなテストファイルを新設する。ところが現状、**テストファイルは1つも型チェックされていない**——`tsconfig.test.json` は `tsconfig.app.json` を `extends` しており、`include` は上書きしているが `exclude`（`["src/**/*.test.ts", "src/**/*.test.tsx"]`）を継承しているため、include したファイルが exclude で全部落ちる。M1 の申し送りが「テストは `tsconfig.test.json` で型チェックする」と書いた意図がそのまま空振りしている。型の付いていないテストを大量に足す前に塞ぐ。

**Files:**
- Modify: `tsconfig.test.json`
- Modify: `src/core/load.test.ts:18-27`
- Modify: `src/core/project-consistency.test.ts:6-17`
- Modify: `src/core/autosave.test.ts:228`, `src/core/autosave.test.ts:267`

- [ ] **Step 1: 現状「型チェックが素通りしている」ことを確かめる**

`src/core/load.test.ts` の `makeRegistry` が作る `AnyToolModule` には必須スロット `createEmpty` が無い。それでも `npx tsc -b --force` が通ることを確認する:

```bash
npx tsc -b --force
```

Expected: 無出力（＝エラー0）。**これが「テストが型チェックされていない」証拠**である。

- [ ] **Step 2: `exclude` を打ち消す**

`tsconfig.test.json` を次の内容にする（`"exclude": []` の1行を足すだけ）:

```json
{
  "extends": "./tsconfig.app.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.test.tsbuildinfo",
    "types": ["vite/client", "node"],
    "noEmit": true,
    "composite": true
  },
  "//": "app 側の exclude（テストファイル）を継承すると include が全部落ちるので打ち消す",
  "exclude": [],
  "include": ["src/**/*.test.ts", "src/**/*.test.tsx", "src"]
}
```

- [ ] **Step 3: 落ちることを確認する**

```bash
npx tsc -b --force
```

Expected: FAIL。次の4件（`@testing-library/react` の解決エラーが出る場合は `npm install` が未実施）:

```
src/core/autosave.test.ts(233,36): error TS2322: Type 'Promise<void>' is not assignable to type 'Promise<never>'.
src/core/autosave.test.ts(273,36): error TS2322: Type 'Promise<void>' is not assignable to type 'Promise<never>'.
src/core/load.test.ts(18,9): error TS2741: Property 'createEmpty' is missing ...
src/core/project-consistency.test.ts(7,3): error TS2741: Property 'createEmpty' is missing ...
```

- [ ] **Step 4: `createEmpty` の欠落を埋める**

`src/core/load.test.ts` の `mod` に1行足す（`migrate` の直後）:

```ts
    migrate: (d) => d,
    createEmpty: () => ({}),
```

`src/core/project-consistency.test.ts` の `fakeModule` の戻り値にも同じ1行を足す:

```ts
    migrate: (d) => d,
    createEmpty: () => ({}),
```

- [ ] **Step 5: `vi.fn` の戻り型を明示する**

`src/core/autosave.test.ts` の2箇所。`() => Promise.reject(...)` は `Promise<never>` に推論され、後続の `mockImplementation(() => Promise.resolve())` が代入できない。戻り型を明示して直す:

```ts
    const write = vi.fn((): Promise<void> => Promise.reject(new Error('disk full')))
```

```ts
    const write = vi.fn((): Promise<void> => Promise.reject(new Error('boom')))
```

- [ ] **Step 6: 型チェックとテストが通ることを確認する**

```bash
npx tsc -b --force
npm test
npm run lint
```

Expected: `tsc -b` 無出力／`npm test` 全件 PASS・エラー0／`lint` 無出力。

- [ ] **Step 7: コミット**

```bash
git add tsconfig.test.json src/core/load.test.ts src/core/project-consistency.test.ts src/core/autosave.test.ts
git commit -m "M6: テストファイルを実際に型チェック対象にする（exclude の継承で素通りしていた）"
```

---

## Task 2: 用語集の Markdown 出力（モジュール規約5）

**Files:**
- Create: `src/modules/glossary/markdown.ts`
- Create: `src/modules/glossary/markdown.test.ts`
- Modify: `src/core/registry.ts`（`ToolModule` に `toMarkdown` を追加）
- Modify: `src/modules/glossary/module.ts`
- Modify: `src/core/registry.test.ts:4-16`, `src/core/file-ops.test.ts:8-20`, `src/core/load.test.ts`, `src/core/project-consistency.test.ts`（fixture に新スロットを足す）

**Interfaces:**
- Consumes: `FIELD_ORDER` / `FIELD_LABELS`（`src/modules/glossary/fields.ts`）、`kindLabel`（`src/modules/glossary/kind-labels.ts`）、`schemas/glossary.schema.json`
- Produces: `glossaryToMarkdown(data: GlossarySchemaVersion1): string`、`ToolModule.toMarkdown: (data: TData) => string`

**仕様（`glossary-session-notes.md` 論点7 ／ スコープ定義書 4節 M6。確定済み・蒸し返さない）:**

- 見出しは `##`＝エンベロープの `title`、`###`＝種別グループ。**h1 は使わない**（NotePM のページタイトルと階層衝突するため。目次は h1〜h3 収載）
- グループ順は **`kind` enum の定義順で固定**（出力のたびに順が揺れる Git ノイズの排除）。**空の種別は見出しごと省略**。グループ内は**データ配列順**
- 列は 名称／種別／定義／別名／備考。**ID は出さない**（人間向け出力）
- `definition` が空文字なら `（未定義）`、`undecided` は `### 未分類`（`kind-labels.ts` が既にこのラベルを持っている）
- Mermaid は無い（用語集に図は存在しない）

> **仕様どおりに実装するが、一点だけ記録しておく:** 種別でグループ化した上で「種別」列も出すため、グループ内では同じ値が繰り返される。これは論点7 の確定仕様（列構成にも種別を含めると明記）どおりであり、1行だけコピーして別の文書に貼っても種別が失われない利点がある。**勝手に列を落とさないこと。**

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/glossary/markdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import { glossaryToMarkdown } from './markdown'

function term(over: Partial<Term> = {}): Term {
  return {
    id: 'term_AAAAAAAAAA',
    name: '用語',
    kind: 'other',
    definition: '定義',
    aliases: [],
    notes: '',
    ...over,
  }
}

function glossary(terms: Term[], title = 'テスト用語集'): GlossarySchemaVersion1 {
  return { schemaVersion: 1, type: 'glossary', title, terms }
}

describe('glossaryToMarkdown', () => {
  it('title は h2、種別グループは h3。h1 は使わない（NotePM の目次は h1〜h3）', () => {
    const md = glossaryToMarkdown(glossary([term({ kind: 'actor' })]))
    expect(md).toContain('## テスト用語集')
    expect(md).toContain('### アクター')
    expect(md.split('\n').some((line) => /^# /.test(line))).toBe(false)
  })

  it('グループは kind enum の定義順に並ぶ（データの登場順ではない）', () => {
    const md = glossaryToMarkdown(
      glossary([
        term({ id: 'term_BBBBBBBBBB', name: 'あとの種別', kind: 'data' }),
        term({ id: 'term_CCCCCCCCCC', name: 'さきの種別', kind: 'actor' }),
      ]),
    )
    expect(md.indexOf('### アクター')).toBeLessThan(md.indexOf('### データ'))
  })

  it('空の種別は見出しごと省略する', () => {
    const md = glossaryToMarkdown(glossary([term({ kind: 'actor' })]))
    expect(md).toContain('### アクター')
    expect(md).not.toContain('### 状態')
    expect(md).not.toContain('### 未分類')
  })

  it('グループ内はデータ配列順（並べ替えない）', () => {
    const md = glossaryToMarkdown(
      glossary([
        term({ id: 'term_BBBBBBBBBB', name: 'ん', kind: 'actor' }),
        term({ id: 'term_CCCCCCCCCC', name: 'あ', kind: 'actor' }),
      ]),
    )
    expect(md.indexOf('| ん |')).toBeLessThan(md.indexOf('| あ |'))
  })

  it('列は 名称／種別／定義／別名／備考 で、ID は出さない', () => {
    const md = glossaryToMarkdown(
      glossary([term({ id: 'term_ZZZZZZZZZZ', name: '応募者', kind: 'actor', notes: 'メモ' })]),
    )
    expect(md).toContain('| 名称 | 種別 | 定義 | 別名 | 備考 |')
    expect(md).toContain('| --- | --- | --- | --- | --- |')
    expect(md).toContain('| 応募者 | アクター | 定義 |  | メモ |')
    expect(md).not.toContain('term_ZZZZZZZZZZ')
  })

  it('definition が空なら（未定義）と書く（負債を出力にも残す）', () => {
    const md = glossaryToMarkdown(glossary([term({ kind: 'actor', definition: '' })]))
    expect(md).toContain('| 用語 | アクター | （未定義） |  |  |')
  })

  it('undecided は「未分類」グループとして出す', () => {
    const md = glossaryToMarkdown(glossary([term({ kind: 'undecided' })]))
    expect(md).toContain('### 未分類')
  })

  it('別名は読点で連結する', () => {
    const md = glossaryToMarkdown(
      glossary([term({ kind: 'actor', aliases: ['候補者', 'candidate'] })]),
    )
    expect(md).toContain('| 候補者、candidate |')
  })

  it('セル内の | はエスケープし、改行は <br> にする（表を壊さない）', () => {
    const md = glossaryToMarkdown(
      glossary([term({ kind: 'actor', definition: 'a|b', notes: '1行目\n2行目' })]),
    )
    expect(md).toContain('a\\|b')
    expect(md).toContain('1行目<br>2行目')
    // 行数が用語数どおりであること（改行が表を割っていない）
    expect(md.split('\n').filter((l) => l.startsWith('| 用語 ')).length).toBe(1)
  })

  it('enum に無い kind の用語も落とさず末尾のグループに出す', () => {
    const md = glossaryToMarkdown(
      glossary([term({ kind: 'unknownKind' as Term['kind'], name: '未知種別の用語' })]),
    )
    expect(md).toContain('### unknownKind')
    expect(md).toContain('| 未知種別の用語 |')
  })

  it('用語0件なら見出しだけ。末尾は改行1つ', () => {
    const md = glossaryToMarkdown(glossary([]))
    expect(md).toBe('## テスト用語集\n')
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx vitest run src/modules/glossary/markdown.test.ts
```

Expected: FAIL（`Failed to resolve import "./markdown"`）

- [ ] **Step 3: 出力ロジックを実装する**

`src/modules/glossary/markdown.ts`:

```ts
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'
import { FIELD_LABELS, FIELD_ORDER } from './fields'
import { kindLabel } from './kind-labels'

/**
 * NotePM 向け Markdown 出力（モジュール規約5。glossary-session-notes 論点7）。
 *
 * - **h1 は使わない**（NotePM のページタイトルと階層が衝突する。目次は h1〜h3 収載）。
 *   `title` が h2、種別グループが h3
 * - グループ順は **kind enum の定義順で固定**。出力のたびに順が揺れると
 *   Git 上で無意味な差分になる。空の種別は見出しごと省略し、
 *   グループ内はデータ配列順（配列順＝UI の既定表示順が正。スキーマの記述）
 * - `definition` が空なら `（未定義）`、`undecided` は `未分類` として**出力にも明示する**。
 *   仕様書に貼った瞬間に未定義が見えなくなるのは文章仕様書の悪癖の再生産であり、
 *   議事録に貼った `（未定義）` は次回の宿題リストとして機能する（rev 5章）
 */

/** グループ順はスキーマの enum から実行時に導出する（ハードコードすると enum 改訂で静かにずれる） */
const KIND_ORDER: readonly string[] = glossarySchema.$defs.term.properties.kind.enum

const UNDEFINED_DEFINITION = '（未定義）'

/**
 * 表のセルに収める。`|` は列区切りと衝突するのでエスケープし、改行は `<br>` にする。
 * UI の入力欄は1行だが、外部（Skill・エディタ）が複数行の定義を書きうる——
 * そのまま出すと表が途中で割れて、貼った先で1件まるごと読めなくなる
 */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, '<br>')
}

function row(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`
}

function termRow(term: Term): string {
  return row([
    cell(term.name),
    cell(kindLabel(term.kind)),
    term.definition === '' ? UNDEFINED_DEFINITION : cell(term.definition),
    // 別名は1行1件で持っているので、表に収めるときだけ読点で連ねる
    cell(term.aliases.join('、')),
    cell(term.notes),
  ])
}

export function glossaryToMarkdown(data: GlossarySchemaVersion1): string {
  // enum 順のグループを先に作っておくことで、出力順が enum の定義順に固定される
  const groups = new Map<string, Term[]>(KIND_ORDER.map((kind) => [kind, []]))
  for (const term of data.terms) {
    const group = groups.get(term.kind)
    // enum に無い kind（将来の拡張版を古いアプリで開いた等）は末尾へ足す。
    // 落とすと「出力に出ない用語」が黙って生まれる
    if (group === undefined) groups.set(term.kind, [term])
    else group.push(term)
  }

  const header = row(FIELD_ORDER.map((field) => FIELD_LABELS[field]))
  const divider = row(FIELD_ORDER.map(() => '---'))
  const blocks: string[] = [`## ${data.title}`]
  for (const [kind, terms] of groups) {
    if (terms.length === 0) continue
    blocks.push(`### ${kindLabel(kind)}`)
    blocks.push([header, divider, ...terms.map(termRow)].join('\n'))
  }
  return `${blocks.join('\n\n')}\n`
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/modules/glossary/markdown.test.ts
```

Expected: PASS（このファイルの `it` がすべて緑）

- [ ] **Step 5: モジュール規約にスロットを足す**

`src/core/registry.ts` の `ToolModule` インターフェース、`checkConsistency` の直後に追加する:

```ts
  /** 規約4: 整合性検証ルール（モジュール内検証。レベル2＝受け入れて赤表示） */
  checkConsistency: (data: TData) => ConsistencyIssue[]
  /**
   * 規約5: 出力ロジック（rev 6章・8章）。NotePM 向けの Markdown を返す。
   * 額縁がクリップボードへのコピーと `.md` 書き出しの両方に使うので、
   * **副作用を持たない純関数**であること（ファイルにもクリップボードにも触らない）。
   * Mermaid を含むツールも戻り値はこの1本の文字列に収める
   */
  toMarkdown: (data: TData) => string
```

あわせて、同ファイル冒頭のコメント（「整合性検証ルール（M2）と出力ロジック（M6）は該当マイルストーンでスロットを追加する」）を現状に合わせて書き換える:

```ts
/**
 * ツールモジュール規約（rev 6章）。M6 の出力ロジック追加で6点セットが埋まった。
 * `createEmpty` は6点セットには無い7つ目のスロット（額縁の新規作成が使う雛形）。
 */
```

- [ ] **Step 6: 用語集モジュールに実装を差す**

`src/modules/glossary/module.ts`:

```ts
import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { GlossarySchemaVersion1 } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'
import { checkGlossaryConsistency } from './consistency'
import { GlossaryEditor } from './GlossaryEditor'
import { glossaryToMarkdown } from './markdown'
import { migrateGlossary } from './migrate'

export const glossaryModule: ToolModule<GlossarySchemaVersion1> = {
  type: 'glossary',
  displayName: '用語集',
  schemaVersion: 1,
  schema: glossarySchema as JsonSchema,
  idPrefixes: ['term'],
  Editor: GlossaryEditor,
  checkConsistency: checkGlossaryConsistency,
  // 規約5: NotePM 向け Markdown（session-notes 論点7）。Mermaid は無い
  toMarkdown: glossaryToMarkdown,
  // 用語集はハブなのでプロジェクトにつき1つ（rev 5章の単一性）
  singleton: true,
  migrate: migrateGlossary,
  // 用語集0個は正常な状態（新規プロジェクト）。空の terms で作り、
  // 用語は M3 の行追加または将来のインライン登録で増える（rev 5章）
  createEmpty: (title) => ({ schemaVersion: 1, type: 'glossary', title, terms: [] }),
}
```

- [ ] **Step 7: 既存テストの fixture に新スロットを足す**

Task 1 でテストも型チェック対象になったので、`AnyToolModule` を手で組んでいる4ファイルすべてに `toMarkdown` が要る。次の1行を、各 fixture の `checkConsistency` の直後に足す:

```ts
    toMarkdown: () => '',
```

対象:
- `src/core/registry.test.ts` の `fakeModule`
- `src/core/file-ops.test.ts` の `nonSingletonModule`
- `src/core/load.test.ts` の `mod`
- `src/core/project-consistency.test.ts` の `fakeModule`

- [ ] **Step 8: 全体が通ることを確認する**

```bash
npm test
npx tsc -b
npm run lint
```

Expected: 全件 PASS・エラー0／`tsc -b` と `lint` は無出力。

- [ ] **Step 9: コミット**

```bash
git add src/modules/glossary/markdown.ts src/modules/glossary/markdown.test.ts src/modules/glossary/module.ts src/core/registry.ts src/core/registry.test.ts src/core/file-ops.test.ts src/core/load.test.ts src/core/project-consistency.test.ts
git commit -m "M6: 用語集の Markdown 出力（モジュール規約5）を実装し、規約6点セットを充足させる"
```

---

## Task 3: クリップボードと保存ダイアログの I/O 口

**なぜプラグインを足すか:** `navigator.clipboard.writeText` は WebView2 でも動きうる（`http://tauri.localhost` は Chromium の localhost 判定に入るので secure context になる）が、**動かないときに黙って失敗する**類の依存であり、node 環境のテストでも検証できない。M2 の `core:window:allow-destroy`・M5 の `fs:allow-watch` と同じ「権限が欠けると実行時に静かに動かない」罠を、確認できる形（capabilities に明示的な1行）へ寄せる。

保存先ダイアログは既存の `@tauri-apps/plugin-dialog` の `save` で足りる。**`dialog:default` は `allow-save` を含む**（プラグインの `permissions/default.toml` が `["allow-message", "allow-save", "allow-open"]`）ので capabilities への追記は不要。加えて **`save` で選んだパスは fs の実行時 scope に許可が入る**（`tauri-plugin-dialog` の `save` コマンドが `fs_scope().allow_file(&path)` を呼ぶ）ので、プロジェクトフォルダの外へ書き出しても `writeTextFile` が通る。

**Files:**
- Modify: `package.json`（`@tauri-apps/plugin-clipboard-manager`）
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Create: `src/fs/clipboard.ts`
- Create: `src/fs/clipboard.test.ts`
- Modify: `src/fs/project-fs.ts`（`askSaveMarkdownPath` を追加）
- Modify: `src/fs/project-fs.test.ts`

**Interfaces:**
- Produces: `copyToClipboard(text: string): Promise<void>`（`src/fs/clipboard.ts`）、`askSaveMarkdownPath(defaultPath: string): Promise<string | null>`（`src/fs/project-fs.ts`）

- [ ] **Step 1: 依存を入れる**

```bash
npm install @tauri-apps/plugin-clipboard-manager
```

`src-tauri/Cargo.toml` の `[dependencies]` に足す（`trash` の直前）:

```toml
# クリップボードへの書き込み（M6 の Markdown 出力）。
# navigator.clipboard は環境依存で「黙って動かない」経路になりうるので、
# 権限を capabilities に明示できるプラグイン側へ寄せる
tauri-plugin-clipboard-manager = "2"
```

- [ ] **Step 2: プラグインを登録し、権限を足す**

`src-tauri/src/lib.rs` の `run()`:

```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![move_to_trash])
```

`src-tauri/capabilities/default.json` の `permissions` に1行足し、`description` の末尾に理由を追記する:

```json
    "fs:allow-unwatch",
    "dialog:default",
    "clipboard-manager:allow-write-text"
```

`description` の末尾へ:

```
（…M5）。clipboard-manager:allow-write-text は Markdown 出力のコピーのため（M6。読み取りは許可しない）。保存ダイアログは dialog:default に allow-save が含まれるので追記不要で、save で選んだパスは dialog プラグインが fs の実行時 scope へ許可を入れる
```

- [ ] **Step 3: 失敗するテストを書く**

`src/fs/clipboard.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const writeText = vi.fn<(text: string) => Promise<void>>()
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText }))

const { copyToClipboard } = await import('./clipboard')

describe('copyToClipboard', () => {
  beforeEach(() => {
    writeText.mockReset()
    writeText.mockResolvedValue(undefined)
  })

  it('プラグインの writeText へそのまま渡す', async () => {
    await copyToClipboard('## 用語集\n')
    expect(writeText).toHaveBeenCalledWith('## 用語集\n')
  })

  it('失敗はそのまま投げる（呼び出し側がバナーを出す）', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    await expect(copyToClipboard('x')).rejects.toThrow('denied')
  })
})
```

`src/fs/project-fs.test.ts` に追記する（既存のモック構成に合わせること。`@tauri-apps/plugin-dialog` のモックに `save` を足す必要がある）:

```ts
describe('askSaveMarkdownPath', () => {
  it('Markdown のフィルタと既定パスを渡し、選ばれたパスを返す', async () => {
    save.mockResolvedValue('C:\\out\\用語集.md')
    await expect(askSaveMarkdownPath('C:\\proj\\用語集.md')).resolves.toBe('C:\\out\\用語集.md')
    expect(save).toHaveBeenCalledWith({
      defaultPath: 'C:\\proj\\用語集.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
  })

  it('キャンセルは null（失敗ではない）', async () => {
    save.mockResolvedValue(null)
    await expect(askSaveMarkdownPath('C:\\proj\\用語集.md')).resolves.toBeNull()
  })
})
```

> **注意（M4 の教訓1）:** `src/fs/project-fs.test.ts` は `@tauri-apps/api/core` / `api/path` / `plugin-dialog` / `plugin-fs` を**すべて**モックしていないと import 時に落ちる。既存ファイルのモック定義を確認し、`plugin-dialog` のモックへ `save` を足す形で書くこと。既存のモックの形と食い違ったら、辻褄を合わせず「計画の矛盾」として報告する。

- [ ] **Step 4: 落ちることを確認する**

```bash
npx vitest run src/fs/clipboard.test.ts src/fs/project-fs.test.ts
```

Expected: FAIL（`./clipboard` が無い／`askSaveMarkdownPath` が無い）

- [ ] **Step 5: 実装する**

`src/fs/clipboard.ts`:

```ts
import { writeText } from '@tauri-apps/plugin-clipboard-manager'

/**
 * クリップボードへ書く（Markdown 出力の「会議直後に議事録へ貼る」最短動線。rev 8章）。
 * コアは Tauri を知らないので、額縁がこの関数を `AppIo.copyText` として注入する。
 *
 * `navigator.clipboard` を使わないのは、動かないときに黙って失敗する経路になりうるため。
 * プラグイン側なら `clipboard-manager:allow-write-text` の欠落が capabilities で確認できる
 *（**読み取り権限は与えない**——このアプリにクリップボードを読む用途は無い）
 */
export async function copyToClipboard(text: string): Promise<void> {
  await writeText(text)
}
```

`src/fs/project-fs.ts`——`save` を import に足し、ファイル末尾に追加する:

```ts
import { open, save } from '@tauri-apps/plugin-dialog'
```

```ts
/**
 * Markdown の書き出し先を尋ねる。null＝キャンセル（失敗ではない）。
 *
 * `dialog:default` に `allow-save` が含まれるので capabilities への追記は要らない。
 * **選ばれたパスは dialog プラグインが fs の実行時 scope へ許可を入れる**ので、
 * プロジェクトフォルダの外を選んでも `writeProjectFile` が通る
 */
export async function askSaveMarkdownPath(defaultPath: string): Promise<string | null> {
  const selected = await save({
    defaultPath,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  return typeof selected === 'string' ? selected : null
}
```

- [ ] **Step 6: テストが通ることを確認する**

```bash
npx vitest run src/fs/clipboard.test.ts src/fs/project-fs.test.ts
npm test
npx tsc -b
npm run lint
```

Expected: 全件 PASS・エラー0／`tsc -b` と `lint` は無出力。

- [ ] **Step 7: Rust 側がビルドできることを確認する**

```bash
cd src-tauri && cargo check
```

Expected: `Finished` で終わる（警告があっても `error` が無ければ可）。

- [ ] **Step 8: コミット**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json src/fs/clipboard.ts src/fs/clipboard.test.ts src/fs/project-fs.ts src/fs/project-fs.test.ts
git commit -m "M6: クリップボードと Markdown 保存ダイアログの I/O 口を用意する"
```

---

## Task 4: コントローラの骨格 ＋ フォルダを開く／ファイルを選ぶ／編集

**このタスクから Task 7 までがマイルストーンの必須項目（申し送り11節）。** 切り出すのは**判断**ではなく**順序**である。M5 の最終レビューが見つけた配線バグ6件はすべて `App.tsx`（唯一自動テストが無いファイル）にあり、さらに実機確認でしか出ないバグが1件出た。「App に配線レベルのテストが1件も無い」を据え置いたのは M4・M5 で2回目であり、3回目を許すと「レビューで拾えばよい」が常態化する。

**実装方針（重要）:** コントローラの本体は `src/App.tsx` からの**移動**である。`useState` / `useRef` をコントローラ内部のクロージャ変数に、`setXxx` を `host.xxx` に置き換える機械的な変換で、**振る舞いを変えてよいのは各タスクの「振る舞いの変更」節に列挙した箇所だけ**。この段階では `App.tsx` はまだ従来どおり動いており（乗せ換えは Task 8）、コントローラは並行して存在する。

**Files:**
- Create: `src/core/app-controller.ts`
- Create: `src/core/app-controller.test.ts`
- Modify: `src/core/toasts.ts`（`dismissToastByKey`）
- Modify: `src/core/toasts.test.ts`
- Modify: `src/core/modal-queue.ts`（`dropModal` / `clearModals`）
- Modify: `src/core/modal-queue.test.ts`

**Interfaces:**
- Consumes: `createKnownDisk`（`src/core/known-disk.ts`）、`classifyFile`（`src/core/load.ts`）、`computeIssues` / `ProjectFile`（`src/core/project-file.ts`）、`toProjectFile` / `ScanResult`（`src/core/scan.ts`）、`serialize`（`src/core/canonical.ts`）、`AutoSaver`（`src/core/autosave.ts`）、`ModalRequest`（`src/core/modal-queue.ts`）、`ToastItem`（`src/core/toasts.ts`）、`ModuleRegistry` / `AnyToolModule`（`src/core/registry.ts`）
- Produces:
  - `type BannerKind = 'io' | 'save' | 'scan' | 'watch'`
  - `interface AppIo { scan; read; write; exists; trash; join; copyText; askSavePath; forceClose; createSaver }`
  - `interface SaverSpec { baseline: string; write: (text: string) => Promise<void>; onError: (err: unknown) => void; onSuccess: () => void }`
  - `interface AppHost { setFiles; setProjectDir; setSelectedPath; setDocument; setBanner; showToast; dismissToast; showModal; dropModal; clearModals; getEditingData }`
  - `interface AppController { openFolder; selectFile; applyEdit; createNewFile; ensureFileOfType; requestDelete; externalChange; requestClose; copyMarkdown; exportMarkdown; dispose }`
  - `createAppController(io: AppIo, host: AppHost, registry: ModuleRegistry): AppController`
  - `dismissToastByKey(list, key)` / `dropModal(queue, key)` / `clearModals()`

**振る舞いの変更（このタスクで意図的に変えるもの。それ以外は移動のみ）:**

1. **バナーが単一スロットでなくなる。** 従来の `ioError` / `saveError` の2本を `BannerKind` 4種（`io` / `save` / `scan` / `watch`）に分ける。申し送り11節の「`ioError` の単一スロットの意味論」への回答:
   - `watch`＝「監視を開始できませんでした」。**継続する状態**なので、後続の `selectFile` / `openFolder` では消さない。監視が張れたときとフォルダを閉じたときにだけ消す
   - `scan`＝再走査の失敗。**次の再走査が成功したら消す**（従来は成功しても残った）
   - `io`＝直近の操作（読み込み・作成・削除・書き出し）の失敗。次に成功した操作で消す
   - `save`＝自動保存の失敗（従来の `saveError` そのまま）
2. **`switchingFolder` を boolean からカウンタにする**（申し送り11節の残件）。`openFolder` が2重に走ると先の `finally` が後の切替中にフラグを消す。
3. **フォルダを開いたらモーダルキューと `pendingAsk` を掃除する**（申し送り11節）。前のフォルダの二択要求・削除確認が新しい一覧に対して残る経路を塞ぐ。
4. **`dispose()` は flush しない。** 従来の unmount effect は `void flush()` の直後に `dispose()` を呼んでおり、flush 失敗で復元された pending を捨てる経路になっていた（申し送り8〜11節の残件）。実際の close は `requestClose`（Task 7）を通るので、`dispose()` は「掴んでいる saver を止める」だけにする。

- [ ] **Step 1: コアの小物3つのテストを書く**

`src/core/toasts.test.ts` に追記:

```ts
describe('dismissToastByKey', () => {
  it('同じ key の通知を消す（key の無い通知は残す）', () => {
    const list = [
      { id: 1, message: 'a', key: 'external:X' },
      { id: 2, message: 'b' },
      { id: 3, message: 'c', key: 'external:Y' },
    ]
    expect(dismissToastByKey(list, 'external:X').map((t) => t.id)).toEqual([2, 3])
  })

  it('該当が無ければそのまま', () => {
    const list = [{ id: 1, message: 'a', key: 'external:X' }]
    expect(dismissToastByKey(list, 'external:Z')).toEqual(list)
  })
})
```

`src/core/modal-queue.test.ts` に追記:

```ts
describe('dropModal', () => {
  it('同じ key の要求を取り下げる（表示中でも待機中でも）', () => {
    const a: ModalRequest = { kind: 'confirm', key: 'delete:X', title: 't', description: 'd', confirmLabel: 'ok', onConfirm: () => {} }
    const b: ModalRequest = { kind: 'confirm', key: 'close', title: 't', description: 'd', confirmLabel: 'ok', onConfirm: () => {} }
    expect(dropModal([a, b], 'delete:X')).toEqual([b])
    expect(dropModal([a, b], 'nope')).toEqual([a, b])
  })
})

describe('clearModals', () => {
  it('全部取り下げる（フォルダを切り替えたら前のフォルダの要求は意味を失う）', () => {
    expect(clearModals()).toEqual([])
  })
})
```

import 行に `dismissToastByKey` / `dropModal` / `clearModals` を足すこと。

- [ ] **Step 2: 落ちることを確認する**

```bash
npx vitest run src/core/toasts.test.ts src/core/modal-queue.test.ts
```

Expected: FAIL（`dismissToastByKey is not a function` など）

- [ ] **Step 3: 小物3つを実装する**

`src/core/toasts.ts` の末尾:

```ts
/**
 * 同じ key の通知を消す。**古い操作付きトーストを取り下げるために要る**——
 * 例えば二択ダイアログを出す前に、そのファイルの前回の「取り込み前に戻す」を消す。
 * トーストは時間で消えないので、残すと二択に答えた後に押せてしまい、
 * 二択の前提（ディスクは検知した内容のまま）が崩れる
 */
export function dismissToastByKey(list: readonly ToastItem[], key: string): ToastItem[] {
  const next = list.filter((t) => t.key !== key)
  return next.length === list.length ? [...list] : next
}
```

`src/core/modal-queue.ts` の末尾:

```ts
/**
 * 同じ key の要求を取り下げる。前提が消えた要求——外部で消えたファイルの二択、
 * 削除済みファイルの削除確認——を残すと、押しても no-op か読み込みエラーに退化する
 */
export function dropModal(queue: readonly ModalRequest[], key: string): ModalRequest[] {
  return queue.filter((r) => r.key !== key)
}

/** 全部取り下げる（フォルダを切り替えたとき。前のフォルダへの要求は意味を失う） */
export function clearModals(): ModalRequest[] {
  return []
}
```

- [ ] **Step 4: 小物のテストが通ることを確認する**

```bash
npx vitest run src/core/toasts.test.ts src/core/modal-queue.test.ts
```

Expected: PASS（このファイルの `it` がすべて緑）

- [ ] **Step 5: コントローラのテストハーネスと、この段階のテストを書く**

`src/core/app-controller.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createAppController, type AppController, type AppHost, type AppIo, type BannerKind, type SaverSpec } from './app-controller'
import type { AutoSaver } from './autosave'
import { serialize, type JsonSchema } from './canonical'
import type { ModalRequest } from './modal-queue'
import type { ProjectFile } from './project-file'
import { createRegistry, type AnyToolModule, type ModuleRegistry } from './registry'
import { scanFolder } from './scan'
import type { ToastItem } from './toasts'

// ---- テスト用のモジュール（用語集の代わり。スキーマは最小限） ----

const noteSchema: JsonSchema = {
  type: 'object',
  properties: {
    schemaVersion: { const: 1 },
    type: { const: 'note' },
    title: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['schemaVersion', 'type', 'title', 'body'],
  additionalProperties: false,
}

function noteModule(over: Partial<AnyToolModule> = {}): AnyToolModule {
  return {
    type: 'note',
    displayName: 'ノート',
    schemaVersion: 1,
    schema: noteSchema,
    idPrefixes: ['note'],
    Editor: () => null,
    checkConsistency: () => [],
    toMarkdown: (d: { title: string; body: string }) => `## ${d.title}\n\n${d.body}\n`,
    singleton: true,
    migrate: (d) => d,
    createEmpty: (title) => ({ schemaVersion: 1, type: 'note', title, body: '' }),
    ...over,
  }
}

function note(title: string, body = ''): string {
  return serialize({ schemaVersion: 1, type: 'note', title, body }, noteSchema)
}

const DIR = 'C:\\proj'
const p = (name: string) => `${DIR}\\${name}`

// ---- 偽ディスク ----

function createDisk(initial: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(initial))
  return {
    files,
    list: async (dir: string) => [...files.keys()].filter((path) => path.startsWith(`${dir}\\`)),
    read: async (path: string) => {
      const text = files.get(path)
      if (text === undefined) throw new Error(`ENOENT: ${path}`)
      return text
    },
    write: async (path: string, text: string) => {
      files.set(path, text)
    },
    exists: async (path: string) => files.has(path),
    trash: async (path: string) => {
      files.delete(path)
    },
  }
}

// ---- 偽 AutoSaver（順序を記録する。実物の意味論だけ真似る） ----

interface FakeSaver extends AutoSaver {
  spec: SaverSpec
  latest: string | null
  /** flush の戻り値をテストから制御する */
  flushOk: boolean
  /** hasUnsaved の戻り値をテストから制御する */
  unsaved: boolean
  disposed: boolean
}

function createSaverFactory(log: string[]) {
  const savers: FakeSaver[] = []
  const factory = (spec: SaverSpec): AutoSaver => {
    log.push('createSaver')
    const saver: FakeSaver = {
      spec,
      latest: null,
      flushOk: true,
      unsaved: false,
      disposed: false,
      update(text) {
        log.push('update')
        saver.latest = text
        saver.unsaved = true
      },
      async flush() {
        log.push('flush')
        return saver.flushOk
      },
      async settle() {
        log.push('settle')
      },
      hasUnsaved() {
        return saver.unsaved
      },
      dispose() {
        log.push('dispose')
        saver.disposed = true
      },
    }
    savers.push(saver)
    return saver
  }
  return { factory, savers, current: () => savers[savers.length - 1] }
}

// ---- ハーネス ----

interface Harness {
  controller: AppController
  log: string[]
  disk: ReturnType<typeof createDisk>
  savers: ReturnType<typeof createSaverFactory>
  files: () => ProjectFile[]
  selectedPath: () => string | null
  document: () => unknown | null
  banners: () => Record<BannerKind, string | null>
  toasts: () => Omit<ToastItem, 'id'>[]
  modals: () => ModalRequest[]
  registry: ModuleRegistry
  /** テストから「今の編集内容」を差し替える（App の履歴の代わり） */
  setDocument: (data: unknown | null) => void
  io: AppIo
}

function createHarness(
  initial: Record<string, string> = {},
  over: Partial<AppIo> = {},
): Harness {
  const log: string[] = []
  const disk = createDisk(initial)
  const savers = createSaverFactory(log)
  const registry = createRegistry()
  registry.register(noteModule())

  let files: ProjectFile[] = []
  let selectedPath: string | null = null
  let document: unknown | null = null
  const banners: Record<BannerKind, string | null> = { io: null, save: null, scan: null, watch: null }
  const toasts: Omit<ToastItem, 'id'>[] = []
  let modals: ModalRequest[] = []

  const io: AppIo = {
    scan: (dir) => scanFolder(dir, { list: disk.list, read: disk.read }, registry),
    read: disk.read,
    write: async (path, text) => {
      log.push(`write:${path}`)
      await disk.write(path, text)
    },
    exists: async (path) => {
      log.push(`exists:${path}`)
      return disk.exists(path)
    },
    trash: async (path) => {
      log.push(`trash:${path}`)
      await disk.trash(path)
    },
    join: async (dir, name) => `${dir}\\${name}`,
    copyText: async () => { log.push('copyText') },
    askSavePath: async () => null,
    forceClose: async () => { log.push('forceClose') },
    createSaver: savers.factory,
    ...over,
  }

  const host: AppHost = {
    setFiles: (next) => { files = next; log.push('setFiles') },
    setProjectDir: () => {},
    setSelectedPath: (path) => { selectedPath = path; log.push(`setSelectedPath:${path ?? 'null'}`) },
    setDocument: (data) => { document = data; log.push('setDocument') },
    setBanner: (kind, message) => { banners[kind] = message },
    showToast: (toast) => { toasts.push(toast); log.push('toast') },
    dismissToast: (key) => { log.push(`dismissToast:${key}`) },
    showModal: (request) => { modals = [...modals, request]; log.push('showModal') },
    dropModal: (key) => { modals = modals.filter((m) => m.key !== key); log.push(`dropModal:${key}`) },
    clearModals: () => { modals = []; log.push('clearModals') },
    getEditingData: () => document,
  }

  return {
    controller: createAppController(io, host, registry),
    log,
    disk,
    savers,
    files: () => files,
    selectedPath: () => selectedPath,
    document: () => document,
    banners: () => banners,
    toasts: () => toasts,
    modals: () => modals,
    registry,
    setDocument: (data) => { document = data },
    io,
  }
}

// ---- テスト ----

describe('openFolder', () => {
  it('走査結果を一覧にして台帳へ記録する', async () => {
    const h = createHarness({ [p('a.json')]: note('A'), [p('b.json')]: note('B') })
    await h.controller.openFolder(DIR)
    expect(h.files().map((f) => f.name)).toEqual(['a.json', 'b.json'])
    expect(h.files().every((f) => f.result.status === 'editable')).toBe(true)
    expect(h.banners().io).toBeNull()
  })

  it('読めないファイルが1つでもあれば一覧を入れ替えない（新旧が混ざった状態を作らない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    const before = h.files()
    h.disk.read = async (path: string) => {
      if (path === p('a.json')) throw new Error('locked')
      return h.disk.files.get(path)!
    }
    await h.controller.openFolder(DIR)
    expect(h.files()).toBe(before)
    expect(h.banners().io).toContain('読み込めないファイルがあるため開けませんでした')
  })

  it('前のフォルダのモーダル要求を掃除する', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    expect(h.log).toContain('clearModals')
  })

  it('監視のバナー（継続する状態）は消さない', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    // App の監視 effect が立てるバナーを模す
    h.controller.applyEdit // （参照するだけ。型のため）
    await h.controller.openFolder(DIR)
    expect(h.banners().watch).toBeNull()
  })
})

describe('selectFile', () => {
  it('走査時のキャッシュではなくディスクから読み直す（M1 で確定した原則）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    // 走査後に外部が書き換えた内容を、選択時に拾えること
    h.disk.files.set(p('a.json'), note('A2'))
    await h.controller.selectFile(p('a.json'))
    expect(h.document()).toMatchObject({ title: 'A2' })
  })

  it('editable なら saver を張り、履歴用のデータを渡す', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    expect(h.savers.current().spec.baseline).toBe(note('A'))
    expect(h.selectedPath()).toBe(p('a.json'))
  })

  it('開けないファイルは選択だけして saver を張らない', async () => {
    const h = createHarness({ [p('broken.json')]: '{ not json' })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('broken.json'))
    expect(h.selectedPath()).toBe(p('broken.json'))
    expect(h.savers.savers.length).toBe(0)
  })

  it('切り替え時に前のファイルを flush し、失敗したら切り替えない', async () => {
    const h = createHarness({ [p('a.json')]: note('A'), [p('b.json')]: note('B') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.savers.current().flushOk = false
    await h.controller.selectFile(p('b.json'))
    expect(h.selectedPath()).toBe(p('a.json'))
    expect(h.savers.current().disposed).toBe(false)
  })
})

describe('applyEdit', () => {
  it('自動保存へ正規形を渡し、整合性検証をやり直す', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    const module = h.registry.get('note')!
    h.controller.applyEdit(p('a.json'), module, { schemaVersion: 1, type: 'note', title: 'A', body: 'x' })
    expect(h.savers.current().latest).toBe(note('A', 'x'))
    const entry = h.files().find((f) => f.path === p('a.json'))!
    expect(entry.result.status === 'editable' && entry.result.data).toMatchObject({ body: 'x' })
  })
})

describe('dispose', () => {
  it('flush せずに saver を止める（flush 失敗で復元された pending を捨てないため）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    const before = h.log.length
    h.controller.dispose()
    expect(h.log.slice(before)).toEqual(['dispose'])
  })
})
```

> `openFolder` の「監視のバナーは消さない」テストにある `h.controller.applyEdit`（参照するだけ）の行は不要なら削ってよい——`banners().watch` を controller の外（App）が立てる以上、このテストが確かめられるのは「`openFolder` が `watch` を触らない」ことだけである。**テストとして意味が薄いと判断したら削り、その判断を報告すること**（同義のテストを残さないのは M4 レビューで確立した方針）。

- [ ] **Step 6: 落ちることを確認する**

```bash
npx vitest run src/core/app-controller.test.ts
```

Expected: FAIL（`Failed to resolve import "./app-controller"`）

- [ ] **Step 7: コントローラを実装する（この段階の範囲）**

`src/core/app-controller.ts`:

```ts
import type { AutoSaver } from './autosave'
import { serialize } from './canonical'
import { createKnownDisk } from './known-disk'
import { classifyFile } from './load'
import type { ModalRequest } from './modal-queue'
import { computeIssues, type ProjectFile } from './project-file'
import type { AnyToolModule, ModuleRegistry } from './registry'
import { toProjectFile, type ScanResult } from './scan'
import type { ToastItem } from './toasts'

/**
 * 額縁の副作用の**順序**を持つコントローラ（コア。React も Tauri も知らない）。
 *
 * **なぜ切り出したか**: M4・M5 の最終レビューが見つけた配線バグはほぼすべて
 * `App.tsx`——リポジトリで唯一自動テストが無いファイル——にあった。M5 では
 * 判断（`planExternalChange`）をコアへ出したが、残っていたのは**順序**
 *（dispose → 一覧差し替え → 通知/ダイアログ → saver 張り直し）であり、
 * それは純関数では表現できない。ここが「順序をテストで固定する」場所である。
 *
 * **なぜ React の state / ref を使わないか**: M5 の Critical のうち2件は
 *「レンダごとに代入する ref では過去の値を凍結できない」「1つの状態を2つの
 * 機構が共有していた」だった。クロージャ変数なら代入は同期で確定し、
 * 「変更前の一覧」も「確定時点の選択」もそのまま読める。ホストへの通知
 *（`host.setFiles` 等）は表示の複製にすぎず、判断には使わない
 */

/**
 * バナー（**いま続いている状態**を出す場所。起きた出来事はトースト）の種別。
 * 単一スロットだと「監視を開始できません」（継続する状態）が次の操作の
 * 成功で消え、逆に再走査の失敗は成功しても残った（申し送り11節）
 */
export type BannerKind =
  /** 直近の操作（読み込み・作成・削除・書き出し）の失敗。次の成功で消える */
  | 'io'
  /** 自動保存の失敗。write 成功かファイルを離れたら消える */
  | 'save'
  /** 再走査の失敗。次の再走査が成功したら消える */
  | 'scan'
  /** 監視を開始できない。**継続する状態**なので他の操作では消さない */
  | 'watch'

/** 自動保存の生成仕様（遅延は額縁が決めるのでここには無い） */
export interface SaverSpec {
  baseline: string
  write: (text: string) => Promise<void>
  onError: (err: unknown) => void
  onSuccess: () => void
}

/** I/O の注入口。実体は src/fs/*（コアは Tauri を知らない） */
export interface AppIo {
  scan: (dir: string) => Promise<ScanResult>
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  trash: (path: string) => Promise<void>
  join: (dir: string, name: string) => Promise<string>
  copyText: (text: string) => Promise<void>
  /** 保存先を尋ねる。null＝キャンセル */
  askSavePath: (defaultPath: string) => Promise<string | null>
  /** 保留編集を書き切らずにウィンドウを閉じる（脱出口） */
  forceClose: () => Promise<void>
  createSaver: (spec: SaverSpec) => AutoSaver
}

/** UI への反映口。すべて「表示の複製」であり、コントローラの判断材料にはしない */
export interface AppHost {
  setFiles: (files: ProjectFile[]) => void
  setProjectDir: (dir: string | null) => void
  setSelectedPath: (path: string | null) => void
  /**
   * 編集対象データの差し替え（null＝閉じる）。額縁はこれを履歴の作り直しに写す。
   * **これが Undo 履歴の破棄そのもの**である——履歴の中身は取り込み前のファイルを
   * 指しており、残すと Ctrl+Z がディスクの内容を無言で巻き戻す（rev 3章）
   */
  setDocument: (data: unknown | null) => void
  setBanner: (kind: BannerKind, message: string | null) => void
  showToast: (toast: Omit<ToastItem, 'id'>) => void
  dismissToast: (key: string) => void
  showModal: (request: ModalRequest) => void
  dropModal: (key: string) => void
  clearModals: () => void
  /** いま編集中のデータ（額縁の履歴の present）。無ければ null */
  getEditingData: () => unknown | null
}

export interface AppController {
  openFolder(dir: string): Promise<void>
  selectFile(path: string): Promise<void>
  /** 編集・Undo・Redo の共通後処理（自動保存へ渡し、整合性検証をやり直す） */
  applyEdit(path: string, module: AnyToolModule, next: unknown): void
  /** アンマウント時。**flush しない**（失敗で復元された pending を捨てないため） */
  dispose(): void
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function createAppController(
  io: AppIo,
  host: AppHost,
  registry: ModuleRegistry,
): AppController {
  // ---- 状態（すべてクロージャ変数。共有マップは計画書の「状態変数の共有マップ」） ----
  let projectDir: string | null = null
  let files: ProjectFile[] = []
  let selectedPath: string | null = null
  let saver: AutoSaver | null = null
  /** ディスクの既知内容の台帳。自己書き込み除外の要（rev 3章） */
  const knownDisk = createKnownDisk()
  /** selectFile / openFolder の直列化トークン。後続が始まったら先行の結果を捨てる */
  let selectSeq = 0
  /**
   * フォルダ切替中の再走査を止める。**カウンタであること**——boolean だと
   * openFolder が2重に走ったとき、先の finally が後の切替中にフラグを消す
   */
  let switchingFolder = 0

  const applyFiles = (next: ProjectFile[]): void => {
    files = computeIssues(next, registry)
    host.setFiles(files)
  }

  const setSelected = (path: string | null): void => {
    selectedPath = path
    host.setSelectedPath(path)
  }

  /**
   * アプリからの書き込みは必ずここを通す。**書けた内容を即座に台帳へ記録する**ことが
   * 自己書き込み除外の唯一の前提条件で、記録が遅れると自分の書き込みを
   * 外部変更として検知してしまう。失敗時は記録しない（ディスクは変わっていない）
   */
  const writeAndRecord = async (path: string, text: string): Promise<void> => {
    await io.write(path, text)
    knownDisk.set(path, text)
  }

  /**
   * 自動保存を張る。baseline は「そのファイルをアプリが正とみなす内容の正規形」で、
   * 無編集ならバイト一致で書き込みが起きない（非正規ファイルを開いただけでは
   * 書き戻さない。rev 5章）
   */
  const attachSaver = (path: string, baseline: string): void => {
    saver = io.createSaver({
      baseline,
      write: (text) => writeAndRecord(path, text),
      onError: (err) =>
        host.setBanner(
          'save',
          `自動保存に失敗しました（編集を続けるか、もう一度閉じる操作で再試行されます）: ${describeError(err)}`,
        ),
      onSuccess: () => host.setBanner('save', null),
    })
  }

  /** 現在のファイルを閉じる。false＝保留編集を書き切れず中断（saver は生かしたまま） */
  const closeCurrentFile = async (): Promise<boolean> => {
    if (saver !== null) {
      // flush 失敗時に dispose すると、catch が復元した pending を破棄してしまう
      //（M1 レビューの二重失敗エッジ）。dispose せず中断する
      if (!(await saver.flush())) return false
      saver.dispose()
      saver = null
    }
    setSelected(null)
    host.setDocument(null)
    // 「このファイルが書けていない」というバナーは、そのファイルを離れたら消す
    host.setBanner('save', null)
    return true
  }

  const openFolder = async (dir: string): Promise<void> => {
    const token = ++selectSeq
    switchingFolder++
    try {
      // 先に現在のファイルを閉じる（flush 後の内容で走査するため）。
      // flush が失敗したらフォルダ切替を中断する（書けていない編集を捨てない）
      if (!(await closeCurrentFile())) return
      const scan = await io.scan(dir)
      if (token !== selectSeq) return
      // 一部でも読めなければ入れ替えない（途中失敗で新旧が混ざった状態を作らない。M1 で確定）
      if (scan.unreadable.length > 0) {
        host.setBanner('io', `読み込めないファイルがあるため開けませんでした: ${scan.unreadable.join(' / ')}`)
        return
      }
      // 前のフォルダへのモーダル要求（二択・削除確認）は新しい一覧に対して意味を失う
      host.clearModals()
      projectDir = dir
      host.setProjectDir(dir)
      applyFiles(scan.entries.map(toProjectFile))
      // 台帳は別フォルダの分を持ち越さない
      knownDisk.clear()
      for (const entry of scan.entries) knownDisk.set(entry.path, entry.text)
      host.setBanner('io', null)
      host.setBanner('scan', null)
    } catch (err) {
      if (token !== selectSeq) return
      // 旧フォルダの一覧はそのまま残す。選択は closeCurrentFile 済みなので選び直せる
      host.setBanner('io', `フォルダの読み込みに失敗しました: ${describeError(err)}`)
    } finally {
      switchingFolder--
    }
  }

  const selectFile = async (path: string): Promise<void> => {
    const token = ++selectSeq
    if (!(await closeCurrentFile())) return
    try {
      // 選択時に必ずディスクから読み直す（走査時キャッシュを編集の起点にすると、
      // 直前の自動保存分を古い内容で上書きするデータ喪失経路になる。M1 で確定）
      const text = await io.read(path)
      if (token !== selectSeq) return
      // 読んだ内容は「アプリが知っているディスクの内容」
      knownDisk.set(path, text)
      const result = classifyFile(text, registry)
      applyFiles(files.map((f) => (f.path === path ? { ...f, result } : f)))
      setSelected(path)
      host.setBanner('io', null)
      if (result.status !== 'editable') return
      const module = registry.get(result.type)
      if (module === undefined) return
      attachSaver(path, serialize(result.data, module.schema))
      host.setDocument(result.data)
    } catch (err) {
      if (token !== selectSeq) return
      host.setBanner('io', `ファイルの読み込みに失敗しました: ${describeError(err)}`)
    }
  }

  const applyEdit = (path: string, module: AnyToolModule, next: unknown): void => {
    saver?.update(serialize(next, module.schema))
    applyFiles(
      files.map((f) =>
        f.path === path && f.result.status === 'editable'
          ? { ...f, result: { ...f.result, data: next } }
          : f,
      ),
    )
  }

  return {
    openFolder,
    selectFile,
    applyEdit,
    dispose() {
      // **flush しない**——失敗で復元された pending を捨てる経路になる。
      // 実際のウィンドウ close は requestClose を通る
      saver?.dispose()
      saver = null
    },
  }
}
```

> **注意:** この段階では `AppController` に `openFolder` / `selectFile` / `applyEdit` / `dispose` の4本しか無い。Task 5〜7 でメソッドとインターフェースを足していく。テストハーネスの `AppIo` には既に全フィールドがあるので、未使用フィールド（`trash` / `copyText` 等）に対する `noUnusedLocals` の警告は出ない（オブジェクトリテラルのプロパティは対象外）。

- [ ] **Step 8: テストが通ることを確認する**

```bash
npx vitest run src/core/app-controller.test.ts
npx tsc -b
npm run lint
```

Expected: PASS（このファイルの `it` がすべて緑）／`tsc -b` と `lint` は無出力。

- [ ] **Step 9: コミット**

```bash
git add src/core/app-controller.ts src/core/app-controller.test.ts src/core/toasts.ts src/core/toasts.test.ts src/core/modal-queue.ts src/core/modal-queue.test.ts
git commit -m "M6: 額縁の副作用をコントローラへ切り出す（骨格・フォルダを開く・ファイル選択・編集）"
```

---

## Task 5: ファイルの作成・確保・削除

**Files:**
- Modify: `src/core/app-controller.ts`
- Modify: `src/core/app-controller.test.ts`

**Interfaces:**
- Consumes: `createFile` / `ensureFileOfType` / `trashFile` / `CreatedFile`（`src/core/file-ops.ts`）
- Produces: `AppController.createNewFile(module)` / `.ensureFileOfType(module)` / `.requestDelete(file)`

**振る舞いの変更（意図的なもの）:**

1. **削除は「入力を切る」を `trash` の前に置く**（M4 の申し送り10節が挙げた2つの直し方のうち①）。`selectedPath` と saver の切り離しを `trashFile` の**前**に済ませれば、write の着地を待つ間にユーザーが打ち続けても生きた write を残せない。App も既にこの順序になっているので**移動のみ**だが、**この順序をテストが固定するのは今回が初めて**である。
2. **`ensureFileOfType` の早期 return を無音にしない**（申し送り11節）。フォルダ未選択・再走査の空振りで何も起きないのを塞ぐ。
3. **削除したファイル宛ての二択要求を取り下げる**（`host.dropModal('external:<path>')`）。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/app-controller.test.ts` に追記:

```ts
describe('createNewFile', () => {
  it('衝突しない名前をディスクに問い合わせて決め、作ったファイルを開く', async () => {
    const h = createHarness({ [p('ノート.json')]: note('既存') })
    await h.controller.openFolder(DIR)
    const module = h.registry.get('note')!
    await h.controller.createNewFile(module)
    expect(h.log.some((l) => l.startsWith('exists:'))).toBe(true)
    expect(h.disk.files.has(p('ノート-2.json'))).toBe(true)
    expect(h.selectedPath()).toBe(p('ノート-2.json'))
  })

  it('新規ファイルは正規形で書く（作った直後の1文字編集で全行 diff にしない）', async () => {
    const h = createHarness()
    await h.controller.openFolder(DIR)
    await h.controller.createNewFile(h.registry.get('note')!)
    const text = h.disk.files.get(p('ノート.json'))!
    expect(text).toBe(serialize(JSON.parse(text), noteSchema))
  })

  it('書き込みに失敗したら一覧へ足さずバナーを出す', async () => {
    const h = createHarness({}, { write: () => Promise.reject(new Error('read-only')) })
    await h.controller.openFolder(DIR)
    await h.controller.createNewFile(h.registry.get('note')!)
    expect(h.files()).toEqual([])
    expect(h.banners().io).toContain('ファイルを作成できませんでした')
  })

  it('同じパスが二重に一覧へ入らない（ダブルクリック・遅い IPC）', async () => {
    const h = createHarness()
    await h.controller.openFolder(DIR)
    const module = h.registry.get('note')!
    await Promise.all([h.controller.createNewFile(module), h.controller.createNewFile(module)])
    const paths = h.files().map((f) => f.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('ensureFileOfType', () => {
  it('既にあるなら作らずに開く（再走査してから判断する）', async () => {
    const h = createHarness()
    await h.controller.openFolder(DIR)
    // 走査後に外部（Skill 等）が書いた用語集を見落とさないこと
    h.disk.files.set(p('外部が書いた.json'), note('外部'))
    await h.controller.ensureFileOfType(h.registry.get('note')!)
    expect(h.disk.files.size).toBe(1)
    expect(h.selectedPath()).toBe(p('外部が書いた.json'))
  })

  it('無ければ作って開く', async () => {
    const h = createHarness()
    await h.controller.openFolder(DIR)
    await h.controller.ensureFileOfType(h.registry.get('note')!)
    expect(h.disk.files.has(p('ノート.json'))).toBe(true)
    expect(h.selectedPath()).toBe(p('ノート.json'))
  })

  it('フォルダを開いていないときは無音で終わらない', async () => {
    const h = createHarness()
    await h.controller.ensureFileOfType(h.registry.get('note')!)
    expect(h.banners().io).not.toBeNull()
  })

  it('再走査に失敗したら作らない（古いスナップショットで2つ目を作らない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    h.disk.list = async () => { throw new Error('gone') }
    await h.controller.ensureFileOfType(h.registry.get('note')!)
    expect(h.disk.files.size).toBe(1)
    expect(h.banners().scan).toContain('フォルダの再走査に失敗しました')
  })
})

describe('requestDelete / 削除の順序', () => {
  async function openAndSelect() {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    return h
  }

  it('確認ダイアログを挟む（ゴミ箱への移動はアプリの履歴では戻せない）', async () => {
    const h = await openAndSelect()
    h.controller.requestDelete(h.files()[0])
    expect(h.modals().length).toBe(1)
    expect(h.disk.files.has(p('a.json'))).toBe(true)
  })

  it('入力を切る → 進行中の write を待つ → ゴミ箱へ移す、の順で進む', async () => {
    const h = await openAndSelect()
    h.controller.requestDelete(h.files()[0])
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm ではない')
    const from = h.log.length
    await request.onConfirm()
    const order = h.log.slice(from).filter((l) =>
      l.startsWith('setSelectedPath') || l === 'dispose' || l === 'settle' || l.startsWith('trash:'),
    )
    expect(order).toEqual([
      'setSelectedPath:null', // ①入力を切る（エディタを畳んでから待つ）
      'dispose',              // ②書かせない
      'settle',               // ③既に飛んだ write の着地を待つ（flush ではない）
      'dispose',              // ④失敗した write が復元した pending を捨てる
      `trash:${p('a.json')}`, // ⑤ゴミ箱へ
    ])
  })

  it('削除経路では flush しない（消したファイルを書き戻して復活させない）', async () => {
    const h = await openAndSelect()
    h.controller.requestDelete(h.files()[0])
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm ではない')
    const from = h.log.length
    await request.onConfirm()
    expect(h.log.slice(from)).not.toContain('flush')
  })

  it('選択していないファイルの削除では saver に触らない', async () => {
    const h = createHarness({ [p('a.json')]: note('A'), [p('b.json')]: note('B') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    const target = h.files().find((f) => f.path === p('b.json'))!
    h.controller.requestDelete(target)
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm ではない')
    const from = h.log.length
    await request.onConfirm()
    expect(h.log.slice(from)).not.toContain('dispose')
    expect(h.selectedPath()).toBe(p('a.json'))
  })

  it('削除後は台帳と一覧から落ち、検証をやり直す', async () => {
    const h = await openAndSelect()
    h.controller.requestDelete(h.files()[0])
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm ではない')
    await request.onConfirm()
    expect(h.files()).toEqual([])
    expect(h.log).toContain(`dropModal:external:${p('a.json')}`)
  })

  it('ゴミ箱への移動に失敗したらバナーを出す', async () => {
    const h = createHarness({ [p('a.json')]: note('A') }, { trash: () => Promise.reject(new Error('locked')) })
    await h.controller.openFolder(DIR)
    h.controller.requestDelete(h.files()[0])
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm ではない')
    await request.onConfirm()
    expect(h.banners().io).toContain('ファイルを削除できませんでした')
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx vitest run src/core/app-controller.test.ts
```

Expected: FAIL（`controller.createNewFile is not a function` など）

- [ ] **Step 3: 実装する**

`src/core/app-controller.ts` の import に追加:

```ts
import { createFile, ensureFileOfType as ensureFileOnDisk, trashFile, type CreatedFile } from './file-ops'
```

`AppController` インターフェースに追加:

```ts
  /** 新規作成（額縁のファイル操作。rev 6章）。作ったファイルはそのまま開く */
  createNewFile(module: AnyToolModule): Promise<void>
  /** singleton モジュールのファイルを1つ確保して開く（用語集0個からの自動生成） */
  ensureFileOfType(module: AnyToolModule): Promise<void>
  /** 削除の確認ダイアログを出す（確定時の処理はコントローラが持つ） */
  requestDelete(file: ProjectFile): void
```

`applyEdit` の下に実装を足す:

```ts
  /**
   * 作成したファイルを一覧へ登録して開く。新規作成と自動生成が同じ後処理を通る
   * ための単一経路。書いたテキストをそのまま分類し直すのは、editable にならないなら
   * 雛形かシリアライザが壊れている証拠だから——一覧に出す前に気付ける
   */
  const addCreatedFile = async (created: CreatedFile): Promise<void> => {
    const entry: ProjectFile = {
      path: created.path,
      name: created.name,
      result: classifyFile(created.text, registry),
      issues: [],
    }
    // ダブルクリックや遅い IPC で同じパスが2回来ても1件に保つ
    if (!files.some((f) => f.path === created.path)) applyFiles([...files, entry])
    host.setBanner('io', null)
    await selectFile(created.path)
  }

  const createNewFile = async (module: AnyToolModule): Promise<void> => {
    const dir = projectDir
    if (dir === null) {
      host.setBanner('io', 'プロジェクトフォルダを開いてから作成してください。')
      return
    }
    try {
      const created = await createFile({
        dir,
        module,
        existingNames: files.map((f) => f.name),
        join: io.join,
        write: writeAndRecord,
        exists: io.exists,
      })
      await addCreatedFile(created)
    } catch (err) {
      host.setBanner('io', `ファイルを作成できませんでした: ${describeError(err)}`)
    }
  }

  /**
   * singleton モジュールのファイルを1つ確保して開く（rev 5章。用語集0個は
   * 新規プロジェクトの正常な状態で、初めて用語登録が発生した時点で自動生成する）。
   * **押下時に再走査する**——空フォルダを開いた後に外部（Skill 等）が用語集を
   * 書いた状態で押されうるボタンなので、走査時のスナップショットで判断すると
   * 見落として2つ目を作る
   */
  const ensureFileOfType = async (module: AnyToolModule): Promise<void> => {
    if (projectDir === null) {
      host.setBanner('io', `プロジェクトフォルダを開いてから${module.displayName}を作成してください。`)
      return
    }
    const outcome = await rescan()
    // 再走査できなかったときは作らない——古いスナップショットで判断すると、
    // 外部で増えたファイルを見落として単一性違反を自分で作る
    if (outcome.kind === 'failed') return // バナーは rescan が出している
    if (outcome.kind === 'skipped') {
      host.setBanner(
        'io',
        `フォルダの状態を確認できなかったため、${module.displayName}を作成しませんでした（フォルダの切り替え中です。もう一度お試しください）。`,
      )
      return
    }
    const dir = projectDir
    if (dir === null) return
    try {
      const { path, created } = await ensureFileOnDisk({
        dir,
        module,
        files: outcome.files.map((f) => ({ path: f.path, name: f.name, type: f.result.type })),
        join: io.join,
        write: writeAndRecord,
        exists: io.exists,
      })
      if (created === null) {
        // 既にあった。開くだけ（ディスクから読み直す）
        await selectFile(path)
        return
      }
      await addCreatedFile(created)
    } catch (err) {
      host.setBanner('io', `${module.displayName}を作成できませんでした: ${describeError(err)}`)
    }
  }

  /**
   * ファイルを OS のゴミ箱へ移す（rev 6章。完全削除はしない）。
   *
   * **切り離しは trash の前に行う。** `trashFile` が write の着地を待つ間、
   * エディタが同じ saver を掴んだままだと、その間の打鍵で再武装したタイマーが
   * 生きた write を残せる（申し送り10節の残余の窓）。選択と saver を先に落として
   * エディタを畳めば、この窓は構造的に消える。
   * `closeCurrentFile` を通さないのも要点——あれは保留編集を書き切る経路で、
   * 消したファイルを書き戻して復活させる
   */
  const deleteFile = async (file: ProjectFile): Promise<void> => {
    // 確認ダイアログを挟むので、選択状態は「押された時点」を読む
    //（クロージャ変数なので自動的に確定時点の値になる）
    const wasSelected = file.path === selectedPath
    const target = wasSelected ? saver : null
    if (wasSelected) {
      // 進行中の selectFile / openFolder があれば、その結果を捨てさせる
      selectSeq++
      saver = null
      setSelected(null)
      host.setDocument(null)
      host.setBanner('save', null)
    }
    try {
      await trashFile({ path: file.path, saver: target, trash: io.trash })
      knownDisk.delete(file.path)
      // このファイル宛ての二択要求が残っていても、押せば no-op か読み込みエラーになる
      host.dropModal(`external:${file.path}`)
      // 単一性違反はここで解消されうるので、必ず検証をやり直す
      applyFiles(files.filter((f) => f.path !== file.path))
      host.setBanner('io', null)
    } catch (err) {
      // ゴミ箱への移動が失敗した場合、ファイルは残るが選択は外れている
      //（保留編集は trashFile が捨てている。「消す」と決めた操作の副作用として許容）
      host.setBanner('io', `ファイルを削除できませんでした: ${describeError(err)}`)
    }
  }

  /** 削除は Undo で戻せないので確認を挟む（用語の削除に確認を挟まないのとは別。rev 5章） */
  const requestDelete = (file: ProjectFile): void => {
    host.showModal({
      kind: 'confirm',
      key: `delete:${file.path}`,
      title: 'ファイルを削除しますか？',
      description: `${file.name} を OS のゴミ箱へ移動します。完全には削除しないので、ゴミ箱から戻せます。`,
      confirmLabel: 'ゴミ箱へ移動',
      onConfirm: () => deleteFile(file),
    })
  }
```

戻り値のオブジェクトに `createNewFile, ensureFileOfType, requestDelete,` を足す。

> **`rescan()` はまだ存在しない。** Task 6 で実装するが、`ensureFileOfType` がそれに依存するため、このタスクでは**先に `rescan` の外殻だけ**を置く（Task 6 で中身を差し替える）。次を `addCreatedFile` の前に置くこと:

```ts
  /** 再走査の結果。呼び出し側が「作ってよいか」を判断するために3値を返す */
  type RescanOutcome =
    | { kind: 'applied'; files: ProjectFile[] }
    /** フォルダ切替中・フォルダ未選択・後続の走査が始まった（バナーは出さない） */
    | { kind: 'skipped' }
    /** 走査に失敗（バナーは出済み） */
    | { kind: 'failed' }

  const rescan = async (): Promise<RescanOutcome> => {
    if (switchingFolder > 0) return { kind: 'skipped' }
    const dir = projectDir
    if (dir === null) return { kind: 'skipped' }
    let scan: ScanResult
    try {
      scan = await io.scan(dir)
    } catch (err) {
      host.setBanner('scan', `フォルダの再走査に失敗しました: ${describeError(err)}`)
      return { kind: 'failed' }
    }
    host.setBanner('scan', null)
    for (const entry of scan.entries) knownDisk.set(entry.path, entry.text)
    knownDisk.retain([...scan.entries.map((e) => e.path), ...scan.unreadable])
    const next = scan.entries.map(toProjectFile)
    applyFiles(next)
    return { kind: 'applied', files: files }
  }
```

> **この暫定 `rescan` は外部変更の判断（`planExternalChange`）を持たないので、この段階では「一覧を走査結果で置き換えるだけ」である。Task 6 で丸ごと差し替える。** `type RescanOutcome` を関数内に置くと `erasableSyntaxOnly` に触れないか確認し、触れるならファイルトップレベルへ出すこと（触れないはず——type エイリアスは消去可能）。

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/core/app-controller.test.ts
npx tsc -b
npm run lint
```

Expected: PASS（このファイルの `it` がすべて緑）／`tsc -b` と `lint` は無出力。

- [ ] **Step 5: コミット**

```bash
git add src/core/app-controller.ts src/core/app-controller.test.ts
git commit -m "M6: コントローラにファイルの作成・確保・削除を移し、削除の順序をテストで固定する"
```

---

## Task 6: 外部変更の検知・取り込み・二択・消滅

**Files:**
- Modify: `src/core/app-controller.ts`
- Modify: `src/core/app-controller.test.ts`

**Interfaces:**
- Consumes: `planExternalChange`（`src/core/external-change.ts`）
- Produces: `AppController.externalChange(): Promise<void>`

**振る舞いの変更（意図的なもの）:**

1. **一覧を差し替える前に saver を dispose する。** App は `setFiles` → `dispose` の順だったが、React では `setFiles` が再レンダリングを待つため実質「dispose が先」だった。同期のコントローラでは順序が可視になるので、**意図（取り込むか上書きするかを決める前にディスクを動かさない）どおり dispose を先に置く**。申し送り11節が「テストで固定すべき順序」として最初に挙げた項目。
2. **二択を出す前に、同じファイルの古いトーストを消す**（申し送り11節）。前回の取り込みで出した「取り込み前に戻す」が残っていると、二択に答えた後にそれを押せてしまう。
3. **`overwriteWithMine` の無音 return を塞ぐ**（申し送り11節）。選択が変わっていた場合にバナーを出す。
4. **`overwriteWithMine` が `saveError` をクリアする**（申し送り11節）。書く内容が同一だと write が起きず、前のバナーが残る。
5. **外部で消えたファイル宛ての二択要求を取り下げる**（`dropModal`。申し送り11節）。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/app-controller.test.ts` に追記:

```ts
describe('externalChange（外部変更の検知）', () => {
  async function opened(body = '') {
    const h = createHarness({ [p('a.json')]: note('A', body), [p('b.json')]: note('B') })
    await h.controller.openFolder(DIR)
    return h
  }

  it('自分の書き込みは外部変更にならない（台帳との内容比較）', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    const module = h.registry.get('note')!
    // 自動保存が書いたことにする（writeAndRecord 相当を saver 経由で再現）
    await h.savers.current().spec.write(note('A', 'x'))
    const from = h.log.length
    await h.controller.externalChange()
    expect(h.log.slice(from)).not.toContain('toast')
    expect(module).toBeDefined()
  })

  it('未保存編集が無ければ再読込し、Undo 履歴を破棄する', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    await h.controller.externalChange()
    expect(h.document()).toMatchObject({ body: '外部が書いた' })
    // setDocument＝履歴の作り直し。取り込みごとに必ず1回通ること
    expect(h.log.filter((l) => l === 'setDocument').length).toBeGreaterThan(0)
    expect(h.toasts().at(-1)?.message).toContain('外部の変更を読み込みました')
  })

  it('取り込みは applyEdit を通らない（ディスクの内容を書き戻さない）', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    const from = h.log.length
    await h.controller.externalChange()
    // 取り込みの過程でディスクへ書いていないこと
    expect(h.log.slice(from).some((l) => l.startsWith('write:'))).toBe(false)
  })

  it('検知したら、一覧を差し替える前に自動保存を止める', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    const from = h.log.length
    await h.controller.externalChange()
    const order = h.log.slice(from).filter((l) => l === 'dispose' || l === 'setFiles')
    expect(order[0]).toBe('dispose')
  })

  it('「取り込み前に戻す」は生バイトをそのまま書き戻す（正規化差分を出さない）', async () => {
    // 非正規形（インデント4）のまま開いていたファイルを外部が書き換える
    const raw = JSON.stringify({ schemaVersion: 1, type: 'note', title: 'A', body: '' }, null, 4) + '\n'
    const h = createHarness({ [p('a.json')]: raw })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    await h.controller.externalChange()
    const action = h.toasts().at(-1)?.action
    expect(action).toBeDefined()
    await action!.run()
    expect(h.disk.files.get(p('a.json'))).toBe(raw)
  })

  it('未保存編集があれば二択ダイアログを出す（自動では取り込まない）', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.savers.current().unsaved = true
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    await h.controller.externalChange()
    expect(h.modals().at(-1)?.kind).toBe('choice')
  })

  it('二択を出す前に、同じファイルの古い通知を取り下げる', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.savers.current().unsaved = true
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    await h.controller.externalChange()
    expect(h.log).toContain(`dismissToast:external:${p('a.json')}`)
  })

  it('回答待ちの間は、2度目の外部変更も二択に倒れる（saver を dispose しても信号が消えない）', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.savers.current().unsaved = true
    h.disk.files.set(p('a.json'), note('A', '1回目'))
    await h.controller.externalChange()
    h.disk.files.set(p('a.json'), note('A', '2回目'))
    await h.controller.externalChange()
    expect(h.modals().filter((m) => m.kind === 'choice').length).toBeGreaterThan(0)
    // 自動で取り込んで履歴を置き換えていないこと
    expect(h.document()).not.toMatchObject({ body: '2回目' })
  })

  it('「自分の編集で上書き」は検知したディスク内容を baseline に張り直す', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.savers.current().unsaved = true
    h.setDocument({ schemaVersion: 1, type: 'note', title: 'A', body: '自分の編集' })
    const diskText = note('A', '外部が書いた')
    h.disk.files.set(p('a.json'), diskText)
    await h.controller.externalChange()
    const request = h.modals().at(-1)
    if (request?.kind !== 'choice') throw new Error('choice ではない')
    await request.onPrimary()
    expect(h.savers.current().spec.baseline).toBe(diskText)
    expect(h.savers.current().latest).toBe(note('A', '自分の編集'))
  })

  it('「自分の編集で上書き」で選択が変わっていたら無音で終わらない', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.savers.current().unsaved = true
    h.setDocument({ schemaVersion: 1, type: 'note', title: 'A', body: '自分の編集' })
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    await h.controller.externalChange()
    const request = h.modals().at(-1)
    if (request?.kind !== 'choice') throw new Error('choice ではない')
    await h.controller.selectFile(p('b.json'))
    await request.onPrimary()
    expect(h.banners().io).not.toBeNull()
  })

  it('外部で消えた選択中ファイルは flush せずに後始末する（書き戻して復活させない）', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.disk.files.delete(p('a.json'))
    const from = h.log.length
    await h.controller.externalChange()
    expect(h.log.slice(from)).toContain('dispose')
    expect(h.log.slice(from)).not.toContain('flush')
    expect(h.selectedPath()).toBeNull()
    expect(h.log).toContain(`dropModal:external:${p('a.json')}`)
    expect(h.disk.files.has(p('a.json'))).toBe(false)
  })

  it('読めなかったファイルを「消えた」と混ぜない（一時的なロックで閉じない）', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    const read = h.disk.read
    h.disk.read = async (path: string) => {
      if (path === p('a.json')) throw new Error('locked')
      return read(path)
    }
    await h.controller.externalChange()
    expect(h.selectedPath()).toBe(p('a.json'))
  })

  it('増えたファイルは通知して一覧へ足す', async () => {
    const h = await opened()
    h.disk.files.set(p('c.json'), note('C'))
    await h.controller.externalChange()
    expect(h.files().map((f) => f.name)).toContain('c.json')
    expect(h.toasts().at(-1)?.message).toContain('ファイルが増えました')
  })

  it('再走査が成功したら scan バナーを消す（成功しても残らない）', async () => {
    const h = await opened()
    const list = h.disk.list
    h.disk.list = async () => { throw new Error('gone') }
    await h.controller.externalChange()
    expect(h.banners().scan).not.toBeNull()
    h.disk.list = list
    await h.controller.externalChange()
    expect(h.banners().scan).toBeNull()
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx vitest run src/core/app-controller.test.ts
```

Expected: FAIL（`controller.externalChange is not a function` など）

- [ ] **Step 3: 実装する**

import に追加:

```ts
import { planExternalChange } from './external-change'
```

`AppController` インターフェースに追加:

```ts
  /** 監視イベントを契機に再走査し、外部変更を取り込む（rev 3章） */
  externalChange(): Promise<void>
```

Task 5 で置いた暫定 `rescan` を**丸ごと**次に差し替え、`pendingAsk` の宣言を状態の並びに足す:

```ts
  /**
   * 回答待ちの二択。**`ask` の分岐で saver を dispose するので、
   * `hasUnsaved()` だけでは「未保存編集あり」の信号が消える**——これが無いと
   * 回答前の2度目の外部変更が reload に落ち、ユーザーの編集を持つ履歴を置き換える。
   * モジュールを一緒に持つのは、2度目の検知では一覧が既に1度目の適用後
   *（rejected になっているかもしれない）を指すため——再導出すると undefined になり、
   *「自分の編集で上書き」が何も書けなくなる
   */
  let pendingAsk: { path: string; module: AnyToolModule | undefined } | null = null
```

```ts
  /**
   * 取り込み前の内容へ戻す（rev 3章。Undo 履歴を破棄した後に残す唯一の復元手段）。
   * **退避しておいた生バイトをそのまま書く**——編集データを再シリアライズすると、
   * 非正規形のまま開いていたファイルで全行 diff が出て、「変更履歴を仕様の
   * 変更履歴として読める」（rev 5章）が壊れる
   */
  const revertImport = async (path: string, stashText: string): Promise<void> => {
    // このトーストは action 付きなので自動では消えない。つまり別のファイルを
    // 開いて編集した後や、フォルダを切り替えた後に押されうる
    if (!files.some((f) => f.path === path)) {
      host.showToast({
        message: '取り込み前の内容に戻せませんでした（このファイルは今のプロジェクトにありません）',
      })
      return
    }
    if (selectedPath === path) {
      // 取り込み後の内容を書きに行かせない（この経路の本来の意図）
      saver?.dispose()
      saver = null
    } else if (!(await closeCurrentFile())) {
      // 別のファイルを開いていて、その編集を書き切れないなら中断する——
      // 無条件に dispose すると、そのファイルの未保存編集を黙って捨てる
      return
    }
    try {
      await writeAndRecord(path, stashText)
      await selectFile(path)
      host.showToast({ key: `external:${path}`, message: '取り込み前の内容に戻しました' })
    } catch (err) {
      host.setBanner('io', `取り込み前の内容に戻せませんでした: ${describeError(err)}`)
    }
  }

  /**
   * 外部変更を取り込む。**ディスクを正として `selectFile` で張り直す**——
   *「必ずディスクから読み直す」「検証をやり直す」「saver を張り直す」
   *「履歴を作り直す」が既存の1本道で揃う。
   * **履歴の作り直しが Undo 履歴の破棄そのもの**である（rev 3章）
   */
  const importExternalChange = async (path: string, stashText: string | undefined): Promise<void> => {
    pendingAsk = null
    await selectFile(path)
    host.showToast({
      key: `external:${path}`,
      message: '外部の変更を読み込みました（元に戻す操作の履歴は破棄しました）',
      action:
        stashText === undefined
          ? undefined
          : { label: '取り込み前に戻す', run: () => revertImport(path, stashText) },
    })
  }

  /**
   * 自分の編集でディスクを上書きする（二択の片側。ここが applyEdit の4本目の経路）。
   * **baseline は検知したディスクの内容にする**——古い baseline のままだと
   *「同じ内容だから書かない」に落ちて、外部の内容が残ったまま画面と食い違う。
   * **module は呼び出し側が「変更前の」一覧から引いて渡す**
   */
  const overwriteWithMine = (
    path: string,
    diskText: string,
    module: AnyToolModule | undefined,
  ): void => {
    pendingAsk = null
    // 待っている間に選択が変わっていたら書かない。**無音にしない**——
    //「上書きを押したのに何も起きず、外部の内容が残っている」に見える
    if (selectedPath !== path) {
      host.setBanner(
        'io',
        '選択が変わったため、編集内容を書き戻しませんでした（ディスクには外部の変更が残っています）。',
      )
      return
    }
    const data = host.getEditingData()
    if (data === null || module === undefined) {
      host.setBanner(
        'io',
        '編集内容を書き戻せませんでした（このファイルを扱うモジュールが見つかりません）。外部エディタで内容を確認してください。',
      )
      return
    }
    attachSaver(path, diskText)
    // 書く内容が同一だと write が起きず onSuccess も走らないので、ここで消す
    host.setBanner('save', null)
    applyEdit(path, module, data)
    // 外部変更で rejected / listOnly に落ちたエントリは applyEdit では戻らない。
    // 書き込む内容をそのまま分類し直して一覧へ戻す——さもないと、ディスクは
    // 自分の内容に直っているのに「開けません」の表示が残り、台帳が一致するので
    // 再走査でも直らない（次に選び直すまで行き止まりになる）
    const repaired = classifyFile(serialize(data, module.schema), registry)
    applyFiles(
      files.map((f) => (f.path === path && f.result.status !== 'editable' ? { ...f, result: repaired } : f)),
    )
  }

  /** 未保存編集がある状態の外部変更（rev 3章。マージ UI は作らない） */
  const askExternalChange = (
    selected: { path: string; name: string; diskText: string },
    moduleBeforeChange: AnyToolModule | undefined,
  ): void => {
    // 同じファイルの古い通知——特に前回の取り込みで出した「取り込み前に戻す」——を消す。
    // トーストは時間で消えないので、残すと二択に答えた後に押せてしまい、
    // 二択の前提（ディスクは検知した内容のまま）が崩れる
    host.dismissToast(`external:${selected.path}`)
    host.showModal({
      kind: 'choice',
      key: `external:${selected.path}`,
      title: '外部でファイルが変更されました',
      description: `${selected.name} が別のプログラム（AI・エディタ・Git など）によって変更されました。保存していない編集があるため、どちらを残すか選んでください。両方を混ぜることはできません。`,
      primaryLabel: '自分の編集で上書き',
      secondaryLabel: '外部変更を取り込む（自分の編集は破棄）',
      onPrimary: () => overwriteWithMine(selected.path, selected.diskText, moduleBeforeChange),
      // 取り込み側に「取り込み前に戻す」は出さない——退避できるのは取り込み前に
      // **ディスクにあった**内容で、破棄される未保存編集ではないため
      onSecondary: () => importExternalChange(selected.path, undefined),
    })
  }

  /**
   * 開いていたファイルが外部で消えたときの後始末。
   * **flush しない**——消えたファイルへ書き戻すと、削除されたはずのファイルが
   * 復活する（M4 の削除で踏んだ事故と同じ）
   */
  const handleSelectedGone = (path: string, name: string): void => {
    selectSeq++
    pendingAsk = null
    saver?.dispose()
    saver = null
    setSelected(null)
    host.setDocument(null)
    host.setBanner('save', null)
    knownDisk.delete(path)
    // 消えたファイルの二択要求は、どちらを押しても no-op か読み込みエラーに退化する
    host.dropModal(`external:${path}`)
    host.showToast({ key: `external:${path}`, message: `開いていたファイルが外部で削除されました: ${name}` })
  }

  const rescan = async (): Promise<RescanOutcome> => {
    // フォルダ切替中の再走査は捨てる（古いフォルダの内容で新しい一覧を上書きしない）
    if (switchingFolder > 0) return { kind: 'skipped' }
    const dir = projectDir
    if (dir === null) return { kind: 'skipped' }
    const token = ++scanSeq
    let scan: ScanResult
    try {
      scan = await io.scan(dir)
    } catch (err) {
      host.setBanner('scan', `フォルダの再走査に失敗しました: ${describeError(err)}`)
      return { kind: 'failed' }
    }
    // 後続の再走査・フォルダ切替が始まっていたら、この結果は捨てる
    if (token !== scanSeq || projectDir !== dir) return { kind: 'skipped' }
    host.setBanner('scan', null)

    const plan = planExternalChange({
      prev: files,
      scan,
      knownText: (path) => knownDisk.get(path),
      selectedPath,
      // **ここが reload と ask の分岐を決める載荷点**。in-flight write と
      // 失敗して再試行待ちも true に含む（hasUnsaved の定義）。加えて、
      // ask で saver を dispose した後は pendingAsk が信号を代行する
      hasUnsavedEdits:
        (saver?.hasUnsaved() ?? false) || (pendingAsk !== null && pendingAsk.path === selectedPath),
    })

    // 上書きに使うモジュールは「変更前の」一覧から引く——外部変更でスキーマ違反に
    // なったファイルは type からモジュールを引けず、type が別のツールに書き換えられた
    // 場合は別のモジュールを引いてしまう。回答待ちの二択があるなら、そのとき
    // 捕まえたモジュールを使い続ける
    const before = files.find((f) => f.path === selectedPath)
    const moduleBeforeChange =
      pendingAsk !== null && pendingAsk.path === selectedPath
        ? pendingAsk.module
        : before !== undefined && before.result.status === 'editable'
          ? registry.get(before.result.type)
          : undefined

    // 台帳をディスクの現状へ合わせる。**plan を作った後**でなければ差分が消える。
    // 読めなかったパスは台帳に残す（消えた扱いにしないため）
    for (const entry of scan.entries) knownDisk.set(entry.path, entry.text)
    knownDisk.retain([...scan.entries.map((e) => e.path), ...scan.unreadable])
    if (!plan.hasChanges) return { kind: 'applied', files }

    const selected = plan.selected
    // **一覧を差し替える前に自動保存を止める。** 取り込むか上書きするかを決める前に
    // ディスクが動くと判断の前提が壊れる。再開は確定時（取り込み＝selectFile が
    // 張り直す／上書き＝新しい baseline で張り直す）
    if (selected.kind === 'reload' || selected.kind === 'ask') {
      saver?.dispose()
      saver = null
    }
    // 検証は「フォルダ走査時」「選択時」「編集時」「作成時」「削除時」に続く6本目の経路
    applyFiles(plan.next)
    for (const notice of plan.notices) host.showToast(notice)

    switch (selected.kind) {
      case 'none':
        break
      case 'reload':
        await importExternalChange(selected.path, selected.stashText)
        break
      case 'ask':
        pendingAsk = { path: selected.path, module: moduleBeforeChange }
        askExternalChange(selected, moduleBeforeChange)
        break
      case 'gone':
        handleSelectedGone(selected.path, selected.name)
        break
    }
    return { kind: 'applied', files }
  }
```

状態の並びに `scanSeq` を足す:

```ts
  /** 再走査の直列化トークン（後続の再走査・フォルダ切替が始まったら先行の結果は捨てる） */
  let scanSeq = 0
```

`openFolder` の先頭（`switchingFolder++` の直前）に、進行中の再走査を無効化する1行を足す:

```ts
    // 進行中の再走査の結果を捨てさせる（別フォルダの走査結果を新しい一覧へ混ぜない）
    scanSeq++
```

`openFolder` の成功パス（`host.clearModals()` の隣）に `pendingAsk = null` を足す。

戻り値のオブジェクトに追加:

```ts
    async externalChange() {
      await rescan()
    },
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/core/app-controller.test.ts
npx tsc -b
npm run lint
```

Expected: PASS（このファイルの `it` がすべて緑）／`tsc -b` と `lint` は無出力。

- [ ] **Step 5: コミット**

```bash
git add src/core/app-controller.ts src/core/app-controller.test.ts
git commit -m "M6: コントローラに外部変更の検知・取り込み・二択・消滅を移し、順序をテストで固定する"
```

---

## Task 7: close のゲート ＋ Markdown 出力

**Files:**
- Modify: `src/core/app-controller.ts`
- Modify: `src/core/app-controller.test.ts`

**Interfaces:**
- Produces: `AppController.requestClose(): Promise<boolean>` / `.copyMarkdown(): Promise<void>` / `.exportMarkdown(): Promise<void>`

**振る舞いの変更（意図的なもの）:**

1. **脱出口（「破棄して閉じる」）で `dispose()` の後に saver の参照を捨てる**（申し送り11節の残件）。`forceClose()` が失敗したときに、破棄済みの saver を掴んだままアプリが開き続けるのを塞ぐ。
2. `.md` 書き出しは **`writeAndRecord` を通さない**（台帳へ載せない）。走査対象は `.json` だけなので、載せても次の再走査の `retain` で落ちる死に記録になる。**プロジェクトフォルダ内へ書き出しても監視は反応しない**（`listJsonFiles` が `.json` しか拾わないため、再走査の差分がゼロになる）。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/app-controller.test.ts` に追記:

```ts
describe('requestClose（ウィンドウ close のゲート）', () => {
  it('開いているファイルが無ければ閉じてよい', async () => {
    const h = createHarness()
    await expect(h.controller.requestClose()).resolves.toBe(true)
  })

  it('保留編集を書き切れたら閉じてよい', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await expect(h.controller.requestClose()).resolves.toBe(true)
  })

  it('flush に失敗したら閉じず、脱出口を出す', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.savers.current().flushOk = false
    await expect(h.controller.requestClose()).resolves.toBe(false)
    const request = h.modals().at(-1)
    expect(request?.kind).toBe('confirm')
    expect(request?.key).toBe('close')
  })

  it('脱出口は destroy を呼び、saver の参照も捨てる', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.savers.current().flushOk = false
    await h.controller.requestClose()
    const request = h.modals().at(-1)
    if (request?.kind !== 'confirm') throw new Error('confirm ではない')
    await request.onConfirm()
    expect(h.log).toContain('forceClose')
    // 参照を捨てているので、次の close は「開いているファイルが無い」で通る
    await expect(h.controller.requestClose()).resolves.toBe(true)
  })

  it('脱出口の失敗は無音にしない', async () => {
    const h = createHarness({ [p('a.json')]: note('A') }, { forceClose: () => Promise.reject(new Error('busy')) })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.savers.current().flushOk = false
    await h.controller.requestClose()
    const request = h.modals().at(-1)
    if (request?.kind !== 'confirm') throw new Error('confirm ではない')
    await request.onConfirm()
    expect(h.banners().io).toContain('ウィンドウを閉じられませんでした')
  })

  it('二択の回答待ちの間は閉じない（守るはずの編集を黙って捨てない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.savers.current().unsaved = true
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    await h.controller.externalChange()
    await expect(h.controller.requestClose()).resolves.toBe(false)
    expect(h.toasts().at(-1)?.message).toContain('選ぶまで閉じられません')
  })
})

describe('Markdown 出力', () => {
  async function openAndSelect() {
    const h = createHarness({ [p('a.json')]: note('A', '本文') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    return h
  }

  it('コピーはモジュールの toMarkdown を編集中データに適用する', async () => {
    const copyText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const h = createHarness({ [p('a.json')]: note('A', '本文') }, { copyText })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.setDocument({ schemaVersion: 1, type: 'note', title: 'A', body: '編集後' })
    await h.controller.copyMarkdown()
    expect(copyText).toHaveBeenCalledWith('## A\n\n編集後\n')
    expect(h.toasts().at(-1)?.message).toContain('クリップボードにコピーしました')
  })

  it('コピーの失敗はバナーに出す', async () => {
    const h = createHarness(
      { [p('a.json')]: note('A') },
      { copyText: () => Promise.reject(new Error('denied')) },
    )
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.copyMarkdown()
    expect(h.banners().io).toContain('クリップボードにコピーできませんでした')
  })

  it('書き出しは .json を .md に替えた既定パスを提示し、選ばれた先へ書く', async () => {
    const askSavePath = vi.fn<(defaultPath: string) => Promise<string | null>>()
      .mockResolvedValue('C:\\out\\a.md')
    const h = createHarness({ [p('a.json')]: note('A', '本文') }, { askSavePath })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.exportMarkdown()
    expect(askSavePath).toHaveBeenCalledWith(`${DIR}\\a.md`)
    expect(h.disk.files.get('C:\\out\\a.md')).toBe('## A\n\n本文\n')
  })

  it('キャンセルは失敗ではない（何も書かず、バナーも出さない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') }, { askSavePath: async () => null })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    const from = h.log.length
    await h.controller.exportMarkdown()
    expect(h.log.slice(from).some((l) => l.startsWith('write:'))).toBe(false)
    expect(h.banners().io).toBeNull()
  })

  it('開けないファイルを選んでいるときは何もしない', async () => {
    const copyText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const h = createHarness({ [p('broken.json')]: '{ not json' }, { copyText })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('broken.json'))
    await h.controller.copyMarkdown()
    expect(copyText).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx vitest run src/core/app-controller.test.ts
```

Expected: FAIL（`controller.requestClose is not a function` など）

- [ ] **Step 3: 実装する**

`AppController` インターフェースに追加:

```ts
  /** ウィンドウ close のゲート。true＝閉じてよい */
  requestClose(): Promise<boolean>
  /** 選択中ファイルの Markdown をクリップボードへ（rev 8章） */
  copyMarkdown(): Promise<void>
  /** 選択中ファイルの Markdown を .md として書き出す（rev 8章） */
  exportMarkdown(): Promise<void>
```

本体に追加:

```ts
  const requestClose = async (): Promise<boolean> => {
    // 回答待ちの間は未保存編集が額縁の履歴にしか無い（検知時点で saver を
    // dispose している）。saver が null だからと通すと、二択で守るはずの
    // 編集を黙って捨てて閉じることになる
    if (pendingAsk !== null) {
      host.showToast({
        key: 'close-blocked',
        message: '外部変更の扱いを選ぶまで閉じられません（ダイアログで選んでください）',
      })
      return false
    }
    if (saver === null) return true
    if (await saver.flush()) return true
    host.showModal({
      kind: 'confirm',
      // 閉じる操作を繰り返しても要求が積み上がらないように置き換える
      key: 'close',
      title: '保存できないため閉じられません',
      description:
        '保存していない編集があります。もう一度閉じる操作をすると保存を再試行します。破棄して閉じると、この編集は失われます（ファイルの内容は最後に保存できた状態のままです）。',
      confirmLabel: '破棄して閉じる',
      onConfirm: async () => {
        saver?.dispose()
        // 破棄済みの saver を掴んだままにしない（forceClose が失敗した場合に
        // アプリが開き続ける。申し送り11節の残件）
        saver = null
        try {
          await io.forceClose()
        } catch (err) {
          // ここが無音だと「押したのに何も起きない（編集は失われている）」に見える
          host.setBanner('io', `ウィンドウを閉じられませんでした: ${describeError(err)}`)
        }
      },
    })
    return false
  }

  /** 出力の対象。editable な選択中ファイルと、額縁が持つ編集中データが揃ったときだけ */
  const currentDocument = (): { path: string; module: AnyToolModule; data: unknown } | null => {
    if (selectedPath === null) return null
    const entry = files.find((f) => f.path === selectedPath)
    if (entry === undefined || entry.result.status !== 'editable') return null
    const module = registry.get(entry.result.type)
    if (module === undefined) return null
    const data = host.getEditingData()
    if (data === null) return null
    return { path: selectedPath, module, data }
  }

  const copyMarkdown = async (): Promise<void> => {
    const doc = currentDocument()
    if (doc === null) return
    try {
      await io.copyText(doc.module.toMarkdown(doc.data))
      host.setBanner('io', null)
      host.showToast({ key: 'export', message: 'Markdown をクリップボードにコピーしました' })
    } catch (err) {
      host.setBanner('io', `クリップボードにコピーできませんでした: ${describeError(err)}`)
    }
  }

  const exportMarkdown = async (): Promise<void> => {
    const doc = currentDocument()
    if (doc === null) return
    try {
      const target = await io.askSavePath(doc.path.replace(/\.json$/i, '.md'))
      // キャンセルは失敗ではない。バナーを出さず黙って戻る
      if (target === null) return
      // **台帳へ記録しない**（writeAndRecord を通さない）——走査対象は .json だけなので、
      // 記録しても次の再走査の retain で落ちる死に記録になる。同じ理由で、
      // プロジェクトフォルダ内へ書き出しても監視の再走査は差分ゼロになる
      await io.write(target, doc.module.toMarkdown(doc.data))
      host.setBanner('io', null)
      host.showToast({ key: 'export', message: `Markdown を書き出しました: ${target}` })
    } catch (err) {
      host.setBanner('io', `Markdown を書き出せませんでした: ${describeError(err)}`)
    }
  }
```

戻り値のオブジェクトに `requestClose, copyMarkdown, exportMarkdown,` を足す。

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/core/app-controller.test.ts
npm test
npx tsc -b
npm run lint
```

Expected: 全件 PASS・エラー0／`tsc -b` と `lint` は無出力。

- [ ] **Step 5: コミット**

```bash
git add src/core/app-controller.ts src/core/app-controller.test.ts
git commit -m "M6: コントローラに close のゲートと Markdown 出力を足す"
```

---

## Task 8: `App.tsx` をコントローラへ乗せ換える

**このタスクの合格基準は「振る舞いが変わっていないこと」。** 新機能（Markdown 出力ボタン）は Task 9 に分けてある。レビュアーは「配線の置き換え以外の差分」を計画外の変更として指摘してよい。

**Files:**
- Modify: `src/App.tsx`（全面書き換え）

**振る舞いの変更（意図的なもの）:**

1. バナーが `ioError` / `saveError` の2本から `BannerKind` 4種になる（Task 4 で決めた意味論）。
2. 監視の後片付けを **`beforeunload` でも行う**（申し送り11節）。開発中のページリロードでは React の後片付けが走らず、Rust 側の watcher が残って死んだコールバックへイベントを送り続ける（`[TAURI] Couldn't find callback id ...`）。本番では起きないが、**「監視しているつもりで監視していない」状態は検証を著しく混乱させる**（M5 の実機確認で2回空振りさせた原因の1つ）。
3. アンマウント時の `void flush()` を廃止する（Task 4 の `dispose()` の意味論）。

- [ ] **Step 1: `src/App.tsx` を次の内容で置き換える**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChoiceDialog } from '@/components/ChoiceDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FileList } from '@/components/FileList'
import { ToastStack } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import {
  createAppController,
  type AppController,
  type AppHost,
  type AppIo,
  type BannerKind,
} from '@/core/app-controller'
import { createAutoSaver } from '@/core/autosave'
import { createCoalescer } from '@/core/coalesce'
import { canCreateFileOfType } from '@/core/file-ops'
import {
  canRedo,
  canUndo,
  createHistory,
  record,
  redo as redoHistory,
  undo as undoHistory,
  type HistoryState,
} from '@/core/history'
import { resolveCommand, toKeyEventLike, type KeyContext } from '@/core/keyboard/keymap'
import { currentPlatform } from '@/core/keyboard/platform'
import { clearModals, dropModal, pushModal, shiftModal, type ModalRequest } from '@/core/modal-queue'
import type { ProjectFile } from '@/core/project-file'
import { scanFolder } from '@/core/scan'
import { dismissToast, dismissToastByKey, pushToast, type ToastItem } from '@/core/toasts'
import { forceClose, interceptClose } from '@/fs/app-window'
import { copyToClipboard } from '@/fs/clipboard'
import {
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
import { appRegistry } from '@/modules'

const AUTOSAVE_DELAY_MS = 500

/**
 * 監視イベントを束ねる窓。fs プラグイン側のデバウンス（300ms）とは別に、
 * 1回の保存が複数イベントを送ってくるのを1回の再走査にまとめる
 */
const WATCH_COALESCE_MS = 150

/** バナーの表示順（**いま続いている状態**を出す場所。起きた出来事はトースト） */
const BANNER_ORDER: readonly BannerKind[] = ['io', 'save', 'scan', 'watch']

/**
 * コントローラへ渡す I/O。React に依存しないのでモジュール直下で1度だけ組む。
 * **ここが「コアは Tauri を知らない」の境界**——src/fs/* の関数を差すだけ
 */
const appIo: AppIo = {
  scan: (dir) => scanFolder(dir, { list: listJsonFiles, read: readProjectFile }, appRegistry),
  read: readProjectFile,
  write: writeProjectFile,
  exists: fileExists,
  trash: moveFileToTrash,
  join: joinPath,
  copyText: copyToClipboard,
  askSavePath: askSaveMarkdownPath,
  forceClose,
  createSaver: (spec) => createAutoSaver({ delayMs: AUTOSAVE_DELAY_MS, ...spec }),
}

/**
 * 額縁が取るグローバル層のキー文脈（rev 10章）。Undo/Redo だけを扱うため
 * 構造依存層の文脈は固定値でよい。modalOpen はダイアログが開いている間 true
 */
function globalKeyContext(modalOpen: boolean): KeyContext {
  return {
    platform: currentPlatform(),
    modalOpen,
    editing: false,
    fieldEmpty: false,
    deletableField: false,
    caretAtStart: false,
    caretAtEnd: false,
    arrowsOwnedByField: false,
    reorderEnabled: false,
  }
}

function App() {
  const [dark, setDark] = useState(false)
  const [projectDir, setProjectDir] = useState<string | null>(null)
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  // 編集中データは履歴の present が正（Undo/Redo で入れ替わる。ファイル単位・
  // メモリ内。それ以前への復帰は Git の担当。rev 5章）
  const [history, setHistory] = useState<HistoryState<unknown> | null>(null)
  // コントローラが「いま編集中の内容」を読むための口。**最新値の読み取り口**であって
  // スナップショットではない（過去の値を凍結する用途に使わないこと。M5 の誤り2）
  const historyRef = useRef<HistoryState<unknown> | null>(null)
  historyRef.current = history
  const [banners, setBanners] = useState<Record<BannerKind, string | null>>({
    io: null,
    save: null,
    scan: null,
    watch: null,
  })
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastSeq = useRef(0)
  // モーダルの要求キュー。生産者は「ファイル削除の確認」「破棄して閉じる」
  //「外部変更の二択」の3つ。開いている間は操作言語を止める（rev 10章の境界規則）
  const [modals, setModals] = useState<ModalRequest[]>([])
  const head = modals[0] ?? null
  const modalOpen = modals.length > 0
  // window リスナーはマウント時の1回しか張らないので、最新値は ref から読む
  //（**state 直読みに「簡潔化」しないこと**。常に初期値 false になる）
  const modalOpenRef = useRef(modalOpen)
  modalOpenRef.current = modalOpen

  const setBanner = useCallback((kind: BannerKind, message: string | null) => {
    setBanners((prev) => (prev[kind] === message ? prev : { ...prev, [kind]: message }))
  }, [])
  const showToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    // updater は純粋でなければならない（StrictMode の二重実行で id を余分に
    // 消費しないよう、id は先に計算する）
    const id = ++toastSeq.current
    setToasts((prev) => pushToast(prev, { ...toast, id }))
  }, [])
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => dismissToast(prev, id))
  }, [])

  /**
   * コントローラは1度だけ作る。**state に入れないこと**——作り直すと台帳・選択・
   * 自動保存を丸ごと失う。ホストのコールバックはすべて setState か ref 読みなので
   * 再生成の必要が無い
   */
  const controllerRef = useRef<AppController | null>(null)
  if (controllerRef.current === null) {
    const host: AppHost = {
      setFiles,
      setProjectDir,
      setSelectedPath,
      // **これが Undo 履歴の破棄そのもの**（外部変更の取り込み時。rev 3章）
      setDocument: (data) => setHistory(data === null ? null : createHistory(data)),
      setBanner,
      showToast,
      dismissToast: (key) => setToasts((prev) => dismissToastByKey(prev, key)),
      showModal: (request) => setModals((prev) => pushModal(prev, request)),
      dropModal: (key) => setModals((prev) => dropModal(prev, key)),
      clearModals: () => setModals(clearModals()),
      getEditingData: () => historyRef.current?.present ?? null,
    }
    controllerRef.current = createAppController(appIo, host, appRegistry)
  }
  const controller = controllerRef.current

  const editingData = history === null ? null : history.present

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }

  // アンマウント時。**flush しない**——失敗で復元された pending を捨てる経路になる。
  // 実際のウィンドウ close は下の interceptClose を通る。
  //（StrictMode の二重マウントでもここは saver を止めるだけなので実害が無い）
  useEffect(() => {
    return () => controller.dispose()
  }, [controller])

  // ウィンドウ close を横取りしてコントローラのゲートに委ねる
  useEffect(() => {
    const unlisten = interceptClose(() => controller.requestClose())
    return () => {
      void unlisten.then((f) => f())
    }
  }, [controller])

  const openFolder = async () => {
    const dir = await pickProjectFolder()
    if (dir === null) return
    await controller.openFolder(dir)
  }

  const selected = files.find((f) => f.path === selectedPath) ?? null
  const selectedModule =
    selected && selected.result.status === 'editable'
      ? appRegistry.get(selected.result.type)
      : undefined
  // 走査済み全ファイルの type（読めなかったファイルは null）。singleton 判定は
  // 型でなく物理条件（type が2件以上）なので、rejected/listOnly の type も含める
  const existingTypes = files.map((f) => f.result.type)
  const glossaryModule = appRegistry.get('glossary')
  // 用語集0個は正常な状態（新規プロジェクト）。押せば作れることを空状態で示す。
  // サイドバーの新規作成ボタンと同じ canCreateFileOfType を通すことで、
  //「作れる」の判定を1箇所に保つ
  const canCreateGlossary =
    glossaryModule !== undefined && canCreateFileOfType(glossaryModule, existingTypes)

  const runHistory = (kind: 'undo' | 'redo') => {
    const h = historyRef.current
    if (h === null || selectedPath === null || selectedModule === undefined) return
    const next = kind === 'undo' ? undoHistory(h) : redoHistory(h)
    // 戻れない／進めないときは同一参照が返る
    if (next === h) return
    setHistory(next)
    controller.applyEdit(selectedPath, selectedModule, next.present)
  }

  // window リスナーからは常に最新の runHistory を呼ぶ（購読はマウント時の1回だけ）
  const runHistoryRef = useRef(runHistory)
  runHistoryRef.current = runHistory

  // グローバル層（rev 10章）: Undo/Redo は全ツール共通で額縁が取る。
  // 制御入力ではブラウザ標準の Undo が React の再レンダリングと食い違うため、
  // テキスト編集中もアプリの履歴に一本化する（境界規則への明示的な例外）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const cmd = resolveCommand(toKeyEventLike(e), globalKeyContext(modalOpenRef.current))
      if (cmd !== 'undo' && cmd !== 'redo') return
      e.preventDefault()
      runHistoryRef.current(cmd)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // フォルダ単位の監視（rev 3章。ファイル単位では外部リネームが取れない）。
  // イベントの種類は見ず、束ねて再走査する。フォルダを切り替えたら張り替える
  useEffect(() => {
    if (projectDir === null) return
    const coalescer = createCoalescer(WATCH_COALESCE_MS, () => {
      void controller.externalChange()
    })
    let unwatch: (() => void) | null = null
    let stopped = false
    const stop = () => {
      stopped = true
      // 先に監視を止めてから coalescer を捨てる——逆順だと、その間に届いた
      // イベントが notify() で無条件にタイマーを張り直し、切替/アンマウントの
      // 約 WATCH_COALESCE_MS 後に迷子の再走査が1回走る
      unwatch?.()
      unwatch = null
      coalescer.dispose()
    }
    // **開発中のページリロードでは React の後片付けが走らない。** projectDir は
    // state なのでリロードで消え、JS 側はフォルダを開き直すまで監視を張り直さない
    // 一方、Rust 側の watcher は生き残って死んだコールバックへイベントを送り続ける
    //（[TAURI] Couldn't find callback id ...）。本番のアプリはリロードしないが、
    // 検証中は「監視しているつもりで監視していない」状態になり、症状がバグと
    // 区別できなくなる（M5 の実機確認で踏んだ）
    const onBeforeUnload = () => stop()
    window.addEventListener('beforeunload', onBeforeUnload)
    void watchFolder(projectDir, () => coalescer.notify())
      .then((fn) => {
        // effect の後片付けが先に走っていたら、掴んだ監視をその場で止める
        if (stopped) fn()
        else {
          unwatch = fn
          setBanner('watch', null)
        }
      })
      .catch((err: unknown) => {
        setBanner(
          'watch',
          `フォルダの監視を開始できませんでした（外部の変更は自動で反映されません）: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      })
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      stop()
    }
  }, [projectDir, controller, setBanner])

  return (
    <main className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="flex items-center gap-4 border-b border-rule px-6 py-3">
        <h1 className="text-lg font-bold text-ink">facet</h1>
        <Button onClick={() => void openFolder()}>フォルダを開く</Button>
        <Button disabled={history === null || !canUndo(history)} onClick={() => runHistory('undo')}>
          元に戻す
        </Button>
        <Button disabled={history === null || !canRedo(history)} onClick={() => runHistory('redo')}>
          やり直す
        </Button>
        {projectDir && <span className="text-sm text-ink-muted">{projectDir}</span>}
        <button
          type="button"
          className="ml-auto text-sm text-ink-muted underline"
          onClick={toggleTheme}
        >
          {dark ? 'ライト' : 'ダーク'}
        </button>
      </header>

      {BANNER_ORDER.map((kind) =>
        banners[kind] === null ? null : (
          <p key={kind} className="px-6 py-2 text-sm text-warning">
            {banners[kind]}
          </p>
        ),
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 border-r border-rule">
          <FileList
            files={files}
            selectedPath={selectedPath}
            modules={appRegistry.list()}
            existingTypes={existingTypes}
            projectOpen={projectDir !== null}
            onSelect={(file) => void controller.selectFile(file.path)}
            onCreate={(module) => void controller.createNewFile(module)}
            onDelete={(file) => controller.requestDelete(file)}
          />
        </aside>

        <section className="min-w-0 flex-1 overflow-auto">
          {selected === null && (
            <div className="p-6">
              <p className="text-sm text-ink-muted">ファイルを選ぶとここで編集できます。</p>
              {projectDir !== null && canCreateGlossary && glossaryModule !== undefined && (
                <div className="mt-4">
                  <p className="text-sm text-ink-muted">
                    このプロジェクトにはまだ用語集がありません（新規プロジェクトでは正常な状態です）。
                  </p>
                  <button
                    type="button"
                    className="mt-2 rounded-sm border border-rule px-3 py-1 text-sm text-ink hover:bg-surface"
                    onClick={() => void controller.ensureFileOfType(glossaryModule)}
                  >
                    用語集を作る
                  </button>
                </div>
              )}
            </div>
          )}
          {selected && selected.result.status !== 'editable' && selected.issues.length > 0 && (
            <ul className="list-disc px-6 pt-4 pl-10 text-sm text-warning">
              {selected.issues.map((issue, i) => (
                <li key={`${issue.rule}-${i}`}>{issue.message}</li>
              ))}
            </ul>
          )}
          {selected?.result.status === 'rejected' && (
            <div className="p-6">
              <h2 className="mb-2 font-bold text-warning">
                このファイルは開けません（{selected.result.reason}）
              </h2>
              <ul className="list-disc pl-5 text-sm text-ink">
                {selected.result.errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-ink-muted">
                外部エディタで修正してからフォルダを開き直してください。
              </p>
            </div>
          )}
          {selected?.result.status === 'listOnly' && (
            <p className="p-6 text-sm text-ink-muted">{selected.result.reason}</p>
          )}
          {selected?.result.status === 'editable' && selectedModule && editingData !== null && (
            <selectedModule.Editor
              key={selected.path}
              data={editingData}
              issues={selected.issues}
              modalOpen={modalOpen}
              onChange={(next: unknown, mergeKey?: string | null) => {
                setHistory((h) => (h === null ? h : record(h, next, mergeKey ?? null, Date.now())))
                controller.applyEdit(selected.path, selectedModule, next)
              }}
            />
          )}
        </section>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismiss} modalOpen={modalOpen} />
      <ConfirmDialog
        open={head?.kind === 'confirm'}
        title={head?.kind === 'confirm' ? head.title : ''}
        description={head?.kind === 'confirm' ? head.description : ''}
        confirmLabel={head?.kind === 'confirm' ? head.confirmLabel : ''}
        onConfirm={() => {
          // 表示中の要求を先に片付けてから起動する（M4 で確定した形）
          const request = head
          setModals((prev) => shiftModal(prev))
          if (request?.kind === 'confirm') void request.onConfirm()
        }}
        onCancel={() => setModals((prev) => shiftModal(prev))}
      />
      <ChoiceDialog
        open={head?.kind === 'choice'}
        title={head?.kind === 'choice' ? head.title : ''}
        description={head?.kind === 'choice' ? head.description : ''}
        primaryLabel={head?.kind === 'choice' ? head.primaryLabel : ''}
        secondaryLabel={head?.kind === 'choice' ? head.secondaryLabel : ''}
        onPrimary={() => {
          const request = head
          setModals((prev) => shiftModal(prev))
          if (request?.kind === 'choice') void request.onPrimary()
        }}
        onSecondary={() => {
          const request = head
          setModals((prev) => shiftModal(prev))
          if (request?.kind === 'choice') void request.onSecondary()
        }}
      />
    </main>
  )
}

export default App
```

- [ ] **Step 2: 型チェック・lint・テストが通ることを確認する**

```bash
npx tsc -b
npm run lint
npm test
```

Expected: `tsc -b` と `lint` は無出力／`npm test` は全件 PASS・エラー0。

> **`lint` が `useEffect` の依存配列を警告したら、依存を足して直す**（M3 の教訓3。挙動が正しくてもリポジトリの警告ゼロ基準を壊さない）。

- [ ] **Step 3: 古い実装が本当に消えたことを確認する**

```bash
grep -nE "planExternalChange|createKnownDisk|trashFile|ensureFileOfType|writeAndRecord|attachSaver|pendingAskRef|selectSeq|scanSeq|switchingFolder" src/App.tsx
```

Expected: 出力なし（すべてコントローラ側へ移っている）。1件でも残っていたら移し漏れなので、コントローラ側に同じ処理があるか確認してから消す。

- [ ] **Step 4: コミット**

```bash
git add src/App.tsx
git commit -m "M6: App.tsx をコントローラへ乗せ換え、配線と JSX だけにする"
```

---

## Task 9: Markdown 出力の UI

**Files:**
- Modify: `src/App.tsx`（ヘッダにボタン2つ）

**テストについての判断:** このタスクが足すのは「ボタンを押したらコントローラのメソッドを呼ぶ」6行の配線で、押した後の振る舞い（`toMarkdown` の適用・クリップボード・保存ダイアログ・キャンセル・失敗時のバナー）は Task 7 のコントローラのテストが既に固定している。`App.tsx` の DOM テストは Tauri のモジュール一式（`api/core` / `api/path` / `api/window` / `plugin-dialog` / `plugin-fs` / `plugin-clipboard-manager`）をモックする必要があり、得られるのは「ボタンが存在する」だけである。**M3 で確立した「DOM テストは『壊れても画面は一見正常』な回帰に絞る」という方針に従い、ここでは DOM テストを書かない。** 代わりに Task 11 の実機確認で確かめる（手順に含めてある）。

- [ ] **Step 1: 出力可能かの判定と、ボタン2つを足す**

`src/App.tsx` の `canCreateGlossary` の定義の直後に足す:

```tsx
  // 出力できるのは「開けているファイルを選んでいて、編集中データが揃っている」とき。
  // コントローラ側でも同じ条件を確認しているが、UI はそれを押せる／押せないの形で見せる
  const canExport = selectedModule !== undefined && editingData !== null
```

ヘッダの「やり直す」ボタンの直後に足す:

```tsx
        <Button disabled={!canExport} onClick={() => void controller.copyMarkdown()}>
          Markdown をコピー
        </Button>
        <Button disabled={!canExport} onClick={() => void controller.exportMarkdown()}>
          Markdown を書き出す
        </Button>
```

> ボタンの見た目（ヘッダが横に伸びる件・トークンの割当）は仮置きで、確定は M7。**色値の直書きはしないこと**——`Button` は既存の shadcn 生成物をそのまま使う。

- [ ] **Step 2: 型チェック・lint・テストが通ることを確認する**

```bash
npx tsc -b
npm run lint
npm test
```

Expected: `tsc -b` と `lint` は無出力／`npm test` は全件 PASS・エラー0。

- [ ] **Step 3: コミット**

```bash
git add src/App.tsx
git commit -m "M6: Markdown のコピーと書き出しのボタンを額縁に置く"
```

---

## Task 10: 正規形テストの fixture を専用の場所へ移す

**なぜ:** `src/core/canonical.test.ts` の最重要の回帰テスト（Skill が書いたファイルを読み→保存してバイト単位で不変）と `src/core/load.test.ts` が `sample-project/glossary.json` を読んでいる。ところが `sample-project/` は動作確認の遊び場としても使われており、M5 の実機確認では削除や内容の差し替えで `npm test` を2回落とした（申し送り11節）。申し送りは「fixture を専用の場所へ移すか、確認手順をリポジトリ外の空フォルダに固定するかを決めること」としている。**両方やる**——fixture を移して壊れなくし、実機確認の手順（Task 11）はリポジトリ外の空フォルダに固定する。

**Files:**
- Create: `src/core/__fixtures__/glossary.canonical.json`（`sample-project/glossary.json` の複製）
- Modify: `src/core/canonical.test.ts:9-12`
- Modify: `src/core/load.test.ts:11-14`
- Delete: なし（`sample-project/glossary.json` は遊び場としてそのまま残す）

- [ ] **Step 1: fixture を複製する**

```bash
mkdir -p src/core/__fixtures__
cp sample-project/glossary.json src/core/__fixtures__/glossary.canonical.json
```

> **`.gitattributes` の `*.json text eol=lf` が効くので LF のまま入る。** 念のため `git diff --stat` で全行 diff になっていないことを確認すること。

- [ ] **Step 2: テストの参照先を差し替える**

`src/core/canonical.test.ts`:

```ts
/**
 * **この fixture は動作確認の遊び場ではない。** 最重要の回帰テスト
 *（Skill が書いたファイルのバイト一致）がこの中身に依存しているので、
 * 内容を差し替えたり消したりしないこと（M5 の実機確認で sample-project/ を
 * 触って2回テストを落とした）。実機確認にはリポジトリ外の空フォルダを使う
 */
const sampleRaw = readFileSync(
  new URL('./__fixtures__/glossary.canonical.json', import.meta.url),
  'utf8',
)
```

`src/core/load.test.ts`:

```ts
const sampleRaw = readFileSync(
  new URL('./__fixtures__/glossary.canonical.json', import.meta.url),
  'utf8',
)
```

- [ ] **Step 3: fixture が実際に使われていることを確かめる**

`sample-project/glossary.json` を一時的に壊してもテストが緑のままであることを確認する:

```bash
mv sample-project/glossary.json sample-project/glossary.json.bak
npx vitest run src/core/canonical.test.ts src/core/load.test.ts
mv sample-project/glossary.json.bak sample-project/glossary.json
```

Expected: 移動中も PASS（このファイルの `it` がすべて緑）。落ちたら参照先の差し替え漏れ。

- [ ] **Step 4: 全体を確認する**

```bash
npm test
npx tsc -b
npm run lint
git status --short
```

Expected: 全件 PASS・エラー0／`tsc -b` と `lint` は無出力／`git status` に `sample-project/glossary.json` の変更が**無い**こと（あれば Step 3 の戻し漏れ）。

- [ ] **Step 5: コミット**

```bash
git add src/core/__fixtures__/glossary.canonical.json src/core/canonical.test.ts src/core/load.test.ts
git commit -m "M6: 正規形テストの fixture を専用の場所へ移す（sample-project は遊び場に戻す）"
```

---

## Task 11: 実機確認（**人間の作業**）

**サブエージェントは GUI を操作できない。このタスクは人間が実施する。** M4・M5 と同じく、実機でしか出ないバグがある（M5 では「二択ダイアログのオーバーレイの下にトーストが隠れて読めない」が実機確認だけで見つかった）。

### 事前に読むこと（M5 の実機確認で検証を2度空振りさせた罠）

- **dev サーバーの出所を確認する。** `vite.config.ts` は `strictPort: true` でポート5173固定。別チェックアウト（main など）の dev サーバーが先に5173を掴んでいると、**古いコードのアプリが表示される**。`Get-NetTCPConnection -LocalPort 5173` で掴んでいるプロセスのパスを確認する。
- **ページをリロードしたら必ずフォルダを開き直す。** リロードすると JS 側は監視を張り直さない（Task 8 で `beforeunload` の後片付けを足したので Rust 側の leak は減るが、`projectDir` が消えて監視が張られていない状態になるのは変わらない）。
- **確認用フォルダはリポジトリの外の空フォルダを使う。** `sample-project/` はテストの fixture を持っていた場所であり（Task 10 で移したが）、リポジトリ内で作業すると `git status` が汚れて判断を鈍らせる。
- **外部からの書き換えは Claude に依頼する。** エクスプローラで手貼りすると貼り先を間違えても症状が「何も起きない」で正常時と区別できない（M5 で実際に踏んだ）。Claude に頼めばどのフォルダへ書いたかがログに残る。

### 手順

- [ ] **Step 1: 起動する**

```bash
npm run tauri dev
```

- [ ] **Step 2: Markdown 出力（M6 の主題）**

1. リポジトリ外の空フォルダを作り、「フォルダを開く」で開く
2. 「用語集を作る」→ 用語を4件ほど足し、**種別をばらけさせる**（アクター1件・データ1件・未分類1件・定義を空のまま1件）。1件には別名を2つ、1件には備考を入れる
3. 「Markdown をコピー」を押す → トーストが出ることを確認 → メモ帳等に貼って次を確認:
   - 先頭が `## <用語集のタイトル>`、種別グループが `### アクター` などの h3。**`# ` で始まる行が無い**
   - グループの順が アクター → 状態 → イベント → 画面 → データ → その他 → 未分類 の enum 順（**存在する種別だけ**が出る）
   - 列が 名称／種別／定義／別名／備考。ID が出ていない
   - 定義を空にした用語の定義セルが `（未定義）`
   - 別名が読点で連結されている
4. 「Markdown を書き出す」を押す → 保存ダイアログの既定ファイル名が `<用語集のファイル名>.md` になっている → **プロジェクトフォルダの外**（例: デスクトップ）に保存 → 中身が3のコピー内容と一致する
5. もう一度「Markdown を書き出す」を押し、**プロジェクトフォルダの中**へ保存する → トーストが出る／**「ファイルが増えました」の外部変更通知が出ない**（走査対象は `.json` だけなので反応しないのが正しい）
6. 保存ダイアログでキャンセルする → **何も起きない**（バナーが出ない）

- [ ] **Step 3: 乗せ換えの回帰（M1〜M5 の完了条件のうち、実機で確認できるもの）**

コントローラへの乗せ換えで壊れていないことを確認する。**1件でも落ちたら Task 8 の移し漏れを疑う。**

1. **編集と自動保存**: 用語の名称を1文字変える → 1秒待つ → `git diff`（または外部エディタ）でその行だけが変わっている
2. **Undo/Redo**: Ctrl+Z で戻り、Ctrl+Shift+Z と Ctrl+Y で進む。テキスト入力中でも同じ
3. **ファイルの削除**: サイドバーの「削除」→ 確認ダイアログ → ゴミ箱へ移動 → 一覧から消え、OS のゴミ箱に入っている
4. **単一性違反**: Claude に頼んで**2つ目の用語集**をそのフォルダへ書いてもらう → 赤バッジが出る → 片方を削除すると消える（サイドバーの新規作成ボタンでは2つ目を作れないので、外から用意する必要がある。申し送り10節）
5. **外部変更の自動取り込み**: 用語集を開いたまま Claude に用語を1件足してもらう → トーストが出て一覧・エディタが更新される
6. **「取り込み前に戻す」**: 5のトーストのボタンを押す → 内容が戻る（`git diff` が空に戻ることで確認）
7. **二択ダイアログ**: 用語を1文字打った**直後**（自動保存が走る前）に Claude へ書き換えを依頼 → 二択が出る → 「自分の編集で上書き」を選ぶと自分の内容がディスクに残る。もう一度同じ状況を作って「外部変更を取り込む」を選ぶと外部の内容になり、Undo が効かなくなっている
8. **二択の最中は閉じられない**: 7 で二択が出ている状態でウィンドウの × を押す → 閉じず、**トーストが読める位置に出る**（オーバーレイの下に隠れていないこと。M5 で実機だけが見つけたバグ）
9. **外部で消えたファイル**: 用語集を開いたまま Claude に削除を依頼 → 選択が外れてトーストが出る → **ファイルが復活していない**（フォルダを見て確認）
10. **バナーの意味論（M6 で変えたところ）**: フォルダを開かずにアプリを起動し、監視バナーが出る条件を作れるなら確認する。難しければ、**「フォルダを開く」→ ファイル選択 → 別フォルダを開く、の一連でバナーが不自然に残らない／消えない**ことだけ見る

- [ ] **Step 4: 結果を申し送りに書く**

`docs/impl-scope-glossary.md` に「12. M6 完了に伴う申し送り（YYYY-MM-DD 追記）」を追加し、次を書く:

- 実機で確認できた項目と、**自動テストだけが検証経路である項目**（コントローラのテストが固定している順序5本。人手では窓を作れないので「テストを削らないこと」と明記する）
- 見つかったバグと修正（あれば）
- M7 で扱うもの（M5 申し送りの M7 項目に、Markdown 出力ボタンの見た目の仮置きを足す）
- いつでもよいが忘れると実害化する残件（M5 申し送り11節の残件のうち M6 で手を付けなかったもの、および新たに見つかったもの）
- **rev への反映事項は、この完了コミットで `docs/overview-rev.md` に反映まで済ませる**（M4 の教訓。TODO として申し送りに残さない）。今回反映すべき候補:
  - **6章**: モジュール規約6点セットが**充足した**こと（出力ロジック＝`toMarkdown`）
  - **8章**: 用語集の Markdown 出力の具体（見出し階層・グループ順・列構成・`（未定義）`）が実装で確定したこと
  - **7章**: 「Rust は原則書かない」の例外に**プラグイン登録**（clipboard-manager）を明記するか判断する
- 実装計画そのものに含まれていた誤り（次回の計画立案への教訓）

---

## Self-Review（計画作成者による確認）

**1. 仕様のカバレッジ**

| スコープ定義書の要求 | 対応タスク |
| --- | --- |
| 4節 M6「App の副作用の順序を検証できる形に切り出す」（必須） | Task 4〜8 |
| 4節 M6「種別グルーピングの表形式。`##`＝title、`###`＝種別グループ。h1 は使わない」 | Task 2 Step 1・3 |
| 4節 M6「空の種別は見出しごと省略。グループ順は enum 定義順。グループ内はデータ配列順」 | Task 2 Step 1・3 |
| 4節 M6「列: 名称／種別／定義／別名／備考（IDは出さない）」 | Task 2 Step 1・3 |
| 4節 M6「`definition` 空は `（未定義）`、`undecided` は `### 未分類`」 | Task 2 Step 1・3 |
| 4節 M6「クリップボードコピー ＋ .md 書き出しの両方」 | Task 3・Task 7・Task 9 |
| 9節「出力ロジックが規約6点セットの最後の空きスロット」 | Task 2 Step 5・6 |
| 9節「種別の日本語ラベルは `kind-labels.ts` を使い回す」 | Task 2 Step 3（`kindLabel`） |
| 11節「モーダルキューに `dropModal` / `clearModals` を足す」 | Task 4 Step 3、Task 5・6 で使用 |
| 11節「`ioError` の単一スロットの意味論」 | Task 4「振る舞いの変更1」（`BannerKind` 4種） |
| 11節「`ensureGlossary` の早期 return が無言」 | Task 5「振る舞いの変更2」 |
| 11節「`overwriteWithMine` の不一致時が無音 return」 | Task 6「振る舞いの変更3」 |
| 11節「`askExternalChange` が古い `external:<path>` トーストを消さない」 | Task 6「振る舞いの変更2」 |
| 11節「`overwriteWithMine` が `saveError` をクリアしない」 | Task 6「振る舞いの変更4」 |
| 11節「ページのリロードで Rust 側の watcher が leak する」 | Task 8「振る舞いの変更2」 |
| 11節「`sample-project/` はテストの fixture」 | Task 10 |
| 11節の残件「close の脱出口が `dispose()` の後に null にしない」 | Task 7「振る舞いの変更1」 |
| 11節の残件「`switchingFolderRef` がカウンタでない」 | Task 4「振る舞いの変更2」 |
| 8〜11節の残件「unmount の effect が `void flush()` の直後に `dispose()`」 | Task 4「振る舞いの変更4」 |
| M5 の処方1（状態の共有を列挙する） | 冒頭「状態変数の共有マップ」 |
| M5 の処方2（ref で凍結できるか確認する） | 冒頭「`ref` を使わない設計であることの確認」 |
| M5 の処方3（トーストの寿命と押せる文脈） | 冒頭「トーストの寿命と、押せる文脈」 |
| M5 の処方4（App に配線が増えるタスクでテストの書き方を決める） | Task 4 Step 5 のハーネス、Task 5〜7 の順序テスト |

**意図的にやらないこと**（申し送りに挙がっているが M6 の対象外と判断したもの。次のマイルストーンの申し送りへ引き継ぐ）:

- `move_to_trash` が同期コマンドで削除中にウィンドウが固まる（Rust 側の変更。M6 の主題と無関係で、体感しにくい）
- 編集1打鍵ごとの全ファイル `checkConsistency` 再実行（規模が増えるまで問題にならない）
- 定義セル・種別セルが `mark(index, field)` を参照していない／`resolveCommand` の細かい非対称／`CellInput` の caret 判定／`file-naming.ts` の予約デバイス名／`FileList` の `aria-describedby`／`@testing-library/user-event` の未使用（いずれも M6 で触る層ではない）
- `FLUSH_MAX_ROUNDS` の打ち切りパスのテスト／`fileExists` の専用テスト／`ChoiceDialog` のオーバーレイクリックのテスト
- `ConfirmDialog.dom.test.tsx` が見出しを `getByText` で引いている（M7 で `ConfirmDialog` を役割トークンへ寄せるときに一緒に直す）

**2. プレースホルダの走査**

「TBD」「適切に」「エラー処理を足す」「上記のテストを書く」「Task N と同様」の類は含めていない。各タスクのコードは実際に書ける形で載せてある。ただし冒頭に明記したとおり、**このコードは検証済みの正ではない**——実装時に矛盾が出たら辻褄を合わせず報告すること。

**3. 型の一貫性**

- `toMarkdown: (data: TData) => string`（Task 2 で追加）を、Task 7 の `doc.module.toMarkdown(doc.data)` とテストハーネスの `noteModule` が同じ形で使っている
- `BannerKind` の4値（`io` / `save` / `scan` / `watch`）が Task 4 の定義、Task 5〜7 の `host.setBanner` 呼び出し、Task 8 の `BANNER_ORDER` と `banners` state で一致している
- `AppIo` の10フィールドが、Task 4 の定義・テストハーネス・Task 8 の `appIo` で一致している
- `AppHost` の11フィールドが、Task 4 の定義・テストハーネス・Task 8 の `host` リテラルで一致している
- `RescanOutcome` の3 variant（`applied` / `skipped` / `failed`）が Task 5 の暫定実装と Task 6 の本実装、および `ensureFileOfType` の分岐で一致している
- コントローラの内部関数名（`applyFiles` / `setSelected` / `writeAndRecord` / `attachSaver` / `closeCurrentFile` / `addCreatedFile` / `rescan` / `revertImport` / `importExternalChange` / `overwriteWithMine` / `askExternalChange` / `handleSelectedGone` / `currentDocument` / `describeError`）はタスクを跨いで同じ綴りで使っている
- `dismissToastByKey(list, key)` / `dropModal(queue, key)` / `clearModals()` の引数の形が Task 4 の実装と Task 8 の host リテラルで一致している
