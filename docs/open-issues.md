# 開いている残件

> **生きた文書。編集して増減させる。** 解消したものは**消す**（消したこと自体は、そのマイルストーンの [`history/`](history/) に残る）。
>
> ここに載るのは「**いつでもよいが、忘れると実害化するもの**」。いま着手すべきものはマイルストーンの計画に入れる。マイルストーン完了時にこのファイルを更新するのは義務（[`../CLAUDE.md`](../CLAUDE.md) 参照）。
>
> 最終更新: sequence M2 完了時点（2026-08-11）

各項目の末尾の `[MN]` は**最初に記録されたマイルストーン**。長く開いているものほど「踏まないから残っている」のか「踏むけど後回しにしている」のかを見分ける手がかりになる。**採番は3系統**（コア・用語集・エラーカタログの `MN`、ロジックツリーの `logic-tree-mN`、シーケンスの `sequence-mN`）。

## テストが無い箇所

- **`schema.test.ts` の変異耐性に穴が3箇所残っている**: `additionalProperties` の拒否・`unknownSlot` の `decision` enum・`const` / `from`-`to` のパターン。最終レビューが実害小と判断して繰り越したもので、**この層に触るときの宿題**（`consistency.test.ts` にあった2穴——actor 側の ID 重複ケース・reply の `to` 欠落ケース——は sequence M2 Task 2 で解消した） `[sequence-m1]`
- **interleaving を要する3分岐にテストが無い**（`src/core/app-controller.ts`）: `rescan` の `switchingFolder > 0` ガード（フォルダ切替中に届いた旧フォルダのイベントが新しい一覧を上書きする）、`rescan` の `token !== scanSeq || projectDir !== dir` ガード（遅れて着地した古い走査結果が新しい一覧を上書きする）、`handleSelectedGone` の `selectSeq++`（進行中の `selectFile` が着地して消えたファイルを選び直す）。**コントローラは I/O を注入しているので `io.scan` に手動 Promise を挟めば書ける。** この層に触るときの宿題 `[M6]`
- **`currentDocument()` の「未選択」分岐を明示的に踏むテストが無い**（`src/core/app-controller.ts`）。「編集中データなし」分岐と観測が重なる `[M6]`
- **`FLUSH_MAX_ROUNDS` の打ち切りパスに直接テストが無い**（`src/core/autosave.ts`）。戻り値は安全側の false なので後回し可 `[M5]`
- **`fileExists` に専用の単体テストが無い**（`src/fs/project-fs.ts`）。`exists` への1行委譲で、意味のある挙動は `file-ops.test.ts` が押さえている `[M5]`
- **`ChoiceDialog` のオーバーレイクリックのテストが無い**。`onOpenChange` を渡さないことで構造的に担保され、同じ機構を Esc のテストが固定している `[M5]`
- **`Ctrl+Z` / `Ctrl+Shift+Z` をエディタが消費しないことを守るテストが、リポジトリのどこにも無い**: Undo/Redo は rev 10章のグローバル層で、額縁が握って全ツールに効かせている。ところが**額縁とエディタを一緒に立てる App レベルの DOM テストが1本も無い**ため、どのエディタも「自分で `Ctrl+Z` を食べてしまう」変更を入れ放題である。各エディタ側のテストは自分のハンドラしか見ておらず、消費してしまったこと自体は観測できない。**全ツールの Undo が同時に静かに壊れうる唯一の穴**なので、App レベルの DOM テストを1本立てる価値がある `[logic-tree-m1]`

## 将来の機能を作った瞬間に踏むもの

- **`ensureFileOfType` は将来のインライン登録から呼ぶと二択と競合する**（`src/core/app-controller.ts`）: 内部で `rescan()` を回すので、`ask` が出た直後に `selectFile` で選択を移してしまい、回答が「選択が変わったため書き戻しませんでした」に倒れる。今日は「用語集を作る」ボタンが空状態（未選択時）にしか出ないので到達不能だが、**インライン登録を実装した時点で踏む**（[`history/m4-core-file-operations.md`](history/m4-core-file-operations.md) の `ensureFileOfType` に関する項と併せて読むこと） `[M6]`
- **モジュール規約8（表記ゆれ検知の対象フィールドパス宣言）が `ToolModule` に無い**（`src/core/registry.ts`）: rev 6章は8点セットと書いているが、コードは7点＋`createEmpty`。**検知エンジン自体もコアに無い**ため、宣言だけ足しても読み手のいない死んだコードになる。エンジンを作る時点で両方を足す `[M9]`
- **`scripts/gen-types.mjs` は `schemas/*.schema.json` が減っても対応する `src/types/*.ts` を消さない**: スキーマを走査して書き出すだけで、消えたスキーマの古い型ファイルは掃除しない。M9 で `.gitignore` を `src/types/glossary.ts` から `src/types/*.ts` に広げたため、取り残された型ファイルは `git status` に現れず `tsc` の対象にだけ残る。**2本目以降のツールでスキーマを作り直す／消す時点で踏む** `[M9]`（M10 はスキーマを1本足しただけで、作り直し・削除は発生していないため未解消のまま）
- **エラー登録 Skill が無い**（`.claude/skills/`）: 用語集には `glossary-term-register` があるが、エラーカタログには対応物が無い。会議中に出たエラーを AI 経由で登録する動線が用語集にだけある状態。**アプリと Skill の正規形はバイト単位で一致していなければならない**ので、作るときは `scripts/` の書き出し実装をアプリの `serialize` と突き合わせること `[M10]`
- **エッジに矢印を描いていない**（`src/modules/logic-tree/TreeEdges.tsx`）: [`logic-tree/logic-tree-canvas-tech-notes.md`](logic-tree/logic-tree-canvas-tech-notes.md) 論点3 は「曲線と矢印」としているが、横向きで親が必ず左にあるため向きは曖昧でなく、M1 では描いていない。**エッジの種類を増やす（点線・色分け）ときに再検討する**——種類が増えた瞬間「線の意味」を線自体が語る必要が出るため `[logic-tree-m1]`

## 挙動の穴（実害は小さいが残っている）

- **`replyTo`（応答と呼出の対応）が無く、`reply` 行の説明が一般文言である**（`schemas/sequence.schema.json` / `src/modules/sequence/`）: 「この応答はどの呼出への応答か」をデータが持たないため、行の説明は誰に対しても同じ文になる。design-notes 論点3 は**意図的に持たない**と決めた（対応の明示が要ると分かってから入れる）ので欠陥ではないが、**呼出が入れ子になるシナリオを実際に書いたときに読めるか**は実使用でしか分からない。ホバーで対の呼出をハイライトする等を検討するなら、まずこのフィールドが要る `[sequence-m1]`
- **`GhostSlot` の ✕ が `layout.totalWidth` の外に約20px はみ出す**（`src/modules/sequence/GhostSlot.tsx` / `layout.ts`）: 図の幅の帳簿（`layout.totalWidth`）と実描画がずれている——ghost の削除ボタンは `layout.totalWidth` を考慮せず配置されるため、右端に固定幅ぶんはみ出す。sequence M2 の実機確認では崩れとして問題視されなかったが、**構造的なずれなのでガターに列を足す等、図の右端を扱う変更をするとき必ず踏む** `[sequence-m2]`
- **`resolveCommand` の細かい非対称**（`src/core/keyboard/keymap.ts`）: macOS の `Ctrl+Backspace`（主修飾キーは Cmd なので素の Backspace として通る）と `Alt+Shift+↑↓`（`altKey` を先に見るため並び替えになる） `[M3]`
- **モーダルが開いている間もキャンバスのホイール／ドラッグが生きている**（`src/modules/logic-tree/useViewport.ts`）: rev 10章の境界規則は「モーダル中はエディタの操作言語を停止する」と定めており、キー監視（Space）は `enabled` で止めているが、**d3-zoom の `filter` は `enabled` を見ていない**。モーダルの裏で `Ctrl+ホイール` を回すとズームし、閉じたときに視点が変わっている。**規約に対する未達なので、いずれ塞ぐ。** 直し方は `filter` の先頭に `enabled` の ref を見る1行を足すだけ（`enabled` を ref に写す必要がある。d3 のハンドラはマウント時に1回しか張らないため） `[logic-tree-m1]`
- **ID が重複しているファイルでは、その ID を親に指すノードが先頭の1つにだけ付く**（`src/modules/logic-tree/tree.ts`）: 挙動は決めてあるが、**画面に出るのは「ID が重複しています」だけ**で、木の形が想定と違って見える理由が読み手に繋がらない。ID 重複を直せば解消するので実害は小さいが、原因の説明が要る `[logic-tree-m1]`
- **検証エラーのバナーが木の上部を覆う**（`src/modules/logic-tree/LogicTreeEditor.tsx`）: `absolute top-0` で敷いており、指摘が2件出ると最初のノードに重なる。`max-height` も無いので件数が多いと広く覆う。**赤表示が出ているファイルほどノードを触りたいのに、そのノードが隠れる**という逆向きの挙動になっている `[logic-tree-m1]`
- **ドラッグ中にアンマウントすると d3 が window に張ったリスナーが残る**（`src/modules/logic-tree/useViewport.ts`）: 体感とは無関係に成立し、実機確認を終えても解消しない `[logic-tree-m1]`
- **`FOLLOW_MARGIN`(48) > `CANVAS_MARGIN`(40) で初回の追従が 8px ずれる**（`src/modules/logic-tree/useViewport.ts` / `viewport.ts`）: 完全に見えているノードでも初回の追従だけ 8px 余分に動く。**実機確認の前に載せておく必要がある**——載せておかないと、実機で「1回だけカクッと動く」を見た人が I-1（二重スクロール）の再発と誤診する `[logic-tree-m1]`

## 性能

- **編集1打鍵ごとに全ファイルの `checkConsistency` を再実行している**: 数百レコード規模では問題ないが、規模が増えたら選択中ファイルだけの差分計算に変える `[M2]`
- **textarea の高さ計算が初回マウントで行数ぶんの強制リフローを起こす**（`src/components/CellInput.tsx`）: `multiline` のセル（定義・備考）は `useLayoutEffect` で `rows=1` に戻してから `scrollHeight` を読むため、セルあたり2回のレイアウト計算が初回に走る。5行上限が1回あたりのコストの頭を押さえているが、数百行では体感しうる。上の `checkConsistency` の再実行と同じ規模の話 `[M8]`
- **`CellInput` の行数上限を8にした影響**（`src/components/CellInput.tsx`）: 初回マウントの強制リフローのコストは行数に比例する（上の項目と同じ機構）。M10 の実機確認で体感が出なければ据え置き、出たら差分計算へ `[M10]`
- **ノードの測定結果のキャッシュが上限で全消しになる**（`src/modules/logic-tree/LogicTreeEditor.tsx` の `MEASURE_CACHE_LIMIT`）: LRU ではなく `cache.clear()` なので、2000件に達した直後の1フレームだけ**全ノードを測り直す**。木が大きいほど、その1フレームだけ引っかかる。フォント変更でも作り直す設計なので、上限に達するのは長い編集セッションの後になる `[logic-tree-m1]`

## アクセシビリティ

- **列幅ハンドル（`role="separator"`）が `aria-valuenow` / `aria-valuemin` / `aria-valuemax` を持たない**（`src/core/column-resize.ts` の `HandleProps`）: ハンドルは `tabIndex={0}` で Tab 順に入り ←→ で動く（＝WAI-ARIA の window splitter）が、**現在の幅がスクリーンリーダーに伝わらない**ので、操作しても何が起きたか分からない。値は store が持っているので、`getHandleProps` が返す props に3つ足すだけで塞がる `[M8]`

## デザイン

- **`warning` と `ok` が P型・D型色覚で識別できない**（`src/styles/palette.css`）: 採用した Basalt 由来の配色は、OKLab の色差が標準色覚で 0.151 / P型 0.050 / D型 0.041（ライト）。0.10 を下回ると「同じ色の濃淡」に見え始める。**色を差し替えるときに、青緑側（`oklch(0.470 0.075 168)` 付近）へ振る案を再検討すること。** `palette.test.ts` がこの数字を毎回出力するが、意図的に失敗させていない（M7 の設計スペック 決定4）。`palette-retheme` Skill が差し替えのたびに ΔE 3種を報告するので、次に配色を触るときには必ずこの数字が目に入る `[M7]`
- **`ok` がどのコンポーネントからも参照されていない**（`src/styles/palette.css`）: rev 9章の3系統として定義とテストはあるが、facet の画面に「確定・応答」を色で示す箇所がまだ無い（トーストは種別を持たない）。**成功トーストなどを作った時点で使う。** M8 で新設した `surface-accent`（見出しの面）は**別のトークン**であって、これを解消しない——カラム名は「確定・応答」ではないので、`ok` を流用すると意味論が壊れる `[M7]`
  - **sequence M1 が最初の使いどころだったが、使わなかった**（`src/modules/sequence/GutterSlot.tsx`）: scope は答えスロットの色を「未定義＝warning／handled＝ok 系／notApplicable＝弱い ok 系」と書いていたが、**`ok` の面（`bg-ok/α`）は濃さの検算が済んでいない**ため、`handled` と `notApplicable` はどちらも無地（`border-rule bg-surface`、文字色だけ差をつける）にした。**「回答済み」と「考慮不要」の区別が、面の色ではなく文言に頼っている**状態である。上の色差の再検討（P型・D型）と一緒に、`ok` の半透明の濃さを検算するときに入れる `[sequence-m1]`
- **行全体の指摘と `from`/`to` の指摘が同時に出ると `warning` の面が二重になりうる**（`src/modules/sequence/SequenceEditor.tsx`）: 行の帯と文言セルの面は排他にしたが（M8「面は片方だけ」）、`from`/`to` の参照切れが指すセルは `bg-surface` の上に枠を出す形なので今は重ならない。**`from`/`to` のセルに面を与えた瞬間、行の帯と2枚になる。** 排他の判定は `stepHas(index,'row')` の1箇所にあるので、面を増やすときはそこを通すこと `[sequence-m1]`
- **方眼背景がキャンバスのズームに追従しない**（`src/modules/logic-tree/LogicTreeEditor.tsx`）: `bg-grid-paper` はビューポート（transform を当てる要素）の**外側**に敷いてあるので、拡大しても升目の大きさが変わらない。**rev 9章「地は方眼、作業する面は無地」の意図には合っている**（方眼は地の模様であって図の一部ではない）が、キャンバスとしては**倍率の手がかりを失っている**——どれだけ拡大しているかが画面から読めない。倍率表示を出すか方眼を内側へ移すかは、実機で「今どれくらいの倍率か分からない」と感じたときに決める `[logic-tree-m1]`
- **空欄 `Backspace` のステップ削除に誤爆の不安があると実機で観察された**（`src/modules/sequence/SequenceEditor.tsx`）: 設計は「消しても `Undo` が受け皿」で確定済みだが、体感として不安が先に立つ場面があった。確定設計を変える理由にはならないが、体感と設計判断の差として記録する。詳細は [`history/sequence-m1-keyboard-editor.md`](history/sequence-m1-keyboard-editor.md) の「実機確認で出た観察」② `[sequence-m1]`
- **actor / kind セルをドロップダウン化する案**（`src/modules/sequence/ActorRefCell.tsx` / `StepShapeCell.tsx`）: マウス操作でも迷わず選べる形にしたいという声が実機で出た。**M3 のマウス操作の回に合流させる。** 詳細は同「観察」③ `[sequence-m1]`
- **「図を作る」→「失敗考慮を打つ」の二段階ワークフローと `Tab` の2ゾーン化**（`src/modules/sequence/SequenceEditor.tsx`）: 骨格（from/to/種別/ラベル）を打ち切ってからガターの答えを埋め直す使い方が多く観察された。`Tab` を骨格ゾーン→答えゾーンの2ゾーンに分けられると自然という提案。**答えへのキーボード到達は必須のまま崩さないこと。** 詳細は同「観察」⑤ `[sequence-m1]`

## 小さな負債

- **用語テーブルの `<th>` に `sticky` と `relative` が同時に付いている**（`src/modules/glossary/GlossaryEditor.tsx`）: どちらも `position` なので、カラム名が固定されているのは Tailwind が `sticky` を `relative` より後に出力しているからにすぎない。`sticky` 自体が絶対配置の包含ブロックになる（列幅ハンドルはそれに乗っている）ので `relative` は不要。**出力順が変わると固定が静かに外れ、原因は読み手に自明でない** `[M8]`
- **エディタのキー処理が用語集とエラーカタログで二重化している**（`GlossaryEditor.tsx` / `ErrorCatalogEditor.tsx`）: `runCommand` の switch・`onCellKeyDown`・`textFieldContext`・セルの面のクラス定数（計 約80行）がほぼ同一。M10 は意図的に複製した——いま抽象を決めても、3本目（ロジックツリーは列を持たない図系）が必要とする形と一致する保証がないため（M9 決定1が万能フックを退けたのと同じ理由）。**3本目が列を持つツール（状態遷移の遷移表など）だったら、その時点で引き上げる。** 判断材料は「2本の差が3点（プロファイルトグル・列幅ストア2本・吸収列）に収まっているか」 `[M10]`
- **キャンバスの土台が logic-tree と sequence で丸ごと複製されている**（`src/modules/sequence/viewport.ts` / `viewport.test.ts` / `useViewport.ts` / `useViewport.dom.test.tsx` / `seq-font.ts`、および `measure.ts` の折り返しアルゴリズム）: sequence M1 の scope が「一般化は2本目完成後の別マイルストーンで判断する」と定めた**意図的な複製**で、各ファイルの先頭にその旨のコメントがある。**2本目が完成したので、判断の材料は揃った**——ツリー（再帰の Reingold–Tilford 型）とシーケンス（X も Y も単純な積み上げ）でレイアウト関数の性質は大きく違うが、**その下のビューポート・測定・フォント読み取りは差が無い**（`viewport.ts` は先頭コメント3行以外 diff ゼロ）。`core/canvas` へ引き上げるかを別マイルストーンで決めること。**それまでは差分を作らない。直すときは両方を直す。** なお logic-tree 側の既知の穴（モーダル中もホイール／ドラッグが生きている・ドラッグ中のアンマウントでリスナーが残る・`FOLLOW_MARGIN` の 8px ずれ）は、**この複製によってそのまま2本に増えている** `[sequence-m1]`
- **`focusSibling` が `commands.ts` の `siblingsOf` と同一の式**（`src/modules/logic-tree/LogicTreeEditor.tsx`）: 「次の写経で3本目が生える」。`export` 1行で潰せるうちに記録を残す `[logic-tree-m1]`
- **エラー登録 Skill の同梱スクリプトが、警告判定・ラベル文言・整合性検証をアプリと複製している**（`.claude/skills/error-catalog-register/scripts/error-catalog-write.mjs` の `isWarn` / `LEVEL_LABEL` / `ACTION_LABEL` / 整合性検証の3ルール）: それぞれ `src/modules/error-catalog/warnings.ts` の `isWarnCell`・`resolution-labels.ts` の `RESOLUTION_LABELS`・`fields.ts` の `FIELD_LABELS`・`consistency.ts` の `checkErrorCatalogConsistency` と、条件・文言が1対1で一致するよう手で複製している。Skill とアプリの接点はファイル（正規形）だけという設計上の決定の帰結で、構造的に避けられない。**`schemas/error-catalog.schema.json` の `resolutionLevel` enum を改訂するときは、この2箇所を両方追従させること。** 追従漏れがあっても双方は独立に動くため、テストでは検知されない `[Skill]`
- **`palette-fit.mjs` が Node の型ストリップに依存している**（`.claude/skills/palette-retheme/scripts/`）: `.mjs` から `src/styles/contrast.ts` を直接 import しており、Node 22.18 未満では動かない。また `contrast.ts` に `enum` やコンストラクタのパラメータプロパティを書くと**消去できない構文**として落ちる（型注釈・`interface`・`type` は問題ない）。ロジックを複製しないための選択で、複製との比較では正しいが、**依存が Node のバージョンと構文の制約という見えにくい形で残っている** `[Skill]`
- **2本の Skill の `evals/grade.mjs` で自己位置解決の形が揃っていない**: 用語集版（`.claude/skills/glossary-term-register/evals/grade.mjs`）は `SKILL` / `SCHEMA` を主チェックアウトの絶対パス（`C:/Dev/Projects/facet/...`）で持っており、worktree では動かない。エラー登録版は最終レビューで `import.meta.url` からの自己位置解決に直したため、**2本で形が揃っていない。** 3本目の Skill を作るときか、用語集版に触る機会に揃える `[Skill]`（3本目（`palette-retheme`）は evals を持たないため、この揃え直しの機会にはならなかった）
