# M16 申し送り: テストの宿題

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。

M16 は `docs/open-issues.md`「テストが無い箇所」に繰り越されていた4件——sequence `schema.test.ts` の変異耐性の穴・app-controller の interleaving 3分岐・`currentDocument()` の未選択分岐・指摘バナーと額縁の配線——にテストを入れるマイルストーンで、実装計画は [`../superpowers/plans/2026-08-15-m16-test-homework.md`](../superpowers/plans/2026-08-15-m16-test-homework.md)。同節に残る3件（`FLUSH_MAX_ROUNDS`・`fileExists`・`ChoiceDialog`）は計画のスコープ外として据え置いた——それぞれ「戻り値は安全側の false」「1行委譲で意味のある挙動は他テストが押さえている」「構造的に別テストが担保している」ため。

コミット範囲: `dea476a`（計画）〜`a8860ca`（Task 6）。Task 1〜6 はすべてレビュー clean（fix round ゼロ）で、実装コードの変更は Task 5 の1箇所のみ（計画のアーキテクチャどおり、テスト追加が原則でその唯一の例外）。テストスイートは 1363→1379 件に増え、全緑。`npx tsc -b` もクリーン。Task 7（本書）が最終タスク。

---

## 実装で確定した事項

### 1. schema.test.ts の入れ子変異耐性（Task 1）

`src/modules/sequence/schema.test.ts` に、トップレベルと `failures` マップしか検査していなかった未知キー拒否を `actors`・`steps`・`answerSlot`・`unknownSlot` の入れ子レベルへ広げ、あわせて `unknownSlot.decision` の enum 不正値・`const`（`schemaVersion` / `type`）・`from`/`to` のパターン崩しのテストを足した。

### 2. currentDocument の未選択分岐（Task 2）

`selectedPath === null` のときに `currentDocument()` が `null` を返すことを明示的に固定した。ただしこの行自体は直後の `files.find` に**遮蔽**されており、black-box のテストでは変異検知が原理的にできない（`selectedPath` を読む行を消しても `files.find(f => f.path === null)` は同じく見つからず `undefined` を返すため、観測できる結果が変わらない）。挙動としては固定済みで、テスト内コメントにその旨を記録済み。

### 3. interleaving 3分岐（Task 3・4）

`rescan` の `switchingFolder > 0` ガード（Task 3）と `token !== scanSeq || projectDir !== dir` ガード（Task 4）を、既存の `createHarness`（I/O 注入）に手動 Promise を挟む形で固定した。

- Task 3 の変異確認だけ、赤が assertion ではなく**決定論的な 5000ms timeout** で出た。ガードを外すと `rescan` が同期的に `io.scan` へ到達し、`deferNextScan` が用意する deferred slot #1 を `openFolder` 側の呼び出しより先に捕まえてしまうため、`openFolder` が永久に解決しない待ちに落ちる。`deferNextScan` の「call #1 の先取り順」は**「`io.scan` に最初に到達した呼び出し」に結合している**——ガードの有無で「どちらの呼び出しが先に `io.scan` へ着くか」が変わるテストでこのヘルパを再利用するときは、赤が assertion ではなく timeout で出ることがある点に注意（レビューが独立にトレースし、検知は決定論的に成立していることを確認済み）。
- Task 4 の `token !== scanSeq` 節は単独で赤くできる一方、`projectDir !== dir` 節は `token` 節に常に先取りされるため単独では赤くならない（防御的二重化）。存置する判断とその理由はテスト内コメントに記録済み。

### 4. 指摘バナーと額縁の配線（Task 6）

`src/App.dom.test.tsx` に、M13 が確立した「フォルダを開いてファイルを選ぶ」手順（`disk` モック＋名前の帯テスト群と同じ形）で editable なファイルを選び、`IssueBanner` がエディタの上に1回だけ出ることを固定した。

---

## 見つかった欠陥（Task 5）

interleaving のテストを書く過程で、計画段階のコード読解が予告していた `closeCurrentFile` の潜在クラッシュを実際に踏んだ。`closeCurrentFile` は `await saver.flush()` の**後**にクロージャ変数 `saver` を読み直して `.dispose()` していたため、flush 待ちの間に `handleSelectedGone` や `deleteFile` が `saver` を `null` に差し替えると、復帰後の `saver.dispose()` が `TypeError: Cannot read properties of null (reading 'dispose')` で落ちる。

TDD の赤でこの TypeError を実測してから、判断に使う値（自分が掴んだ `saver`）をローカル変数 `current` へ**凍結**する形で修正した——M5 の教訓「判断に使う値は関数の中で引いて凍結する」への追従であり、新しい設計判断ではない（`docs/overview-rev.md` を触っていない理由）。レビューは「`saver` が差し替わっていた場合も、修正前のコードは新しい `saver`（＝新しく開いたファイルの pending 編集）ごと dispose して黙って捨てていたのに対し、修正後は差し替え後の `saver` に一切触れない——厳密に改善である」と独立に確認した。

---

## 書かなかった／書けなかったテストの記録

- `currentDocument()` の `selectedPath === null` 行は、直後の `files.find` に遮蔽されて black-box では変異検知不能（上記「実装で確定した事項」2参照）。挙動は Task 2 で固定済み、テスト内コメントにも記録済み。
- rescan ガードの `projectDir !== dir` 節は `token !== scanSeq` 節に常に先取りされ、単独では赤くできない（防御的二重化として存置。上記3参照）。テスト内コメントにも記録済み。
- Task 5 の修正が入れた `saver === current` ガード自体は、単独ではテストに固定されていない——`if (saver === current) saver = null` を bare `saver = null` に置き換えても既存テストは全緑のままになる（ガードが守っている「差し替え後の `saver` を巻き戻す」分岐を踏むテストが無いため）。ソースコード側のコメント（「判断に使う値は関数の中で引いて凍結する」）が意図を運んでおり、テストでは固定していない。

---

## レビューが見つけた、未修正の挙動の穴（Task 5・実害小・修正はしていない）

`closeCurrentFile` の修正は「自分が掴んだ `saver` を壊さない」ところまでを直したもので、それ以外の interleaving 経路は塞いでいない。最終レビューが次の2点を実在する穴として指摘し、`docs/open-issues.md` へ追記した（詳細は同ファイル「挙動の穴」節の `[M16]` 2件を参照）:

1. `closeCurrentFile` は `selectSeq` トークンを持たないため、flush 待ちの間に選択が差し替わっても、遅れて再開した古い `closeCurrentFile` の尻尾（`setSelected(null)` / `host.setDocument(null)`）は無条件に実行される。新しい `saver` が生きたまま選択と編集画面だけが閉じる。
2. `handleSelectedGone` は意図して flush しない（消えたファイルへ書き戻すと復活するため）が、その検知より前に `closeCurrentFile` が飛ばした flush は既に in-flight であり、着地すれば外部で消えたファイルを書き戻す。M16 の修正はこの窓を広げても狭めてもいない。

いずれも「今回の修正前より状況は悪化していない」（1 は修正前は同じ経路で新しい `saver` ごと dispose して pending 編集を黙って捨てていたので、現状は「破壊は減ったが穴は残る」状態）。塞ぐには `closeCurrentFile` に選択のトークンを持たせる契約変更が要る。

---

## 実機確認

**無し。** 本マイルストーンで固定した挙動（スキーマの拒否・未選択時の出力ガード・rescan の直列化・saver の凍結・バナーの配線）はいずれも自動テストで観測できる範囲であり、GUI 操作を要する項目は無い。M15 で未実施のまま残っている実機確認（[`m15-skill-hygiene.md`](m15-skill-hygiene.md) 参照）とは無関係の、別件の判断である。

---

## `docs/open-issues.md` への反映

解消として**消した**もの（「テストが無い箇所」節）:

- `schema.test.ts` の変異耐性の穴
- interleaving を要する3分岐
- `currentDocument()` の未選択分岐
- 指摘バナーと額縁の配線

「次に手を付ける候補」の「app-controller の interleaving 3分岐」項も解消につき削除し、残る候補の番号を詰めた。

新規に足したもの（「挙動の穴」節、`[M16]` タグ）:

- `closeCurrentFile` の尻尾が古いまま実行される残余 interleaving（上記「レビューが見つけた、未修正の挙動の穴」1）
- 削除の着地前に飛んだ flush が消えたファイルを復活させうる経路（同2）

`closeCurrentFile` の TypeError そのもの（Task 5 で修正済みの欠陥）は open-issues には足していない——本書が記録である。

---

## `docs/overview-rev.md` への反映

**無し。** Task 5 の修正は「判断に使う値は関数の中で引いて凍結する」という M5 で確定済みの原則への追従であり、新しい設計判断を生んでいない。他のタスクはテスト追加のみで実装は変えていない。

---

## 教訓

`docs/lessons-for-planning.md` への追記は無い。M16 は「判断に使う値を凍結する」（M5）と「新しく足すテストは対応する実装を一時的に壊して赤を確認してから戻す」（変異確認、既存の教訓）という**既存の教訓を確認した**マイルストーンであり、一般化するに足る新しい失敗のパターンは出なかった。Task 3 で得た `deferNextScan` の先取り順に関する知見は、ヘルパの再利用時の注意として上記「実装で確定した事項」3に残した——一般則というよりは特定ヘルパの癖の記録であり、lessons-for-planning の対象ではないと判断した。
