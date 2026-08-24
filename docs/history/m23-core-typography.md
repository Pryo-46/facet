# M23 申し送り: タイポグラフィスケール v2——3サイズ4段、密度は行高で稼ぐ

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。

M23 は「**フォントの段を5段（`text-xs` 12 ／ `text-sm` 14 ／ `text-base` 16 ／ `text-lg` 18 ／ `text-2xl` 24）から3サイズ4段（`text-sm` 14 ／ `text-base` 16 ／ `text-base` ＋ `leading-normal` ／ `text-xl` 22）へ張り替え、段に依存する寸法定数・機械検査・文書を追従させる**」マイルストーン。UI ノート（[`../facet-UI設計ノート.md`](../facet-UI設計ノート.md)）の実施優先順位 §8 の**優先5＝B（タイポグラフィ。D11・D12・D13）**にあたる。実装方式は**クラスの張り替え**で、トークン値そのものを再定義したのは `--text-xl: 22px` の1つだけである（`sm` と `base` を同値にすると段の語彙が壊れるため）。

実装計画は [`../superpowers/plans/2026-08-24-m23-core-typography.md`](../superpowers/plans/2026-08-24-m23-core-typography.md)（`cfb08f0`。このブランチの2番目のコミット）、設計の正は [`../superpowers/plans/2026-08-24-m23-core-typography-design.md`](../superpowers/plans/2026-08-24-m23-core-typography-design.md)（`a0b309e`。ブランチ最初のコミット）。**実寸比較モックの Artifact URL と、それを 27型 WQHD・100% で人間が目視して出した裁定（カラム名の 16px 化・ボタンの 36px 箱／16px ラベルを含む）はスペックに記録してある**——モックの HTML 自体はセッションの scratchpad にしか無く、成果物ではない。

コミット範囲: `a0b309e`（スペック）〜本コミット。実装は `3d3e66f`〜`b312f08`（Task 1〜10、計13コミット）。**Task 8 はコミットを産んでいない**——旧段の残骸の全数 grep と生成 CSS 4点の確認だけで、直すものが無かった。fix round が入ったのは Task 5（1巡。エラーカタログ `occurrence` 列の分類）・Task 7（1巡。旧段を現在形で断言するコメント7行）・Task 10（1巡。文書のレビュー指摘3件）。**Task 11（本コミット）は申し送りの記述だけ**で、**実機確認は人間の作業として未了のまま残す**（[`../open-issues.md`](../open-issues.md) の「次に手を付ける候補」7件目）。

最終検証は4コマンドとも緑である: `npm test`・`npx tsc -b`（出力なし）・`npm run lint`（oxlint。指摘なし）・`cargo test`（Rust は1行も触っていないが、完了時の慣例どおり回した）。

---

## 何を作ったか

- **段を3サイズ4段へ。** `text-sm` 14px/1.3（補助・キーボードヒント・バッジ・ガターの問いラベル列）／`text-base` 16px/1.25（本文既定——セル・入力欄・一覧・ボタンのラベル）／`text-base` ＋ `leading-normal` 16px/1.5（複数行の自由記述欄とキャンバスの折り返しテキスト、文章として読む短い塊）／`text-xl` **22px**/1.3/500（文書タイトルとアプリ名）。**`text-xs` は D11 の 14px 下限で廃止、`text-lg` は実使用 0 件のまま閉鎖、`text-2xl` はアプリ名を 22px へ統合して閉鎖した**（2px 差の段を体系に残さない）。`--text-xl: 22px` は `src/index.css` の `@theme` で再定義している（Tailwind 既定は 20px）。
- **行間は「詰めた値を既定にし、読ませる欄だけ明示する」。** 既定は `@theme`（`--text-sm--line-height: 1.3` / `--text-base--line-height: 1.25` / `--text-xl--line-height: 1.3`）が持ち、`leading-normal`（1.5）が付くのは例外の側である。セクション見出しの 130% は本文の 125% に畳んだ——16px では差が 0.8px しかなく、単行のラベルで視認できない。
- **固定高の箱を1段上げた。** shadcn `Button` の既定 size を `h-8`→`h-9`（36px）・ラベルを `text-base`、アイコンボタンを `size-8`→`size-9`。`Badge` を `text-sm`・`h-[20px]`・`BADGE_BOX_HEIGHT = 20`（課題ツリーの `measure.ts` の `BADGE_HEIGHT = BADGE_BOX_HEIGHT + 2` は導出式なので触っていない）。`ActorRefCell` の `min-h-6` は `min-h-6.5`（26px ＝ `<button>` に `index.css` の `@layer base` が当てる `--tw-leading: 1.2` による行箱 16×1.2=19.2 ＋ `py-0.5` 4 ＋ 枠 2＝25.2 の切り上げ）へ。padding 由来の箱（`buttonBase` を敷く生ボタン・`Chip`・セルの入力欄）は固定値を持たないので触っていない。
- **測定層のフォールバックと追従寸法。** `FALLBACK_CANVAS_FONT` を 16px・16×1.5 に、`FALLBACK_SMALL_FONT` を 14px・14×1.3 に。シーケンスは `ANSWER_NOT_APPLICABLE_PREFIX_PAD_X` 64→**72**（`GutterSlot.tsx` の `pl-16`→`pl-18` と対）・`GUTTER_HEADING_HEIGHT` 18→**19**（14×1.3＝18.2 の切り上げ。`SequenceEditor.tsx` に裸で書かれていた `18` も定数参照に置き換えた）・`QUESTION_LABEL_WIDTH` 164→**180**。課題ツリーは `ISSUE_TITLE_MIN_WIDTH` 120→**128**。
- **方眼 24px は動かしていない。** 複数行段の行高（16×1.5）がちょうど 24px になり、`--grid-size` と一致する（M23 より前は 14×1.65≒23.1px の近似だった）。`index.css` の由来コメントだけ新しい計算に書き換えた。
- **機械検査を2点。** `conventions.test.ts` の段検査を反転して許可を `text-sm` / `text-base` / `text-xl` の3段にし（`xs`・`lg`・`2xl` が違反側へ回った）、**`leading-*` の許可リスト検査を新設**した（許可は `leading-none` と `leading-normal` の2つだけ。数値指定と任意値を弾く）。どちらも「わざと違反を仮置きして赤を見てから戻す」手順で、守っていない検査を作らないことを確かめている。
- **文書。** `docs/overview-rev.md` 9章の M7 決定6 の節を3サイズ4段へ書き換え（方眼の由来・ボタンの行間の項・D13 の規範を含む）、11章の「行密度は M8 の実機確認で決着したので検証項目から外す」が M23 で失効することを明記。UI ノート D13 に **rev.4 訂正**（ズームは残す）を追記。`docs/open-issues.md` は消2・足2・書き換え0。`docs/lessons-for-planning.md` の「検証手順」に worktree 基底の教訓を1項追加した。

---

## 実装で確定した事項

### `wrap` 回帰テストの入力長が 16px 化で退化した——「不等式なので自動追従」は隠れリテラルを見落としていた

着手前スキャンは、M22 が足した `SequenceEditor.dom.test.tsx` の wrap 回帰テスト（notApplicable のスロットが handled より高いこと）を「**不等式なのでフォント段が変わっても自動で追従する**」と判定していた。実際には入力が `'在'.repeat(16)` という**隠れたリテラル**を持っており、Task 2 で `FALLBACK_CANVAS_FONT` が 14px → 16px になった瞬間に handled も notApplicable も同じ2行に折り返して、両方 58px の**退化ケース**になった（`expected 58 to be greater than 58`）。

コントローラの裁定は「**実装の側は正しい。直すのはテストの入力**」で、`'在'.repeat(24)` に変更した（handled 2行 / notApplicable 3行。**容量境界ちょうどを避けてあるので、Task 6 で取り置きが 64→72px に広がった後も割れたまま**である。実際 Task 6 の後も緑だった）。テスト側のコメントに「入力長はフォント段に依存する。行数が割れる長さを選ぶこと」を書き足してある（`2261dc9`）。

### `QUESTION_LABEL_WIDTH` は計画の条件分岐の「後者」を通った——Task 2 では動かず、Task 6 で 180 になった

計画 Task 2 の Step 3 は「`FALLBACK_SMALL_FONT` の 12→14px 化で `questions.test.ts` が赤くなるはず。赤くなったら Task 6 の `QUESTION_LABEL_WIDTH` 164→180 を前借りする／赤くならなければ 164 のまま触らない」という条件分岐を持っていた。**実物では赤くならなかった**——スキャンの見積もり（`└ 実行済みだったら？` が概算 147px、閾値 148px で余裕 1px）が正しく、ぎりぎり通っていた。Task 2 は前借りせず 164 のまま残し、Task 6 が改めて 180 に上げてコメントを書き換えた。前借りが起きなかったことは Task 2 の報告に明記されており、Task 6 はそれを読んでから動いている（二重変更は起きていない）。

### エラーカタログの `occurrence` 列の分類はレビューで反転した——選定基準は幅ではなく「textarea であること」

Task 5 の一次実装は、`leading-normal` を付ける列を `columns.ts` の `FIXED_WIDTH`（列幅の設計値）で選び、`occurrence`（発生タイミング。128px）を `name`(152px)・`resolutionLevel`(112px) と同じ「固定幅の短い列」と見て**除外**した。レビューで、ブリーフの基準は列幅ではなく**描画機構**（`CellInput` が `multiline` で本物の `<textarea>` を描くか）であることが指摘された。実物の `cellNode` を読むと、`resolutionLevel`（`<select>`）と `name`（`multiline` 無しの `<input>`）以外は**すべてデフォルト分岐の `<CellInput multiline>` を通る**——`occurrence` も他の6列と同じ経路である。

fix round で `prose = field !== 'occurrence'` の例外分岐を削除し、デフォルト分岐に来る7列（`occurrence` を含む）へ無条件に `leading-normal` を付ける形に単純化した（`5990d2b`）。用語集側（`definition`・`notes` の2列）は指摘の対象外で、変更していない。

### 旧段を現在形で断言するコメント7行が残っていた——「行リスト外だから触らない」は撤回した

Task 7 の一次実装は、計画の Files が行番号で指していない箇所は触らない方針を採り、`HypothesisRow.tsx:80,214` ／ `IssueTreeEditor.tsx:261,821-822` ／ `layout.ts:46,48,50` の7行を「字面として古びるがクラス指定ではない」として残した。レビューはこれを Important と判定した——**この7行は歴史の記述ではなく現在形の断言**であり、このモジュールは「測定層と描画層が同じ段を持つこと」をコメントの規律で保つ設計なので、コメントが実クラスから外れること自体が実害である。

fix round で7行すべてを実クラス・実値に追従させた（`e673e38`）。`IssueTreeEditor.tsx:261` の「測定するフォントが2種類」は、title が body と同じ `text-base leading-normal` 系であることを確認したうえで**2種類のまま**にしてある（3種類化していない）。

### トーストの段は、スペックの表ではなく複数行段（`leading-normal`）になった

設計スペック決定1の表は、トーストを**本文既定**（`text-base` 1.25）の側に置いていた。実装は計画 Task 4 の指示どおり `text-base leading-normal`（1.5）で、`IssueBanner` の指摘一覧・空状態の説明文と同じ扱いである。Task 10 のコントローラ裁定は「**文章として読む塊は複数行段**という一貫した読みを採り、rev は実装に合わせて書く」で、rev 9章はそう書いてある。**欠陥ではなく意図した指定だが、スペックの表と実装が食い違っている事実は残る**——実機確認でトーストが緩く見えたら 1.25 に戻す（`Toast.tsx:63` の1行）。

### セクション見出しの M23 の変更は「サイズ 12→16px」の1点だけ

rev 9章の初稿は、セクション見出し（テーブルのカラム名・ファイル一覧の種類見出し）について「M21 の決着に Medium(500) を足した」と書いていた。Task 10 のレビューがこれを**事実と逆**だと指摘し、`git show a0b309e^:src/modules/glossary/GlossaryEditor.tsx` で裏を取った——`:299` は M23 着手前から `bg-surface-muted px-2 py-1 text-xs font-medium tracking-wide text-ink-muted` で、**Medium・字間・グレー・面はすべて M21 時点から揃っていた**。M23 が変えたのは `text-xs`（12px）→ `text-base`（16px）のサイズだけである。fix round で rev を訂正した（`b312f08`）。

同じ round で、ウェイトの列挙が **shadcn `Button` を落としていた**ことも直した——`src/components/ui/button.tsx:8` の base が `font-medium` を持つため**すべての `<Button>` のラベルが 500** であり、自作コードのクラスだけを数えると「ボタンは 400」と読めてしまう。

### 計画が指示した「open-issues の `ActorRefCell` の 2px 残差の項」は、台帳に一度も存在しなかった

設計スペック決定5と計画 Task 10 Step 3 は、`docs/open-issues.md` にある「空名トリガーと文字入りの 2px 残差」の項を更新するよう指示していた。実物を探すと**その項は無い**——`grep` でも該当せず、`git log --oneline -S "残差" -- docs/open-issues.md` が **0 件**（一度も入ったことがない）。実体は [`m22-core-missing-semantics.md`](m22-core-missing-semantics.md) の「約2pxの段差が残ることは明記した」という**不変の記録**の側だった。**計画の欠陥である。**

Task 10 は捏造せず、台帳の最終更新段落に「その項は存在しなかった」ことと根拠を記録し、**新しく項も起こしていない**（`min-h-6.5` で計算上は同値になったが、揃って見えるかは実機でしか分からないので、候補7のチェックリストに入れた）。**この申し送りも「消した／書き換えた」とは書かない。**

なお `src/modules/sequence/ActorRefCell.tsx:74` のコメントは、いまも「open-issues の『2px 残差』が解消する」と**存在しない台帳の項を名指ししている**（下の「直さずに残したもの」参照）。

### worktree の基底が2マイルストーンぶん古かった——着手前スキャンを2本やり直した

`EnterWorktree` の既定は `origin/main` から分岐するが、`origin/main` がローカルの作業ブランチ（`issue-tree/main`）より2マイルストーン古いままだった。rebase で `68a96f1` へ載せ替え、**古い木に対して実行してしまった着手前スキャン2本をやり直した**。教訓として `docs/lessons-for-planning.md` の「検証手順」節に1項追加してある——**worktree を作ったら、最初のコミットを積む前に `git log --oneline -1` と brief の指定 SHA を突き合わせる。**

### 計画との差分が無かったところ

- **Task 7 の `minWidth ≤ maxWidth` の再検算は割らなかった。** `ISSUE_TITLE_MIN_WIDTH` を 128 に上げた後も `minWidth` 150（128 ＋ `ISSUE_INSET_X` 11×2）に対し `maxWidth` は 242（`ISSUE_MAX_WIDTH` 320 − `reserve` 78）で、余裕は 92px（旧 108px から縮んだが依然大きい）。語を短くする判断（人間の裁量）は要らなかった。
- **`readCanvasFont` の `getComputedStyle` 経路は、見本要素のクラス定数（`*_FONT_CLASS`）を張り替えるだけで追従した。** 機構自体は触っていない。
- **Task 8 の残骸 grep はクラス指定としての旧段を 0 件**と出し、生成 CSS の4点（`.text-xl` が 22px ／ `.leading-normal` が生成される ／ `.text-sm` が 1.3 系 ／ `.text-base` が 1.25 系）もすべて合格した。直すものが無かったのでコミットが無い。
- **`tauri.conf.json` は触っていない**（決定7: ズームは残す）。`dropdown-menu.tsx` も触っていない（決定8: メニュー項目 14px は据え置き。実機確認の項目10で判断する）。

---

## 直さずに残したもの

いずれも挙動に影響しない。**このマイルストーンの中では直さないと決めたもの**で、台帳（`open-issues.md`）にも項を起こしていない。

- **`SequenceEditor.dom.test.tsx:374` のコメントに「24 を選んだ根拠」が無い。** 入力長が「行数の割れる長さ」であることは書いてあるが、**容量境界ちょうどを避けてある**（だから PAD 72 化の後も割れたまま）という選定理由は書かれていない。値自体はレビュアーが実証済み。
- **`badge-styles.ts:17-18` のコメントの算術が単独では合わない。** 「箱 20px は 14px の行＋枠 2px を `items-center` で挟んだ値」——14＋2 は 20 にならない（padding が抜けている）。計画が逐語指定した文面のニット。
- **`measure.ts` の `ANSWER_NOT_APPLICABLE_PREFIX_PAD_X` の JSDoc が痩せた。** 新しい文面は寸法の内訳と「片方だけ変えないこと」は書いているが、M22 版が持っていた「**なぜ重要か**（下端が欠ける）」の節を落としている。
- **rev 9章の `KeyHints` の「`text-sm`（14px）**のまま**」が字面としては自己矛盾。** 意図は「小ささはそのままに薄さだけ外した」だが、クラスは `text-xs` から `text-sm` に変わっている。
- **rev 9章の「走査から外すのは `components/ui/` だけ」は言い過ぎ。** `conventions.test.ts` の `EXCLUDED` は確かに `components/ui/` の1件だが、テストファイルも `isTest` で別途除外されている。
- **`ActorRefCell.tsx:74` のコメントが実在しない台帳項を名指ししている**（上記のとおり、`open-issues.md` に「2px 残差」の項は無い）。
- **`SequenceEditor.tsx:988, :1016` の `railTop + 4`。** `#N` と `→` のレール内の縦位置を決めていた裸の 4 で、`text-xs`→`text-sm` でグリフの実測高さが変わる。**実機で見ないと決められない**ので意図して据え置いた（実機確認の項目9の周辺で見て、ずれていたらそのとき直す）。この判断はコメントには書いていない。

---

## 実機確認について

**未実施である。** サブエージェントは Tauri の GUI を操作できないため、実機確認は人間の作業として残っている。以下は設計スペック「検証」11項目を、**空のまま**写したものである。**通ったかどうかの記録ではない。**

```bash
npm install        # 省略しない
npm run tauri dev
```

- [ ] 1. 本文 16px/1.25 でテーブルの行密度が保たれている（M8 の「このままでよい」の再判定に相当）
- [ ] 2. 定義・備考・答えセルの複数行が 1.5 で読める
- [ ] 3. バッジ 20px 箱・14px 文字が課題ツリーの行で潰れない・行高の連動が崩れない
- [ ] 4. カラム名 16px/500 が見出しに見え、本文と区別できる（字間・グレー・面の3チャネル）
- [ ] 5. ファイル名タイトルとアプリ名の 22px/500——bold を落として軽すぎないか
- [ ] 6. ボタン 36px 箱・16px ラベルの釣り合い。アイコンボタンと帯の中で高さが揃う
- [ ] 7. KeyHints 14px・`ink`——薄さを外して主張しすぎないか
- [ ] 8. 方眼とノードの文字行の整合（16×1.5＝24px）
- [ ] 9. 「考慮不要」の接頭（72px 取り置き）と答え本文が窮屈でない。reason 付き notApplicable の下端が欠けない（M22 の `wrap` 回帰の再確認）
- [ ] 10. ドロップダウンのメニュー項目 14px が 16px のセルの隣で沈まないか（沈むなら `text-base` へ——決定8）
- [ ] 11. Ctrl+± のズームが生きている（決定7の追認）。Ctrl+0 で 100% に戻る

あわせて、**シーケンスの参照ボタン（`ActorRefCell`）の空名トリガーと文字入りの高さが揃って見えるか**を見ること（`min-h-6.5` で計算上は同値になったが、揃って見えるかは実機でしか分からない）。**`#N` と `→` のレール内の縦位置**（上記「直さずに残したもの」の `railTop + 4`）も、項目9 の周辺で一緒に見られる。

確認後は次で後片付けする（[`../../CLAUDE.md`](../../CLAUDE.md)「マージ後の後片付け」1）:

```bash
git checkout -- sample-project/ && git clean -fdx sample-project/
git status --short          # 空になること
```

**実機確認とこのタスクは束ねていない。** チェックリストは空のままで、消し込みの管理は [`../open-issues.md`](../open-issues.md) の「次に手を付ける候補」7件目が持つ。確認で出た変更要求は計画外修正として扱う（症状と人間の言葉を分けて記録すること——[`../lessons-for-planning.md`](../lessons-for-planning.md)「タスク分割」節）。

---

## 次へ

**UI ノートの残りは D・E・F。**

- **E（フォント同梱。U1 未決）** ——M23 で Medium(500) を使うのはセクション見出しと `text-xl` だけだが、**Yu Gothic UI のフォールバックでは和文のウェイト段が出ない環境がある**。ウェイト階層（D8）の全面展開は E 待ちのままである。
- **D（レイアウト固定——行高固定＋省略・ノード幅固定）**・**F（見送り集計ほか）** は手つかず。
- **ダークの吟味**は M21 から持ち越したままで、M23 も触っていない。
