# logic-tree M3 申し送り: Miro のマインドマップとクリップボードで交換する

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。

logic-tree M3 は計画11タスク（実装9本＋実機確認＋本ドキュメント）で、目的は**ロジックツリーと Miro のマインドマップを、クリップボード経由で双方向に交換できるようにすること**——Miro でブレインストーミングした結果を facet に取り込み、facet で整理した木を Miro へ戻す。設計の根拠と、実データの解析・11回の貼り付け実験の記録は [`../superpowers/plans/2026-08-29-logic-tree-m3-miro-clipboard-design.md`](../superpowers/plans/2026-08-29-logic-tree-m3-miro-clipboard-design.md) にあり、**Miro のクリップボード形式そのもの（付録）はそちらを見ること**——本書には転記しない（説明を二重に持たない）。

コミット範囲: `4188ee6`（計画）〜 `659a203`。

---

## 実装で確定した事項

### モジュール規約7（任意）として `clipboardExchanges` を新設した

Miro 交換は既存の規約5（`OutputProfile`）には乗らなかった——あちらは「Markdown を返す純関数」＋ `.md` 書き出しを前提にしており、Miro 交換は出力が **HTML とプレーンテキストの2つ**で、しかも**入力（貼り付けからの取り込み）の口がそもそも規約に無い**ため。`ToolModule`（`src/core/registry.ts`）に任意スロット `clipboardExchanges?: readonly ClipboardExchange<TData>[]` を足し、各交換は `toClipboard` / `canImport` / `fromClipboard` の3点を持つ。**宣言しないツールの規約の点数は増えない**——sequence M3 の `describeIssueEffect` と同じ層の任意拡張であり、額縁はこのスロットの有無だけでコピー・取り込みボタンの活性を決める。現時点で宣言しているのはロジックツリー（Miro のマインドマップ）だけである。

`src/modules/logic-tree/miro.ts` の `miroMindmapExchange` は、器（`miro-codec.ts`：CF_HTML と `data-meta` の読み書き）と木（`miro-import.ts` / `miro-export.ts`）を束ねるだけで、それ自体は判断を持たない。

### クリップボードの読み取りは自前の Rust コマンド（`arboard`）を通す

`tauri-plugin-clipboard-manager` は書き込み（`allow-write-text` / `allow-write-html`）しか提供せず、読み取り API を持たない。**プラグインの読み取り権限（`clipboard-manager:allow-read-text`）は与えていない**——読み取りは `read_clipboard_html`（`src-tauri/src/lib.rs`）という自前コマンドの経路であり、`arboard::Clipboard::new()` → `get().html()` を呼ぶだけで判断を持たない（rev 7章「Rust は薄く」の例外5件目）。HTML が載っていないときは Rust 側がエラーを返し、TypeScript 側の `readClipboardHtml`（`src/fs/clipboard.ts`）が空文字へ潰す——「HTML が無い」は異常ではなく日常的な状態であるため。

### `AppHost.recordEdit` を新設した（`applyEdit` だけでは表示が更新されない）

クリップボード取り込みの実装で、当初は `applyEdit`（保存＋整合性検証）だけを呼んでいたが、**これだけでは編集画面の表示が更新されない**ことが実機確認前のレビューで判明した（実装者の懸念として報告され、正しいと確認された）。額縁の編集経路は `setHistory(record(...))` と `controller.applyEdit(...)` の対で動いており、`applyEdit` は保存と検証しかしない。`setDocument`（履歴を作り直す＝Undo 履歴の破棄）も使えない——上書き取り込みで Ctrl+Z が効かなくなるため。そこで `AppHost` に「履歴を保ったまま積む」口 `recordEdit` を新設し、上書き・新規の両方で `applyEdit` と対で呼ぶ形にした。`setDocument` との違い（履歴を保つか破棄するか）は `AppHost` のコメントに明記してある。

### `escapeMermaidLabel` を `core/mermaid.ts` へ引き上げた（open-issues の宿題を果たした）

sequence M3 が Mermaid 出力を先に実装した際、正規化関数をモジュール内に置き、「2本目（logic-tree）が出たときに引き上げを判断する」と open-issues に残していた。今回がその2本目に当たったため、`escapeMermaidLabel` を `src/core/mermaid.ts` へ引き上げ、sequence 側もそこから import する形にした。ロジックツリーの `flowchart` ラベルは改行を許さない1行制約を持つため、`src/modules/logic-tree/markdown.ts` は**先に改行を空白へ畳んでから**共通版へ渡す2段構えにしている（`#` `;` のエスケープだけ共通版に任せ、`"` `[` `]` は flowchart 記法特有の衝突として自前で処理する）。

### Markdown 出力は1プロファイルにまとめた（形式の軸でプロファイルを割らない）

`logicTreeToMarkdown`（`src/modules/logic-tree/markdown.ts`）は図（`flowchart LR` の Mermaid ブロック）と箇条書きを縦に1本のプロファイルとして出す。rev 6章のプロファイルは「読み手による出し分け」の軸であり、そこへ形式（図／箇条書き）の軸を混ぜると、後から読み手の軸が要るときに掛け算になる——sequence M3 の決着と同じ判断を踏襲した。h1 は使わない（NotePM のページタイトルと衝突する）、mermaid ノード ID は `n1, n2, …` の連番（`node_xxx` は長すぎて図が読めない）、空文言は `（未定義）`。

### ノード幅は概算で固定した（実験8→9で係数を調整）

Miro 書き出し（`src/modules/logic-tree/miro-export.ts`）のノード幅は、全角・半角の文字種別ごとに固定幅（`EM_WIDTH`=16 / `EN_WIDTH`=9）を積算し `PADDING_X`=28 を足す近似で、実フォントを測っていない。設計文書に記録された11回の貼り付け実験のうち、実験8（全角14・半角7・余白20）では長い文言が2行に折り返り、実験9で係数を今の値まで上げて解消した。実フォントを測る仕組みではないため、**Miro 側の既定フォントが変われば再び折り返しうる**——対処はこの3定数を上げること（`open-issues.md` に残件として記録）。

---

## 見つかった欠陥（実装計画の欠陥8件）

計画のコード片やテスト方針に、実装・レビューの過程で次の欠陥が見つかった。いずれも `docs/lessons-for-planning.md` の「実装者は矛盾を握り潰さず報告する」に従って報告され、その場で是正された。

1. **`idOf` が write-only の死んだコード**（Task 2, `miro-import.ts`）。計画のコード片に由来。レビューで指摘され削除した。
2. **`indexByKey` が write-only の死んだコード**（Task 3, `miro-export.ts`）。`idOf` と同種で、これも計画のコード片に由来。実装者が自ら気づいて削除した。
3. **テストヘルパ（`textWidgets` / `lineWidgets`）の型注釈が `tsc -b` を通らない**（Task 3）。計画は `Record<string, never>[]` という場当たりの型を書いており、実装者が正しい型へ書き換えた（テストの意図——本数・親子・幅揃え・座標・style の値・決定性——はすべて保った）。
4. **往復テストのフィクスチャがレベル順で書かれていた**（Task 4）。DFS 行きがけ順であるべきところをレベル順にしていたため、実装者が兄弟順の崩れを検出できない `text` ソートで回避してしまった。フィクスチャを DFS 行きがけ順に直し、配列順そのものを `toEqual` で比較する形に是正した。
5. **`toClipboard` の `text` が HTML エスケープ済みのまま返っていた**（Task 4）。`texts`（div 埋め込み用にエスケープ済み）をそのまま `text`（他アプリ向けのプレーンテキスト）に使っていたため、`&` や `<` を含む文言が他アプリに `&amp;` のまま貼られる不具合だった。`miro-export.ts` に生の文言（`plainTexts`）を返す経路を追加して直した。
6. **孤立ノードが mermaid の図から消えていた**（Task 5）。`logicTreeToMarkdown` の図生成が `ordered.length === 1` のケースしかガードしておらず、多重ルートで子を持たないルートがあると箇条書きには出るのに図には出ない食い違いが生じた。辺を1本も持たないノードを単独行で出す一般形に直した。
7. **`applyEdit` だけでは表示が更新されない**（Task 8。上述の `recordEdit` の項参照）。`setHistory` と対で呼ぶ必要があることが計画に書かれておらず、レビューでは気づけない性質の欠陥だった（表示の更新は自動テストでは検出しづらく、実装者の懸念報告と実機確認の両方で初めて確定した）。
8. **設計文書と計画が「rev 12章」という存在しない章番号を書いていた**（`docs/superpowers/plans/2026-08-29-logic-tree-m3-miro-clipboard-design.md` に2箇所、計画本体に6箇所、`src-tauri/src/lib.rs:93` のコメントに1箇所コピーされていた）。`overview-rev.md` は11章までしかなく、正しくは **7章（技術スタック。Rust は薄く）**だった。本タスク（文書更新）で `lib.rs` のコメントは7章へ直したが、**計画・設計文書は不変の記録として直していない**——この食い違い自体をここに書き残す。次に「rev 12章」を探して見つからない場合は、本項を見ること。

---

## 実機確認: **実施済み・問題なし**

ユーザーが全項目を確認し、**動作は問題なし**だった。書き出し・取り込み・Markdown 出力のすべてが通過し、`boardId` を固定定数（`ZmFjZXQtdHI=`）にしても Miro に貼れることを確認した。上書き取り込み後の `Ctrl+Z` による巻き戻しも動作した。

一巡の結果、**キャンセルの文言とスタイルを既存の `ConfirmDialog` に揃える**修正依頼が入った——`ChoiceDialog` の任意キャンセルは当初「やめる」という文言で `AlertDialogAction variant=ghost` を使っており、`ConfirmDialog`（`AlertDialogCancel`）と見た目が揃っていなかった。文言を「キャンセル」に統一し、コンポーネントも `AlertDialogCancel` へ揃える追補修正（`659a203`）を行い、再レビューで解消を確認した。

---

## rev への反映事項

**本節の分は反映済み**（このコミットで `docs/overview-rev.md` を編集した）:

- **rev 6章（アーキテクチャ：統合形態）**: モジュール規約に**規約7（任意）としてクリップボード交換（`clipboardExchanges`）**を追加。宣言しないツールの規約の点数は増えないこと、出力プロファイルの「0本」がロジックツリー・シーケンスとも埋まったことを反映した。
- **rev 7章（技術スタック）**: 「Rust は原則書かない」の例外に**5件目（クリップボードの HTML 読み取り `read_clipboard_html`）**を追加し、クリップボード書き込み（プラグイン）と読み取り（自前コマンド）が非対称であること、プラグインの読み取り権限は与えていないことを明記した。

**あわせて直したもの**（rev ではないが同じコミットで解消した古い記述）:

- [`../sequence/sequence-design-notes.md`](../sequence/sequence-design-notes.md) 論点11 の「`escapeMermaidLabel` は現状モジュール内に置いている（`core/mermaid.ts` への引き上げは open-issues に記録済み）」という記述を、今回の引き上げが済んだ実態に合わせて書き直した。
