# decision-table-m4 登録 Skill と evals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 会話から `decisionTable` の JSON を作成・追記・更新する登録 Skill `write-decision-table` と、その evals を作り、AI が書いた JSON をアプリが開けることをテストで確かめる。

**Architecture:** 手本は `write-logic-tree`。行の整列と再構築・欠落の集計・集計行は、値 import を持たない原本（`rows.ts`／`missing.ts`／`missing-tally.ts`）を `gen-skills.mjs` で生成して同梱する。整合性検証は `consistency.ts` が値 import を持つので、文言を書き出しスクリプトに手複製し、実行 smoke テストで縛る（rev 5章の標準）。

**Tech Stack:** Node（ESM の `.mjs`）、TypeScript、vitest、ajv standalone、`typescript.transpileModule`

**Spec:** `docs/superpowers/specs/2026-09-10-decision-table-design.md` の「10. 登録 Skill」「12. テスト」

**基底:** `origin/decision-table` の `d7510f9`。ブランチ `worktree-decision-table-m4`。PR の向き先は `decision-table`。

## Global Constraints

- 文書の書き方（`CLAUDE.md`）: 現在形で書く。経緯・マイルストーン番号・日付を書かない。1項目は2文まで。太字は1段落に1箇所まで。全角括弧の入れ子を作らない
- コードのコメント: いまの理由と罠を現在形で書く。テスト名は守っている性質を名前にする
- 書き出しスクリプトの利用者向け文言のうち、アプリと一致すべきもの（整合性の message・集計行）はアプリが正。逐語で写し、smoke テストで一致を強制する
- 人間の作業（evals の実走・実機確認・CI の裁定・版の公開）は文書に書かず、PR 本文で依頼する
- `docs/open-issues.md` は上書きで更新し、変更の記録を残さない
- テストの件数を書かない

## 着手前に決めたこと

### 1. アプリのコードとの共有

| 原本 | 扱い | 根拠 |
| --- | --- | --- |
| `src/core/canonical.ts` | 生成して同梱 | 既存の標準 |
| `src/modules/decision-table/rows.ts` | 生成して同梱。Skill 用の純関数2つをここに足す | 型 import だけを持つ |
| `src/modules/decision-table/missing.ts` | 生成して同梱 | 型 import だけを持つ |
| `src/core/missing-tally.ts` | 生成して同梱 | import を1つも持たない。課題ツリーの `derive.ts` のように自前の `tallyLine` を持つ必要が無い |
| `src/modules/decision-table/consistency.ts` | 文言だけ手複製し、smoke テストで逐語一致を縛る | `@/core` の値 import を4つ持つ |

集計行は `missing.mjs` の `tallyMissing` と `missing-tally.mjs` の `tallyLine` をそのまま呼ぶ。数え直しも文言の手書きもしない。

整合性の7ルール（`duplicate-id`／`duplicate-name`／`duplicate-value`／`duplicate-choice`／`row-length`／`unknown-value`／`row-set`）はすべてスクリプトに持ち込む。`normalizeForMatch`・`rowRef`・`findDuplicates` は1〜数行なので、スクリプト内に書く。

### 2. 行の整列と再構築をスクリプトがどう行うか

アプリは読み込み時に行を整えず、`row-set` を赤で出すだけである。したがってスクリプトが書き出す行は、常に直積の並びに揃っていなければならない。書き出しの経路は2つに分ける。

**経路A `--in <下書き> --out <ファイル>`（結果を書く）。** 下書きの `rows` をラベルの組み合わせで直積の位置へ引き当てる（`alignRowsByLabel`）。下書きに無い組み合わせは、結果が空で `impossible: false` の行で補う。AI は決まった組み合わせだけを書けばよい。

- 直積に当てはまらない行（未知の値・`values` や `results` の長さ違い）があれば書き出さず exit 1。黙って落とすと、人が決めた結果が消える
- 同じ組み合わせの行が2件以上あり、`impossible` か `results` が食い違えば exit 1。一致していれば1行にまとめる
- 1つの条件に同じ値ラベルが2件あると、ラベルでは行を指せない。この場合は並べ替えず、`duplicate-value` と `row-set` の警告に任せる

**経路B `--in <下書き> --base <既存ファイル> --out <ファイル>`（定義を変える）。** 条件・値・結果・選択肢の増減と改名を、既存の行から再構築する（`rebaseRows`）。アプリの定義部の編集と同じく、座標で結果を引き継ぐ。

- 下書きの `rows` は既存ファイルの `rows` と一致していなければならない。違えば exit 2（定義の変更と結果の記入を1回に混ぜさせない）
- 条件と結果の対応づけは `id` で行う
- 値と選択肢の対応づけは、本数が変わらなければ位置（改名とみなす）、変われば完全一致のラベルで行う。改名と増減を同時にすると、改名した側は引き継げない
- 選択肢の改名は、その選択肢を選んでいた結果セルも書き換える。消えた選択肢を選んでいた結果セルは空に戻す
- 記入済みの結果が1件でも失われるなら、`--allow-loss` が無い限り書き出さず exit 1。アプリが要素を減らす前に確認を挟むのと同じ位置に止まる

**どちらの経路も、直積が `MAX_ROWS`（1024）を超えるなら書き出さず exit 1。** アプリの表本体はこの規模に歯止めを持たず、開いた瞬間に全行を描く。

終了コードは 0＝成功（警告はあり得る）／1＝スキーマ検証失敗・JSON 破損・書き出せない下書き／2＝使い方の誤り。

### 3. evals と CI

`evals/evals.json` のケースは Claude を実際に走らせて初めて結果が出る（skill-creator のハーネスは `claude -p` を起動する）。費用がかかり結果が揺れるので、`npm test` にも CI にも載せない。

`package.json` の `test` から呼ぶのは**判定器 `grade.mjs` のテスト**とする。正しい出力と壊れた出力を合成した iteration ディレクトリに `grade.mjs` を掛け、前者が全件合格し後者が狙った項目で落ちることを見る。判定器が壊れていると evals を実走しても何も測れないので、ここは機械で守る。

このリポジトリに CI のワークフローは無い。**m4 で CI を立てない。** 立てるか、立てるなら evals の実走をどの契機で回すかは人間の裁定として PR 本文で仰ぐ。

着手前の調査で、既存4本の `grade.mjs`（`write-term`／`write-error`／`write-sequence`／`write-logic-tree`）が書き出しスクリプトの受け付けない `--schema` を渡しており、`inspect` が常に「スキーマ検証失敗」を返すことを実測した（exit 2・`不明な引数: --schema`）。判定器のテストが1本も無かったので気づけなかった。Task 7 で4本から `--schema` を外し、判定器のテストが無い事実を `open-issues.md` に残す。

### 4. 他の Skill の description は変えない

`write-logic-tree` の description は「場合分け・分岐の網羅」を拾うので、デシジョンテーブルの依頼と重なりうる。先に絞ると、`write-decision-table` を足したことによる誤起動の増減が測れない。**evals の2ケースで境界を測り、誤起動が実測されたときだけ別途直す**（`write-logic-tree` を足したときと同じ扱い）。

### 5. お手本と README

`sample-project/` にデシジョンテーブルのお手本を1本足し、README のお手本の表と Skill の一覧に行を足す。お手本は Task 8 で完成したスクリプトを通して書き出し、`gen-skills.test.mjs` の `SAMPLES` に足す（生成した `validate.mjs` と `canonical.mjs` を、デシジョンテーブルのスキーマで検査するため）。

### 6. プラグインの版

Skill を1本足すので、`plugins/facet/.claude-plugin/plugin.json` と `.claude-plugin/marketplace.json` の `version` を `0.1.0` から `0.2.0` へ上げ、`description` にデシジョンテーブルを足す。公開は `main` へ入れるときであり、人間の作業として PR 本文に書く。

## 固定の一覧（改修箇所）

`write-logic-tree` を grep して拾い直したもの。

| ファイル | 足すもの |
| --- | --- |
| `src/core/skills.ts` | `WRITE_SKILLS` に `'write-decision-table'` |
| `scripts/gen-skills.mjs` | `SKILL_SOURCES` に1項目 |
| `scripts/gen-skills.test.mjs` | `SAMPLES` に1行、生成物3本の出力一致の describe |
| `src/core/skill-schema-copy.test.ts` | `SCHEMA_COPIES` に1項目 |
| `src/components/settings/ai-skills.ts` | `SKILL_LABELS` に1項目 |
| `plugins/facet/skills/read-project/SKILL.md` | 「書き込みたくなったら」の一覧 |
| `README.md` | Skill の一覧、お手本の表、「5ツール」 |
| `docs/README.md` | 「登録 Skill 5本」 |
| `docs/overview-rev.md` | 2章 7番の括弧、5章「共有している原本」の列挙 |

`scripts/plugin-manifest.test.mjs` は Skill の一覧を持たない。版の一致だけを見るので、2ファイルを同時に上げれば緑のまま通る。`src/core/skills.test.ts` と `src/components/settings/AiSettings.test.ts` は配列から導出するので、改修は要らない。

## ファイル構成

```
plugins/facet/skills/write-decision-table/
  SKILL.md
  schemas/decision-table.schema.json      schemas/ のバイト一致コピー
  scripts/new-id.mjs                      cond / out を採番
  scripts/decision-table-write.mjs        検証・整列・再構築・正規形・報告
  scripts/generated/                      gen:skills の生成物（追跡する）
    validate.mjs canonical.mjs rows.mjs missing.mjs missing-tally.mjs
  evals/evals.json
  evals/grade.mjs
  evals/fixtures/existing-project/送料の決定.json
src/modules/decision-table/rows.ts          alignRowsByLabel / rebaseRows を足す
src/modules/decision-table/skill-write.smoke.test.ts
src/modules/decision-table/skill-grade.test.ts
sample-project/書類選考の結果通知.json
```

---

### Task 1: 行の整列と再構築の純関数

**Files:**
- Modify: `src/modules/decision-table/rows.ts`
- Test: `src/modules/decision-table/rows.test.ts`

**Interfaces:**
- Consumes: 既存の `productSize` / `valueIndicesAt` / `rowKeyOf` / `rebuildRows` / `outcomeFromById` / `Axis` / `RebuildResult`
- Produces:

```ts
export interface AlignResult {
  /** 直積の並びの行。`stray` か `conflicts` があるとき、または `ambiguous` のときは入力の rows のまま */
  rows: Row[]
  /** 直積に当てはまらない入力の行の位置（未知の値・values か results の長さ違い） */
  stray: number[]
  /** 同じ組み合わせで impossible か results が食い違う、入力の行の位置の組 */
  conflicts: number[][]
  /** 1つの条件に同じ値ラベルが2件あり、ラベルで行を指せない */
  ambiguous: boolean
}
export function alignRowsByLabel(
  conditions: readonly Condition[],
  outcomeCount: number,
  rows: readonly Row[],
): AlignResult

export function rebaseRows(
  base: { conditions: readonly Condition[]; outcomes: readonly Outcome[]; rows: readonly Row[] },
  next: { conditions: readonly Condition[]; outcomes: readonly Outcome[] },
): RebuildResult
```

性質（テストで固定する）:

- `alignRowsByLabel`
  - 並びの乱れた完全な行集合を、直積の並びへ整える。行の中身は変えない
  - 欠けた組み合わせを `{ values, impossible: false, results: 空文字 × outcomeCount }` で補う
  - 未知の値の行、`values` の長さ違いの行、`results` の長さ違いの行を `stray` に入れ、`rows` は入力のまま返す
  - 同じ組み合わせで結果が同じ2行は1行にまとめ、食い違う2行は `conflicts` に入れる
  - 値ラベルの重複（完全一致）がある条件を持つと `ambiguous: true` で入力のまま返す
  - 条件0本なら行は0本。入力の行はすべて `stray`
- `rebaseRows`
  - 条件を1本足すと、既存の結果が新しい値ぶん複製される
  - 条件を消して結果が食い違うと空欄に落ち、`clearedCells` に数わる
  - 値の本数が変わらず改名だけなら、位置で引き継ぐ
  - 値を1つ足し、既存の値のラベルがそのままなら、ラベルで引き継ぎ新しい値の行は空
  - 選択肢の改名で結果セルのラベルも書き換わる
  - 選択肢を消すと、それを選んでいた結果セルが空に戻り `lostCells` に数わる
  - 結果を消すと、記入済みのセルが `lostCells` に数わる

JSDoc に同梱の旨と制約を書く（rev 5章「導出ロジックは制約の下で書き、同梱予定である旨と制約を原本の JSDoc に書く」）。`missing.ts` と `missing-tally.ts` の JSDoc にも同じ旨を足す。`missing-tally.ts` の既存コメントのうち「課題ツリーの derive.ts は同じ文字列を自前で組み立てる」は、課題ツリーに限った記述として残す。

- [ ] **Step 1: 上の性質ごとに失敗するテストを `rows.test.ts` に書く**（区別したい2つの実装が同じ答えを返す退化入力を避ける。条件は2本以上・値は2つ以上）
- [ ] **Step 2: `npx vitest run src/modules/decision-table/rows.test.ts` で赤を確かめる**
- [ ] **Step 3: 実装する。** `rebaseRows` は内部で `Axis[]` を組み、`rebuildRows` を呼んでから選択肢の対応を結果セルに当てる
- [ ] **Step 4: 緑を確かめ、実装の一部（例: 食い違いの判定）を壊して赤くなることを1度確かめる**
- [ ] **Step 5: `rows.ts` / `missing.ts` / `missing-tally.ts` が値 import を持たないことを確かめる**

Run: `grep -n "^import" src/modules/decision-table/rows.ts src/modules/decision-table/missing.ts src/core/missing-tally.ts`
Expected: `import type` の行だけが出る

- [ ] **Step 6: Commit** `feat(decision-table): 下書きの行を直積へ引き当てる純関数と、定義の変更から行を組み直す純関数を足す`

---

### Task 2: Skill の骨格と生成物

**Files:**
- Create: `plugins/facet/skills/write-decision-table/schemas/decision-table.schema.json`（`schemas/` からコピー）
- Create: `plugins/facet/skills/write-decision-table/scripts/new-id.mjs`
- Create: `plugins/facet/skills/write-decision-table/SKILL.md`（frontmatter と見出しだけの仮置き。Task 4 で本文を書く）
- Modify: `src/core/skills.ts`、`scripts/gen-skills.mjs`、`scripts/gen-skills.test.mjs`、`src/core/skill-schema-copy.test.ts`、`src/components/settings/ai-skills.ts`

**Interfaces:**
- Produces: `scripts/generated/{validate,canonical,rows,missing,missing-tally}.mjs`

`SKILL_SOURCES` の項目:

```js
'write-decision-table': {
  schema: 'decision-table',
  shared: [
    'src/core/canonical.ts',
    'src/modules/decision-table/rows.ts',
    'src/modules/decision-table/missing.ts',
    'src/core/missing-tally.ts',
  ],
},
```

`new-id.mjs` は `write-sequence` の形に倣う。prefix は `cond` と `out` の2種で、既定は `cond`（`out` と取り違えても `decision-table-write.mjs` の pattern 検証が捕まえる）。

`SCHEMA_COPIES` の `script` は `scripts/decision-table-write.mjs`。このファイルは Task 3 で作るので、Task 2 の間は `skill-schema-copy.test.ts` の「書き出しスクリプトが探すファイル名と一致する」が赤いままになる。**Task 2 と Task 3 は同じコミットにまとめず、Task 2 の終わりで `SCHEMA_COPIES` への追加だけを保留し、Task 3 の Step 1 で足す。**

`gen-skills.test.mjs` に足す describe は「生成した rows.mjs / missing.mjs / missing-tally.mjs」。お手本がまだ無いので、テスト内で組んだ小さな表（条件2本・値2つずつ・結果1本、空欄と `impossible` を1行ずつ含む）を使う。

- `alignRowsByLabel` を並びを乱した行で呼び、生成物とアプリの戻り値が `toEqual` で一致する
- `tallyLine(tallyMissing(data))` が生成物とアプリで一致する

`SKILL_LABELS` の `label` は `'デシジョンテーブルを書く'`。

- [ ] **Step 1: `WRITE_SKILLS` に足し、`npx vitest run scripts/gen-skills.test.mjs src/core/skills.test.ts src/components/settings/AiSettings.test.ts` で赤を確かめる**（網羅の検査が赤くなる）
- [ ] **Step 2: スキーマのコピー、`new-id.mjs`、仮置きの `SKILL.md`、`SKILL_SOURCES`、`SKILL_LABELS` を足す**
- [ ] **Step 3: `npm run gen:skills` を実行し、生成物5本が出ることを確かめる**
- [ ] **Step 4: 生成物の出力一致の describe を足し、Step 1 のテストが緑になることを確かめる**
- [ ] **Step 5: `node plugins/facet/skills/write-decision-table/scripts/new-id.mjs 2 --prefix out` と `--prefix node` を実行し、前者が2件・後者が exit 2 になることを確かめる**
- [ ] **Step 6: Commit** `feat(decision-table): 登録 Skill の骨格を置き、行と欠落の導出を生成して同梱する`

---

### Task 3: 書き出しスクリプトと smoke テスト

**Files:**
- Create: `plugins/facet/skills/write-decision-table/scripts/decision-table-write.mjs`
- Create: `src/modules/decision-table/skill-write.smoke.test.ts`
- Modify: `src/core/skill-schema-copy.test.ts`

**Interfaces:**
- Consumes: 生成物5本、Task 1 の `alignRowsByLabel` / `rebaseRows` / `productSize` / `MAX_ROWS`、`missing.mjs` の `tallyMissing`、`missing-tally.mjs` の `tallyLine`
- Produces: CLI `--in/--out`、`--in/--base/--out [--allow-loss]`、`--check`。標準出力の行 `✓ 正規形で書き出しました:`／`✓ 正規形と一致しています`／`△ 正規形と差があります`／`⚠ 整合性の警告`

骨格は `logic-tree-write.mjs` に倣う。違うのは次の点。

- 引数は `--in` / `--out` / `--base` / `--allow-loss` / `--check`。`--base` と `--allow-loss` は `--out` と組み、`--check` とは組まない
- 手順は「スキーマ検証 → 直積の大きさ → 経路A か B で行を作る → 正規形 → 整合性と集計の報告 → 書き出し」
- `--check` は行を並べ替えた結果で正規形を比べる。並べ替えられない（`stray`・`conflicts`・`ambiguous`）ときは入力のまま比べる
- 報告は「アプリが開くことになるファイル」の並びで行う。`--out` は書き出す行、`--check` は入力の行
- 整合性の警告は `consistency.ts` の7ルールを同じ順で出す。文言は `consistency.ts` から逐語で写し、コメントに出典を書く
- `.gitattributes` の警告は `⚠ 整合性の警告` の見出しの下に混ぜず、別の見出し `⚠ 書き出し先の警告` に出す
- 報告の行: `条件: N本 ／ 結果: N本 ／ 行: N行（起こりえない N行）`、集計行、`未記入の結果: #N「結果名」、…`、`名前なし: 条件#N、条件#N の値#M、結果#N、結果#N の選択肢#M`
- 経路Bは `clearedCells` と `lostCells` を報告する。`lostCells > 0` かつ `--allow-loss` が無いなら書き出さず exit 1 で、失われる件数を stderr に出す

smoke テストの性質（`logic-tree` の smoke テストの形に倣う。fixture が退化していないことを先に固める）:

- アプリの整合性 message が7ルールすべて stdout に逐語で現れる。exit 0
- 集計行がアプリの `tallyLine(tallyMissing(data))` と逐語で一致する。未記入と名前なしの両方が 0 でない fixture で見る
- 欠陥の無いファイルは警告なしの exit 0 で `要対応 0`
- `--out` は乱れた並びと欠けた組み合わせの下書きを直積の並びで書き出し、`--check` が冪等に通る
- `--out` の報告位置が、書き出したファイルを `--check` したときの位置と一致する
- **`--out` で書き出したファイルを `classifyFile(text, appRegistry)` に渡すと `status: 'editable'`・`type: 'decisionTable'` になり、`checkDecisionTableConsistency` の指摘が0件**（spec のマイルストーン表「AI が書いた JSON をアプリが開ける」の観測点）
- 直積に当てはまらない行を持つ下書きは exit 1 で、出力ファイルを作らない
- 同じ組み合わせで結果が食い違う下書きは exit 1
- `--base` で条件を1本足すと、既存の結果が複製される
- `--base` で値を消して記入済みの結果が失われる場合、`--allow-loss` 無しは exit 1 でファイルを変えず、有りは exit 0
- `--base` に既存と違う `rows` の下書きを渡すと exit 2
- 直積が `MAX_ROWS` を超える下書きは exit 1
- スキーマ違反は exit 1

`SCHEMA_COPIES` に `{ skill: 'write-decision-table', schema: 'decision-table.schema.json', script: 'scripts/decision-table-write.mjs' }` を足す。

- [ ] **Step 1: `SCHEMA_COPIES` に足し、smoke テストを書き、`npx vitest run src/modules/decision-table/skill-write.smoke.test.ts src/core/skill-schema-copy.test.ts` で赤を確かめる**
- [ ] **Step 2: スクリプトを書く**
- [ ] **Step 3: 緑を確かめる。整合性の message を1つ書き換えて赤くなることを1度確かめ、戻す**
- [ ] **Step 4: Commit** `feat(decision-table): 書き出しスクリプトが行を直積へ整え、定義の変更から行を組み直す`

---

### Task 4: SKILL.md

**Files:**
- Modify: `plugins/facet/skills/write-decision-table/SKILL.md`

節立ては `write-sequence` の2フェーズに倣う。

- frontmatter `description`: 「仕様整理ツールのデシジョンテーブルファイル（type=decisionTable / schemaVersion 1 の JSON）を、会話の内容から作成・追記・更新する」。起動の語は「デシジョンテーブル」「判定表」「条件の組み合わせ」「組み合わせを漏れなく」「どの組み合わせでどうなるか」「プロジェクトフォルダに type: decisionTable の JSON があるとき」。除外は「原因の分解・場合分けの木は write-logic-tree、仮説・検証は write-issue-tree」
- 全体の流れ: フェーズA（表を起こす）とフェーズB（空欄を詰める）
- 1 対象を決める: 何本あってもよい。既定は新規。書き足しは名指しのときだけ。アプリで開いたまま作業しない
- 2 条件と結果を組む: 条件は同時に評価される軸だけにする。値は有限に列挙できるものに限る。表が向かない仕様（連続値・時系列）は報告して別のツールを勧める
- 3 行を書く: 決まった組み合わせだけを書けばよく、残りはスクリプトが空欄で補う。`impossible` はユーザーが「起こりえない」と言ったときだけ立てる
- 4 ID採番: `node scripts/new-id.mjs 3 --prefix cond`
- 5 書き込み: 経路A と経路B のコマンド、終了コード、exit 1 の3つの理由。定義の変更と結果の記入は別の書き出しに分ける。`--allow-loss` はユーザーが失う件数を聞いて了承したときだけ付ける
- 警告の扱いは出どころで分ける（今回書いた部分は直す。既存にあったものは報告して確認する）
- 6 報告: パスと `title`、条件・結果・行の本数、AI が起こした条件や選択肢、集計行（言い換えない）、整合性の警告、フェーズBの提案（1回だけ）
- 7 フェーズB: 空欄の結果を `#N` と条件の値で列挙し、同じ答えになりそうな行で束ねて聞く。答えが出ないものは空のまま
- 8 既存ファイルへの書き足し: 既存の JSON 全体を下書きに含める。`id`・`title` を変えない。触っていない行を1バイトも変えない
- やらないこと: 行を足す・消す提案をしない（条件か値で表す）、網羅性を主張しない、空欄を催促しない、`impossible` を推測で立てない、畳み（効いていない条件の指摘）を手で行わない

- [ ] **Step 1: 本文を書く。コマンド例は Task 3 のスクリプトで実際に実行し、出力の語を写す**
- [ ] **Step 2: `npx vitest run src/core/skills.test.ts` が緑であることを確かめる**
- [ ] **Step 3: Commit** `docs(decision-table): 登録 Skill の手順書を書く`

---

### Task 5: evals

**Files:**
- Create: `plugins/facet/skills/write-decision-table/evals/evals.json`
- Create: `plugins/facet/skills/write-decision-table/evals/grade.mjs`
- Create: `plugins/facet/skills/write-decision-table/evals/fixtures/existing-project/送料の決定.json`

fixture は eval 専用の小さな表で、ID は判定で名指しできる固定値にする（`cond_Aa1Bb2Cc3D` 等）。条件2本（会員か: はい/いいえ、5000円以上か: はい/いいえ）、結果1本（送料: 無料/500円）、4行のうち3行が記入済み。`decision-table-write.mjs --in --out` で書き出して正規形にする。

ケース:

| id | name | 測るもの |
| --- | --- | --- |
| 0 | `new-table-from-conversation` | 会話で決まった組み合わせだけが結果を持ち、決めていない組み合わせは空。`impossible` はすべて false。行が直積の並び |
| 1 | `route-to-decision-table` | 「会員ランクと購入金額の組み合わせでポイント倍率が決まる」で decisionTable が作られ、logicTree は作られない |
| 2 | `defer-to-logic-tree` | 「夜間バッチが失敗する原因を分解して」で decisionTable が作られない |
| 3 | `add-condition-to-existing` | fixture に「キャンペーン中か（はい/いいえ）」を足す。同じファイルが更新され、既存2条件と結果の `id`・`title` が変わらず、8行の各結果が同じ2値の旧行と一致する |
| 4 | `impossible-only-when-said` | 「会員でなくて5000円以上は起こりえない」と言われた1行だけが `impossible: true` |

`grade.mjs` は `write-logic-tree` の骨格（`ITER` の解釈・`eval-<id>/{with_skill,without_skill}` の走査・`grading.json` の形・`push()`）を変えずに写す。`inspect` は `decision-table-write.mjs --check <file>` を呼び、**`--schema` を渡さない**。共通の判定は、decisionTable がちょうど1つ・スキーマ検証・正規形・整合性の警告なし・ID の形。

- [ ] **Step 1: fixture を書き出し、`--check` が「正規形と一致」になることを確かめる**
- [ ] **Step 2: `evals.json` と `grade.mjs` を書く**
- [ ] **Step 3: Commit** `test(decision-table): 登録 Skill の evals を置く（ロジックツリーとの境界を2ケースで測る）`

---

### Task 6: 判定器のテスト

**Files:**
- Create: `src/modules/decision-table/skill-grade.test.ts`

一時ディレクトリに iteration を合成し、`node grade.mjs <iter>` を spawn して `grading.json` を読む。

- `with_skill` 側: ケースごとに、合格すべき出力を `decision-table-write.mjs --out` で書き出して置く（ケース2は何も置かない、ケース3は fixture を複製して `--base` で条件を足す）
- `without_skill` 側: ケースごとに、狙った項目で落ちる出力を置く（ケース0は空欄を埋めた表、ケース1は logicTree だけ、ケース2は decisionTable を置く、ケース3は既存の `id` を振り直した表、ケース4はすべての行を `impossible: true` にした表）
- 期待: `with_skill` はすべて `passed === total`。`without_skill` は狙った項目の `passed` が false

- [ ] **Step 1: テストを書き、緑を確かめる**
- [ ] **Step 2: `grade.mjs` の `inspect` に `"--schema", "x"` を足して赤くなることを確かめ、戻す**
- [ ] **Step 3: Commit** `test(decision-table): evals の判定器を合成した出力で検査する`

---

### Task 7: 既存の判定器が渡す `--schema` を外す

**Files:**
- Modify: `plugins/facet/skills/write-term/evals/grade.mjs`、`write-error/evals/grade.mjs`、`write-sequence/evals/grade.mjs`、`write-logic-tree/evals/grade.mjs`

`inspect` の引数から `"--schema", SCHEMA` を落とす。`SCHEMA` 定数に他の読み手が無ければ定数ごと消す。

- [ ] **Step 1: 4本を直す**
- [ ] **Step 2: 4本それぞれについて、`sample-project/` の該当ファイルを置いた iteration を作り `node grade.mjs <iter>` を実行し、「スキーマ検証を通る」が ✗ で出ないことを確かめる。出力を PR 本文に貼る**
- [ ] **Step 3: Commit** `fix(skills): evals の判定器が書き出しスクリプトの受け付けない --schema を渡さない`

---

### Task 8: お手本・README・横断文書

**Files:**
- Create: `sample-project/書類選考の結果通知.json`
- Modify: `scripts/gen-skills.test.mjs`（`SAMPLES`）、`README.md`、`docs/README.md`、`docs/overview-rev.md`、`docs/decision-table/decision-table-design-notes.md`、`docs/open-issues.md`、`plugins/facet/skills/read-project/SKILL.md`、`plugins/facet/.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json`

お手本の中身（題材は他のお手本と同じ中途採用）:

- 条件: 必須要件を満たすか（満たす／満たさない）、応募経路（自社サイト／エージェント）、募集中か（募集中／締切後）
- 結果: 通知（書類選考へ進む／お見送り）、エージェントへの連絡（する／しない）
- 自社サイト × 締切後 の2行を `impossible: true`（応募フォームが閉じる）
- わざと空欄を残す。README の表に書く集計行は、書き出したファイルを `--check` した実測から写す

文書の変更:

- `README.md`: 「5ツール」を「6ツール」に、お手本の表に1行、Skill の一覧に `facet:write-decision-table`
- `docs/README.md`: 「登録 Skill 5本」を「登録 Skill 6本」に
- `docs/overview-rev.md` 2章 7番: 括弧を `（エディタ・整合性検証・絞り込み・まとめて入力・Markdown 出力・表形式コピー・登録 Skill まで実装済み。畳みは未実装。詳細は …）` に置き換える
- `docs/overview-rev.md` 5章「共有している原本は」の文: ツール固有の導出に `src/modules/decision-table/rows.ts`・`src/modules/decision-table/missing.ts`、コアに `src/core/missing-tally.ts` を足す
- `docs/decision-table/decision-table-design-notes.md`: 「登録 Skill」の節を足し、着手前に決めたこと2の要点（経路A・経路B・止まる条件）を現在形で書く
- `plugins/facet/skills/read-project/SKILL.md`: 一覧に `facet:write-decision-table` を足し、「`decisionTable` はまだ対応する登録 Skill が無い」の文を消す
- `docs/open-issues.md`: 「`write-logic-tree` の evals は実行ハーネスに掛けていない」を「`write-term`／`write-error`／`write-sequence`／`write-logic-tree` の判定器にテストが無い」に置き換える。smoke テストの項目の「5本」を本数を書かない形にする
- `plugin.json` / `marketplace.json`: `version` を `0.2.0`、`plugin.json` の `description` の列挙にデシジョンテーブルを足す

- [ ] **Step 1: お手本を下書きし、`--in/--out` で `sample-project/` へ書き出す。`--check` の出力を控える**
- [ ] **Step 2: `SAMPLES` に `['書類選考の結果通知.json', 'decision-table']` を足し、`npx vitest run scripts/gen-skills.test.mjs` を緑にする**
- [ ] **Step 3: 文書を直す**
- [ ] **Step 4: 文書の差分を読み、削れる文が無いか・現在形か・経緯が混ざっていないかを見る**
- [ ] **Step 5: Commit** `docs(decision-table): お手本と横断文書を登録 Skill に合わせる`

---

### Task 9: 全体の検証

- [ ] **Step 1:** `npm test && npx tsc -b && npm run lint`
- [ ] **Step 2:** `(cd src-tauri && cargo test)`
- [ ] **Step 3:** `git status --short` が空（生成物のコミット漏れが無い）
- [ ] **Step 4:** `grep -rn "まだ対応する登録 Skill が無い\|登録 Skill 5本\|5ツール" README.md docs/README.md docs/overview-rev.md plugins/` が何も返さない
- [ ] **Step 5:** 出力を控え、PR 本文に貼る

## PR 本文に書くこと

- evals の扱い: 実走は `npm test` と CI に載せず、判定器のテストだけを `npm test` に載せたこと。CI を立てるか、evals の実走をいつ回すかの裁定の依頼
- 既存4本の判定器の `--schema` の不具合と、その実測
- `write-logic-tree` の description を変えていないことと、境界を測る2ケース
- プラグインの版を `0.2.0` にしたこと。公開は `main` へ入れるとき
- 実機確認のチェックリスト
  - [ ] Claude Code で `write-decision-table` を使い、会話から表を作らせる。できた JSON をアプリで開くと編集でき、欠落の帯の集計行が Skill の報告と一致する
  - [ ] 既存の表に条件を1本足させる。アプリで開き直すと、既存の結果が複製されている
  - [ ] `sample-project/` を開き、デシジョンテーブルのお手本が README の表のとおりに見える
  - [ ] skill-creator で evals を1回実走し、ロジックツリーとの境界の2ケースの結果を記録する
