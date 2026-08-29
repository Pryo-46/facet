# ロジックツリー登録 Skill（`logic-tree-register`）設計

作成日: 2026-08-29
前提資料: `docs/overview-rev.md`（2章・4章・5章）／`docs/logic-tree/logic-tree-m1-scope.md`／`schemas/logic-tree.schema.json`／`docs/history/sequence-m4-register-skill.md`／`docs/history/issue-tree-m2-register-skill.md`
先行例: `docs/superpowers/specs/2026-08-12-sequence-register-skill-design.md`（同種の設計。構成をここに合わせている）

---

## この Skill の目的

**ロジックツリーだけが登録 Skill を持っていない。** 用語集・エラーカタログ・シーケンス・課題ツリーの4本は `.claude/skills/` に揃っており、`BUNDLED_SKILLS` に載ってプロジェクトフォルダへ配られている。5本目としてロジックツリーを足し、**会話やメモから `type: "logicTree"` の JSON を組み立てられる**ようにする。

作るのは「データが作れる」ところまでである。**網羅性の担保に踏み込まない**——どのユースケース（AI が分解を起こす／人間の分解を転記する）に需要があるかがまだ分かっておらず、先に仕組みを決めると外す。

---

## 1フェーズであること

既存の `sequence-register` と `issue-tree-register` は2フェーズ（A: 図/木を起こす → B: 問いを詰める）を持つ。**この Skill はフェーズA だけを持つ。**

理由は、ロジックツリーには**問いの仕組みが無い**ことである。シーケンスの「失敗したら？」は `kind` × `awaitsReply` から導出され、課題ツリーの「仮説は？／検証結果は？／判断は？」は `events` から導出される。ロジックツリーのスキーマは `{ id, parentId, text }` しか持たず、欠落は `text` が空（＝未記入）の1種類だけである（`src/modules/logic-tree/missing.ts`）。**導出できる問いが無いところにフェーズB を作ると、AI の思いつきを「立った問い」として提示することになる**——これは既存4本が一貫して避けてきた形（AI の推測をユーザーの決定として記録しない）と衝突する。

網羅性の担保をツールに載せるなら、それはスキーマ側の改訂（v2）を要する別のマイルストーンである。本設計では**扱わない**。

---

## 起動条件と、課題ツリーとの境界

**`issue-tree-register` の description には既に「この課題を分解して」が入っている。** 語も近く（どちらも「ツリー」）、5本目としてもっとも誤起動しやすい相手である。意味の切れ目を以下に定める。

| | 課題ツリー（`issueTree`） | ロジックツリー（`logicTree`） |
| --- | --- | --- |
| 木にするもの | **何を確かめるか**（課題 → 仮説 → 検証イベント → 判断） | **どんな場合があるか**（場合分けそのもの） |
| 手掛かりの語 | 仮説・検証・PoC・支持／棄却・見送り・本開発送り | 網羅・ケース・パターン・原因・分岐・洗い出し・MECE |
| 木の外に持つもの | イベント列・判断・保留メモ | **何も持たない** |

description に入れる起動語は「ロジックツリーを作って」「ツリーにして」のほか、**「どんなときに◯◯になるか洗い出して」「ケースを網羅して」「パターンを整理して」「原因を分解して」「MECE に分けて」**、およびプロジェクトフォルダに `type: logicTree` の JSON があるとき。**あわせて境界を description 本文に1文で書く**——「仮説・検証・判断を伴う整理なら課題ツリー（`issue-tree-register`）の担当」。

**`issue-tree-register` 側の description は今回は変更しない。** 先に絞ると、`logic-tree-register` を足したことによる誤起動の増減が測れなくなる。evals（後述のケース2・3）で実測し、**誤起動が出た場合にのみ**あちら側の改修を別途行う。

---

## ファイルの扱い

**ロジックツリーはプロジェクトに何本あってもよい**（`singleton: false`。rev 5章の単一性宣言の対象は `glossary` と `errorCatalog` だけ）。したがって `sequence-register` と同じ規則を採る。

- **既定は新規作成。** プロジェクト内の `type: "logicTree"` を探して追記しない
- **既存への書き足しは、ユーザーが名指ししたときだけ**（「あの応募が進まないケースの木に枝を足して」）
- ファイル名は `title` 由来。**既存と衝突したら報告して確認する**（勝手に上書きしない）
- **単一性の警告は出さない。** 複数本あるのは正常な状態である
- **アプリでそのプロジェクトを開いたまま作業しない。** 自動保存で書き戻されるため、同時編集は片方の変更を消す。作業前に一言伝える

`title` は会話から付けて**報告で伝える**（確認は取らない。違えばユーザーがアプリで直せる）。`title` はファイル一覧に出る表示名なので、後から人間が読んで何の木か分かる必要がある。

---

## 材料の扱い——会話が優先、無ければ下書き

rev 57行目は AI の役割として「**下書き生成**：会議メモや既存の文章仕様書からロジックツリー/遷移表/シーケンスの初期データを生成。人間は会議で AI の下書きを修正・確定する」を挙げている。この Skill はその経路を実装する。

| 材料 | 振る舞い |
| --- | --- |
| 会話・メモに論点が出ている | **転記する。** 言葉もなるべくそのまま使う |
| テーマだけ渡された（「◯◯が起きるケースを洗い出したい」） | **AI が下書きを起こす** |

**どこが人間発でどこが AI 発かは、報告文で分ける。** ロジックツリーのスキーマには `notes` に相当する欄が無く（エラーカタログのような逃がし先が無い）、**出どころはファイルに残らない**。報告文が唯一の伝達手段である。

---

## 木の組み立ての規律

- **ルートは1つ。** 単一ルートはスキーマでは表せず整合性検証（レベル2）が受け止めるので、書き出しスクリプトが警告を出す
- **ルートには問いの形を置く。** お手本 `sample-project/応募が書類選考に進まないケース.json` のルートは「応募が書類選考に進まないのはどんなときか」であり、これが木の読み方を決めている
- **同じ親の子は1つの軸で分ける。** 「原因」と「時期」を同じ層に混ぜない
- **配列は DFS 行きがけ順で下書きする。** 兄弟順の正本は配列順（rev 5章）であり、行きがけ順に保つと上から読んで木の形が追える
- **`text` の空文字は「未記入」であって欠陥ではない。** 埋まらないものを推測で埋めない
- **座標・幅・折りたたみ状態を持たない。** 図はデータから毎回導出する（rev 3章）

---

## アプリ側の改修：`flat-tree-core.ts` の切り出し

facet の規約は「**導出ロジックはアプリからのバイト一致コピー ＋ 一致テストで Skill と共有する**」（rev 4章。`sequence-register/scripts/questions.ts` と `issue-tree-register/scripts/derive.ts` の2例で規約化された）。コピーの条件は**値 import・相対 import・enum を持たないこと**である。

今回コピーしたい部品の実測:

| 部品 | 場所 | 可否 |
| --- | --- | --- |
| `findDuplicates` | `src/core/duplicate.ts` | import ゼロ |
| `tallyLine` / `MissingTally` | `src/core/missing-tally.ts` | import ゼロ |
| `tallyMissing` / `isMissingNode` | `src/modules/logic-tree/missing.ts` | 型 import のみ |
| `serialize`（正規形） | 既存 `canonical.ts` | 既に4本が持つ |
| **`buildTree` / `orderFlatNodes`** | `src/core/canvas/flat-tree.ts` | **不可**（`computeRowKeys` を値 import） |

引っかかるのは最後の1つだけであり、しかも `computeRowKeys` が要るのは `FlatTreeNode.key`（React の描画同一性・レイアウトの `Map` の鍵）のためだけである。**スクリプトが必要とする `roots` / `unreachable` / `missingParent` / DFS 順は、どれも `key` を使っていない。**

### 決定

`src/core/canvas/flat-tree-core.ts` を新設し、**`key` を持たない index ベースの純粋部分**をそこへ出す。

- 出すもの: `FlatNode` / `buildFlatTree`（`roots` は index の木、`depths` / `parents` / `children` / `unreachable` / `missingParent`）／ `orderFlatNodes` / `subtreeEnd` / `siblingsOf`
- **値 import・相対 import・enum を持たない。** JSDoc に「このファイルは登録 Skill へバイト一致でコピーされる。だから値 import・相対 import・enum を持たない」と**先に書く**
- `flat-tree.ts` は `buildFlatTree` の結果に `computeRowKeys` の `key` を被せる薄い層になり、残りは再 export する。**公開 API は変えない**ので `commands.ts` と3モジュールのエディタ（ロジックツリー・シーケンス・課題ツリー）は**無変更**

この形を採る理由は3つ。(1) 木の組み立て——とくに `buildTree` の**全域性**の作り（循環＝根から到達できない集合、参照切れはルート扱いにして位置を記録）——を手で書き直さずに済む。(2) **配列順の DFS 正規化を書き出し時に正しく行える**。既存2本が残した台帳の残件（「Skill が書いた直後のファイルは配列順が正規形になっていない」）を、このツールについては最初から作らない。(3) issue-tree-m2 が記録した「**後で Skill へコピーすると分かっているファイルは、書く時点で制約を JSDoc に書いておくと次の作業が `cp` 1回に縮む**」の3例目になる。

代償はコア 145 行のファイルを2つに割ることだが、`flat-tree.test.ts` は公開 API 越しに書かれているため無変更で緑のままのはずである（着手時に確認する）。

---

## 同梱スクリプト

### 前提：Skill はユーザーのプロジェクトフォルダへコピーされる

`src/core/skill-sync.ts` が `BUNDLED_SKILLS` の各 Skill を `.claude/skills/<name>/` へ置き直す。`evals/` と `node_modules/` は**配らない**（`shouldSyncSkillFile`）。`package.json` / `.gitignore` / `schemas/*.schema.json` は**配る**。したがって Skill は **facet のチェックアウトが無いマシンでも動く**必要があり、スキーマと導出ロジックのコピーを自分の中に持つ。

### 構成

```
.claude/skills/logic-tree-register/
  SKILL.md
  package.json                 （ajv）
  .gitignore                   （node_modules / package-lock.json）
  schemas/logic-tree.schema.json   （原本のバイト一致コピー）
  scripts/new-id.mjs
  scripts/canonical.ts             （バイト一致コピー）
  scripts/flat-tree-core.ts        （バイト一致コピー・新設）
  scripts/logic-tree-write.mjs
  evals/evals.json / evals/grade.mjs / evals/fixtures/
```

### `scripts/new-id.mjs`

既存4本と同形。**既定のプレフィクスは `node`。**

```
node scripts/new-id.mjs 15            → node_XXXXXXXXXX を15件
```

ロジックツリーの ID は1種類しか無いので `--prefix` は実質使わないが、**既存4本とインタフェースを揃えるため引数は同じ形で受ける**（誤ったプレフィクスは exit 2）。

### `scripts/logic-tree-write.mjs`

```
node scripts/logic-tree-write.mjs --in <下書き.json> --out <プロジェクト>/<title>.json
node scripts/logic-tree-write.mjs --check <ファイル>
```

終了コードは既存4本と同じ **0＝成功（警告はあり得る）／1＝スキーマ検証失敗／2＝使い方の誤り**。0 でも整合性の警告と未記入の集計は出るので、標準出力を読む。

やること:

1. スキーマ検証（ajv。スキーマは同梱コピー → `--schema` → 環境変数 `FACET_LOGIC_TREE_SCHEMA` の順で探索）
2. **整合性検証**——`src/modules/logic-tree/consistency.ts` と同じ4つ。`buildFlatTree` はコピーが持つので、**手で複製するのはメッセージの組み立てだけ**

   | `rule` | message |
   | --- | --- |
   | `duplicate-id` | ID が重複しています（N件）: … |
   | `cyclic-parent` | 親子関係が循環しているノードがあります（N件。図には表示されません）: … |
   | `missing-parent` | 親が見つからないノードがあります（N件）: … |
   | `multiple-root` | ルートが N件あります（1本の木にしてください）: … |

   ノードの指し方も逐語で合わせる——`text.trim()` が空なら `（未記入・N番目）`、そうでなければ `「text」`（`consistency.ts` の `label`）

3. **配列を DFS 行きがけ順へ正規化して**書き出す（`orderFlatNodes`）。到達不能なノードは末尾に元の順で残す（**消さない**）
4. 正規形での書き出し（キー順＝スキーマの `properties` 記載順、2スペース、LF、末尾改行。`canonical.ts` の `serialize`）
5. 未記入の集計 `⚠ 要対応 N（未記入 N）` ／ 0件なら `要対応 0`（`src/modules/logic-tree/missing.ts` ＋ `src/core/missing-tally.ts` の `tallyLine` と逐語一致）

**手で複製するのは3つだけ**——`findDuplicates`（7行）、上の4メッセージの組み立て、集計行。これは既存2本の慣習に合わせたもので、`sequence-write.mjs:246-250` と `issue-tree-write.mjs:155` が同じ形を採っている（小物は `.mjs` 内に複製し、大きな導出モジュールだけ `.ts` をコピーする）。

---

## SKILL.md の規律

### frontmatter

`name: logic-tree-register`。`description` は上の「起動条件と、課題ツリーとの境界」で定めた語を含み、**境界の1文と「手書きで JSON を作らない」の1文**で閉じる（既存4本と同じ締め）。

### 手順

1. 対象を決める（既定は新規・名指しのときだけ追記・アプリを閉じてもらう）
2. 材料を見分ける（会話優先／テーマだけなら下書き）
3. 木を組む（単一ルート・ルートは問いの形・同層は1つの軸・DFS 順）
4. ID 採番（`new-id.mjs` の出力をそのまま使う。**自分で書かない・連番禁止**）
5. 書き込み（下書きは**対象プロジェクトフォルダの外**に置く。中に置くとアプリのファイル一覧に下書きが本物として並ぶ）
6. 報告

### 警告が出たときの扱い

既存4本と同じく**出どころで分ける**。

| 出どころ | 扱い |
| --- | --- |
| 今回このSkillが書いた部分の警告 | **自分の書き間違い。直して再実行する**（ユーザーに聞かない） |
| 既存ファイルに元からあった警告 | **報告して確認する。勝手に直さない** |

### 報告

- 作ったファイルのパスと `title`
- ノード数と深さ
- **AI が起こした枝**（会話に無かったもの。ファイルに残らないので、ここでしか伝わらない）
- `⚠ 要対応 N（未記入 N）`（アプリの帯と同じ文言。言い換えない）
- 整合性の警告があれば、何が衝突しているか

### やらないこと

- **会話に無い枝を「網羅のため」に足して、人間の決定として報告しない**（下書きとして起こしたものは下書きと呼ぶ）
- **網羅性を主張しない。** 「これで全部のケースが拾えました」と言わない
- **未記入を催促しない**
- **複数ルートを作らない**（1ファイル＝1本の木）
- **座標・幅・折りたたみ状態をデータに入れない**
- **既存データの勝手な整形・並べ替え・言い換えをしない**（`id` を変えない、触っていないノードを1バイトも変えない、`title` を書き換えない）
- **MCP 的な書き込みツールを作らない。** アプリとの接点はファイルだけ（決定済み。蒸し返さない）

---

## 既存ファイルへの書き足し

1. 既存ファイルを読み、**どの木か**をユーザーに確定させる（勝手に選ばない）
2. **既存の JSON 全体を下書きに含め、足す枝だけを加えて**書き出す（既存ノードに新しい ID を採番しない）
3. 書き出したら `git diff` に出る行が意図した範囲に収まっているかを伝える

**なお、書き出し時に配列は DFS 行きがけ順へ正規化される。** 既存ファイルが既に行きがけ順なら差分は追加分だけになるが、**乱れた順のファイルを渡すと配列全体が並び替わる**。その場合は報告でそう伝える。

---

## テスト

| テスト | 何を縛るか |
| --- | --- |
| `src/modules/logic-tree/skill-copy.test.ts`（新規） | `canonical.ts` と `flat-tree-core.ts` のバイト一致。`flat-tree-core.ts` に**値 import・相対 import・enum が無いこと**（`src/core/import-analysis.ts` のヘルパを使う） |
| `src/modules/logic-tree/skill-write.smoke.test.ts`（新規） | スクリプトを実際に spawn して stdout を見る（M15 が確立した形）。**整合性の4メッセージの逐語一致**と**集計行の逐語一致**（issue-tree-m2 が rev 4章に書いた規約に従う）。正規形・DFS 正規化・`--check` の冪等性・終了コード |
| `src/core/skill-sync.test.ts` | `BUNDLED_SKILLS` を配列リテラルで `toEqual` している。**テスト名にも件数が入っている**（「4本」→「5本」） |
| `src/core/skill-schema-copy.test.ts` | `SCHEMA_COPIES` に追加。ここは網羅アサーションがあるので忘れると赤くなる |
| `src/core/canvas/flat-tree.test.ts` | **無変更で緑のままであること**（公開 API 越しに書かれているため） |

### `canonical.ts` のコピーに網羅アサーションを置く（台帳の残件を1件畳む）

`docs/open-issues.md` に「**`canonical.ts` のバイト一致コピーに『網羅』のアサーションが無い**（検査が3ファイルに散っていて、書き忘れても緑で通る）」が `[issue-tree-m2]` タグで載っている。5本目を足すと検査は4ファイルに散り、穴は広がる。

`src/core/skill-canonical-copy.test.ts` に、`skill-schema-copy.test.ts` の `SCHEMA_COPIES` と**同型の網羅アサーション**を置く:

```ts
expect(CANONICAL_COPIES.map((c) => c.skill).sort()).toEqual([...BUNDLED_SKILLS].sort())
```

各 Skill の `canonical.ts` の所在を1箇所の表に集約し、**6本目を足した人が検査を書き忘れたら赤くなる**状態にする。これで台帳の該当項を消す。

---

## evals（`evals/evals.json` ＋ `evals/grade.mjs` ＋ `evals/fixtures/`）

`sequence-register/evals/` と同じ形。**5ケースのうち2ケースを `issue-tree-register` との境界の実測に割く。**

| # | name | ねらい | 合格条件の要点 |
| --- | --- | --- | --- |
| 0 | `new-tree-from-theme` | テーマだけから下書きを起こす | `logicTree` が1本作られる。単一ルート・ID が `node_` ＋英数字10文字・正規形（キー順・LF・末尾改行）・配列が DFS 行きがけ順 |
| 1 | `transcribe-conversation` | 会話の転記 | 会話に出た論点だけが枝になっている（**AI が「網羅のため」に枝を足していない**）。ルートが問いの形になっている |
| 2 | `route-to-logic-tree` | **誤起動（正方向）** | 「どんなときに◯◯が起きるか洗い出して」→ `logicTree` が作られ、**`issueTree` の JSON が作られていない** |
| 3 | `defer-to-issue-tree` | **誤起動（逆方向）** | 「PoC で何を確かめるか整理して」→ **`logicTree` を作らない**（課題ツリー側に譲る） |
| 4 | `append-to-existing` | 既存への追記 | 名指しした既存ファイルに枝が足され、**2つ目のファイルを作らない**。既存の `id` / `title` / 触っていないノードが1バイトも変わらない（`fixtures/existing-project/` を使う） |

`grade.mjs` は `sequence-register/evals/grade.mjs` と同じ骨格——プロジェクト内の JSON を走査して `type` で拾い、`logic-tree-write.mjs --check` を spawn してスキーマ・正規形・警告の有無を取る。ケース2・3は **`type` 別のファイル本数**で判定するので、機械判定が効く。

---

## ドキュメントへの反映

| 場所 | 直すこと |
| --- | --- |
| `src/core/reading-guide.md` | 登録用 Skill の名前一覧に `logic-tree-register` を足す（**何のテストも縛っていない**——忘れても緑で通る箇所） |
| `README.md:155` | 「登録用 Skill が**4本**置かれる（4名）」→ **5本**・一覧に追加 |
| `docs/README.md` | 「リポジトリ内の他の『正』」の節、`.claude/skills/` の説明（ユーザーのデータを作るものが4本→**5本**） |
| `docs/overview-rev.md` 4章 | 同梱 Skill を**5本**へ。バイト一致コピーが `questions.ts` / `derive.ts` に続く**3例目**（`flat-tree-core.ts`）であること。実行 smoke テストの本数（4→5スクリプト） |
| `docs/overview-rev.md` 2章 | **17行目のロジックツリーの行には実装状況の記述が無い**（「ロジックツリーエディタ — 分岐・パターンの網羅」だけ）。課題ツリー（6番目の行）と同じ形で「エディタは logic-tree M1、登録 Skill は logic-tree-m2 で実装済み。**後続は出力プロファイルのみ**」を添える |
| `docs/overview-rev.md` 235行（**本設計で見つけた既存の古い記述**） | 「用語集は現時点で1プロファイル、**ロジックツリーとシーケンスは0本**」は sequence-m3 以降**古い**——`src/modules/sequence/markdown.ts` と `mermaid.ts` が実在する。ロジックツリーが0本なのは正しい。**この行をシーケンスについて正す**（rev は「正」なので、古い事実を見つけたまま残さない） |
| `docs/open-issues.md` | **消す**: `canonical.ts` の網羅アサーションが無い（`[issue-tree-m2]`）／**書き換える**: 「登録4 Skill は整合性検証の警告文言・計上規則をアプリと独立に複製している」→ **5本**、ただしロジックツリーは**木の組み立てを複製していない**旨を添える／**足す**: 実機確認が未実施であること（サブエージェントは Tauri の GUI を操作できない） |
| `docs/history/logic-tree-m2-register-skill.md` | 新規。何が起きたか・確定した事項・計画自身の誤り・繰り越し |

---

## スコープ外

- **網羅性の担保の仕組み**（「この層は尽きたか」を問う機能）。スキーマ v2 を要する別のマイルストーン
- **フェーズB**（未記入を詰める対話）
- **`issue-tree-register` の description の改修**。evals で誤起動が実測されたときだけ別途行う
- **ロジックツリーの出力プロファイル**（Markdown / Mermaid）。`src/modules/logic-tree/` に出力の実装は無く現在0本で、本設計は増やさない（rev 235行の記述を正すのは上の表のとおり範囲内だが、実装は足さない）
- **`sample-project` のお手本の作り直し。** `応募が書類選考に進まないケース.json` は既にあり README の表にも載っている（「ノードが1つ空」）。`--check` を通して**正規形・DFS 順・未記入1件がスクリプトの出力と一致すること**を確認するに留める（中身を変えると README と実機確認の前提が動く）
- **実機確認（Tauri の GUI 操作）。** 人間の作業として申し送りに残す

---

## 完了条件

1. `.claude/skills/logic-tree-register/` が上の構成で存在し、`node scripts/logic-tree-write.mjs --check sample-project/応募が書類選考に進まないケース.json` が **`要対応 1（未記入 1）` と警告0件**を出す
2. `flat-tree-core.ts` のバイト一致コピーと「値 import を持たない」がテストで縛られている
3. 整合性の4メッセージと集計行が、アプリ側と**逐語一致**していることが smoke テストで縛られている
4. `--out` で書き出したファイルの配列が **DFS 行きがけ順**になっている
5. `CANONICAL_COPIES` の網羅アサーションが入り、5本すべてが覆われている
6. `npm test && npx tsc -b && npm run lint` が緑（`flat-tree.test.ts` は無変更）
7. evals 5ケースが定義され、`grade.mjs` が機械判定できる
8. ドキュメント反映が済み、`open-issues.md` の増減が申し送りと一致している
