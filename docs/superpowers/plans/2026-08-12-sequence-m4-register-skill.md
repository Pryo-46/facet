# シーケンス登録 Skill（`sequence-register`）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude と仕様を詰める会話の最後に「じゃあこれでシーケンス図作って」と言えば、その会話が `type: "sequence"` の JSON になる Skill を作る。

**Architecture:** 既存2本のデータ作成 Skill（`glossary-term-register` / `error-catalog-register`）と同じ3点セット（`SKILL.md` ＋ 同梱スクリプト ＋ evals）。同梱 Skill はアプリがユーザーのプロジェクトフォルダへコピーするため `src/` を直接 import できない。そこで問いの導出（`src/modules/sequence/questions.ts`）の**バイト一致コピー**を Skill に同梱し、ズレをユニットテストで検知する。

**Tech Stack:** Node ESM（`.mjs`）／ajv 8（JSON Schema 2020-12）／Node の型ストリップ（`.ts` の直接 import）／vitest／oxlint

## Global Constraints

- 設計の正は `docs/superpowers/specs/2026-08-12-sequence-register-skill-design.md`。データ形式の正は `schemas/sequence.schema.json`
- **作業は worktree `sequence-m4-register-skill` の中で行う。** 主チェックアウトで計画・仕様ファイルを作らない（CLAUDE.md）
- **ID を手で書かない。** 必ず `scripts/new-id.mjs` の出力を使う。連番禁止
- ID 形式: `actor_` / `step_` ＋ 英数字62文字（`A-Za-z0-9`）の nanoid **10文字固定**
- **同梱した `.ts` のコピーは手で編集しない。** 正は `src/modules/sequence/questions.ts` と `src/core/canonical.ts` で、コピーはそこから丸ごと取り直す
- Node は **22.18+ / 23.6+ / 24+**（型ストリップが unflagged。23.0〜23.5 は不可）。検証環境は v24.12.0
- スクリプトの終了コード: **0＝成功（警告はあり得る）／1＝スキーマ検証失敗／2＝使い方の誤り**
- 書き出しの正規形: キー順はスキーマの `properties` 記載順から実行時に導出／インデント2スペース／**LF**／非ASCIIそのまま／末尾改行あり／BOM なし
- 各タスクの最後に `npm test` が緑であること。全タスク完了時に `npm test && npx tsc -b && npm run lint` が緑であること
- コミットメッセージは日本語・命令形の要約1行（既存の `feat(skill): …` / `docs(sequence-m4): …` に倣う）
- **検証用の一時ファイルをリポジトリ内に置かない。** 本文の `/tmp/seq-*.json` はその意味の置き場所で、セッションのスクラッチディレクトリがあるならそちらへ読み替えてよい。`git status --short` が汚れないことだけが要件

---

## ファイル構成

| ファイル | 責務 |
| --- | --- |
| `src/modules/sequence/questions.ts`（改） | 問いの導出。**`readSlot` をここへ移す**（Task 1） |
| `src/modules/sequence/commands.ts`（改） | `readSlot` の定義を削り、`questions.ts` から import して使う |
| `src/modules/sequence/markdown.ts`（改） | `readSlot` の import 元を `./questions` へ |
| `src/modules/sequence/SequenceEditor.tsx`（改） | ローカルの `readAnswer` を削り、`readSlot` を使う |
| `src/modules/sequence/skill-copy.test.ts`（新） | コピー2本のバイト一致／値 import と消去不能構文が無いこと、の機械検査 |
| `.claude/skills/sequence-register/scripts/questions.ts`（新） | 上記のバイト一致コピー |
| `.claude/skills/sequence-register/scripts/canonical.ts`（新） | `src/core/canonical.ts` のバイト一致コピー（正規形シリアライザ） |
| `.claude/skills/sequence-register/scripts/new-id.mjs`（新） | ID 採番 |
| `.claude/skills/sequence-register/scripts/sequence-write.mjs`（新） | 検証＋正規化＋整合性検証＋集計 |
| `.claude/skills/sequence-register/SKILL.md`（新） | 聞き方の手順書（この Skill の本体） |
| `.claude/skills/sequence-register/package.json`（新） | ajv の依存宣言（同梱対象外） |
| `.claude/skills/sequence-register/evals/*`（新） | 評価ハーネス（同梱対象外） |
| `src/core/skill-sync.ts`（改） | `BUNDLED_SKILLS` に登録＋古いコメントの訂正 |
| `src/core/skill-sync.test.ts`（改） | `BUNDLED_SKILLS` の中身を固定するテストを足す |
| `.claude/skills/glossary-term-register/evals/grade.mjs`（改） | 自己位置解決を `import.meta.url` 起点へ（open-issues #81） |
| `docs/*`（改）・`docs/history/sequence-m4-register-skill.md`（新） | 反映と申し送り |

---

### Task 1: `readSlot` を `questions.ts` へ移す

**なぜこのタスクが要るか。** `commands.ts` の `readSlot` には「**同じ読み方が3箇所にある**（ここ・`SequenceEditor.tsx` の `readAnswer`・`consistency.ts` の `presentAnswers`）。M2 の申し送りに既知の負債として記録されている。**4本目を作らないため**に export した」というコメントがある。Skill のスクリプトは集計のためにこの読み方を必要とするが、`commands.ts` は値 import を持つため Node から直接 import できない。**このまま進むとコメントが警告している4本目をスクリプト内に作ることになる。**

`readSlot` は `SequenceStep`（型）と `AnswerPath`（`questions.ts` 内で定義）にしか依存しないので、`questions.ts` へ移せば Skill 側は import できる。`SequenceEditor.tsx` のローカル複製もここで畳む。

**Files:**
- Modify: `src/modules/sequence/questions.ts`（末尾に追加）
- Modify: `src/modules/sequence/commands.ts:4, 246-262`（import を値に変え、定義を削る。360 行目の呼び出しはそのまま残る）
- Modify: `src/modules/sequence/markdown.ts:4`（import 元の変更）
- Modify: `src/modules/sequence/SequenceEditor.tsx:168-178, 330, 338`（`readAnswer` の削除）
- Test: `src/modules/sequence/questions.test.ts`（追記）

**Interfaces:**
- Consumes: なし
- Produces: `questions.ts` が `readSlot(step: Pick<SequenceStep, 'failures'>, path: AnswerPath): { decision?: 'handled' | 'notApplicable'; text?: string }` を export する。Task 2 以降のコピーと Task 4 の集計がこれに乗る

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/sequence/questions.test.ts` の末尾に足す（ファイル冒頭の import に `readSlot` を加えること）:

```ts
describe('readSlot', () => {
  const base = { id: 'step_Ab3xK9mP2q', kind: 'call', from: 'actor_Xp2mQ9rT4k', label: '与信依頼', awaitsReply: true } as const

  it('キーが無いスロットは空オブジェクトを返す（未定義＝キー欠落）', () => {
    expect(readSlot({ ...base }, 'failed')).toEqual({})
    expect(readSlot({ ...base }, 'unknown')).toEqual({})
    expect(readSlot({ ...base }, 'ifExecuted')).toEqual({})
  })

  it('unknown は ifExecuted を含めず decision と text だけを返す', () => {
    const step = {
      ...base,
      failures: {
        unknown: { decision: 'handled', text: 'リトライする', ifExecuted: { decision: 'handled', text: '取引IDで冪等性を担保' } },
      },
    } as const
    expect(readSlot(step, 'unknown')).toEqual({ decision: 'handled', text: 'リトライする' })
    expect(readSlot(step, 'ifExecuted')).toEqual({ decision: 'handled', text: '取引IDで冪等性を担保' })
  })

  it('notApplicable は text を持たないまま返す（空文字を補わない）', () => {
    const step = { ...base, failures: { failed: { decision: 'notApplicable' } } } as const
    expect(readSlot(step, 'failed')).toEqual({ decision: 'notApplicable' })
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/modules/sequence/questions.test.ts`
Expected: FAIL（`readSlot` が `./questions` から export されていない）

- [ ] **Step 3: `questions.ts` の末尾に `readSlot` を足す**

```ts
/**
 * 答えスロット1つの読み出し。`unknown` は下位の `ifExecuted` を内包する形なので
 * 素直なプロパティアクセスにならない——その差を吸収するのがこの関数の仕事。
 *
 * **読み方の正はここ1箇所。** かつては commands.ts に置き、SequenceEditor.tsx が
 * ローカルに複製していた（M2 の申し送りの既知の負債）。同梱 Skill の
 * sequence-write.mjs がこのファイルをバイト一致コピーして使うため、
 * 値 import を持たないこのファイルへ集約した
 */
export function readSlot(
  step: Pick<SequenceStep, 'failures'>,
  path: AnswerPath,
): { decision?: 'handled' | 'notApplicable'; text?: string } {
  if (path === 'failed') return step.failures?.failed ?? {}
  if (path === 'unknown') {
    const u = step.failures?.unknown
    return u === undefined ? {} : { decision: u.decision, text: u.text }
  }
  return step.failures?.unknown?.ifExecuted ?? {}
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/modules/sequence/questions.test.ts`
Expected: PASS

- [ ] **Step 5: `commands.ts` の定義を削る**

`commands.ts` の `export function readSlot(...)`（252 行目付近）を、直前のドキュメントコメント（`同じ読み方が3箇所にある` で始まるブロック）ごと削除する。

**`commands.ts:360` が `readSlot` を内部で使っている**（`const current = readSlot(step, path)`）ので、値として import し直す必要がある。`commands.ts:4` を次に置き換える:

```ts
import { readSlot, type AnswerPath } from './questions'
```

**再輸出は置かない。** Step 6 で `markdown.ts` が `./questions` を直接見るようになり、`./commands` 経由で `readSlot` を引く利用者はいなくなる。後方互換の再輸出は死んだコードになる。

- [ ] **Step 6: `markdown.ts` の import 元を変える**

2箇所を直す。

`src/modules/sequence/markdown.ts:4` の行を**削除する**:

```ts
import { readSlot } from './commands'
```

`src/modules/sequence/markdown.ts:12` を次に置き換える:

```ts
import { poseQuestions, readSlot, type AnswerPath } from './questions'
```

- [ ] **Step 7: `SequenceEditor.tsx` のローカル複製を消す**

`function readAnswer(...)`（168〜178 行目付近）を削除し、`questions` からの既存 import に `readSlot` を足す。330 行目と 338 行目の `readAnswer(step, path)` を `readSlot(step, path)` に置き換える。

- [ ] **Step 8: 全テストと型検査を通す**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑（既存の `commands.test.ts` / `markdown.test.ts` / `SequenceEditor.dom.test.tsx` が無改修で通ること。通らなければ移植の誤り）

- [ ] **Step 9: コミット**

```bash
git add src/modules/sequence/questions.ts src/modules/sequence/questions.test.ts src/modules/sequence/commands.ts src/modules/sequence/markdown.ts src/modules/sequence/SequenceEditor.tsx
git commit -m "refactor(sequence): 答えスロットの読み方を questions.ts へ集約する"
```

---

### Task 2: `.ts` コピー2本と一致の機械検査

同梱 Skill は `src/` を直接 import できない（アプリがプロジェクトフォルダへコピーするため）。手で複製すると open-issues #78 と同じ「追従漏れがテストで検知されない」状態になるので、**バイト一致コピー＋機械検査**にする。対象は2本:

| コピー | 正 | 何のため |
| --- | --- | --- |
| `scripts/questions.ts` | `src/modules/sequence/questions.ts` | 問いの導出・答えの読み方（Task 5 の集計と検証） |
| `scripts/canonical.ts` | `src/core/canonical.ts` | 正規形シリアライザ（Task 4 の書き出し） |

`canonical.ts` は **import を1つも持たない**ので型ストリップだけで通る（実測済み）。そのヘッダコメントは既に「Skill 側の write スクリプトとバイト単位で同一の出力を返すこと」を要求しており、**コピーにすればその要求が構造的に満たされる**（既存2本の Skill は同じ処理を手で複製している）。

**Files:**
- Create: `.claude/skills/sequence-register/scripts/questions.ts`
- Create: `.claude/skills/sequence-register/scripts/canonical.ts`
- Test: `src/modules/sequence/skill-copy.test.ts`

**Interfaces:**
- Consumes: Task 1 の `questions.ts`（`readSlot` を含む形）
- Produces: Task 4・5 の `sequence-write.mjs` が `await import('./questions.ts')`（`poseQuestions` / `unposedAnswers` / `readSlot`）と `import { serialize, stripBom } from './canonical.ts'` で読む

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/sequence/skill-copy.test.ts` を新規作成:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 同梱 Skill（sequence-register）は、アプリのソース2本のバイト一致コピーを持つ。
 *
 * **なぜコピーなのか。** Skill はアプリがユーザーのプロジェクトフォルダへ
 * 置き直すため（src/core/skill-sync.ts）、実行時に src/ は存在しない。
 * 一方で手で複製すると、エラーカタログ Skill と同じ
 * 「追従漏れがテストで検知されない」状態になる（open-issues #78）。
 * **バイト一致のコピー＋この検査**なら、ズレた瞬間に赤くなる
 */
const COPIES = [
  { app: 'src/modules/sequence/questions.ts', skill: '.claude/skills/sequence-register/scripts/questions.ts' },
  { app: 'src/core/canonical.ts', skill: '.claude/skills/sequence-register/scripts/canonical.ts' },
]

describe.each(COPIES)('sequence-register 同梱の $app', ({ app, skill }) => {
  it('アプリ側とバイト一致する', () => {
    expect(readFileSync(skill)).toEqual(readFileSync(app))
  })

  it('値 import を持たない（コピーが Node で相対解決できる条件）', () => {
    // 値 import があるとコピー側で解決できず、sequence-write.mjs が落ちる。
    // `import type ...` と `import { type X } from` は型ストリップで消えるので許す
    const src = readFileSync(app, 'utf8')
    const valueImports = [...src.matchAll(/^import\s+(?!type\s)(.*)$/gm)]
      .map((m) => m[0])
      .filter((line) => !/^import\s*\{\s*type\s/.test(line))
    expect(valueImports).toEqual([])
  })

  it('消去できない構文（enum / パラメータプロパティ）を持たない', () => {
    // 型ストリップは型注釈しか消せない。enum は実行時の値を持つので落ちる
    const src = readFileSync(app, 'utf8')
    expect(src).not.toMatch(/^\s*(export\s+)?(const\s+)?enum\s/m)
    expect(src).not.toMatch(/constructor\s*\([^)]*\b(public|private|protected|readonly)\s/)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/modules/sequence/skill-copy.test.ts`
Expected: FAIL（バイト一致の2件が ENOENT。コピーがまだ無い）

- [ ] **Step 3: コピーを作る**

**手で書き写さない。丸ごとコピーする:**

```bash
mkdir -p .claude/skills/sequence-register/scripts
cp src/modules/sequence/questions.ts .claude/skills/sequence-register/scripts/questions.ts
cp src/core/canonical.ts .claude/skills/sequence-register/scripts/canonical.ts
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/modules/sequence/skill-copy.test.ts`
Expected: PASS（6件＝2ファイル × 3検査）

- [ ] **Step 5: コピー2本が Node から実際に import できることを確認する**

Run:
```bash
node -e "
Promise.all([
  import('./.claude/skills/sequence-register/scripts/questions.ts'),
  import('./.claude/skills/sequence-register/scripts/canonical.ts'),
]).then(([q, c]) => {
  console.log(JSON.stringify(q.poseQuestions({kind:'call',awaitsReply:false})), JSON.stringify(q.readSlot({}, 'failed')));
  console.log(JSON.stringify(c.serialize({b:1,a:2}, {properties:{a:{},b:{}}})));
})"
```
Expected: 1行目が `{"failed":false,"unknown":true,"ifExecuted":false} {}`、2行目が `"{\n  \"a\": 2,\n  \"b\": 1\n}\n"`（キー順がスキーマ順に直り、末尾が改行）

（落ちたら Node のバージョンを確認する。22.18+ / 23.6+ / 24+ が要る。）

- [ ] **Step 6: コミット**

```bash
git add .claude/skills/sequence-register/scripts/ src/modules/sequence/skill-copy.test.ts
git commit -m "feat(skill): シーケンス登録 Skill にアプリのコピー2本と一致検査を置く"
```

---

### Task 3: `new-id.mjs`

**Files:**
- Create: `.claude/skills/sequence-register/scripts/new-id.mjs`
- Create: `.claude/skills/sequence-register/package.json`

**Interfaces:**
- Consumes: なし
- Produces: `node scripts/new-id.mjs [件数] [--prefix actor|step]` が1行1件で ID を標準出力に書く。既定 prefix は `step`、既定件数は 1

- [ ] **Step 1: `package.json` を作る**

`.claude/skills/sequence-register/package.json`:

```json
{
  "name": "sequence-register-skill",
  "private": true,
  "type": "module",
  "description": "シーケンス登録Skillの同梱スクリプト（ID採番・検証・正規形書き出し）",
  "dependencies": {
    "ajv": "^8.17.1"
  }
}
```

- [ ] **Step 2: `new-id.mjs` を書く**

`.claude/skills/sequence-register/scripts/new-id.mjs`:

```js
#!/usr/bin/env node
// ID採番。プロジェクトのID規約（overview-rev.md 5章）に従い
// <entityPrefix>_<英数字62文字アルファベットの nanoid 10文字> を出力する。
//
// 使い方:
//   node scripts/new-id.mjs                  → step_XXXXXXXXXX を1件
//   node scripts/new-id.mjs 12               → 12件（1行1件）
//   node scripts/new-id.mjs 3 --prefix actor → actor_XXXXXXXXXX を3件
//
// シーケンスは prefix が2種類ある（actor / step）。既定を step にしているのは
// ステップのほうが件数が多いから。取り違えても sequence-write.mjs の
// pattern 検証（^actor_[A-Za-z0-9]{10}$ 等）が捕まえる。
//
// 連番IDは禁止（アプリとAIが並行して要素を追加するため、連番は必ず衝突する）。
// 乱数は crypto.randomInt（偏りのない一様分布）を使う。

import { randomInt } from "node:crypto";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const LENGTH = 10;

const argv = process.argv.slice(2);
let count = 1;
let prefix = "step";

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--prefix") {
    prefix = argv[++i];
  } else if (/^\d+$/.test(a)) {
    count = Number(a);
  } else {
    console.error(`不明な引数: ${a}`);
    process.exit(2);
  }
}

if (prefix !== "actor" && prefix !== "step") {
  console.error(
    `--prefix は actor か step のどちらかです: 受け取った値 = ${JSON.stringify(prefix)}`
  );
  process.exit(2);
}
if (count < 1 || count > 1000) {
  console.error(`件数は 1〜1000 の範囲で指定してください: ${count}`);
  process.exit(2);
}

const ids = [];
for (let n = 0; n < count; n++) {
  let body = "";
  for (let i = 0; i < LENGTH; i++) body += ALPHABET[randomInt(ALPHABET.length)];
  ids.push(`${prefix}_${body}`);
}
process.stdout.write(ids.join("\n") + "\n");
```

- [ ] **Step 3: 動作を確認する**

Run:
```bash
cd .claude/skills/sequence-register && node scripts/new-id.mjs 3 && node scripts/new-id.mjs 2 --prefix actor && node scripts/new-id.mjs --prefix zone; echo "exit=$?"
```
Expected: `step_` の10文字ID が3行、`actor_` の10文字ID が2行、最後は `--prefix は actor か step のどちらかです` と `exit=2`

- [ ] **Step 4: ID の形を機械的に確認する**

Run:
```bash
cd .claude/skills/sequence-register && node scripts/new-id.mjs 50 | grep -cE '^step_[A-Za-z0-9]{10}$'
```
Expected: `50`

- [ ] **Step 5: コミット**

```bash
git add .claude/skills/sequence-register/package.json .claude/skills/sequence-register/scripts/new-id.mjs
git commit -m "feat(skill): シーケンス登録 Skill の ID 採番スクリプトを追加する"
```

---

### Task 4: `sequence-write.mjs`（検証と正規形書き出し）

このタスクではスキーマ検証と正規化までを作る。整合性検証と集計は Task 5。

**Files:**
- Create: `.claude/skills/sequence-register/scripts/sequence-write.mjs`

**Interfaces:**
- Consumes: Task 2 の `./questions.ts`（このタスクでは import して読み込めることだけ確かめ、使うのは Task 5）
- Produces: `node scripts/sequence-write.mjs --in <draft> --out <target>` と `--check <file>`。終了コード 0/1/2

- [ ] **Step 1: スクリプトを書く**

`.claude/skills/sequence-register/scripts/sequence-write.mjs`:

```js
#!/usr/bin/env node
// シーケンスファイルの検証＋正規形での書き出し。
//
// このスクリプトが担うのは3つ:
//   1. スキーマ検証（アプリと同一の sequence.schema.json を参照。コピーは持たない）
//   2. 正規化（キー順をスキーマの properties 記載順から実行時に導出し、LF・2スペース・
//      非ASCIIそのまま・末尾改行あり・BOMなしで書き出す）
//   3. 整合性検証（参照切れ / ID重複 / to の過不足 / from==to / 立っていない問いへの答え）と
//      未定義の集計を報告する。アプリ側のレベル2と同じ性質なので書き込みは止めない。
//
// **問いの導出は手で複製しない。** ./questions.ts は src/modules/sequence/questions.ts の
// バイト一致コピーで、ズレは src/modules/sequence/skill-copy.test.ts が検知する。
//
// 使い方:
//   node scripts/sequence-write.mjs --in draft.json --out <project>/注文確定.json
//   node scripts/sequence-write.mjs --check <project>/注文確定.json
//   （--schema <path> でスキーマを明示指定できる。省略時は自動探索）
//
// 終了コード: 0=成功（警告はあり得る） / 1=スキーマ検証失敗 / 2=使い方の誤り

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const SKILL_DIR = path.resolve(fileURLToPath(import.meta.url), "../..");

// ---------- アプリのコピー（手で複製しない） ----------
//
// questions.ts = 問いの導出と答えの読み方（src/modules/sequence/questions.ts）
// canonical.ts = 正規形シリアライザ（src/core/canonical.ts）
// どちらもバイト一致コピーで、ズレは src/modules/sequence/skill-copy.test.ts が検知する

let Q, C;
try {
  [Q, C] = await Promise.all([import("./questions.ts"), import("./canonical.ts")]);
} catch (e) {
  die(
    2,
    `同梱の .ts を読み込めません。Node の型ストリップが要ります（22.18+ / 23.6+ / 24+。現在 ${process.version}）\n  ${e.message}`
  );
}

// ---------- 引数 ----------

const argv = process.argv.slice(2);
const opt = { in: null, out: null, check: null, schema: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--in") opt.in = argv[++i];
  else if (a === "--out") opt.out = argv[++i];
  else if (a === "--check") opt.check = argv[++i];
  else if (a === "--schema") opt.schema = argv[++i];
  else die(2, `不明な引数: ${a}`);
}
if (opt.check && (opt.in || opt.out)) die(2, "--check は --in/--out と併用できません。");
if (!opt.check && (!opt.in || !opt.out)) die(2, "--in <draft.json> --out <シーケンス.json> か --check <file> を指定してください。");

const sourcePath = path.resolve(opt.check ?? opt.in);
const targetPath = opt.check ? null : path.resolve(opt.out);

// ---------- スキーマの解決（正は一つ。アプリと同じ実体を読む） ----------

function findSchema() {
  if (opt.schema) return path.resolve(opt.schema);
  if (process.env.FACET_SEQUENCE_SCHEMA) return path.resolve(process.env.FACET_SEQUENCE_SCHEMA);
  const starts = [path.dirname(targetPath ?? sourcePath), process.cwd(), SKILL_DIR];
  for (const start of starts) {
    let dir = path.resolve(start);
    for (;;) {
      for (const rel of ["sequence.schema.json", path.join("schemas", "sequence.schema.json")]) {
        const p = path.join(dir, rel);
        if (fs.existsSync(p)) return p;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  die(2, "sequence.schema.json が見つかりません。--schema <path> で指定してください。");
}

const schemaPath = findSchema();
const schema = readJson(schemaPath, "スキーマ");

// ---------- 入力 ----------

const data = readJson(sourcePath, "入力ファイル");

// ---------- スキーマ検証（不合格＝レベル1。アプリは開けない） ----------

let AjvCtor;
try {
  const m = require("ajv/dist/2020.js");
  AjvCtor = m.default ?? m;
} catch {
  die(2, `ajv が見つかりません。次を実行してください:\n  cd "${SKILL_DIR}" && npm install`);
}
const ajv = new AjvCtor({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

if (!validate(data)) {
  console.error(`✗ スキーマ検証に失敗しました（アプリはこのファイルを開けません）`);
  console.error(`  スキーマ: ${schemaPath}`);
  for (const e of validate.errors) {
    const at = e.instancePath || "(ルート)";
    const extra = e.params?.allowedValues ? `（許可値: ${e.params.allowedValues.join(", ")}）` : "";
    console.error(`  - ${at}: ${e.message}${extra}`);
  }
  console.error(`\n直してから再実行してください。IDは必ず scripts/new-id.mjs で採番します。`);
  process.exit(1);
}

// ---------- 正規化 ----------
//
// serialize がキー順（スキーマの properties 記載順）・2スペース・末尾改行を担う。
// normalizeSlots はその前に走らせる——答えスロットは oneOf でキー順を導出できず、
// serialize は入力の順をそのまま通すため（下の関数コメントを見よ）

const text = C.serialize(normalizeSlots(data), schema);
const normalized = JSON.parse(text);

// ---------- 整合性検証と集計（Task 5 でここに足す） ----------

const warnings = [];
const actors = normalized.actors ?? [];
const steps = normalized.steps ?? [];

// ---------- 書き出し ----------

if (targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, text, "utf8"); // LF・BOMなし・末尾改行あり
  console.log(`✓ 正規形で書き出しました: ${targetPath}`);
} else {
  const raw = fs.readFileSync(sourcePath, "utf8");
  console.log(`✓ スキーマ検証OK: ${sourcePath}`);
  console.log(raw === text ? "✓ 正規形と一致しています" : "△ 正規形と差があります（--in/--out で書き直せます）");
}
console.log(`  スキーマ: ${schemaPath}`);
console.log(`  参加者: ${actors.length}人 ／ ステップ: ${steps.length}件`);

if (warnings.length) {
  console.log(`\n⚠ 整合性の警告（アプリでは赤表示。ファイルは開けます）`);
  for (const w of warnings) console.log(`  - ${w}`);
}

// ---------- 補助 ----------

/**
 * 答えスロットのキー順を decision → text に固定する。
 *
 * **なぜ serialize だけでは足りないか。** answerSlot はスキーマ上 oneOf なので
 * canonical.ts の deref が properties を持たないノードを返し、decision / text は
 * 「スキーマに無いキー」として**入力の順のまま**出力される。一方アプリは
 * commands.ts の buildAnswerSlot が必ず { decision, text } の順で組む。
 * ここを揃えないと、同じ内容のファイルがバイト列で食い違い、
 * アプリが1回保存しただけで意味の無い diff が出る
 */
function normalizeSlots(root) {
  const slot = (v) => {
    if (!v || typeof v !== "object") return v;
    const out = {};
    if ("decision" in v) out.decision = v.decision;
    if ("text" in v) out.text = v.text;
    return out;
  };
  for (const step of root.steps ?? []) {
    const f = step.failures;
    if (!f || typeof f !== "object") continue;
    if (f.failed !== undefined) f.failed = slot(f.failed);
    if (f.unknown !== undefined) {
      const ife = f.unknown.ifExecuted;
      f.unknown = { ...slot(f.unknown), ...(ife === undefined ? {} : { ifExecuted: slot(ife) }) };
    }
  }
  return root;
}

function readJson(p, label) {
  let raw;
  try { raw = fs.readFileSync(p, "utf8"); } catch { die(2, `${label}が読めません: ${p}`); }
  try { return JSON.parse(C.stripBom(raw)); } catch (e) { die(1, `${label}が JSON として壊れています: ${p}\n  ${e.message}`); }
}

function die(code, msg) {
  console.error(msg);
  process.exit(code);
}
```

**`reorder` / `deref` を書かないこと。** 既存2本の Skill（`glossary-write.mjs` / `error-catalog-write.mjs`）はこの2関数を手で複製しているが、この Skill は `canonical.ts` のコピーを import する。`src/core/canonical.ts` のヘッダは「Skill 側の write スクリプトとバイト単位で同一の出力を返すこと」を要求しており、コピーにすればその要求が構造的に満たされる。

**`normalizeSlots` が要る理由（実測で確認済み）。** `answerSlot` はスキーマ上 `oneOf` なので `canonical.ts` の `deref` は `properties` を持たないノードを返す。その結果 `decision` / `text` は「スキーマに無いキー」として `rest` 側に落ち、**入力に書いた順のまま**出力される。一方アプリは `buildAnswerSlot` が必ず `{ decision, text }` の順で組むので、揃えないと**同じ内容のファイルがバイト列で食い違う**（アプリが1回保存しただけで意味の無い diff が出る）。`unknown` は `properties` を持つ `unknownSlot` なのでキー順が導出できるが、その中の `ifExecuted` は再び `oneOf` なので同じ手当てが要る。

- [ ] **Step 2: ajv を入れる**

Run: `cd .claude/skills/sequence-register && npm install`
Expected: `node_modules/ajv` ができる

- [ ] **Step 3: 正しいファイルで `--check` が通ることを確認する**

まず検証用の一時ファイルを作る（スクラッチに置く。リポジトリに入れない）:

```bash
cat > /tmp/seq-ok.json <<'EOF'
{
  "schemaVersion": 1,
  "type": "sequence",
  "title": "注文確定（在庫あり）",
  "actors": [
    { "id": "actor_Xp2mQ9rT4k", "name": "画面", "domain": "自社" },
    { "id": "actor_Bv7nW3jL8s", "name": "API", "domain": "自社" },
    { "id": "actor_Kd4hR6yU1c", "name": "決済", "domain": "決済会社" }
  ],
  "steps": [
    { "id": "step_Ab3xK9mP2q", "kind": "call", "from": "actor_Xp2mQ9rT4k", "to": "actor_Bv7nW3jL8s", "label": "注文確定", "awaitsReply": true },
    { "id": "step_Cd5yL1nQ4r", "kind": "call", "from": "actor_Bv7nW3jL8s", "to": "actor_Kd4hR6yU1c", "label": "与信依頼", "awaitsReply": true,
      "failures": { "failed": { "decision": "handled", "text": "画面にエラー表示して中断" } } },
    { "id": "step_Ef7zM3pS6t", "kind": "self", "from": "actor_Bv7nW3jL8s", "label": "在庫を引き当てる" }
  ]
}
EOF
cd .claude/skills/sequence-register && node scripts/sequence-write.mjs --check /tmp/seq-ok.json; echo "exit=$?"
```

Expected: `✓ スキーマ検証OK`、`参加者: 3人 ／ ステップ: 3件`、`exit=0`

**正規形の判定は `△ 正規形と差があります` になる。それが正しい。** 上の heredoc は `actors` / `steps` の各要素を1行で書いているが、`serialize` は `JSON.stringify(value, null, 2)` なので入れ子オブジェクトを必ず1キー1行に展開する。単一行で書いた下書きが自分自身の正規形と一致することはない。`--in` / `--out` で書き出したものを `--check` にかければ `✓ 正規形と一致しています` が出る（Step 5 で確認する）。

- [ ] **Step 4: スキーマ違反が終了コード1で落ちることを確認する**

```bash
sed 's/"awaitsReply": true,/ /' /tmp/seq-ok.json > /tmp/seq-ng.json
cd .claude/skills/sequence-register && node scripts/sequence-write.mjs --check /tmp/seq-ng.json; echo "exit=$?"
```

Expected: `✗ スキーマ検証に失敗しました` と `awaitsReply` 必須の指摘、`exit=1`

- [ ] **Step 5: 正規化（キー順の並べ替え）が効くことを確認する**

```bash
node -e "const j=require('/tmp/seq-ok.json'); const o={actors:j.actors, title:j.title, steps:j.steps, type:j.type, schemaVersion:j.schemaVersion}; require('fs').writeFileSync('/tmp/seq-shuffled.json', JSON.stringify(o))"
cd .claude/skills/sequence-register && node scripts/sequence-write.mjs --in /tmp/seq-shuffled.json --out /tmp/seq-out.json && head -4 /tmp/seq-out.json && tail -c 20 /tmp/seq-out.json | xxd | tail -1
```

Expected: 先頭が `{`、次が `"schemaVersion": 1,`、`"type": "sequence",`、`"title": ...` の順。末尾がLF（`0a`）で終わり CR（`0d`）を含まないこと

- [ ] **Step 6: 答えスロットのキー順が decision → text に直ることを確認する**

```bash
node -e "
const j=require('/tmp/seq-ok.json');
j.steps[1].failures={failed:{text:'画面にエラー表示して中断',decision:'handled'},unknown:{ifExecuted:{text:'取引IDで冪等',decision:'handled'},text:'再試行',decision:'handled'}};
require('fs').writeFileSync('/tmp/seq-slotorder.json', JSON.stringify(j,null,2))"
cd .claude/skills/sequence-register && node scripts/sequence-write.mjs --in /tmp/seq-slotorder.json --out /tmp/seq-slotorder-out.json && node -e "
const s=require('fs').readFileSync('/tmp/seq-slotorder-out.json','utf8');
const i=s.indexOf('\"failed\"');
console.log(s.slice(i, i+120));"
```

Expected: `"failed"` の中が `"decision"` → `"text"` の順で出ること（入力は逆順で書いてある）。`ifExecuted` も同様

- [ ] **Step 7: 使い方の誤りが終了コード2で落ちることを確認する**

Run: `cd .claude/skills/sequence-register && node scripts/sequence-write.mjs --check /tmp/seq-ok.json --out /tmp/x.json; echo "exit=$?"`
Expected: `--check は --in/--out と併用できません。`、`exit=2`

- [ ] **Step 8: コミット**

```bash
git add .claude/skills/sequence-register/scripts/sequence-write.mjs
git commit -m "feat(skill): シーケンスの検証と正規形書き出しを追加する"
```

---

### Task 5: `sequence-write.mjs`（整合性検証と未定義の集計）

**Files:**
- Modify: `.claude/skills/sequence-register/scripts/sequence-write.mjs`（Task 4 で「Task 5 でここに足す」と書いた区画）

**Interfaces:**
- Consumes: `Q.poseQuestions(step)` → `{ failed, unknown, ifExecuted }`（boolean）／`Q.unposedAnswers(step)` → `AnswerPath[]`／`Q.readSlot(step, path)` → `{ decision?, text? }`
- Produces: 標準出力の `⚠ 未定義 N ／ ✓ 回答済 N ／ ─ 考慮不要 N` 行と `⚠ 整合性の警告` ブロック。Task 7 の `grade.mjs` はこの出力を読まない（JSON を直接読む）ので、文言の変更は evals を壊さない

- [ ] **Step 1: 整合性検証を書く**

`// ---------- 整合性検証と集計（Task 5 でここに足す） ----------` の区画を、次で置き換える:

```js
// ---------- 整合性検証（レベル2相当。警告にとどめる） ----------
//
// アプリの src/modules/sequence/consistency.ts と同じ5ルールを見る。
// 「立っていない問いへの答え」だけは questions.ts の import で済み、
// 残る4ルール（参照切れ・ID重複・to の過不足・from==to）は構造検査なので
// ここに書く。文言はアプリと揃えてある——ズレると同じ問題が2つの言葉で
// 説明され、ユーザーが別問題だと思う

const warnings = [];
const actors = normalized.actors ?? [];
const steps = normalized.steps ?? [];

const KIND_LABEL = { call: "呼出", reply: "応答", self: "内部処理" };
const PATH_LABEL = { failed: "失敗確定", unknown: "結果不明", ifExecuted: "実行済みだったら" };

/** ステップを人が特定できる呼び名（アプリの stepName と同じ形） */
const stepName = (step, index) =>
  step.label === "" ? `#${index + 1}` : `#${index + 1}（${step.label}）`;

// ID重複（IDは機械的識別子なので正規化しない完全一致）。
// **1つの id につき1件**——出現回数ぶん出さない（アプリの consistency.ts と同じ規則）
for (const [label, items] of [["参加者", actors], ["ステップ", steps]]) {
  const seen = new Map();
  for (const item of items) seen.set(item.id, (seen.get(item.id) ?? 0) + 1);
  for (const [id, count] of seen) {
    if (count > 1) warnings.push(`${label}の ID が重複しています: ${id}`);
  }
}
const actorIds = new Set(actors.map((a) => a.id));

steps.forEach((step, index) => {
  // 参照切れ
  for (const field of ["from", "to"]) {
    const ref = step[field];
    if (ref !== undefined && !actorIds.has(ref)) {
      warnings.push(`${stepName(step, index)} の ${field} が指す参加者が存在しません: ${ref}`);
    }
  }

  // to の過不足
  if (step.kind === "self" && step.to !== undefined) {
    warnings.push(`${stepName(step, index)} は内部処理（self）なのに to を持っています。内部処理は from だけで表します`);
  }
  if (step.kind !== "self" && step.to === undefined) {
    warnings.push(`${stepName(step, index)} は${KIND_LABEL[step.kind]}なのに to（受け手）がありません`);
  }

  // from == to（矢印が引けない。self への変更を促す）。参照切れのときは出さない
  if (step.kind !== "self" && step.to !== undefined && step.to === step.from && actorIds.has(step.from)) {
    warnings.push(
      `${stepName(step, index)} の from と to が同じ参加者を指しています。自分への処理は形を「内部処理」（self）に変えて表します`
    );
  }

  // 立っていない問いへの答え。どの属性のせいで立たないかまで言う
  for (const p of Q.unposedAnswers(step)) {
    const reason =
      step.kind === "reply"
        ? "応答には問いが立ちません（応答の失敗は対の呼出側の「結果不明」が扱います）"
        : step.kind === "self"
          ? "内部処理に立つ問いは「失敗確定」だけです"
          : "awaitsReply: false（投げっぱなし）の呼出に立つ問いは「結果不明」だけです";
    warnings.push(`${stepName(step, index)} に「${PATH_LABEL[p]}」の答えがありますが、${reason}`);
  }
});

// ---------- 未定義の集計（アプリのガターと同一規則） ----------
//
// 数えるのは**立っている問いだけ**。立っていない問いへの答えは上の
// unposed-answer が別に指摘するので、ここには混ぜない（SequenceEditor.tsx の
// tally と同じ扱い）

const tally = { unanswered: 0, handled: 0, notApplicable: 0 };
const unansweredAt = [];
for (const [index, step] of steps.entries()) {
  const posed = Q.poseQuestions(step);
  for (const p of ["failed", "unknown", "ifExecuted"]) {
    if (!posed[p]) continue;
    const decision = Q.readSlot(step, p).decision;
    if (decision === "handled") tally.handled += 1;
    else if (decision === "notApplicable") tally.notApplicable += 1;
    else {
      tally.unanswered += 1;
      unansweredAt.push(`${stepName(step, index)}「${PATH_LABEL[p]}」`);
    }
  }
}
```

- [ ] **Step 2: 集計の出力を足す**

`console.log(\`  参加者: ...\`)` の直後に足す:

```js
console.log(`  ⚠ 未定義 ${tally.unanswered} ／ ✓ 回答済 ${tally.handled} ／ ─ 考慮不要 ${tally.notApplicable}`);
if (unansweredAt.length) console.log(`  未定義の内訳: ${unansweredAt.join("、")}`);
```

- [ ] **Step 3: 集計がアプリと同じ数になることを確認する**

`/tmp/seq-ok.json`（Task 4 Step 3 で作ったもの）の期待値を手で数える:

- `#1（注文確定）` `call` + `awaitsReply: true` → 3問立つ、答え0 → 未定義3
- `#2（与信依頼）` `call` + `awaitsReply: true` → 3問立つ、`failed` が handled → 回答済1・未定義2
- `#3（在庫を引き当てる）` `self` → 1問立つ、答え0 → 未定義1

Run: `cd .claude/skills/sequence-register && node scripts/sequence-write.mjs --check /tmp/seq-ok.json`
Expected: `⚠ 未定義 6 ／ ✓ 回答済 1 ／ ─ 考慮不要 0`

- [ ] **Step 4: 立っていない問いへの答えが警告されることを確認する**

```bash
node -e "
const j=require('/tmp/seq-ok.json');
j.steps[0].awaitsReply=false;
j.steps[0].failures={failed:{decision:'handled',text:'エラー表示'}};
j.steps[2].failures={unknown:{decision:'notApplicable'}};
require('fs').writeFileSync('/tmp/seq-unposed.json', JSON.stringify(j,null,2))"
cd .claude/skills/sequence-register && node scripts/sequence-write.mjs --check /tmp/seq-unposed.json; echo "exit=$?"
```

Expected: 警告2件——`#1（注文確定）に「失敗確定」の答えがありますが、awaitsReply: false（投げっぱなし）の呼出に立つ問いは「結果不明」だけです` と `#3（在庫を引き当てる）に「結果不明」の答えがありますが、内部処理に立つ問いは「失敗確定」だけです`。`exit=0`（警告は書き込みを止めない）

- [ ] **Step 5: 参照切れ・ID重複・`to` の過不足が警告されることを確認する**

```bash
node -e "
const j=require('/tmp/seq-ok.json');
j.steps[0].to='actor_ZZZZZZZZZZ';
j.steps[1].id=j.steps[0].id;
delete j.steps[1].to;
j.steps[2].to='actor_Xp2mQ9rT4k';
require('fs').writeFileSync('/tmp/seq-broken.json', JSON.stringify(j,null,2))"
cd .claude/skills/sequence-register && node scripts/sequence-write.mjs --check /tmp/seq-broken.json
```

Expected: 4件——`#1（注文確定）の to が指す参加者が存在しません: actor_ZZZZZZZZZZ` ／ `ステップの ID が重複しています: step_Ab3xK9mP2q` ／ `#2（与信依頼）は呼出なのに to（受け手）がありません` ／ `#3（在庫を引き当てる）は内部処理（self）なのに to を持っています。内部処理は from だけで表します`

- [ ] **Step 5b: 同じ ID が3回出ても警告は1件であることを確認する**

```bash
node -e "
const j=require('/tmp/seq-ok.json');
j.steps[1].id=j.steps[0].id; j.steps[2].id=j.steps[0].id;
require('fs').writeFileSync('/tmp/seq-dup3.json', JSON.stringify(j,null,2))"
cd .claude/skills/sequence-register && node scripts/sequence-write.mjs --check /tmp/seq-dup3.json | grep -c "ID が重複"
```

Expected: `1`（出現回数ぶん出さない。アプリは id 単位で1件なので、ここがズレると同じファイルで警告数が食い違う）

- [ ] **Step 6: 警告ゼロのファイルで警告が出ないことを確認する（偽陽性の確認）**

```bash
node -e "
const j=require('/tmp/seq-ok.json');
for (const s of j.steps) {
  if (s.kind==='self') s.failures={failed:{decision:'notApplicable'}};
  else s.failures={failed:{decision:'handled',text:'中断'},unknown:{decision:'handled',text:'再試行',ifExecuted:{decision:'handled',text:'取引IDで冪等'}}};
}
require('fs').writeFileSync('/tmp/seq-full.json', JSON.stringify(j,null,2))"
cd .claude/skills/sequence-register && node scripts/sequence-write.mjs --check /tmp/seq-full.json
```

Expected: `⚠ 整合性の警告` ブロックが出ないこと。`⚠ 未定義 0 ／ ✓ 回答済 6 ／ ─ 考慮不要 1`

- [ ] **Step 7: コミット**

```bash
git add .claude/skills/sequence-register/scripts/sequence-write.mjs
git commit -m "feat(skill): シーケンスの整合性検証と未定義の集計を追加する"
```

---

### Task 6: `SKILL.md`

**Files:**
- Create: `.claude/skills/sequence-register/SKILL.md`

**Interfaces:**
- Consumes: Task 3・4・5 のスクリプト（コマンド行を本文に書く）
- Produces: `name: sequence-register` の frontmatter を持つ手順書。Task 7 の evals はこの手順書に従った AI の挙動を採点する

- [ ] **Step 1: `SKILL.md` を書く**

`.claude/skills/sequence-register/SKILL.md`:

````markdown
---
name: sequence-register
description: 仕様整理ツールのシーケンスファイル（type=sequence / schemaVersion 1 の JSON）を、会話の内容から作成・追記・更新する。「シーケンス図を作って」「この流れを図にして」といった依頼のほか、仕様を詰める会話の最後に「じゃあこれで作って」と言われたとき、処理の流れ・登場人物・呼び出し順の整理を頼まれたとき、プロジェクトフォルダに type: sequence の JSON があるとき、「ここで失敗したらどうなる？」の答えを埋めたいときは、明示的に「シーケンス」と言われていなくてもこのSkillを使うこと。IDの採番とスキーマ検証・正規形での書き出しは同梱スクリプトが行うため、手書きでJSONを作らない。
---

# シーケンス登録

仕様整理ツール（Tauri製アプリ）のシーケンスファイルを、会話の内容から組み立てる。

**このSkillが紐づく対象: `type: "sequence"` × `schemaVersion 1`。** スキーマが改訂されたらこのSkillも追従させる（アプリとSkillは別々にバージョン管理される成果物であり、この対応が依存関係の記録）。

**問いの導出（`scripts/questions.ts`）はアプリの `src/modules/sequence/questions.ts` のバイト一致コピーである。手で編集しない。** 直すときはアプリ側を直してコピーし直す（ズレはアプリのユニットテストが検知する）。

**このSkillの材料は既存2本（用語集・エラーカタログ）と違う。** あちらは資料や口頭の1件ずつを構造化するが、こちらは**直前までの会話そのもの**が材料になる。会話には既にAIの発言が混ざっているので、**何が人間の決定で何がAIの推測か**の線引きが最も重要になる。

## 全体の流れ

**2つのフェーズがある。**

| | やること |
| --- | --- |
| **フェーズA：図を起こす** | 会話から `actors` + `steps` を組んで書き出す。`failures` は会話で明示的に決まったものだけ転記 |
| **フェーズB：問いを詰める** | 立っている問いを列挙してまとめて聞き、答えを埋める |

フェーズAは「作って」と言われたら**確認を挟まずに実行する**。フェーズBは書き出した直後に**1回だけ提案する**。

初回のみ、Skillディレクトリで `npm install`（ajv が必要）。`ajv が見つかりません` と言われたら実行する。

## 1. 対象を決める

**シーケンスはプロジェクトに何本あってもよい**（`singleton: false`）。ここが用語集・エラーカタログと構造的に違う。

- **既定は新規作成。** プロジェクト内の `type: "sequence"` を探して追記しない
- **既存への書き足しは、ユーザーが名指ししたときだけ**（「あの注文確定の図の失敗のところ埋めて」）。名指しがなければ新規。手順6へ進む
- ファイル名は `title` 由来。**既存と衝突したら報告して確認する**（勝手に上書きしない）
- **単一性の警告は出さない。** シーケンスが複数本あるのは正常な状態である

**アプリでそのプロジェクトを開いたまま作業しない。** アプリは自動保存でファイルを書き戻すため、同時編集になると片方の変更が消える。作業前に「アプリで開いているなら閉じてください」と一言伝える。

### 主線を1本選ぶ

**1ファイル＝1本の直列シナリオである。** 分岐は書けない（分岐の網羅はロジックツリーの担当）。会話に複数のシナリオが混ざっていたら:

- **会話で最も長く詰められた流れ**を採る。同程度なら**先に通しで語られたほう**
- 残りは**書かない**。報告で「取り寄せの流れも出ていたので、必要なら別ファイルで作ります」と伝える
- どちらを主線にしたかを報告に書く

**勝手に複数ファイルを作らない。** 外れたシナリオを消すのはユーザーの手作業になる。

### `title` を決める

会話から付けて**報告で伝える**（確認は取らない。違えばユーザーがアプリで直せる）。分岐条件があるなら含める——「注文確定（在庫あり）」。`title` はアプリのファイル一覧に出る表示名なので、後から人間が読んで何のシナリオか分かる必要がある。

## 2. 参加者（actors）を組む

`{ id, name, domain? }` の配列。**配列順が図の横の並び（左→右）の正である。** 会話に出てくる順（＝呼び出しの流れの順）に並べるのが自然。

- `name` は会話で使われている呼び方をそのまま使う（「決済API」と言っていたなら「決済API」）
- **`domain`（責任ドメイン）は会話で明示されたものだけ。** 「決済会社の」「外部の」「うちの」と言われていない参加者には**入れない**

`domain` を推測で埋めてはならない理由は具体的である。**隣接する参加者の `domain` が異なる位置に、アプリが責任境界の縦線を描く。** 推測で入れると**存在しない境界が図に現れる**。境界はこのツールの看板（「時系列＋責任境界」）なので、嘘の境界は図の意味そのものを壊す。

## 3. ステップ（steps）を組む

`{ id, kind, from, to?, label, awaitsReply?, failures? }` の配列。**配列順が時系列（上→下）の正である。** 座標も行番号も持たない。

### `kind` と `awaitsReply` の決め方（ここが最も難しい）

**この2つが「立つ問い」を決める。** 取り違えると、ユーザーが答えるべき問いの数が変わる。

| `kind` | 意味 | 図 |
| --- | --- | --- |
| `call` | 呼出 | 実線の矢印。`awaitsReply` が**必須** |
| `reply` | 応答 | 破線の矢印。`to` を持ち、`awaitsReply` は**持たない** |
| `self` | 内部処理 | ライフライン上のボックス。`to` を**持たない** |

守ること:

- **`awaitsReply` は「応答を待つか」であって「応答があるか」ではない。** 同期的に結果を見るなら `true`、投げっぱなし（キュー投入・通知送信・fire-and-forget）なら `false`
- **会話から読めないときは `true`。** 問いを多く立てる安全側に倒れる（アプリの既定も `true`）。ただし**報告で「投げっぱなしかは会話から読めなかったので待つ扱いにした」と明示する**
- **会話で言及されていない `reply` を補わない。** UMLの癖で呼出と応答をペアで書きたくなるが、機械的に補うと**図が倍の長さになり会議で追えなくなる**。「そのあと結果を返す」と会話に出ていれば置く、出ていなければ置かない
- `label` は会話の言葉をそのまま使う。明示的な改行（`\n`）は文言の一部として永続化される

### `failures`（失敗したら？の答え）

**フェーズAで埋めるのは、会話で明示的に決まったものだけ。**

| 状況 | 扱い |
| --- | --- |
| ユーザーが言った（「与信NGなら画面にエラー表示で中断」） | **転記する。** 文言もなるべくそのまま使う |
| AIが提案し、**ユーザーが同意した** | **転記する** |
| AIが提案しただけ／議論に出ていない | **空にする**（キーを置かない） |

**キーの欠落＝未定義**である。欠落キーを補完しない——欠落こそが「まだ決めていない」の表現であり、アプリはそれを warning として可視化する。**AIの推測をユーザーの決定として記録しない。**

**シーケンスには `notes` に相当する欄が無い。** エラーカタログは「なぜ空にしたか」を `notes` に逃がせたが、こちらは逃がせない。**空にした理由はファイルに残らないので、報告文に書くこと。**

スロットの形:

```jsonc
"failures": {
  "failed":  { "decision": "handled", "text": "画面にエラー表示して中断" },
  "unknown": {
    "decision": "handled", "text": "リトライする",
    "ifExecuted": { "decision": "handled", "text": "取引IDで冪等性を担保" }
  }
}
```

`decision` は `handled`（挙動を決めた。`text` 必須）か `notApplicable`（考慮不要と決めた。`text` は任意の理由メモ）。キー順は書き出しスクリプトが `decision` → `text` に直すので、下書きの順は気にしなくてよい。

## 4. ID採番

```
node scripts/new-id.mjs 12               → step_XXXXXXXXXX を12件
node scripts/new-id.mjs 3 --prefix actor → actor_XXXXXXXXXX を3件
```

**IDを自分で書かない。** 必ずこのスクリプトの出力をそのまま使う。連番も禁止（アプリとAIが並行して要素を追加する設計なので、連番は必ず衝突する）。

**既存の `id` は絶対に変更しない。** 不変IDであり、将来 `errorRefs` や `replyTo` がこれを参照する。

## 5. 書き込み

下書きJSONを一時ファイルに書き、スクリプトに渡す。**正規形（キー順・インデント・改行コード）はスクリプトが担保するので、下書きの整形に労力を割かなくてよい。**

**下書きは対象プロジェクトフォルダの外に置く。** 中に置くと、アプリのファイル一覧に下書きが本物として並ぶ。

```
node scripts/sequence-write.mjs --in <下書き.json> --out <プロジェクト>/<タイトル>.json
```

検証だけしたいときは `--check <ファイル>`。終了コードは 0＝成功（警告はあり得る）／1＝スキーマ検証失敗／2＝使い方の誤り。**0 でも未定義の集計と整合性の警告は出ている**ので、終了コードだけを見ず標準出力を読むこと。

スキーマはスクリプトが実行時に探索する（`sequence.schema.json` のコピーは同梱していない。正が2つあると、片方だけ古いまま検証が通ってしまう）。見つからないと言われたら `--schema <path>` か環境変数 `FACET_SEQUENCE_SCHEMA` で指定する。

構造（詳細は `sequence.schema.json` を読む。スキーマが正）:

```json
{
  "schemaVersion": 1,
  "type": "sequence",
  "title": "注文確定（在庫あり）",
  "actors": [
    { "id": "actor_Xp2mQ9rT4k", "name": "画面", "domain": "自社" },
    { "id": "actor_Kd4hR6yU1c", "name": "決済", "domain": "決済会社" }
  ],
  "steps": [
    { "id": "step_Ab3xK9mP2q", "kind": "call", "from": "actor_Xp2mQ9rT4k", "to": "actor_Kd4hR6yU1c", "label": "与信依頼", "awaitsReply": true }
  ]
}
```

用語集・エラーカタログと違い、**全キー常在ではない。** `domain` / `to` / `awaitsReply` / `failures` は条件付きで存在する。

### 警告が出たときの扱いは、出どころで分ける

| 出どころ | 扱い |
| --- | --- |
| **今回このSkillが書いた部分**の警告（立っていない問いへの答え、`self` に `to` がある、参照切れ等） | **自分の書き間違い。直して再実行する**（ユーザーに聞かない） |
| **既存ファイルに元からあった**警告 | **報告して確認する。勝手に直さない**（`kind` 切替の残骸か意図かはユーザーしか判断できない） |

## 6. 報告

スクリプトの出力をそのまま流さず、ユーザーが次に動ける形にして伝える。

- 作ったファイルのパスと `title`
- 参加者とステップ数。**主線以外に見えたシナリオ**があればその旨
- **`awaitsReply` を推測で `true` にしたステップ**（あれば）
- **`failures` を空にした理由**（ファイルに残らないので、ここでしか伝わらない）
- `⚠ 未定義 N ／ ✓ 回答済 N ／ ─ 考慮不要 N`
- 整合性の警告があれば、何が衝突しているかと判断が要る点
- **フェーズBの提案（1回だけ）**

**`⚠ 未定義` が並ぶのは正常である。** 決めていないことを消せなくするのがこのツールの思想であり、未定義はその思想が働いている証拠にほかならない。

## 7. フェーズB（問いを詰める）

書き出した直後に**1回だけ**提案する。

> 「未定義が6件あります。続けて『失敗したら？』も詰めますか？」

**断られたら繰り返さない。既存ファイルを開いて未定義の件数を数えて回らない。** 禁じられているのは催促であって、作業の続きの提案ではない——この線を越えないこと。

進め方:

1. **立っている問いを、アプリのガターと同じ文言で列挙する。** 言い換えない

   | ステップ | 立つ問い |
   | --- | --- |
   | `self` | 処理失敗したら？ |
   | `call` + `awaitsReply: true` | 失敗が確定したら？ ／ 結果不明だったら？ ／ 実行済みだったら？ |
   | `call` + `awaitsReply: false` | 届かなかったかもしれない。それでよいか？ |
   | `reply` | （立たない。応答の失敗は対の呼出側の「結果不明」が扱う） |

2. **まとめて聞く。** ステップ順ではなく「同じ答えになりそうなもの」で束ねる

   ```
   この3件はどれも決済会社への呼出です。落ちたときの扱いは同じですか？
   違うものだけ教えてください。
   ```

   1問1答で往復すると会議が止まる。

3. **答えが出ないものは空のまま。** 3状態（未定義／`handled`／`notApplicable`）の区別を保つ

4. **`notApplicable` はユーザーが「考慮不要」と言ったときだけ。** AIが判断しない——これは**決定の記録**だからである。迷ったら空（未定義）にする

## 8. 既存ファイルへの書き足し

「あの図の失敗のところ埋めて」と言われたときの手順。

1. 既存ファイルを読み、**どのシーケンスか**をユーザーに確定させる（名前が似ているものがあるので勝手に選ばない）
2. 手順7と同じ要領で聞く
3. **既存の JSON 全体を下書きに含め、該当ステップの該当スロットだけを差し替えて**書き出す（新しいIDは採番しない）

**守ること:**

- **`id` を変えない**（不変ID）
- **`actors` / `steps` の配列順を変えない**（配列順＝横の並びと時系列の正本。並べ替えは意味のない diff を生む）
- **`title` を書き換えない**（アプリのファイル一覧に出る表示名。「ついでに」整えると表示名が黙って変わる）
- **触っていないステップを1バイトも変えない**（「ついでに」文章を整えると、Git diff が仕様の変更履歴として読めなくなる）
- 書き出したら `git diff` に出る行が意図した範囲に収まっているかをユーザーに伝える

## やらないこと

- **会話に無い異常系のステップを図に足さない。** 異常系を矢印で描かないのがこのツールの設計の中核である。失敗は「描く」のではなく「問う」
- **`reply` に `failures` を書かない。** 応答に問いは立たない（二重計上になる）
- **問いの類型を増やさない。** 類型はスキーマ固定で、どれが立つかは `kind` × `awaitsReply` から導出される。ユーザーやAIが増やせるようにした瞬間、「問いのセットが完成しているか」をツールが判定できなくなり、網羅の担保が消える
- **原因（エラー応答・接続不能・タイムアウト等）をキーとして列挙しない。** 閉じたものは型に、開いたものは文に——原因の書き分けは答えの `text` の仕事
- **座標・行番号・幅をデータに入れない**
- **1ファイルに分岐を入れない**（`alt` / `opt` 相当のものを `label` で表現しようとしない）
- **MCP的な書き込みツールを作らない。** アプリとの接点はファイルだけ（決定済み。蒸し返さない）
- **既存データの勝手な整形・並べ替え・言い換えをしない**
- **網羅性を主張しない。** 「これで全部の失敗が拾えました」と言わない
- **未定義を催促しない。** フェーズBの提案は書き出し直後に1回だけ
````

- [ ] **Step 2: frontmatter が読めることを確認する**

Run: `head -5 .claude/skills/sequence-register/SKILL.md`
Expected: 1行目が `---`、2行目が `name: sequence-register`

- [ ] **Step 3: 本文のコマンドが実在することを確認する**

Run:
```bash
cd .claude/skills/sequence-register && node scripts/new-id.mjs 1 --prefix actor && node scripts/sequence-write.mjs --check /tmp/seq-ok.json > /dev/null && echo "コマンドOK"
```
Expected: `actor_` のID 1行と `コマンドOK`

- [ ] **Step 4: コミット**

```bash
git add .claude/skills/sequence-register/SKILL.md
git commit -m "feat(skill): シーケンス登録 Skill の手順書を書く"
```

---

### Task 7: evals（＋用語集版 `grade.mjs` の揃え直し）

**Files:**
- Create: `.claude/skills/sequence-register/evals/evals.json`
- Create: `.claude/skills/sequence-register/evals/grade.mjs`
- Create: `.claude/skills/sequence-register/evals/fixtures/existing-project/注文確定.json`
- Modify: `.claude/skills/glossary-term-register/evals/grade.mjs:10-11`

**Interfaces:**
- Consumes: Task 4・5 の `sequence-write.mjs`（`--check` を実行して正規形を確かめる）
- Produces: `node evals/grade.mjs <iteration-dir>` が各 run ディレクトリに `grading.json` を書く

- [ ] **Step 1: fixture を作る**

`.claude/skills/sequence-register/evals/fixtures/existing-project/注文確定.json`（**正規形で。末尾に改行1つ、LF**）:

```json
{
  "schemaVersion": 1,
  "type": "sequence",
  "title": "注文確定（在庫あり）",
  "actors": [
    {
      "id": "actor_Xp2mQ9rT4k",
      "name": "画面",
      "domain": "自社"
    },
    {
      "id": "actor_Bv7nW3jL8s",
      "name": "受注API",
      "domain": "自社"
    },
    {
      "id": "actor_Kd4hR6yU1c",
      "name": "決済サービス",
      "domain": "決済会社"
    }
  ],
  "steps": [
    {
      "id": "step_Ab3xK9mP2q",
      "kind": "call",
      "from": "actor_Xp2mQ9rT4k",
      "to": "actor_Bv7nW3jL8s",
      "label": "注文を確定する",
      "awaitsReply": true
    },
    {
      "id": "step_Cd5yL1nQ4r",
      "kind": "call",
      "from": "actor_Bv7nW3jL8s",
      "to": "actor_Kd4hR6yU1c",
      "label": "与信を依頼する",
      "awaitsReply": true,
      "failures": {
        "failed": {
          "decision": "handled",
          "text": "画面にエラー表示して中断"
        }
      }
    },
    {
      "id": "step_Ef7zM3pS6t",
      "kind": "self",
      "from": "actor_Bv7nW3jL8s",
      "label": "在庫を引き当てる"
    }
  ]
}
```

作ったら正規形であることを確かめる:

Run: `cd .claude/skills/sequence-register && node scripts/sequence-write.mjs --check evals/fixtures/existing-project/注文確定.json`
Expected: `✓ 正規形と一致しています`（一致しないと出たら `--in`/`--out` で自身に書き直す）

- [ ] **Step 2: `evals.json` を書く**

`.claude/skills/sequence-register/evals/evals.json`:

```json
{
  "skill_name": "sequence-register",
  "evals": [
    {
      "id": 0,
      "name": "new-sequence-from-conversation",
      "prompt": "注文確定まわりの流れを整理していました。画面から受注APIに注文確定を投げて、受注APIが決済サービスに与信を依頼します。与信がNGだったら画面にエラーを出して中断、という話までしました。そのあと受注APIが在庫を引き当てます。じゃあこれでシーケンス図作ってもらえますか。プロジェクトフォルダは <PROJECT_DIR> です。",
      "expected_output": "<PROJECT_DIR> に type=sequence の JSON が1つ作られる。actors が3人（画面・受注API・決済サービス）、steps は会話に出た3件のみ（言及されていない reply を補っていない）。与信のステップに failures.failed が handled で入り、他のステップの failures は欠落したまま（AIが推測で埋めない）。ID は actor_ / step_ ＋英数字10文字。ファイルは正規形（キー順・LF・末尾改行）。",
      "files": []
    },
    {
      "id": 1,
      "name": "pick-main-line-from-branching-talk",
      "prompt": "在庫確認の流れを整理しました。画面から在庫APIに問い合わせて、在庫があれば受注APIで注文を確定します。在庫が無い場合は仕入先に取り寄せ依頼を出して、入荷したら顧客に通知する、という別の流れになります。図にしておいてください。プロジェクトフォルダは <PROJECT_DIR> です。",
      "expected_output": "type=sequence の JSON が1つだけ作られる（2つ作らない）。書かれたのは主線1本で、取り寄せの流れが同じファイルに混ざっていない。取り寄せの流れについては報告で「別ファイルで作れる」と伝えている。",
      "files": []
    },
    {
      "id": 2,
      "name": "fill-in-existing-sequence",
      "prompt": "<PROJECT_DIR> の注文確定の図について、与信依頼が応答なしでタイムアウトしたときの扱いが決まりました。リトライします。そのとき相手が実行済みだった場合は取引IDで冪等性を担保します。在庫引き当ての失敗については、今回は考えなくていいと決めました。",
      "expected_output": "既存の 注文確定.json が更新される（2つ目のファイルを作らない）。step_Cd5yL1nQ4r の failures.unknown が handled＋text で埋まり、その中に ifExecuted が handled で入る。step_Ef7zM3pS6t の failures.failed が notApplicable になる。既存の failed（画面にエラー表示して中断）と、すべての id・配列順・title・step_Ab3xK9mP2q が1バイトも変わらない。",
      "files": ["fixtures/existing-project/注文確定.json"]
    },
    {
      "id": 3,
      "name": "avoid-unposed-answers",
      "prompt": "監査ログの流れです。受注APIがログ基盤にイベントを投げます。これは投げっぱなしで応答は見ません。ログ基盤が受け取れなかった場合は、業務は止めずに続行します。図にしてください。プロジェクトフォルダは <PROJECT_DIR> です。",
      "expected_output": "type=sequence の JSON が1つ作られる。投げっぱなしのステップは awaitsReply: false になっている。そのステップの failures に failed キーが無い（awaitsReply: false では失敗確定の問いが立たない）。答えは unknown 側に入っている。sequence-write.mjs の整合性検証で unposed-answer の警告が出ない。",
      "files": []
    }
  ]
}
```

- [ ] **Step 3: `grade.mjs` を書く**

`.claude/skills/sequence-register/evals/grade.mjs`:

```js
// テストケースの機械判定。
// 使い方: node evals/grade.mjs <iteration-dir>
// 各 run ディレクトリに grading.json を書き出す。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ITER = path.resolve(process.argv[2] ?? ".");
const SKILL = path.resolve(fileURLToPath(import.meta.url), "../..");
const SCHEMA = path.resolve(SKILL, "../../../schemas/sequence.schema.json");
const ACTOR_RE = /^actor_[A-Za-z0-9]{10}$/;
const STEP_RE = /^step_[A-Za-z0-9]{10}$/;

function sequenceFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
      if (!e.name.toLowerCase().endsWith(".json")) continue;
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
        if (j?.type === "sequence") out.push({ path: p, json: j });
      } catch { /* 壊れたJSONはシーケンスとして数えない */ }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

/** スキーマ検証・正規形・整合性の警告をスクリプトから取る */
function inspect(file) {
  try {
    const out = execFileSync("node", [path.join(SKILL, "scripts/sequence-write.mjs"), "--check", file, "--schema", SCHEMA], { encoding: "utf8" });
    return { schemaOk: true, canonicalOk: out.includes("正規形と一致"), warned: out.includes("整合性の警告"), out };
  } catch {
    return { schemaOk: false, canonicalOk: false, warned: true, out: "" };
  }
}

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(SKILL, "evals/fixtures/existing-project", name), "utf8"));
}

const stepById = (steps, id) => steps.find((s) => s.id === id);

function assertionsFor(evalId, dir) {
  const files = sequenceFiles(dir);
  const A = [];
  const push = (text, passed, evidence) => A.push({ text, passed: !!passed, evidence: String(evidence) });

  push("type=sequence の JSON がちょうど1つ作られている",
    files.length === 1, files.length ? files.map((f) => path.basename(f.path)).join(", ") : "ファイルなし");

  const f = files[0];
  if (!f) {
    push("スキーマ検証を通り正規形と一致する", false, "ファイルなし");
    return A;
  }

  const ins = inspect(f.path);
  push("スキーマ検証を通る", ins.schemaOk, ins.schemaOk ? "OK" : "検証失敗");
  push("正規形と一致する（キー順・LF・末尾改行）", ins.canonicalOk, ins.canonicalOk ? "OK" : "差あり");

  const actors = f.json.actors ?? [];
  const steps = f.json.steps ?? [];
  push("すべての actor id が actor_ + 英数字10文字",
    actors.length > 0 && actors.every((a) => ACTOR_RE.test(a.id)), actors.map((a) => a.id).join(", ") || "なし");
  push("すべての step id が step_ + 英数字10文字",
    steps.length > 0 && steps.every((s) => STEP_RE.test(s.id)), steps.map((s) => s.id).join(", ") || "なし");

  if (evalId === 0) {
    push("参加者が3人（画面・受注API・決済サービス相当）",
      actors.length === 3, actors.map((a) => a.name).join("、"));
    push("ステップが3件（言及されていない reply を補っていない）",
      steps.length === 3, `${steps.length}件: ${steps.map((s) => `${s.kind}:${s.label}`).join(" / ")}`);
    push("kind: reply のステップが無い",
      steps.every((s) => s.kind !== "reply"), steps.map((s) => s.kind).join(", "));
    const credit = steps.find((s) => s.kind === "call" && /与信/.test(s.label ?? ""));
    push("与信のステップに failures.failed が handled で入っている",
      credit?.failures?.failed?.decision === "handled", JSON.stringify(credit?.failures ?? null));
    const others = steps.filter((s) => s !== credit);
    push("他のステップの failures が欠落したまま（推測で埋めていない）",
      others.every((s) => s.failures === undefined), others.map((s) => `${s.label}:${s.failures ? "あり" : "なし"}`).join(", "));
    push("内部処理（self）のステップが to を持たない",
      steps.filter((s) => s.kind === "self").every((s) => s.to === undefined),
      steps.filter((s) => s.kind === "self").map((s) => s.to ?? "to無し").join(", ") || "self無し");
  }

  if (evalId === 1) {
    push("取り寄せ・入荷・通知のステップが混ざっていない（主線1本）",
      !steps.some((s) => /取り寄せ|仕入|入荷|通知/.test(s.label ?? "")),
      steps.map((s) => s.label).join(" / "));
    push("ステップ数が主線の規模に収まっている（8件以下）",
      steps.length <= 8, `${steps.length}件`);
  }

  if (evalId === 2) {
    const before = readFixture("注文確定.json");
    push("title が変わっていない", f.json.title === before.title, `${before.title} → ${f.json.title}`);
    push("actors が1バイトも変わっていない",
      JSON.stringify(f.json.actors) === JSON.stringify(before.actors), JSON.stringify(f.json.actors));
    push("steps の id と並び順が変わっていない",
      JSON.stringify(steps.map((s) => s.id)) === JSON.stringify(before.steps.map((s) => s.id)),
      steps.map((s) => s.id).join(", "));

    const credit = stepById(steps, "step_Cd5yL1nQ4r");
    push("与信の unknown が handled で text が入っている",
      credit?.failures?.unknown?.decision === "handled" && (credit?.failures?.unknown?.text ?? "") !== "",
      JSON.stringify(credit?.failures?.unknown ?? null));
    push("与信の ifExecuted が handled で text が入っている",
      credit?.failures?.unknown?.ifExecuted?.decision === "handled" && (credit?.failures?.unknown?.ifExecuted?.text ?? "") !== "",
      JSON.stringify(credit?.failures?.unknown?.ifExecuted ?? null));
    push("与信の既存の failed が変わっていない",
      JSON.stringify(credit?.failures?.failed) === JSON.stringify(before.steps[1].failures.failed),
      JSON.stringify(credit?.failures?.failed ?? null));

    const stock = stepById(steps, "step_Ef7zM3pS6t");
    push("在庫引き当ての failed が notApplicable になっている",
      stock?.failures?.failed?.decision === "notApplicable", JSON.stringify(stock?.failures ?? null));

    const first = stepById(steps, "step_Ab3xK9mP2q");
    push("触っていないステップ（注文を確定する）が1バイトも変わっていない",
      JSON.stringify(first) === JSON.stringify(before.steps[0]), JSON.stringify(first));
  }

  if (evalId === 3) {
    const fire = steps.find((s) => s.kind === "call" && s.awaitsReply === false);
    push("投げっぱなしのステップが awaitsReply: false になっている",
      fire !== undefined, steps.map((s) => `${s.kind}:${s.awaitsReply}`).join(", "));
    push("そのステップに failed キーが無い（立たない問いに答えていない）",
      fire !== undefined && fire.failures?.failed === undefined, JSON.stringify(fire?.failures ?? null));
    push("答えが unknown 側に入っている",
      fire?.failures?.unknown?.decision !== undefined, JSON.stringify(fire?.failures?.unknown ?? null));
    push("整合性の警告が出ない", !ins.warned, ins.warned ? ins.out : "警告なし");
  }

  return A;
}

// ---- run ディレクトリを回って grading.json を書く ----

for (const entry of fs.readdirSync(ITER, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const runDir = path.join(ITER, entry.name);
  const m = /(\d+)/.exec(entry.name);
  if (!m) continue;
  const evalId = Number(m[1]);
  const assertions = assertionsFor(evalId, runDir);
  const passed = assertions.filter((a) => a.passed).length;
  fs.writeFileSync(
    path.join(runDir, "grading.json"),
    JSON.stringify({ eval_id: evalId, passed, total: assertions.length, assertions }, null, 2) + "\n",
    "utf8"
  );
  console.log(`${entry.name}: ${passed}/${assertions.length}`);
}
```

- [ ] **Step 4: `grade.mjs` が worktree から動くことを確認する**

```bash
mkdir -p /tmp/seq-iter/run-0 && cp /tmp/seq-ok.json /tmp/seq-iter/run-0/注文確定.json
cd .claude/skills/sequence-register && node evals/grade.mjs /tmp/seq-iter && cat /tmp/seq-iter/run-0/grading.json | head -20
```

Expected: `run-0: N/M` が出力され、`grading.json` が書かれる。**絶対パスの決め打ちが無いので worktree でも動くこと**が確認できる（`SCHEMA` が解決できずに全件 fail するなら、`SKILL` からの相対段数を見直す）

- [ ] **Step 5: 用語集版 `grade.mjs` の自己位置解決を揃える（open-issues #81）**

`.claude/skills/glossary-term-register/evals/grade.mjs` の 10〜11 行目:

```js
const SKILL = path.resolve("C:/Dev/Projects/facet/.claude/skills/glossary-term-register");
const SCHEMA = "C:/Dev/Projects/facet/schemas/glossary.schema.json";
```

を次に置き換える（あわせて `import { fileURLToPath } from "node:url";` を import 群に足す）:

```js
const SKILL = path.resolve(fileURLToPath(import.meta.url), "../..");
const SCHEMA = path.resolve(SKILL, "../../../schemas/glossary.schema.json");
```

- [ ] **Step 6: 用語集版が worktree で動くことを確認する**

```bash
mkdir -p /tmp/glo-iter/run-0
cp .claude/skills/glossary-term-register/evals/fixtures/*/*.json /tmp/glo-iter/run-0/ 2>/dev/null || true
cd .claude/skills/glossary-term-register && node evals/grade.mjs /tmp/glo-iter && cat /tmp/glo-iter/run-0/grading.json | head -10
```

Expected: `run-0: N/M` が出力される。**「スキーマが見つかりません」で全件 fail しないこと**（絶対パス依存が消えたことの確認）

- [ ] **Step 7: 3本の `grade.mjs` が同じ形になったことを確認する**

Run: `grep -n "const SKILL\|const SCHEMA" .claude/skills/*/evals/grade.mjs`
Expected: 2本とも `fileURLToPath(import.meta.url)` 起点（`sequence-register` を含めて3本）。`C:/Dev` が1件も出ないこと

- [ ] **Step 8: コミット**

```bash
git add .claude/skills/sequence-register/evals .claude/skills/glossary-term-register/evals/grade.mjs
git commit -m "feat(skill): シーケンス登録 Skill の evals を追加し、grade.mjs の自己位置解決を3本で揃える"
```

---

### Task 8: 同梱の登録

**Files:**
- Modify: `src/core/skill-sync.ts:11-18`
- Modify: `src/core/skill-sync.test.ts`（末尾に追記）

**Interfaces:**
- Consumes: Task 2〜7 の Skill 一式
- Produces: `BUNDLED_SKILLS` に `'sequence-register'` が含まれる

- [ ] **Step 1: 失敗するテストを書く**

`src/core/skill-sync.test.ts` の末尾に足す（冒頭の import に `BUNDLED_SKILLS` を加えること）:

```ts
describe('BUNDLED_SKILLS', () => {
  it('ユーザーのデータを作る Skill が3本とも載っている', () => {
    // アプリが置き直さない Skill は、プロジェクトフォルダで claude を起動した
    // ユーザーには存在しない。ここから漏れると Skill が黙って使えなくなる
    expect([...BUNDLED_SKILLS]).toEqual([
      'glossary-term-register',
      'error-catalog-register',
      'sequence-register',
    ])
  })

  it('アプリ自身のソースを触る Skill は載せない（palette-retheme）', () => {
    // 配色差し替えは facet リポジトリで動かすもので、ユーザーのプロジェクトには不要
    expect(BUNDLED_SKILLS).not.toContain('palette-retheme')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/core/skill-sync.test.ts`
Expected: FAIL（1件目。`sequence-register` が無い）

- [ ] **Step 3: `BUNDLED_SKILLS` に足し、古いコメントを直す**

`src/core/skill-sync.ts:11-18` を次に置き換える:

```ts
/**
 * アプリに同梱する Skill（ユーザーのデータを作るもの）。
 *
 * `src-tauri/tauri.conf.json` の `bundle.resources` は
 * `".claude/skills": "skills"` とディレクトリごと同梱しているので、
 * **Skill を増やしてもそちらの追従は要らない。ここに1行足すだけでよい。**
 *
 * ここに載せない Skill（`palette-retheme` など facet 自身のソースを触るもの）は
 * ユーザーのプロジェクトフォルダには置かれない
 */
export const BUNDLED_SKILLS: readonly string[] = [
  'glossary-term-register',
  'error-catalog-register',
  'sequence-register',
]
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/core/skill-sync.test.ts`
Expected: PASS

- [ ] **Step 5: `evals/` と `package.json` が同梱対象外であることを確認する**

Run: `npx vitest run src/core/skill-sync.test.ts -t shouldSyncSkillFile`
Expected: PASS（既存テストが `evals/` と `package.json` の除外を固定している。新しい Skill もこの規則に乗る）

- [ ] **Step 6: 全体を通す**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑

- [ ] **Step 7: コミット**

```bash
git add src/core/skill-sync.ts src/core/skill-sync.test.ts
git commit -m "feat(core): シーケンス登録 Skill を同梱対象に加える"
```

---

### Task 9: 実機確認（人間の作業）

**このタスクは人間が行う。** AI は手順を提示して結果を待つ。

**Files:** なし（`sample-project/` の変更はコミットしない）

- [ ] **Step 1: アプリを起動して Skill が置かれることを確認する**

```bash
npm run tauri dev
```

アプリで `sample-project/` を開き、別ターミナルで:

Run: `ls sample-project/.claude/skills/`
Expected: `glossary-term-register` / `error-catalog-register` / `sequence-register` の3本。`sequence-register/` の中に `SKILL.md` と `scripts/`（`questions.ts` を含む）があり、`evals/` と `package.json` が**無い**こと

- [ ] **Step 2: プロジェクトフォルダから Skill が動くことを確認する**

`sample-project/` を作業ディレクトリにして claude を起動し、次のように話しかける:

> 画面から受注APIに注文確定を投げて、受注APIが決済サービスに与信を依頼します。与信NGなら画面にエラーを出して中断です。じゃあこれでシーケンス図作って。

Expected: `sample-project/` に `type: "sequence"` の JSON ができ、報告に未定義の集計とフェーズBの提案（1回）が含まれる

- [ ] **Step 3: アプリで開けることを確認する**

アプリのファイル一覧に作られたシーケンスが現れ、開くと図が描かれ、ガターに未定義の warning が出ること。集計バッジの数字が**スクリプトの報告と一致する**こと（ここがズレたら集計規則の複製に誤りがある）

- [ ] **Step 4: 痕跡を捨てる**

```bash
git checkout -- sample-project/ && git clean -fd sample-project/
git status --short
```
Expected: `sample-project/` に関する行が無いこと

---

### Task 10: ドキュメント反映と申し送り

**Files:**
- Modify: `docs/README.md`（「リポジトリ内の他の『正』」節）
- Modify: `docs/open-issues.md`（#80 に併記、#81 を削除）
- Modify: `docs/sequence/sequence-design-notes.md`（論点12 の表）
- Create: `docs/history/sequence-m4-register-skill.md`

- [ ] **Step 1: `docs/README.md` を直す**

「リポジトリ内の他の『正』」節の `.claude/skills/` の行を次に置き換える:

```markdown
- `.claude/skills/` — AI 側の実装。**2種類ある**——ユーザーのデータを作るもの（用語集・エラーカタログ・シーケンス。アプリと**正規形が完全一致**していなければならない。`src/core/skill-sync.ts` の `BUNDLED_SKILLS` に載り、プロジェクトフォルダへコピーされる）と、アプリ自身のソースを触るもの（`palette-retheme`。配色の差し替え。同梱しない）
```

- [ ] **Step 2: `docs/open-issues.md` の #80 に併記する**

`palette-fit.mjs` の項目（`- **`palette-fit.mjs` が Node の型ストリップに依存している**` で始まる行）の末尾、`[Skill]` の直前に次を足す:

```markdown
**同じ依存が `sequence-register` にもある**（`.claude/skills/sequence-register/scripts/sequence-write.mjs` が同ディレクトリの `questions.ts` を import する）。ただしこちらはコピーがアプリの `src/modules/sequence/questions.ts` とバイト一致していることを `src/modules/sequence/skill-copy.test.ts` が検査しており、**消去できない構文が生えたらテストが赤くなる**（`palette-fit.mjs` 側にはこの検査が無い）。
```

- [ ] **Step 3: `docs/open-issues.md` の #81 を消す**

`- **2本の Skill の `evals/grade.mjs` で自己位置解決の形が揃っていない**` で始まる項目を**行ごと削除する**（`sequence-m4` で3本とも `import.meta.url` 起点に揃えたため）。

- [ ] **Step 4: `docs/sequence/sequence-design-notes.md` 論点12 の表に足す**

`| **sequence M3** | ... |` の行の直後に足す:

```markdown
| **sequence M4** | シーケンス登録 Skill（会話→ JSON。`questions.ts` のバイト一致コピーを同梱） | 済（2026-08-12）。経緯は [`../history/sequence-m4-register-skill.md`](../history/sequence-m4-register-skill.md) |
```

あわせて `| M4+ |` の行を `| M5+ |` に改める（ゾーン以降の採番がずれるため）。

- [ ] **Step 5: 申し送りを書く**

`docs/history/sequence-m4-register-skill.md` を新規作成する。**そのとき何が起きたかの記録**であり、以後書き換えない。次を含めること:

- 設計スペックと計画へのリンク
- **実装で確定した事項**: 同梱 Skill は `src/` を直接 import できない（`skill-sync.ts` がプロジェクトフォルダへコピーするため）／バイト一致コピー＋機械検査という解法／`readSlot` を `questions.ts` へ集約した経緯（4本目の複製を作らないため）
- **見つかった欠陥**: `skill-sync.ts` のコメントが `bundle.resources` の実態（ディレクトリごと同梱）より古かった
- **実機確認の結果**（Task 9 で得たもの）
- **繰り越し**: 既存2本の Skill（`glossary-write.mjs` / `error-catalog-write.mjs`）が `reorder` / `deref` を手で複製したままであること（`sequence-register` は `canonical.ts` のコピーに寄せた。次にあの2本へ触る機会に揃える）／`sequence` スキーマに `notes` 相当が無く、`failures` を空にした理由がファイルに残らないこと

- [ ] **Step 6: open-issues に繰り越しを足す**

Step 5 で挙げた繰り越し2件を `docs/open-issues.md` に足す（`[sequence-m4]` タグを付ける）。**申し送りに書いただけで open-issues に足さないと、残件が静かに消える。**

- [ ] **Step 7: 反映漏れが無いか確認する**

Run: `grep -rn "grade.mjs で自己位置解決\|C:/Dev/Projects" docs/ .claude/skills/`
Expected: 1件も出ないこと（#81 の記述と絶対パスが両方消えている）

- [ ] **Step 8: 最終確認**

Run: `npm test && npx tsc -b && npm run lint && git status --short`
Expected: すべて緑。`git status --short` が空（`sample-project/` の痕跡が残っていない）

- [ ] **Step 9: コミット**

```bash
git add docs/
git commit -m "docs(sequence-m4): 登録 Skill の完了を反映し、申し送りを書く"
```

---

## 自己レビュー結果

**スペック網羅**: 設計スペックの全節に対応タスクがある——2フェーズ（Task 6）／ファイルの扱い（Task 6 手順1）／同梱スクリプト（Task 2〜5）／SKILL.md の規律（Task 6）／evals と #81（Task 7）／ユニットテスト（Task 2・8）／ドキュメント反映（Task 10）／完了条件6項目（Task 9・10 Step 8）。

**スペックから増えた1件**: `from == to`（`self-call`）の警告を Task 5 に入れた。スペックの表には無いが `src/modules/sequence/consistency.ts` が持つ5つ目のルールで、除くとアプリと警告の数が食い違う。

**スペックから増えたもう1件**: Task 1（`readSlot` の集約）。スペックは集計に `readSlot` 相当が要ることを明示していなかった。`commands.ts` のコメントが「4本目を作らないため」と警告しているため、複製ではなく移動を選んだ。

**スペックから増えた3件目**: `normalizeSlots`（Task 4）。`answerSlot` が `oneOf` のためキー順が導出できず、答えスロットのキー順が入力のまま残ることを実測で確認した。アプリは常に `decision` → `text` の順で書くので、揃えないと同じ内容のファイルがバイト列で食い違う。

**スペックから増えた4件目**: `canonical.ts` のバイト一致コピー（Task 2・4）。当初は `reorder` / `deref` を既存2本の Skill から手で複製する計画だったが、`src/core/canonical.ts` が import を1つも持たず Node から直接読めることを実測で確認した。同ファイルのヘッダが既に「Skill 側の write スクリプトとバイト単位で同一の出力を返すこと」を要求しているため、コピーにすればその要求が構造的に満たされる。実行前のスキャンで人間に諮って決めた。

**型の一貫性**: `readSlot(step, path)` の戻り値 `{ decision?, text? }` を Task 1 で定義し、Task 5 の集計（`Q.readSlot(step, p).decision`）が同じ形で使っている。`Q.poseQuestions` の戻り値のキー（`failed` / `unknown` / `ifExecuted`）は Task 5 のループの配列リテラルと `PATH_LABEL` のキーに一致している。`unposedAnswers` の戻り値も同じ3語。

**実行前のスキャンで直した自分の誤り2件**: (1) Task 1 は「`commands.ts` の import 行は触らない」と書いていたが、`commands.ts:360` が `readSlot` を内部で使っているので値 import が要る。(2) 後方互換の再輸出を置く指示があったが、Task 6 で `markdown.ts` が `./questions` を直接見るようになるため死んだコードになる。どちらも削除・訂正済み。

**未解決の前提が1つある**: Task 7 Step 4 の `SCHEMA` は `path.resolve(SKILL, "../../../schemas/sequence.schema.json")` で、`.claude/skills/<名前>/` からリポジトリ直下まで3段上がる想定である。エラーカタログ版と同じ段数だが、**実行して確かめること**（解決できないと全件 fail する）。
