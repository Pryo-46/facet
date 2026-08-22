# 課題ツリー登録 Skill とお手本 issue-tree-m2 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 会話から課題ツリーの JSON を組み立てる登録 Skill（`issue-tree-register`）を4本目の同梱 Skill として足し、`sample-project/` を5ツールぶんのお手本にする。

**Architecture:** 既存3本（`glossary-term-register` / `error-catalog-register` / `sequence-register`）の雛形に倣う。**アプリのソースと同じ判断を Skill が二度書かないこと**が要件で、導出（`derive.ts`）と正規形（`canonical.ts`）は**バイト一致コピー**で持ち込み、コピーできない整合性検証は**逐語で複製したうえで実行 smoke テストが一致を強制する**（sequence M4 が確立した形）。

**Tech Stack:** Node 22.18+ / 23.6+ / 24+（フラグ無しの型ストリップが要る）/ Ajv 2020 / Vitest

**Spec:**
- 設計の正: [`docs/issue-tree/仮説検証モジュール-設計ノート.md`](../../issue-tree/仮説検証モジュール-設計ノート.md)（スコープ IN の「登録用 Skill」「sample-project への追加」「README-for-AI.md への追記」）
- データ形式の正: [`schemas/issue-tree.schema.json`](../../../schemas/issue-tree.schema.json)
- 素材: [`docs/issue-tree/仮説検証モック.jsx`](../../issue-tree/仮説検証モック.jsx) の `TREE`（お手本の題材にそのまま使える）

## 前後のマイルストーン

| | | 状態 |
| --- | --- | --- |
| **M20** キャンバス基盤のコア化 | [`2026-08-22-m20-canvas-core.md`](2026-08-22-m20-canvas-core.md) | 完了済み |
| **issue-tree-m1** エディタ | [`2026-08-22-issue-tree-m1-editor.md`](2026-08-22-issue-tree-m1-editor.md) | **先に完了していること** |
| **issue-tree-m2** 登録 Skill とお手本 | 本計画 | |

**issue-tree-m1 が未マージのまま着手しないこと。** Skill は `src/modules/issue-tree/derive.ts` をコピーし、`checkIssueTreeConsistency` の文言に一致させ、お手本はアプリで開けることを前提にしている。

## この計画が置いた前提

**コピーは `cp` で作る。手で書き写さない。** 手複製は追従漏れがテストで検知されず、[`docs/open-issues.md`](../../open-issues.md) にエラーカタログ Skill の実例が記録されている。**バイト一致コピー＋一致を強制するテスト**なら、ズレた瞬間に赤くなる。

**既存実装と一致すべきものは実物が正。** 整合性検証の文言は `src/modules/issue-tree/consistency.ts`、ディレクトリ規約とスクリプトの構造は `.claude/skills/sequence-register/` が正であり、**本計画のパラフレーズではない**（sequence M4 はここで fix round を3件払っている）。

**計画の指示が矛盾していたら、辻褄を合わせずに「計画の矛盾」として報告する。** 報告には**実行した検証コマンドとその出力を貼る**こと。

---

## Global Constraints（全タスクの要件に暗黙に含まれる）

### Skill の作りの規約

- **同梱 Skill は `.claude/skills/<名前>/` に置き、`src/core/skill-sync.ts` の `BUNDLED_SKILLS` に1行足すだけで配られる**（`src-tauri/tauri.conf.json` の `bundle.resources` はディレクトリごと同梱しているので追従不要）
- **スキーマのコピーは `<Skill>/schemas/<名前>.schema.json`** でなければならない——書き出しスクリプトの `findSchema` は SKILL_DIR を起点に上へ辿り、各階層で `<dir>/<名前>.schema.json` と `<dir>/schemas/<名前>.schema.json` を見る。動かすと探索から外れる
- **`package.json` を置く。** 置いた先にマニフェストが無いと、SKILL.md が指示する `npm install` が何もインストールせず `ajv が見つかりません` から抜けられない（sequence M4 の実機確認が掘り当てた欠陥）
- **`.gitignore`（`node_modules/` と `package-lock.json`）を置く。** SKILL.md が指示する `npm install` は置いた先に数千ファイルを作るので、これが無いと利用者の `git status` が汚れる
- **`evals/` は同期対象外**（`shouldSyncSkillFile` が落とす）。本マイルストーンでは evals を作らない（下の「やらないこと」）
- バイト一致コピーに使えるのは**値 import を持たず `enum` も持たない `.ts`** だけ。`consistency.ts` は値 import を持つのでコピーできない

### データの規約（Skill が守らせる側）

- ID は `issue_` / `hypothesis_` ＋英数字62文字アルファベット10文字。**連番禁止。** 採番は `scripts/new-id.mjs` のみ
- **全キー常在。** 欠落キーで未決を表さない
- **`events` は追記専用。** 既存の要素を書き換えない・並べ替えない・削除しない
- **ステータスのフィールドを作らない**（現在ステータスは最新イベントからの導出。`additionalProperties: false` が塞いでいる）
- **`pendingNotes` を勝手に判断イベントへ昇格させない**（D9）

### やらないこと（このマイルストーンの範囲外）

- **evals（`evals.json` / `grade.mjs` / fixtures）** —— 設計ノートの IN 節は「ID採番・スキーマ検証・正規形書き出し」を挙げており、評価ハーネスは挙げていない。**Task 3 で `docs/open-issues.md` に1項目として足す**（足し忘れると静かに消える）
- **配列順の正規化をスクリプトに持たせること** —— アプリ側の `normalizeOrder` は値 import を持つのでコピーできない。順序はアプリが開いたときに整うので、**その事実を SKILL.md に書いて伝える**
- **Markdown 出力**（設計ノートの OUT）

### 検証コマンド（全タスク共通）

```bash
npm test && npx tsc -b && npm run lint
```

---

## File Structure

### 新規（Skill）

| ファイル | 中身 |
| --- | --- |
| `.claude/skills/issue-tree-register/SKILL.md` | 手順書 |
| `.claude/skills/issue-tree-register/package.json` | `ajv` の宣言 |
| `.claude/skills/issue-tree-register/.gitignore` | `node_modules/` と `package-lock.json` |
| `.claude/skills/issue-tree-register/schemas/issue-tree.schema.json` | **バイト一致コピー** |
| `.claude/skills/issue-tree-register/scripts/canonical.ts` | **バイト一致コピー**（`src/core/canonical.ts`） |
| `.claude/skills/issue-tree-register/scripts/derive.ts` | **バイト一致コピー**（`src/modules/issue-tree/derive.ts`） |
| `.claude/skills/issue-tree-register/scripts/new-id.mjs` | ID 採番（既定 prefix は `issue`） |
| `.claude/skills/issue-tree-register/scripts/issue-tree-write.mjs` | 検証＋正規形での書き出し |

### 新規（テストとお手本）

- `src/modules/issue-tree/skill-copy.test.ts` — バイト一致と、コピーできる条件（値 import・`enum` を持たない）
- `src/modules/issue-tree/skill-write.smoke.test.ts` — スクリプトを実際に spawn し、アプリの整合性 `message` が逐語で stdout に出ることを検査
- `sample-project/課題ツリー.json` — **追跡対象**（お手本）

### 変更

`src/core/skill-sync.ts`（`BUNDLED_SKILLS`）／`src/core/skill-schema-copy.test.ts`（`SCHEMA_COPIES`）／`src/core/reading-guide.md`（Skill 名の一覧）／`README.md`（お手本の表・同梱 Skill の本数）／`docs/`（完了時の反映）

---
## Task 1: 登録 Skill（`issue-tree-register`）

**Files:**
- Create: `.claude/skills/issue-tree-register/SKILL.md`, `package.json`, `.gitignore`, `schemas/issue-tree.schema.json`, `scripts/new-id.mjs`, `scripts/canonical.ts`, `scripts/derive.ts`, `scripts/issue-tree-write.mjs`
- Create (test): `src/modules/issue-tree/skill-copy.test.ts`, `src/modules/issue-tree/skill-write.smoke.test.ts`
- Modify: `src/core/skill-sync.ts`（`BUNDLED_SKILLS`）, `src/core/skill-schema-copy.test.ts`（`SCHEMA_COPIES`）

**Interfaces:**
- Consumes: `derive.ts` と `consistency.ts`（どちらも issue-tree-m1 で確定済み。**あちらが正**）、`src/core/canonical.ts`
- Produces: プロジェクトフォルダへ配られる4本目の登録 Skill

**コピーは `cp` で作る。手で書き写さない。** 手複製は追従漏れがテストで検知されず、[`docs/open-issues.md`](../../open-issues.md) にエラーカタログ Skill の実例が記録されている。

**evals（`evals/evals.json` / `evals/grade.mjs` / fixtures）は本マイルストーンの範囲外とする**——設計ノートの IN 節は「ID採番・スキーマ検証・正規形書き出し」を挙げており、評価ハーネスは挙げていない。**Task 3 で `docs/open-issues.md` に1項目として足すこと**（足し忘れると静かに消える）。

- [ ] **Step 1: ディレクトリを作り、バイト一致コピーを置く**

```bash
mkdir -p .claude/skills/issue-tree-register/scripts .claude/skills/issue-tree-register/schemas
cp schemas/issue-tree.schema.json .claude/skills/issue-tree-register/schemas/issue-tree.schema.json
cp src/core/canonical.ts .claude/skills/issue-tree-register/scripts/canonical.ts
cp src/modules/issue-tree/derive.ts .claude/skills/issue-tree-register/scripts/derive.ts
```

**置き場所は `<Skill>/schemas/<名前>.schema.json` でなければならない**——書き出しスクリプトの `findSchema` は SKILL_DIR を起点に上へ辿りながら各階層で `<dir>/<名前>.schema.json` と `<dir>/schemas/<名前>.schema.json` を見るので、この位置なら第1階層で当たる（`src/core/skill-schema-copy.test.ts` の JSDoc）。

- [ ] **Step 2: `package.json` と `.gitignore` を置く**

`.claude/skills/sequence-register/package.json` を写して `name` と `description` だけ変える:

```json
{
  "name": "issue-tree-register-skill",
  "private": true,
  "type": "module",
  "description": "課題ツリー登録Skillの同梱スクリプト（ID採番・検証・正規形書き出し）",
  "dependencies": {
    "ajv": "^8.17.1"
  }
}
```

`.gitignore` は `.claude/skills/sequence-register/.gitignore` と同一（`node_modules/` と `package-lock.json`）。**`package.json` を置くこと**——置いた先にマニフェストが無いと、SKILL.md が指示する `npm install` が何もインストールせず `ajv が見つかりません` から抜けられない（sequence M4 の実機確認が掘り当てた欠陥）。

- [ ] **Step 3: `scripts/new-id.mjs` を書く**

`.claude/skills/sequence-register/scripts/new-id.mjs` を写し、prefix だけ差し替える（**既定は `issue`**——課題のほうが件数が多い）:

```js
//   node scripts/new-id.mjs 12                    → issue_XXXXXXXXXX を12件
//   node scripts/new-id.mjs 3 --prefix hypothesis → hypothesis_XXXXXXXXXX を3件
let prefix = "issue";
...
if (prefix !== "issue" && prefix !== "hypothesis") {
  console.error(
    `--prefix は issue か hypothesis のどちらかです: 受け取った値 = ${JSON.stringify(prefix)}`
  );
  process.exit(2);
}
```

- [ ] **Step 4: `scripts/issue-tree-write.mjs` を書く**

`.claude/skills/sequence-register/scripts/sequence-write.mjs` を土台に、次を差し替える。**構造（引数の解析・スキーマ探索・ajv 検証・正規化・警告・書き出し・終了コード）は写して変えない。**

1. `import("./questions.ts")` → `import("./derive.ts")`
2. スキーマ名 `sequence.schema.json` → `issue-tree.schema.json`、環境変数 `FACET_SEQUENCE_SCHEMA` → `FACET_ISSUE_TREE_SCHEMA`
3. **`normalizeSlots` は要らない**（課題ツリーに `oneOf` のスロットが無く、キー順はすべてスキーマの `properties` から導出できる）。**代わりに配列順の正規化も行わない**——アプリ側の `normalizeOrder` は値 import を持つのでコピーできず、順序の正規化はアプリに任せる。**この判断を SKILL.md に書き、「順序はアプリが開いたときに整う」と伝えること**
4. 整合性検証は `src/modules/issue-tree/consistency.ts` の**5ルールを逐語で**再実装する（文言は `src/modules/issue-tree/consistency.ts` が正。下の smoke テストが一致を強制する）
5. 未決の集計は `derive.js` の `poseQuestions` / `tallyQuestions` / `tallyLine` を呼ぶ（**数え直さない**）

出力の最後は次の形にする:

```js
console.log(`  スキーマ: ${schemaPath}`);
console.log(`  課題: ${issues.length}件 ／ 仮説: ${hypotheses.length}件`);
console.log(`  ${D.tallyLine(tally)}`);
if (openAt.length) console.log(`  未決の内訳: ${openAt.join("、")}`);
```

- [ ] **Step 5: `SKILL.md` を書く**

`.claude/skills/sequence-register/SKILL.md` の構成（対象を決める → データを組む → ID採番 → 書き込み → 報告 → フェーズB → 既存ファイルへの書き足し → やらないこと）を土台にする。**課題ツリー固有として必ず書くこと:**

- frontmatter の `description` は、**「仮説検証」「PoCで確かめること」「課題を分解」「検証結果を記録」「見送り」といった言い方でも起動する**ように書く（明示的に「課題ツリー」と言われなくても使う）
- **課題と仮説の書き分け**（未解決論点5の回答）: 課題＝観測された事実・望む状態とのギャップ／仮説＝支持・棄却を判定できる主張。**ただし入力時に厳密な区別を強制しない**——検証イベントを付ける段階で「支持・棄却を判定できる文か」が自然に問われる
- **`pendingNotes` は判断待ちの下書きであり、AI が勝手に判断イベントへ昇格させない**（D9）。会話に出た SH 発言はメモへ、判断は人間が下したものだけをイベントへ
- **`events` は追記専用。** 既存の要素を書き換えない・並べ替えない・削除しない
- **ステータスのフィールドを作らない。** 現在ステータスは最新イベントから導出される（`kind` を `status` のように書き足そうとすると `additionalProperties: false` で弾かれる）
- **見送りは最上位の課題に一度だけ付ける。** 配下へコピーしない（抑制は導出）
- **`rationale` が空でも warning にならない**ので、会話に由来が無ければ空のままにする
- **問いの類型を増やさない**（3つはスキーマ固定。増やすと網羅の担保が消える）
- 初回のみ `npm install`、Node は 22.18+ / 23.6+ / 24+

**「アプリでそのプロジェクトを開いたまま作業しない」の一文を落とさないこと**（自動保存と衝突して片方の変更が消える）。

- [ ] **Step 6: バイト一致と同期のテストを書く**

`src/modules/issue-tree/skill-copy.test.ts`（`src/modules/sequence/skill-copy.test.ts` を写し、`COPIES` を差し替える。**`extractImportStatements` / `isValueImportStatement` はあちらに既にあるので、そこから import して重複させない**——できない構造なら、あちらを `src/core/` へ切り出すのではなく、このテストは「バイト一致」だけを見て「値 import を持たない」は sequence 側のテストに任せる形にする。`src/core/skill-canonical-copy.test.ts` が既に同じ切り分けをしている）:

```ts
const COPIES = [
  { app: 'src/modules/issue-tree/derive.ts', skill: '.claude/skills/issue-tree-register/scripts/derive.ts' },
  { app: 'src/core/canonical.ts', skill: '.claude/skills/issue-tree-register/scripts/canonical.ts' },
]
```

**`derive.ts` については「値 import を持たない」「enum / パラメータプロパティを持たない」も必ず見る**（`canonical.ts` は既存テストが見ている）。

`src/core/skill-schema-copy.test.ts` の `SCHEMA_COPIES` に1件足す:

```ts
  {
    skill: 'issue-tree-register',
    schema: 'issue-tree.schema.json',
    script: 'scripts/issue-tree-write.mjs',
  },
```

`src/core/skill-sync.ts` の `BUNDLED_SKILLS` に `'issue-tree-register'` を足す。**`tauri.conf.json` の `bundle.resources` は `.claude/skills` をディレクトリごと同梱しているので、そちらの追従は要らない**（`skill-sync.ts` の JSDoc）。

- [ ] **Step 7: 実行 smoke テストを書く**

`src/modules/sequence/skill-write.smoke.test.ts` を写す。契約は「**アプリの `message` がスクリプトの stdout に逐語で現れる**」。fixture は consistency.ts の5ルールを一度に炙り出す形（スキーマ検証は通ること）にする:

```ts
import { checkIssueTreeConsistency } from './consistency'
// ...
it('アプリの整合性 message がすべて stdout に逐語で現れる', () => {
  const issues = checkIssueTreeConsistency(FIXTURE as never)
  expect(issues.length).toBeGreaterThan(0)   // fixture が何も出さないなら検査が成立していない
  for (const issue of issues) expect(out.stdout).toContain(issue.message)
})
```

**このテストは同時に、`derive.ts` / `canonical.ts` の型ストリップ import 経路を実際に読む唯一の実行テストでもある。**

- [ ] **Step 8: Skill を実際に動かす**

```bash
cd .claude/skills/issue-tree-register && npm install
cd - && node .claude/skills/issue-tree-register/scripts/new-id.mjs 2 --prefix hypothesis
```
Expected: `hypothesis_` で始まる10文字の ID が2行

- [ ] **Step 9: 全体の検証と Commit**

```bash
npm test && npx tsc -b && npm run lint
git add -A
git commit -m "feat(issue-tree): 課題ツリー登録 Skill を同梱する"
```

**`.claude/skills/issue-tree-register/node_modules/` と `package-lock.json` はコミットに含めないこと**（`.gitignore` が効いていることを `git status --short` で確認する）。

---
## Task 2: お手本（`sample-project/`）と `README.md`

**Files:**
- Create: `sample-project/課題ツリー.json`（**追跡対象**）
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 の Skill（お手本の生成に使う）
- Produces: 4ツール → 5ツールに増えたお手本一式

**題材は既存のお手本と同じ「中途採用の応募管理」の枠内にする。** 設計ノートのモックが使った「適性検査サービス連携PoC」はその中の1テーマなので、モックの内容をそのまま素材にできる（`docs/issue-tree/仮説検証モック.jsx` の `TREE` を読むこと）。

- [ ] **Step 1: 下書きを作る**

**下書きは対象プロジェクトフォルダの外に置く**（中に置くとアプリのファイル一覧に下書きが本物として並ぶ）。ID は必ず `node .claude/skills/issue-tree-register/scripts/new-id.mjs` で採番する。

構成（モックの場面5まで進めた状態＋**わざと残す未決**）:

| 課題 | 仮説 | 仕込み |
| --- | --- | --- |
| 適性検査サービス連携（PoCテーマ・根） | — | 中間ノード |
| └ 適性検査APIの応答特性が要件を満たすか不明 | — | 中間ノード |
| 　└ 結果取得を画面遷移の中で待てるか | 同期取得で間に合う／webhook受信に切り替える | `rejectedWithoutTest` ／ `supported`。**決着した葉** |
| 　└ レート制限下で一括受検案内を捌けるか | 送信を夜間バッチに寄せる | `rejected`（棄却の学びが根拠に入る） |
| 　└ 送信キューの平準化方式 | **なし** | **「仮説は？」が立つ** |
| └ 受検結果の取り込みタイミングを決められない | 結果確定イベント起点だけでよい | `supportedWithoutTest` |
| └ 再受検の扱い | — | **課題ノードに `deferred`。配下2件の問いが抑制される** |
| 　└ 受検IDの再発行が要るか ／ スコアはどちらを正とするか | なし | 抑制されているので問いは立たない |
| └ 結果表示画面に何を出すか | スコアはサマリのみで足りる | `deferredToMainDev` |
| └ 受検案内の再送導線 | 応募者から再送依頼が来る前提でよい | **`events: []`（「検証結果は？」）＋ `pendingNotes` 1件（「判断は？」）** |

**未決が3種類とも1件以上出る形にすること**——お手本の役目は「未決が warning として残る」を見せることであり、1種類だけでは3つの問いの違いが伝わらない。`rationale` は一部だけ埋める（**空でも warning が立たない**ことを見せるため）。

- [ ] **Step 2: Skill で書き出す**

```bash
node .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs --in <下書き.json> --out sample-project/課題ツリー.json
```
Expected: `✓ 正規形で書き出しました` と、未決の集計（`⚠ 未決 …`）が出る。**整合性の警告が出ていないこと**（お手本が壊れていては意味がない）。

- [ ] **Step 3: 配列順を正規形に整える**

Skill は配列順を並べ替えない（Task 1 Step 4）。**アプリで一度開いて自動保存させるか、下書きの時点で DFS 行きがけ順・仮説を課題順に並べておくこと。** どちらを採ったかを報告に書く。

Run: `node .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs --check sample-project/課題ツリー.json`
Expected: `✓ 正規形と一致しています`

- [ ] **Step 4: `README.md` を直す**

**ツール表と課題ツリーの節は issue-tree-m1 で入れてある。** ここで足すのは残り2箇所:

1. 「お手本」の表に1行足す:

```markdown
| `課題ツリー.json` | 仮説が無い葉が1つ／検証結果が空の仮説が1つ／レビューのメモが判断に紐づかないまま残っている仮説が1つ。対比として、枝ごと「今回見送り」にした課題の配下は問いが立たない |
```

2. 「同梱の Skill」の本数（3本→4本）と Skill 名の一覧に `issue-tree-register` を足す。

- [ ] **Step 5: お手本が実際に開けることを確かめる**

```bash
node .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs --check sample-project/課題ツリー.json
```
Expected: スキーマ検証 OK・正規形一致・整合性の警告なし・未決の内訳が3種類とも出る

- [ ] **Step 6: Commit**

```bash
npm test && npx tsc -b && npm run lint
git add -A
git commit -m "docs(sample): 課題ツリーのお手本を足し README を5ツールに更新する"
```

---

## Task 3: 読み方ガイドの Skill 名とドキュメントへの反映

**Files:**
- Create: `docs/history/issue-tree-m2-register-skill.md`
- Modify: `src/core/reading-guide.md`, `docs/open-issues.md`, `docs/overview-rev.md`, `docs/README.md`

**Interfaces:**
- Consumes: Task 1・2 の結果
- Produces: 次の計画者が「正」として読む文書の更新

**`overview-rev.md` への反映はこのコミットで済ませ、申し送りに TODO として残さない**（M4 の教訓）。

- [ ] **Step 1: `src/core/reading-guide.md` の Skill 名一覧に足す**

「書き込みたくなったら」の節の `glossary-term-register / error-catalog-register / sequence-register` の並びに `issue-tree-register` を足す。**issue-tree-m1 では意図的に触っていない**（存在しない Skill を先に名指しすると、AI が探して見つからずに混乱するため）。

Run: `npm test`
Expected: `src/core/reading-guide.test.ts` が緑

- [ ] **Step 2: `docs/history/issue-tree-m2-register-skill.md` を書く（追記専用・以後変えない）**

少なくとも次を含める:

- **`derive.ts` をバイト一致コピーで持ち込んだ**こと。issue-tree-m1 の時点で「値 import を持たない」制約を守って書いてあったので、ここでは `cp` するだけで済んだ（守っていなければ書き直しになっていた）
- **整合性検証は逐語で複製した**こと（`consistency.ts` は値 import を持つのでコピーできない）と、それを smoke テストで縛ったこと
- **配列順の正規化をスクリプトに持たせなかった**判断と、その代わり SKILL.md に「順序はアプリが開いたときに整う」と書いたこと
- **お手本に仕込んだ未決の内訳**（3種類の問いがすべて1件以上出る形にした理由）
- **evals を作らなかった**こと
- Task 4（実機確認）の結果。**未実施ならその旨を明記し、確認項目のチェックリストを空のまま残す**

- [ ] **Step 3: `docs/open-issues.md` を編集する**

**消すもの:**

- issue-tree-m1 が足した「**登録 Skill がまだ無い**」の項（`[issue-tree-m1]` タグ）——本マイルストーンで解消した

**書き換えるもの（新規に足さない）:**

- **「登録3 Skill は整合性検証の警告文言・計上規則を、アプリと独立に複製している」の項**（`[Skill]` タグ）——**4本になった。** `issue-tree-register` を列挙に足し、同じく smoke テストで縛られていることを書く
- **「`palette-fit.mjs` が Node の型ストリップに依存している」の項**（`[Skill]` タグ）——同じ依存が `issue-tree-register`（`derive.ts` / `canonical.ts` を同ディレクトリから import）にもあることを列挙に足す

**足すもの（`[issue-tree-m2]` タグを付ける）:**

- **`issue-tree-register` に evals が無い**（`.claude/skills/issue-tree-register/`）: 既存3本は評価ハーネス（`evals/evals.json` / `grade.mjs` / fixtures）を持つが、これだけ持たない。**description の起動精度を測る手段が無い**ので、他 Skill と誤起動し合っていても気づけない
- **書き出しスクリプトが配列順を整えない**（`.claude/skills/issue-tree-register/scripts/issue-tree-write.mjs`）: アプリ側の `normalizeOrder` は値 import を持つのでコピーできず、DFS 行きがけ順・仮説の課題順への整列はアプリが開いたときにしか起きない。**Skill が書いた直後のファイルは正規形の配列順になっていない**（キー順・インデント・改行は正規形）
- Task 4 が未実施なら、**実機確認が未実施であること**を「次に手を付ける候補」へ1項目として足す

**冒頭の「最終更新」の段落を更新すること。**

- [ ] **Step 4: `docs/overview-rev.md` へ反映する**

| 章 | 反映内容 |
| --- | --- |
| 4章 Skill群 | **同梱 Skill が4本になった**ことを反映する。あわせて、**バイト一致コピー＋一致テストという方式が「導出ロジックを Skill と共有する」標準になった**ことを書く（sequence の `questions.ts` に続く2例目が `derive.ts`。1例では方式、2例で規約になる） |
| 5章 スキーマ | **同梱 Skill がスキーマのバイト一致コピーを持つ**という既存の記述に、4本目を反映する（本数を書いている箇所があれば直す） |

**`rev N章` は 249 箇所から参照されている通称。ファイル名と章番号を動かさないこと。**

- [ ] **Step 5: `docs/README.md` の「マイルストーンの履歴」に1行足す**

```markdown
| [issue-tree-m2](history/issue-tree-m2-register-skill.md) | 課題ツリー登録 Skill（会話→ JSON）とお手本 | 課題ツリー・コア |
```

- [ ] **Step 6: 反映漏れが無いか機械的に確かめる**

```bash
grep -rn "3本|3 本" README.md docs/overview-rev.md src/core/reading-guide.md -E
```
Expected: 出た行を1つずつ見て、同梱 Skill の本数を指しているものが残っていないこと（**別の意味の「3本」もあるので機械的に置換しない**）

```bash
grep -rn "issue-tree-register" README.md docs/overview-rev.md src/core/reading-guide.md src/core/skill-sync.ts
```
Expected: 4ファイルすべてに1件以上

- [ ] **Step 7: Commit**

```bash
npm test && npx tsc -b && npm run lint
git add -A
git commit -m "docs(issue-tree): 申し送り・残件・rev を issue-tree-m2 に合わせる"
```

---

## Task 4: 実機確認（**人間の作業**）

**Files:** なし（確認のみ。見つかった欠陥は別タスクとして起こす）

**サブエージェントは GUI を操作できない。このタスクは人間が行う。** Task 3 の申し送りは、この結果が出るまで「未実施」と明記したままにする。

**このマイルストーンの実機確認は、`npm test` では原理的に届かない場所を踏むためにある。** 成果物（SKILL.md）が利用者に「初回のみ `npm install`」を指示している以上、**その手順を実行した後の状態もこの成果物の状態である**——sequence M4 はこの一手で2つの欠陥を連続で掘り当てた（`node_modules` を同期対象から外していなかった／そもそも `package.json` を同期していなかった）。

```bash
npm install        # 省略しない
npm run tauri dev
```

- [ ] **1. Skill が置かれる**——プロジェクトフォルダを開き直し、`.claude/skills/issue-tree-register/` が現れる。`evals/` と `node_modules/` が**置かれていない**こと、`package.json` と `.gitignore` と `schemas/issue-tree.schema.json` が**置かれている**こと
- [ ] **2. 利用者の手順を踏む**——置かれた先の Skill ディレクトリで `npm install` を実行する
- [ ] **3. その後の状態でもう一度アプリにフォルダを走査させる**（フォルダを開き直す）——**失敗トーストが出ないこと**、`node_modules` が消されていないこと、`package-lock.json` が残っていること
- [ ] **4. `git status` が汚れていない**（Skill の `.gitignore` が効いている）
- [ ] **5. Skill を実際に使う**——Claude Code で「PoC の課題を整理して」のように**「課題ツリー」と言わずに**頼み、Skill が起動すること。会話から JSON が組まれ、`✓ 正規形で書き出しました` が出ること
- [ ] **6. 書かれたファイルがアプリで開ける**——赤表示（整合性エラー）が出ないこと。**未決の集計がスクリプトの出力と一致すること**
- [ ] **7. アプリで一度編集して自動保存させる**と、配列順が DFS 行きがけ順に整うこと（Skill は整えない、という設計どおりか）
- [ ] **8. お手本を開く**——`sample-project/課題ツリー.json` をアプリで開き、3種類の問いがすべて画面に出ること、見送った枝の配下が抑制されていること
- [ ] **9. 開発機と違う OS**（Windows で開発したなら mac、逆も同じ）で 1〜4 を通す——**`fs` scope の glob 判定は OS で既定が反転する**（`require_literal_leading_dot` が unix で `true` / Windows で `false`）。この形は片方の OS でしか確認していないと原理的に見つからない

**見つかったことは、症状（何が起きるか）と人間の言葉（何が嫌か）を分けて記録する。**
