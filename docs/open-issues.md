# 開いている残件

> **生きた文書。編集して増減させる。** 解消したものは**消す**（消したこと自体は、そのマイルストーンの [`history/`](history/) に残る）。
>
> ここに載るのは「**いつでもよいが、忘れると実害化するもの**」。いま着手すべきものはマイルストーンの計画に入れる。マイルストーン完了時にこのファイルを更新するのは義務（[`../CLAUDE.md`](../CLAUDE.md) 参照）。
>
> 最終更新: sequence M4 完了時点（2026-08-14）

各項目の末尾の `[MN]` は**最初に記録されたマイルストーン**。長く開いているものほど「踏まないから残っている」のか「踏むけど後回しにしている」のかを見分ける手がかりになる。**採番は3系統**（コア・用語集・エラーカタログの `MN`、ロジックツリーの `logic-tree-mN`、シーケンスの `sequence-mN`）。

## テストが無い箇所

- **`schema.test.ts` の変異耐性に穴が3箇所残っている**: `additionalProperties` の拒否・`unknownSlot` の `decision` enum・`const` / `from`-`to` のパターン。最終レビューが実害小と判断して繰り越したもので、**この層に触るときの宿題**（`consistency.test.ts` にあった2穴——actor 側の ID 重複ケース・reply の `to` 欠落ケース——は sequence M2 Task 2 で解消した） `[sequence-m1]`
- **interleaving を要する3分岐にテストが無い**（`src/core/app-controller.ts`）: `rescan` の `switchingFolder > 0` ガード（フォルダ切替中に届いた旧フォルダのイベントが新しい一覧を上書きする）、`rescan` の `token !== scanSeq || projectDir !== dir` ガード（遅れて着地した古い走査結果が新しい一覧を上書きする）、`handleSelectedGone` の `selectSeq++`（進行中の `selectFile` が着地して消えたファイルを選び直す）。**コントローラは I/O を注入しているので `io.scan` に手動 Promise を挟めば書ける。** この層に触るときの宿題 `[M6]`
- **`currentDocument()` の「未選択」分岐を明示的に踏むテストが無い**（`src/core/app-controller.ts`）。「編集中データなし」分岐と観測が重なる `[M6]`
- **`FLUSH_MAX_ROUNDS` の打ち切りパスに直接テストが無い**（`src/core/autosave.ts`）。戻り値は安全側の false なので後回し可 `[M5]`
- **`fileExists` に専用の単体テストが無い**（`src/fs/project-fs.ts`）。`exists` への1行委譲で、意味のある挙動は `file-ops.test.ts` が押さえている `[M5]`
- **`ChoiceDialog` のオーバーレイクリックのテストが無い**。`onOpenChange` を渡さないことで構造的に担保され、同じ機構を Esc のテストが固定している `[M5]`
- **`AppController.openFolder` の `boolean` 契約を直接固定する単体テストが無い**（`src/core/app-controller.test.ts`）: false を返す分岐は4つ（`closeCurrentFile` の flush 失敗／トークンすり替わり2箇所／`scan.unreadable`／catch）。**この契約はフォルダ切替時の破壊的な `kill` が依存しているので load-bearing** `[M11]`

## 将来の機能を作った瞬間に踏むもの

- **`ensureFileOfType` は将来のインライン登録から呼ぶと二択と競合する**（`src/core/app-controller.ts`）: 内部で `rescan()` を回すので、`ask` が出た直後に `selectFile` で選択を移してしまい、回答が「選択が変わったため書き戻しませんでした」に倒れる。今日は「用語集を作る」ボタンが空状態（未選択時）にしか出ないので到達不能だが、**インライン登録を実装した時点で踏む**（[`history/m4-core-file-operations.md`](history/m4-core-file-operations.md) の `ensureFileOfType` に関する項と併せて読むこと） `[M6]`
- **モジュール規約8（表記ゆれ検知の対象フィールドパス宣言）が `ToolModule` に無い**（`src/core/registry.ts`）: rev 6章は8点セットと書いているが、コードは7点＋`createEmpty`。**検知エンジン自体もコアに無い**ため、宣言だけ足しても読み手のいない死んだコードになる。エンジンを作る時点で両方を足す `[M9]`
- **`scripts/gen-types.mjs` は `schemas/*.schema.json` が減っても対応する `src/types/*.ts` を消さない**: スキーマを走査して書き出すだけで、消えたスキーマの古い型ファイルは掃除しない。M9 で `.gitignore` を `src/types/glossary.ts` から `src/types/*.ts` に広げたため、取り残された型ファイルは `git status` に現れず `tsc` の対象にだけ残る。**2本目以降のツールでスキーマを作り直す／消す時点で踏む** `[M9]`（M10 はスキーマを1本足しただけで、作り直し・削除は発生していないため未解消のまま）
- **エッジに矢印を描いていない**（`src/modules/logic-tree/TreeEdges.tsx`）: [`logic-tree/logic-tree-canvas-tech-notes.md`](logic-tree/logic-tree-canvas-tech-notes.md) 論点3 は「曲線と矢印」としているが、横向きで親が必ず左にあるため向きは曖昧でなく、M1 では描いていない。**エッジの種類を増やす（点線・色分け）ときに再検討する**——種類が増えた瞬間「線の意味」を線自体が語る必要が出るため `[logic-tree-m1]`
- **ゾーンは sequence M5 以降**（`schemas/sequence.schema.json` / `src/modules/sequence/`）: design-notes 論点12 の M3+ 候補のうち、M3 はマウス操作と出力を、M4 は登録 Skill を採った。ゾーンは `schemaVersion` 改訂＋マイグレータを伴う唯一の候補で、`questions.ts` / `consistency.ts` / `layout.ts` / ガター集計と縦に全層を貫く。データ形式（step ID のペアか所属宣言か）も未確定。design-notes が付けた条件「**同じ答えを何度も書いた実感を得てから**」を満たしたかを先に確かめること `[sequence-m3]`

## 挙動の穴（実害は小さいが残っている）

- **`replyTo`（応答と呼出の対応）が無く、`reply` 行の説明が一般文言である**（`schemas/sequence.schema.json` / `src/modules/sequence/`）: 「この応答はどの呼出への応答か」をデータが持たないため、行の説明は誰に対しても同じ文になる。design-notes 論点3 は**意図的に持たない**と決めた（対応の明示が要ると分かってから入れる）ので欠陥ではないが、**呼出が入れ子になるシナリオを実際に書いたときに読めるか**は実使用でしか分からない。ホバーで対の呼出をハイライトする等を検討するなら、まずこのフィールドが要る `[sequence-m1]`
- **`GhostSlot` の ✕ が `layout.totalWidth` の外に約20px はみ出す**（`src/modules/sequence/GhostSlot.tsx` / `layout.ts`）: 図の幅の帳簿（`layout.totalWidth`）と実描画がずれている——ghost の削除ボタンは `layout.totalWidth` を考慮せず配置されるため、右端に固定幅ぶんはみ出す。sequence M2 の実機確認では崩れとして問題視されなかったが、**構造的なずれなのでガターに列を足す等、図の右端を扱う変更をするとき必ず踏む** `[sequence-m2]`
- **`resolveCommand` の細かい非対称**（`src/core/keyboard/keymap.ts`）: macOS の `Ctrl+Backspace`（主修飾キーは Cmd なので素の Backspace として通る）と `Alt+Shift+↑↓`（`altKey` を先に見るため並び替えになる） `[M3]`
- **ID が重複しているファイルでは、その ID を親に指すノードが先頭の1つにだけ付く**（`src/modules/logic-tree/tree.ts`）: 挙動は決めてあるが、**画面に出るのは「ID が重複しています」だけ**で、木の形が想定と違って見える理由が読み手に繋がらない。ID 重複を直せば解消するので実害は小さいが、原因の説明が要る `[logic-tree-m1]`
- **検証エラーのバナーが木の上部を覆う**（`src/modules/logic-tree/LogicTreeEditor.tsx`）: `absolute top-0` で敷いており、指摘が2件出ると最初のノードに重なる。`max-height` も無いので件数が多いと広く覆う。**赤表示が出ているファイルほどノードを触りたいのに、そのノードが隠れる**という逆向きの挙動になっている `[logic-tree-m1]`
- **ドラッグ中にアンマウントすると d3 が window に張ったリスナーが残る**（`src/modules/logic-tree/useViewport.ts`）: 体感とは無関係に成立し、実機確認を終えても解消しない `[logic-tree-m1]`
- **`FOLLOW_MARGIN`(48) > `CANVAS_MARGIN`(40) で初回の追従が 8px ずれる**（`src/modules/logic-tree/useViewport.ts` / `viewport.ts`）: 完全に見えているノードでも初回の追従だけ 8px 余分に動く。**実機確認の前に載せておく必要がある**——載せておかないと、実機で「1回だけカクッと動く」を見た人が I-1（二重スクロール）の再発と誤診する `[logic-tree-m1]`
- **一度端末をクリックするとキーボードだけでは本体へ戻れない**（`src/components/TerminalPane.tsx`）: xterm が `Tab` を消費するため。ペインの開閉にショートカットを割り当てない判断（設計 決定11。**人間が「キーは割り当てない」と裁定**）の帰結で、マウスで本体をクリックする必要がある。**facet は入力速度最優先（rev 2章）を掲げているので、体験としては未達である** `[M11]`
- **端末の中だけライト表示でも暗い**（`src/components/TerminalTab.tsx`）: xterm の既定配色を使い、facet の役割トークンを流し込んでいない（端末は rev 9章の対象外という判断）。実機で違和感が出たら、CSS カスタムプロパティを実行時に解決して xterm の `theme` へ渡す形を検討する——**その際もソースに色値を書かないこと**（`conventions.test.ts`） `[M11]`
- **ペインが壁に当たった状態でさらに広げようとすると、記憶している幅が縮む**（`src/core/column-resize.ts` / `src/components/PaneSplitter.tsx`）: `upper` に達している状態でドラッグすると、クランプ後の値が「意図」として書き戻される。ウィンドウを広げても元の幅に戻らない（ダブルクリック／`Home` で復帰可能）。**表エディタと共有しているモジュールなので、直すなら両方の挙動を見る必要がある** `[M11]`
- **起動待ちの間に端末へ打った入力が無音で消える**（`src/components/TerminalTab.tsx`）: `term.onData` の登録が `spawn` の解決後のため。実害は起動までの約1秒 `[M11]`
- **`killAllPtys` が `starting` 状態の PTY を取りこぼしうる**（`src/fs/pty.ts`）: `live` への登録が `pty_spawn` の解決後なので、invoke が in-flight の間に呼ばれると漏れる `[M11]`
- **`TerminalTab` がアンマウント時に自分の PTY を殺さない**（`src/components/TerminalTab.tsx`）: 起動 effect の cleanup（`disposed = true; term.dispose()`）は `ptyIdRef.current` を kill しない。プロセスの寿命は台帳（`ptyId` 経由）に一本化してあるため、`spawn` の解決と台帳への反映の隙間で閉じられると取りこぼす。ただし `src/fs/pty.ts` の `live` に載るのでアプリ終了時には必ず回収され、facet 終了後に `claude` が残る経路はない（5経路すべてを追って確認済み）。cleanup で `ptyIdRef.current` を殺せばこの狭いレースも消える `[M11]`
- **実行中のタブが無いフォルダ切替では `closeAll` を通らない**（`src/App.tsx`）: `openFolder` は `hasRunning(terminals)` が false のとき確認ダイアログを出さず `controller.openFolder(dir)` だけ呼んで返る。`hasRunning` は「実行中」しか見ないため、`exited` / `failed` のタブが旧フォルダの残骸として画面に残る。プロセスは既に無いので実害は表示だけ `[M11]`
- **`pty_write` が Mutex を保持したままブロッキング書き込みをする**（`src-tauri/src/pty.rs`）: `pty_write` は `state.sessions.lock()` を握ったまま `writer.write_all` / `flush` を呼ぶ。同じロックを取る `pty_kill` も待たされる——詰まった端末を殺せなくなる、という形で出る。キー入力程度のデータ量では問題にならないが、複数タブ運用時の設計上の留意点 `[M11]`
- **`domain`（責任境界）が問いの導出に一切関与していない**（`schemas/sequence.schema.json` / `src/modules/sequence/layout.ts`）: design-notes 論点3 の当初構想では境界跨ぎが問いの導出に効くはずだったが、「`ifExecuted` は境界に関係なく常に立つ」と決めたため、論点4 が「**境界は問いの導出に一切関与しない**」と明記している。現在 `domain` は rev 2章の一行を裏切らないためだけに残る属性で、M3 の出力にも出していない。**UML のシーケンス図に「境界」という標準概念は無い**（スイムレーンはアクティビティ図）。存置するか廃止するかを決めること `[sequence-m3]`
- **`describeSequenceIssueEffect` の `to-mismatch` 分岐が2条件を1つの説明文に束ねている**（`src/modules/sequence/markdown.ts`）: `to-mismatch` は「`self` に余分な `to`」と「非 `self` に `to` が無い」の2条件を1つの rule 名に束ねており、確認文はどちらでも「図には『（未解決）』という参加者が立ち、宛先を引けない矢印はそこへ向きます」と言う。**前者だけのファイルでは実際は（未解決）は1つも出ない。** また `missing-actor` が `from` 側だけのときも同じ文言が「宛先」と言うが、実際に（未解決）になるのは**送り手**の方である。到達性は低い（`setStepShape` が self 化のとき `to` を落とすため UI からは作れず、外部編集ファイル限定）。根治は rule を2つに割るか `describeIssueEffect` に data を渡す設計変更で、`markdown.test.ts` の「to-mismatch でも同じ説明になる」がこの粗い近似を固定している。M3 のスコープ外として繰り越し `[sequence-m3]`
- **同期は「消せない要素があっても続ける」ので、置いた Skill が同梱物と一致している保証が best-effort に落ちた**（`src/core/skill-sync.ts`）: 置き直しの削除は直下の要素ごとに `try/catch` で握りつぶす（1つ消せないだけで Skill 全体を失う——`#43` と同型の永続破壊——を避けるため。mac の `.DS_Store` で実際に起きる）。代償として、**新しい版の Skill が消したはずの古いファイルが残り続ける経路ができた**。残骸は同名なら次の書き込みが上書きするが、名前が変わった旧スクリプトは残り、AI が古い手順書・古いスクリプトを読む余地がある。`console.warn` に「消せませんでした」と出るだけで**画面には何も出ない**（トーストに上げない判断は意図的——`.DS_Store` が消せないのは mac では正常なので、実バグと同じ文言で驚かせない）。**Skill からファイルを消す／改名する改訂を出すときに踏む** `[sequence-m4]`
- **同期のたびに `package-lock.json` は消えるが `node_modules` は残る**（`src/core/skill-sync.ts`）: 削除の保護対象は `node_modules` だけなので、`package-lock.json` は同期のたびに消える。同梱物に入っていれば置き直されるが、**`.gitignore` の対象なのでクリーンなチェックアウトからビルドすると同梱物に入らない**——`node_modules` だけが残って lock が消えた状態で `npm install` すると、ロックを見ずに解決し直す（`ajv` の版が黙って動きうる）。あわせて、**同梱物から `.gitignore` を除外している**ため、置いた先で `npm install` すると**利用者のリポジトリに未追跡の `node_modules` が数千ファイル現れる**（`git status` が使い物にならなくなる、という形で出る）。どちらも「同梱物として何を置き、何を消してよいか」の表を1つ直せば塞がる `[sequence-m4]`
- **`sequence` スキーマに `notes` 相当が無く、`failures` を空にした理由がファイルに残らない**（`schemas/sequence.schema.json`）: エラーカタログは「なぜ空にしたか」を `notes` に逃がせるが、シーケンスは逃がせない。登録 Skill は**報告文で伝える**運用にしたので、**会話が流れた時点で理由は失われる**——後からファイルを見た人には「未定義」と「未定義でよいと判断した」の区別が付かない。スキーマ改訂＋マイグレータを伴うため、設計スペックは「不便が実感されてから」と条件を付けている `[sequence-m4]`

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
- **「図を作る」→「失敗考慮を打つ」の二段階ワークフローと `Tab` の2ゾーン化**（`src/modules/sequence/SequenceEditor.tsx`）: 骨格（from/to/種別/ラベル）を打ち切ってからガターの答えを埋め直す使い方が多く観察された。`Tab` を骨格ゾーン→答えゾーンの2ゾーンに分けられると自然という提案。**答えへのキーボード到達は必須のまま崩さないこと。** 詳細は同「観察」⑤ `[sequence-m1]`

## 小さな負債

- **`TerminalTab` の根 div が `flex` と `hidden` を同時に出している**（`src/components/TerminalTab.tsx`）: `className={`flex min-h-0 flex-1 flex-col ${hidden ? 'hidden' : ''}`}` は非表示時に `flex` と `hidden` の両クラスを同時に持つ。`src/App.tsx` は同じ問題を三項（`` `${paneOpen ? 'flex' : 'hidden'} ...` ``）で避けており、「display は排他なので三項で切り替える（`hidden` と `flex` を並べてもどちらが勝つかは出力順まかせになる）」というコメントまで書いてある。`TerminalTab` はその警告どおりの形になっており、いまは Tailwind の出力順で `hidden` が勝って動いているだけ `[M11]`
- **用語テーブルの `<th>` に `sticky` と `relative` が同時に付いている**（`src/modules/glossary/GlossaryEditor.tsx`）: どちらも `position` なので、カラム名が固定されているのは Tailwind が `sticky` を `relative` より後に出力しているからにすぎない。`sticky` 自体が絶対配置の包含ブロックになる（列幅ハンドルはそれに乗っている）ので `relative` は不要。**出力順が変わると固定が静かに外れ、原因は読み手に自明でない** `[M8]`
- **エディタのキー処理が用語集とエラーカタログで二重化している**（`GlossaryEditor.tsx` / `ErrorCatalogEditor.tsx`）: `runCommand` の switch・`onCellKeyDown`・`textFieldContext`・セルの面のクラス定数（計 約80行）がほぼ同一。M10 は意図的に複製した——いま抽象を決めても、3本目（ロジックツリーは列を持たない図系）が必要とする形と一致する保証がないため（M9 決定1が万能フックを退けたのと同じ理由）。**3本目が列を持つツール（状態遷移の遷移表など）だったら、その時点で引き上げる。** 判断材料は「2本の差が3点（プロファイルトグル・列幅ストア2本・吸収列）に収まっているか」 `[M10]`
- **キャンバスの土台が logic-tree と sequence で丸ごと複製されている**（`src/modules/sequence/viewport.ts` / `viewport.test.ts` / `useViewport.ts` / `useViewport.dom.test.tsx` / `seq-font.ts`、および `measure.ts` の折り返しアルゴリズム）: sequence M1 の scope が「一般化は2本目完成後の別マイルストーンで判断する」と定めた**意図的な複製**で、各ファイルの先頭にその旨のコメントがある。**2本目が完成したので、判断の材料は揃った**——ツリー（再帰の Reingold–Tilford 型）とシーケンス（X も Y も単純な積み上げ）でレイアウト関数の性質は大きく違うが、**その下のビューポート・測定・フォント読み取りは差が無い**（`viewport.ts` は先頭コメント3行以外 diff ゼロ）。`core/canvas` へ引き上げるかを別マイルストーンで決めること。**それまでは差分を作らない。直すときは両方を直す。** なお logic-tree 側の既知の穴（モーダル中もホイール／ドラッグが生きている・ドラッグ中のアンマウントでリスナーが残る・`FOLLOW_MARGIN` の 8px ずれ）は、**この複製によってそのまま2本に増えている** `[sequence-m1]`
- **`focusSibling` が `commands.ts` の `siblingsOf` と同一の式**（`src/modules/logic-tree/LogicTreeEditor.tsx`）: 「次の写経で3本目が生える」。`export` 1行で潰せるうちに記録を残す `[logic-tree-m1]`
- **エラー登録 Skill の同梱スクリプトが、警告判定・ラベル文言・整合性検証をアプリと複製している**（`.claude/skills/error-catalog-register/scripts/error-catalog-write.mjs` の `isWarn` / `LEVEL_LABEL` / `ACTION_LABEL` / 整合性検証の3ルール）: それぞれ `src/modules/error-catalog/warnings.ts` の `isWarnCell`・`resolution-labels.ts` の `RESOLUTION_LABELS`・`fields.ts` の `FIELD_LABELS`・`consistency.ts` の `checkErrorCatalogConsistency` と、条件・文言が1対1で一致するよう手で複製している。Skill とアプリの接点はファイル（正規形）だけという設計上の決定の帰結で、構造的に避けられない。**`schemas/error-catalog.schema.json` の `resolutionLevel` enum を改訂するときは、この2箇所を両方追従させること。** 追従漏れがあっても双方は独立に動くため、テストでは検知されない `[Skill]`
- **Mermaid の正規化関数がモジュール内にある**（`src/modules/sequence/mermaid.ts`）: design-notes 論点11 は「先に出力を実装した側が正規化関数を1本立て、後発がそれに乗る」としている。logic-tree の出力を作るときに `core/mermaid.ts` へ引き上げること。`markdown-table.ts` が用語集→コアと辿った道と同じ `[sequence-m3]`
- **`palette-fit.mjs` が Node の型ストリップに依存している**（`.claude/skills/palette-retheme/scripts/`）: `.mjs` から `src/styles/contrast.ts` を直接 import しており、型ストリップが unflagged な Node が要る（22.18+ / 23.6+ / 24+。23.0〜23.5 はフラグ無しでは動かない。検証したのは v22.20.0）。また `contrast.ts` に `enum` やコンストラクタのパラメータプロパティを書くと**消去できない構文**として落ちる（型注釈・`interface`・`type` は問題ない）。ロジックを複製しないための選択で、複製との比較では正しいが、**依存が Node のバージョンと構文の制約という見えにくい形で残っている**。**同じ依存が `sequence-register` にもある**（`.claude/skills/sequence-register/scripts/sequence-write.mjs` が同ディレクトリの `questions.ts` / `canonical.ts` を import する）。ただし**こちらには機械検査が付いている**——コピーがアプリの `src/modules/sequence/questions.ts` / `src/core/canonical.ts` とバイト一致していること・値 import を持たないことを `src/modules/sequence/skill-copy.test.ts` が検査する。したがって、**コピーが元とズレたときも、元に消去できない構文（`enum` 等）が生えたときも、テストが赤くなる。** `palette-fit.mjs` 側にはこの検査が無く、`contrast.ts` に `enum` が生えても気づく機構がない `[Skill]`
- **既存2本の Skill が `reorder` / `deref`（正規形の書き出し）を手で複製したままである**（`.claude/skills/glossary-term-register/scripts/glossary-write.mjs` / `.claude/skills/error-catalog-register/scripts/error-catalog-write.mjs`）: `sequence-register` は `src/core/canonical.ts` のバイト一致コピー＋一致検査に寄せたので、**同じ正規形を作る実装が3本の Skill で2方式に分かれている**。`canonical.ts` を改訂したとき、赤くなるのは sequence 側だけで、既存2本は**黙って古い正規形を書き続ける**（正規形のズレはアプリが開いて保存した瞬間に diff として現れる。rev 5章が「プロジェクト最大のリスク箇所」と呼んでいる場所）。次にあの2本へ触る機会にコピー方式へ揃える `[sequence-m4]`
