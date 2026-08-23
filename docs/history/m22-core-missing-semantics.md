# M22 申し送り: 欠落の規約——空は空のまま、数えて、行番号で指す

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。

M22 は「**欠落（未決）の判定・集計・表示を5モジュール（用語集・エラーカタログ・ロジックツリー・シーケンス・課題ツリー）で統一し、『未定義』『別名なし』等の捏造文字列を消し、重複警告を件数＋行番号にし、規約を `docs/missing-semantics.md` に固定する**」マイルストーン。課題ツリーの既存実装（`poseQuestions` → `tallyQuestions` → 帯のチップ）を参照実装として一般化した。

実装計画は [`../superpowers/plans/2026-08-24-m22-missing-semantics.md`](../superpowers/plans/2026-08-24-m22-missing-semantics.md)（`8ad8aab` でこのブランチの2番目のコミットとして置いた）、設計の正は [`../superpowers/plans/2026-08-24-m22-missing-semantics-design.md`](../superpowers/plans/2026-08-24-m22-missing-semantics-design.md)（`5c9bc12`。ブランチ最初のコミット）。

コミット範囲: `5c9bc12`（スペック）〜本コミット。実装は `3c0b52b`〜`8d388f4`（Task 1〜14、計17コミット）。fix round が入ったのは Task 11（1巡。`wrap` の測定キャッシュ鍵衝突）・Task 12（1巡。空名トリガーの潰れと aria-label の付け先）・Task 14（1巡。最終ブランチレビューの Important 4件）。**Task 15（本コミット）は申し送りの記述だけ**で、**実機確認は人間の作業として未了のまま残す**。

---

## 何を作ったか

- **コアの共通形3点。** `src/core/missing-tally.ts`（集計の型 `MissingTally`/`MissingTallyPart` と `tallyLine`）・`src/core/row-ref.ts`（`rowRef(index)` で配列位置を `#N` に）・`src/components/MissingTally.tsx`（帯の部品。合計＋内訳チップ、`onJump` があれば押せる）。以後の全モジュールがこの3点に乗る。
- **5モジュールへの展開。**
  - **用語集**: `missing.ts`（定義の空＝未定義、`kind === 'undecided'`＝未分類）。`placeholder="未定義"` と `AliasCell.tsx` の「別名なし」を削除し、空は空のまま描く。No 列を先頭に追加し、行全体の指摘（ID重複）の錨をここへ移した。重複メッセージを件数＋`#N`の行番号形式に。
  - **エラーカタログ**: `warnings.ts` を `missing.ts` に改名（`isWarnCell`→`isMissingCell`）。同様に placeholder を除去し、帯と D4 形式のメッセージを足した。
  - **ロジックツリー**: `missing.ts`（`text === ''`）。空ノードに破線＋淡い面（`missing-face`）、`invalid` が立てば赤が勝つ。帯にジャンプを追加。
  - **シーケンス**: `─ 考慮不要` の記号を語だけの `考慮不要`（`NOT_APPLICABLE_LABEL`）に統一し、画面と出力（Markdown）を同語にした。参照ボタン・参加者ヘッダ・ステップラベルの欠落を破線＋淡い面で示し、`（未定義）` の本文と placeholder を消した。帯を `MissingTally` に置き換え、同梱 Skill（`sequence-write.mjs`）の報告文を逐語で揃えた。
  - **課題ツリー**: 既存の帯を `MissingTally` 部品に置き換え（見え方・Skill 出力は不変）。仮説行に「未判断」（`pendingNotes` あり）バッジを新設し、判断バッジと重ならない配置にした。
- **`docs/missing-semantics.md` を新設。** 設計スペック決定7の6条を規約として起こし、各条に実装ファイルを添えた。`src/core/reading-guide.md`（シーケンス節に「未記入」の1行）・`docs/overview-rev.md` 9章（1文の参照）・`docs/README.md`（地図に1行）・`docs/open-issues.md`（消2・書換1・足す8）も併せて更新した。

---

## 実装で確定した事項

### `derive.ts`（レイアウト）の「頭部は同じ組み立て」は実物と違った——共有はもっと手前だけ

計画（Task 5）は「閉じた行と展開行の頭部は同じ組み立てを通る」ことを前提に、判断バッジの `Rect` を1箇所で計算すれば両方に効くはずだと想定していた。実物の `layout.ts` では、共有されているのは `plans` の map の**前段**（`badgeW`/`textW` の算出）だけで、`build` は `if (!open)` で**2つの独立した閉包**に分かれており、しかも状態バッジの `y` の作り方（`badgeW` の中央寄せの基準が行高か行の文字の行高か）まで違っていた。実装者は疑似コードどおりの座標式を2箇所に書き写すのではなく、状態バッジの `Rect` を受け取って左へずらす `judgementBadgeLeftOf(badge)` という小さな閉包を共有の前段に置き、両方の `build` から呼ぶ形に直した。これにより「同じ `y`」が定義上保証され、片方だけ直し忘れる経路が構造的に消えた。

### 用語集の列幅 store に「保存済み幅の整合」リスクは実在しなかった

計画（Task 7）は No 列の追加で列幅配列の要素数が1つ増えることに備え、「保存済み幅の長さが初期値とずれたら初期値に戻す」ガードを想定していた。実物を確認すると、`createColumnWidthStore` は**永続化を持たない**（アプリを閉じるまでの一時的な in-memory state で、`let current` に載るだけ）——ストアの初期値と列構成は常に同じ実行・同じ評価タイミングから生まれるため、両者の長さがずれる余地自体が無い。エラーカタログの「プロファイル切替」も同じパターン（列構成ごとに別ストアを持つ）で解決しており、用語集は列数が変動しないためこの分岐すら要らないと確認したうえで、`column-widths.ts` を無改修のままにした。

### 用語集・エラーカタログの Skill が整合性メッセージを手複製しており、スモークの逐語契約ごと同期が要った——計画の数え落とし

Task 8・9 のブリーフの `Files` 一覧には `.claude/skills/{glossary-term-register,error-catalog-register}/scripts/*-write.mjs` が挙がっていなかったが、実際には両 Skill の書き出しスクリプトが `consistency.ts` の警告文言・計上規則を（`@/` エイリアス import ができないため）手で複製しており、それぞれの `skill-write.smoke.test.ts` が「アプリの `message` がスクリプトの stdout に逐語で現れること」を機械的にピン留めしていた。用語集の重複メッセージを件数＋行番号形式に変えた時点でこの smoke テストが red になったため、両タスクとも計画の範囲外として mjs 側（`rowRef` 相当の関数を移植）も同期した。Task 9 では事前に Skill 側を `git stash` して smoke テストが実際に赤くなることを確認してから同期する、という手順で「計画の数え落とし」を実証したうえで直している。

### `wrap` の測定キャッシュ鍵と `NOT_APPLICABLE_ANSWER_WRAP` の衝突を箱名分離で解決した

Task 11 の一次実装は「考慮不要」の語を出すぶん `GutterSlot` の接頭を `pl-6`→`pl-16` に広げ、対応して `ANSWER_WRAP` 側にも notApplicable 専用の折り返し幅 `NOT_APPLICABLE_ANSWER_WRAP` を足した。レビューで、`wrap()` のキャッシュ鍵が `${箱名}:${text}`（`WrapOptions` を含まない）であるため、**同じ理由文言を持つ `handled` と `notApplicable` が同じ箱名 `'answer'` のままだと、後から測った側が先に測った側のキャッシュ結果を誤って引く**——直したはずの折り返し幅の欠陥が鍵の衝突を通じて再発する経路が指摘された。fix round で notApplicable の答えだけ箱名を `'answer-na'` に分離し、幅の追随漏れと鍵衝突の両方を再現する回帰テストを1本追加して赤→緑を確認した。

### 空名トリガーの高さ潰れと、aria-label の付け先の誤り

Task 12 の一次実装は、シーケンスの参照ボタン（`ActorRefCell`）で名前が空の参加者を指すとき、トリガーの本文を空文字にして破線＋淡い面で示す形にした。レビューで2件の Important が出た——(1) 子要素の無いボタンは行ボックスを作らないため内容高0＋余白だけの帯に潰れる（`min-h-6` を追加して解消。文字入りトリガーとの間に約2pxの段差が残ることは明記した）、(2) `aria-label="名前が空の参加者"` を（命名禁止ロールの）`<span>` に付けていたため、メニュー項目（`DropdownMenuItem` の `menuitem` ロール）自体からはアクセシブル名を引けなかった——`aria-label` を項目本体へ移し、span は `aria-hidden="true"` の飾りにした。

### `@testing-library/user-event` は依存に無く、既存流儀どおり `fireEvent` を使う

Task 3（`MissingTally` 部品）のブリーフのテスト骨格は `userEvent.click` を使っていたが、`package.json`/`node_modules` のどちらにも `@testing-library/user-event` は存在しなかった。既存の DOM テスト（`Badge.dom.test.tsx`/`Chip.dom.test.tsx`）が同期の `fireEvent.click` を使う流儀だったため、そちらに合わせて実装した（アサーション自体は変えていない）。以後のタスク（4・7・9・10・13）も同じ流儀を踏襲している。

### 巡回方式が5モジュールで非対称——課題ツリーだけがフォーカス位置起点

用語集・エラーカタログ・ロジックツリー・シーケンスの `jumpToMissing` は、種類（`kind`）ごとに「前回どこまで巡ったか」を `useRef` で覚えて次を返す**巡回 ref**方式である。一方、課題ツリーの `goToNextOpen` は `nextOpenTarget(listOpenTargets(...), kind, lastFocus)` を呼び、`lastFocus` は `onFocusCapture` で更新される実際のフォーカス位置なので、**フォーカス位置を起点に「次」を導く**——ユーザーが手でフォーカスを移すと、巡回 ref 方式の4モジュールはそこから再開しないが、課題ツリーは再開する。この非対称は Task 14 の最終ブランチレビューで指摘されるまで（`open-issues.md` の初稿では）方向を取り違えて書かれており、実物（`IssueTreeEditor.tsx`/`SequenceEditor.tsx`）を読み直して訂正した。`docs/open-issues.md`「挙動の穴」に記録済みで、物足りなければ他4モジュールを課題ツリーの方式へ揃える判断がありうる。

### そのほか、最終ブランチレビュー（`8d388f4`）で直した事実誤り

- `docs/open-issues.md` の「Skill 側スキーマのコピー先」の記述が誤っていた（「`app-controller.ts` が実体を共有」は事実に反し、正しくは追跡された別ファイルへのバイト一致コピーで `skill-schema-copy.test.ts` が門番）
- 同じく「集計の件数がチップに出ることは各エディタのテストで見ている」という記述が過小——実際は3モジュール（用語集・エラーカタログ・ロジックツリー）の `*.dom.test.tsx` に帯のテキストアサートもチップ押下テストも0件で、件数の正しさは各 `missing.test.ts` の単体テストしか見ていない
- `missing-semantics.md` 規約2 が挙げた「使ってよい空文字列フォールバックの例」`(無題)`（`src/core/load.ts`）の根拠づけが誤っていた——「データに実在する enum 値」という理由は `undecided`/`notApplicable` には成立するが、`(無題)` は空文字列の代替表示という点で `placeholder="未定義"` と構造が同じであり、正しい根拠は「決定1の表に無く、この文書が規約する欠落軸そのものではない」に置き換えた

---

## 実機確認について

**未実施である。** サブエージェントは Tauri の GUI を操作できないため、実機確認は人間の作業として残っている。以下は設計スペック「検証」9項目を、**空のまま**写したものである。**通ったかどうかの記録ではない。**

```bash
npm install        # 省略しない
npm run tauri dev
```

- [ ] 1. 用語集: 空の定義セルに語が無く、淡い黄の面だけが見える。別名0件の行が崩れない
- [ ] 2. 用語集: No 列が右揃えで並び、行全体の指摘（ID 重複）が No セルに赤で出る
- [ ] 3. ロジックツリー: 空ノードが破線＋淡い黄で拾える。無効の赤が勝つ
- [ ] 4. 全5モジュールの帯に「要対応 N」と内訳チップが出て、押すと次の該当へ飛ぶ
- [ ] 5. 重複メッセージが「名称「X」が N 件重複しています（#2 ／ #5）」の形で読める
- [ ] 6. シーケンス: 考慮不要スロットが「考慮不要」の語で読める。未回答スロットに語が無い
- [ ] 7. シーケンス: 名前が空の参加者ヘッダ・参照ボタンが破線＋淡い黄。メニューの空項目が押せる
- [ ] 8. 課題ツリー: pendingNotes を持つ行に青の「未判断」バッジが判断バッジと重ならず出る
- [ ] 9. ガターの未回答の面（canvas 上の missing-face）が地から分離して見える（M21 からの持ち越し確認）

確認後は次で後片付けする（[`../CLAUDE.md`](../CLAUDE.md)「マージ後の後片付け」1）:

```bash
git checkout -- sample-project/ && git clean -fdx sample-project/
git status --short          # 空になること
```
