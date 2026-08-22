# issue-tree M2 申し送り: 課題ツリー登録 Skill とお手本

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。

issue-tree-m2 は「**PoC の会話の最後に『じゃあこれで整理して』と言えば、その会話が `type: "issueTree"` の JSON になる**」ための Skill（`.claude/skills/issue-tree-register/`）を4本目の同梱 Skill として足し、あわせて `sample-project/` を5ツールぶんのお手本にするマイルストーン。実装計画は [`../superpowers/plans/2026-08-22-issue-tree-m2-register-skill.md`](../superpowers/plans/2026-08-22-issue-tree-m2-register-skill.md)（`a5921dc` で issue-tree-m1 と一緒にコミット済み）、設計の正は [`../issue-tree/仮説検証モジュール-設計ノート.md`](../issue-tree/仮説検証モジュール-設計ノート.md) のスコープ IN（登録用 Skill／`sample-project` への追加／`README-for-AI.md` への追記）。

コミット範囲: `7a53869`（Skill 本体）〜 本コミット。計画は Task 1〜4 の4本で、**Task 4（実機確認）は人間の作業のため未実施のまま閉じている**（後述）。fix round が入ったのは Task 1（1巡・文言のみ）。

---

## 何を作ったか

`.claude/skills/issue-tree-register/` は既存3本と同じ骨格を持つ:

- `SKILL.md` — 手順書。`sequence-register` と同じ2フェーズ構成（**A: 木を起こす**／**B: 未決を詰める**）
- `scripts/new-id.mjs` — ID 採番（既定 `issue`、`--prefix hypothesis`）
- `scripts/issue-tree-write.mjs` — スキーマ検証・正規形の書き出し・整合性検証・未決の集計
- `scripts/derive.ts` / `scripts/canonical.ts` — **アプリのソースのバイト一致コピー**（後述）
- `schemas/issue-tree.schema.json` — 原本のバイト一致コピー
- `package.json`（`ajv`）／ `.gitignore`

**既存3本と違うところは2つある。** `normalizeSlots` に相当する処理を持たない（課題ツリーには `oneOf` のスロットが無く、キー順はすべてスキーマの `properties` から導出できるので `canonical.ts` の `serialize` だけで正規形が出る）ことと、**`evals/` を持たない**こと（後述）。

`sample-project/課題ツリー.json`（`title: "適性検査サービス連携PoC"`／課題11件・仮説6件）は、この Skill 自身が書き出した。

---

## 実装で確定した事項

### `derive.ts` は `cp` でそのまま持ち込めた——issue-tree-m1 が先に制約を書いていたから

`src/modules/issue-tree/derive.ts`（問いの導出・未決の集計・抑制）のコピーは、**`cp` を1回叩くだけで済んだ。** issue-tree-m1 の時点で、このファイルの JSDoc に

> このファイルは登録 Skill へバイト一致でコピーされる（issue-tree-m2 で作る）。だから値 import・相対 import・enum を持たない

と**先に書いてあった**ためである。守られていなければ、ここで書き直し（値 import の排除＝`derive.ts` の再設計）になっていた。**「後で Skill へコピーする」ことが分かっているファイルは、書く時点で制約を JSDoc に書いておくと、次のマイルストーンの作業が `cp` 1回に縮む**——これが実際に効いた1例目である。

**この形は、これで2例目になった。** `sequence-register` の `questions.ts`（sequence M4）に続く2本目が `derive.ts` で、**「導出ロジックはバイト一致コピー＋一致テストで Skill と共有する」は方式ではなく規約になった**（rev 4章へ反映済み）。1例では方式、2例で規約になる。

### 整合性検証は逐語で複製した——`message` は6ブロック（`rule` は5種類）

`src/modules/issue-tree/consistency.ts` は値 import（`buildTree` / `findDuplicates`）を持つのでコピーにできず、判定ロジックごと手で複製した。**`out.push` するブロックは6つで、`rule` 名は5種類**——`duplicate-id` が課題側と仮説側の2箇所で出るためズレる。

| # | `rule` | message |
| --- | --- | --- |
| 1 | `duplicate-id` | 課題の ID が重複しています（N件）: … |
| 2 | `duplicate-id` | 仮説の ID が重複しています（N件）: … |
| 3 | `cyclic-parent` | 親子関係が循環している課題があります（N件。図には表示されません）: … |
| 4 | `missing-parent` | 親が見つからない課題があります（N件）: … |
| 5 | `multiple-root` | ルートが N件あります（1本の木にしてください）: … |
| 6 | `missing-issue` | ぶら下がり先の課題が見つからない仮説があります（N件）: … |

縛りは `src/modules/issue-tree/skill-write.smoke.test.ts`（M15 が確立した形。スクリプトを実際に spawn して stdout を見る）。**`rule` 名の集合（5種類）だけでなく「message が6件」も固定している**——集合だけだと `duplicate-id` の片方を落としても緑のままになるため。あわせて**集計行（`tallyLine(tallyQuestions(poseQuestions(...)))`）の逐語一致も固定した**——message の一致は「`derive.ts` を読めた」ことしか担保せず、整合性検証は `derive.ts` を使わない手複製部分なので、`derive.ts` が空でも通ってしまう。

### 配列順の正規化はスクリプトに持たせなかった。そして「アプリが開いたときに整う」は**誤り**である

アプリの `normalizeOrder`（DFS 行きがけ順・仮説はぶら下がり先の課題順）は値 import を持つのでバイト一致コピーにできない。手で複製すると追従漏れがテストに映らないので、**順序の正規化はアプリに任せ、スクリプトは配列順を触らない**ことにした。

**ただし「アプリが後で整えてくれる」ではない。** `normalizeOrder` は `src/modules/issue-tree/commands.ts` の**編集コマンド**（`withIssues` / `addHypothesis` 等）からしか呼ばれない。読み込み経路には無く、`module.ts` の `migrate: migrateIssueTree` は `migrate.ts` で恒等変換である。したがって:

- **アプリで開くだけでは並びは整わない。** 整うのは**編集して自動保存が走ったとき**である
- 帰結として、乱れた順はディスクに残り続け、**利用者が後で1箇所を直した瞬間に配列全体が並び替わって大きな無意味 diff が出る**。Git diff を仕様の変更履歴として読めなくするのが最も避けたい形なので、SKILL.md には「厳密でなくてよいが DFS 行きがけ順・仮説は課題の順で書いておくこと」を**勧め**として書いた（要求への格上げはしていない。スクリプトに順序正規化を持たせないという計画の範囲指定は動かしていない）

**これは計画自身の内部矛盾だった。** 計画の Task 1 Step 4-3 は「順序はアプリが開いたときに整う」と書き、同じ計画の Task 4 Step 7 は「アプリで一度**編集して**自動保存させると配列順が DFS 行きがけ順に整う」と書いている。**実物（`commands.ts` / `migrate.ts`）が正で、Step 4-3 の側が誤り。** Task 1 の初版はこの誤った Step 4-3 を逐語で写しており、レビューで捕まった（`6d2a78c` で SKILL.md 2箇所と `issue-tree-write.mjs` のヘッダコメントを直した。**実装は1バイトも変えていない**）。

**残件として `open-issues.md` に載せた**——「Skill が書いた直後のファイルは配列順が正規形になっていない」（キー順・インデント・改行は正規形）。

### 同梱 Skill を増やすときに触るのは、2箇所ではなく**3箇所**

**次に5本目を足す人が同じところで止まるので、ここに書いておく。**

| ファイル | 何を直すか |
| --- | --- |
| `src/core/skill-sync.ts` | `BUNDLED_SKILLS` に名前を足す |
| `src/core/skill-schema-copy.test.ts` | `SCHEMA_COPIES` にスキーマのコピー先を足す |
| **`src/core/skill-sync.test.ts`** | **`BUNDLED_SKILLS` を配列リテラルで `toEqual` している**ので、上の1行を足した時点で赤くなる。テスト名にも件数が入っている（「…が3本とも載っている」→「4本」） |

**計画は3つ目を挙げ落としていた**（Files にも Step にも無い）。実測でも、追従前は `src/core/skill-sync.test.ts > BUNDLED_SKILLS > ユーザーのデータを作る Skill が3本とも載っている` の1件だけが落ちた（1 failed / 1539 passed）。

### `extractImportStatements` / `isValueImportStatement` を `src/core/import-analysis.ts` へ切り出した

バイト一致コピーの検査（「値 import を持たないこと」「消去できない構文が無いこと」）に要る2つのヘルパは、`src/modules/sequence/skill-copy.test.ts` の**ローカル関数**として書かれており export されていなかった。課題ツリー側の同じ検査から使うため、**JSDoc 込みで一字一句そのまま** `src/core/import-analysis.ts` へ移し（`export` を付けただけ）、sequence 側はそこから import する形に替えた。`describe('isValueImportStatement')` の8ケースは**1つも減らさず sequence 側に残した**（混在ケースの回帰はそのテストで見つかったものなので、置き場所を動かさない）。

**計画の Task 1 Step 6 は成立しない3条件を同時に命じていた**——(1)「重複させない」(2)「`src/core/` へ切り出さない」(3)「できなければ sequence 側のテストへ委譲」。(3) の委譲先である sequence 側の `COPIES` は `derive.ts` を見ていないのに、同じ Step が「`derive.ts` については値 import と enum を必ず見る」と命じている。人間の裁定で (2) を外した。

### お手本に仕込んだ未決の内訳——**3種類の問いがすべて1件以上出る形にした**

`sample-project/課題ツリー.json` は `⚠ 未決 3（仮説は？ 1 ／ 検証結果は？ 1 ／ 判断は？ 1）`。整合性の警告は1件も出ない。

| 問い | 立つ場所 | 狙い |
| --- | --- | --- |
| **仮説は？** | 課題「送信キューの平準化方式（棄却の学びから浮上）」 | 夜間バッチ案が `rejected` になった学びから浮上した葉。**棄却が新しい課題を生み、その課題にはまだ仮説が無い**という、このツールが一番見せたい流れをそのまま置いた |
| **検証結果は？** | 仮説「再送は応募者から再送依頼が来る前提でよい」 | `events` が0件＝まだ検証していない |
| **判断は？** | 同じ仮説の `pendingNotes` 1件 | レビューで出た指摘を `pendingNotes` に置いたまま判断イベントへ昇格させていない＝**レビューの締め忘れ検出**。SKILL.md の「AI が勝手に judgement へ上げない」の実例にもなる |

**3種類を1件ずつにしたのは、お手本の役目が「3つの問いの違いを見せる」ことだから**である。モックの題材（`docs/issue-tree/仮説検証モック.jsx` の `TREE`）だけで木を組むと立つ問いが1種類に偏るので、計画が用意した仕込み（`events: []` ＋ `pendingNotes`）を入れて3種類に散らした。

**対比として「問いが立たない」箇所も残してある**: 課題「再受検の扱い」に `deferred` を1件だけ置き、配下の2件は**葉で仮説0件なのに「仮説は？」が立たない**——抑制が祖先を遡る導出であること・見送りを配下へコピーしていないことが、この2ノードで目に見える。`rationale` は6件中3件だけ埋めた（空でも warning が立たないことを画面で確かめられる）。

配列順は**下書きの時点で DFS 行きがけ順に並べた**（スクリプトが並べ替えないため）。アプリの `normalizeOrder` を実際に通して並びが動かないことを一時テストで確認し、そのテストは削除した——`sample-project/` は「お手本であり実機確認の遊び場」なので、中身に依存する恒久テストを置くと実機確認で赤くなる。

### `evals` は作っていない

既存3本は評価ハーネス（`evals/evals.json` / `grade.mjs` / `fixtures/`）を持つが、`issue-tree-register` は持たない。**計画の範囲外指定どおり**だが、**description の起動精度を測る手段が無い**（他の登録 Skill と誤起動し合っていても気づけない）ので、**残件として `open-issues.md` に載せた**。

### `README.md` の直しは、計画の2箇所ではなく**3箇所**だった

計画は「ツール表と課題ツリーの節は issue-tree-m1 で入れてある。ここで足すのは残り2箇所」としていたが、実際には3箇所ある。

| 行 | 直した内容 |
| --- | --- |
| `README.md:125` | 「**4ツール**を同じ題材で埋めたお手本」→ **5ツール**（計画が挙げ落としていた） |
| `README.md:132` の直後 | お手本の表に `課題ツリー.json` の行を追加 |
| `README.md:144` | 登録用 Skill が「**3本**置かれる（3名）」→ **4本**・`issue-tree-register` を一覧に追加 |

### 実行ビットの慣習は元から揃っていない（記録のみ）

`sequence-register` は `new-id.mjs` が `100755`、`sequence-write.mjs` が `100644`。この worktree は `core.filemode=false`（Windows）なので新規ファイルはすべて `100644` で記録される。SKILL.md からは `node scripts/...` で起動するので実害は無い。

---

## 実機確認（Task 4）について

**未実施である。** サブエージェントは Tauri の GUI を操作できないため、計画の Task 4 は人間の作業として残っている。**`docs/open-issues.md` の「次に手を付ける候補」に4件目として載せた**（issue-tree-m1・M18 と同じ扱い。確認が済んだらその項を消す）。

以下は計画 Task 4 のチェックリストを**空のまま**写したものである。**通ったかどうかの記録ではない。**

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
- [ ] **9. 開発機と違う OS**（Windows で開発したなら mac、逆も同じ）で 1〜4 を通す——**`fs` scope の glob 判定は OS で既定が反転する**（`require_literal_leading_dot` が unix で `true` / Windows で `false`）

**なお項目5は、`evals` が無いことと対になっている。** 起動精度を機械的に測る手段が無いので、**「課題ツリー」と言わずに起動するかどうかは、いまのところこの手動確認でしか分からない。**

**エージェントの側で代わりに踏めたところは踏んである**（GUI を通さない範囲）: `new-id.mjs` の採番と `--prefix` の誤り時 exit 2、壊れた fixture に対する `--check` の6警告、`--in/--out` で書き出したものを `--check` へ戻す冪等性、`.gitignore` により `node_modules` / `package-lock.json` がコミットに混ざらないこと。**GUI・配布経路・description の起動精度だけが未確認である。**

---

## 計画自身の誤り（辻褄を合わせず記録する）

1. **Task 1 Step 4-3「順序はアプリが開いたときに整う」が誤り**（正しくは「編集したとき」）。同じ計画の Task 4 Step 7 と矛盾していた
2. **同梱 Skill を増やすとき触る箇所を2つしか挙げていない**（`src/core/skill-sync.test.ts` が落ちている）
3. **Task 1 Step 6 の3条件が同時に成立しない**（重複させない／`src/core/` へ切り出さない／sequence 側へ委譲——委譲先の `COPIES` に `derive.ts` が無い）
4. **Task 1 Step 4-4 の「5ルールを逐語で」は 6 ブロック**（`rule` が5種類・`message` が6件）
5. **Task 2 の README の直し先が1箇所少ない**（`README.md:125` の「4ツール」）
6. **Task 2 Step 3 の「アプリで一度開いて自動保存させる」は成立しない**（1と同根。開くだけでは並びは整わない）
7. **Task 1 Step 8 の `cd -` は成立しない環境がある**（Bash ツールが呼び出しごとに cwd を戻す。絶対パスで同じことを実行した）

---

## 繰り越し（[`../open-issues.md`](../open-issues.md) に記録済み）

- **`issue-tree-register` に evals が無い**（description の起動精度を測る手段が無い）
- **書き出しスクリプトが配列順を整えない**（アプリも、開くだけでは整えない）
- **実機確認（Task 4）が未実施**（「次に手を付ける候補」の4件目）

**書き換えたもの（消していない）**は2件——「登録**3** Skill は整合性検証の警告文言・計上規則を、アプリと独立に複製している」を**4本**に、「`palette-fit.mjs` が Node の型ストリップに依存している」の列挙に `issue-tree-register`（`derive.ts` / `canonical.ts`）を足した。**消したもの**は1件——issue-tree-m1 が足した「**登録 Skill がまだ無い**」（本マイルストーンで解消）。

**直さずに残したもの**（Task 1 のレビューで人間が繰り越しに回した2件。台帳には載せていない微細な負債）: `src/core/import-analysis.ts` の JSDoc が `sequence-write.mjs` 固有の書き方のままであること、`src/modules/issue-tree/skill-copy.test.ts` が `canonical.ts` にも値 import / enum 検査を回していること（実害なし）。

---

## rev への反映事項

**本節の分は反映済み**（このコミットで [`../overview-rev.md`](../overview-rev.md) を編集した）。**TODO として本書に逃がしていない**（M4 の教訓）。

- **4章**: バイト一致コピーの段落を、**同梱 Skill 4本**（`issue-tree-register` を追加）へ更新し、**`derive.ts` が `questions.ts` に続く2例目であることをもって、この形が「導出ロジックを Skill と共有する」標準になった**と書いた。あわせて実行 smoke テストの段落（M15 で確定）も「3スクリプト」→「4スクリプト」に直した
- **2章**: 課題ツリーの行の「**エディタは issue-tree-m1 で実装済み**（出力・登録 Skill は後続）」を、**登録 Skill も実装済み・後続は出力のみ**へ直した（計画の指示には無いが、rev は「正」なので古い事実を残さない）
- **5章**: 計画は「同梱 Skill がスキーマのバイト一致コピーを持つという既存の記述に4本目を反映する」としていたが、**5章にその記述は無かった**（記述は4章にしかない）。スキーマの節に、実体が同梱 Skill へバイト一致でコピーされることの1行（4章への参照）を足すにとどめた

[`../lessons-for-planning.md`](../lessons-for-planning.md) には**2件足した**（上の「計画自身の誤り」の1・2 を一般化したもの）:

- **大原則へ**: 計画が実物の挙動を2箇所で述べていたら着手前に突き合わせること。**とくに「成果物へ逐語で写せ」と指示された文言は、実装ではなく転記なので報告の網に掛かりにくい**——利用者向けの文言を計画が指定するときは、その挙動の根拠となるコードのパスと関数名を併記する
- **検証手順へ**: 「同じ種類のものを1つ増やす」計画では、**その一覧を配列リテラルで固定しているテスト**も改修箇所に数えること。定数の*利用箇所*を探すと見つからない種類の3箇所目である
