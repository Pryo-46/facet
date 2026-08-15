# M15 申し送り: Skill の衛生

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。

M15 は「同梱 Skill とアプリの複製・同期」にあった既知の欠陥5件を塞ぐマイルストーンで、実装計画は [`../superpowers/plans/2026-08-15-m15-skill-hygiene.md`](../superpowers/plans/2026-08-15-m15-skill-hygiene.md)。対象は 2026-08-15 の棚卸し版 `open-issues.md`（`docs-open-issues-inventory` ブランチで main へマージ済み）の「次に手を付ける候補」1〜4番と「小さな負債」の `reorder`/`deref` 手複製の項。

コミット範囲: `1a10897`（Task 1）〜`04cd4a5`（Task 6）。計画は Task 1〜8 の8本で、**Task 1〜6 はすべてレビュー clean（fix round ゼロ）**——sequence M4 のような計画外タスクの派生は無かった。Task 7（実機確認）は人間の作業で本セッションでは未実施（後述）。Task 8 が本書。

---

## 実装で確定した事項

### 1. 実行 smoke テストという縛り方（Task 1・2・4）

`consistency.ts`（アプリ側の整合性検証）は値 import と `@/` エイリアスを持つため、`canonical.ts` のようにバイト一致コピーへ寄せられない。代わりに採った形は、各 Skill の `*-write.mjs --check` を `execFileSync` で実際に spawn し、**アプリの `checkXxxConsistency` が返す `message` がその stdout に逐語で（部分文字列として）現れること**を検査する実行 smoke テスト（`src/styles/palette-fit.smoke.test.ts` と同型）。

- `src/modules/error-catalog/skill-write.smoke.test.ts`（Task 1）／`src/modules/glossary/skill-write.smoke.test.ts`（Task 2）を新設し、あわせてエラーカタログ・用語集の両スクリプトの重複2〜4ルールを**グループごとに1件・件数付き**というアプリの計上規則へ揃えた。用語集の `fold` にも `normalizeForMatch`（`src/core/normalize.ts`）と同じ trim を追加した——末尾空白が重複判定をすり抜ける欠陥がここで塞がった。
- `src/modules/sequence/skill-write.smoke.test.ts`（Task 4）は、sequence の4ルールが実装時点で**既にアプリと一致していた**ことを実測した上で新設した。最初から緑のテストであることは「発見が無い」ことそのものであり、変異（文言を1文字変える）で赤くなることを確認してから元に戻す手順を踏んだ。副産物として、**型ストリップ import 経路（`questions.ts`/`canonical.ts` のコピーを実際に読む）を実行する唯一のテスト**になった。
- 3本のテストとも、契約が「アプリの message が現れること」であって「スクリプトの出力全体が一致すること」ではない点が同じ形——スクリプト固有の警告（用語集の単一性違反・`.gitattributes`、エラーカタログの `resolution-action-missing` の接頭辞）を足すのは妨げない。

これでエラーカタログ Skill の文言・計上規則ズレ（実害が現存していた唯一の項目）と、登録3 Skill 全ての実行テスト不在の両方が解消した。

### 2. `canonical.ts` のバイト一致コピーを3本へ統一（Task 3）

`glossary-term-register` / `error-catalog-register` の書き出しスクリプトが手複製していた `reorder`/`deref` を、`sequence-register` が確立済みの方式——`src/core/canonical.ts` の `cp` によるバイト一致コピー＋動的 import＋`src/core/skill-canonical-copy.test.ts` の一致検査——へ揃えた。書き出しの正規形が1バイトも変わっていないことは、`--in`/`--out` の実出力を新旧スクリプトで `cmp` して確認済み（差分ゼロ）。両 SKILL.md に、sequence-register と**同一の文言**で Node 要件（型ストリップが unflagged な Node: 22.18+ / 23.6+ / 24+）を追記した。

これで「正規形を作る実装が3本の Skill で2方式に分かれている」（`canonical.ts` 改訂時に旧2本だけ黙って古い正規形を書き続ける経路）が解消し、3本すべてが同一方式になった。

### 3. `collect()` の `node_modules` スキップと、`bundle.resources` 除外の見送り（Task 5）

`shouldDescendSkillDir(name: string): boolean` を `src/core/skill-sync.ts` に純関数として追加し、`src/fs/skill-resources.ts` の `collect()` が `node_modules` へ再帰しないようにした。**読んでから捨てるのではなく、読む前に除外する。** これで「同梱物に `node_modules` が入ったビルドでフォルダを開くたびに数百ファイルを IPC で読んで捨てる」性能問題と、「推移的依存に UTF-8 でないファイルが1つ入った瞬間 throw して Skill が黙って現れなくなる」欠陥の両方が消えた。

**`bundle.resources` からの `node_modules` 除外は見送った。** 計画の決定則（tauri-bundler の実物がパターン除外に対応しているか確かめてから決める）に従い、`~/.cargo/registry`・`src-tauri/target`・`Cargo.lock`・マシン全体の浅い探索の4方向で `tauri-bundler` の実体を探したが、**このマシンには存在しなかった**（`Cargo.lock` に `tauri-bundler` のエントリが無いことから、bundler はアプリのクレートグラフに入らず `@tauri-apps/cli`（npm のプラットフォーム別プリビルドバイナリ）が内部で使うものと分かる）。実物が確認できない以上、計画の規則どおり**何も変えず**、この結論を Task 8（本書・`open-issues.md`）へ引き継いだ。上記の `collect()` 側の skip で実行時の性能・throw は両方解消済みなので、除外できなくてもタスクとしては完了している——見送りの代償は「ビルド機で Skill ディレクトリに `npm install` 済みだった場合、ビルド成果物が肥大したまま」という一点のみ。

### 4. `allow_skill_dir` の literal 許可・`.gitignore` の同期復帰・`package-lock.json` の保護（Task 6）

`allow_skill_dir(app, dir, skills: Vec<String>)` へ拡張し、`.claude` ディレクトリの許可に加え、**Skill ごとの `.gitignore` を `allow_file` で literal に許可する**ループを足した（Rust 側の `allow_file` シグネチャは `tauri-2.11.5/src/scope/fs.rs` の実物で確認済み、計画のコード片と完全一致）。Tauri の fs scope の glob 判定は unix で `require_literal_leading_dot: true` が既定のため、`<dir>/.claude/**` のような `**` パターンはドット始まりの要素（`.gitignore`）に一致しない——**この許可を追加して初めて `.gitignore` を書ける**。

これを前提に、TS 側を「Rust 側の許可 → 同期の表」の順で直した（順序を逆にすると mac で「消したあとに書けない」＝Skill が半分置かれる状態を作るため、計画どおり単一コミットで完結させた）:

- `shouldSyncSkillFile` から `.gitignore` の除外を外し、同期対象へ戻した
- `isRemovableSkillEntry` に `SKILL_LOCK_FILE`（`package-lock.json`）を追加し、`node_modules` と同様に削除保護の対象にした
- `skill-sync.ts` の「`.gitignore` を同期に戻してはならない」コメントブロックを、新しい前提（`allow_skill_dir` が literal 許可すること・許可が無いと `forbidden path` に戻ること）へ書き替えた。書き替えた新文は lib.rs の実装と突き合わせて真であることを確認済み
- 併せて、`syncBundledSkills` の削除失敗握りつぶし部分にあった「`.gitignore` が forbidden path になる」という例示（この変更後は誤りになる）を `.DS_Store` のみの例へ修正した

これで「`.gitignore` を同期できない fs scope の穴」と「`package-lock.json` が同期のたびに消える」の両方が解消した。

---

## 見つかった欠陥・逸脱

**Critical/Important な逸脱・fix round は0件。** レビューで見つかった逸脱はいずれも軽微（deferred）で、実害を伴わないものだけである:

- Task 4: brief の fixture をそのまま使うとスキーマの `allOf`（`kind: call` は `awaitsReply` 必須）に違反して die するため、3つの `call` ステップに `awaitsReply: true` を補正した。この値は4ルールにも `unposedAnswers`（`failures` 未設定のため不発）にも影響しないことをレビューで確認済み——計画スニペットへの必要な補正であり、実装の誤りではない
- Task 1: smoke テストは issue の rule 種類集合だけを固定しており、rule ごとの件数までは固定していない（deferred。brief 要件外）
- Task 5: `syncBundledSkills` / `shouldSyncSkillFile` / `isRemovableSkillEntry` の doc コメントに残る「開発用」列挙が `.gitignore` を dev-only 扱いのまま（cosmetic。規範判定は `shouldSyncSkillFile` 側にあり実挙動の記述としては誤りではない）

---

## 実機確認（Task 7）

**未実施。** 計画の Task 7 は「フォルダを開くと3 Skill が置かれ、各 Skill 直下に `.gitignore` がある」「置かれた Skill で `npm install` した後もフォルダを開き直して `node_modules`/`package-lock.json` が残る」等、mac の GUI 操作を要する人間の作業であり、このセッションはエージェント駆動のため実施できなかった。チェックリストは以下、空のまま転記する（`npm run tauri dev`。プロジェクトフォルダは `sample-project/` ではなく一時フォルダを推奨）:

- [ ] フォルダを開くと3 Skill が置かれ、**各 Skill 直下に `.gitignore` がある**（M15 の核心。mac の fs scope で書けることの確認）
- [ ] 失敗トーストが出ない。devtools のコンソールに `forbidden path` が無い
- [ ] 置かれた Skill ディレクトリ（どれか1本）で `npm install` → `node_modules` と `package-lock.json` ができる → **facet でフォルダを開き直す** → lock が消えていない・`node_modules` が残っている・Skill の他ファイルは置き直されている
- [ ] そのプロジェクトフォルダを `git init` してあれば `git status` が `.claude/skills/` 配下の `node_modules` を出さない（`.gitignore` が効いている）
- [ ] フォルダを開き直したときの体感が以前より悪化していない（`node_modules` を読まなくなったので、悪化する理由はない——悪化していたら報告）
- [ ] Claude Code ペインから Skill を1本実行してみる（用語の登録など）。書き出しが正常に完走する（Task 3 の import 切り替えが実機の Node でも動くことの確認）

---

## `docs/open-issues.md` への反映

解消として**消した**もの:

- 「エラーカタログ Skill の警告文言・計上規則が既にズレている」（次に手を付ける候補 1・小さな負債の該当項）
- 「登録系3本の Skill の書き出しスクリプトを実行するテストが無い」（テストが無い箇所）
- 「`node_modules` の除外は『書かない』だけで『読まない』ではない」（挙動の穴・skill-resources の項）
- 「`allow_skill_dir` が `.gitignore` を literal 許可していない」を核とする、`.gitignore`／`package-lock.json` の同期の穴の記述（挙動の穴・skill-sync の項）
- 「既存2本の Skill が `reorder`/`deref` を手で複製したままである」（小さな負債）
- 「次に手を付ける候補」の 1〜4番

書き直したもの:

- 「シーケンス登録 Skill も整合性検証の4ルールを、警告文言まで手で複製している」（小さな負債）を、「実行 smoke テストで文言一致が縛られた」形へ更新（複製自体は残るが機械検査が付いた点を明記）
- 「`palette-fit.mjs` が Node の型ストリップに依存している」の項にあった sequence-register 側の記述を、glossary/error-catalog にも同じ機械検査（`skill-canonical-copy.test.ts`・実行 smoke テスト）が付いたことを踏まえて更新

新規に足したもの:

- `bundle.resources` からの `node_modules` 除外を見送った結論（tauri-bundler の実物がこのマシンに無く確認不能だったこと。実行時の問題は `collect()` 側の skip で解消済みであること）
- M15 実機確認（Task 7）が未実施であること

---

## `docs/overview-rev.md` への反映

**4章（Skill群）** の「アプリのロジックを同梱スクリプトから使う方法」の段落を改訂し、**手複製が縛れない場合の第2の機構**として実行 smoke テスト（アプリの `message` がスクリプトの `--check` stdout に逐語で現れることをテストで強制する）を明記した。あわせて、`canonical.ts` のバイト一致コピーが sequence-register 限定ではなく**3本すべて**に揃ったことを反映した。

「Skillの配布と同期」の段落を、`.gitignore` が同期対象へ戻ったこと・`allow_skill_dir` が Skill ごとの `.gitignore` を literal 許可すること・`package-lock.json` が `node_modules` と同様に削除保護の対象になったこと・`collect()` が `node_modules` を読まないことへ更新した。

**7章（技術スタック／Rust原則）** の「実際に認めた例外」に、`allow_skill_dir`（fs scope への literal 許可。判断を一切置かず、対象ディレクトリ・Skill 名一覧は TS 側が決めて渡す）を3件目として追記した——`lib.rs` のコメントは以前から「判断は一切置かない（rev 7章）」と自己参照していたが、7章の例外一覧には未収載だった。M15 でこのコマンドの責務が広がった（`.gitignore` の literal 許可を追加）機会に揃えた。

**3章**（「正となるデータは一つ。図は導出。」）は、Skill の複製の縛り方（バイト一致コピー／実行 smoke テストでの出力突き合わせ）と矛盾しないことを確認した——複製元は常に `src/` 側の実装で、Skill 側はコピーか出力の一致検査でそこへ従属する構造であり、記述の変更は不要だった。

---

## 教訓

`docs/lessons-for-planning.md` への追記は無い。M15 は全6実装タスクがレビュー clean で完了し、fix round・計画の誤り・継ぎ目の欠陥のいずれも発生しなかった——教訓を一般化するに足る新しい失敗のパターンが無い。
