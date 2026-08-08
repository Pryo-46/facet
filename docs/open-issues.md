# 開いている残件

> **生きた文書。編集して増減させる。** 解消したものは**消す**（消したこと自体は、そのマイルストーンの [`history/`](history/) に残る）。
>
> ここに載るのは「**いつでもよいが、忘れると実害化するもの**」。いま着手すべきものはマイルストーンの計画に入れる。マイルストーン完了時にこのファイルを更新するのは義務（[`../CLAUDE.md`](../CLAUDE.md) 参照）。
>
> 最終更新: M7 完了時点（2026-08-09）

各項目の末尾の `[MN]` は**最初に記録されたマイルストーン**。長く開いているものほど「踏まないから残っている」のか「踏むけど後回しにしている」のかを見分ける手がかりになる。

## テストが無い箇所

- **interleaving を要する3分岐にテストが無い**（`src/core/app-controller.ts`）: `rescan` の `switchingFolder > 0` ガード（フォルダ切替中に届いた旧フォルダのイベントが新しい一覧を上書きする）、`rescan` の `token !== scanSeq || projectDir !== dir` ガード（遅れて着地した古い走査結果が新しい一覧を上書きする）、`handleSelectedGone` の `selectSeq++`（進行中の `selectFile` が着地して消えたファイルを選び直す）。**コントローラは I/O を注入しているので `io.scan` に手動 Promise を挟めば書ける。** この層に触るときの宿題 `[M6]`
- **`currentDocument()` の「未選択」分岐を明示的に踏むテストが無い**（`src/core/app-controller.ts`）。「編集中データなし」分岐と観測が重なる `[M6]`
- **`FLUSH_MAX_ROUNDS` の打ち切りパスに直接テストが無い**（`src/core/autosave.ts`）。戻り値は安全側の false なので後回し可 `[M5]`
- **`fileExists` に専用の単体テストが無い**（`src/fs/project-fs.ts`）。`exists` への1行委譲で、意味のある挙動は `file-ops.test.ts` が押さえている `[M5]`
- **`ChoiceDialog` のオーバーレイクリックのテストが無い**。`onOpenChange` を渡さないことで構造的に担保され、同じ機構を Esc のテストが固定している `[M5]`

## 将来の機能を作った瞬間に踏むもの

- **`ensureFileOfType` は将来のインライン登録から呼ぶと二択と競合する**（`src/core/app-controller.ts`）: 内部で `rescan()` を回すので、`ask` が出た直後に `selectFile` で選択を移してしまい、回答が「選択が変わったため書き戻しませんでした」に倒れる。今日は「用語集を作る」ボタンが空状態（未選択時）にしか出ないので到達不能だが、**インライン登録を実装した時点で踏む**（[`history/m4-core-file-operations.md`](history/m4-core-file-operations.md) の `ensureFileOfType` に関する項と併せて読むこと） `[M6]`
- **`file-naming.ts` の `ILLEGAL` が Windows の予約デバイス名（CON/PRN/AUX/NUL/COM1-9/LPT1-9）と末尾のドット・空白を弾かない**: 現状 `module.displayName` しか渡らないため実害は無い。**ユーザー入力（ファイル名の指定・リネーム UI）が直接届くようになった時点で塞ぐこと** `[M4]`
- **`### ${kindLabel(kind)}` の見出しがエスケープを通らない**（`src/modules/glossary/markdown.ts`）: 現状 `kind` はスキーマ検証済みの enum 値しか来ないので実害は無い（enum 拡張時に生値が見出しへ出る経路としてのみ残る） `[M6]`
- **定義セル・種別セルが `mark(index, field)` を参照していない**（`src/modules/glossary/GlossaryEditor.tsx`）。これらを指す検証ルールが増えた時点で、issue 一覧には出るのにセルが赤くならない `[M3]`

## 挙動の穴（実害は小さいが残っている）

- **`exportMarkdown` は保存ダイアログを開いている間のデータ変化を拾わない**（`src/core/app-controller.ts`）: `doc.data` はダイアログを出す前のスナップショット。ネイティブダイアログが開いている数秒〜数分の間に外部変更の取り込みが走ると、書き出される Markdown は取り込み前の内容になる。書き出し先は新規パスなのでデータ喪失にはならない `[M6]`
- **`dropModal` の対象に `delete:<path>` が入っていない**（`src/core/app-controller.ts`）: 外部でファイルが消えた後に古い削除確認を確定すると、`trashFile` が失敗して「ファイルを削除できませんでした」が出る `[M6]`
- **選択中でないファイルが外部変更でスキーマ違反になっても「外部の変更を読み込みました」と出る**（赤バッジは出るので致命的ではない） `[M5]`
- **`move_to_trash` が同期コマンドなので、削除中はウィンドウが固まる**（`src-tauri/src/lib.rs`）: Tauri v2 は `async` でないコマンドをメインスレッド上で実行する。`trash::delete` は Windows ではシェルのファイル操作 API を通るため、ゴミ箱の管理情報の更新・ネットワークパス・Defender のスキャンで実時間がかかりうる。直し方は `async fn` にするか `tauri::async_runtime::spawn_blocking` で包むかの二択で、**`trash` クレートは呼び出しごとに自前で COM を初期化するのでワーカースレッドで問題ない** `[M4]`
- **`resolveCommand` の細かい非対称**（`src/core/keyboard/keymap.ts`）: macOS の `Ctrl+Backspace`（主修飾キーは Cmd なので素の Backspace として通る）と `Alt+Shift+↑↓`（`altKey` を先に見るため並び替えになる） `[M3]`
- **`CellInput` の `caretAtStart` / `caretAtEnd` は完全に collapsed なキャレットのみ true**（`src/components/CellInput.tsx`）。選択範囲があると行間移動に1打鍵余分に要る（Excel 等と同じ挙動でもある） `[M3]`

## 性能

- **編集1打鍵ごとに全ファイルの `checkConsistency` を再実行している**: 数百レコード規模では問題ないが、規模が増えたら選択中ファイルだけの差分計算に変える `[M2]`

## アクセシビリティ

- **`FileList` の行ボタンのアクセシブル名が「`<名前>` を開く」で固定**（`src/components/FileList.tsx`）: スクリーンリーダーには `title`・「開けない」「編集不可」・issue 件数バッジが読まれない。`aria-describedby` で補うのが筋 `[M4]`

## デザイン

- **`warning` と `ok` が P型・D型色覚で識別できない**（`src/styles/palette.css`）: 採用した Basalt 由来の配色は、OKLab の色差が標準色覚で 0.151 / P型 0.050 / D型 0.041（ライト）。0.10 を下回ると「同じ色の濃淡」に見え始める。**色を差し替えるときに、青緑側（`oklch(0.470 0.075 168)` 付近）へ振る案を再検討すること。** `palette.test.ts` がこの数字を毎回出力するが、意図的に失敗させていない（設計スペック 決定4） `[M7]`
- **`ok` がどのコンポーネントからも参照されていない**（`src/styles/palette.css`）: rev 9章の3系統として定義とテストはあるが、facet の画面に「確定・応答」を色で示す箇所がまだ無い（トーストは種別を持たない）。**成功トーストなどを作った時点で使う** `[M7]`
- **方眼紙背景が未実装**（rev 9章「確定要素」）: `grid` トークンは定義済みで、`bg-grid` も生えているが、背景を敷く実装が無い `[M7]`
- **ライトで `canvas` と `surface` の差がほぼ無い**（`src/styles/palette.css`）: L差 0.04（1.13:1）しかなく、実機確認では左のファイル一覧とメイン領域が罫線でしか分かれていないように見えた。M7 はトークンの**値**だけを決めており、どこに何を塗るかはスコープ外 `[M7]`
- **ダークで `primary`（`var(--ink)`）を敷いたボタン面がほぼ白くなる**（`#cfcdc9`）: 実機確認で、暗い画面の中で視線を強く引くことを確認した。`primary` を `warning` / `ok` と衝突させない設計（rev 9章「`Lichen Green` は `ok` 以外に使わない」）の帰結だが、面としての強さそのものは未検討 `[M7]`
- **「未分類」の種別セレクトが `warning` を纏っていない**（`src/modules/glossary/GlossaryEditor.tsx`）: `undecided` の行は `<td>` に `bg-warning/10` が付くが、`<select>` 自体は素の見た目のまま。rev では undecided は負債として可視化する対象 `[M7]`
- **エラー・警告セルの不透明度が仮置きのまま確定していない**（`src/modules/glossary/GlossaryEditor.tsx` の `errorCell = 'bg-warning/25'` / `warnCell = 'bg-warning/10'`）: 同ファイルのコメントは「濃さの値は仮置きで、確定は M7」と書いているが、**M7 では決めなかった**（コメント自体の訂正も残件）。rev 9章の「表記ゆれの『指摘（suggestion）』は warning 系統の弱い表現で表す。具体はトークン確定時に詰める」も同じく未決着 `[M7]`
- **`palette.test.ts` は不透明トークンのみを検証しており、半透明の重ね合わせ（`bg-warning/25`、`bg-warning/10`、`placeholder:text-warning/70`、shadcn の `bg-destructive/10 text-destructive` 等）はテストの対象外**（`src/styles/palette.test.ts`）: sRGB で実測すると、「（未定義）」のプレースホルダ（`text-warning/70` を `bg-warning/10` のセル上、さらに `surface` の上に重ねたもの）が約 2.8:1 で本文基準 4.5:1 を下回る。**M7 が持ち込んだ劣化ではない**（旧パレットでも 2.68:1）が、機械検証の範囲外であることは明示しておく必要がある `[M7]`

## 小さな負債

- **`@testing-library/user-event` を devDependencies に入れたが未使用**。キャレット・選択範囲の忠実度が要るテストを書くときに使うか、外すか `[M3]`
- **`ConfirmDialog.dom.test.tsx` が見出しを `getByText` で引いている**（`AlertDialogTitle` は h2 なので `getByRole('heading')` が使える）。新設した `ChoiceDialog.dom.test.tsx` は最初から `getByRole('heading')` で書いた `[M4]`
- **`closeCurrentFile` のバナークリアのコメントから、その挙動の由来（[`history/m2-core-validation-layer.md`](history/m2-core-validation-layer.md) の「`saveError` のクリア条件」）への参照が落ちた**（`src/core/app-controller.ts`）。過去障害の手がかりなので復元したい。あわせて `deleteFile` と `file-ops.ts` の `trashFile` の JSDoc が「切り離しは trash の前に」の説明を重複して持つ（片方だけ更新されると食い違う） `[M6]`
- **`tsconfig.test.json` の説明を `"//"` キーで書いている**が、`extends` 元の `tsconfig.app.json` は JSONC の `/* */` を使っており不統一 `[M6]`
