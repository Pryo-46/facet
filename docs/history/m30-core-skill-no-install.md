# M30 申し送り: Skill の前準備をなくす

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。

M30 は、同梱 Skill が置かれた先で**利用者に要求していた2つの前準備を、両方とも消す**マイルストーン。

1. **Skill ディレクトリごとの `npm install`**（5本ぶん）——書き出しスクリプトが `require("ajv/dist/2020.js")` でスキーマ検証器を実行時に解決していた
2. **Node 22.18+ / 23.6+ / 24+**——スクリプトが同梱の `.ts`（アプリのバイト一致コピー）を `import()` で直接読んでおり、型ストリップがフラグ無しで動く版が要った

どちらも「会議で使う人」には無関係な作業で、失敗の仕方も分かりにくかった（1 を怠ると `ajv が見つかりません`、2 を怠ると `同梱の .ts を読み込めません`。**いずれも書き出しの直前まで進んでから落ちる**）。設計スペックは [`../superpowers/specs/2026-08-31-m30-skill-no-install-design.md`](../superpowers/specs/2026-08-31-m30-skill-no-install-design.md)、実装計画は [`../superpowers/plans/2026-08-31-m30-skill-no-install.md`](../superpowers/plans/2026-08-31-m30-skill-no-install.md)。

コミット範囲: `4603624`（設計）〜 本コミット。計画は Task 1〜8 の8本で、**Task 8（実機確認）は 2026-08-31 に依頼者が Windows 機で一巡し、問題は出なかった**（10項目のうち7項目を通し、**mac と Node 18 系の2項目は別の環境が要るため未実施のまま残る**。後述）。

| Task | コミット | 内容 |
| --- | --- | --- |
| 1 | `619a077` | `scripts/gen-skills.mjs`（`SKILL_SOURCES` と ajv standalone の生成）＋ `scripts/gen-skills.test.mjs`。`.gitignore` に生成物を追加し、`predev` / `prebuild` / `pretest` / `prepare` の4経路へ `gen:skills` を載せた |
| 2 | `980a839` → `c7d32b8` | 共有 `.ts` の `ts.transpileModule` 変換を同じ生成へ追加（2つ目は計画の誤り2件を実装からの報告で直したもの） |
| 3 | `77bfea9` → `77d6f5e` | `issue-tree-register` を生成物へ切り替え（2つ目は検証手順を Windows で通る形へ直したもの） |
| 4 | `478a3aa` | 残り4本（glossary / error-catalog / sequence / logic-tree）を同じ形へ |
| 5 | `f01daae` | 旧コピー（`.ts` 8本）・`package.json` 5本・旧テスト4本を削除し、`isValueImportStatement` のケース表を `src/core/import-analysis.test.ts` へ移送（`skill-sync.ts` の JSDoc 3箇所も書き換え。**ロジックは無変更**） |
| 6 | `3d6829c` | `SKILL.md` 5本から前準備とスキーマ差し替えの記述を削除（＋ `skill-sync.ts` の JSDoc 1箇所） |
| 最終レビュー | `66f98ab` → `59b2ef2` | ブランチ全体のレビュー2巡ぶんの修正。**利用者の手元へ配られるもの**の直し（README・SKILL.md 3本が消したはずの `npm install` とバイト一致コピーを指示したまま／書き出しスクリプトのヘッダの旧機構の説明／**共有ソースの JSDoc が配布物の `.mjs` へそのまま写ること**）と、生成の穴（**ucs2length の手写しをやめて ajv 実行時から導出**／`generated/` を作り直す前に空にする／残存 `require` の走査の誤検知／`reportDiagnostics: true`）|
| 7 | 本コミット | rev 8箇所・`CLAUDE.md` 2箇所・[`../open-issues.md`](../open-issues.md)・`skill-sync.ts` のコメント2箇所・本書（レビュー round 1 の修正を含む。**rev の8箇所のうち5箇所と `CLAUDE.md` の1箇所はレビューが見つけたもの**） |

---

## 何を作ったか

```
schemas/<name>.schema.json ──ajv/dist/standalone──> .claude/skills/<skill>/scripts/generated/validate.mjs
src/**/<shared>.ts ─────ts.transpileModule(ES2022)──> .claude/skills/<skill>/scripts/generated/<shared>.mjs
```

`scripts/gen-types.mjs` と同じ思想（**正は1つ、コピーを手で作らない**）で `scripts/gen-skills.mjs` を新設し、生成物は `.gitignore` に入れて**追跡しない**（`src/types/*.ts` と同じ人間の裁定）。追加の依存は要らなかった——`ajv` はルートの `dependencies` に既にあり（standalone は ajv 同梱の機能）、`.ts` の変換は devDependencies の `typescript` で足りる。

リポジトリから消えたもの:

- `.claude/skills/*/scripts/*.ts` — **8ファイル**（`canonical.ts` ×5・`derive.ts`・`questions.ts`・`flat-tree-core.ts`）
- `.claude/skills/*/package.json` — 5ファイル（sequence M4 で同梱物にした判断を覆した）
- 旧テスト4本 — `src/core/skill-canonical-copy.test.ts` と各モジュールの `skill-copy.test.ts` 3本

**同梱物として消えたのは合計13ファイル**（`.ts` 8 ＋ `package.json` 5）である。**設計スペックと Task 5 の報告は「`.ts` 7ファイル」と書いていたが、どちらも括弧内の列挙が8個あり、数のほうが誤りだった**（`git show --stat f01daae` で数え直した）。

`.claude/skills/*/.gitignore` は**残した**（旧版が作った `node_modules` を利用者の `git status` から隠し続けるため）。`schemas/<名前>.schema.json` のバイト一致コピーも**残した**（理由は後述）。

---

## 実装で確定した事項

### `esm: true` を渡しても、ajv の standalone 出力に CJS の `require` が残るスキーマがある

`minLength` / `maxLength` を持つスキーマでは、ajv が長さの数え方（サロゲートペアを1文字と数える）を `require("ajv/dist/runtime/ucs2length").default` として埋め込む。**5本のうち3本（`glossary` / `error-catalog` / `sequence`）で実際に残った。**

対処は**埋め込み置換**である（`inlineAjvRuntime`）。置換後に `ajv/dist/runtime/` を指す `require` が1件でも残っていたら**生成を失敗させる**。**未知のランタイムで止めることが肝である**——ajv を上げて別のランタイムを要求するようになったとき、ここで止まらなければ壊れた生成物が黙って配布される。同じことを `scripts/gen-skills.test.mjs` の「CJS の `require` が1件も残らない」でも見ており、**生成時と検査時の二重に張ってある**。

**埋め込む実体の取り方は、最終レビューの round 2（`66f98ab`）で変わった。** 初版は `node_modules/ajv/dist/runtime/ucs2length.js` から**20行を逐語で写して**いたが、いまは needle も実体も **ajv 自身が実行時に持っているもの**（`require('ajv/dist/runtime/ucs2length').default` の `.code` と `.toString()`）から取る。**手写しだと「同じ名前のまま実装だけが変わった ajv」に追従できない**——その穴を機械的に消した（当時「機械では守っていない」と書いていた項が、そのまま閉じた）。

**残存 `require` の走査も同じ round で絞った**——素の `\brequire\(([^)]*)\)` だと、standalone 出力が丸ごと抱えるスキーマの `description`（日本語の長文）に `require(` の4文字がたまたま現れただけで、的外れな理由で生成が止まる。いまは `require("ajv/dist/runtime/…")` の形だけを見る。

置換の実測コストは3本とも**ちょうど +430 B**（下の表の差分。逐語写しだった初版は +294 B で、`.toString()` が返す実体のほうが長い）。

### 検証をやめても、スキーマの実体は実行時に要る

`--schema` / 環境変数 `FACET_<TOOL>_SCHEMA` / `findSchema()` の上向き探索という3経路は、検証が生成時に焼き付いた以上どれも効かないので**廃止した**。外部スキーマを渡せる状態を残すと「**検証は同梱スキーマ・キー順は外部スキーマ**」というちぐはぐな組み合わせを許すことになり、古いスキーマでキー順だけ変わったファイルを書き出す経路が残るだけである。

**それでもスキーマの JSON そのものは読み込み続ける。** `src/core/canonical.ts` の `serialize(value, schema)` が**正規形のキー順をスキーマの `properties` 記載順から実行時に導出する**（「ハードコード禁止」とファイル冒頭に明記されている）ためで、**消えたのは探索であって読み込みではない**。約20行の `findSchema()` は、同梱物の固定パス1行に置き換わった。

```js
- const schemaPath = findSchema();
+ const schemaPath = path.join(SKILL_DIR, "schemas", "issue-tree.schema.json");
```

**したがって `schemas/<名前>.schema.json` のバイト一致コピーと `src/core/skill-schema-copy.test.ts` はそのまま残る。**

### 消えたのは `createRequire` だけで、`SKILL_DIR` と `fileURLToPath` は残った

ajv の実行時解決に使っていた `createRequire` は5本とも消えた。`SKILL_DIR` / `fileURLToPath` は**上のスキーマ読み込みのために残る**——「前準備が消えたのだからパス解決も消える」と読まないこと。

エラー整形（`validate.errors` の `instancePath` を「(ルート)」に落とす処理など）は**1文字も変えていない**。standalone のエラーオブジェクトが ajv 本体と同一の形（`instancePath` / `keyword` / `params` / `message`）だからで、**これが standalone を選んだ最大の理由である。**

動的 import と try/catch も維持した（静的 import にすると生成物の欠落が `ERR_MODULE_NOT_FOUND` になり、読み手である Claude に次の一手が伝わらない）。診断の文言だけを差し替えてある:

```
いま: Skill の生成物が見つかりません。facet でプロジェクトフォルダを開き直してください
      （アプリが .claude/skills/ を置き直します）
```

### バイト一致コピーの検査を捨てた代わりに、「出力の一致」で変換の健全性を見る

旧方式の番人（バイト一致＋網羅の強制）は、生成にすると**前半が不要になる**（コピーが原本からズレるという事故が原理的に消える）。**後半＝網羅の強制は残し、対象を `CANONICAL_COPIES` から `SKILL_SOURCES` へ移した**——`scripts/gen-skills.mjs` が `export` する手書きのオブジェクトリテラルのキーを、`scripts/gen-skills.test.mjs` が `BUNDLED_SKILLS` と突き合わせる。**`BUNDLED_SKILLS` から導出しない**（導出すると恒真式になり何も縛らない。logic-tree-m2 が確立した理屈をそのまま引き継いだ）。

新設した検査は次のとおりで、いずれも**生成物を実際に import して実走させる**:

- 生成した `validate.mjs` が、お手本の JSON を通し、`schemaVersion` を壊した版を弾く（5本）
- 生成した `canonical.mjs` の `serialize` が、アプリ側 `src/core/canonical.ts` と同じ文字列を返す（お手本5ファイル）
- 生成した `derive.mjs` / `questions.mjs` / `flat-tree-core.mjs` が、それぞれアプリ側の実装と同じ結果を返す
- 生成物に import 文が1つも残らない（自己完結している）／CJS の `require(` が1件も残らない
- **原本**が値 import を持たず、消去できない構文（`enum`・パラメータプロパティ）も持たない

最後の1つが「値 import を持たない」という制約の置き場である——`transpileModule` は型注釈を落とすだけで値 import を解決しないので、**この制約は生成の前提条件としてそのまま残る**。判定ヘルパ `src/core/import-analysis.ts` の回帰ケース表（8件）は、廃止した `src/modules/sequence/skill-copy.test.ts` から `src/core/import-analysis.test.ts` へ**1件も減らさずに移した**（回帰の履歴を切らないため）。

### 同期・配布のロジックは1行も変わっていない

変わったのはコメントに書かれた理由だけである。`isRemovableSkillEntry` / `SKILL_DEPS_DIR` / `SKILL_LOCK_FILE` は残し、`node_modules` と `package-lock.json` を消さない理由を「利用者の `npm install` の結果を守る」から「**旧版が作った残骸を消さない**」へ書き換えた（アプリが数百 MB を黙って消すことはしない、という人間の裁定。旧版を使ったフォルダにはそれらが残り続ける）。`.gitignore` を同期し続ける理由も同じ趣旨へ改めた。

`shouldSyncSkillFile` は除外リスト方式なので `scripts/generated/` は**自動的に同期される**（変更なし）。書き込みループもファイルごとに `mkdir(dir)` を呼ぶので `generated/` は作られる（変更なし）。

**ただし「自動的に同期される」の裏返しが、最終レビューの round 2 で1つ見つかった**（`66f98ab` の M-2）——`SKILL_SOURCES` から共有ソースを外す・改名する・Skill を1本外すと、対応する古い `.mjs` は**書き直されないまま `generated/` に残る**。`tauri.conf.json` は `.claude/skills` をディレクトリごとバンドルするので、掃除しなければ残骸がそのまま配布物に載る。いまは**作り直す前に `generated/` を空にする**（`rm -rf` 相当）。

### 配布物に写るのは、コードだけではない

**共有ソースの JSDoc は、生成した `.mjs` の中へそのまま写って利用者のフォルダへ置かれる。** M30 の本体を作り終えた時点では、`canonical.ts` / `derive.ts` / `questions.ts` / `flat-tree-core.ts` の JSDoc が「このファイルは登録 Skill へ**バイト一致でコピーされる**」「Node の**型ストリップ**でそのまま実行される」「ズレは `src/modules/<tool>/skill-copy.test.ts` が検知する」と、**M30 が消したばかりの機構を配布物の中で説明していた**（`flat-tree-core.ts` に至っては、存在しないテストを名指ししていた）。**Task 7 は台帳に記録して残す判断をしたが、最終レビューの round 2（`59b2ef2`）が実物のほうを直した**——**利用者の手元で Claude が読む文章が、消したはずの手複製を説明している**のは記録で済ませてよい種類ではない、という判断である。**原本の JSDoc を「配布物の一部」として扱うこと**——これが M30 で確定した読み方である。

---

## 実測値

生成物のサイズ（**最終レビューの round 2 まで済んだ状態**で `node scripts/gen-skills.mjs` を回して実測）:

| Skill | `validate.mjs` | ucs2length の埋め込み前 | 共有の生成物 | 合計 |
| --- | --- | --- | --- | --- |
| `logic-tree-register` | 10,927 B | 同左（`require` 0件） | `canonical.mjs` 1,289 ／ `flat-tree-core.mjs` 5,345 | 17,561 B |
| `glossary-term-register` | 14,455 B | 14,025 B（+430） | `canonical.mjs` 1,289 | 15,744 B |
| `error-catalog-register` | 19,484 B | 19,054 B（+430） | `canonical.mjs` 1,289 | 20,773 B |
| `sequence-register` | 40,351 B | 39,921 B（+430） | `canonical.mjs` 1,289 ／ `questions.mjs` 7,146 | 48,786 B |
| `issue-tree-register` | 59,716 B | 同左（`require` 0件） | `canonical.mjs` 1,289 ／ `derive.mjs` 12,536 | 73,541 B |

（**この表は round 2 の2つの修正を織り込んだ後の数字である**——ucs2length の実体を ajv の `.toString()` から取るようにしたぶん `validate.mjs` の3本が各 +136 B、配布物の JSDoc を書き直したぶん `flat-tree-core.mjs` が +190 B・`questions.mjs` が +7 B。それ以前の実測は `validate.mjs` が 14,319 / 19,348 / 40,215、`flat-tree-core.mjs` が 5,155、`questions.mjs` が 7,139 だった。）

**置かれるディスクは「数百 MB（`node_modules`）」から「15〜74 KB / Skill」になった。** 共有 `.ts` 4本の変換は `target: ES2022` / `module: ESNext` で**4本とも診断ゼロ・残る import 文ゼロ**（`import type` がすべて落ちるため、出力は自己完結した1ファイルになる）。**この「診断ゼロ」は round 2 で初めて本当に測った値である**——それまでは `reportDiagnostics` を渡しておらず、`out.diagnostics` は常に `undefined` だった（`66f98ab` の M-5 / M-6。いまは診断が1件でもあれば生成が止まる）。`validate.mjs` 5本の `require(` も**ゼロ**である。

Node の下限が **18+**（＝Claude Code 自身が動く版）になる根拠は実測ではなく調査である——共有 `.ts` 4本は ES2020 より新しい API を1つも使っておらず、手書きスクリプトで新しいのは `flatMap`（ES2019）1箇所のみ。ES2022 へ変換すれば、残る要求は手書きスクリプトの top-level await（14.8+）と standalone 出力の `at()`（16.6+）だけになる。**この主張は実走の記録ではない**（下の「未検証として残るもの」）。

---

## 計画自身の誤り（辻褄を合わせず記録する）

1. **Task 2 の brief に埋め込まれたテストコードが `poseQuestions(data.issues)` を呼んでいた。** 実物の `poseQuestions` は `issues` **と** `hypotheses` の両方を持つオブジェクトを取るので、配列単体を渡すと `data.hypotheses is not iterable` で落ちる（実装者は実際にそのエラーを踏んでから直した）。`sample-project/課題ツリー.json` のトップレベルがちょうどその形なので、`data` をそのまま渡す形に直した
2. **Task 2 Step 4 の Expected「validator 5本＋共有9本」は誤りで、実測は共有8本**（`SKILL_SOURCES` の `shared` の合計長 `1+1+2+2+2＝8`）。テストは本数を数えていないので green / red には影響しない
3. **Task 7（本タスク）の brief と設計が「[`../open-issues.md`](../open-issues.md) の『次に手を付ける候補』4・7・9番の3箇所に『置かれた先で `npm install` した後の状態』がある」としていたが、実際にあるのは4番と7番の2箇所だけだった**（9番＝issue-tree-m4・m5 の実機確認の項にその文言は無い）。9番は触っていない（計画と設計は `a32f7c9` で訂正された）
4. **同じく Task 7 の「rev は3箇所」も、M30 が古くした記述の全部ではなかった——実際に触ったのは8箇所である。** 4章の「導出ロジックを Skill と共有する標準」（71行目）と「バイト一致コピーにできないロジックは実行結果の突き合わせで縛る」（75行目）の2段が**消えた `skill-copy.test.ts` 3本を現在形で名指ししたまま**で、69行目の書き換えと正面から矛盾していた。ほかに62・67・73・77行目にも旧機構の前提が残っていた。**タスクレビューの round 1 でコントローラが「直す」と裁定し、同じタスクの中で直した**（数え漏らしの発見はレビュー側である）
5. **同じ数え漏らしが「消えたファイル」にもあった**——設計スペックと Task 5 の報告が `.claude/skills/*/scripts/*.ts` を「7ファイル」としていたが、**列挙されている名前は8個**あり、`git show --stat f01daae` も8本を示す。本書も初版で7本と書いており、round 1 で直した。**括弧の中の列挙と数が食い違っている文は、数のほうを疑うこと**
6. **Windows の Git Bash では、`node -e` に渡した JS 文字列の中の `/tmp/...` は MSYS のパス変換の対象にならない**（引数として渡した `/tmp/...` は変換される）。この非対称のため、書き出したファイルと読ませたファイルが別物になる。計画の指示の誤りではなく環境の話だが、同じ検証手順を書く人が確実に踏むので記録する（対処はパスを `process.argv` で渡すこと）

---

## 未検証として残るもの

- **Node 18 での実走**は下のチェックリストに入れたが、開発機は 22.20 であり CI も無い。**下限の主張は構文と API の調査に基づく見積もりであって、実走の記録ではない。** **2026-08-31 の実機確認（Windows 機・Node 22.20）でも、この項目は踏めていない**——別の Node を用意する必要があり、一巡の対象外だった。**踏むまではそう扱うこと**（mac の項も同じ理由で残っている）
- `transpileModule` はトランスパイルのみで型検査をしない。**型の誤りは `tsc -b` が `src/` 側で捕まえる**という前提に乗っている（同梱物側では見ない）
- standalone 出力の互換性は ajv の版に依存する。`dependencies` の `ajv` を上げたとき、生成物の形が変わる可能性がある（生成物の実走テストが検知する）
- **`ucs2length` の埋め込みは、初版では ajv のソースから写した20行だった**——「同じ名前のまま実装だけが変わった ajv」に追従できない穴があり、当時はここに「**機械では守っていない**」と書いていた。**最終レビューの round 2（`66f98ab`）で ajv 実行時の `.code` / `.toString()` からの導出に置き換え、この穴は閉じた。** 残る形の危うさは、**残存 `require` の走査が `require("ajv/dist/runtime/…")` という字面に絞ってある**ことである——ajv がランタイムの参照の**書き方**そのものを変えたら、走査に引っかからず素通りしうる（生成物の実走テストは通るので、壊れるとしたら別の形になる）

---

## 実機確認

サブエージェントは Tauri の GUI を操作できないため、計画は Task 8 として人間の担当に分けてあった（**ドキュメント反映と束ねると、申し送りが書かれてコミットが積まれた状態が「終わった」ように見え、未実施の実機確認が静かに埋没する**——logic-tree M1 の教訓）。

**2026-08-31、依頼者が Windows 機でアプリを起動して一巡し、問題は出なかった。** 通したのは下の10項目のうち**7項目（1〜7）**で、**残る2項目は別の環境が要るため未実施のまま残る**——mac（`allow_file` 経路と `.DS_Store`）と Node 18 系での実走（下限の実証）である。**「一度画面を見た」ではなく、チェックリストを実際に通した記録である**（issue-tree-m3 / issue-tree-m5 の項が「見たが通していない」だったのとは事情が違う）。

- [x] `npm run tauri dev` でアプリを起動する
- [x] **新しい空フォルダを開き、`npm install` を一切せずに5本の Skill それぞれで書き出しをさせる**（用語集・エラーカタログ・シーケンス・課題ツリー・ロジックツリー）
- [x] 開いたフォルダの `.claude/skills/*/scripts/generated/` に生成物が置かれている
- [x] 同じフォルダに `node_modules` と `package.json` が**作られていない**
- [x] **旧版を使っていたフォルダを開く**——`node_modules` と `package-lock.json` が残ったまま、書き出しが新しい経路で通る
- [x] スキーマ違反のファイルを Claude に `--check` させ、エラー表示が読める（`スキーマ:` の行が消えたこと以外は従来どおり）
- [x] 生成物を1つ手で消してから書き出させ、`Skill の生成物が見つかりません。facet でプロジェクトフォルダを開き直してください` が出る。**開き直すと直る**
- [ ] **開発機と違う OS（mac）**——`.gitignore` が書けること（`allow_skill_dir` の `allow_file` 経路）、`.DS_Store` の消し残し警告が従来どおり出ること
- [ ] **Node 18 系で書き出しスクリプトが通る**（下限の実証。開発機は 22.20 なので別に用意する）
- [x] 済んだら [`../open-issues.md`](../open-issues.md) と本書のチェックリストを埋める

**これで本マイルストーンの狙い——「facet でフォルダを開いたら、Skill はそのまま動く」——は、Windows 機の実機で確かめられた。** 前準備なしで5本とも書き出せ、`node_modules` も `package.json` も作られず、旧版を使っていたフォルダでも新しい経路で通り、生成物を消したときの診断も意図どおり読めた。**残る2項目は「別の OS」と「別の Node」であって、この機構そのものの未確認ではない。**

**GUI を通さない範囲はエージェントが実行して確認済みである**——5本の `--check` の出力が切り替え前後で（`スキーマ:` の行が消えたこと以外）一字一句同じであること、`--in` / `--out` の往復でお手本と `diff` が出ないこと、スキーマ違反が exit 1 で弾かれること、`npm test` / `npx tsc -b` / `npm run lint` の全件緑。

---

## rev への反映事項

**8箇所**（[`../overview-rev.md`](../overview-rev.md)。**章番号・見出しは1つも動かしていない**）。計画は「3箇所」としていたが、**残る5箇所はレビューが見つけた**（上の「計画自身の誤り」4）。

- **4章「アプリのロジックを同梱スクリプトから使う方法」（69行目）**——見出しに「M30で生成方式へ」を足し、バイト一致コピー方式の記述を生成方式へ書き換えた。**残した理屈は3つ**（値 import を持たない制約は生成の前提条件として残る／網羅の強制は残り対象が `CANONICAL_COPIES` から `SKILL_SOURCES` へ移った／`BUNDLED_SKILLS` から導出しない）。**型ストリップ依存の記述は削除した**が、**Node の下限は「見積もりであって実走の記録ではない」と釘を刺してある**（断定形で書くと、この文書が実測の顔をしてしまう）。末尾のスキーマの段は「同じ機構を JSON Schema にも適用している」から「**JSON Schema だけは、いまもバイト一致のコピーである**」へ改めた（機構が分かれたため）
- **4章「Skillの配布と同期」（77行目）**——`その package.json も同梱物として置く` を削除し、`node_modules` / `package-lock.json` を消さない理由を**旧版が作った残骸を消さないため**（人間の裁定）へ。`.gitignore` を同期する理由も同じ趣旨へ。`shouldDescendSkillDir` の理由も「ビルド機で `npm install` 済みだと」から「**旧版の手順書に従って `npm install` した機械**」へ
- **5章「スキーマ：JSON Schema を正とする」のコピー共有の項（122行目）**——コピーは**検証の入力ではなくなった**（検証は生成物に焼き付き、3つの差し替え経路は廃止）が、`serialize` のキー順導出のために**実行時には読まれ続ける**こと、**消えたのは探索であって読み込みではない**ことを足した
- **4章「この形は『導出ロジックを Skill と共有する』標準である」（71行目）**——3例の「一致検査は `src/modules/<tool>/skill-copy.test.ts`」という**現在形の名指しを落とした**（3本とも Task 5 が削除済み）。共有の機構を「M30 まではバイト一致コピー、いまは生成物。検査は `scripts/gen-skills.test.mjs` の出力一致へ移った」と書き、段末の規約も「Skill へ**同梱**する予定のファイルは…」へ改めた（**規約の中身は変わらない**——制約の下で書かせるために JSDoc へ書く）
- **4章「バイト一致コピーにできないロジックは、実行結果の突き合わせで縛る」（75行目）**——`consistency.ts` が同梱できない理由の言い換え（比較対象の機構が消えたため。**制約の実質＝値 import と `@/` エイリアスは生成方式でも同じ**）
- **4章の周辺3箇所**——62行目「原本を参照するか、バイト一致のコピーをテストで縛る」を生成方式込みの言い方へ／67行目「`--schema` / 環境変数という逃げ道」に**M30 で廃止した**旨を追記／73行目「`normalizeOrder` はバイト一致コピーにできず」を「同梱物にできず（生成方式でも同じ）」へ

## [`../open-issues.md`](../open-issues.md) への反映事項

- 「次に手を付ける候補」の**4番（issue-tree-m2）・7番（logic-tree-m2）**の確認事項「置かれた先で `npm install` した後の状態」を「**置かれた先で追加の手順なしに動くこと**」へ書き換えた（**項目は消していない**——どちらの実機確認も未実施のままである）。**9番にその文言は無かった**ので触っていない（上の「計画自身の誤り」3）。**あわせて「リンク先 history のチェックリストは当時のままで `npm install` を指示しているので読み替えること」を添えた**——history は不変なので直さないが、そのとおりに進めた人はいま要らない `node_modules` を自分で作ってしまう（レビューの指摘）
- 「小さな負債」の**「`palette-fit.mjs` が Node の型ストリップに依存している」**を書き換えた——登録5 Skill にも同じ依存があるという記述と、**いま実在しない4本のテスト**の名指しを落とし、**残るのは `palette-retheme` の1本だけ**（`BUNDLED_SKILLS` に無く、利用者のフォルダには置かれないので M30 の対象外にした）という実態へ
- 「小さな負債」の「画面の『SHに聞きたいこと』と…」の中の `skill-copy.test.ts` を `src/core/skill-schema-copy.test.ts` へ直した
- 「小さな負債」の**「`docs/README.md` の履歴表に M12 の行が無い」**を書き換えた——`history/` の全43本と表を突き合わせたところ、**欠けているのは M12・M27・M28・sequence-m5・issue-tree-m5・M30 の6件**だった（この項自体が「落ちても誰も気づかない」と言っているとおりの状態になっていた）。**M30 が作った欠落ではなく、レビューが見つけたものである。** なお **`docs/README.md` そのものには行を足していない**——同じ項が「表への追記は README 側の慣習であって、`CLAUDE.md` が義務化しているのは `history/` の新規作成まで」と明記しており、M30 の行だけを足すと欠落の並びが不揃いになるため（コントローラの裁定）
- **足した箇条は1件あったが、同じブランチの中で消えた**（差し引き0件）——「共有ソース3本の JSDoc が『バイト一致コピー』の時代のまま止まっている」（`[m30]`）。`src/core/canvas/flat-tree-core.ts` / `src/modules/issue-tree/derive.ts` / `src/modules/sequence/questions.ts` が旧方式を説明したままで、`flat-tree-core.ts` は**すでに消えたテストを名指し**していた。**Task 7 は「文書のタスクなので実物には触らず記録に残す」判断をしたが、最終レビューの round 2（`59b2ef2`）が実物を直したので項ごと消えた**——**この JSDoc は生成物の `.mjs` に写って利用者のフォルダへ置かれる**以上、記録で済ませてよい種類ではなかった。**「配布物に写る文章」は台帳ではなく実物を直す**、というのがここで確定した線引きである
- **「次に手を付ける候補」へ M30 の実機確認が未実施であることを10件目として足し、実機確認のあとに書き換えた**（番号付きリストなので `^- ` の検算には現れない）——Windows 機での一巡は済んで問題が出なかったこと、**残るのは mac と Node 18 系での実走の2項目だけ**であることへ。**項目そのものは消していない**（2項目が残っているため。**両方とも踏めたら消すこと**）

## [`../../CLAUDE.md`](../../CLAUDE.md) への反映事項

- 「マージ後の後片付け」の `git clean -fdx sample-project/` に `-x` を付ける理由を、**「`.claude/skills/` は `npm install` 済みで数百 MB になる」から生成物の話へ**差し替えた（`skills/*/scripts/generated/` は `npm run gen:skills` が作り、原本は `schemas/` と `src/` の側にある）
- **同じ節の「JSON 4本は追跡対象なので」を「JSON 5本」に直した**（`git ls-files sample-project` は JSON を5本返す。M30 とは無関係の古い数えで、レビューが見つけた）

## `src/core/skill-sync.ts` のコメント（式は不変）

Task 5・Task 6 が JSDoc 4箇所を書き換えたが、**現在形で「利用者が `npm install` で作った」と述べる本文コメントが2箇所残っていた**（`syncBundledSkills` の JSDoc と、削除ループの中のコメント）。round 1 で「旧版の SKILL.md が指示した `npm install` の結果。M30 以降は作られないが、旧版を使ったフォルダには残っている」へ改めた。**`isRemovableSkillEntry` の保護そのものは1文字も変えていない**——守る対象が「これから作られるもの」から「もう作られないが残っているもの」に変わっただけで、消さない判断は同じである。
