# Skill の前準備をなくす（設計）

## 背景・目的

同梱 Skill は、置かれた先で**利用者に2つの前準備を要求している**。

1. **Skill ディレクトリごとの `npm install`**（5本ぶん）——書き出しスクリプトが `require("ajv/dist/2020.js")` でスキーマ検証器を実行時に解決するため。各 `SKILL.md` が「初回のみ `npm install`」を指示している
2. **Node 22.18+ / 23.6+ / 24+**——スクリプトが同梱の `.ts`（アプリのバイト一致コピー）を `import()` で直接読むため、型ストリップがフラグ無しで動く版が要る

どちらも「会議で使う人」には無関係な作業であり、失敗の仕方も分かりにくい。1 を怠ると `ajv が見つかりません`、2 を怠ると `同梱の .ts を読み込めません` で、**いずれも書き出しの直前まで進んでから落ちる**。

本マイルストーンは**この2つを両方とも消す**。狙いは「facet でフォルダを開いたら、Skill はそのまま動く」である。

**追加の依存は要らない。** `ajv` はルートの `dependencies` に既にあり（standalone は ajv 同梱の機能）、`.ts` の変換は devDependencies の `typescript` の `transpileModule` で足りる。

## スコープ

**やること**

- スキーマ検証を **ajv の standalone コンパイル済み検証関数**（依存ゼロの `.mjs`）へ置き換える
- 同梱の共有 `.ts` を **ビルド時にトランスパイルした `.mjs`** へ置き換える
- 生成物を `gen:types` と同じ列（`pretest` / `prebuild` / `predev` / `prepare`）に載せる
- バイト一致コピーの検査を、生成物の実走検査へ置き換える

**やらないこと**

- **旧版が作った `node_modules` / `package-lock.json` の掃除**（人間の裁定）。アプリが数百 MB を黙って消すことはしない。`isRemovableSkillEntry` の保護はそのまま残し、旧版を使ったフォルダにはそれらが残り続ける
- Skill のバンドル（esbuild などで1ファイルに畳む）。いま同梱する8ファイルはすべて値 import を持たず、その制約はテストで固定済みなので、単純トランスパイルで足りる
- `palette-retheme`（`BUNDLED_SKILLS` に無い。ユーザーのフォルダには置かれない）

### 到達点

| | いま | あと |
| --- | --- | --- |
| 前準備 | Skill ごとに `npm install` ×5 | **無し** |
| Node の下限 | 22.18+（型ストリップ） | **Claude Code が動く版**（18+） |
| 置かれるディスク | 数百 MB（`node_modules`） | 生成物 **15〜74 KB / Skill**（実測。内訳は下の2表） |

Node の下限が 18+ になる根拠は実測である。共有 `.ts` 4本は ES2020 より新しい API を1つも使っておらず、手書きスクリプトで新しいのは `flatMap`（ES2019）1箇所のみ。変換ターゲットを **ES2022** に置けば、残る要求は手書きスクリプトの top-level await（14.8+）と standalone 出力の `at()`（16.6+）だけになる。**Node そのものが要ることは消せないが、Claude Code 自身が Node で動く以上、実質的な下限はそれに一致する。**

## 設計

### 1. 生成パイプライン（`scripts/gen-skills.mjs` 新規）

`scripts/gen-types.mjs` と同じ思想で書く（**正は1つ、コピーを手で作らない**）。

```
schemas/<name>.schema.json ──ajv/dist/standalone──> .claude/skills/<skill>/scripts/generated/validate.mjs
src/**/<shared>.ts ─────ts.transpileModule(ES2022)──> .claude/skills/<skill>/scripts/generated/<shared>.mjs
```

standalone の生成は `code: { source: true, esm: true }` を渡した Ajv2020 で行う。5本すべてを実測した:

| スキーマ | 出力 | 素の `require()` |
| --- | --- | --- |
| `logic-tree` | 10,927 B | 0 |
| `glossary` | 14,025 B | **1** |
| `error-catalog` | 19,054 B | **1** |
| `sequence` | 39,921 B | **1** |
| `issue-tree` | 59,716 B | 0 |

**`esm: true` を渡しても、CJS の `require` が1件残るスキーマがある。** `minLength` / `maxLength` を持つスキーマで、ajv が長さの数え方（サロゲートペアを1文字と数える）を `require("ajv/dist/runtime/ucs2length").default` として埋め込むためである。**この文字列は ajv 側のソースに定数として書かれている**（`ucs2length.code`）ので、置換対象として安定して狙える。

したがって生成の最後に**埋め込み置換**を通す。実体は `node_modules/ajv/dist/runtime/ucs2length.js` から逐語で写した20行で、置換後に `require(` が1件でも残っていたら**生成を失敗させる**:

```js
function inlineAjvRuntime(src, name) {
  let out = src
  for (const [needle, impl] of Object.entries(AJV_RUNTIME_INLINE)) out = out.split(needle).join(`(${impl})`)
  const left = [...out.matchAll(/\brequire\(([^)]*)\)/g)].map((m) => m[1])
  // 黙って通すと「実行するまで壊れていると分からない生成物」が出る
  if (left.length > 0) throw new Error(`${name}: 未知の ajv ランタイムが残った: ${JSON.stringify(left)}`)
  return out
}
```

**未知のランタイムで throw することが肝である。** ajv を上げて別のランタイムを要求するようになったとき、ここで止まらなければ壊れた生成物が黙って配布される。

置換後の実測（5本とも）: `require` ゼロ、お手本 JSON を `true`、`schemaVersion` を壊した版を `false`。エラーオブジェクトの形は ajv 本体と同一（`instancePath` / `keyword` / `params` / `message`）。

**エラーの形が同じなので、各スクリプトのエラー整形コードは無変更で通る。** これが standalone を選ぶ最大の理由である。

`transpileModule` は型注釈を落とすだけで、値 import の解決は行わない。**同梱する `.ts` が値 import を持たないという既存の制約は、そのまま生成の前提条件として残る**（テストで固定する。テスト方針を参照）。

共有4本も実測した。`target: ES2022` / `module: ESNext` で、**4本とも残る import 文ゼロ・診断ゼロ**（`reportDiagnostics: true` を渡した上での実測。渡さないと `out.diagnostics` は常に `undefined` で、素通りしているだけなのに0件に見える——一度この見落としをやった）:

| ソース | 出力 |
| --- | --- |
| `src/core/canonical.ts` | 1,289 B |
| `src/core/canvas/flat-tree-core.ts` | 5,155 B |
| `src/modules/sequence/questions.ts` | 7,139 B |
| `src/modules/issue-tree/derive.ts` | 12,536 B |

`import type` 文がすべて落ちるので、出力は自己完結した1ファイルになる。生成した `canonical.mjs` の `serialize` がアプリ側 `canonical.ts` と**同じ出力を返すことも、お手本5ファイルで確認済み**。

#### 対応表

`gen-types.mjs` はディレクトリ走査で済むが、**どの Skill がどの共有ソースを要るかは走査では決まらない**ので表を持つ。

```js
export const SKILL_SOURCES = {
  'glossary-term-register': { schema: 'glossary',      shared: ['src/core/canonical.ts'] },
  'error-catalog-register': { schema: 'error-catalog', shared: ['src/core/canonical.ts'] },
  'sequence-register':      { schema: 'sequence',      shared: ['src/core/canonical.ts', 'src/modules/sequence/questions.ts'] },
  'issue-tree-register':    { schema: 'issue-tree',    shared: ['src/core/canonical.ts', 'src/modules/issue-tree/derive.ts'] },
  'logic-tree-register':    { schema: 'logic-tree',    shared: ['src/core/canonical.ts', 'src/core/canvas/flat-tree-core.ts'] },
}
```

この表を `export` するのは、**`skill-canonical-copy.test.ts` が担っていた「網羅の強制」を引き継ぐため**である（rev 4章）。バイト一致の検査は生成にすれば不要になるが、**6本目の Skill を足した人が表に足し忘れたら赤くする**という役目は残す。

**`BUNDLED_SKILLS` から導出しない。** 導出すると恒真式になり何も縛らない——これは logic-tree-m2 が確立した理屈で、そのまま引き継ぐ。

0件のまま黙って成功しないこと（`gen-types.mjs` と同じガード）も引き継ぐ。

### 2. ファイル配置と `.gitignore`

生成物は各 Skill の `scripts/generated/` に置く。

```
.claude/skills/issue-tree-register/
  SKILL.md
  schemas/issue-tree.schema.json     ← 追跡（読み物。バイト一致コピーのまま）
  scripts/
    issue-tree-write.mjs             ← 追跡（手書き）
    new-id.mjs                       ← 追跡（手書き）
    generated/                       ← .gitignore
      validate.mjs
      canonical.mjs
      derive.mjs
```

ルートの `.gitignore` に足すのは **1行**（`.claude/skills/*/scripts/generated/`）。サブディレクトリに分けるのは、手書きの `*.mjs` と生成物の `*.mjs` が同じ階層に混ざると除外指定に例外が要るためである。

生成物を追跡しないのは `src/types/*.ts` と同じ扱い（人間の裁定）。**「コピーが原本からズレる」という事故が原理的に消える**代わりに、GitHub 上で `.claude/skills/` を見ても共有ロジックの実体は読めなくなる（正は `src/` 側にある、という状態になる）。

リポジトリから消えるもの:

- `.claude/skills/*/scripts/*.ts` — **8ファイル**（`canonical.ts` ×5、`derive.ts`、`questions.ts`、`flat-tree-core.ts`）
- `.claude/skills/*/package.json` — 5ファイル

`.claude/skills/*/.gitignore` は**残す**（旧版が作った `node_modules` を利用者の `git status` から隠し続けるため）。

### 3. Skill スクリプト側の変更

各 `*-write.mjs` の差分は2箇所。

```js
// 共有ロジック：import 先が .ts から生成物へ変わる
- [D, C] = await Promise.all([import("./derive.ts"), import("./canonical.ts")]);
+ [D, C] = await Promise.all([import("./generated/derive.mjs"), import("./generated/canonical.mjs")]);

// 検証器：実行時解決とコンパイルが消える
- const m = require("ajv/dist/2020.js");
- AjvCtor = m.default ?? m;
- const ajv = new AjvCtor({ allErrors: true, strict: false });
- const validate = ajv.compile(schema);
+ const { default: validate } = await import("./generated/validate.mjs");
```

**動的 import と try/catch は維持する。** 静的 import にすると生成物の欠落が `ERR_MODULE_NOT_FOUND` になり、読み手（Claude）に次の一手が伝わらない。診断の文言だけを差し替える:

```
いま: 同梱の .ts を読み込めません。Node の型ストリップが要ります（22.18+ / 23.6+ / 24+。現在 v20.x）
あと: Skill の生成物が見つかりません。facet でプロジェクトフォルダを開き直してください
      （アプリが .claude/skills/ を置き直します）
```

`ajv が見つかりません。次を実行してください: cd ... && npm install` の診断は**まるごと消える**。

`validate.errors` を読むエラー整形（`instancePath` を「(ルート)」に落とす処理など）は**そのまま**。`new-id.mjs` は ajv も `.ts` も使っていないので変更なし。

### 4. スキーマの位置づけの変更（`--schema` の廃止）

いまスキーマは実行時に探索され、3つの経路で差し替えられる:

1. `--schema <path>`
2. 環境変数 `FACET_<TOOL>_SCHEMA`
3. `findSchema()` の上向き探索（出力先 → cwd → Skill ディレクトリの順に、親を辿って `<name>.schema.json` と `schemas/<name>.schema.json` を探す。約20行）

standalone にすると検証ロジックは生成時に焼き付くので、**この3経路はすべて効かなくなる。廃止する。**

**ただしスキーマの実体そのものは、検証をやめても実行時に要る。** `src/core/canonical.ts` の `serialize(value, schema)` は**キー順をスキーマの `properties` 記載順から実行時に導出する**（「ハードコード禁止」とファイル冒頭に明記されている）。したがって `schemas/<name>.schema.json` は読み込み続ける——変わるのは**どう探すか**だけである:

```js
// 3経路の探索（約20行の findSchema()）を、同梱物の固定パス1行へ
- const schemaPath = findSchema();
+ const schemaPath = path.join(SKILL_DIR, "schemas", "issue-tree.schema.json");
```

`SKILL_DIR` と `fileURLToPath` はこのために残る。消えるのは `createRequire`（ajv の解決にしか使っていない）である。

**探索を削ってよい理由**：検証が生成時に焼き付いた以上、外部スキーマを渡せる状態は**検証は同梱スキーマ・キー順は外部スキーマ**というちぐはぐな組み合わせを許すことになる。差し替えても「アプリが開けるか」の保証は増えず、**古いスキーマでキー順だけ変わったファイルを書き出す**経路が残るだけである。

`src/core/skill-schema-copy.test.ts` のバイト一致検査はそのまま（コピーが要る理由は変わらない）。

エラー出力と成功時出力の `スキーマ: <path>` 行（各スクリプト2箇所）は落とす。常に同梱スキーマを指すようになり、情報を運ばなくなるため。

### 5. 同期・配布（`src/core/skill-sync.ts` / Rust）

**ロジックは1つも変わらない。** 変わるのはコメントに書かれた理由だけである。

| 対象 | 変更 |
| --- | --- |
| `shouldSyncSkillFile` | **なし**。除外リスト方式なので `scripts/generated/` は自動的に同期される |
| — そのコメント | 「`package.json` は除外しない（実行時のマニフェスト）」の段落を削除。同梱物から消えるため |
| `isRemovableSkillEntry` / `SKILL_DEPS_DIR` / `SKILL_LOCK_FILE` | 残す。理由を「利用者の `npm install` の結果を守る」→「**旧版が作った残骸を消さない**」へ書き換え |
| `shouldDescendSkillDir` | 残す。ビルド機に旧 `node_modules` があると数百ファイルを読んで捨てる問題は変わらない |
| 書き込みループ | **なし**。ファイルごとに `mkdir(dir)` を呼ぶので `generated/` は作られる |
| `allow_skill_dir`（`src-tauri/src/lib.rs`） | **なし**。`.gitignore` を置き続けるため、mac の `allow_file` は要る |

## テスト方針

| | いま | あと |
| --- | --- | --- |
| `src/core/skill-canonical-copy.test.ts` | 5本の `canonical.ts` のバイト一致＋網羅の強制 | **網羅の強制だけ残す**。`SKILL_SOURCES` のキー ≟ `BUNDLED_SKILLS`（手書きリテラルのまま） |
| 各モジュールの `skill-copy.test.ts` | バイト一致＋値 import なし＋enum なし | **バイト一致を廃止**。残り2本は対象を `src/` 側の原本へ移して残す |
| `src/core/skill-schema-copy.test.ts` | スキーマのバイト一致 | **そのまま** |
| `isValueImportStatement` のケース表 | sequence の `skill-copy.test.ts` に同居 | **そのまま**（回帰の履歴を切らない） |
| 生成物の実走 | 無し | **新設** |

新設するテストが本マイルストーンの要である。バイト一致を捨てる代わりに、**変換が壊れていないことを出力の一致で見る**:

- 生成した `validate.mjs` が、お手本の JSON を `true` にし、スキーマ違反を `false` にする（5本ぶん）
- 生成した `canonical.mjs` の出力が、アプリ側 `src/core/canonical.ts` の出力とバイト単位で一致する
- 生成した `derive.mjs` / `questions.mjs` / `flat-tree-core.mjs` が、それぞれのアプリ側実装と同じ結果を返す
- **生成物に `require(` が1件も残らない**（5本の `validate.mjs` すべて）——`inlineAjvRuntime` の throw と二重に張る。ajv を上げて別のランタイムを要求するようになったとき、生成時と検査時の両方で止まる

生成物は `pretest` で作られるのでテストから読める。

### 実機確認（人間の手が要る）

サブエージェントは Tauri の GUI を操作できないため、以下は人間が踏む。

- [ ] **前準備なしで書き出しが通る**——facet で新しいフォルダを開き、`npm install` を一切せずに5本の Skill それぞれで書き出しをさせる
- [ ] 開いたフォルダの `.claude/skills/*/scripts/generated/` に3〜4ファイルが置かれ、`node_modules` が**作られない**
- [ ] `package.json` が置かれない（新しいフォルダで）
- [ ] **旧版を使っていたフォルダを開く**——`node_modules` と `package-lock.json` が残ったまま、書き出しが新しい経路で通る
- [ ] スキーマ違反のファイルを `--check` に食わせ、エラー表示が従来と同じ読み味である（`スキーマ: <path>` 行が消えたこと以外）
- [ ] **開発機と違う OS**（mac。`.gitignore` の `allow_file` 経路が生きていること、`.DS_Store` の消し残し警告が従来どおり）
- [ ] Node 18 系で書き出しスクリプトが通る（下限の実証。開発機とは別に用意する）

## 未検証として残るもの

- **Node 18 での実走**は上のチェックリストに入れたが、開発機は 22.20 であり、CI も無い。**下限の主張は構文とAPIの調査に基づく見積もりであって、実走の記録ではない**——実機確認で踏むまではそう扱う
- `transpileModule` はトランスパイルのみで型検査をしない。**型の誤りは `tsc -b` が `src/` 側で捕まえる**という前提に乗っている（同梱物側では見ない）
- standalone 出力の互換性は ajv の版に依存する。`dependencies` の `ajv` を上げたとき、生成物の形が変わる可能性がある（生成物の実走テストが検知する）
- **`ucs2length` の埋め込みは ajv のソースから写した実体である。** ajv を上げたとき、*別の*ランタイムを要求するようになれば `inlineAjvRuntime` が throw して止まるが、**同じ名前のまま実装だけが変わった場合は検知できない**——写した20行が古いまま使われ続ける。長さの数え方はコードポイント数という仕様で固定されており変わる見込みは薄いが、**機械では守っていない**

## ドキュメントの更新

- **`docs/history/m30-core-skill-no-install.md` を新規作成**
- **`docs/open-issues.md`**——実機確認が未実施の項目のうち**4番と7番**が、確認事項として「置かれた先で `npm install` した後の状態」を挙げている。「置かれた先で**追加の手順なしに**動くこと」へ書き換える（**当初この設計は9番も対象と書いていたが誤り**。9番に該当記述は無いことが Task 7 の実装で判明した）
- **`docs/overview-rev.md`** 3箇所（**4章に2つ、5章に1つ**）
  - **4章**「アプリのロジックを同梱スクリプトから使う方法」——バイト一致コピー方式から生成方式へ。**網羅の強制と「導出しない」の理屈は残る**（対象が `CANONICAL_COPIES` から `SKILL_SOURCES` に移る）。型ストリップ依存の記述を削除
  - **4章**「Skillの配布と同期」——`package.json` を同梱する記述を削除。`node_modules` / `package-lock.json` を消さない理由を「旧版の残骸」へ改訂
  - **5章** スキーマの実体を共有する項——コピーは引き続き実行時に読まれる（`serialize` のキー順導出）が、**検証の入力ではなくなり、探索ではなく固定パスで読む**旨
- **`CLAUDE.md`**——`git clean -fdx` の理由書き（「`.claude/skills/` は `npm install` 済みで数百 MB になる」）を、生成物 `scripts/generated/` の話へ差し替える

## 参照

- `src/core/skill-sync.ts` — 同梱 Skill の同期（純ロジック）
- `src/fs/skill-resources.ts` — resources の読み出しとプロジェクトフォルダへの書き込み
- `scripts/gen-types.mjs` — 生成物の扱いの前例
- `docs/overview-rev.md` 4章 — バイト一致コピー方式とその理屈
- `docs/history/sequence-m4-register-skill.md` — `package.json` を同梱物にした経緯（本設計が覆す判断）
