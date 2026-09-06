# Skill をプラグインとして配る 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同梱 Skill を Claude Code のプラグインへ移し、アプリがプロジェクトフォルダに何も書かないようにする。

**Architecture:** リポジトリ自身を marketplace にし、プラグイン本体を `plugins/facet/` に置く。アプリは同じディレクトリを resources に同梱し、プラグインが未導入のときだけ端末の `claude` に `--plugin-dir` で渡す。プロジェクトフォルダへの置き直し（`skill-sync`）と読み方ガイドの書き出しは撤去する。

**Tech Stack:** TypeScript / React / Tauri 2 / Vitest。Claude Code のプラグイン機構（`.claude-plugin/plugin.json`、`marketplace.json`、`--plugin-dir`）。

**Spec:** `docs/superpowers/specs/2026-09-06-m35-skills-as-plugin-design.md`

## Global Constraints

- **文書は現在形で書く。** 経緯・マイルストーン番号・日付・「消した／足した」の記録を書かない。1項目は2文まで、太字は1段落1箇所（`CLAUDE.md`「文書の書き方」）
- **コメントは「いまの値・構造の理由」と「踏むと壊れる罠」を現在形で書く。** 罠は「X を条件にすると Y を取り逃がす」の形で書く。マイルストーン番号・レビュー指摘・変更前の状態を書かない（`CLAUDE.md`「コードのコメントの書き方」）
- **テストの名前は守っている性質を書く。** 番号を書かない。テストの件数を文書に書かない
- **Skill 名は英数字とハイフンだけ。** 非 ASCII は落ちて `facet:-----` になる
- **生成物の原本は `schemas/*.schema.json` と `src/` の実体。** コピーを手で作らない
- **Rust は原則書かない**（`overview-rev.md` 7章）。このマイルストーンで Rust に足すものは無い（消すだけ）
- **既存の実装と一致すべきもの（文言・パス・ディレクトリ規約）は実物から逐語で写す**
- 作業はすべて worktree `C:\Dev\Projects\facet\.claude\worktrees\m35-skills-as-plugin` の中で行う

---

## File Structure

**新規**

| ファイル | 責務 |
| --- | --- |
| `.claude-plugin/marketplace.json` | リポジトリを marketplace として宣言する |
| `plugins/facet/.claude-plugin/plugin.json` | プラグインの名前・説明・版 |
| `plugins/facet/skills/**` | Skill 本体（`.claude/skills/` から移動） |
| `src/core/skills.ts` | facet が持つ Skill の名前の一覧（純データ） |
| `src/core/terminal/claude-args.ts` | `claude` に渡す引数を組み立てる純関数 |
| `src/fs/claude-plugin.ts` | 同梱プラグインのパス解決と、導入済みかの判定（Tauri 境界） |
| `src/core/legacy-artifacts.ts` | 旧版が置いた成果物の名前と、促し文の組み立て（純関数） |
| `src/fs/legacy-artifacts-io.ts` | 旧版の成果物の存在確認（Tauri 境界） |
| `src/components/settings/AiSettings.tsx` | 設定の「AI」タブ |

**削除**

| ファイル | 理由 |
| --- | --- |
| `src/core/skill-sync.ts` / `src/core/skill-sync.test.ts` | 置き直しをしない |
| `src/fs/skill-resources.ts` | 同上 |
| `src/core/reading-guide.ts` / `src/core/reading-guide.md` / `src/core/reading-guide.test.ts` | Skill へ移る |
| `src/fs/reading-guide-io.ts` | 同上 |

**変更**

| ファイル | 変更内容 |
| --- | --- |
| `src/App.tsx` | 同期2本を削除し、プラグイン判定と旧版の検出を足す |
| `src/components/TerminalTab.tsx` | `claude` の引数を props で受け取る |
| `src/core/terminal/pty-io.ts` | `CLAUDE_ARGS` を削除 |
| `src/components/SettingsDialog.tsx` | タブを1つ足し、`SettingsPanelProps` を広げる |
| `src/components/settings/types.ts` | `SettingsPanelProps` に判定結果を足す |
| `scripts/gen-skills.mjs` / `scripts/gen-skills.test.mjs` | 出力先と Skill 名 |
| `src/core/skill-schema-copy.test.ts` | スキーマコピーのパスと Skill 名 |
| `src/modules/*/skill-write.smoke.test.ts`（5本） | 書き出しスクリプトのパス |
| `src-tauri/tauri.conf.json` | `bundle.resources` |
| `src-tauri/capabilities/default.json` | 権限の削除と追加 |
| `src-tauri/src/lib.rs` | `allow_skill_dir` の削除 |
| `.gitignore` / `sample-project/.gitignore` | 生成物の追跡と、置かれなくなった配布物 |
| `docs/overview-rev.md` / `docs/project-setup.md` / `docs/<tool>/**` / `docs/open-issues.md` / `CLAUDE.md` | 設計判断と Skill 名 |

---

## Task 1: プラグインの器を作り、Skill を移して改名する

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `plugins/facet/.claude-plugin/plugin.json`
- Create: `src/core/skills.ts`
- Move: `.claude/skills/{glossary-term-register,error-catalog-register,sequence-register,issue-tree-register,logic-tree-register}` → `plugins/facet/skills/{write-term,write-error,write-sequence,write-issue-tree,write-logic-tree}`
- Modify: `src/core/skill-sync.ts`（`BUNDLED_SKILLS` の定義）
- Modify: `src/fs/skill-resources.ts:57`（`resolveResource` のパス）
- Modify: `scripts/gen-skills.mjs`（`SKILL_SOURCES` のキーと出力先）
- Modify: `scripts/gen-skills.test.mjs`（`generatedPath`）
- Modify: `src/core/skill-schema-copy.test.ts`（`SCHEMA_COPIES` と `copyPath`）
- Modify: `src/modules/{glossary,error-catalog,sequence,issue-tree,logic-tree}/skill-write.smoke.test.ts`
- Modify: `src-tauri/tauri.conf.json`（`bundle.resources`）
- Modify: `.gitignore`

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces:
  - `src/core/skills.ts` から `export const WRITE_SKILLS: readonly string[]`（5本の新名）
  - `plugins/facet/` にプラグインの実体（以降のタスクが同梱・配布する対象）

- [ ] **Step 1: 移動前の参照を数える**

いま Skill 名を書いているファイルを一覧にする。あとで消し漏れを見つけるための母集合なので、出力を計画の実行記録に貼ること。

```bash
grep -rln "glossary-term-register\|error-catalog-register\|sequence-register\|issue-tree-register\|logic-tree-register" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=target .
```

- [ ] **Step 2: Skill どうしの相互参照を確かめる**

SKILL.md が他の Skill を名指ししていると、改名で参照が切れる。

```bash
grep -rn "register" .claude/skills/*/SKILL.md
```

出力に他 Skill の名前があれば、Step 5 の改名と同じコミットで直す。

- [ ] **Step 3: プラグインの器を作る**

`plugins/facet/.claude-plugin/plugin.json`:

```json
{
  "name": "facet",
  "description": "仕様整理ツール facet のプロジェクトデータ（用語集・エラーカタログ・シーケンス・ロジックツリー・課題ツリーの JSON）を読み書きする Skill 群",
  "version": "0.1.0",
  "author": {
    "name": "Pryo"
  }
}
```

`.claude-plugin/marketplace.json`:

```json
{
  "name": "facet",
  "description": "仕様整理ツール facet の Skill",
  "owner": {
    "name": "Pryo"
  },
  "plugins": [
    {
      "name": "facet",
      "description": "facet のプロジェクトデータを読み書きする Skill 群",
      "version": "0.1.0",
      "source": "./plugins/facet"
    }
  ]
}
```

- [ ] **Step 4: 器が検証を通ることを確かめる**

Run: `claude plugin validate plugins/facet`
Expected: `✔ Validation passed`（警告なし。警告が出るなら `plugin.json` に足りないフィールドがある）

- [ ] **Step 4b: 2つのマニフェストが食い違わないようにする**

`claude plugin validate` は `plugin.json` しか見ない。`marketplace.json` が別の名前や版を述べていても通ってしまうので、一致をテストで縛る。

`scripts/plugin-manifest.test.mjs`:

```js
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * プラグインの名前と版は2つのファイルが述べる。**食い違うと、install した
 * 人の手元だけで別の版が入る**——`claude plugin validate` は plugin.json しか
 * 見ないので、ズレはここでしか止まらない
 */
describe('プラグインのマニフェスト', () => {
  const plugin = JSON.parse(readFileSync('plugins/facet/.claude-plugin/plugin.json', 'utf8'))
  const market = JSON.parse(readFileSync('.claude-plugin/marketplace.json', 'utf8'))
  const entry = market.plugins.find((p) => p.name === plugin.name)

  it('marketplace が plugin.json と同じ名前の項目を持つ', () => {
    expect(entry).toBeDefined()
  })

  it('版が一致する', () => {
    expect(entry.version).toBe(plugin.version)
  })

  it('marketplace の source が実体を指す', () => {
    expect(entry.source).toBe('./plugins/facet')
  })
})
```

Run: `npx vitest run scripts/plugin-manifest.test.mjs`
Expected: PASS（落ちるなら2つの JSON が食い違っている）

- [ ] **Step 5: Skill を移して改名する**

```bash
mkdir -p plugins/facet/skills
git mv .claude/skills/glossary-term-register plugins/facet/skills/write-term
git mv .claude/skills/error-catalog-register plugins/facet/skills/write-error
git mv .claude/skills/sequence-register plugins/facet/skills/write-sequence
git mv .claude/skills/issue-tree-register plugins/facet/skills/write-issue-tree
git mv .claude/skills/logic-tree-register plugins/facet/skills/write-logic-tree
```

各 `SKILL.md` の frontmatter の `name:` を、ディレクトリ名と同じ新名に書き換える。`description` は触らない（発火の質を変える変更は別の判断）。

- [ ] **Step 6: Skill の名前の一覧をコアに置く**

`src/core/skills.ts` を作る:

```ts
/**
 * facet がプラグインとして配る Skill の名前。
 *
 * **ディレクトリ名・`SKILL.md` の `name`・この配列の3つが一致する。**
 * ズレると、同梱物には入るのに `plugins/facet/skills/<名前>` が見つからない
 */
export const WRITE_SKILLS: readonly string[] = [
  'write-term',
  'write-error',
  'write-sequence',
  'write-issue-tree',
  'write-logic-tree',
]
```

`src/core/skill-sync.ts` の `BUNDLED_SKILLS` を、この配列を指すだけにする（JSDoc の「ここに1行足すだけでよい」は `src/core/skills.ts` を指すよう書き換える）:

```ts
import { WRITE_SKILLS } from './skills'

/**
 * アプリに同梱する Skill。名前の一覧は `src/core/skills.ts` が持つ
 */
export const BUNDLED_SKILLS: readonly string[] = WRITE_SKILLS
```

- [ ] **Step 7: 同梱物の読み出し先を変える**

`src/fs/skill-resources.ts` の `readBundled`。`bundle.resources` のキーが `plugin` になるので、Skill は `plugin/skills/<名前>` に落ちる。

```ts
  async readBundled(skill) {
    // bundle.resources で `plugins/facet` を `plugin` として同梱しているので、
    // 実行時のパスは `plugin/skills/<名前>` になる
    const root = await resolveResource(`plugin/skills/${skill}`)
    return collect(root, root)
  },
```

`src-tauri/tauri.conf.json` の `bundle.resources`:

```json
    "resources": {
      "../plugins/facet": "plugin"
    },
```

`src-tauri/capabilities/default.json` の `$RESOURCE/skills` を書いている3箇所を `$RESOURCE/plugin` に替える（`fs:allow-read-dir` の2エントリと `fs:allow-read-text-file` の1エントリ）。**この権限は Task 5 で消えるが、それまでは同期機構が動き続けるので今は必要である。**

- [ ] **Step 8: 生成物の出力先を変える**

`scripts/gen-skills.mjs` の `SKILL_SOURCES` のキーを新名にし、出力先の組み立てを `plugins/facet/skills` に変える。

```js
export const SKILL_SOURCES = {
  'write-term': { schema: 'glossary', shared: ['src/core/canonical.ts'] },
  'write-error': { schema: 'error-catalog', shared: ['src/core/canonical.ts'] },
  'write-sequence': {
    schema: 'sequence',
    shared: ['src/core/canonical.ts', 'src/modules/sequence/questions.ts'],
  },
  'write-issue-tree': {
    schema: 'issue-tree',
    shared: ['src/core/canonical.ts', 'src/modules/issue-tree/derive.ts'],
  },
  'write-logic-tree': {
    schema: 'logic-tree',
    shared: ['src/core/canonical.ts', 'src/core/canvas/flat-tree-core.ts'],
  },
}
```

出力先を組み立てている箇所（`.claude`, `skills` を `path.join` している行）を探して `plugins`, `facet`, `skills` に替える:

```bash
grep -n "'.claude'\|\"\.claude\"" scripts/gen-skills.mjs
```

- [ ] **Step 9: `.gitignore` の生成物の行を新しい場所に向ける**

```
# 同梱 Skill の生成物（正は schemas/*.schema.json と src/ の実体。npm run gen:skills で再生成）
plugins/facet/skills/*/scripts/generated/
```

（この行は Task 2 で削除する。ここで替えておかないと、Task 1 のコミットに生成物が混ざる）

- [ ] **Step 10: テストのパスと名前を追従させる**

`scripts/gen-skills.test.mjs` の `generatedPath`:

```js
function generatedPath(skill, file) {
  return path.join('plugins', 'facet', 'skills', skill, 'scripts', 'generated', file)
}
```

`src/core/skill-schema-copy.test.ts` の `SCHEMA_COPIES` の `skill` を新名にし、`copyPath` と書き出しスクリプトのパスを替える:

```ts
const SCHEMA_COPIES = [
  { skill: 'write-term', schema: 'glossary.schema.json', script: 'scripts/glossary-write.mjs' },
  { skill: 'write-error', schema: 'error-catalog.schema.json', script: 'scripts/error-catalog-write.mjs' },
  { skill: 'write-sequence', schema: 'sequence.schema.json', script: 'scripts/sequence-write.mjs' },
  { skill: 'write-issue-tree', schema: 'issue-tree.schema.json', script: 'scripts/issue-tree-write.mjs' },
  { skill: 'write-logic-tree', schema: 'logic-tree.schema.json', script: 'scripts/logic-tree-write.mjs' },
]
```

```ts
    const copyPath = `plugins/facet/skills/${skill}/schemas/${schema}`
```

`readFileSync(`.claude/skills/${skill}/${script}`, 'utf8')` も `plugins/facet/skills/` に替える。

**書き出しスクリプトのファイル名は変えない**（`glossary-write.mjs` など）。Skill の中でしか参照されず、改名の巻き添えを増やさない。

smoke テスト5本のパス（各1行）:

```bash
grep -rn "\.claude/skills" src/modules/*/skill-write.smoke.test.ts
```

出た行を `plugins/facet/skills/<新名>/scripts/<スクリプト名>` に替える。

**コード中のコメントが指すパスも直す。** `src/modules/issue-tree/derive.ts:27` が生成物の置き場を名指ししている。`palette-retheme` を指すもの（`src/styles/contrast.ts`、`src/styles/palette-requirements.ts`）は**直さない**——この Skill は `.claude/skills/` に残る。

- [ ] **Step 11: テストを走らせる**

Run: `npm test`
Expected: PASS（`gen:skills` が `pretest` で走り、新しい場所に生成物ができる）

Run: `npx tsc -b && npm run lint`
Expected: エラーなし

- [ ] **Step 11b: このリポジトリで作業する Claude が新しい Skill を使えるようにする**

Skill を `.claude/skills/` から出したので、facet 自身のセッションからは見えなくなっている。リポジトリ自身を project スコープの marketplace として宣言し、プラグインとして読ませる。

```bash
claude plugin marketplace add . --scope project
claude plugin install facet@facet --scope project
```

Run: `git diff --stat .claude/`
Expected: `.claude/settings.json` に marketplace と `enabledPlugins` の宣言が入る

**コマンドが書いた絶対パスをそのままコミットしない。** `claude plugin marketplace add` は `source.path` に実行時の作業ディレクトリを絶対パスで書く。それは作業機に固有で、しかも worktree を指す——`CLAUDE.md` の後片付けが消すディレクトリなので、マージ後は存在しない場所を指す宣言が主チェックアウトに配られる。

相対パス（`"path": "."`）に書き換えて、それでも Skill が解決できるか確かめる:

```bash
claude -p "Skill ツールで使える facet プラグインの skill 名を、名前だけ改行区切りで列挙して。他は書かないで。"
```

解決できるならその形でコミットする。解決できないなら `.claude/settings.json` を追跡から外し（`.gitignore` に足す）、代わりに `CLAUDE.md` に1行置く:

> このリポジトリで作業する Claude が同梱 Skill を使うには、一度 `claude plugin marketplace add ./ --scope local` を実行する。

**どちらを選んだかと、判断に使ったコマンドの出力を報告に書くこと。**

Run:

```bash
claude -p "Skill ツールで使える facet プラグインの skill 名を、名前だけ改行区切りで列挙して。他は書かないで。"
```

Expected: `facet:write-*` 5本が出る（`--plugin-dir` を渡していないのに出れば、project スコープの宣言が効いている）

- [ ] **Step 12: 残った参照が無いことを確かめる**

Run:

```bash
grep -rn "glossary-term-register\|error-catalog-register\|sequence-register\|issue-tree-register\|logic-tree-register" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=target --exclude-dir=worktrees .
```

Expected: `docs/` 配下だけが残る（Task 8 で直す）。`src/` と `scripts/` と `src-tauri/` が出たら直す

- [ ] **Step 13: コミット**

```bash
git add -A
git commit -m "refactor(m35): Skill をプラグインへ移し、動詞から始まる名前に改める"
```

---

## Task 2: 生成物を追跡対象にする

**Files:**
- Modify: `.gitignore`
- Modify: `scripts/gen-skills.test.mjs`
- Create: `plugins/facet/skills/*/scripts/generated/**`（生成物のコミット）

**Interfaces:**
- Consumes: Task 1 の `plugins/facet/skills/*/scripts/generated/`
- Produces: なし（配布物の完全性だけ）

- [ ] **Step 0: 無視を外す**

テストより先にこちらを外す。無視されたままだと `git status` が空を返し、**テストが理由なく緑になる**（守りたい性質を突けない）。

`.gitignore` から次の2行（コメントを含む）を削除する:

```
# 同梱 Skill の生成物（正は schemas/*.schema.json と src/ の実体。npm run gen:skills で再生成）
plugins/facet/skills/*/scripts/generated/
```

Run: `git status --porcelain -- 'plugins/facet/skills/*/scripts/generated' | head`
Expected: `?? plugins/facet/skills/write-term/scripts/generated/` のような未追跡の行が出る（出ないなら `npm run gen:skills` をまだ走らせていない）

- [ ] **Step 1: 未コミットの生成物を検出するテストを書く**

`scripts/gen-skills.test.mjs` の末尾に足す:

```js
import { execFileSync } from 'node:child_process'

describe('生成物の配布', () => {
  it('作業ツリーに未コミットの生成物が残らない', () => {
    // marketplace は git の内容をそのまま配る。生成物が追跡外だったり
    // 生成し直した結果をコミットし忘れたりすると、install した先の Skill が
    // 「generated が無い」で落ちる。`pretest` で生成し直した直後に差分が
    // 出るなら、それはコミットされていない。
    //
    // **見るのは生成物のディレクトリだけ。** Skill 全体を対象にすると、
    // SKILL.md を書きかけているだけで赤くなり、編集とテストを同時に
    // 回せなくなる
    const status = execFileSync(
      'git',
      ['status', '--porcelain', '--', 'plugins/facet/skills/*/scripts/generated'],
      { encoding: 'utf8' },
    )
    expect(status).toBe('')
  })
})
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npx vitest run scripts/gen-skills.test.mjs`
Expected: FAIL（生成物が未追跡として `git status` に出る。緑になるなら Step 0 の無視外しが効いていない）

- [ ] **Step 3: 生成物をコミットする**

```bash
npm run gen:skills
git add plugins/facet/skills .gitignore scripts/gen-skills.test.mjs
git commit -m "build(m35): Skill の生成物を追跡し、コミット漏れをテストで止める"
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test`
Expected: PASS

---

## Task 3: 読み方ガイドを Skill にする

**Files:**
- Create: `plugins/facet/skills/read-project/SKILL.md`
- Delete: `src/core/reading-guide.ts`, `src/core/reading-guide.md`, `src/core/reading-guide.test.ts`, `src/fs/reading-guide-io.ts`
- Modify: `src/App.tsx:44,101,708-714`
- Modify: `src/App.dom.test.tsx:61,91,233-237,562,566,829`（`syncReadingGuideMock` と mock）
- Modify: `src/core/skills.ts`
- Modify: `plugins/facet/skills/write-*/SKILL.md`（5本。参照を1行足す）

**Interfaces:**
- Consumes: `src/core/skills.ts` の `WRITE_SKILLS`
- Produces: `src/core/skills.ts` から `export const READ_SKILL: string`（`'read-project'`）と `export const FACET_SKILLS: readonly string[]`（`READ_SKILL` と `WRITE_SKILLS` を合わせたもの）

- [ ] **Step 1: 原本を Skill にする**

**本文は手で写さない。** 原本の「## ファイルの見つけ方」以降を機械で切り出し、frontmatter と見出しを頭に付ける。手で写すと、長い規約のどこかが静かに変わる。

```bash
mkdir -p plugins/facet/skills/read-project
cat > plugins/facet/skills/read-project/SKILL.md <<'EOF'
---
name: read-project
description: 仕様整理ツール facet のプロジェクトフォルダ（type が glossary / errorCatalog / sequence / logicTree / issueTree の JSON がある）を読むときに使う。仕様の要約・実装・質問への回答・レビューでこれらの JSON に触れるとき、ファイルの見つけ方・ID の解決・「未決」の扱い・ツールごとの読み方を与える。空欄や undecided を推測で埋めないために、書き込みを伴わない読み取りでも必ず使うこと。
---

# facet のプロジェクトデータの読み方

EOF
sed -n '/^## ファイルの見つけ方/,$p' src/core/reading-guide.md >> plugins/facet/skills/read-project/SKILL.md
```

先頭の `# このフォルダの読み方（AI向け）` と、その次の「facet が自動で管理する」旨の引用ブロックは落ちる——アプリはもうこのファイルを管理しない。

**本文を書き換えない。** 読み方の規約はこのマイルストーンの対象ではない。

- [ ] **Step 2: 写し漏れが無いことを確かめる**

Run:

```bash
diff <(sed -n '/^## ファイルの見つけ方/,$p' src/core/reading-guide.md) <(sed -n '/^## ファイルの見つけ方/,$p' plugins/facet/skills/read-project/SKILL.md)
```

Expected: 差分なし

- [ ] **Step 3: Skill の一覧に足す**

`src/core/skills.ts`:

```ts
/** データを読むだけの Skill */
export const READ_SKILL = 'read-project'

/** facet が配る Skill のすべて */
export const FACET_SKILLS: readonly string[] = [READ_SKILL, ...WRITE_SKILLS]
```

- [ ] **Step 4: 登録 Skill から読み方ガイドを参照させる**

`write-*/SKILL.md` 5本の、`# <見出し>` の直後に1行足す:

```markdown
**このフォルダのデータの読み方は `facet:read-project` が持つ。** 既存のファイルを読んでから書くときは先にそちらを見ること。
```

- [ ] **Step 5: 書き出しをやめる**

`src/App.tsx` から次を消す:

- `import { READING_GUIDE_FILENAME, syncReadingGuide } from '@/core/reading-guide'`（44行目）
- `import { tauriReadingGuideIo } from '@/fs/reading-guide-io'`（101行目）
- `openProject` の中の `try { await syncReadingGuide(...) } catch { showToast(...) }` のブロック（708-714行目）

上のブロックのすぐ手前にある `saveLastProjectDir` のコメント「読み方ガイドの配置失敗（下）とは違いトーストは出さない」も、指す先が消えるので直す:

```ts
    // 保存できなくても次回単に復元されないだけで、このセッションの作業には
    // 影響しない。だからトーストは出さない
```

ファイルを消す:

```bash
git rm src/core/reading-guide.ts src/core/reading-guide.md src/core/reading-guide.test.ts src/fs/reading-guide-io.ts
```

- [ ] **Step 5b: App の DOM テストからガイドの検査を外す**

`src/App.dom.test.tsx` がガイドの同期を mock して見ている。消すもの:

- `syncReadingGuideMock` の宣言（61・91行目）と `mockClear`（562行目）
- `vi.mock('@/fs/reading-guide-io', ...)` と `vi.mock('@/core/reading-guide', ...)`（233-237行目）
- `expect(syncReadingGuideMock).toHaveBeenCalledWith(...)` を含む行（566・829行目）。**`it` のブロックごと消すのではなく、その1行だけを消す**——566行目はフォルダを開く経路、829行目は起動時の復元経路を見ており、どちらのテストもガイド以外の性質（開けること・復元されること）を検証している

Run: `npx vitest run src/App.dom.test.tsx`
Expected: PASS

- [ ] **Step 6: テストを走らせる**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS（`reading-guide` を参照するテストが他に無いこと。あれば `grep -rn "reading-guide\|READING_GUIDE" src/` で見つけて直す）

- [ ] **Step 7: プラグインが読めることを確かめる**

Run:

```bash
claude -p --plugin-dir ./plugins/facet "Skill ツールで使える facet プラグインの skill 名を、名前だけ改行区切りで列挙して。他は書かないで。"
```

Expected: `facet:read-project` と `facet:write-*` 5本が出る

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "feat(m35): 読み方ガイドを read-project Skill にして、フォルダへの書き出しをやめる"
```

---

## Task 4: 未導入のときだけ同梱プラグインを端末へ渡す

**Files:**
- Create: `src/core/terminal/claude-args.ts`
- Create: `src/core/terminal/claude-args.test.ts`
- Create: `src/fs/claude-plugin.ts`
- Modify: `src/core/terminal/pty-io.ts:25`
- Modify: `src/components/TerminalTab.tsx:7,111,331`
- Modify: `src/App.tsx`（`TerminalTab` を描いている箇所）
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: なし
- Produces:
  - `buildClaudeArgs(bundledPluginDir: string | null): string[]`
  - `FACET_PLUGIN_ID = 'facet@facet'`
  - `readFacetPluginEnabled(): Promise<boolean>`
  - `bundledPluginDir(): Promise<string>`
  - `TerminalTab` の props に `claudeArgs: readonly string[]`

- [ ] **Step 1: 引数を組み立てる純関数のテストを書く**

`src/core/terminal/claude-args.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildClaudeArgs } from './claude-args'

describe('claude に渡す引数', () => {
  it('同梱プラグインを渡さないときは空になる', () => {
    expect(buildClaudeArgs(null)).toEqual([])
  })

  it('同梱プラグインのパスを --plugin-dir で渡す', () => {
    expect(buildClaudeArgs('C:\\app\\plugin')).toEqual(['--plugin-dir', 'C:\\app\\plugin'])
  })

  it('空文字は渡さない（パス解決に失敗した値でプラグインを読ませない）', () => {
    expect(buildClaudeArgs('')).toEqual([])
  })
})
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npx vitest run src/core/terminal/claude-args.test.ts`
Expected: FAIL（`buildClaudeArgs` が無い）

- [ ] **Step 3: 純関数を書く**

`src/core/terminal/claude-args.ts`:

```ts
/**
 * 端末で起動する `claude` に渡す引数（コア・純関数）。
 *
 * **同梱プラグインを渡すのは、利用者がプラグインを導入していないときだけ。**
 * 導入済みの版と同梱の版が両方読まれると、同じ名前の Skill が2つ現れる
 */
export function buildClaudeArgs(bundledPluginDir: string | null): string[] {
  if (bundledPluginDir === null || bundledPluginDir === '') return []
  return ['--plugin-dir', bundledPluginDir]
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run src/core/terminal/claude-args.test.ts`
Expected: PASS

- [ ] **Step 5: 判定と同梱パスの解決を書く**

`src/fs/claude-plugin.ts`:

```ts
import { homeDir, join, resolveResource } from '@tauri-apps/api/path'
import { readTextFile } from '@tauri-apps/plugin-fs'

/**
 * プラグインの識別子。`<プラグイン名>@<marketplace 名>` で、どちらも
 * `.claude-plugin/marketplace.json` が決めている
 */
export const FACET_PLUGIN_ID = 'facet@facet'

/**
 * 同梱プラグインの実体の場所。`bundle.resources` が
 * `plugins/facet` を `plugin` として入れている
 */
export function bundledPluginDir(): Promise<string> {
  return resolveResource('plugin')
}

/**
 * 利用者がプラグインを導入して有効にしているか。
 *
 * **コマンドを起こさずファイルを1つ読む。** `claude plugin list --json` の
 * ほうが正確だが、そのために子プロセスを起こす手段を増やすことになる。
 * 有効・無効は `enabledPlugins` に現れるので、これで足りる。
 *
 * **読めなければ false を返す。** ファイルが無い（Claude Code を一度も
 * 使っていない）・壊れている・形式が変わった、のどれでも
 * 「導入していない」に倒す——同梱版を渡す側に倒れるので、
 * 最悪でも「同じ Skill が2つ見える」で済む。逆に倒すと Skill が消える
 */
export async function readFacetPluginEnabled(): Promise<boolean> {
  try {
    const path = await join(await homeDir(), '.claude', 'settings.json')
    const parsed: unknown = JSON.parse(await readTextFile(path))
    if (typeof parsed !== 'object' || parsed === null) return false
    const enabled = (parsed as { enabledPlugins?: unknown }).enabledPlugins
    if (typeof enabled !== 'object' || enabled === null) return false
    return (enabled as Record<string, unknown>)[FACET_PLUGIN_ID] === true
  } catch {
    return false
  }
}
```

- [ ] **Step 6: 読み取りの権限を足す**

`src-tauri/capabilities/default.json` の `permissions` に足す:

```json
    {
      "identifier": "fs:allow-read-text-file",
      "allow": [{ "path": "$HOME/.claude/settings.json" }]
    },
```

`description` にも1文足す（既存の文体に合わせ、現在形で）:

> `$HOME/.claude/settings.json` の読み取りは、利用者が facet のプラグインを導入しているかを見るため。導入済みなら端末の `claude` に `--plugin-dir` を渡さない。

- [ ] **Step 7: 端末が引数を受け取るようにする**

`src/core/terminal/pty-io.ts` の `CLAUDE_ARGS` を削除する（`CLAUDE_PROGRAM` は残す）。

`src/components/TerminalTab.tsx`:

- import から `CLAUDE_ARGS` を外す
- props の型に `claudeArgs: readonly string[]` を足し、`const { session, cwd, ptyIo, hidden, insertion, clipboardIo } = props` に `claudeArgs` を足す
- `args: [...CLAUDE_ARGS]` を `args: [...claudeArgs]` にする

**起動は1回だけで、`claudeArgs` が後から変わっても効かない**（`spawn` は起動 effect の中で1回だけ呼ばれる）。判定は端末を開くより前に済んでいるので問題にならないが、props のコメントにその前提を書く:

```ts
  /**
   * `claude` に渡す引数。**起動時の値だけが効く**——`spawn` は起動 effect の
   * 中で1回しか呼ばれないので、あとから変えても再起動までは反映されない
   */
  claudeArgs: readonly string[]
```

- [ ] **Step 8: App が判定して渡す**

`src/App.tsx`:

```ts
import { buildClaudeArgs } from '@/core/terminal/claude-args'
import { bundledPluginDir, readFacetPluginEnabled } from '@/fs/claude-plugin'
```

コンポーネントの中に state と effect を置く。`null` は「まだ判定していない」ではなく「渡さない」を意味するので、初期値は空配列にせず**判定が済むまで端末を作らない**設計にはしない——端末は判定を待たずに開けるべきで、待たせると起動が遅くなる。代わりに**判定は起動直後に1回だけ行い、その結果を端末に渡す**:

```ts
  /**
   * `claude` に渡す引数。**判定は起動時に1回だけ。** 利用者が facet の
   * プラグインを導入していれば同梱版は渡さない（同じ名前の Skill が2つ現れる）
   */
  const [claudeArgs, setClaudeArgs] = useState<readonly string[]>([])
  useEffect(() => {
    void (async () => {
      if (await readFacetPluginEnabled()) return
      try {
        setClaudeArgs(buildClaudeArgs(await bundledPluginDir()))
      } catch (err: unknown) {
        // 同梱物の場所が引けないのは異常だが、ここで止めても端末は開ける。
        // Skill 無しで起動して、設定の AI タブが導入手順を出す
        console.error('同梱プラグインの場所を解決できませんでした', err)
      }
    })()
  }, [])
```

`<TerminalTab ... />` に `claudeArgs={claudeArgs}` を足す。

**判定結果そのものを持つ state は Task 7 で足す。** ここで足すと、使う側（設定の AI タブ）が無いので未使用の変数になり lint が落ちる。

**端末の起動が判定より先に走ると、引数が空のまま起動する。** 端末は利用者がタブを開いたときに作られるので、起動直後の1回の判定はそれより先に終わる。ただし競合の可能性はゼロではないので、実機確認（人間）で「アプリ起動直後に端末タブを開いても Skill が使える」ことを確かめる。

- [ ] **Step 9: テストを走らせる**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS（`TerminalTab` を描くテストがあれば `claudeArgs={[]}` を足す。`grep -rn "TerminalTab" src/**/*.test.tsx` で探す）

- [ ] **Step 10: コミット**

```bash
git add -A
git commit -m "feat(m35): プラグインが未導入のときだけ同梱版を --plugin-dir で渡す"
```

---

## Task 5: プロジェクトフォルダへの置き直しを撤去する

**Files:**
- Delete: `src/core/skill-sync.ts`, `src/core/skill-sync.test.ts`, `src/fs/skill-resources.ts`
- Modify: `src/App.tsx`（48・103行の import、`syncSkillsOnce`、同期の `useEffect`）
- Modify: `src/App.dom.test.tsx`（`skillCalls` とその mock、同期を見るテスト群）
- Modify: `src/core/skill-schema-copy.test.ts`
- Modify: `scripts/gen-skills.test.mjs`（`BUNDLED_SKILLS` の import 元）
- Modify: `src/fs/project-fs.ts:10`（`allowSkillDir` を指すコメント）
- Modify: `src-tauri/src/lib.rs`（`allow_skill_dir` と `invoke_handler` の登録）
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: `src/core/skills.ts` の `WRITE_SKILLS`（Task 1）、`claudeArgs` の経路（Task 4）
- Produces: なし（撤去のみ）

- [ ] **Step 1: スキーマのバイト一致テストを付け替える**

`src/core/skill-schema-copy.test.ts` の import を替える:

```ts
import { WRITE_SKILLS } from './skills'
```

「BUNDLED_SKILLS のすべてを網羅する」を `WRITE_SKILLS` で書き直し、名前も守っている性質に直す:

```ts
  it('書き込み Skill のすべてを網羅する', () => {
    expect(SCHEMA_COPIES.map((c) => c.skill).sort()).toEqual([...WRITE_SKILLS].sort())
  })
```

`shouldSyncSkillFile` を見る `it('プロジェクトフォルダへ同期される', ...)` を**削除する**（同期そのものが無くなる）。この検査が守っていた「同梱物には入るのに置いた先に現れない」という失敗は、置き直しをやめた時点で起こり得なくなる。

- [ ] **Step 1b: 生成物のテストの import 元を替える**

`scripts/gen-skills.test.mjs` は `BUNDLED_SKILLS` を `src/core/skill-sync.ts` から取っている。**この import を替えないと、消した瞬間にこのテストが解決不能になる。**

```js
import { WRITE_SKILLS } from '../src/core/skills.ts'
```

`BUNDLED_SKILLS` を使っている箇所（`SKILL_SOURCES` の網羅を見るテスト）を `WRITE_SKILLS` に替える。

- [ ] **Step 2: テストが通ることを確かめる**

Run: `npx vitest run src/core/skill-schema-copy.test.ts scripts/gen-skills.test.mjs`
Expected: PASS

- [ ] **Step 3: App から同期を外す**

`src/App.tsx` から消す:

- `import { BUNDLED_SKILLS, syncBundledSkills } from '@/core/skill-sync'`（48行目）
- `import { allowSkillDir, tauriSkillSyncIo } from '@/fs/skill-resources'`（103行目）
- `skillSyncInFlight` の宣言と `syncSkillsOnce` 関数（その上の長い JSDoc ごと）
- `syncSkillsOnce(dir)` を呼ぶ `useEffect`（1041行目付近から `return () => { current = false }` まで）

- [ ] **Step 3b: App の DOM テストから同期の検査を外す**

`src/App.dom.test.tsx` は Skill 同期の呼ばれ方を記録して見ている。**同期そのものが無くなるので、この検査群ごと消す。**

消すもの:

- `skillCalls` の宣言（38行目付近の JSDoc、58・88行目）と、`beforeEach` の `skillCalls.length = 0`（362行目付近）
- `vi.mock('@/fs/skill-resources', ...)`（219行目付近）と `vi.mock('@/core/skill-sync', ...)`（225行目付近）
- `skillCalls` を `expect` するテスト（453・459・476・479・489・494・497行目付近を含む `it` のブロックごと）
- 「READING_GUIDE_FILENAME 等は実物のまま、同期関数だけ差し替える」の mock（234行目付近。Task 3 でガイドが消えているので、ここも残っていれば消す）

**`it` の中身だけを消して空のブロックを残さない。** 検証していた性質（重複排除・切り替え時の順序）は、機構ごと無くなる。

Run: `npx vitest run src/App.dom.test.tsx`
Expected: PASS（`skillCalls` を参照する行が残っていれば型エラーで落ちる）

- [ ] **Step 4: ファイルを消す**

```bash
git rm src/core/skill-sync.ts src/core/skill-sync.test.ts src/fs/skill-resources.ts
```

`src/fs/project-fs.ts:10` のコメントが `allowSkillDir` を「同じ理由」の例として挙げている。指す先が消えるので、`allow_project_dir` 自身の理由だけを述べる形に直す。

- [ ] **Step 5: Rust の許可を消す**

`src-tauri/src/lib.rs` から `allow_skill_dir` 関数（その上の doc コメントごと）を消し、`invoke_handler` の `generate_handler![...]` から `allow_skill_dir` を外す。

**`allow_project_dir` は消さない**（起動時のフォルダ復元で使う。別の目的）。

- [ ] **Step 6: Rust が通ることを確かめる**

Run: `cd src-tauri && cargo test`
Expected: PASS（`allow_skill_dir` を参照する箇所が残っていればコンパイルが落ちる）

- [ ] **Step 7: 権限を削る**

`src-tauri/capabilities/default.json` の `permissions` から消す:

- `"fs:allow-remove"`
- `"fs:allow-mkdir"`（**文字列の行だけ**。`$APPCONFIG` を許可する scoped エントリは残す）
- `$RESOURCE/plugin` を許可する3エントリ（`fs:allow-read-dir` の2つと `fs:allow-read-text-file` の1つ。同梱物はもう読まない——パスを解決して `claude` に渡すだけで、パス解決に fs の権限は要らない）

`description` から、消えた権限を説明している文（`fs:allow-mkdir / fs:allow-remove は同梱 Skill を…` から `…別に allow_skill_dir（自前コマンド）で許可する。` まで）を削り、Task 4 で足した1文を残す。

- [ ] **Step 8: 設定の保存が壊れていないことを確かめる**

`$APPCONFIG` の `mkdir` は scoped エントリだけで許可される必要がある。これは実行時にしか分からないので、**実機で確かめる**（人間の作業。PR 本文の確認項目に入れる）。テストでは代替できない。

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 9: コミット**

```bash
git add -A
git commit -m "refactor(m35): Skill の置き直しと、そのための権限を撤去する"
```

---

## Task 6: 旧版が置いたものを見つけて消すよう促す

**Files:**
- Create: `src/core/legacy-artifacts.ts`
- Create: `src/core/legacy-artifacts.test.ts`
- Create: `src/fs/legacy-artifacts-io.ts`
- Modify: `src/App.tsx`（`openProject`）

**Interfaces:**
- Consumes: なし
- Produces:
  - `LEGACY_SKILL_DIRS: readonly string[]`
  - `LEGACY_GUIDE_FILENAME = 'README-for-AI.md'`
  - `LEGACY_GUIDE_MARK: string`
  - `describeLegacyArtifacts(found: { skills: readonly string[]; guide: boolean }): string | null`
  - `findLegacyArtifacts(projectDir: string): Promise<{ skills: string[]; guide: boolean }>`

- [ ] **Step 1: 促し文を組み立てる純関数のテストを書く**

`src/core/legacy-artifacts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { describeLegacyArtifacts } from './legacy-artifacts'

describe('旧版の成果物の知らせ', () => {
  it('何も無ければ知らせない', () => {
    expect(describeLegacyArtifacts({ skills: [], guide: false })).toBeNull()
  })

  it('Skill だけがあるときは、その名前を挙げて消すよう促す', () => {
    const message = describeLegacyArtifacts({ skills: ['glossary-term-register'], guide: false })
    expect(message).toContain('.claude/skills/glossary-term-register')
    expect(message).toContain('消してください')
  })

  it('ガイドだけがあるときは、そのファイル名を挙げる', () => {
    const message = describeLegacyArtifacts({ skills: [], guide: true })
    expect(message).toContain('README-for-AI.md')
  })

  it('両方あるときは1つの知らせにまとめる', () => {
    const message = describeLegacyArtifacts({ skills: ['sequence-register'], guide: true })
    expect(message).toContain('.claude/skills/sequence-register')
    expect(message).toContain('README-for-AI.md')
  })
})
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npx vitest run src/core/legacy-artifacts.test.ts`
Expected: FAIL（`describeLegacyArtifacts` が無い）

- [ ] **Step 3: 純関数を書く**

`src/core/legacy-artifacts.ts`:

```ts
/**
 * 旧版がプロジェクトフォルダへ置いたもの（コア・純関数）。
 *
 * **見る名前は facet が付けたものに限る。** ソースコードのリポジトリを
 * プロジェクトフォルダに指定することがあり、そこには利用者自身の
 * `.claude/` がある。`.claude/` や `.claude/skills/` の存在そのものを
 * 条件にすると、facet が何も置いていないフォルダでも知らせが出る
 */

/**
 * 旧版が置いた Skill のディレクトリ名。
 *
 * **いまの Skill 名（`write-term` など）は入れない。** 新しい名前は
 * プラグインの中にしか無く、`.claude/skills/` にあるならそれは利用者が
 * 自分で置いたものである
 */
export const LEGACY_SKILL_DIRS: readonly string[] = [
  'glossary-term-register',
  'error-catalog-register',
  'sequence-register',
  'issue-tree-register',
  'logic-tree-register',
]

/** 旧版が置いた読み方ガイドのファイル名 */
export const LEGACY_GUIDE_FILENAME = 'README-for-AI.md'

/**
 * 旧版のガイドを見分ける目印。
 *
 * **ファイル名だけでは判定しない。** 同じ名前のファイルを利用者が自分で
 * 書いていることがあり、それを消すよう促すと利用者の文章を失わせる。
 * この一文は旧版のガイドが必ず先頭付近に持つ
 */
export const LEGACY_GUIDE_MARK = 'このファイルは仕様整理ツール facet が自動で管理する'

export interface LegacyArtifacts {
  /** 見つかった旧版の Skill のディレクトリ名 */
  skills: readonly string[]
  /** 旧版のガイドがあるか */
  guide: boolean
}

/**
 * 見つかったものを1つの知らせにする。無ければ `null`。
 *
 * **アプリは消さない。** 消す主体を利用者に置くのは、facet が置いたと
 * 判定した根拠が名前だけで、間違えたときに失うものが利用者のファイルだから
 */
export function describeLegacyArtifacts(found: LegacyArtifacts): string | null {
  const paths = [
    ...found.skills.map((name) => `.claude/skills/${name}`),
    ...(found.guide ? [LEGACY_GUIDE_FILENAME] : []),
  ]
  if (paths.length === 0) return null
  return `古い版の facet が置いたものが残っています。プラグインの Skill と二重になるので消してください: ${paths.join('、')}`
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run src/core/legacy-artifacts.test.ts`
Expected: PASS

- [ ] **Step 4b: `.claude/` を読むための scope 許可を足す**

**これが無いと mac で検出そのものが落ちる。** fs の実行時 scope は `require_literal_leading_dot: true`（unix の既定）で照合するので、ダイアログが入れる `<dir>/**` も `allow_project_dir` が入れる `<dir>/**` も、ドット始まりの `.claude` に一致しない。

`src-tauri/src/lib.rs` に、`allow_project_dir` の隣へ1本足す:

```rust
/// プロジェクトフォルダの `.claude` を fs の実行時 scope に入れる（読むためだけ）。
///
/// **実行時 scope は `require_literal_leading_dot: true`（unix の既定）で照合するので、
/// `<dir>/**` はドット始まりの要素に一致しない。** ダイアログが入れる scope も
/// `allow_project_dir` が入れる scope も同じ形なので、これが無いと mac では
/// `<dir>/.claude/skills/<名前>` の存在確認が forbidden path で落ちる。
/// `tauri.conf.json` の `requireLiteralLeadingDot: false` は静的 scope にしか効かない。
/// 判断は一切置かない（rev 7章）
#[tauri::command]
fn allow_dot_claude(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    if dir.is_empty() {
        return Err("dir must not be empty".to_string());
    }
    let scope = app.fs_scope();
    scope
        .allow_directory(std::path::Path::new(&dir).join(".claude"), true)
        .map_err(|e| e.to_string())
}
```

`generate_handler!` に `allow_dot_claude` を足す。**自前コマンドは ACL 対象外なので `capabilities/default.json` への追記は要らない。**

- [ ] **Step 5: 存在を確かめる側を書く**

`src/fs/legacy-artifacts-io.ts`:

```ts
import { invoke } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { exists, readTextFile } from '@tauri-apps/plugin-fs'
import {
  LEGACY_GUIDE_FILENAME,
  LEGACY_GUIDE_MARK,
  LEGACY_SKILL_DIRS,
  type LegacyArtifacts,
} from '@/core/legacy-artifacts'

/**
 * 旧版が置いたものを探す（Tauri 境界）。**読むだけで、消さない。**
 *
 * 失敗は「無い」に倒す。フォルダを開いた直後の余計なエラーで、
 * 本来の作業（ファイルを開く）を邪魔しない
 */
export async function findLegacyArtifacts(projectDir: string): Promise<LegacyArtifacts> {
  // **`.claude/` を読む前に呼ぶ。** これが無いと mac では最初の `exists` が
  // forbidden path で落ちる（理由は `src-tauri/src/lib.rs` の `allow_dot_claude`）
  try {
    await invoke('allow_dot_claude', { dir: projectDir })
  } catch {
    // 許可が取れなくても続ける。取れていれば読めるし、取れていなければ
    // 下の `exists` が失敗して「無い」に倒れる
  }
  const skills: string[] = []
  for (const name of LEGACY_SKILL_DIRS) {
    try {
      if (await exists(await join(projectDir, '.claude', 'skills', name))) skills.push(name)
    } catch {
      // 読めないディレクトリは「無い」とみなす
    }
  }
  let guide = false
  try {
    const path = await join(projectDir, LEGACY_GUIDE_FILENAME)
    guide = (await exists(path)) && (await readTextFile(path)).includes(LEGACY_GUIDE_MARK)
  } catch {
    // 同上
  }
  return { skills, guide }
}
```

- [ ] **Step 6: フォルダを開いたときに知らせる**

`src/App.tsx` の `openProject` の中、`saveLastProjectDir` の `try/catch` の**後ろ**（読み方ガイドの同期を消した場所）に置く:

```ts
    // 旧版が置いたものが残っていると、プロジェクトスコープの Skill が
    // プラグインより先に見つかって古い版が発火する。**消すのは利用者**
    try {
      const message = describeLegacyArtifacts(await findLegacyArtifacts(dir))
      if (message !== null) showToast({ message, key: 'legacy-artifacts' })
    } catch (err: unknown) {
      console.error('旧版の成果物を確認できませんでした', err)
    }
```

import を足す:

```ts
import { describeLegacyArtifacts } from '@/core/legacy-artifacts'
import { findLegacyArtifacts } from '@/fs/legacy-artifacts-io'
```

- [ ] **Step 7: テストを走らせる**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "feat(m35): 旧版が置いた Skill とガイドを見つけて消すよう促す"
```

---

## Task 7: 設定に「AI」タブを置く

**Files:**
- Create: `src/components/settings/AiSettings.tsx`
- Modify: `src/components/settings/types.ts`
- Modify: `src/components/SettingsDialog.tsx:17-25`
- Modify: `src/components/SettingsDialog.dom.test.tsx`
- Modify: `src/App.tsx`（`SettingsDialog` を描いている箇所）

**Interfaces:**
- Consumes: Task 4 の判定（`claudeArgs` が空かどうかで導入済みが分かる）
- Produces: `SettingsPanelProps` に `pluginInstalled: boolean`

- [ ] **Step 1: 現状のパネルの props を確かめる**

Run: `cat src/components/settings/types.ts`
Expected: `SettingsPanelProps` が `settings` と `onChange` を持つ

- [ ] **Step 2: タブが現れることを見る DOM テストを書く**

既存の `show()` ヘルパは `pluginInstalled` を渡していないので、引数を1つ増やす。**タブの切り替えは `clickTab`（`fireEvent.mouseDown`）を使う**——Radix の `TabsTrigger` は `onMouseDown` で切り替えるので `click` では拾えない（既存のコメントがその理由を持つ）。

```tsx
function show(settings: AppSettings = DEFAULT_SETTINGS, pluginInstalled = false) {
  const onChange = vi.fn()
  const onClose = vi.fn()
  render(
    <SettingsDialog
      open
      settings={settings}
      pluginInstalled={pluginInstalled}
      onChange={onChange}
      onClose={onClose}
    />,
  )
  return { onChange, onClose }
}
```

`describe('SettingsDialog', ...)` の中に足す:

```tsx
  it('未導入なら AI タブに導入のコマンドを出す', () => {
    show()
    clickTab('AI')
    expect(screen.getByText(/claude plugin marketplace add/)).toBeTruthy()
  })

  it('導入済みなら導入のコマンドを出さない', () => {
    show(DEFAULT_SETTINGS, true)
    clickTab('AI')
    expect(screen.queryByText(/claude plugin marketplace add/)).toBeNull()
  })

  it('AI タブが配る Skill の名前を出す', () => {
    show()
    clickTab('AI')
    expect(screen.getByText('facet:write-term')).toBeTruthy()
  })
```

**3本目は名前が `<code>facet:{name}</code>` の形で1つのテキストノードに落ちることを前提にしている。** パネルの JSX がプレフィクスと名前を別の要素に分けると `getByText` が引けないので、その形で書く（Step 5 のコード参照）。

- [ ] **Step 3: テストが落ちることを確かめる**

Run: `npx vitest run src/components/SettingsDialog.dom.test.tsx`
Expected: FAIL（`pluginInstalled` が props に無く、AI タブも無い）

- [ ] **Step 4: props を広げる**

`src/components/settings/types.ts` の `SettingsPanelProps` に足す:

```ts
  /**
   * facet のプラグインを導入して有効にしているか。
   * 未導入なら、アプリの端末は同梱版を `--plugin-dir` で渡している
   */
  pluginInstalled: boolean
```

`SettingsDialogProps` にも同じものを足し、`<Panel settings={settings} onChange={onChange} pluginInstalled={pluginInstalled} />` と渡す。

- [ ] **Step 5: パネルを書く**

`src/components/settings/AiSettings.tsx`:

```tsx
import type { SettingsPanelProps } from './types'

/** Skill の名前と、何をするものかの1行 */
const SKILL_LABELS: readonly { name: string; label: string }[] = [
  { name: 'read-project', label: 'このフォルダのデータを読む' },
  { name: 'write-term', label: '用語を書く' },
  { name: 'write-error', label: 'エラーを書く' },
  { name: 'write-sequence', label: 'シーケンスを書く' },
  { name: 'write-issue-tree', label: '課題ツリーを書く' },
  { name: 'write-logic-tree', label: 'ロジックツリーを書く' },
]

const INSTALL_COMMANDS = [
  'claude plugin marketplace add Pryo-46/facet --sparse .claude-plugin plugins',
  'claude plugin install facet@facet',
]

/**
 * AI 連携の案内。**設定する項目は無い**——いまの状態と、導入の手順を見せる。
 *
 * 導入すると、facet を開かなくても同じフォルダを Claude Code で開くだけで
 * Skill が使える。未導入でも、アプリの端末では同梱版が使われる
 */
export function AiSettings({ pluginInstalled }: SettingsPanelProps) {
  return (
    <div className="flex flex-col gap-4 text-base text-ink">
      <p>
        {pluginInstalled
          ? 'facet のプラグインは導入済みです。アプリの端末も、外の Claude Code も、同じ Skill を使います。'
          : 'facet のプラグインは未導入です。アプリの端末では同梱の Skill が使えますが、外の Claude Code では使えません。'}
      </p>
      {!pluginInstalled && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm text-ink-muted">導入するには</h3>
          <p>次の2つを端末で実行してください。以後はどのフォルダでも Skill が使えます。</p>
          {INSTALL_COMMANDS.map((command) => (
            <code key={command} className="rounded bg-surface-muted px-2 py-1 text-sm">
              {command}
            </code>
          ))}
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm text-ink-muted">使える Skill</h3>
        <ul className="flex flex-col gap-1">
          {SKILL_LABELS.map(({ name, label }) => (
            <li key={name}>
              <code className="text-sm">facet:{name}</code> — {label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

**面と文字のクラスは役割トークンで書く**（`src/index.css` の `@theme inline` にあるもの。色値を直接書かない）。ここで使う `surface-muted` / `ink` / `ink-muted` はいずれも定義済みで、`GeneralSettings` が同じ `text-sm text-ink-muted` と `text-base text-ink` を使っている。

- [ ] **Step 6: 一覧の網羅を機械で縛る**

`SKILL_LABELS` は手書きなので、Skill を足したときに落ちる番人を置く。`src/components/settings/AiSettings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FACET_SKILLS } from '@/core/skills'
import { SKILL_LABELS } from './AiSettings'

describe('設定の AI タブが挙げる Skill', () => {
  it('配るすべての Skill を挙げる', () => {
    expect(SKILL_LABELS.map((s) => s.name).sort()).toEqual([...FACET_SKILLS].sort())
  })
})
```

`SKILL_LABELS` を `export` する。

- [ ] **Step 7: タブを足す**

`src/components/SettingsDialog.tsx` の `SETTINGS_TABS` に1行:

```ts
  { id: 'ai', label: 'AI', Panel: AiSettings },
```

- [ ] **Step 8: App が判定を渡す**

Task 4 で置いた effect に、判定結果そのものを持つ state を足す（Task 4 では使う側が無く、未使用の変数になるのでここで足す）:

```ts
  /**
   * 利用者が facet のプラグインを導入して有効にしているか。
   * 設定の AI タブが、導入手順を出すかどうかをこれで決める
   */
  const [pluginInstalled, setPluginInstalled] = useState(false)
```

effect の中で、判定した値をそのまま入れる:

```ts
      const enabled = await readFacetPluginEnabled()
      setPluginInstalled(enabled)
      if (enabled) return
```

`<SettingsDialog ... />` に渡す:

```tsx
        pluginInstalled={pluginInstalled}
```

**`claudeArgs.length === 0` を「導入済み」と読み替えない。** 同梱物の場所を引けなかった場合も空になり、そのとき導入済みと表示されて導入手順が隠れる。

- [ ] **Step 9: テストが通ることを確かめる**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 10: コミット**

```bash
git add -A
git commit -m "feat(m35): 設定に AI タブを置き、プラグインの導入手順と Skill の一覧を出す"
```

---

## Task 8: 文書を置き換える

**Files:**
- Modify: `docs/overview-rev.md`（4章の「Skillの配布と同期」と「読み方ガイド」、7章の例外の一覧）
- Modify: `docs/project-setup.md`（capabilities の表）
- Modify: `docs/glossary/`, `docs/error-catalog/`, `docs/sequence/`, `docs/logic-tree/`, `docs/issue-tree/` の Skill 名
- Modify: `docs/open-issues.md`
- Modify: `CLAUDE.md`
- Modify: `sample-project/.gitignore`

**Interfaces:**
- Consumes: Task 1〜7 の結果
- Produces: なし

- [ ] **Step 1: 直す場所を数える**

```bash
grep -rn "glossary-term-register\|error-catalog-register\|sequence-register\|issue-tree-register\|logic-tree-register\|README-for-AI\|skill-sync\|allow_skill_dir" docs/ CLAUDE.md sample-project/.gitignore
```

出力をそのまま作業対象の一覧にする（件数ではなくパスで持つ）。

- [ ] **Step 2: `overview-rev.md` の該当節を置き換える**

「#### Skillの配布と同期」を、置き直しではなくプラグインを述べる文に**置換する**（追記しない）。述べるのは4つ。

- Skill はプラグインとして配り、リポジトリ自身が marketplace であること
- アプリは同じものを resources に同梱し、未導入のときだけ `--plugin-dir` で渡すこと
- 導入済みかは `~/.claude/settings.json` の `enabledPlugins` で見ること
- 旧版が置いたものは検出して促すだけで、消さないこと

「### 読み方ガイド：静的な README-for-AI.md を配る」の節も、`read-project` Skill を述べる文に置換し、見出しを内容に合わせて改める。

7章の「どの例外も判断を一切置かない」の直前にある自前コマンドの一覧から `allow_skill_dir` を削る。

**日付・マイルストーン番号・「消した」の記録を書かない。** 現在形で、いま従う判断だけを書く。

- [ ] **Step 3: `project-setup.md` の capabilities の表を直す**

`mkdir()` / `remove()` の行と `resolveResource() + readDir()` の行を削り、`$HOME/.claude/settings.json` の読み取りを1行足す。表の「欠けたときの症状」の列も埋める（導入判定が常に「未導入」に倒れ、同梱版が渡り続ける）。

- [ ] **Step 4: 各ツールの文書の Skill 名を直す**

Step 1 の一覧のうち `docs/<tool>/` の行を、新名（`facet:write-term` など）へ替える。**文中で Skill を指すときはプラグイン名を付けた形で書く**——利用者の画面にはその形で出る。

- [ ] **Step 5: `open-issues.md` を上書きする**

消す項目（このマイルストーンで解消するもの）:

- `reading-guide.md` の Skill 名一覧を縛るテストが無い
- `Skill 同梱の一致保証が best-effort に落ちている`
- `README-for-AI.md はプロジェクト固有に聞こえない質問には効かない`
- `bundle.resources が evals/ も node_modules も除外できない`（**要確認**。プラグインを丸ごと同梱するので `evals/` は依然入る。**解消しないなら消さずに残し、文言を新しいパスに直す**）

足す項目（このマイルストーンで見つかるもの）は、実装中に気づいたものを書く。**無ければ足さない。**

- [ ] **Step 6: `CLAUDE.md` を直す**

「マージ後の後片付け」の1で、`sample-project/` の説明が `.claude/` を「アプリが自動で置き直す配布物」としている。アプリはもう置かないので、この文と `-x` を付ける理由の説明を直す。`git clean -fdx sample-project/` 自体は生成物（`.md`）が残るので変えない。

「採番」の節は変えない。

- [ ] **Step 7: `sample-project/.gitignore` を直す**

`/.claude/` を無視する理由（アプリが置き直す配布物）が消える。旧版の残骸が残っている可能性があるので**行は残し**、理由を「旧版が置いたもの。追跡しない」に改める。`*.md` の行にある「自動生成の README-for-AI.md を含む」も落とす。

- [ ] **Step 8: 残りを確かめる**

Run: Step 1 と同じ `grep`
Expected: 旧名が残っていないこと。`README-for-AI` は `legacy-artifacts.ts` の定数と、それを説明する文書にだけ残る

- [ ] **Step 9: 通しで確かめる**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

Run: `cd src-tauri && cargo test`
Expected: PASS

Run: `claude plugin validate plugins/facet`
Expected: `✔ Validation passed`

- [ ] **Step 10: コミット**

```bash
git add -A
git commit -m "docs(m35): Skill の配布をプラグインとして述べ直す"
```

---

## 人間に依頼する実機確認

**PR 本文に載せる。** サブエージェントは GUI を操作できないので、ここは実装の完了条件に含めない。

1. **設定の AI タブ**を開き、書いてある2コマンドをそのまま実行して導入できること
2. 導入した Claude Code で、facet を開かずにプロジェクトフォルダを開き、`facet:write-term` が発火すること
3. アプリの端末ペインで、**未導入の状態**でも Skill が使えること（アプリ起動直後にすぐ端末タブを開いた場合も）
4. **導入済みの状態**で、同じ Skill が2つ現れないこと
5. 旧版が置いた `.claude/skills/glossary-term-register` があるフォルダを開くと、削除を促すトーストが出ること
6. 利用者自身の `.claude/` があるリポジトリ（facet 自身のチェックアウトなど）を開いても、トーストが出ないこと
7. **設定の保存が動くこと**（`$APPCONFIG` の `mkdir` が scoped エントリだけで許可されるかは実行時にしか分からない）
8. mac でも 3・5・7 が同じであること
