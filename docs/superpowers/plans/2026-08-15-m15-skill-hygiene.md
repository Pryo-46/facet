# M15 Skill の衛生 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同梱 Skill とアプリの複製・同期にある既知の欠陥5件を塞ぐ——(1) エラーカタログ Skill の警告文言・計上規則が既にアプリとズレている実害、(2) 登録3 Skill の書き出しスクリプトを実行するテストの不在、(3) `readBundled` が `node_modules` まで全読みする経路、(4) `.gitignore` を同期できない fs scope の穴と `package-lock.json` の消失、(5) 旧2 Skill の `reorder`/`deref` 手複製。

**Architecture:** 縛りの中心は**実行 smoke テスト**——各 Skill の `*-write.mjs --check` を実際に spawn し、その stdout にアプリの `checkXxxConsistency` が返す message が**逐語で**現れることを検査する（`src/styles/palette-fit.smoke.test.ts` と同型）。これで「文言の追従」と「実行テストの不在」が1つの仕組みで塞がる。正規形の書き出し（`reorder`/`deref`）は sequence-register で確立済みの**バイト一致コピー＋一致検査**方式へ旧2 Skill を揃える。fs 側は `collect()` の `node_modules` スキップ（TS・純関数で判定）と `allow_skill_dir` の literal 許可（Rust）の2点。

**Tech Stack:** vitest（`execFileSync` による spawn テスト）／ Node の型ストリップ（`.mjs` から `.ts` を import。検証済みは v22.20.0）／ Tauri v2 `tauri-plugin-fs` の `FsScope`。**新規依存は無し**（`ajv` はリポジトリ root の `dependencies` に既にある）。

**Spec:** 別ファイルの spec は無い。対象は [`docs/open-issues.md`](../../open-issues.md)（2026-08-15 の棚卸し版。**ブランチ `docs-open-issues-inventory` にあり、本計画の Task 8 までに main へマージされている前提**）の「次に手を付ける候補」1〜4番＋「小さな負債」の `reorder`/`deref` 複製の項。経緯の一次資料は [`docs/history/sequence-m4-register-skill.md`](../../history/sequence-m4-register-skill.md)。

## Global Constraints

- **一致が要件そのものである文言をパラフレーズしない**（`docs/lessons-for-planning.md` の教訓）。警告文言の正は `src/modules/glossary/consistency.ts`・`src/modules/error-catalog/consistency.ts`・`src/modules/sequence/consistency.ts`。**本計画に引用した文言が実物と食い違っていたら実物が正**であり、「計画の矛盾」として報告すること
- 計画のコードは検証済みの正ではない。矛盾・不整合を見つけたら辻褄を合わせず報告する
- 各タスクの最後に `npm test && npx tsc -b && npm run lint` を**全体で**回し、緑を確認してからコミットする（対象を絞らない）
- smoke テストの fixture は**スキーマ検証を通る形**にする（`--check` は整合性検証の前にスキーマ検証で die する）。ID はパターン固定（`term_`/`error_`/`actor_`/`step_` ＋英数字10文字）
- スクリプトの `ajv` は `createRequire` がリポジトリ root の `node_modules`（`ajv: ^8.20.0`）まで辿って解決するので、**Skill ディレクトリへの `npm install` は不要**（このリポジトリで回す限り）
- テストの件数を書かない。期待値は「このファイルの `it` がすべて緑」
- `.claude/skills/` 配下の変更は同期で利用者へ配られる成果物。コメントの密度・文体は既存に合わせる

## 確定した設計判断

| # | 判断 | 理由 |
| --- | --- | --- |
| 1 | 文言一致の契約は「アプリの `checkXxxConsistency` が返す `message` が、スクリプトの `--check` stdout に**逐語で（部分文字列として）現れる**」とし、実行 smoke テストで縛る | `consistency.ts` は値 import 4本＋ `@/` エイリアスを持ち、バイト一致コピー方式が使えない（着手前スキャンで実測）。出力の突き合わせなら複製の内部構造に依存しない。スクリプト側が接頭辞や独自警告（単一性違反・`.gitattributes`）を足すのは妨げない |
| 2 | 重複系の計上規則はアプリと同じ「**グループごとに1件**」へ揃える | 現行スクリプトは「2件目以降の出現ごとに1件」。同じ事実の件数が食い違い、別問題に見える |
| 3 | glossary スクリプトの `fold` は `normalizeForMatch` と同規則（NFKC → trim → toLowerCase）にする | 現行は trim が無く、末尾空白で重複判定をすり抜ける。規則の正は `src/core/normalize.ts`（「name 重複判定と alias 照合はこの同じ規則を使うこと」と明記されている） |
| 4 | `reorder`/`deref` は `src/core/canonical.ts` のバイト一致コピー＋一致検査へ（sequence-register 方式） | `canonical.ts` は import が1本も無い（実測）。手複製とバイト一致コピーは、ズレたときに赤くなるかで質が違う（教訓） |
| 5 | 旧2 Skill の Node 要件は sequence-register と同じ「型ストリップが unflagged な Node（22.18+ / 23.6+ / 24+）」へ上がる。SKILL.md に明記する | `.mjs` から `.ts` を import するため。3本で要件が割れている方が説明コストが高い |
| 6 | `collect()` は `node_modules` を降りない。判定 `shouldDescendSkillDir` は `src/core/skill-sync.ts` の純関数として置く | `src/fs/skill-resources.ts` は Tauri IO 直結でユニットテストできない。判定だけ純関数層に置けばテストで縛れる |
| 7 | `bundle.resources` からの `node_modules` 除外は、tauri-bundler の**実物**が resources のパターン除外を持つか確かめてから決める。持たなければ見送り（collect 側の skip で実行時の性能・throw は両方消える） | ライブラリの仕様は実物で確かめる（教訓）。ビルド成果物の肥大は「ビルドマシンが Skill ディレクトリで `npm install` 済み」のときしか起きない |
| 8 | `allow_skill_dir` に `skills` 引数を足し、各 Skill の `.gitignore` を `allow_file` で literal 許可する | glob の `require_literal_leading_dot` は unix で `true` が既定、`**` はドット始まりの要素に一致しない（M11・sequence M4 で二度実測）。literal 指定だけが判定を通る |
| 9 | `.gitignore` を同期対象へ戻し、`package-lock.json` を削除保護へ足す | 「同期に戻してはならない」（`skill-sync.ts` のコメント）は scope 未修正が前提。前提ごと直す。lock の保護は「ユーザーが `npm install` で作ったものは facet の持ち物ではない」という既存の線引きの適用 |
| 10 | 実機確認は mac で行い、**置かれた Skill で `npm install` した後の状態**まで踏む | fs scope の挙動は OS で反転する。手順書が指示する操作の後の状態も成果物の状態である（教訓） |

## File Structure

```
src/modules/error-catalog/skill-write.smoke.test.ts   ← 新規（Task 1）
src/modules/glossary/skill-write.smoke.test.ts        ← 新規（Task 2）
src/modules/sequence/skill-write.smoke.test.ts        ← 新規（Task 4）
src/core/skill-canonical-copy.test.ts                 ← 新規（Task 3）
.claude/skills/error-catalog-register/scripts/error-catalog-write.mjs  ← 修正（Task 1・3）
.claude/skills/glossary-term-register/scripts/glossary-write.mjs       ← 修正（Task 2・3）
.claude/skills/{glossary-term-register,error-catalog-register}/scripts/canonical.ts ← cp（Task 3）
src/core/skill-sync.ts / src/fs/skill-resources.ts    ← 修正（Task 5・6）
src-tauri/src/lib.rs                                  ← 修正（Task 6）
```

---

### Task 1: error-catalog-write.mjs の重複2ルールをアプリへ追従し、実行 smoke テストで縛る

**Files:**
- Create: `src/modules/error-catalog/skill-write.smoke.test.ts`
- Modify: `.claude/skills/error-catalog-register/scripts/error-catalog-write.mjs:110-123`（重複2ルール）

**Interfaces:**
- Consumes: `checkErrorCatalogConsistency(data)`（`src/modules/error-catalog/consistency.ts`）
- Produces: 「smoke テストは `--check` の stdout にアプリの message が逐語で現れることを検査する」という形。Task 2・4 が同じ形をなぞる

**背景**: スクリプトの `duplicate-id`／`duplicate-name` は文言も計上規則もアプリと食い違っている（2026-08-15 の棚卸しで実測）。アプリは重複グループごとに1件・件数付き、スクリプトは2件目以降の出現ごとに1件・別文言。`resolution-action-missing` は接頭辞 `対応文の未記入: ` を除きアプリと一致しているため触らない。

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/error-catalog/skill-write.smoke.test.ts` を作る。`src/styles/palette-fit.smoke.test.ts` の形（`execFileSync`・timeout 20000）をなぞる:

```ts
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkErrorCatalogConsistency } from './consistency'

/**
 * `error-catalog-write.mjs --check` を実際に spawn し、整合性警告の文言が
 * アプリの checkErrorCatalogConsistency と一致していることを確かめる。
 *
 * **なぜ出力の突き合わせなのか。** スクリプトの警告判定は consistency.ts の
 * 手複製で、consistency.ts 自体は値 import ＋ `@/` エイリアスを持つため
 * sequence-register 式のバイト一致コピーにできない。手複製が黙ってズレる
 * 経路（実際に duplicate-id / duplicate-name でズレた）を、実行結果の
 * 突き合わせで塞ぐ。契約は「アプリの message がスクリプトの stdout に
 * 逐語で現れる」——スクリプトが接頭辞や独自警告を足すのは妨げない
 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SCRIPT = path.join(
  REPO_ROOT,
  '.claude/skills/error-catalog-register/scripts/error-catalog-write.mjs',
)

const entry = (over: Record<string, unknown>) => ({
  id: 'error_AAAAAAAAAA',
  name: '在庫不足',
  occurrence: '注文確定時',
  resolutionLevel: 'user',
  causeForSupport: '在庫が足りない',
  causeForSpec: '引当数量が実在庫を超過',
  userAction: '数量を減らして再注文する',
  supportAction: '',
  engineerAction: '',
  notes: '',
  ...over,
})

/**
 * 計上規則の差（グループごと1件 vs 出現ごと1件）は同一 ID が **3件**ないと
 * 炙り出せない——2件では両方式とも1件になり区別が付かない
 * （「退化ケースをテストデータに選ばない」）
 */
const FIXTURE = {
  schemaVersion: 1,
  type: 'errorCatalog',
  title: '検証用',
  errors: [
    entry({ id: 'error_DUP0000001', name: '在庫不足' }),
    entry({ id: 'error_DUP0000001', name: '在庫僅少' }),
    entry({ id: 'error_DUP0000001', name: '在庫切れ' }),
    // 末尾空白は normalizeForMatch（NFKC → trim → lowercase）が吸収して重複になる
    entry({ id: 'error_BBBBBBBBBB', name: '支払エラー' }),
    entry({ id: 'error_CCCCCCCCCC', name: '支払エラー ' }),
    // user 宣言なのに userAction が空 → resolution-action-missing
    entry({ id: 'error_DDDDDDDDDD', name: '通信断', userAction: '' }),
  ],
}

function run(file: string): { status: number; stdout: string } {
  try {
    return { status: 0, stdout: execFileSync('node', [SCRIPT, '--check', file], { encoding: 'utf8' }) }
  } catch (err) {
    const e = err as { status: number | null; stdout?: string }
    return { status: e.status ?? -1, stdout: e.stdout ?? '' }
  }
}

describe('error-catalog-write.mjs（実行 smoke ＋ 警告文言のアプリ一致）', () => {
  it('アプリの整合性 message がすべて stdout に逐語で現れる', () => {
    const issues = checkErrorCatalogConsistency(FIXTURE as never)
    // fixture が退化していないことを先に固める（issues が空なら以降の
    // toContain が空回りで緑になる）
    expect(new Set(issues.map((i) => i.rule))).toEqual(
      new Set(['duplicate-id', 'duplicate-name', 'resolution-action-missing']),
    )
    const dir = mkdtempSync(path.join(tmpdir(), 'ec-write-smoke-'))
    try {
      const file = path.join(dir, 'fixture.json')
      writeFileSync(file, JSON.stringify(FIXTURE), 'utf8')
      const { status, stdout } = run(file)
      expect(status).toBe(0) // 警告は exit code を変えない（die は構文・スキーマ違反のみ）
      for (const issue of issues) expect(stdout).toContain(issue.message)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 20000)

  it('欠陥の無いファイルは警告なしの exit 0', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ec-write-smoke-'))
    try {
      const file = path.join(dir, 'clean.json')
      writeFileSync(
        file,
        JSON.stringify({ schemaVersion: 1, type: 'errorCatalog', title: '検証用', errors: [entry({})] }),
        'utf8',
      )
      const { status, stdout } = run(file)
      expect(status).toBe(0)
      expect(stdout).not.toContain('整合性の警告')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 20000)
})
```

fixture がスキーマ検証で die する場合はフィールドの過不足なので、`schemas/error-catalog.schema.json` の `$defs.errorEntry.required` と突き合わせて直す（正はスキーマ）。

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run src/modules/error-catalog/skill-write.smoke.test.ts`
Expected: FAIL——現行スクリプトの `ID重複: error_DUP0000001（...）` はアプリの `ID が重複しています（3件）: error_DUP0000001` を含まない。

- [ ] **Step 3: スクリプトの重複2ルールを書き替える**

`.claude/skills/error-catalog-register/scripts/error-catalog-write.mjs` の「ID重複」「エラー名の重複」ブロック（110行目付近〜123行目付近）を、**グループごとに1件**の形へ:

```js
// ID重複（IDは機械的識別子なので正規化しない完全一致）。
// 文言・計上規則ともアプリ（src/modules/error-catalog/consistency.ts）と
// 同一であること——グループごとに1件・件数付き。出現ごとに数えない
const byId = new Map();
errors.forEach((e, i) => {
  if (!byId.has(e.id)) byId.set(e.id, []);
  byId.get(e.id).push(i);
});
for (const [id, indices] of byId) {
  if (indices.length > 1) warnings.push(`ID が重複しています（${indices.length}件）: ${id}`);
}

// エラー名の重複（同名2件は「この名前で引ける」という前提の矛盾。アプリで赤表示になる）
const byName = new Map();
errors.forEach((e, i) => {
  const k = fold(e.name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(i);
});
for (const indices of byName.values()) {
  if (indices.length > 1) {
    warnings.push(`エラー名が重複しています: ${indices.map((i) => `「${errors[i].name}」`).join(' と ')}`);
  }
}
```

既存の `seenId` / `seenName` ループは削除する。`fold` は既に trim を含んでいるので触らない。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/modules/error-catalog/skill-write.smoke.test.ts`
Expected: PASS

- [ ] **Step 5: 変異で赤くなることを確認する**

スクリプトの `ID が重複しています` を一時的に `IDが重複しています` に変えてテストを回し、**落ちること**を確認してから戻す。落ちなければテストが文言を見ていない——契約が壊れているので報告する。

- [ ] **Step 6: 全体検証してコミット**

```bash
npm test && npx tsc -b && npm run lint
git add src/modules/error-catalog/skill-write.smoke.test.ts .claude/skills/error-catalog-register/scripts/error-catalog-write.mjs
git commit -m "fix(skill): エラーカタログ Skill の重複警告をアプリの文言・計上規則へ追従し、実行 smoke テストで縛る"
```

---

### Task 2: glossary-write.mjs の共有4ルールをアプリへ追従し、実行 smoke テストで縛る

**Files:**
- Create: `src/modules/glossary/skill-write.smoke.test.ts`
- Modify: `.claude/skills/glossary-term-register/scripts/glossary-write.mjs:105-140`（fold と重複系警告）

**Interfaces:**
- Consumes: `checkGlossaryConsistency(data)`（`src/modules/glossary/consistency.ts`）、Task 1 のテストの形

**背景**: glossary スクリプトの警告5種のうち、アプリに対応物がある4つ（ID重複・name重複・alias重複・alias/name衝突）は文言が全て別物で、`fold` に trim が無い。アプリに対応物が無い2つ（単一性違反・`.gitattributes`）はスクリプト固有の役割なので**触らない**（契約は「アプリの message が現れる」であり、独自警告の追加を妨げない）。

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/glossary/skill-write.smoke.test.ts`。構造は Task 1 と同じ（REPO_ROOT・run ヘルパー・tmpdir・timeout 20000 を同様に書く）。fixture とアサーションだけ示す:

```ts
import { checkGlossaryConsistency } from './consistency'

const term = (over: Record<string, unknown>) => ({
  id: 'term_AAAAAAAAAA',
  name: '受注',
  kind: 'event',
  definition: '注文を受け付けること',
  aliases: [],
  notes: '',
  ...over,
})

/**
 * - 同一 ID 3件: 計上規則の差（グループごと vs 出現ごと）を炙り出す
 * - 「返品」と「返品 」: fold の trim 欠落を炙り出す（trim が無いと重複にならない）
 * - alias「オーダー」×3（同一用語内2＋他用語1）: アプリは1グループ1件（3件）と数える。
 *   スクリプト現行の「同一用語内」「用語間」2本立てとの差を炙り出す
 * - alias「出荷」が用語「出荷」の name と衝突
 */
const FIXTURE = {
  schemaVersion: 1,
  type: 'glossary',
  title: '検証用',
  terms: [
    term({ id: 'term_DUP0000001', name: '受注' }),
    term({ id: 'term_DUP0000001', name: '出荷' }),
    term({ id: 'term_DUP0000001', name: '請求' }),
    term({ id: 'term_BBBBBBBBBB', name: '返品' }),
    term({ id: 'term_CCCCCCCCCC', name: '返品 ' }),
    term({ id: 'term_DDDDDDDDDD', name: '注文', aliases: ['オーダー', 'オーダー'] }),
    term({ id: 'term_EEEEEEEEEE', name: '発注', aliases: ['オーダー', '出荷'] }),
  ],
}
```

アサーションは Task 1 と同じ2本立て:
- fixture の非退化を固める: `expect(new Set(issues.map((i) => i.rule))).toEqual(new Set(['duplicate-id', 'duplicate-name', 'duplicate-alias', 'alias-name-collision']))`
- `for (const issue of issues) expect(stdout).toContain(issue.message)`
- clean fixture（`terms: [term({})]`）で exit 0・`整合性の警告` を含まない

**注意**: スクリプトの警告ブロックの見出し文言が error-catalog 版と違う可能性がある。`not.toContain` の対象はスクリプトの実物（`glossary-write.mjs` の warnings 出力部）を読んで合わせること。

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run src/modules/glossary/skill-write.smoke.test.ts`
Expected: FAIL（現行文言 `ID重複: ...` はアプリの message を含まない）

- [ ] **Step 3: スクリプトを書き替える**

`glossary-write.mjs` の `fold`（105行目付近）と警告4ルール（109〜139行目付近）を:

```js
// アプリの normalizeForMatch（src/core/normalize.ts）と同じ規則。
// **trim を落とさないこと**——末尾に空白を足すだけで重複判定をすり抜けられる
const fold = (s) => String(s).normalize("NFKC").trim().toLowerCase();
```

4ルールは**アプリ（`src/modules/glossary/consistency.ts`）のアルゴリズムと文言をそのまま鏡写しにする**。ID重複・name重複は Task 1 Step 3 と同じグループ化の形（message は `ID が重複しています（${indices.length}件）: ${id}`／`名称が重複しています: ${indices.map(...).join(' と ')}`）。alias 2ルール:

```js
// alias 重複（同一用語内・用語間の両方を1つのルールで扱う）。
// アプリ（src/modules/glossary/consistency.ts）と同じく、いったん
// 「持ち主の位置つき」に平らへ潰してからグループごとに1件で数える
const owned = terms.flatMap((t, index) => t.aliases.map((alias) => ({ index, alias })));
const byAlias = new Map();
owned.forEach((o, flat) => {
  const k = fold(o.alias);
  if (!byAlias.has(k)) byAlias.set(k, []);
  byAlias.get(k).push(flat);
});
for (const group of byAlias.values()) {
  if (group.length > 1) {
    warnings.push(`別名「${owned[group[0]].alias}」が重複しています（${group.length}件）`);
  }
}

// alias と他用語の name の衝突（自用語の name は対象外。自他の判定は index）
const byTermName = new Map();
terms.forEach((t, index) => {
  const k = fold(t.name);
  if (!byTermName.has(k)) byTermName.set(k, []);
  byTermName.get(k).push(index);
});
terms.forEach((t, index) => {
  for (const alias of t.aliases) {
    for (const other of byTermName.get(fold(alias)) ?? []) {
      if (other === index) continue;
      warnings.push(`「${t.name}」の別名「${alias}」が用語「${terms[other].name}」の名称と衝突しています`);
    }
  }
});
```

既存の `seenId` / `seenName` / `inTerm` / `aliasOwner` 系のループは削除する。**単一性違反と `.gitattributes` の警告は残す。**

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/modules/glossary/skill-write.smoke.test.ts` → PASS

- [ ] **Step 5: 変異で赤くなることを確認する**

`別名「` を一時的に `別名 「` へ変えて落ちることを確認し、戻す。

- [ ] **Step 6: 全体検証してコミット**

```bash
npm test && npx tsc -b && npm run lint
git add src/modules/glossary/skill-write.smoke.test.ts .claude/skills/glossary-term-register/scripts/glossary-write.mjs
git commit -m "fix(skill): 用語集 Skill の重複警告をアプリの文言・計上規則へ追従し、実行 smoke テストで縛る"
```

---

### Task 3: 旧2 Skill の reorder/deref を canonical.ts のバイト一致コピー方式へ揃える

**Files:**
- Create: `.claude/skills/glossary-term-register/scripts/canonical.ts`（`cp` で作る）
- Create: `.claude/skills/error-catalog-register/scripts/canonical.ts`（同上）
- Create: `src/core/skill-canonical-copy.test.ts`
- Modify: `.claude/skills/glossary-term-register/scripts/glossary-write.mjs`（ローカルの `reorder`/`deref` を削除して import）
- Modify: `.claude/skills/error-catalog-register/scripts/error-catalog-write.mjs`（同上。203行目付近〜）
- Modify: 両 Skill の `SKILL.md`（Node 要件の追記）

**Interfaces:**
- Consumes: `src/core/canonical.ts` の `serialize(value, schema): string`・`stripBom(text): string`。動的 import の形は `.claude/skills/sequence-register/scripts/sequence-write.mjs:30-40` が前例
- Produces: 3 Skill すべてが同一方式（コピー＋一致検査）になる

**背景**: `canonical.ts` の改訂時、現状では sequence だけが赤くなり、旧2本は黙って古い正規形を書き続ける（正規形のズレは rev 5章が「プロジェクト最大のリスク箇所」と呼ぶ場所に diff として現れる）。`canonical.ts` は import ゼロなので `cp` できる（実測済み）。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/skill-canonical-copy.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * glossary / error-catalog の登録 Skill は src/core/canonical.ts の
 * バイト一致コピーを持つ（sequence-register が確立した方式。src/modules/
 * sequence/skill-copy.test.ts と同じ理由——手複製は追従漏れが検知されない）。
 * 「値 import を持たないこと」の検査は元ファイル共通なので sequence 側の
 * テストに任せ、ここではコピーごとのバイト一致だけを縛る
 */
const COPIES = [
  '.claude/skills/glossary-term-register/scripts/canonical.ts',
  '.claude/skills/error-catalog-register/scripts/canonical.ts',
]

describe('canonical.ts のバイト一致コピー（旧2 Skill）', () => {
  it.each(COPIES)('%s が src/core/canonical.ts とバイト一致する', (copy) => {
    expect(readFileSync(copy)).toEqual(readFileSync('src/core/canonical.ts'))
  })
})
```

Run: `npx vitest run src/core/skill-canonical-copy.test.ts` → FAIL（コピーが無い）

- [ ] **Step 2: コピーを置く**

```bash
cp src/core/canonical.ts .claude/skills/glossary-term-register/scripts/canonical.ts
cp src/core/canonical.ts .claude/skills/error-catalog-register/scripts/canonical.ts
npx vitest run src/core/skill-canonical-copy.test.ts
```

Expected: PASS。**手で編集しない。生成手段は `cp` に限る**（編集した瞬間「バイト一致」の意味が失われる）。

- [ ] **Step 3: 両スクリプトをコピーの import に切り替える**

各 `*-write.mjs` の先頭付近に、`sequence-write.mjs:30-40` と同じ形の動的 import を足す（文言・die の形も同ファイルから写す。型ストリップ非対応の Node での落ち方を人間が読める文にするための形）。ローカル定義の `function reorder(...)` と `function deref(...)`（glossary-write.mjs:188-、error-catalog-write.mjs:203-）を削除し、呼び出しを `C.serialize(...)` 等コピーの export に合わせて置き換える。**既存の書き出し結果（正規形）が1バイトも変わらないこと**が要件——`serialize` の入出力契約はローカル実装と同じはずだが、食い違ったら「計画の矛盾」として報告する。

- [ ] **Step 4: smoke テストで実行経路を確かめる**

Run: `npx vitest run src/modules/glossary/skill-write.smoke.test.ts src/modules/error-catalog/skill-write.smoke.test.ts`
Expected: PASS（Task 1・2 のテストが spawn するので、import の切り替えミスはここで落ちる）

さらに `--in`/`--out` の書き出し経路も1回実物で確認する:

```bash
node .claude/skills/glossary-term-register/scripts/glossary-write.mjs --check sample-project/用語集.json
```

（`sample-project/` に対象ファイルが無ければ、Task 1 の fixture を一時ファイルに書いて `--check` する。**`sample-project/` への書き込みはしない**——実機確認の痕跡はコミットしない決まり）

- [ ] **Step 5: SKILL.md に Node 要件を追記する**

両 Skill の SKILL.md に、sequence-register の SKILL.md にある Node バージョン要件の記述（型ストリップが unflagged な Node）を**同じ文言で**写す。写し元のパスをコミットメッセージに書く。

- [ ] **Step 6: 全体検証してコミット**

```bash
npm test && npx tsc -b && npm run lint
git add -A .claude/skills/glossary-term-register .claude/skills/error-catalog-register src/core/skill-canonical-copy.test.ts
git commit -m "refactor(skill): 旧2 Skill の reorder/deref を canonical.ts のバイト一致コピーへ揃える"
```

---

### Task 4: sequence-write.mjs の実行 smoke テスト

**Files:**
- Create: `src/modules/sequence/skill-write.smoke.test.ts`

**Interfaces:**
- Consumes: `checkSequenceConsistency(data)`（`src/modules/sequence/consistency.ts`）、Task 1 のテストの形

**背景**: sequence の4ルールは現時点で文言までアプリと一致している（棚卸しで実測）が、機械検査が無いので次の改訂でズレうる。このテストは「一致し続けること」を縛る＋型ストリップ import 経路の疎通確認（`questions.ts`/`canonical.ts` のコピーを実際に読む唯一の実行テスト）を兼ねる。

- [ ] **Step 1: テストを書く**

構造は Task 1 と同じ。fixture:

```ts
import { checkSequenceConsistency } from './consistency'

const FIXTURE = {
  schemaVersion: 1,
  type: 'sequence',
  title: '検証用',
  actors: [
    { id: 'actor_AAAAAAAAAA', name: '注文サービス' },
    { id: 'actor_AAAAAAAAAA', name: '在庫サービス' },
    { id: 'actor_AAAAAAAAAA', name: '決済サービス' }, // 同一 ID 3件
    { id: 'actor_BBBBBBBBBB', name: '配送サービス' },
  ],
  steps: [
    // from が存在しない参加者 → missing-actor
    { id: 'step_AAAAAAAAAA', kind: 'call', from: 'actor_ZZZZZZZZZZ', to: 'actor_BBBBBBBBBB', label: '在庫を引き当てる' },
    // self なのに to → to-mismatch（UI からは作れない外部編集ケース）
    { id: 'step_BBBBBBBBBB', kind: 'self', from: 'actor_BBBBBBBBBB', to: 'actor_BBBBBBBBBB', label: '在庫を再計算する' },
    // call なのに to 無し → to-mismatch
    { id: 'step_CCCCCCCCCC', kind: 'call', from: 'actor_BBBBBBBBBB', label: '出荷を指示する' },
    // from == to → self-call
    { id: 'step_DDDDDDDDDD', kind: 'call', from: 'actor_BBBBBBBBBB', to: 'actor_BBBBBBBBBB', label: '伝票を起こす' },
  ],
}
```

非退化の固定は `expect(new Set(issues.map((i) => i.rule)))` が `duplicate-id`・`missing-actor`・`to-mismatch`・`self-call` を**すべて**含むこと（rule 名の実物は `src/modules/sequence/consistency.ts` を読んで合わせる。食い違ったら実物が正）。clean fixture は `actors` 1件＋`self` の `steps` 1件で作る（`failures` 未記入は警告ではなく集計なので clean とみなされる——違ったら報告）。

- [ ] **Step 2: 通ることを確認する**

Run: `npx vitest run src/modules/sequence/skill-write.smoke.test.ts`
Expected: PASS（sequence は現時点で一致しているため、このテストは最初から緑のはず。**FAIL したらそれ自体が発見**——棚卸し以後にズレたか fixture が壊れているかなので報告する）

- [ ] **Step 3: 変異で赤くなることを確認する**

`sequence-write.mjs` の `の ID が重複しています` を一時的に変えて落ちることを確認し、戻す。最初から緑のテストはこの確認を省かない（「守っていないテスト」の摘出手順）。

- [ ] **Step 4: 全体検証してコミット**

```bash
npm test && npx tsc -b && npm run lint
git add src/modules/sequence/skill-write.smoke.test.ts
git commit -m "test(skill): sequence-write.mjs の実行 smoke テスト——文言一致と型ストリップ import の疎通を縛る"
```

---

### Task 5: collect() が node_modules を降りないようにする

**Files:**
- Modify: `src/core/skill-sync.ts:38` 付近（純関数を追加）
- Modify: `src/fs/skill-resources.ts:34-48`（`collect`）
- Modify: `src/core/skill-sync.test.ts`（テスト追加）

**Interfaces:**
- Produces: `shouldDescendSkillDir(name: string): boolean`（`src/core/skill-sync.ts` から export。`skill-resources.ts` が使う）

**背景**: `readBundled` は同梱 Skill 配下を無条件に全読みしてから絞る。同梱物に `node_modules` が入ったビルドでは、フォルダを開くたびに数百ファイルを IPC で読んで捨て、推移的依存に UTF-8 でないファイルが1つ入った瞬間 throw して Skill が黙って現れなくなる。読む側で降りなければ両方消える。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/skill-sync.test.ts` に追記:

```ts
describe('shouldDescendSkillDir', () => {
  it('node_modules へは降りない（読む前に除外する。読んでから捨てるのではない）', () => {
    expect(shouldDescendSkillDir('node_modules')).toBe(false)
  })
  it('それ以外のディレクトリへは降りる', () => {
    expect(shouldDescendSkillDir('scripts')).toBe(true)
    expect(shouldDescendSkillDir('schemas')).toBe(true)
  })
})
```

Run: `npx vitest run src/core/skill-sync.test.ts` → FAIL（未定義）

- [ ] **Step 2: 実装する**

`src/core/skill-sync.ts` の `SKILL_DEPS_DIR` の近くに:

```ts
/**
 * 同梱リソースを読むとき、このディレクトリへ降りてよいか（skill-resources.ts の
 * collect が使う）。`node_modules` は「書かない」（shouldSyncSkillFile）だけでなく
 * 「読まない」——ビルドマシンで Skill に npm install 済みだと数百ファイルを
 * IPC で読んで捨てることになり、依存にテキストでないファイルが1つあるだけで
 * readBundled ごと throw して Skill が黙って現れなくなる
 */
export function shouldDescendSkillDir(name: string): boolean {
  return name !== SKILL_DEPS_DIR
}
```

`src/fs/skill-resources.ts` の `collect` の分岐を:

```ts
    if (entry.isDirectory) {
      if (shouldDescendSkillDir(entry.name)) found.push(...(await collect(full, base)))
    } else if (entry.isFile) {
```

import は `@/core/skill-sync` から（既存の import 形式に合わせる）。

- [ ] **Step 3: 通ることを確認してコミット**

```bash
npm test && npx tsc -b && npm run lint
git add src/core/skill-sync.ts src/core/skill-sync.test.ts src/fs/skill-resources.ts
git commit -m "fix(core): 同梱 Skill の読み出しで node_modules へ降りない——全読みの性能と非テキストでの throw を塞ぐ"
```

- [ ] **Step 4: bundle.resources の除外可否を実物で確かめ、結果を記録する**

`~/.cargo/registry/src/*/tauri-bundler-*/src/bundle/` 配下で resources の解決を grep し、**パターン除外（`!` 等）に対応しているか**を確かめる。対応していれば `src-tauri/tauri.conf.json` の `bundle.resources` に除外を足して `npm run tauri build` が通ることまで確認、対応していなければ**何も変えず**、確かめた場所（ファイルパス）と結論をコミットメッセージまたは Task 8 の申し送りに書く。Step 1〜3 の skip で実行時の問題は両方消えているので、除外できなくてもこのタスクは完了である。

---

### Task 6: allow_skill_dir の literal 許可・.gitignore の同期復帰・package-lock の保護

**Files:**
- Modify: `src-tauri/src/lib.rs:24-28`（`allow_skill_dir`）
- Modify: `src/fs/skill-resources.ts`（invoke の引数）
- Modify: `src/core/skill-sync.ts:38-90`（同期の表・保護の表・コメント）
- Modify: `src/core/skill-sync.test.ts`

**Interfaces:**
- Consumes: `BUNDLED_SKILLS`（`src/core/skill-sync.ts:21`）
- Produces: `allow_skill_dir(dir, skills)` の新シグネチャ。`shouldSyncSkillFile('.gitignore') === true`、`isRemovableSkillEntry('package-lock.json') === false`

**背景**: `.gitignore` は fs scope の glob がドット始まりに一致しないため書けず、同期から除外されている。その結果、置いた先で `npm install` すると利用者のリポジトリに未追跡の `node_modules` が数千ファイル現れる。また `package-lock.json` は同期のたびに消え、`node_modules` だけ残った状態で `npm install` するとロックを見ずに解決し直す。**Rust 側の許可 → 同期の表、の順で直す**（逆にすると mac で「消したあとに書けない」＝Skill が半分置かれる状態を作る。順序はこのタスク内で完結させ、途中コミットしない）。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/skill-sync.test.ts` の該当 describe に追記・修正（既存に `.gitignore` を除外する側のアサーションがあれば**期待値を反転**させる。書き替えたテスト名も新しい意図に合わせて直す）:

```ts
it('.gitignore は同期する（allow_skill_dir が literal 許可する前提。npm install の残骸で利用者の git status を汚さないため）', () => {
  expect(shouldSyncSkillFile('.gitignore')).toBe(true)
})
it('package-lock.json は消さない（ユーザーの npm install の成果物。消すとロック無しで解決し直される）', () => {
  expect(isRemovableSkillEntry('package-lock.json')).toBe(false)
})
```

Run → FAIL

- [ ] **Step 2: skill-sync.ts を直す**

- `shouldSyncSkillFile` から `if (path === '.gitignore') return false` を削除
- `isRemovableSkillEntry` を `return name !== SKILL_DEPS_DIR && name !== SKILL_LOCK_FILE`（`const SKILL_LOCK_FILE = 'package-lock.json'` を `SKILL_DEPS_DIR` の隣へ）
- **60〜74行目付近の「`.gitignore` を同期に戻してはならない」のコメントブロックを書き替える**。旧文は「scope が literal に一致しない」を前提にした正しい記録だったが、前提ごと直したので、新しい文には (1) `allow_skill_dir` が Skill ごとの `.gitignore` を `allow_file` で literal 許可していること、(2) それが無いと mac で `forbidden path` に戻ること（sequence M4 の実測）、を書く。**書き替えた新文が真であることをコード（lib.rs の実装）と突き合わせてから確定する**（訂正それ自体が新しい誤りを生む、の教訓）

- [ ] **Step 3: lib.rs を直す**

```rust
#[tauri::command]
fn allow_skill_dir(app: tauri::AppHandle, dir: String, skills: Vec<String>) -> Result<(), String> {
    let scope = app.fs_scope();
    let claude = std::path::Path::new(&dir).join(".claude");
    scope
        .allow_directory(&claude, true)
        .map_err(|e| e.to_string())?;
    // `**` は unix の既定（require_literal_leading_dot: true）でドット始まりの
    // 要素に一致しない。同期対象のドットファイルは1つずつ literal で許可する。
    // 対象は Skill 直下の .gitignore のみ——ここに判断は置かない（rev 7章）。
    // 対象ファイルが増えたら TS 側（skill-resources.ts）から渡す形を広げる
    for skill in &skills {
        scope
            .allow_file(claude.join("skills").join(skill).join(".gitignore"))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

既存 doc コメントの「パターンに `.claude` を literal で入れれば判定を通る」の段は残し、この関数が2段（directory ＋ dot ファイルの literal）になった旨を追記する。`allow_file` のシグネチャは `tauri-plugin-fs` の実物（`~/.cargo/registry` か `src-tauri/target` 配下のソース）で確認すること——**エラー型・引数が計画と違ったら実物が正**。

- [ ] **Step 4: 呼び出し側を直す**

`src/fs/skill-resources.ts` の invoke（30行目付近）:

```ts
import { BUNDLED_SKILLS } from '@/core/skill-sync'
// ...
await invoke('allow_skill_dir', { dir, skills: BUNDLED_SKILLS })
```

- [ ] **Step 5: 検証してコミット**

```bash
npm test && npx tsc -b && npm run lint
cd src-tauri && cargo check && cd ..
git add src-tauri/src/lib.rs src/core/skill-sync.ts src/core/skill-sync.test.ts src/fs/skill-resources.ts
git commit -m "fix(core): Skill の .gitignore を同期へ戻す——fs scope に literal 許可を足し、package-lock.json を削除保護に加える"
```

---

### Task 7: 実機確認（人間の作業。mac で行う）

**サブエージェントは GUI を操作できない。このタスクは人間が行い、結果が出るまで Task 8 の申し送りには「未実施」と明記する。**

チェックリスト（`npm run tauri dev`。プロジェクトフォルダは `sample-project/` ではなく一時フォルダを推奨——`sample-project/` を使った場合は終了後に `git checkout -- sample-project/ && git clean -fd sample-project/`）:

- [ ] フォルダを開くと3 Skill が置かれ、**各 Skill 直下に `.gitignore` がある**（M15 の核心。mac の fs scope で書けることの確認）
- [ ] 失敗トーストが出ない。devtools のコンソールに `forbidden path` が無い
- [ ] 置かれた Skill ディレクトリ（どれか1本）で `npm install` → `node_modules` と `package-lock.json` ができる → **facet でフォルダを開き直す** → lock が消えていない・`node_modules` が残っている・Skill の他ファイルは置き直されている
- [ ] そのプロジェクトフォルダを `git init` してあれば `git status` が `.claude/skills/` 配下の `node_modules` を出さない（`.gitignore` が効いている）
- [ ] フォルダを開き直したときの体感が以前より悪化していない（`node_modules` を読まなくなったので、悪化する理由はない——悪化していたら報告）
- [ ] Claude Code ペインから Skill を1本実行してみる（用語の登録など）。書き出しが正常に完走する（Task 3 の import 切り替えが実機の Node でも動くことの確認）

---

### Task 8: ドキュメント反映（マイルストーン完了の3点セット）

**前提: `docs-open-issues-inventory` ブランチ（2026-08-15 の棚卸り版 open-issues）が main へマージ済みで、この worktree に取り込まれていること。** 未マージのままこのタスクを行うと、棚卸し前の open-issues を編集して衝突する。`git log origin/main --oneline -5` で棚卸しコミットの有無を確認してから始める。

- [ ] **`docs/history/m15-skill-hygiene.md` を新規作成**——実装で確定した事項（smoke テストという縛り方・canonical コピーの3本統一・fs scope の literal 許可）、見つかった欠陥、実機確認の結果（未実施ならその旨を明記しチェックリストを空で残す）
- [ ] **`docs/open-issues.md` を編集**——解消した項目を消す: エラーカタログ Skill の文言ズレ／登録 Skill の実行テスト不在／`node_modules` 全読み／`.gitignore`・`package-lock.json` の同期の穴／`reorder`/`deref` の手複製。あわせて「次に手を付ける候補」から 1〜4 番を消し、sequence Skill の4ルール複製の項を「実行 smoke テストで縛られた」形に書き直す。Task 5 Step 4 で bundle 除外を見送った場合はその結論を追記する
- [ ] **`docs/overview-rev.md` へ反映**——Skill とアプリの複製の縛り方（バイト一致コピー＋一致検査、コピーにできないものは実行 smoke テストで出力を突き合わせる）が3章・7章の記述と整合するか確認し、確定した判断として反映する。**TODO として申し送りに残さない**
- [ ] 教訓があれば `docs/lessons-for-planning.md` へ追記
- [ ] コミット: `docs(m15): 申し送りを書き、rev と残件へ反映する`
