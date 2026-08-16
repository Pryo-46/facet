# M18 申し送り: シーケンス図・ロジックツリーの画像出力

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。

M18 は、キャンバス系2ツール（シーケンス図・ロジックツリー）に「**画像をコピー**」「**画像で保存**」を足すマイルストーン。画面の DOM をそのままラスタライズ（`html-to-image` を新規採用）して PNG にし、クリップボードとファイルの両方へ出す。シーケンス図だけは「**問いを含む／問いを含めない**」（ガター列の有無）を都度選べる。設計判断は [`../superpowers/plans/2026-08-16-m18-image-export-design.md`](../superpowers/plans/2026-08-16-m18-image-export-design.md)（決定1〜10）、タスク分割は [`../superpowers/plans/2026-08-16-m18-image-export.md`](../superpowers/plans/2026-08-16-m18-image-export.md)。

コミット範囲: `ee1ecef`（設計スペック）〜 `ce4aa97`（Task 10 の fix round。**本書自身のコミットは含まない**——書いている時点でハッシュが存在しないため）。計画は `19a8d45`。タスクとコミットの対応は Task 1 = `f80a7b9`、Task 2 = `27b154f`、Task 3 = `0a48cda` ＋ `15e1242`（fix round）、Task 4 = `813b015`、Task 5 = `0045ec5`、Task 6 = `b2d2be4`、Task 7 = `926b226`、Task 8 = `057fdb7` ＋ `0b9ae54`（fix round）、Task 9 = `bfe46c0` ＋ `cbecb12`（fix round）、Task 10 = `aee6d2f` ＋ `ce4aa97`（fix round）。最終状態は `npm test` 114 files / 1420 tests 全緑、`npx tsc -b` / `npm run lint` / `cargo test` 緑。

**Task 11（実機確認）は未実施のまま完了扱いにしていない。** 下記「実機確認（Task 11）」を参照——チェックリストは空のままで、[`../open-issues.md`](../open-issues.md) にも1項目として載せた。

---

## 実装で確定した事項

### 1. `chrome` の除外は「プロファイルの値」ではなく `captureImagePng` の不変条件（Task 7 が発見・Task 9 で実装）

`captureImagePng`（`src/core/image-export.ts`）は、プロファイルが指定した `excludeRoles` に**加えて常に** `data-export-role="chrome"` を除外する:

```ts
const excludeRoles = new Set([...(options.excludeRoles ?? []), 'chrome'])
```

**この形は、実装漏れとして見つかった。** Task 7 の実装者が「自分が付けた `chrome` マーカーを除外するプロファイルが1本も無い」ことに気づいて報告した——Task 9 が定める3プロファイル（sequence の `with-gutter`／`without-gutter`、logic-tree の `default`）はいずれも `excludeRoles` に `'chrome'` を含まず、Task 10 も足さない。**そのままなら、書き出したすべての画像に編集用ツールバーと「ステップを追加」ボタンが写り込んでいた**（マーカーは誰にも参照されない死んだ属性になっていた）。設計スペック決定5 は `chrome` を「`filter` は画像に描かない」前提で書いており（そのうえでサイズにだけ残る余白を許容すると明記している）、意図は明確だった。

塞ぎ方は2案あり、**(A) 全プロファイルの `excludeRoles` に `'chrome'` を書く**ではなく **(B) `captureImagePng` が常に足す**を採った。`gutter` は「ユーザーが都度選ぶ」ものだが、`chrome` は「**どの画像にも決して出さない**」不変条件であって性質が違う。(A) だと将来プロファイルを足す人が毎回書き忘れうるが、(B) なら1箇所で保証される。**置き換えではなく加算**にしてあるので、`excludeRoles: ['gutter']` を渡した場合も gutter と chrome の両方が落ちる。

代償として、「`chrome` を画像に含めたい」用途が将来出たら不変条件を1つ緩める変更が要る（現時点でその用途は無い）。

### 2. レール列は `chrome` にしない——線引きは「**図のレイアウトグリッドの外にあるか**」

レビューが「レール列（`#N` / from / to / 種別のセル群）もコード自身が『編集の足場であって図の一部ではない』と書いているのだから chrome ではないか」と挙げたが、**除外しない**と裁定した。理由は美観ではなく構造である:

- `RAIL_WIDTH = 348`（`src/modules/sequence/layout.ts:39`）は `layoutSequence` が図の開始 x に足している**予約幅**であり、`filter` は**描画を止めるだけでレイアウトを詰めない**。除外すると図の左に 348px の空白が残る。
- 既に `chrome` にした要素はこの問題を持たない——見出し・操作・ヒントの帯は `absolute left-0 right-0 top-0` のオーバーレイ（`SequenceEditor.tsx:790` 付近）で、抜いても穴が空かない。末尾の「ステップを追加」ボタンは `top: layout.totalHeight + ROW_GAP`（同 `:1158` 付近）で図の下端より下にあり、抜くと下端が縮むだけである。

したがって **`chrome` の線引きは「図のレイアウトグリッドの外にある要素か」**で引く。レールはグリッドの内側にあるので対象外。加えてユーザーの要求そのものが「できるだけ見たまま出力したい」であり、レイアウトに穴を開ける除外はその要求に反する。**次にマーカーを足す人はこの規則で判断すること。**

同じ裁定の裏返しとして、`GhostSlot` の ✕ 削除ボタンは `chrome` にした（`GhostSlot.tsx:46`）——削除アクションが資料に写るのは明確に誤りで、しかも flex 行の右端にあり右に何も無いので**抜いても穴が空かない**。この ✕ は `open-issues.md` が「`layout.totalWidth` の外に約26px はみ出す」と記録している要素そのもので、描かなくなること自体に副次的な利益がある。`filter` はノード自身の属性で落とすので、`gutter` の子に `chrome` があっても正しく動く（「問いを含む」でも ✕ だけが消える）。

マーカーの現況は `data-export-role="chrome"` が4箇所（sequence 3・logic-tree 1）、`"gutter"` が5箇所（いずれも sequence）。

### 3. 画像出力プロファイルは `OutputProfile` と並行する**別の規約**（rev 8章へ反映）

`ImageOutputProfile`（`src/core/registry.ts`）は `id` / `label` / `fileSuffix` / `excludeRoles?` の4フィールドで、**レンダリング関数を持たない**。rev 8章が `OutputProfile.toMarkdown` に課している「副作用を持たない純関数（データ→文字列）」は画像には成立しない——画像化はレイアウト後の座標・フォントメトリクスという **DOM 実測**に依存するためである。実処理は `core/image-export.ts` が `CaptureLayers`（DOM 要素）を受け取って行う。`imageOutputs` の 0本は「画像出力を持たないツール」の正しい状態で、用語集・エラーカタログは `imageOutputs: []` を返す（`outputs` と同じ思想）。

### 4. 額縁との継ぎ目（決定4・決定6b）で計画から変えた点が3つある

- **`EditorProps.captureRef` の型は `Ref<CaptureLayers>` ではなく `Ref<CaptureLayers | null>`。** 設計スペック決定4 は前者で書いていたが、`useImperativeHandle<T, R extends T>` は init の戻り値 R が T を満たすことを要求するので、「3レイヤのうち1つでも未マウントなら `null` を返す」実装が型エラーになる。
- **`useImperativeHandle` は型引数を明示しないと通らない。** `useImperativeHandle(captureRef, () => ...)` の形では、`Ref` の内部にある `RefObject`（共変）と `RefCallback`（反変）の2候補のうち後者が勝って T が `CaptureLayers` に潰れる。`useImperativeHandle<CaptureLayers | null, CaptureLayers | null>(...)` と両方を固定して止めた。理由のコメントは logic-tree 側（`LogicTreeEditor.tsx`）にだけ書かれている——sequence 側には無い。
- **オーケストレーションは `App.tsx` に置き、`AppController`/`AppIo`/`AppHost` は一切変更していない**（決定6b）。`app-controller.ts` は「React も Tauri も知らない」ことが原則で、`copyMarkdown`/`exportMarkdown` と同じ形にすると引数に DOM 要素が混入する。保持したのは**順序**であって置き場所ではない——キャプチャは保存ダイアログを開く**前**に確定させ（決定9。押した瞬間の見たままを保証する）、`guardIssues`（整合性エラーの確認ダイアログ）は**適用しない**（決定10。画像は「見たまま」がそもそもの要件で、警告は既に絵の中に描かれている）。後者は「付け忘れ」と読まれないよう docblock に理由を書いた。

### 5. サイズは実測、transform は実 DOM の直接書き換え

`layout.totalWidth`/`totalHeight` の帳簿値は実描画より小さいことが分かっている（open-issues の2件）ため、**transform を単位行列へ戻した状態の `root.scrollWidth`/`scrollHeight`** をキャンバスサイズにする。`chrome` を除外していても実測値からは引かれない（`filter` は描かないだけ）ので、その分の余白が右・下に残ることがある——**要素が切れるより余白がましという簡略化**を意図して採っている。

transform のリセットは `html-to-image` の `style` オプションでは行えない（あれはキャプチャ対象の**ルート要素**にしか効かず、3レイヤそれぞれに掛かった transform は書き換えられない）ため、実 DOM のインラインスタイル／属性を直接書き換えて `finally` で戻す。React state は触らない（d3-zoom の内部状態とズレさせないため）。**キャプチャ中に図が一瞬「全体表示」へリセットされて戻るちらつき**は設計スペックで許容済みである。`core/image-export.ts` は `cssTransform`/`svgTransform`（2モジュールに複製されている）へ依存を増やさず、単位変換の文字列リテラルを自分で持つ。

### 6. クリップボードへの画像書き込みには Cargo feature `image-png` が要る

`toBlob` が返すのは**エンコード済み PNG バイト列**で、`@tauri-apps/plugin-clipboard-manager` の `writeImage` に生バイトを渡すのは documented な契約ではない。`@tauri-apps/api/image` の `Image.fromBytes(pngBytes)` でデコードしてから渡す形にしたが、`fromBytes` は Tauri 側で `ico`/`png` のみをサポートし、対応する Cargo feature の有効化を要求する。`src-tauri/Cargo.toml` の `tauri` 依存を `features = ["image-png"]` にした（rev 7章の「feature 有効化は原則の例外ではない」——判断を持たず、ネイティブ機能を有効にするだけ）。capabilities は `clipboard-manager:allow-write-image` と `fs:allow-write-file` の2つを追加（後者は `writeTextFile` ではなく `writeFile` を使うバイナリ書き込み用の別権限）。

### 7. キャプチャの多重実行を `useRef` のフラグで塞いだ（Task 10 の fix round）

`captureImagePng` は現在の transform をローカルへ退避してから単位行列を書き、`finally` でその退避値へ戻す。**呼び出しAの実行中に呼び出しBが始まると、Bが退避するのはAが書いた単位行列**であり、最後に走った `finally` が勝つ。Bが後に終わる通常の順序では**キャンバスが原点に飛んだまま固定される**。しかも React 側の state は変わっていないので vdom の `style` も同値のまま——再レンダーしても DOM へ書き戻されず、**ユーザーがパンかズームをするまで直らない**（バナーもトーストも出ない）。大きな図では `toBlob` は即座には終わらないので、ダブルクリックや「反応が無いからもう一度押す」で普通に踏む。

修正は `doCopyImage`/`doExportImage` が共有する `useRef` の in-flight フラグ（最初の `await` より前に立て、`finally` で下ろし、2回目は無言で return）。**`useState` の busy フラグ（ボタンを押せなくして進捗も示す案）は採らなかった**——再レンダーがキャプチャ中に走る形は、`html-to-image` が DOM を複製している最中との相互作用をこのセッションでは実測できないため、正しさの修正は確実に安全な形に寄せた。進捗表示は Task 11 で所要時間を見てから判断する（下記「残った限界」）。

---

## 計画そのものに含まれていた欠陥

**3件あり、いずれもレビューまたは実装者が摘出した。** 1件目は実機で100%発症する種類のものだった。

### 1. `filter` が Text/Comment ノードで必ず例外を投げる（Task 3・Critical）

計画が指定した `filter` は、`html-to-image` の walk が到達するすべてのノードに対して `getAttribute` を**無防備に**呼んでいた。`clone-node.js` は `childNodes` をそのまま集めて（`:139`・`:142`）ルート以外の全ノードに `options.filter(node)` を掛ける（`:277`）ので Text/Comment ノードが渡り、`node.getAttribute is not a function` で `toBlob` が必ず reject する。図にも操作帯にも文字は必ずあるので、**すべてのキャプチャが実機で失敗していた。**

すり抜けた理由が2つとも記録に値する:

- **`tsc` を通った**——`html-to-image` の型（`lib/types.d.ts:37`）は `filter?: (domNode: HTMLElement) => boolean` と宣言しているが、実際に渡るのは任意のノードで、**型が嘘をついている。**
- **テストも通った**——計画のテストは `filter` に `HTMLDivElement` しか渡していなかった。

つまり「**区別したい2つの実装が同じ答えを返す入力を、テストデータに選ばない**」（[`../lessons-for-planning.md`](../lessons-for-planning.md)）の具体例そのもので、**動く実装と壊れた実装をテストの入力が区別できていなかった。** 修正は `(node as Element).getAttribute?.(...)` と `role == null` の2段で「Element でない」と「属性が無い」をどちらも「除外対象ではない」に倒す形。同じラウンドで `document.createTextNode('x')` を渡すアサーションを足し、修正前の実装ならその1行で落ちるようにした。**Task 11 の実機確認まで誰も気づかないまま Task 7/8/10 が積み上がるところだった。**

### 2. `chrome` マーカーを除外するプロファイルが1本も無い（Task 7 が発見）

上記「実装で確定した事項」1 のとおり。**計画を横断して初めて見える欠陥**で、Task 7（マーカーを付ける）・Task 9（プロファイルを定める）・Task 10（プロファイルを渡す）のどれも単体では正しく見える。

### 3. 「テストの `render(<ExportMenu>)` は4箇所」は誤りで、実際は5箇所（Task 6）

実装者が全5箇所を直したのが正しく、レビューも1件ずつ読んで見落としゼロを確認した。**[`../lessons-for-planning.md`](../lessons-for-planning.md) の「テストの件数を計画に書かない（M4・M5 で2回とも数え間違えた）」を3度目に踏んだもの。** 以後のタスク指示では件数を根拠にせず「読んで全部直せ」の形にした。

**1〜3 はいずれも既存の教訓の再現**（「計画のコードは検証済みの正ではない」「区別したい2つの実装が同じ答えを返す入力を選ばない」「テストの件数を計画に書かない」）であり、`lessons-for-planning.md` に新しい規則としては足していない。

---

## 実機確認（Task 11）

**未実施。** サブエージェントは GUI を操作できない（[`../lessons-for-planning.md`](../lessons-for-planning.md)「サブエージェントは GUI を操作できない。実機確認は人間の作業として計画に明記する」）。**ブラウザ自動化で代替できないことも確認した**——facet は Tauri デスクトップアプリで、`npm run dev` の素のブラウザでは fs/dialog が動かず、ファイル選択が Tauri のダイアログ経由であるため**そもそも図を開くところまで到達できない。**

以下は計画 Task 11 のチェックリストで、**空のまま残す**（[`../open-issues.md`](../open-issues.md) にも1項目として載せた——`history/` にだけ書かれた残件は幽霊になる）。

- [ ] シーケンス図で「画像をコピー」を実行し、外部アプリ（画像編集ソフト・チャットの入力欄等）に貼り付けて図が正しく表示されることを確認する
- [ ] シーケンス図で「問いを含む」「問いを含めない」それぞれの画像コピーを実行し、ガター列の有無が見た目に反映されることを確認する
- [ ] シーケンス図をパン/ズームで画面外に図がはみ出した状態にしてから画像コピーを実行し、画面外の部分も画像に収まっていることを確認する
- [ ] シーケンス図で「画像で保存」を実行し、保存した PNG ファイルを画像ビューアで開いて正しく表示されることを確認する
- [ ] ロジックツリーで同様に画像コピー・画像で保存を確認する（ロジックツリーはプロファイル1本なのでドロップダウンが出ずボタン直押しになることも確認する）
- [ ] キャプチャ中に画面が一瞬「全体表示」にリセットされてから戻るちらつきの体感を確認し、許容範囲かを判断する（design spec 決定6 で許容と決めた挙動の実物確認）
- [ ] 保存ダイアログでキャンセルしたとき、エラーバナーが出ずに何も起きないことを確認する
- [ ] `clipboard-manager:allow-write-image`/`fs:allow-write-file` の権限が欠けていないこと（画像コピー・保存のいずれかが「許可がありません」的なエラーで落ちないこと）を確認する
- [ ] 確認が取れたら、このチェックリストの結果を本書へ転記する。未実施のまま完了扱いにしない

**この一巡でしか埋まらない観察が3つある**ので、実施する人は併せて見ること:

1. **`root.scrollWidth`/`scrollHeight` が本当に図の全体寸法を返すか**（下記「残った限界」1）。3番目の項目がそのまま検査になる。
2. **キャプチャの所要時間**——一瞬なら進捗表示は不要、待たされるなら足す（下記「残った限界」2）。
3. **シーケンス図の2プロファイルが、保存ダイアログの時点で異なる既定ファイル名を出すこと**（`<名前>.png` と `<名前>-simple.png`。`fileSuffix` の値による）。同名なら上書き事故の温床になる。

---

## 残った限界（自動テストでは閉じられない）

1. **`root.scrollWidth`/`scrollHeight` が実機で図の全体寸法を返すかは未検証。** jsdom では `scrollWidth` が常に `0` なので、**自動テストでは原理的に検証できない**（`image-export.test.ts` は `scrollWidth` を getter で差し替えて「単位行列へ戻した後に測って `toBlob` へ渡す」順序だけを固定している）。`containerRef` は `overflow-hidden` のビューポートで、その子孫（絶対配置のノード群）がはみ出す構造なので理屈上は含まれるはずだが、確証は実機でしか得られない。外していれば図が切れて見つかり、サイズ算出方法の作り直しが要る。
2. **キャプチャ中の進捗表示が無い。** 押しても無反応に見えるかは所要時間次第で、いま入れるのは推測での作り込みになるため**意図的に Task 11 の後へ回した。**

どちらも [`../open-issues.md`](../open-issues.md) に載せた。

---

## レビューが挙げて deferred にした minor

以下は実害が無いか到達性が低いと判断して直しておらず、**本書にのみ残す**（開いている残件ではなく、当時の判断の記録である）:

- `image-export.test.ts` の `capturedFilter!` の非 null アサーション。宣言側で直す方が綺麗という指摘だが、型安全であり空振りテストも隠さない（mock が走らなければ `TypeError` で落ちる）ことをレビューが実測で確認済み。なお当初レポートが理由を「TS 6.0.3 のバグ」と書いていたのは誤りで、「**コールバック内の代入は外側スコープの制御フロー解析に伝播しない**」という TypeScript の仕様どおりの挙動である（レビューが3パターンを実測して反証し、レポートを訂正した）。
- transform の復元が `await blob.arrayBuffer()` の後まで待つので、ちらつきが必要以上に長い。ちらつき自体は設計スペックで許容済みで、長さの体感は Task 11 の6番目の項目で観察される。
- `doCopyImage`/`doExportImage` は `captureLayersRef.current` が `null` のとき無言で return する。レビューが「現状は到達不能（ボタンが押せる ⟺ エディタがマウント済み）」と確認しており、起きない状態のための日本語文言を足すのは YAGNI。
- sequence のガター件数テストは**件数（ちょうど10・内訳付き）は数えるが要素の同一性は見ない**——マーカーを別の要素へ移しても10のまま通る。マーカーを1つ落とせば落ちるので、回帰検出力そのものはある。
- logic-tree 側に「`data-export-role="gutter"` が0件であること」を固定する回帰テストが無い。logic-tree にはガターに相当する概念自体が無いので、守るべき退行の面が薄い。
- 2つの `useImperativeHandle` の doc コメントで、末尾句点（`。`）の有無が揃っていない。
- `project-fs.test.ts` のキャンセルテストが `expect(await f())` 形式で、隣の `askSaveMarkdownPath` の同種テストの `await expect(f()).resolves` 形式と揃っていない（計画が指定した形。機能的には等価）。
- `SequenceEditor.dom.test.tsx` の「`captureRef` を渡さなくても他の描画・操作に影響しない」は、表題の広さに対してアサーションが「ステップを追加が効いて steps が4件になる」1本しかない。**表題を読んで期待するほど広くは守っていない**が、描画と操作を1本通っていること自体は正しいので、開いている穴とは数えなかった。
- Task 2 の実装報告に書かれた自己引用の行番号が、実際のハンク位置とずれている（コードには影響なし）。

**開いている穴だったものは本書だけに置かなかった**（`docs/history/` にだけ書かれた残件は幽霊になる——[`../../CLAUDE.md`](../../CLAUDE.md)）——「画像出力のオーケストレーションに自動テストが無い」と「`useImperativeHandle` の `[]` deps が3レイヤ常時マウントに依存する」の2件は [`../open-issues.md`](../open-issues.md) へ移した（次項）。

---

## `docs/open-issues.md` への反映

**消したのは「小さな負債」の1件だけ**——`docs/README.md` の履歴表に M12 の行が無い件で、本マイルストーンの行と一緒に埋めたので閉じた（下記「`docs/README.md` への反映」）。

**画像出力そのもののスコープでは、既存の残件を1つも閉じていない。** とくに `layout.totalHeight`/`totalWidth` の帳簿ずれ2件は**実測に切り替えて回避しただけ**で、帳簿そのものは直していない。既存2項目にはその旨の一文を足した。

新規に足したもの:

- **「次に手を付ける候補」に、M18 の実機確認（Task 11）が未実施であることを足した**（M15 の未実施と並ぶ2件目）。
- 挙動の穴（`[M18]`）: `root.scrollWidth`/`scrollHeight` が図の全体寸法を返すかが未検証／キャプチャ中の進捗表示が無い。
- テストが無い箇所（`[M18]`）: 画像出力のオーケストレーション（`App.tsx` の `doCopyImage`/`doExportImage`）に自動テストが無い。設計スペック7章のテスト表は `app-controller.test.ts` に `copyImage`/`exportImage` のフローを足すと書いていたが、**決定6b でオーケストレーションが `App.tsx` へ移ったので、その行は満たしようがなくなった**（`src/App.dom.test.tsx` に画像出力を踏むテストは1件も無い）。
- 将来の機能を作った瞬間に踏むもの（`[M18]`）: `useImperativeHandle` の `[]` deps は「3レイヤが常にマウントされる」ことに依存しており、どれかを条件付きレンダーにすると静かに壊れる。
- 既存の「キャンバスの土台が logic-tree と sequence で丸ごと複製されている」に、`captureRef`/`CaptureLayers` の実装が**両モジュールにほぼ同一の形で増えた**ことと、**型引数を明示する理由のコメントが logic-tree 側にしかない**という差が1点あることを追記した（同項目の standing instruction は「差分を作らない。直すときは両方を直す」）。

## `docs/overview-rev.md` への反映

8章「出力・入力戦略」に、**画像出力プロファイルは `OutputProfile` と並行する別の規約である**ことを1項目として足した（上記「実装で確定した事項」3 の内容——純関数にできない理由、`imageOutputs` の0本、`chrome` の常時除外と `gutter` の選択という性質の違い）。章番号もファイル名も動かしていない（`rev N章` は多数から参照されている通称）。

## `docs/project-setup.md` への反映

「Rust と capabilities」節の表に `clipboard-manager:allow-write-image` と `fs:allow-write-file` の行を足し、Cargo feature `image-png` が要る理由（`Image.fromBytes` が PNG をデコードしてから `writeImage` へ渡す形を採ったため）を書いた。

## `docs/README.md` への反映

マイルストーン履歴表に M18 の行を足した。**あわせて、`open-issues.md`「小さな負債」が記録していた M12 の行の欠落も埋め、その項目を消した**（`docs/history/m12-core-reading-guide.md` が実在し、主題が「読み方ガイドの同梱」であることを本文で確認したうえで足している）。
