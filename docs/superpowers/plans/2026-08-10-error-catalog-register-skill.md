# エラー登録 Skill 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** エラーカタログファイル（`type: errorCatalog` / `schemaVersion 1`）を、ユーザーへのヒアリングを通じて作成・追記・書き足しする Skill を作る。用語集の `glossary-term-register` に対応するエラーカタログ版。

**Architecture:** `.claude/skills/error-catalog-register/` に**自己完結した1ディレクトリ**として置く。ID 採番・スキーマ検証・正規形書き出しは同梱スクリプトが行い（rev 4章の「Skill への同梱スクリプト」）、**スキーマだけはアプリと同一の実体を参照する**（`schemas/error-catalog.schema.json`。コピーを持たない）。Skill の価値は聞き方にあり、ファイル書き込みは結果でしかない。

**Tech Stack:** Node.js（ESM、`.mjs`）／ajv 8（スキーマ検証）／Markdown（`SKILL.md`）。アプリ側のコードは**1行も変更しない。**

**この計画は main にコミットされている。** 実装は CLAUDE.md のとおり **worktree を作ってから**行う（`EnterWorktree` → その中で実装 → PR）。worktree はこの計画を含んだ状態で始まるので、計画ファイルを作り直さないこと。

**設計の出どころ:**
- [`../../overview-rev.md`](../../overview-rev.md) 4章（Skill 群と同梱スクリプト）・5章（ID 規約・正規形）・6章（モジュール規約）
- [`../../error-catalog/error-catalog-session-notes.md`](../../error-catalog/error-catalog-session-notes.md)（エラーカタログの仕様の出所）
- [`2026-08-09-m9-m10-error-catalog-design.md`](2026-08-09-m9-m10-error-catalog-design.md) 第 II 部 決定13・14（何が赤で何が warning か）
- [`../../history/m10-error-catalog-editor.md`](../../history/m10-error-catalog-editor.md)（M10 で確定した事実。特に決定14と決定15の食い違いの裁定）
- **手本: `.claude/skills/glossary-term-register/`**（SKILL.md 197行／`scripts/glossary-write.mjs` 236行／`scripts/new-id.mjs` 52行／`evals/`）

---

## Global Constraints

以下は**全タスクの要件に暗黙に含まれる**。

- **アプリ側のコードを1行も変えない。** 変更してよいのは `.claude/skills/error-catalog-register/**` と、最後のタスクの `docs/**` だけ。`src/` `schemas/` `package.json`（リポジトリ直下）に触ったら「計画の矛盾」として報告する
- **用語集の Skill（`.claude/skills/glossary-term-register/**`）も変えない。** 複製元として読むだけ
- **スキーマのコピーを同梱しない**（rev 4章）。`schemas/error-catalog.schema.json` を実行時に探索して読む
- **ID を Skill 自身が組み立てない。** 必ず `scripts/new-id.mjs` の出力を使う（連番禁止。アプリと AI が並行して要素を追加するため、連番は必ず衝突する）
- **文言はすべて日本語。** データとスキーマの enum は英語のまま（rev 3章・4章）
- **既存データを勝手に整形・並べ替え・言い換えしない。** 配列順は正であり、並べ替えは意味のない diff を生む
- **`SKILL.md` の文体は `glossary-term-register/SKILL.md` に揃える**（断定調、表で選択肢を示す、「なぜそうするか」を必ず書く、「やらないこと」で締める）
- **リポジトリ直下で `npm install` しない。** Skill の依存は `.claude/skills/error-catalog-register/` の中で完結する（`node_modules/` は `.gitignore` 済み）
- **計画の指示が矛盾していたら、辻褄を合わせずに「計画の矛盾」として報告する。** 報告には**実行したコマンドとその出力を貼る**

---

## 設計上の決定（実装前に読むこと）

### 決定A: Skill 名は `error-catalog-register`

用語集は `glossary-term-register`（`<ツール>-<エンティティ>-register`）だが、エラーカタログでそれに倣うと `error-catalog-error-register` になり `error` が重なる。**`error-catalog-register` とする。** ディレクトリ名・`SKILL.md` の `name` フィールド・`package.json` の `name` の3箇所を揃える。

### 決定B: スクリプトは複製して自己完結にする

`new-id.mjs` と書き出しスクリプトは用語集版から複製する。共通部分を切り出して2つの Skill で共有しない。

**理由: Skill は配布単位であり、ディレクトリ1つで持ち出せることに価値がある**（rev 4章「Skill 群はアプリ本体と並ぶ正式な成果物」。アプリのモジュールとは別の判断軸で、M9・M10 でコアへ引き上げたのとは事情が違う）。共有にすると Skill 単体で動かなくなり、用語集側の Skill も書き換えることになる。

**3本目の Skill が出た時点で引き上げを再検討する**（M10 でエディタのキー処理について同じ判断をした形）。

### 決定C: 聞く順序は「レベル → そのレベルの対応文」

**これが用語集には無い構造で、この Skill の設計の中心である。**

用語集の `kind` は分類でしかないが、エラーカタログの `resolutionLevel` は**次に聞くべきことを決める**。`user` と分かれば埋めるべきは `userAction` 1つで、`supportAction` と `engineerAction` は空のままでよい（アプリはそれを warning にしない。決定14）。

だから聞き方は次の形になる:

1. まず `resolutionLevel` を聞く（誰が解決するか。サポートが最初に判断するのもここ）
2. 決まったら、**そのレベルの対応文だけ**を聞く
3. `none`（誰にも解決できない）なら**3つとも聞く**——復旧不可でも「作り直してください」「この状態で進めて問題ありません」という案内は存在し、そこがサポートサイトで最も需要の高い問い合わせになる（session-notes 2-3）
4. `undecided` なら対応文は聞かない（誰が関与するかまだ決まっていないので、どれを埋めるべきかも決まらない）

**全レベルの対応文を一律に聞くと会議が止まり、しかも埋めた大半は誰も読まない列になる。**

### 決定D: `resolutionLevel` を AI が推測で確定しない

用語集の `kind` における `other` / `undecided` と同じ構造。`none` は「**検討した上で**誰にも解決できない」という決定の記録なので、**AI が勝手に付けてよい値ではない**。迷ったら `undecided`。

「たぶんユーザー側で直せますよね？」と確認するのはよい。ユーザーが「そう」と言えば確定、「まだ分からない」と言えば `undecided` のまま。**AI の推測をユーザーの決定として記録しない。**

### 決定E: 既存エラーとの照合は `name` だけで行う

エラーカタログには `aliases` が無い（用語集との違い）。照合は `name` のみで、規則は `NFKC` 正規化＋前後空白除去＋大小同一視（アプリの `normalizeForMatch` と同じ）。

**同名2件はアプリで赤表示になる**（`duplicate-name`）ので、かぶったら登録せずユーザーに確認する。実務では「保存できない」のような**粗い名前が衝突しやすい**ので、その場合は**名前を具体的にする**方向で聞く（「保存時に容量超過エラー」「保存時に権限エラー」）。エラー名は引くためのキーなので、粗い名前は衝突するだけでなく検索の役にも立たない。

### 決定F: 書き足し（既存エラーの更新）を範囲に含める

エラーカタログは「とりあえず名前だけ登録 → 後で `resolutionLevel` と対応文を埋める」が常態になる（アプリで黄色いセルを消していく作業）。**この Skill はその書き足しにも対応する。**

不変条件を `SKILL.md` に明記すること:

- **既存の `id` を絶対に変えない**（不変 ID。将来 `error_` で参照される）
- **`errors` の配列順を変えない**（配列順が正。並べ替えは意味のない diff を生む）
- **触っていないエラーのフィールドを1バイトも変えない**（AI が「ついでに」文章を整えると、Git diff が仕様の変更履歴として読めなくなる）

### 決定G: `occurrence` は当面手入力であることを書いておく

session-notes 3節の申し送り。本来は「参照している側から逆引きして導出」するのが正しく、参照が実装された時点で `schemaVersion` 改訂＋マイグレータで移行する。**いまは手入力なので、この Skill で聞く。** ただし「表に載っていないエラー」は検出できない（網羅性は担保されない）ので、Skill が「これで全部です」と言わないこと。

### 決定H: 空欄の扱いは M10 の裁定に従う

**空フィールドは Markdown 出力で `（未定義）` になる**（決定15）。関与しないレベルの対応文も同様（M10 の実機確認で人間が「現状のまま」と裁定済み。`docs/history/m10-error-catalog-editor.md`）。

この Skill は**その挙動を前提に、埋まらない項目は埋まらないまま書く。** 出力に `（未定義）` が並ぶのは負債が見えている状態であって、AI が埋めて消すものではない。

---

## File Structure

| ファイル | 責務 |
| --- | --- |
| `.claude/skills/error-catalog-register/SKILL.md` | Skill 本体。**聞き方の設計がここにある** |
| `.claude/skills/error-catalog-register/package.json` | ajv 依存の宣言（用語集版と同型） |
| `.claude/skills/error-catalog-register/scripts/new-id.mjs` | ID 採番。用語集版の複製（既定 prefix を `error` に） |
| `.claude/skills/error-catalog-register/scripts/error-catalog-write.mjs` | スキーマ検証＋正規形書き出し＋整合性の警告 |
| `.claude/skills/error-catalog-register/evals/evals.json` | 振る舞いの回帰テストのケース定義 |
| `.claude/skills/error-catalog-register/evals/grade.mjs` | 機械判定 |
| `.claude/skills/error-catalog-register/evals/fixtures/**` | eval の入力（既存カタログ・資料） |
| `docs/open-issues.md` | 「エラー登録 Skill が無い」の項を**消す** |
| `docs/README.md` | 「リポジトリ内の他の『正』」の記述を実態に合わせる |

---

## Task 1: 同梱スクリプトと依存宣言

**Files:**
- Create: `.claude/skills/error-catalog-register/package.json`
- Create: `.claude/skills/error-catalog-register/.gitignore`
- Create: `.claude/skills/error-catalog-register/scripts/new-id.mjs`
- Create: `.claude/skills/error-catalog-register/scripts/error-catalog-write.mjs`

**Interfaces:**
- Consumes: `schemas/error-catalog.schema.json`（アプリと同一の実体。コピーしない）
- Produces:
  - `node scripts/new-id.mjs [件数] [--prefix <p>]` → `error_XXXXXXXXXX` を1行1件（既定 prefix は `error`）
  - `node scripts/error-catalog-write.mjs --in <下書き.json> --out <対象.json>` → 検証＋正規形書き出し
  - `node scripts/error-catalog-write.mjs --check <ファイル>` → 検証のみ
  - 終了コード: 0=成功（警告はあり得る）／1=スキーマ検証失敗／2=使い方の誤り

**このタスクにテストフレームワークは無い。** リポジトリの `npm test`（vitest）は `src/` を見ており、Skill のスクリプトは対象外。**検証は「実際に走らせて出力を確かめる」形で行う**（各ステップにコマンドと期待出力を書いてある）。

- [ ] **Step 1: `package.json` を書く**

用語集版（`.claude/skills/glossary-term-register/package.json`）と同型。`name` と `description` だけ変える:

```json
{
  "name": "error-catalog-register-skill",
  "private": true,
  "type": "module",
  "description": "エラー登録Skillの同梱スクリプト（ID採番・検証・正規形書き出し）",
  "dependencies": {
    "ajv": "^8.17.1"
  }
}
```

- [ ] **Step 2: `.gitignore` を置く**

用語集の Skill（`.claude/skills/glossary-term-register/.gitignore`）と**同一の2行**:

```
node_modules/
package-lock.json
```

**`package-lock.json` はリポジトリ直下の `.gitignore` では無視されない。** これを置かないと、`npm install` の後に Skill のロックファイルが追跡対象へ紛れ込む（用語集の Skill が同じ理由でこのファイルを持っている）。

- [ ] **Step 3: `scripts/new-id.mjs` を複製する**

`.claude/skills/glossary-term-register/scripts/new-id.mjs` をコピーし、**2箇所だけ**変える:

| 変更前 | 変更後 |
| --- | --- |
| `//   node scripts/new-id.mjs            → term_XXXXXXXXXX を1件` | `//   node scripts/new-id.mjs            → error_XXXXXXXXXX を1件` |
| `let prefix = "term";` | `let prefix = "error";` |

冒頭コメントの `node scripts/new-id.mjs 3 --prefix state` の例は**用語集の種別を例にしている**ので、`--prefix` の説明として意味が通る例に差し替える（例: `node scripts/new-id.mjs 3 --prefix term`）。それ以外（アルファベット・長さ・`randomInt`・引数検査）は1文字も変えない。

- [ ] **Step 4: ID 採番を実際に走らせて確かめる**

```bash
cd .claude/skills/error-catalog-register
node scripts/new-id.mjs 3
```

Expected: `error_` ＋ 英数字10文字が3行。3行とも異なること。次でスキーマの正規表現に一致することを確かめる:

```bash
node -e "const ids=require('node:child_process').execSync('node scripts/new-id.mjs 20',{encoding:'utf8'}).trim().split('\n'); const re=/^error_[A-Za-z0-9]{10}$/; console.log(ids.every(i=>re.test(i)) ? 'OK: 20件すべて規約どおり' : 'NG'); console.log(new Set(ids).size === 20 ? 'OK: 重複なし' : 'NG: 重複あり')"
```

Expected: `OK: 20件すべて規約どおり` と `OK: 重複なし`

- [ ] **Step 5: `scripts/error-catalog-write.mjs` を書く**

`.claude/skills/glossary-term-register/scripts/glossary-write.mjs` をコピーし、次の表のとおり差し替える。**表に無い部分（引数解析・`reorder`／`deref`／`readJson`／`safeReaddir`／`hasJsonEolRule`／`die`・ajv の呼び出し・書き出しの改行とエンコーディング）は1文字も変えない**——正規形はアプリの `src/core/canonical.ts` とバイト単位で一致していなければならない。

| 箇所 | 変更内容 |
| --- | --- |
| 冒頭コメント | 「用語集ファイル」→「エラーカタログファイル」。整合性検証の説明を後述の3ルールに書き換える |
| 使い方コメント | `glossary-write.mjs` → `error-catalog-write.mjs`、`<project>/glossary.json` → `<project>/エラーカタログ.json` |
| `findSchema()` の環境変数 | `FACET_GLOSSARY_SCHEMA` → `FACET_ERROR_CATALOG_SCHEMA` |
| `findSchema()` の探索名 | `"glossary.schema.json"` → `"error-catalog.schema.json"`（`schemas/` 配下も同様） |
| `findSchema()` のエラー文言 | `glossary.schema.json が見つかりません` → `error-catalog.schema.json が見つかりません` |
| 整合性検証ブロック（`const terms = ...` から単一性検査の直前まで） | **下記のとおり全面差し替え** |
| 単一性検査 | `other?.type === "glossary"` → `other?.type === "errorCatalog"`、文言を「エラーカタログの単一性違反」に |
| 要約の出力 | `用語数` → `エラー数`。未記入の集計を**下記のとおり差し替え** |

**整合性検証（アプリの `src/modules/error-catalog/consistency.ts` と同じ3ルール。M10 決定13）:**

```js
const errors = normalized.errors ?? [];
// アプリの normalizeForMatch（src/core/normalize.ts）と同じ規則。
// **trim を落とさないこと**——末尾に空白を足すだけで重複判定をすり抜けられる。
// 用語集版のスクリプトの fold は trim を含んでいないが、そちらに合わせない
const fold = (s) => String(s).normalize("NFKC").trim().toLowerCase();

// ID重複（IDは機械的識別子なので正規化しない完全一致）
const seenId = new Map();
for (const e of errors) {
  if (seenId.has(e.id)) warnings.push(`ID重複: ${e.id}（${seenId.get(e.id)} と ${e.name}）`);
  else seenId.set(e.id, e.name);
}

// エラー名の重複（同名2件は「この名前で引ける」という前提の矛盾。アプリで赤表示になる）
const seenName = new Map();
for (const e of errors) {
  const k = fold(e.name);
  if (seenName.has(k)) warnings.push(`エラー名の重複: 「${e.name}」が複数登録されています（既存: ${seenName.get(k)}）`);
  else seenName.set(k, e.name);
}

// 宣言したレベルと対応文の矛盾（例: user なのに userAction が空）
const REQUIRED_ACTION = { user: "userAction", support: "supportAction", engineer: "engineerAction" };
const ACTION_LABEL = { userAction: "ユーザーの対応", supportAction: "サポートの対応", engineerAction: "エンジニアの対応" };
const LEVEL_LABEL = { user: "ユーザー対応", support: "サポート対応", engineer: "エンジニア対応", none: "解決不可", undecided: "未分類" };
for (const e of errors) {
  const field = REQUIRED_ACTION[e.resolutionLevel];
  if (field && e[field] === "") {
    warnings.push(`対応文の未記入: 「${e.name}」は${LEVEL_LABEL[e.resolutionLevel]}としていますが、${ACTION_LABEL[field]}が空です`);
  }
}
```

**要約（アプリの `src/modules/error-catalog/warnings.ts` と同じ warning 判定。M10 決定14）:**

```js
console.log(`  エラー数: ${errors.length}`);

const undecided = errors.filter((e) => e.resolutionLevel === "undecided").map((e) => e.name);
if (undecided.length) console.log(`  未分類（resolutionLevel=undecided）: ${undecided.length}件 — ${undecided.join("、")}`);

// 空欄の集計は、アプリが黄色く塗るセルと同じ条件で数える。
// 対応3種は「そのレベルが関与するとき（または none）」だけが未記入として意味を持つ——
// 全部を数えると、ほとんどのエラーは1レベルしか関与しないので一覧がノイズで埋まる
const DECLARED_BY = { userAction: "user", supportAction: "support", engineerAction: "engineer" };
const isWarn = (e, field) => {
  if (field === "occurrence" || field === "causeForSupport" || field === "causeForSpec") return e[field] === "";
  if (field in DECLARED_BY) {
    return e[field] === "" && (e.resolutionLevel === DECLARED_BY[field] || e.resolutionLevel === "none");
  }
  return false;
};
const FIELD_LABEL = {
  occurrence: "発生タイミング",
  causeForSupport: "原因（業務）",
  causeForSpec: "原因（仕様）",
  userAction: "ユーザーの対応",
  supportAction: "サポートの対応",
  engineerAction: "エンジニアの対応",
};
for (const [field, label] of Object.entries(FIELD_LABEL)) {
  const names = errors.filter((e) => isWarn(e, field)).map((e) => e.name);
  if (names.length) console.log(`  ${label}が空: ${names.length}件 — ${names.join("、")}`);
}
```

> **この判定はアプリ側 `warnings.ts` の複製である。** アプリと Skill は別々にバージョン管理される成果物で、接点はファイルだけ（rev 4章。MCP 的な書き込みツールは作らない、という決定済み事項）。**共有できるのはスキーマだけ**なので、この重複は構造的に避けられない。**スキーマの `resolutionLevel` の enum が改訂されたら両方を追従させること**を、`SKILL.md` の冒頭にも書く（Task 2）。

- [ ] **Step 6: 依存を入れて、正しいカタログが通ることを確かめる**

```bash
cd .claude/skills/error-catalog-register
npm install
cat > /tmp/ec-ok.json <<'EOF'
{
  "schemaVersion": 1,
  "type": "errorCatalog",
  "title": "テストカタログ",
  "errors": [
    {
      "id": "error_AAAAAAAAAA",
      "name": "ログインできない",
      "occurrence": "ログイン画面で送信したとき",
      "resolutionLevel": "user",
      "causeForSupport": "パスワードの入力誤り",
      "causeForSpec": "",
      "userAction": "パスワードを入れ直す",
      "supportAction": "",
      "engineerAction": "",
      "notes": ""
    }
  ]
}
EOF
node scripts/error-catalog-write.mjs --check /tmp/ec-ok.json
```

Expected: `✓ スキーマ検証OK` と `✓ 正規形と一致しています`、`エラー数: 1`。**警告は出ない**（`user` 宣言に対して `userAction` が埋まっており、`causeForSpec` が空なので「原因（仕様）が空: 1件」だけが要約に出る）。

- [ ] **Step 7: 3つの警告がそれぞれ出ることを確かめる**

```bash
cat > /tmp/ec-warn.json <<'EOF'
{
  "schemaVersion": 1,
  "type": "errorCatalog",
  "title": "テストカタログ",
  "errors": [
    { "id": "error_AAAAAAAAAA", "name": "保存できない", "occurrence": "", "resolutionLevel": "support", "causeForSupport": "", "causeForSpec": "", "userAction": "", "supportAction": "", "engineerAction": "", "notes": "" },
    { "id": "error_AAAAAAAAAA", "name": "ﾎｿﾞﾝできない", "occurrence": "", "resolutionLevel": "user", "causeForSupport": "", "causeForSpec": "", "userAction": "やり直す", "supportAction": "", "engineerAction": "", "notes": "" }
  ]
}
EOF
node scripts/error-catalog-write.mjs --check /tmp/ec-warn.json
```

Expected: 警告が3種そろって出ること——`ID重複`（同じ `error_AAAAAAAAAA`）／`エラー名の重複`（`保存できない` と `ﾎｿﾞﾝできない` が NFKC で一致）／`対応文の未記入`（1件目が `support` 宣言で `supportAction` が空）。

**2件目の `userAction` は埋まっているので「対応文の未記入」に出ないこと。**

要約の見方に注意する。**対応3種のうち出るのは「サポートの対応が空: 1件」の1行だけ**であること——2件目の `supportAction` / `engineerAction` は空だが `user` レベルは関与しないので数えない（決定14）。`occurrence` と原因2種はどちらのエラーも空なので「2件」と出るのが正しい。ここが期待どおりでなければ `isWarn` の実装を疑う。

- [ ] **Step 8: スキーマ違反が終了コード1で落ちることを確かめる**

```bash
cat > /tmp/ec-bad.json <<'EOF'
{ "schemaVersion": 1, "type": "errorCatalog", "title": "T", "errors": [ { "id": "term_AAAAAAAAAA", "name": "", "occurrence": "", "resolutionLevel": "other", "causeForSupport": "", "causeForSpec": "", "userAction": "", "supportAction": "", "engineerAction": "", "notes": "" } ] }
EOF
node scripts/error-catalog-write.mjs --check /tmp/ec-bad.json; echo "exit=$?"
```

Expected: `✗ スキーマ検証に失敗しました` と `exit=1`。エラーとして `id` のパターン違反・`name` の `minLength`・`resolutionLevel` の enum 違反（許可値の一覧つき）が並ぶこと。

- [ ] **Step 9: 書き出しが正規形になることを確かめる**

キー順をわざと崩した下書きを書き出し、アプリの正規形と一致することを見る:

```bash
cat > /tmp/ec-draft.json <<'EOF'
{ "errors": [ { "notes": "", "name": "ログインできない", "id": "error_AAAAAAAAAA", "engineerAction": "", "supportAction": "", "userAction": "入れ直す", "causeForSpec": "", "causeForSupport": "入力誤り", "resolutionLevel": "user", "occurrence": "送信時" } ], "title": "テストカタログ", "type": "errorCatalog", "schemaVersion": 1 }
EOF
mkdir -p /tmp/ec-proj && node scripts/error-catalog-write.mjs --in /tmp/ec-draft.json --out /tmp/ec-proj/エラーカタログ.json
head -6 /tmp/ec-proj/エラーカタログ.json
```

Expected: 書き出したファイルのキー順が `schemaVersion` → `type` → `title` → `errors`、エントリ内が `id` → `name` → `occurrence` → `resolutionLevel` → `causeForSupport` → `causeForSpec` → `userAction` → `supportAction` → `engineerAction` → `notes`（スキーマの `properties` 記載順）。インデント2スペース、末尾に改行1つ、BOM 無し。

**同じファイルを `--check` に掛けると「正規形と一致しています」になること**（書き出しが正規形の定義そのものであることの確認）:

```bash
node scripts/error-catalog-write.mjs --check /tmp/ec-proj/エラーカタログ.json
```

- [ ] **Step 10: 単一性の警告が出ることを確かめる**

```bash
cp /tmp/ec-proj/エラーカタログ.json /tmp/ec-proj/別のカタログ.json
node scripts/error-catalog-write.mjs --in /tmp/ec-draft.json --out /tmp/ec-proj/エラーカタログ.json
rm -rf /tmp/ec-proj /tmp/ec-ok.json /tmp/ec-warn.json /tmp/ec-bad.json /tmp/ec-draft.json
```

Expected: `エラーカタログの単一性違反: 同じフォルダに別のエラーカタログ 別のカタログ.json があります` が警告に出ること。

- [ ] **Step 11: リポジトリ側に副作用が無いことを確かめる**

```bash
git status --short
```

Expected: `.claude/skills/error-catalog-register/` の新規ファイルだけ（`node_modules/` は `.gitignore` 済みで出ない）。`src/` `schemas/` `package.json` に変更が無いこと。

- [ ] **Step 12: コミット**

```bash
git add .claude/skills/error-catalog-register/package.json .claude/skills/error-catalog-register/.gitignore .claude/skills/error-catalog-register/scripts
git commit -m "feat(skill): エラー登録 Skill の同梱スクリプトを追加する"
```

---

## Task 2: `SKILL.md`

**Files:**
- Create: `.claude/skills/error-catalog-register/SKILL.md`

**Interfaces:**
- Consumes: Task 1 のスクリプト2本
- Produces: Skill 本体（frontmatter の `name` / `description` が起動条件になる）

**このタスクの成果物は文章であり、正しさは「読んで従える」ことでしか確かめられない。** 各節に**なぜそうするか**を必ず書くこと——理由の無い手順は、状況が変わった瞬間に破られる。

- [ ] **Step 1: frontmatter を書く**

`name` は `error-catalog-register`。`description` は**起動条件そのもの**なので、次の要素を必ず含める（用語集版が同じ形になっている）:

- 何をするか（`type=errorCatalog` / `schemaVersion 1` の JSON をヒアリングで作成・追記・更新する）
- 明示的に頼まれたとき（「エラーを登録したい」「エラーカタログを作って」「このエラーを追加して」）
- **明示的に言われなくても使う場面**（仕様の会話で「この場合どうなる？」「エラーになったらどうする？」が出たとき／エラーメッセージ一覧・問い合わせ実績を渡されたとき／プロジェクトフォルダに `type: errorCatalog` の JSON があるとき）
- ID の採番とスキーマ検証・正規形での書き出しは同梱スクリプトが行うので**手書きで JSON を作らない**こと

- [ ] **Step 2: 本文の骨格を書く**

節の構成は用語集版に揃える。**エラーカタログ固有の中身は Step 3 以降で埋める。**

```markdown
# エラー登録

仕様整理ツール（Tauri製アプリ）のエラーカタログファイルを、ユーザーと対話しながら組み立てる。

**このSkillが紐づく対象: `type: "errorCatalog"` × `schemaVersion 1`。** スキーマが改訂されたらこのSkillも追従させる（アプリとSkillは別々にバージョン管理される成果物であり、この対応が依存関係の記録）。**特に `resolutionLevel` の enum と、同梱スクリプトが持つ警告の判定条件は、アプリ側の実装（`src/modules/error-catalog/warnings.ts` / `consistency.ts`）の複製である**——接点はファイルだけという決定（rev 4章）の帰結なので、片方だけ直さないこと。

このSkillの価値は「AIが速く書けること」ではなく、**会議の速度でユーザーの頭の中を構造化データにすること**にある。だから聞き方が本体で、ファイル書き込みは結果でしかない。

## 全体の流れ

1. 対象プロジェクトフォルダを確認し、既存のエラーカタログを探す
2. **登録するエラーをユーザーに確定させる**（資料から作る場合。ここを飛ばさない）
3. ヒアリングして各エラーの中身を埋める
4. `scripts/new-id.mjs` でIDを採番する
5. 下書きJSONを書き、`scripts/error-catalog-write.mjs` で検証＋正規形書き出しをする
6. 未記入と警告をユーザーに報告する

既存エラーへの書き足し（後から `resolutionLevel` や対応文を埋める）は「7. 書き足し」を見る。

初回のみ、Skillディレクトリで `npm install`（ajv が必要）。`ajv が見つかりません` と言われたら実行する。
```

- [ ] **Step 3: 「1. 既存のエラーカタログを探す」を書く**

用語集版の同節と**同じ構造**（`type` で判別する／プロジェクトにつき1つ／アプリを開いたまま作業しない）を、エラーカタログの語彙で書く。**次の2点はエラーカタログ固有なので必ず入れる:**

- **照合に使うのは `name` だけ**（用語集と違い `aliases` が無い）。既存カタログが見つかったら、**全エラーの `name` を読んでから手順2に進む**
- 見つからないときの新規作成で `title` を提案する（プロジェクト名から。ユーザーに確認する）

- [ ] **Step 4: 「2. 登録するエラーを人間に確定させる」を書く**

**入口が2つある**ことを書く（用語集版は会議メモからの抽出だけを想定しているが、エラーカタログは会話の途中で1件ずつ増える運用も主要な入口である）:

| 入口 | 進め方 |
| --- | --- |
| **仕様の会話の途中**（「この場合どうなる？」でエラーが1つ見つかった） | その場で1件ずつ登録する。候補一覧の提示は要らない——ユーザーが既に「これはエラーだ」と言っている |
| **既存資料を渡された**（エラーメッセージ一覧・仕様書・問い合わせ実績） | 候補を一覧で提示し、**登録するものをユーザーに確定させてから**書き込む。抽出した端から登録しない |

後者の理由は用語集と同じ構造で書く（**どれをカタログに載せるかがカタログの設計そのもの**／載せすぎたら人間が1件ずつ消す作業になる／入れるのは1往復、消すのは後で何度も）。**エラーカタログ固有の理由を1つ足す**: エラーメッセージ一覧から機械的に拾うと、**実装の都合で出るメッセージ（内部エラー・バリデーションの1文言）まで載り、サポートが読む表が使い物にならなくなる**。載せる単位は「ユーザーが遭遇して問い合わせうる事象」であって、メッセージの文字列ではない。

既存との照合（決定E）もこの節に書く:

| かぶり方 | ユーザーに確認すること |
| --- | --- |
| 既存の `name` と同じ | 同じ事象か。同じなら登録せず、書き足し（手順7）に回す。別事象なら**どちらも名前を具体的にする**（「保存できない」→「保存時に容量超過」「保存時に権限不足」） |
| 名前が粗くて衝突しそう | 引くためのキーとして機能する粒度か。粗い名前は衝突するだけでなく検索でも引けない |

- [ ] **Step 5: 「3. ヒアリング」を書く（この Skill の中心）**

用語集版の「埋まらない項目は埋まらないまま書く」「ただし転記は推測ではない」の2節を、**そのままの論法で**エラーカタログの語彙に移す（出典を指させるかで判定する表も含む）。そのうえで**エラーカタログ固有の3節**を書く:

**(a) 聞く順序（決定C）**

```markdown
### まず resolutionLevel、次にそのレベルの対応文

用語集の `kind` は分類でしかないが、**`resolutionLevel` は次に聞くべきことを決める。**

1. **誰が解決するか**を聞く（`user` / `support` / `engineer` / `none` / `undecided`）
2. 決まったら、**そのレベルの対応文だけ**を聞く。他の2つは空のままでよい
3. `none` なら**3つとも聞く**——復旧不可でも「作り直してください」「この状態で進めて問題ありません」という案内は存在し、そこがサポートサイトで最も需要の高い問い合わせになる
4. `undecided` なら対応文は聞かない（誰が関与するかまだ決まっていないので、どれを埋めるべきかも決まらない）

アプリは「宣言したレベルの対応文が空」だけを黄色く塗る（関与しないレベルの空欄は塗らない）。**全レベルの対応文を一律に聞くと会議が止まり、埋めた大半は誰も読まない列になる。**
```

**(b) `resolutionLevel` の選び方（決定D）**

| 値 | 意味 |
| --- | --- |
| `user` | ユーザー自身で解決できる |
| `support` | サポート対応が必要 |
| `engineer` | エンジニアの介入（データメンテ等）が必要 |
| `none` | **検討した上で**誰にも解決できない（外部サービス障害・仕様上の制約） |
| `undecided` | **まだ決めていない**（＝warning。後で埋める） |

`none` と `undecided` の違いは「決めたかどうか」。**迷ったら `undecided`。** `none` は決定の記録なので、AI が勝手に付けてよい値ではない。

**「復旧不可」は `none` ではない**ことを明記する——元に戻せないだけで案内は存在する。データが消えて戻せないなら `user`（作り直してもらう）や `support`（謝罪と代替手段の案内）になる。ここを取り違えると、サポートが最も答えたい問い合わせに答えられなくなる。

**原因の分類を混ぜない**ことも書く（「ユーザーがデータを消したことによるエラー」は発生原因の分類であって対応主体の分類ではない。それは `causeForSupport` に書く）。

**(c) 2つの原因の書き分け**

| フィールド | 誰が読むか | 書くこと |
| --- | --- | --- |
| `causeForSupport` | サポート担当（と、その先のユーザー） | 業務レベルの原因。「入力した取引先コードが未登録」 |
| `causeForSpec` | 開発者 | 仕様レベルの原因。「取引先マスタに存在しないコードで検索 API が 404 を返す」 |

**分けた意味は出力の出し分けで回収される**（サポート向け出力に `causeForSpec` は載らない）。片方しか言えないなら片方だけ書く——**両方を埋めるために業務レベルの説明を仕様の言葉で書き直さない。** それをするとサポート向け出力が読めなくなり、分けた意味が消える。

**(d) `occurrence`（決定G）**

いまは手入力であること、本来は参照側からの導出であること、そのため**このカタログは網羅性を担保しないこと**（「表に載っていないエラー」は検出できない）を書く。Skill が「これで全部です」と言わないこと。

**(e) 聞き方の設計**

用語集版と同じ（1問1答で往復を重ねない／複数のエラーをまとめて聞く／登録対象の確定とは別の往復にする）。**エラーカタログ固有の形を1つ足す**: レベルが同じエラーをまとめて聞くと1往復で複数埋まる（「この3件はどれもサポート対応ですか？ なら、それぞれサポートが何をするか教えてください」）。

- [ ] **Step 6: 「4. ID採番」「5. 書き込み」を書く**

用語集版と同じ構造。差し替えるのはコマンド名と構造の例だけ:

```
node scripts/new-id.mjs 5
node scripts/error-catalog-write.mjs --in <下書き.json> --out <プロジェクト>/エラーカタログ.json
```

**必ず書くこと:**
- IDを自分で書かない・連番禁止・**既存エラーのIDは絶対に変更しない**（不変IDであり、将来 `error_` で他ツールから参照される）
- 既存ファイルへの追記は既存の内容を読んで下書きに含め、全体を書き出す。**`errors` の並び順を変えない**（配列順＝UIの表示順が正）。追加は末尾
- 全キー常在（欠損ではなく空の値で未記入を表す）
- 構造の例（全10フィールドが埋まった1件。詳細は `error-catalog.schema.json` を読む。スキーマが正）
- スキーマ検証に落ちたらアプリはそのファイルを開けない（レベル1拒否）

- [ ] **Step 7: 「6. 報告」を書く**

用語集版と同じ構造（スクリプトの出力をそのまま流さない／未記入の一覧は**次回の宿題リスト**として渡す）。**エラーカタログ固有の点を2つ足す:**

- **未記入の一覧は、アプリが黄色く塗るセルと同じ条件で出す**（スクリプトの要約がそうなっている）。関与しないレベルの空欄を宿題として報告しない——それを混ぜると宿題リストがノイズで埋まり、本当の未決が埋もれる
- **`（未定義）` が出力に並ぶのは正常**である。Markdown 出力は空フィールドを `（未定義）` と書く仕様で、これは負債が見えている状態。**「出力が未定義だらけなので埋めましょう」と AI が言わない**（決めていないことを消せなくするのがこのツールの思想）

- [ ] **Step 8: 「7. 書き足し（既存エラーを埋める）」を書く（決定F）**

用語集版に無い節。エラーカタログでは「とりあえず名前だけ登録 → 後で埋める」が常態になる。

```markdown
## 7. 書き足し（既存エラーを埋める）

「アプリで黄色いセルを埋めたい」「あのエラーの対応方法が決まった」と言われたときの手順。

1. 既存カタログを読み、**どのエラーか**をユーザーに確定させる（名前が似ているものがあるので、勝手に選ばない）
2. 埋める項目をヒアリングする（手順3と同じ。`resolutionLevel` が `undecided` から変わるなら、新しいレベルの対応文を聞く）
3. **既存の JSON 全体を下書きに含め、該当エラーの該当フィールドだけを差し替えて**書き出す

**守ること:**

- **`id` を変えない**（不変ID。書き換えると将来の参照が切れる）
- **`errors` の配列順を変えない**（並べ替えは意味のない diff を生む）
- **触っていないエラーのフィールドを1バイトも変えない。** 「ついでに」文章を整えると、Git diff が仕様の変更履歴として読めなくなる
- 書き出したら `git diff` に出る行が意図した範囲に収まっているかをユーザーに伝える
```

- [ ] **Step 9: 「やらないこと」を書く**

用語集版の3点（MCP的な書き込みツールを作らない／アプリ側の検証を代行しない／既存データの勝手な整形をしない）に、**エラーカタログ固有の2点**を足す:

- **`occurrence` を他ツールから導出しない。** 参照の実装はまだ無く、導出はスキーマ改訂を伴う変更である（session-notes 3節）
- **網羅性を主張しない。** 「これで全部のエラーが載りました」と言わない。網羅性はロジックツリーの葉やシーケンスの失敗ゾーンが持つべきもので、参照が実装されて初めて回収される

- [ ] **Step 10: 自分で読み返して、指示が実行可能か確かめる**

書き終えたら**自分が初見の実行者になったつもりで頭から読み、次を確かめる:**

- 手順1〜7を順に実行できるか（次に何をするか迷う箇所が無いか）
- スクリプトのコマンドが Task 1 の実物と一致しているか（引数名・ファイル名）
- 「なぜ」が書かれていない手順が無いか
- 用語集版と**同じことを言っている箇所で語彙がぶれていないか**（「未記入」「未定義」「warning」の使い分け）

**矛盾や欠落を見つけたら、辻褄を合わせずに報告する。**

- [ ] **Step 12: コミット**

```bash
git add .claude/skills/error-catalog-register/SKILL.md
git commit -m "feat(skill): エラー登録 Skill の手順書を書く"
```

---

## Task 3: evals

**Files:**
- Create: `.claude/skills/error-catalog-register/evals/evals.json`
- Create: `.claude/skills/error-catalog-register/evals/grade.mjs`
- Create: `.claude/skills/error-catalog-register/evals/fixtures/existing-project/エラーカタログ.json`
- Create: `.claude/skills/error-catalog-register/evals/fixtures/message-list-project/エラーメッセージ一覧.md`

**Interfaces:**
- Consumes: Task 1 のスクリプト、Task 2 の `SKILL.md`
- Produces: `node evals/grade.mjs <iteration-dir>` が各 run に `grading.json` を書く

**評価の対象は「Skill が何をしたか」であって出力の文言ではない。** 判定は**ファイルの中身**に対して機械的に行う（用語集版の `grade.mjs` がそうなっている）。

- [ ] **Step 1: fixtures を書く**

`fixtures/existing-project/エラーカタログ.json` — 既存2件のカタログ。**片方を意図的に未記入だらけにする**（書き足しの eval で使う）:

```json
{
  "schemaVersion": 1,
  "type": "errorCatalog",
  "title": "受注管理 エラーカタログ",
  "errors": [
    {
      "id": "error_Qw8ZxLm2Kt",
      "name": "取引先が見つからない",
      "occurrence": "受注登録で取引先コードを入力して確定したとき",
      "resolutionLevel": "user",
      "causeForSupport": "入力した取引先コードが未登録",
      "causeForSpec": "取引先マスタに存在しないコードで検索し 404 が返る",
      "userAction": "取引先コードを確認して入れ直す。未登録なら取引先登録を先に行う",
      "supportAction": "",
      "engineerAction": "",
      "notes": ""
    },
    {
      "id": "error_Hj4NbVc9Ry",
      "name": "在庫引当に失敗する",
      "occurrence": "",
      "resolutionLevel": "undecided",
      "causeForSupport": "",
      "causeForSpec": "",
      "userAction": "",
      "supportAction": "",
      "engineerAction": "",
      "notes": "在庫がマイナスになる経路があるらしい。次回の会議で確認する"
    }
  ]
}
```

`fixtures/message-list-project/エラーメッセージ一覧.md` — 実装から吐き出したような一覧。**「ユーザーが遭遇して問い合わせうる事象」と「実装の都合で出るメッセージ」を混ぜておく**（手順2の判断が効いているかを見るため）:

```markdown
# エラーメッセージ一覧（実装から抽出）

| コード | メッセージ | 出る場所 |
| --- | --- | --- |
| E1001 | 取引先が見つかりません | 受注登録 |
| E1002 | 在庫が不足しています | 引当処理 |
| E1003 | 権限がありません | 受注削除 |
| E2001 | 必須項目が未入力です | 各画面の入力検証 |
| E2002 | 数値を入力してください | 各画面の入力検証 |
| E9001 | 内部エラー (NullReferenceException) | 全画面共通のハンドラ |
| E9002 | データベース接続に失敗しました | 全画面共通のハンドラ |
```

- [ ] **Step 2: `evals.json` を書く**

4ケース。`<PROJECT_DIR>` は用語集版と同じプレースホルダ:

```json
{
  "skill_name": "error-catalog-register",
  "evals": [
    {
      "id": 0,
      "name": "new-catalog-from-conversation",
      "prompt": "いま仕様を詰めている最中で、プロジェクトフォルダは <PROJECT_DIR> です。会議で出たエラーをカタログに残しておきたい。1つ目は「取引先が見つからない」——受注登録で取引先コードを入れて確定したときに出ます。原因は未登録のコードを入れたケースで、ユーザーがコードを確認して入れ直せば解決します。2つ目は「在庫引当に失敗する」——これは誰が対応するのかも含めて、まだ何も決まっていません。",
      "expected_output": "<PROJECT_DIR> に type=errorCatalog の JSON が1つ作られる。2件とも登録され、1件目は resolutionLevel=user かつ userAction が埋まる。2件目は resolutionLevel=undecided で、occurrence・原因・対応3種がすべて空のまま（AIが推測で埋めない）。ID は error_ + 英数字10文字。ファイルは正規形（キー順・LF・末尾改行）。",
      "files": []
    },
    {
      "id": 1,
      "name": "append-to-existing-catalog",
      "prompt": "<PROJECT_DIR> のプロジェクトにエラーを1件足してください。「受注を削除できない」——他部署が作成した受注を削除しようとしたときに出ます。これはサポートが権限を確認して、必要なら代理で削除する運用です。",
      "expected_output": "既存のエラーカタログに追記される（2つ目のカタログファイルを作らない）。既存2件の id・配列順・全フィールドが1バイトも変わらず、新規エラーが末尾に追加される。新規エラーは resolutionLevel=support かつ supportAction が埋まり、userAction と engineerAction は空のまま。",
      "files": ["fixtures/existing-project/エラーカタログ.json"]
    },
    {
      "id": 2,
      "name": "fill-in-existing-error",
      "prompt": "<PROJECT_DIR> のエラーカタログにある「在庫引当に失敗する」の対応が決まりました。エンジニアが在庫データを補正する必要があります（引当済みレコードが残ってしまうケース）。発生タイミングは受注確定時です。",
      "expected_output": "既存エラー error_Hj4NbVc9Ry の resolutionLevel が engineer になり、engineerAction と occurrence が埋まる。id は変わらない。配列順が変わらない。もう1件（error_Qw8ZxLm2Kt）のフィールドが1バイトも変わらない。新しいエラーを追加しない。",
      "files": ["fixtures/existing-project/エラーカタログ.json"]
    },
    {
      "id": 3,
      "name": "extract-from-message-list",
      "prompt": "<PROJECT_DIR>/エラーメッセージ一覧.md が実装から抽出したエラーメッセージの一覧です。ここからエラーカタログを作っておいてもらえますか。プロジェクトフォルダは <PROJECT_DIR> です。",
      "expected_output": "一覧から候補を提示してユーザーに確定を取る（全件を独断で登録しない）。入力検証（E2001/E2002）や内部エラー（E9001）のような実装都合のメッセージをそのまま1件ずつ登録していない。書き出す場合はスキーマ検証を通り正規形で、原因・対応を推測で埋めない。",
      "files": ["fixtures/message-list-project/エラーメッセージ一覧.md"]
    }
  ]
}
```

- [ ] **Step 3: `grade.mjs` を書く**

`.claude/skills/glossary-term-register/evals/grade.mjs` をコピーし、次を差し替える。**ハーネスの骨格（`ITER` の解釈・run ディレクトリの走査・`grading.json` の書き出し・`push()` の形）は変えない:**

| 箇所 | 変更内容 |
| --- | --- |
| `SKILL` 定数 | `.../skills/error-catalog-register` |
| `SCHEMA` 定数 | `.../schemas/error-catalog.schema.json` |
| `ID_RE` | `/^error_[A-Za-z0-9]{10}$/` |
| `glossaryFiles()` | `catalogFiles()` にリネームし、`j?.type === "errorCatalog"` で拾う |
| `canonical()` | 呼ぶスクリプトを `scripts/error-catalog-write.mjs` に |
| `byName()` | `terms` → `errors`（`(errors, n) => errors.find((e) => e.name === n)`） |
| `assertionsFor()` | **下記4ケース分に全面差し替え** |

各ケースの assertion（`push(説明, 判定, 根拠)` の形で書く）:

**eval 0（会話から新規作成）**
- カタログファイルがちょうど1つある
- スキーマ検証を通り、正規形と一致する
- `errors` が2件で、`name` に「取引先が見つからない」「在庫引当に失敗する」が両方ある
- 「取引先が見つからない」は `resolutionLevel === "user"` かつ `userAction !== ""`
- **「在庫引当に失敗する」は `resolutionLevel === "undecided"` かつ `occurrence`・`causeForSupport`・`causeForSpec`・`userAction`・`supportAction`・`engineerAction` がすべて `""`**（推測で埋めていない。**このケースがこの eval の主眼**）
- 全件の `id` が `ID_RE` に一致する

**eval 1（既存への追記）**
- カタログファイルがちょうど1つ（2つ目を作っていない）
- スキーマ検証を通り、正規形と一致する
- `errors` が3件
- **先頭2件の `id` が `error_Qw8ZxLm2Kt` / `error_Hj4NbVc9Ry` の順のまま**、かつ**その2件の JSON がフィクスチャと完全一致**（`JSON.stringify` で比較）
- 3件目が「受注を削除できない」で、`resolutionLevel === "support"` かつ `supportAction !== ""`
- 3件目の `userAction` と `engineerAction` が `""`（関与しないレベルを埋めていない）

**eval 2（書き足し）**
- `errors` が2件のまま（新規追加していない）
- `id` の並びが `error_Qw8ZxLm2Kt` / `error_Hj4NbVc9Ry` のまま
- **`error_Qw8ZxLm2Kt` の JSON がフィクスチャと完全一致**（触っていないエラーを変えていない。**このケースの主眼**）
- `error_Hj4NbVc9Ry` の `resolutionLevel === "engineer"`、`engineerAction !== ""`、`occurrence !== ""`
- `error_Hj4NbVc9Ry` の `id` がフィクスチャと同じ

**eval 3（資料からの抽出）**
- カタログを書いた場合、スキーマ検証を通り正規形と一致する
- **`errors` の `name` に「必須項目が未入力です」「数値を入力してください」「内部エラー」を含む要素が無い**（実装都合のメッセージをそのまま登録していない）
- 書いた場合、`causeForSupport` と `causeForSpec` が**両方とも埋まっているエラーが1件も無い**（資料に原因が書かれていないので、推測で埋めていれば埋まる）
- **書き出していない場合も pass にする**（確定を取る途中で止まるのは正しい振る舞い）。この eval は「独断で全件登録していないこと」を見るものなので、判定は「ファイルが無い」または「上の条件を満たす」

- [ ] **Step 4: ハーネスが動くことを確かめる**

fixtures をコピーした偽の run ディレクトリを作り、grade.mjs が判定を出せることを見る（**Skill を実際に走らせるのは人間の作業**。ここで確かめるのはハーネスが壊れていないことだけ）:

```bash
cd .claude/skills/error-catalog-register
mkdir -p /tmp/ec-iter/eval-1-run-1
cp evals/fixtures/existing-project/エラーカタログ.json /tmp/ec-iter/eval-1-run-1/
node evals/grade.mjs /tmp/ec-iter
cat /tmp/ec-iter/eval-1-run-1/grading.json
rm -rf /tmp/ec-iter
```

Expected: `grading.json` が書かれ、assertion が並ぶこと。**このケースは「3件になっているはず」の eval 1 に2件のファイルを置いているので、件数の assertion が `passed: false` になるのが正しい**——全部 pass したらハーネスが何も見ていない。

- [ ] **Step 5: コミット**

```bash
git add .claude/skills/error-catalog-register/evals
git commit -m "feat(skill): エラー登録 Skill の evals を追加する"
```

---

## Task 4: ドキュメントの更新

**Files:**
- Modify: `docs/open-issues.md`
- Modify: `docs/README.md`

- [ ] **Step 1: `open-issues.md` から解消した項を消す**

`## 将来の機能を作った瞬間に踏むもの` にある**「エラー登録 Skill が無い」の項を削除する**（M10 で足したもの）。解消したものは消すのが規約——消したこと自体はこの Skill のコミット履歴に残る。

**冒頭の「最終更新」を、この作業の完了時点に直す。**

**他の項目は消さない。** 規約8（表記ゆれ検知の宣言）・`gen-types` の残骸掃除・その他はいずれもこの Skill では解消しない。

- [ ] **Step 2: 新しく見つけた残件があれば足す**

実装中に見つけたものがあれば `[Skill]` のタグで足す。**候補として最低1件は検討すること:**

- **同梱スクリプトの警告判定が、アプリの `warnings.ts` / `consistency.ts` の複製になっている**（Task 1 の実装で確定した事実）。スキーマの `resolutionLevel` enum が改訂されたら両方を追従させる必要がある。**接点はファイルだけという決定の帰結なので構造的に避けられない**が、追従漏れが起きうる箇所として記録する価値があるかを判断する

判断した結果「足さない」なら、それでよい（**足さない判断をしたことを報告に書く**）。

- [ ] **Step 3: `docs/README.md` を確かめる（直すとは限らない）**

「リポジトリ内の他の『正』」の節の `.claude/skills/` の行は、この計画を書いた時点では

> `.claude/skills/` — AI 側の実装。アプリと**正規形が完全一致**していなければならない

と**ツール名を含まない一般的な書き方**になっている。Skill が2本になっても嘘にならないので、**そのままなら変更不要**。

**確かめるのはここだけで、README の他の箇所を「ついでに」直さない。** 変更が要らなかったらそれでよく、その旨を報告に書く（変更しなかったという事実も判断の記録である）。

- [ ] **Step 4: 検証**

```bash
npm test && npx tsc -b && npm run lint
git status --short
```

Expected: すべて緑（この Skill はアプリのコードに触れていないので当然だが、**触れていないことの確認**として回す）。`git status --short` に `src/` の変更が無いこと。

- [ ] **Step 5: コミット**

```bash
git add docs/
git commit -m "docs: エラー登録 Skill の完成を残件へ反映する"
```

---

## 完了条件

- [ ] `node scripts/new-id.mjs` が `error_` ＋10文字を出す
- [ ] `node scripts/error-catalog-write.mjs --check <正しいカタログ>` が検証OK・正規形一致を報告する
- [ ] 3つの警告（ID重複・エラー名の重複・対応文の未記入）がそれぞれ出ることを実際に確認した
- [ ] **関与しないレベルの空欄が未記入の集計に出ないこと**を実際に確認した（決定14の判定がスクリプトに正しく入っている）
- [ ] スキーマ違反が終了コード1で落ちる
- [ ] 書き出したファイルが正規形（キー順・LF・末尾改行・BOMなし）
- [ ] `SKILL.md` の手順が Task 1 のスクリプトの実物と一致している
- [ ] evals のハーネスが動き、**壊れているケースを `passed: false` にできる**
- [ ] `npm test && npx tsc -b && npm run lint` が緑（アプリに触れていないことの確認）
- [ ] `docs/open-issues.md` から「エラー登録 Skill が無い」が消えている

**実機確認（人間の作業）:** 実際にこの Skill を起動して、サンプルプロジェクトにエラーを2〜3件登録してみる。見るのは次の3点:

1. **`resolutionLevel` を先に聞いてから対応文を聞いているか**（決定Cが効いているか）
2. **答えられなかった項目を空のまま書いているか**（推測で埋めていないか）
3. 報告の未記入一覧が、アプリで黄色くなるセルと一致しているか

**サンプルプロジェクトの変更はコミットしない**（`git checkout -- sample-project/ && git clean -fd sample-project/`）。
