# 残件

Claude が着手できる項目の一覧。解消したら消す。人間の作業（実機確認・署名鍵・配布・仕様の裁定）は載せない。

## テストが無い箇所

- **`FLUSH_MAX_ROUNDS` の打ち切りパスに直接テストが無い**（`src/core/autosave.ts`）。戻り値は安全側の false なので実害は小さい。
- **`fileExists` に専用の単体テストが無い**（`src/fs/project-fs.ts`）。`exists` への1行委譲で、意味のある挙動は他のテストが押さえている。
- **`ChoiceDialog` のオーバーレイクリックのテストが無い**（`src/components/ChoiceDialog.tsx`）。`onOpenChange` を渡さない実装で閉じないことは構造的に担保されるが、直接のテストはない。
- **二重に `pty_kill` しても無害であることを踏む Rust テストが無い**（`src-tauri/src/pty.rs`）。`TerminalTab` のアンマウント時 kill がこの性質に依存している。
- **課題ツリーの構造編集関数の一部に直接のテストがない**（`src/modules/issue-tree/commands.ts`）。ロジックツリーから移植した関数が対象。
- **`poseQuestions` の並び契約を突くテストがない**（`src/modules/issue-tree/derive.ts`）。「戻り値は入力と同じ添字で並ぶ」という契約は ID 重複ファイルで必要になる。
- **`issue-tree-register` に evals が無い**（`.claude/skills/issue-tree-register/`）。他4つの登録 Skill は evals ディレクトリを持つ。
- **`reading-guide.md` の Skill 名一覧を縛るテストが無い**（`src/core/reading-guide.test.ts`）。Skill を足したとき一覧の更新を忘れても緑のまま通る。
- **`logic-tree-register` の evals は実行ハーネスに掛けていない**（`.claude/skills/logic-tree-register/evals/`）。`evals.json` と `grade.mjs` はあるが、npm スクリプトからも CI からも呼ばれていない。
- **`.gitattributes` 欠落の警告が「整合性の警告」の見出しの下に出る**（`.claude/skills/logic-tree-register/scripts/logic-tree-write.mjs`）。整合性の警告とは別種の警告が同じ見出しに混ざる。
- **smoke テストが子プロセスの `stdio` を指定していない**（`src/modules/logic-tree/skill-write.smoke.test.ts`）。意図的なエラーケースの stderr が緑の実行でも画面に出る。
- **`logic-tree-write.mjs` の exit 2 の経路とスキーマの解決順が未テスト**（`.claude/skills/logic-tree-register/scripts/logic-tree-write.mjs`）。
- **`ink-faint` をアクティブな本文に使っていないことを機械検査していない**（`src/styles/conventions.test.ts`）。WCAG 1.4.3 の免除範囲に収まる前提が崩れても検知できない。
- **schemaVersion の移行を読み込み時以外の経路で見るテストが無い**（`src/core/load.ts`）。自動保存など他の経路は未検証。
- **`invalid` の見せ方に DOM テストが無い**（`src/modules/issue-tree/HypothesisRow.tsx`）。
- **`<Button>` の variant を見る正規表現が属性値の `>` で早期に閉じる**（`src/styles/conventions.test.ts`）。`title={a > b ? …}` のような属性があると誤判定しうる。
- **欠落の帯そのものに DOM テストが無い3モジュールがある**（`src/modules/glossary/GlossaryEditor.tsx`, `src/modules/error-catalog/ErrorCatalogEditor.tsx`, `src/modules/logic-tree/LogicTreeEditor.tsx`）。
- **エクスプローラからのドロップにテストが1本も無い**（`src/fs/drag-drop.ts`）。`App.dom.test.tsx` はこの経路をモックしている。
- **`load.test.ts` の「旧版 → editable」のテストが空配列フィクスチャのまま**（`src/core/load.test.ts`）。移行後のフィールド中身は検証していない。
- **`today.test.ts` の「引数省略」のテストが理論上フレークしうる**（`src/core/today.test.ts`）。`todayString()` と `todayString(new Date())` を別々の時刻で評価している。
- **`ensureVisible` の統合を見るテストが課題ツリーに無い**（`src/modules/issue-tree/IssueTreeEditor.tsx`）。`panIntoView` 自体のテストはあるが、呼び出し側の統合は未検証。
- **判断バッジのトリガーのキーボード経路に DOM テストが無い**（`src/modules/issue-tree/IssueTreeEditor.tsx` の `KindMenu`）。

## 将来の機能を作った瞬間に踏むもの

- **`ensureFileOfType` は将来のインライン登録と競合する**（`src/core/app-controller.ts`）。内部の `rescan()` が二択と噛み合わない構造。
- **表記ゆれ検知の対象フィールドパスを宣言する規約が `ToolModule` に無い**（`src/core/registry.ts`）。用語集だけがハードコードで持つ。
- **`gen-types.mjs` はスキーマが減っても対応する型ファイルを消さない**（`scripts/gen-types.mjs`）。
- **ロジックツリーのエッジに矢印を描いていない**（`src/modules/logic-tree/TreeEdges.tsx`）。
- **`KeyHints` の `key={hint.keys}` は同じ文字列が2件あると衝突する**（`src/components/KeyHints.tsx`）。
- **シーケンスのゾーン機能が未着手**（`schemas/sequence.schema.json`）。
- **フォーカスモードが未実装**（`src/modules/issue-tree/`）。選択サブツリー以外を薄くする表示は設計ノートにあるだけ。
- **課題ツリーに Markdown 出力が無い**（`src/modules/issue-tree/module.ts` の `outputs: []`）。

## 挙動の穴

- **「選択中の課題」と「最後に触った課題」の2概念が並ぶ**（`src/modules/issue-tree/IssueTreeEditor.tsx`）。箱の追加ボタンと帯の追加ボタンで足す先が変わる。
- **`closeCurrentFile` の尻尾が古いまま実行される interleaving が残る**（`src/core/app-controller.ts`）。flush 待ち中の選択変更で古い内容が後から書かれる余地がある。
- **削除前に飛んだ flush が消えたファイルを復活させうる**（`src/core/app-controller.ts`）。`handleSelectedGone` は意図して flush しないが、直前の flush がそれを迂回する。
- **ロジックツリーにマウスだけでノードを増やす動線が無い**（`src/modules/logic-tree/LogicTreeEditor.tsx`）。追加は `Enter`/`Tab` のキーだけ。
- **サイドメニューを畳むとフォルダのパスが読めない**（`src/components/FileList.tsx`）。畳んだ状態を確かめる手段が画面に無い。
- **サイドメニューのパスをコピーすると先頭に不可視文字が付く**（`src/components/FileList.tsx`）。表示用の LTR マークがコピー時にも付いてくる。
- **`layout.totalHeight` が図の実際の一番下を表さない**（`src/modules/sequence/layout.ts`）。「末尾にステップを追加」ボタンの位置がずれる。
- **`replyTo` が無く、`reply` 行の説明が一般文言になる**（`schemas/sequence.schema.json`）。応答と呼出の対応を持たない。
- **`reply` 行の一般文言の高さがガターの行高計算に入らない**（`src/modules/sequence/layout.ts`）。
- **`GhostSlot` の ✕ が `layout.totalWidth` の外に約26pxはみ出す**（`src/modules/sequence/GhostSlot.tsx`）。
- **起動時の自動復元後のフォルダ走査失敗が `io` バナーで出る**（`src/core/app-controller.ts`）。復元自体の3つの失敗点は握りつぶすが、その先は握りつぶさない非対称。
- **`resolveCommand` に細かい非対称が残る**（`src/core/keyboard/keymap.ts`）。macOS の `Ctrl+Backspace` と `Alt+Shift+↑↓` の扱いが揃っていない。
- **ID 重複ファイルで親ノードが先頭の1つにだけ付く**（`src/core/canvas/flat-tree.ts`）。木の形が想定と違って見える理由が画面から読めない。
- **ドラッグ中にアンマウントすると d3 の window リスナーが残る**（`src/core/canvas/use-viewport.ts`）。
- **`FOLLOW_MARGIN`(48) が `CANVAS_MARGIN`(40) より大きく初回の追従が8pxずれる**（`src/core/canvas/use-viewport.ts`）。
- **ペインが壁に当たった状態で広げると記憶している幅が縮む**（`src/core/column-resize.ts`）。
- **`pty_write` が同期のままで詰まるとUIごと止まる**（`src-tauri/src/pty.rs`）。
- **起動待ちの入力の待ち行列に上限が無い**（`src/components/TerminalTab.tsx` の `pendingRef`）。
- **`describeSequenceIssueEffect` が2条件を1つの説明文に束ねる**（`src/modules/sequence/markdown.ts`）。`to-mismatch` の中身が読み手に伝わらない。
- **一覧の並び順が漢字の `title` では画面から説明できない**（`src/core/file-grouping.ts`）。`localeCompare('ja')` 順は五十音順ではない。
- **`README-for-AI.md` はプロジェクト固有に聞こえない質問には効かない**（`src/core/reading-guide.md`）。AI がフォルダを読みに行かない場面がある。
- **Skill 同梱の一致保証が best-effort に落ちている**（`src/core/skill-sync.ts`）。置き直しの削除が要素ごとに try/catch で握りつぶす。
- **`bundle.resources` が `evals/` も `node_modules` も除外できない**（`src-tauri/tauri.conf.json`）。tauri のバンドラがパターン除外に対応していない。
- **MSI が作れない**（`src-tauri/tauri.conf.json`）。WiX の `light.exe` がコードページ1252に無い文字を拒否するため対象外にしている。
- **`sequence` スキーマに `notes` 相当が無い**（`schemas/sequence.schema.json`）。`failures` を空にした理由を残す場所が無い。
- **課題の見送りにキーボード経路が無い**（`src/modules/issue-tree/IssueTreeEditor.tsx`）。
- **`moveHypothesis` が課題をまたげず、どの動線からも呼ばれていない**（`src/modules/issue-tree/commands.ts`）。
- **ID 重複ファイルで同じ仮説の行がどちらの箱にも描かれる**（`src/modules/issue-tree/layout.ts`）。
- **「課題を追加」ボタンが配列末尾を狙う**（`src/modules/issue-tree/IssueTreeEditor.tsx`）。循環を含むファイルでは描かれない課題を作りうる。
- **`issue-tree-write.mjs` が配列順を整えない**（`.claude/skills/issue-tree-register/scripts/issue-tree-write.mjs`）。アプリが開くだけでも順序は整わない。
- **`listOpenTargets` の除外が課題側と仮説側で非対称**（`src/modules/issue-tree/open-targets.ts`）。循環で到達できない課題のチップが押しても反応しない。
- **`load.ts` が非整数・1未満の schemaVersion も旧版として移行経路に入れる**（`src/core/load.ts`）。
- **`IssueBanner` から該当行へのジャンプが無い**（`src/components/IssueBanner.tsx`）。メッセージは行を指すが押しても飛ばない。
- **欠落ジャンプが4モジュールで巡回 ref に頼る**（`src/modules/glossary/GlossaryEditor.tsx`, `src/modules/error-catalog/ErrorCatalogEditor.tsx`, `src/modules/logic-tree/LogicTreeEditor.tsx`, `src/modules/sequence/SequenceEditor.tsx`（`jumpAt`））。フォーカス位置を起点にしない。
- **名前が空のアクターを面だけの空チップで示す**（`src/modules/sequence/ActorRefCell.tsx`）。視認性が低い。
- **エラーカタログの集計は全行対象だがジャンプは表示中の行だけに飛ぶ**（`src/modules/error-catalog/ErrorCatalogEditor.tsx`）。
- **エラーカタログの読み手（プロファイル）が3箇所で別々に選ばれる**（`src/modules/error-catalog/ErrorCatalogEditor.tsx`）。
- **Miro 書き出しのノード幅が概算でフォントが変わると折り返す**（`src/modules/logic-tree/miro-export.ts`）。
- **循環で根から到達できないノードが Miro・Markdown・表の出力から警告なく落ちる**（`src/modules/logic-tree/miro-export.ts`, `src/modules/logic-tree/markdown.ts`, `src/modules/logic-tree/table.ts`）。
- **表に貼ると `=`／`+`／`-`／`@` で始まるセルが数式として実行されうる**（`src/core/table-tsv.ts`, `src/core/table-html.ts`）。CSV/TSV インジェクション。
- **`readClipboardText` が空と失敗を区別せず空文字に潰す**（`src/fs/clipboard.ts`）。
- **起動時の貼り付けが bracketed paste mode と静穏の両方を待つ設計のまま**（`src/components/TerminalTab.tsx`）。`INSERTION_QUIET_MS` は1環境でしか確認していない。
- **存在しない `ask` を指す FB を整合性検証が見ていない**（`src/modules/issue-tree/consistency.ts`）。
- **`date` が「いつ言われたか」を保証しない**（`src/modules/issue-tree/commands.ts`）。アプリが刻むのは追記した日。
- **仮説と FB の並び替え、および挿入位置の指定手段が無い**（`src/modules/issue-tree/commands.ts`）。
- **別種のチップを押すときの挿入起点が問いの欄でだけ列の先頭へ落ちる**（`src/modules/issue-tree/IssueTreeEditor.tsx`）。
- **「保留」の語が経緯の残らない列の上に乗る**（`schemas/issue-tree.schema.json` の `judgementEvent.kind`）。判断が差し替え式になり、保留にした経緯がデータに残らない。

## 性能

- **編集1打鍵ごとに全ファイルの `checkConsistency` を再実行している**（`src/core/project-file.ts`）。規模が増えたら選択中ファイルだけの差分計算に変える。
- **textarea の高さ計算が強制リフローを起こす**（`src/components/CellInput.tsx`）。`rows=1` に戻して `scrollHeight` を読む。
- **ノードの測定結果キャッシュが上限で全消しになる**（`src/modules/logic-tree/LogicTreeEditor.tsx`）。LRU ではなく `cache.clear()`。
- **`lastCell` が state のためセルにフォーカスが移るたびエディタ全体が再描画される**（`src/modules/issue-tree/IssueTreeEditor.tsx`）。

## アクセシビリティ

- **課題ノードを展開するキーボード経路が無い**（`src/modules/issue-tree/IssueBox.tsx`）。クリックでの選択しか動線が無い。
- **列幅ハンドルが `aria-valuenow`/`aria-valuemin`/`aria-valuemax` を持たない**（`src/core/column-resize.ts`）。
- **帯のチップの `aria-label` が見えているラベルを含まない**（`src/modules/issue-tree/IssueTreeEditor.tsx`）。
- **シーケンスの答えスロットの `aria-label` に状態の語が含まれない**（`src/modules/sequence/GutterSlot.tsx`）。未回答・考慮不要などが読み上げに出ない。

## デザイン

- **方眼背景がキャンバスのズームに追従しない**（`src/modules/logic-tree/LogicTreeEditor.tsx`）。
- **`Tab` を骨格ゾーンと答えゾーンの2つに分ける提案が未実装**（`src/modules/sequence/SequenceEditor.tsx`）。答えへのキーボード到達は崩さないことが条件。
- **展開中の仮説が課題の列全体を押し広げ、深い木で横スクロールが増える**（`src/modules/issue-tree/layout.ts`）。

## 小さな負債

- **`buttonBase` がまだ `disabled:opacity-50` を持っている**（`src/components/button-styles.ts`）。
- **配布物にサードパーティのライセンス表記が同梱されていない**（`src-tauri/tauri.conf.json`）。`THIRD-PARTY-NOTICES.md` はリポジトリにあるが `bundle.resources` に無い。
- **用語集の別名バッジが `Badge` コンポーネントに寄せられていない**（`src/modules/glossary/AliasCell.tsx`）。手書きの `<span>` のまま。
- **表記ゆれ「指摘」の波線下線が規約に書いただけで実装が無い**（rev 9章 無効軸）。
- **`FileList.dom.test.tsx` のコメントが古い**（`src/components/FileList.dom.test.tsx`）。ボタンラベルの「＋」はアイコンに変わった。
- **`TerminalTab` の根 div が `flex` と `hidden` を同時に出している**（`src/components/TerminalTab.tsx`）。
- **用語テーブルの `<th>` に `sticky` と `relative` が同時に付いている**（`src/modules/glossary/GlossaryEditor.tsx`）。
- **エディタのキー処理が用語集とエラーカタログで二重化している**（`src/modules/glossary/GlossaryEditor.tsx`, `src/modules/error-catalog/ErrorCatalogEditor.tsx`）。
- **`focusSibling` が `siblingsOf` と同一の式を持つ**（`src/modules/logic-tree/LogicTreeEditor.tsx`）。次の写経で3本目が生える形。
- **`palette-fit.mjs` が Node の型ストリップに依存している**（`.claude/skills/palette-retheme/scripts/palette-fit.mjs`）。`.ts` を直接 import している。
- **`layoutIssueTree` の doc に不変条件が書かれていない**（`src/modules/issue-tree/layout.ts`）。
- **`sequence.schema.json` の `failures` の description が画面の語彙と揃っていない**（`schemas/sequence.schema.json`）。「未定義」のままで、画面・Skill が使う「未回答」に更新されていない。
- **シーケンスの「未記入」判定が複数ファイルに散在している**（`src/modules/sequence/missing.ts`, `src/modules/sequence/ActorRefCell.tsx`）。
- **幾何の primitive が2ファイルに分かれ互いに無関係**（`src/core/canvas/viewport.ts` の `Rect`, `src/core/canvas/tree-layout.ts` の `Point`）。
- **Miro のクリップボード形式が非公開で Miro 側の変更で壊れうる**（`src/modules/logic-tree/miro-codec.ts`）。
- **`escapeMermaidLabel` の re-export を参照する本番コードが無い**（`src/modules/sequence/mermaid.ts`）。
- **端末の配色が `palette.css` の `.dark` クラスセレクタに依存している**（`src/components/TerminalTab.tsx`）。
- **「（未定義）」の文言が4箇所で複製されている**（`src/core/table-export.ts`, `src/modules/error-catalog/markdown.ts`, `src/modules/glossary/markdown.ts`, `src/modules/logic-tree/markdown.ts`）。
- **「どの問いにも紐づかない FB」ブロックの固定文が編集できない**（`src/modules/issue-tree/AskBlock.tsx`）。
- **アクセシブル名の動詞が仮説だけ「削除」、FB・問いは「消す」で不揃い**（`src/modules/issue-tree/HypothesisPanel.tsx`, `src/modules/issue-tree/AskBlock.tsx`）。
- **`.add`（節末の追加ボタン）の面クラスが2ファイルに逐語で複製されている**（`src/modules/issue-tree/HypothesisPanel.tsx`, `src/modules/issue-tree/IssueTreeEditor.tsx`）。
- **`solutionLabelH = max(labelH, TRASH_ICON_SIZE)` の分岐が現在の書体では選ばれない**（`src/modules/issue-tree/layout.ts`）。
- **課題ツリーの追加ボタンで見える文字とアクセシブル名が割れている**（`src/modules/issue-tree/HypothesisPanel.tsx`）。見える文字は「追加」、読み上げは「足す」と「追加」に分かれる。
- **`ACTION_INSET_X` に読み手が1人もいない**（`src/modules/issue-tree/measure.ts`）。定義しか無く参照されていない。
- **畳まれた仮説行の文言だけ書体クラスを定数から引かず直書きしている**（`src/modules/issue-tree/HypothesisRow.tsx`）。
- **`docs/issue-tree/仮説検証モジュール-設計ノート.md`（71KB）の圧縮**。決着済みの論点や古い検討過程が残り、参照コストが高い。
