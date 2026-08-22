# M20 申し送り: キャンバス基盤のコア化

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。

M20 は、ロジックツリーとシーケンスが独立に複製していたキャンバスの土台（ビューポート・測定層・フォント読み取り・平坦木の組み立て・木のレイアウト）を `src/core/canvas/` へ引き上げ、複製を消すマイルストーン。実装計画は [`../superpowers/plans/2026-08-22-m20-canvas-core.md`](../superpowers/plans/2026-08-22-m20-canvas-core.md)。**アプリの挙動は1つも変えていない**——これは移設であって書き直しではない。

きっかけは**3本目のキャンバスツール（課題ツリー）が来ること**。rev 6章「モジュール規約の境界（コア／各ツールモジュール）は跨がないこと」により、新しいツールから `@/modules/logic-tree/...` を import することはできず、選択肢は「コアへ引き上げる」か「3度目の複製を作る」の二択だった。後者は open-issues が sequence M1 以来の負債として記録していた形そのものである。

Task 1: `9d46eee`（ビューポート・測定・フォント読み取り）＋ `db16877`（レビュー対応：重複したテストの移設先寄せ）。Task 2: `227aa50`（平坦木の組み立てと木のレイアウト）。

最終状態（本タスクでの実行結果）: `npm test` 116 files / 1424 tests 全緑、`npx tsc -b` エラー無し、`npm run lint` エラー無し。

---

## 引き上げた範囲と、引き上げなかったもの

`src/core/canvas/` に新設したファイル:

| ファイル | 中身 | 引用元 |
| --- | --- | --- |
| `viewport.ts` | `Transform` / `Rect` / `INITIAL_TRANSFORM` / `CANVAS_MARGIN` / `cssTransform` / `svgTransform` / `panIntoView` | logic-tree と sequence の複製2本 |
| `use-viewport.ts` | `useViewport(ref, enabled)`（d3-zoom の配線と Space 監視、`ensureVisible`） | 同上 |
| `canvas-font.ts` | `CanvasFont` / `FALLBACK_CANVAS_FONT` / `FALLBACK_SMALL_FONT` / `sameFont` / `readCanvasFont` / `createCanvasMeasurer` | `node-font.ts` ＋ `seq-font.ts` の `FALLBACK_LABEL_FONT` |
| `wrap.ts` | `MeasureWidth` / `WrapOptions` / `WrappedBlock` / `wrapWithin` / `createEstimateMeasurer` | `sequence/measure.ts`（一般形の側） |
| `edges.ts` | `edgePath(from: Rect, to: Rect)` | `TreeEdges.tsx` の private 関数。矩形を引数に取る形へ広げた（課題ツリーはブロックでレイアウトし、線は課題ノードの矩形から引くため） |
| `flat-tree.ts` | `FlatNode` / `FlatTreeNode` / `BuiltTree` / `buildTree` / `orderFlatNodes` / `subtreeEnd` / `siblingsOf` | `logic-tree/tree.ts` ＋ `commands.ts` の private 関数3本 |
| `tree-layout.ts` | `Point` / `Size` / `LayoutTreeNode` / `LayoutResult` / `COLUMN_GAP` / `SIBLING_GAP` / `layoutTree` | `logic-tree/layout.ts` |

各ファイルにテストも移設した（`viewport.test.ts` / `use-viewport.dom.test.tsx` / `wrap.test.ts` / `edges.test.ts` / `flat-tree.test.ts` / `tree-layout.test.ts`）。

**引き上げなかったもの:**

- **シーケンスの積み上げ型レイアウト**（`src/modules/sequence/layout.ts`）。ツリーは Reingold–Tilford 型の再帰、シーケンスは X も Y も単純な積み上げで、レイアウト関数の性質が大きく違う。**`layoutTree` は「木を描くツールのための関数」としてコアに置き**、シーケンスのレイアウトは各モジュールに残した。
- **各ツールの箱の寸法定数**（`NODE_*` / `NODE_BOX_CLASS` / `LABEL_*` / `SELF_*` / `ACTOR_*` / `ANSWER_*` / `gutterLabelText`）と、そのツール固有の畳み方（`logic-tree/measure.ts` の `wrapText` は `wrapWithin` に `NODE_*` を渡す薄い包み）。
- **エッジの SVG レイヤ**（`TreeEdges.tsx` / `SequenceEdges.tsx`）は各モジュールに残し、パスの生成だけを純関数として引き上げた（`src/core/` にコンポーネントを置かない規約による）。

## 実装で確定した判断

- **`FlatNode` / `LayoutTreeNode` という構造的な型で受ける形にした。** 各ツールのノード型を継承やジェネリック制約で縛らず、「この形を満たしていれば通る」にした。`orderFlatNodes<T extends FlatNode>(nodes: readonly T[]): T[]` は要素の型を保つジェネリックで、`logic-tree/commands.ts` の `orderNodes` は戻り値型 `TreeNode[]` を保ったまま薄い包みとして残っている。
- **`buildTree` の戻り値から `text` を落とした。** 構築時にコピーされるだけで、`layout.ts` も `TreeEdges.tsx` も読んでいなかった（grep で確認済み。`LogicTreeEditor.tsx` の `node.text` は平坦な `data.nodes` の要素であって木の節点ではない）。
- **`readCanvasFont(el)` の `el === null` 時の戻り値を `FALLBACK_CANVAS_FONT`（14px）のまま据え置いた。** sequence は `text-xs` の見本要素に対してもこの関数を呼び、null のとき 14px の既定に落ちる。既存の挙動であり、移設で変えると sequence の行高が静かにずれる。
- **`orderNodes` は公開 API なので名前を残す薄い包みを置いた**（`commands.test.ts` と他の呼び出し元を巻き込まないため）。

## 移設で見つかったドリフト

open-issues が記録していた1点に加えて、もう1点あった。

1. **既知**: `seq-font.ts` にのみ `FALLBACK_LABEL_FONT` があった（コアでは `FALLBACK_SMALL_FONT` として1本化）。
2. **新たに見つかった**: `useViewport.dom.test.tsx` の「ロジックツリーを開いている間ずっと」というコメントが、**sequence 側の複製でもツール名が書き換わっていなかった**（複製時の書き換え漏れ。両コピーに同一の文言が残っていた）。コアへ畳む際に一般化した。

テスト層でも複製が一度でき、タスクレビューで解消した: `wrapWithin` / `createEstimateMeasurer` を検証するテストが logic-tree・sequence・コアの3ファイルに重複した状態が一度でき、レビュー指摘で解消した（`db16877`）。モジュール側に残したのは、`NODE_*` が薄い包みを通って正しく渡ることを検証する `wrapText` のテストと、`gutterLabelText` のテストのみ。

## 計画の欠陥として見つかったもの

- **計画の Files 一覧に `src/modules/sequence/questions.test.ts` が漏れていた。** このファイルは `FALLBACK_LABEL_FONT` を `./seq-font` から読んでいたので、`seq-font.ts` の削除で壊れるところだった。
- **計画 Step 10 の薄い包みのコード片が `createEstimateMeasurer` を再エクスポートしていなかった。** `logic-tree/measure.test.ts` がそれを `./measure` から読んでいたため、そのままでは通らなかった。

いずれも「計画の Files 一覧は grep で機械的に裏を取る」という教訓の実例。

## 実機確認（Task 4）について

**人間が Windows 実機で一巡し、問題は出なかった（2026-08-22）。** サブエージェントは Tauri の GUI を操作できないため、確認は人間の作業として行った。

**このマイルストーンは挙動を1つも変えないので、確認したのは「変わっていないこと」である。** ズーム・パンの配線は d3 が window にリスナーを張り替える形（rev 10章の明示的な例外）で、jsdom のテストは張り替えの先までは追えない——そこを人間の目で塞いだ。

- [x] 1. ロジックツリーを開き、`Ctrl+ホイール`（カーソル中心ズーム）／`Space+ドラッグ`／中ボタンドラッグ が効く
- [x] 2. 素のホイールでズームしない・素の左ドラッグでパンしない（d3 の既定を差し替えている部分が生きているか）
- [x] 3. 画面外にノードを足したとき、視点がそこへ寄る（`ensureVisible` の経路）
- [x] 4. モーダル（削除の確認ダイアログ等）を開いている間、裏でキャンバスがズーム・パンしない
- [x] 5. シーケンスを開いて 1〜4 を通す
- [x] 6. シーケンスのセルのドロップダウンを開いたままキャンバスを動かしても破綻しない（境界規則の例外。ここは止めないのが正しい挙動）
- [x] 7. 日本語を長く打ったノード／ステップの文字が枠から切れていない（測定層とフォント読み取りが同じ情報源を見ているか。Web フォントの読み込み後に測り直す経路も含むので、リロード直後と数秒後の両方を見る）
- [ ] 8. 開発機と違う OS（Windows で開発したなら mac、逆も同じ）で 1・7 を通す

**8 は未実施。** 開発機が Windows で、mac 実機での確認は行っていない。**ただしこのマイルストーンには OS 依存の変更が1つも無い**——移設したのはビューポート・測定層・フォント読み取り・木の組み立て・レイアウトで、いずれもプラットフォーム分岐を持たない（`src/core/keyboard/platform.ts` のような OS を見る層には触れていない）。M17 の端末まわりのように OS 差が出うる変更とは性質が違うため、mac 未確認のまま閉じる判断をした。

## `docs/open-issues.md` への反映

消したもの: 「キャンバスの土台が logic-tree と sequence で丸ごと複製されている」の項（`[sequence-m1]`、「小さな負債」の節）。複製そのものが本マイルストーンで解消したため。

書き換えたもの（消していない。移設でパスが変わっただけ）: 「挙動の穴」の logic-tree 側の既知の穴2件（ドラッグ中のアンマウントでリスナーが残る／`FOLLOW_MARGIN` の 8px ずれ）のファイルパスを `src/core/canvas/` へ直した。「モーダル中もホイール／ドラッグが生きている」という3件目は独立した項として存在せず、削除した複製項の末尾に列挙されていただけだった（sequence M3 で既に解消済みとして rev 10章に記録がある）ため、項ごと消したことで一緒に消えている。

足したもの: 無し（移設の過程で気づいたが直さなかったものは無かった）。

## `docs/overview-rev.md` への反映

- **6章 拡張要件**: 「キャンバス系ツールのレイアウト関数は当面モジュールが持つ（sequence M1 時点）」の項を、コア化が済んだ現在の状態として書き直した。
- **9章 確定要素**: フォントトークンの実装パスを `src/core/canvas/canvas-font.ts` へ直した。
- **10章 実装規約**: キャンバス系ツールの実装構成の項に、土台がコアの共有物になったことを反映した。「3レイヤに同一の transform を当てる」規約自体は変わっていない。

## 最終ブランチレビューとその修正

HEAD `be35403` の時点で最終ブランチレビューを実施。**アプリの挙動の変更は1つも無いことを、移設前後の原本5組（`viewport.ts`/`use-viewport.ts`、`canvas-font.ts`、`wrap.ts`、`edges.ts`、`flat-tree.ts`/`tree-layout.ts`）の機械的な突き合わせで確認した。Critical は0件。** Important 3件・Minor 3件を指摘され、以下のとおり1回のコミットで修正した。

- **JSDoc が移設で丸ごと消えた事故**（`src/core/canvas/wrap.ts`）: 計画 Step 5 は「sequence 版（一般形）をそのまま移す」と指示していたが、sequence 版の `wrapText` には関数 JSDoc が最初から無かった（logic-tree 版にだけあった）。指示に忠実に従った結果、`wrapText` の JSDoc・`WrappedText` のフィールド注釈・`for...of` のインラインコメントが移設先に運ばれず消えていた。**これは実装の逸脱ではなく計画の欠陥である**——「一般形をそのまま移す」という指示が「一般形の側に付いていない説明は運ばれない」という帰結を見落としていた。原本（`git show 471c779:src/modules/logic-tree/measure.ts`）と突き合わせ、`wrapWithin` の JSDoc・`WrappedBlock` のフィールド注釈・`for...of` のコメントとして復元した（「ノード矩形」は「箱」に一般化、それ以外は文面のまま）。失われていたのは測定層が1パスで文字切れを起こさない理由の唯一の説明で、`NODE_INSET_X` の JSDoc・`NodeBox.tsx` の break-all コメントと対になっていたため、実害は「もう存在しない説明を指す参照」を放置することだった。
- **複製の記録が1箇所だけ現在形で残っていた**（`src/modules/sequence/measure.ts` のヘッダ）: 「複製の記録: 共通化は2本目完成後に別マイルストーンで判断」という文が、**M20 自身が下した判断（コアへ引き上げた）と矛盾する**まま残っていた。他の複製ヘッダ（`viewport.ts` 等）は移設時に消えていたのに、ここだけ取りこぼしだった。このファイルの現在の責務（寸法定数・`gutterLabelText`・折り返しの再エクスポート）を述べる文に書き直した。
- **`readCanvasFont` の null 時の罠が無警告・無テストだった**（`src/core/canvas/canvas-font.ts`）: `el === null` のとき常に `FALLBACK_CANVAS_FONT`（14px）に落ちる据え置きの挙動（Global Constraint で明示的に指示されていた）が、コードにはコメントもテストも無かった。JSDoc に追記し、`src/core/canvas/canvas-font.test.ts` を新設して `readCanvasFont(null)` と「fontSize が読めない要素」の2本で固定した。
- **`docs/open-issues.md` の `focusSibling` の項が古いパスを指していた**: `siblingsOf` は M20 で `@/core/canvas/flat-tree.ts` へ移設済み・export 済みだったが、項は旧パス（`commands.ts`）のままだった。パスを直し、「あとは `LogicTreeEditor.tsx` が呼び替えるだけ」に更新した（コードは直していない。範囲外）。
- **`docs/overview-rev.md` 6章の数え違いと文の矛盾**: 引き上げた範囲を「5点」と数えていたが `edgePath` が漏れていた（10章は正しく含んでいた）ので「6点」に直した。「各モジュールに残るのは箱の寸法定数とツール固有の畳み方だけ」という文は、直前の「シーケンスの積み上げ型レイアウトは各モジュールに残した」と矛盾していたため、`sequence/layout.ts` 本体・`gutterLabelText`・`NODE_BOX_CLASS` 等のクラス定数・エッジの SVG レイヤも含む形に直した。
- **`src/modules/logic-tree/measure.test.ts` にコアと逐語重複する `it` が3本残っていた**: `連続した改行は空行として残す` / `サロゲートペアを割らない` / `同じ入力からは同じ結果が出る（純関数）` の3本は `NODE_*` を一切参照しておらず、`src/core/canvas/wrap.test.ts` に既に同じアサーションで存在していた。3本を削除し、`NODE_*` を参照する残り8本（薄い包みの疎通確認）はそのまま残した。

**直さず記録した1件**: 幾何の primitive（`Rect`/`Point`/`Size`）が `viewport.ts` と `tree-layout.ts` に分かれ、`Rect = Point & Size` になっていないこと。M20 は挙動を変えない移設のマイルストーンなので型の再編はスコープ外とし、`docs/open-issues.md`「小さな負債」に `[M20]` タグで追加した——3本目のキャンバスツール（課題ツリー）を書き始める前に決める値打ちがある。

修正後の検証: `npm test` 117 files / 1423 tests 全緑、`npx tsc -b` エラー無し、`npm run lint` エラー無し。コミットは1本（後述）。

**Task 4（実機確認）はこのあと人間が Windows 実機で実施し、問題は出なかった**（上の「実機確認（Task 4）について」を参照）。
