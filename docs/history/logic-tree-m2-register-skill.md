# logic-tree M2 申し送り: ロジックツリー登録 Skill と `flat-tree` の分割

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。

logic-tree-m2 は「**会話で『どんなときに◯◯が起きるか洗い出して』と言えば、その会話が `type: "logicTree"` の JSON になる**」ための Skill（`.claude/skills/logic-tree-register/`）を**5本目の同梱 Skill**として足すマイルストーン。設計スペックは [`../superpowers/specs/2026-08-29-logic-tree-register-skill-design.md`](../superpowers/specs/2026-08-29-logic-tree-register-skill-design.md)、実装計画は [`../superpowers/plans/2026-08-29-logic-tree-m2-register-skill.md`](../superpowers/plans/2026-08-29-logic-tree-m2-register-skill.md)。

コミット範囲: `43a4ef3`（着手前の走査で見つけた計画の欠陥3件の修正）〜 本コミット。計画は Task 1〜7 の7本。fix round が入ったのは **Task 4**（1巡・SKILL.md の文言のみ）と **Task 6**（1巡・判定器の穴2件）。

| Task | コミット | 内容 |
| --- | --- | --- |
| 1 | `a300fad` | `src/core/canvas/flat-tree-core.ts` の切り出し（`key` を持たない index ベースの純粋層）。`flat-tree.ts` は `key` を被せる薄い層に |
| 2 | `ced299c` | Skill の骨格（`package.json` / `.gitignore` / スキーマ・`canonical.ts`・`flat-tree-core.ts` のバイト一致コピー / `new-id.mjs`）＋ `src/modules/logic-tree/skill-copy.test.ts` |
| 3 | `4a5d708` | `logic-tree-write.mjs`（検証・DFS 正規化・整合性4種・集計・書き出し）＋ `src/modules/logic-tree/skill-write.smoke.test.ts`（5ケース） |
| 4 | `6d07166` → `79957d1` | `SKILL.md`（122行） |
| 5 | `f551509` | `BUNDLED_SKILLS` ほか5箇所の登録 ＋ `skill-canonical-copy.test.ts` の網羅アサーション |
| 6 | `e698db8` → `1e8c5c8` | evals（5ケース・`grade.mjs`・fixture） |
| 7 | 本コミット | rev・README・docs の地図・台帳・本書 |

---

## 何を作ったか

`.claude/skills/logic-tree-register/` は既存4本と同じ骨格を持つ:

- `SKILL.md` — 手順書（122行）
- `scripts/new-id.mjs` — ID 採番（`node` の1種類だけ。`node` 以外の `--prefix` は exit 2 で拒否）
- `scripts/logic-tree-write.mjs` — スキーマ検証・DFS 行きがけ順への正規化・正規形の書き出し・整合性検証・未記入の集計
- `scripts/flat-tree-core.ts` / `scripts/canonical.ts` — **アプリのソースのバイト一致コピー**（後述）
- `schemas/logic-tree.schema.json` — 原本のバイト一致コピー
- `package.json`（`ajv`）／ `.gitignore` ／ `evals/`（5ケース）

**既存4本と違うところは3つある。**

1. **フェーズB を持たない。** `sequence-register` / `issue-tree-register` は「A: 木を起こす／B: 未決を詰める」の2フェーズだが、この Skill は**1フェーズしかない**。ロジックツリーのスキーマには問いの仕組みが無く、欠落は「`text` が空」の1種類だけだからである。SKILL.md 冒頭にその旨を逐語で書いてある
2. **木の組み立てを手で複製していない。** 整合性検証の4ルールのうち3つ（`cyclic-parent` / `missing-parent` / `multiple-root`）の**判定そのものは `buildTree` の戻り値**で、その `buildTree` はバイト一致コピーが持つ。手複製なのは**警告の文言と集計行の組み立てだけ**である
3. **`--out` が配列順を正規化する。** 既存2本（sequence / issue-tree）の書き出しスクリプトは配列順を触らない。この Skill は DFS 行きがけ順へ並べ替えて書き出す（後述）

**`sample-project/` には手を付けていない。** ロジックツリーのお手本（`応募が書類選考に進まないケース.json`）は logic-tree M1 以来のもので、このマイルストーンでは**検証の対象**にしただけである（`--check` と `--in`/`--out` の往復。**1バイトも変えていない**）。

---

## 実装で確定した事項

### バイト一致コピーの3例目は「制約を先に書いた」のではなく「制約を満たすようにコアを割った」——この形は1例目である

既存2例は、どちらも**書く時点で JSDoc に制約が書いてあったから `cp` 1回で済んだ**例だった——`questions.ts`（sequence M4）と `derive.ts`（issue-tree-m2）。issue-tree-m2 の申し送りは、そこから「**Skill へコピーする予定のファイルは、その旨と制約を原本の JSDoc に書いておくこと**」という規約を立てている。

**3例目はその規約が効かなかった側の実例である。** コピーしたかった `buildTree` / `orderFlatNodes` は `src/core/canvas/flat-tree.ts` に**先に存在しており**（logic-tree M1 → M20 でコアへ引き上げ）、行の同一性の鍵を作る `computeRowKeys` を**値 import していた**。「Skill へコピーする」という予定がそもそも立っていなかったので、制約は書かれていない。

道は2つあった。

| 案 | 採否 |
| --- | --- |
| 原本（`flat-tree.ts`）を書き換えて制約に合わせる | **不採用。** `key` は React の描画のための関心で、既存の利用者（ロジックツリー・課題ツリーの両エディタ）が要求している。コピーの都合で公開 API を曲げることになる |
| **コピーが要る部分を、純粋な下層として切り出す** | **採用。** `key` を持たない index ベースの部分を `flat-tree-core.ts` として新設し、`flat-tree.ts` はその上に `key` を被せる薄い層にした |

**公開 API は1つも変えていない**——`flat-tree.test.ts` は**無変更で緑**である（Task 1 の diff にこのファイルは現れない）。Skill が要るのはルート位置・参照切れ・到達不能・DFS 行きがけ順だけで、`key` は要らない、という切り口がそのまま分割線になった。

**この形は logic-tree-m2 が1例目である。** 一般化して rev 4章へ反映した——**予定が先に立っていないファイルをコピーしたくなったときは、原本を曲げるのではなく、コピーが要る部分を純粋な下層として切り出す。** 新設した `flat-tree-core.ts` の JSDoc には、既存2例と同じ制約（値 import・相対 import・enum を持たない）と、`key` を被せるのは `flat-tree.ts` の役目であることを**先に書いてある**（次にここへ触る人のために）。

### 配列順の正規化を、このツールでは**スクリプトに持たせられた**

issue-tree-m2 は「順序の正規化はアプリに任せ、スクリプトは配列順を触らない」と決めている。理由は**制約**であって設計上の好みではない——アプリの `normalizeOrder` は値 import を持つのでバイト一致コピーにできず、手で複製すると追従漏れがテストに映らないためである。そして同じ申し送りが、その帰結として「**Skill が書いた直後のファイルは配列順が正規形になっていない**」を残件として台帳に立てている。

ロジックツリーではこの制約が無い。**`orderFlatNodes` が `flat-tree-core.ts` に載ってコピー可能になった**ので、書き出しスクリプトがアプリと同じ関数で並べ替えられる。したがって `--out` は DFS 行きがけ順へ整えて書き出す。**結果として、このツールについては上の残件を作らずに済んだ。**

**順序正規化は「持たせたくない」のではなく「複製せずに持てるなら持つ」ものである**——これを rev 4章へ書いた。コピー可能な形にできた時点で持たせるのが正で、持たせないのは制約に突き当たったときの妥協である。

### 整合性の報告は「入力ファイルの並び」で行う——並べ替え後の位置で報告しない

上と対になる細かいが重要な決定。整合性の警告の `message` は「（未記入・N番目）」と**配列位置でノードを指す**（`src/modules/logic-tree/consistency.ts` の `label`）。空のノードは文言で呼べないので、そうするしかない。

したがって、**並べ替えた後の配列で検証すると、アプリが同じファイルを開いたときの指し方と食い違う。** `orderFlatNodes` の結果は**書き出す本文を作るためだけ**に使い、検証・集計・「未記入のノード: N番目」の報告はすべて入力ファイルの並びで行う。

**計画は逆に書いていた**（後述の「計画自身の誤り」2）。着手前の走査で見つけて直している。

### `canonical.ts` のコピー検査を1箇所に集約し、網羅を強制した

issue-tree-m2 が台帳に立てた残件——「`canonical.ts` のバイト一致コピーに『網羅』のアサーションが無い」——を解消した。

かつて検査は3ファイルに散っていた（旧2本＝`src/core/skill-canonical-copy.test.ts`／sequence・issue-tree＝各モジュールの `skill-copy.test.ts`）。スキーマ側には `src/core/skill-schema-copy.test.ts` に `BUNDLED_SKILLS` との `toEqual` があるのに、**canonical 側には同種のアサーションがどこにも無く、コピーを持ちながら検査を書き忘れても緑で通った。**

`src/core/skill-canonical-copy.test.ts` に `CANONICAL_COPIES` を置き、`BUNDLED_SKILLS` と突き合わせる形にした。**6本目を足した人が検査を書き忘れたら赤くなる。**

**肝は `CANONICAL_COPIES` を手書きの配列リテラルにしたことである。** `BUNDLED_SKILLS.map(...)` で導出すると `toEqual` が恒真式になり、**何も縛らないテストになる**（計画はその形で書かれていた。後述の「計画自身の誤り」1）。

各モジュールの `skill-copy.test.ts` にある `canonical.ts` の行は**消していない**——あちらは「値 import を持たない」「消去できない構文が無い」の検査も一緒に回しており、集約したのはバイト一致と網羅の側だけである。

### 実測した数字

**お手本 `sample-project/応募が書類選考に進まないケース.json` に `--check` を掛けた結果:**

```
✓ スキーマ検証OK
✓ 正規形と一致しています
  ノード: 15件 ／ 深さ: 3
  ⚠ 要対応 1（未記入 1）
  未記入のノード: 12番目
```

整合性の警告は**1件も出ない**。`--in`/`--out` で往復させた結果の diff も**0**である（＝アプリが書いたファイルとスクリプトが書くファイルが完全に一致している。配列順の正規化を入れたので、この一致は「たまたま」ではなく機構で担保されている）。

**テストの実測:**

- `src/modules/logic-tree/skill-write.smoke.test.ts` — **5ケース**（整合性 message の逐語一致／集計行の `tallyLine` との逐語一致／欠陥の無いファイルは exit 0 で「要対応 0」／`--out` の DFS 正規化と `--check` の冪等性／スキーマ違反は exit 1）
- `src/core/canvas/flat-tree-core.test.ts` — 新設。`flat-tree.test.ts` は**無変更**
- `npm test` — **1832 passed / 1 failed**。**落ちる1件は `src/styles/fonts.test.ts` で、着手前から赤い**（フォントファイルの存在検査。このマイルストーンとは無関係）。`tsc -b` / `lint` / `cargo test` は緑

### 同梱 Skill を増やすときに触るのは5箇所（issue-tree-m2 の「3箇所」から増えた）

issue-tree-m2 の申し送りは3箇所（`skill-sync.ts` / `skill-schema-copy.test.ts` / `skill-sync.test.ts`）を挙げ、加えて「忘れても赤くならない場所が2つある」（canonical の検査・`reading-guide.md`）と書いていた。**logic-tree-m2 では、そのうち1つが赤くなる側へ移った。**

| ファイル | 何を直すか | 忘れると |
| --- | --- | --- |
| `src/core/skill-sync.ts` | `BUNDLED_SKILLS` に名前を足す | — |
| `src/core/skill-schema-copy.test.ts` | `SCHEMA_COPIES` にコピー先を足す | **赤くなる** |
| `src/core/skill-sync.test.ts` | 配列リテラルの `toEqual` と、テスト名の件数（「4本」→「5本」） | **赤くなる** |
| `src/core/skill-canonical-copy.test.ts` | `CANONICAL_COPIES` に足す | **赤くなる**（logic-tree-m2 で追加） |
| `src/core/reading-guide.md` | Skill 名の一覧に足す | **緑のまま通る**（テストが無い。台帳に残したまま） |

---

## 実機確認について

**未実施である。** サブエージェントは Tauri の GUI を操作できないため、実機確認は人間の作業として残っている。**[`../open-issues.md`](../open-issues.md) の「次に手を付ける候補」に7件目として載せた**（issue-tree-m2・issue-tree-m3 と同じ扱い。確認が済んだらその項を消す）。

以下は計画のチェックリストを**空のまま**写したものである。**通ったかどうかの記録ではない。**

```bash
npm install        # 省略しない
npm run tauri dev
```

- [ ] 1. Skill が置かれる——プロジェクトフォルダを開き直し、`.claude/skills/logic-tree-register/` が現れる。`evals/` と `node_modules/` が**置かれていない**こと、`package.json` と `.gitignore` と `schemas/logic-tree.schema.json` が**置かれている**こと
- [ ] 2. 利用者の手順を踏む——置かれた先の Skill ディレクトリで `npm install` を実行する
- [ ] 3. その後の状態でもう一度アプリにフォルダを走査させる——**失敗トーストが出ないこと**、`node_modules` が消されていないこと
- [ ] 4. `git status` が汚れていない（Skill の `.gitignore` が効いている）
- [ ] 5. Skill を実際に使う——Claude Code で「どんなときに◯◯が起きるか洗い出して」と**「ロジックツリー」と言わずに**頼み、Skill が起動すること
- [ ] 6. **課題ツリーと取り違えないこと**——「PoC で何を確かめるか整理して」と頼み、`logic-tree-register` が起動**しない**こと
- [ ] 7. 書かれたファイルがアプリで開ける——赤表示（整合性エラー）が出ないこと。未記入の集計がスクリプトの出力と一致すること
- [ ] 8. アプリで一度編集して自動保存させても、配列順が動かないこと（Skill が既に DFS 行きがけ順で書いているため）
- [ ] 9. お手本を開く——`sample-project/応募が書類選考に進まないケース.json` が今までどおり開き、未記入1件が出ること
- [ ] 10. 開発機と違う OS（Windows で開発したなら mac、逆も同じ）で 1〜4 を通す——**`fs` scope の glob 判定は OS で既定が反転する**

**エージェントの側で代わりに踏めたところは踏んである**（GUI を通さない範囲）: お手本に対する `--check` の全出力、`--in`/`--out` の往復で diff が出ないこと、スキーマ違反の exit 1、整合性 message と集計行のアプリとの逐語一致。**GUI・配布経路・description の起動精度だけが未確認である。**

**項目5・6は evals と対になっている。** evals は5ケース定義してあるが**実行ハーネスに掛けていない**（下記の繰り越し）ので、**起動精度を確かめる手立ては、いまのところこの手動確認だけである。**

---

## 計画自身の誤り（辻褄を合わせず記録する）

**着手前の走査で見つけて `43a4ef3` で直したもの（3件）:**

1. **`CANONICAL_COPIES` を `BUNDLED_SKILLS` から `map` で導出する形で書いていた。** そのまま書けば網羅アサーションが**恒真式**になり、何も縛らないテストになる（「6本目を足したら赤くなる」という目的そのものが達成されない）。手書きの配列リテラルへ直した
2. **整合性検証を並べ替え後の配列で行う形で書いていた。** message は「（未記入・N番目）」と配列位置でノードを指すので、アプリが同じファイルを開いたときの指し方と食い違う。入力ファイルの並びで検証する形へ直した
3. **evals の `isDfsOrdered` が「親が既出か」だけを見ていた。** これでは `[A, B(A), D(A), C(B)]` のような**行きがけ順でない並び**を素通りさせる（`D` の親 `A` は既出なので通ってしまう）。祖先スタックで見る形へ直した

**Task 4（SKILL.md）の実装中に、実物と突き合わせて見つかったもの（2件）:**

4. **スキーマの探索順の記述が逆だった。** 計画は「同梱コピー → `--schema` → 環境変数」と書いていたが、実装（および先例の `issue-tree-write.mjs`）は **`--schema` → 環境変数 `FACET_LOGIC_TREE_SCHEMA` → 自動探索（同梱コピーを含む）** である。SKILL.md を実装に合わせた。**なお設計スペック（[`../superpowers/specs/2026-08-29-logic-tree-register-skill-design.md`](../superpowers/specs/2026-08-29-logic-tree-register-skill-design.md)）にも同じ誤りが残っている**——スペックと計画は着手時点の記録なので直さず、ここに記録する
5. **終了コード1の内訳に「JSON 破損」が抜けていた**（実装は JSON のパース失敗も exit 1）。SKILL.md 側を実装に合わせた

**Task 6（evals）で見つかったもの（1件）:**

6. **「Step 4 の checks は6件」は誤りで、実際は8件**（`add(...)` の呼び出し数が正）

**Task 6 のレビューで見つかったもの（1件・`1e8c5c8` で修正）:**

7. **`grade.mjs` の判定が、自分の `expected_output` の契約を果たしていなかった。** 2箇所。
   - **(a) id=4（`append-to-existing`）が、既存ノードの `parentId` の不変を見ていなかった。** `expected_output` は「既存3ノードの id と text が1バイトも変わらない」と言っているが、判定器は `parentId` を見ておらず、**AI が既存ノードを付け替えても素通りした**（木の形が変わるので、このケースが一番防ぎたい壊れ方である）
   - **(b) id=1（`transcribe-conversation`）に内容チェックが1つも無かった。** このケースの存在理由は「**AI が幻覚した枝を足していないこと**」を測ることなのに、そこが未検証のまま「ファイルが1つできた」だけを見ていた

---

## 繰り越し（[`../open-issues.md`](../open-issues.md) に記録済み）

**消したもの（1件）:**

- **`canonical.ts` のバイト一致コピーに「網羅」のアサーションが無い**（`[issue-tree-m2]`）——Task 5 で解消

**足したもの（5件。すべて `[logic-tree-m2]`）:**

- **実機確認が未実施**（「次に手を付ける候補」の7件目）
- **evals は定義しただけで、実行ハーネスに掛けていない**——`grade.mjs` は合成データで動作確認しただけで、**起動精度の実測はまだ無い**。`issue-tree-register` は evals そのものが無いのに対し、こちらは**あるのに回していない**
- **`logic-tree-write.mjs` の `.gitattributes` の警告が「整合性の警告」の見出しの下に出る**——整合性の問題でもアプリの赤表示でもないので**見出しが嘘になっている**。かつ未テスト（smoke テストの一時ディレクトリには `.git` が無い）
- **`skill-write.smoke.test.ts` が子プロセスの stderr を継承している**——意図的なスキーマ違反ケースのエラー出力が緑の実行でも画面に出る。**緑の実行が壊れて見えるのが害**で、読む人がテスト出力中のエラーを無視する癖がつく（`stdio: ['ignore','pipe','pipe']` で消える）
- **`logic-tree-write.mjs` の exit 2 の経路と、スキーマの解決順が未テスト**

**書き換えたもの（3件。消していない）:**

- 「登録**4** Skill は整合性検証の警告文言・計上規則を…複製している」を**5本**にし、**ロジックツリーだけは判定そのものを複製していない**ことを添えた
- 「`palette-fit.mjs` が Node の型ストリップに依存している」の列挙に `logic-tree-register`（`flat-tree-core.ts` / `canonical.ts`）と一致検査の所在を足した
- 「`src/core/reading-guide.md` の Skill 名一覧を縛るテストが無い」の「**5本目**を足したとき」を**6本目**へ改めた。**5本目＝このマイルストーンはこの穴を素通りできた**（`reading-guide.md` の更新自体は行われている）が、**守ったのは人の記憶であってテストではない**ので消していない

**台帳に載せず、記録としてここに残すもの（1件）:**

- **[`../README.md`](../README.md) の「マイルストーンの履歴」の表に `sequence-m5` と `M27` の行が欠けている。** どちらも `docs/history/` に実体があり、[`../open-issues.md`](../open-issues.md) の「最終更新」からも参照されている。**このマイルストーンの範囲外なので直していない**（logic-tree-m2 が足したのは自分の行だけである）。`open-issues.md` へは載せていない——台帳はコードの残件を扱う場所で、これは文書の地図の欠落だからである。次に地図を触る人が拾えるよう、ここに記録する

---

## rev への反映事項

**本節の分は反映済み**（このコミットで [`../overview-rev.md`](../overview-rev.md) を編集した）。**TODO として本書に逃がしていない**（M4 の教訓）。

- **2章**: ロジックツリーの行に実装状況を添えた（「**エディタは logic-tree M1、登録 Skill は logic-tree-m2 で実装済み。後続は出力プロファイルのみ**」）。それまでこの行だけが実装状況を持っていなかった
- **4章（`canonical.ts` のコピー）**: 「登録**4** Skill」→**5 Skill**。**一致検査が3ファイルに散っている**という記述を、**logic-tree-m2 で1箇所へ集約した**へ全面的に書き替えた。あわせて「**`BUNDLED_SKILLS` から `map` で導出しないことが肝である**（導出すると恒真式になる）」を明記した——ここを外すと集約の意味が消えるため
- **4章（導出ロジックの共有）**: 共有の例が**3つ**になったことと、**3例目だけはモジュールではなくコアのファイル**（`flat-tree-core.ts`）であることを書いた。そのうえで、**3例目が「制約を先に書いた」ではなく「制約を満たすようにコアを割った」形であり、それが1例目であること**を子項目として起こした（原本を曲げる案を採らなかった理由まで含む）
- **4章（配列順）**: 「**書き出しスクリプトが配列順を正規化するか**はコピーの可否で決まる」を子項目として新設した。sequence / issue-tree が触らないのは制約であって好みではないこと、コピー可能にできた時点で持たせるのが正であること、**ただし整合性検証は並べ替え前＝入力ファイルの並びで行う**ことを書いた
- **4章（実行 smoke テスト）**: 「4スクリプト」→**5スクリプト**。あわせて「集計結果の逐語一致も固定する」規約に**いま従っているのは `issue-tree-register` だけ**という記述を、**`issue-tree-register` と `logic-tree-register` の2本**へ直した（`sequence-register` が未適用であることは変わらない）
- **5章**: スキーマのバイト一致コピーを持つ Skill の本数を「issue-tree-m2 時点で4本」→「**logic-tree-m2 時点で5本**」へ
- **6章（出力プロファイル）**: 「用語集は現時点で1プロファイル、ロジックツリーとシーケンスは0本」が古かったので直した。**ただし計画が指定した文言（「シーケンスは2プロファイル（Markdown・Mermaid）」）は実物と違っていた**——次節

### 計画の指定と実物が食い違っていた箇所（rev 6章）

計画の Task 7 Step 5 は、rev の出力プロファイルの記述を「**シーケンスは2プロファイル（Markdown・Mermaid。sequence-m3）**」へ直せと指定していた。**実物は1プロファイルである。**

- `src/modules/sequence/module.ts` の `outputs` は **1件だけ**（`{ id: 'default', label: 'Markdown', fileSuffix: '' }`）
- `mermaid.ts` は独立したプロファイルではなく、`markdown.ts` から呼ばれて**1本の Markdown の中に図として埋め込まれる**（同ファイルのコメント「規約5: 図（Mermaid）と失敗考慮の表を1本の Markdown にまとめる（sequence M3）」）
- **rev 2章のシーケンスの行は、もともと正しく「（Markdown 表＋Mermaid、1プロファイル）」と書いていた**——計画の指定に従うと、同じ文書の2章と6章が食い違うことになっていた

`mermaid.ts` / `markdown.ts` が実在することは確かめたが、**ファイルが2本あることとプロファイルが2本あることは別である。** 実物に合わせて「シーケンスも1プロファイル」と書き、Mermaid が別プロファイルではない理由（1本の Markdown にまとめている）を添えた。

**これで、このマイルストーンで「計画の記述が実物と違っていた」のは3例目になる**（スキーマの探索順・終了コード1の内訳・これ）。いずれも**実装ではなく転記の指示**——issue-tree-m2 が [`../lessons-for-planning.md`](../lessons-for-planning.md) に書いた「**成果物へ逐語で写せと指示された文言は、実装ではなく転記なので報告の網に掛かりにくい**」がそのまま3回起きた形である。教訓は既に載っているので追記はしていない。
