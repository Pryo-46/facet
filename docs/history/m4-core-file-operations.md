# M4（コア）申し送り: ファイル一覧の額縁とファイル操作

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。計画立案の教訓は [`../lessons-for-planning.md`](../lessons-for-planning.md) に集約した。

M4 は実装・レビュー完了。新規作成（type選択）／削除（OSゴミ箱へ移動）／用語集0個からの自動生成／確認ダイアログ／「保存できないまま閉じられない」状態の脱出口が入り、M2・M3 の申し送りの M4 項目（単一性違反の解消手段が無い／モーダルの配線点／用語1件の行を消すとフォーカスが `document.body` に落ちる）と、M2 の申し送りの残件「保存できないと閉じられない」は解消した。

**実機確認（`npm run tauri dev` の GUI ウォークスルー）は実施済み・合格。** 機能面の欠陥は見つからなかった。見つかったのは UI の導線の不整合1件だけで、本コミットで修正した——`FileList` のサイドバー「＋ 用語集を新規作成」ボタンが、`App.tsx` 空状態の「用語集を作る」ボタンと違って `hasGlossary` 相当のゲートを持たず、用語集が既にある状態でも押せてしまい、押すとアプリ自身が単一性違反を製造していた。`src/core/file-ops.ts` に `canCreateFileOfType` を追加し、両方のボタンをこれで統一してゲートした（詳細は下記「実装で確定した事項」）。

**ただし、完了条件6（開いているファイルをデバウンス窓の中で削除しても、そのファイルが復活しない）だけは、実機確認では原理的に検証しづらい。** 確認ダイアログを開いて押すまでの所要時間はデバウンス（500ms）より長いため、手で操作すると確定時点でタイマーはほぼ常に発火済みになり、「窓の中で削除する」という状況そのものを人間の操作では作りにくい（下記「実装で確定した事項」の `trashFile` の項を参照）。この条件を実際に固定しているのは `src/core/file-ops.test.ts` の、偽タイマーで in-flight の write を再現する回帰テストだけである。**したがって「実機確認で合格」と言えるのは完了条件1〜5・7〜9についてであり、完了条件6は今後も自動テストだけが検証経路であり続ける**——コード変更でここに触るときは、実機確認をいくら重ねても足りない。テストを削らないこと。

**また、今回の修正（サイドバーの新規作成ボタンをゲートしたこと）で、完了条件3（用語集が2つある状態から片方を削除すると単一性違反の赤バッジが消える）の再現手順のうち、アプリ内だけで完結する経路が失われた。** 修正前はサイドバーのボタンにゲートが無かったため、「用語集を作る」→もう一度「＋ 用語集を新規作成」を押す、で2つ目の用語集をアプリ内から作れ、条件3の前提（用語集が2つある状態）を自力で用意できた。修正後は singleton の2つ目をアプリから作る手段が無くなった（本節の主旨そのもの）ので、**次に完了条件3を実機確認するときは、2つ目の用語集をアプリの外から用意すること**（例: 走査済みのフォルダへ `.json` をコピーする、または2つの用語集を持つブランチを git マージする）。これは仕様の後退ではない——外から来た単一性違反を検出・解消できることは変わらず要求されているが、その前提状態をどう用意するかの手順だけが変わった。

### 実装で確定した事項（計画の前提に昇格）

- **自前の Tauri コマンドは `move_to_trash` の1本だけ**: project-setupの「Tauri コマンドは追加しない」は「fs / dialog で足りる」を前提にした記述で、OS ゴミ箱だけはその前提が成り立たない（fs プラグインの `remove` は完全削除）。Rust 側は `trash::delete` を呼ぶだけで判断を持たない（rev 7章の原則は維持）。**自前コマンドは ACL 対象外なので capabilities への追記は要らない**——M2 で確定した「新しい Tauri JS API を使うたびに権限追加が要る」はプラグイン／コアコマンドの話。クレートは `trash` v5（`src-tauri/Cargo.toml`）
- **その裏返しとして、`move_to_trash` はアプリで唯一の「スコープの効かないファイル操作」である**（`src-tauri/src/lib.rs`）: fs プラグインの読み書きはダイアログで選んだフォルダに実行時スコープで閉じ込められるが、自前コマンドは ACL の対象外（上記）なので、**フロントエンドが名指しした任意のパスをゴミ箱へ送れる**。`src-tauri/tauri.conf.json` は `"csp": null` でもある。**今日の実リスクはほぼ無い**——リモートのコンテンツを読み込まず、ファイルの中身は React のテキストとして描画していて HTML として解釈する経路が無いため、任意のスクリプトが webview 上で走る前提が成立しない。したがって**これは「今直すバグ」ではなく「条件が変わったら再点検する常設条件」として記録する**: 外部由来のコンテンツを HTML/Markdown としてレンダリングする、リモート URL を読む、任意のスクリプトを評価する——**これらのいずれかを入れる機能を計画した時点で、CSP の設定と `move_to_trash` のパス検証（プロジェクトフォルダ配下に限定する）をセットで再評価すること**。M6 の Markdown 出力は「書き出す」側なので直ちには該当しないが、プレビュー表示を足すなら該当する。※本項目はレビューでも「実害は無いが見ておく価値がある」として明示的に持ち上がったもので、優先度の低さは「無視してよい」の意味ではない
- **削除の経路は「書かせない」と「進行中の write を待つ」の両方が要る**: 開いているファイルをゴミ箱へ移すとき `closeCurrentFile()`（flush する経路）を通すと、消したファイルを自動保存が書き戻して復活させる。かといって `dispose()` だけでは足りない——`dispose()` はタイマーと `pending` しか消さず、既に飛んだ write（autosave 内部の `chain`）には触れないため、trash が先に完了して後から write が着地し、一覧から消えたファイルをディスク上に作り直す（次のフォルダ走査まで見えない孤児になる）。しかもデバウンスは 500ms なので、確認ダイアログを開いて押す間にタイマーはほぼ常に発火済み——`dispose()` が守る窓の方が実質到達不能で、守らない窓の方が本番である。`src/core/file-ops.ts` の `trashFile` は **`dispose()` → `await flush()` → `dispose()` → `await trash()`** の順で、①先に `pending` を空にするので flush は何も書けない ②空 flush ＝ 進行中 chain の完了待ちになる ③失敗した write が catch で復元した `pending` を捨てる、を成立させている。**この `flush()` を「削除経路で flush してはいけない」と読んで消さないこと**（書かせないのは `dispose()` の役目）。実物の `createAutoSaver` と合成した回帰テストが「write が着地するまで trash を呼ばない」を固定している（`src/core/file-ops.test.ts`）。順序も逆にできない（先にゴミ箱へ移すと直後のデバウンス発火で同じことが起きる）。M5 の外部変更検知でも「外部で消えたファイル」に対して同じ注意が要る
- **ただし、削除を確定した後もそのファイルへの入力は止まっていない**（`src/App.tsx` / `src/core/autosave.ts`）: 上の `await flush()` が塞いだ窓の内側に、**より狭い変種が残っている**。これは修正が効いていないという話ではない——修正前は `trash()` が即座に走っていたためこの窓が「存在しなかった」だけで（それ自体が当のバグ）、待つようにしたことで初めて成立する残余である。機構は次のとおり: `ConfirmDialog` の `onConfirm` は `setConfirm(null)` を**先に**呼んでから `void pending?.onConfirm()` を起動するので、`await saver.flush()` の最中には既にダイアログが閉じている。`deleteFile` が `saverRef.current` を null にし `selectedPath` / `history` を落とすのは `await trashFile(...)` の**後**なので、その間エディタは同じ saver を掴んだままマウントされており、**ユーザーは打ち続けられる**。待っている write が 500ms より長くかかり、かつその間に打鍵があると、再武装したタイマーが発火して `commit()` が走る。`commit()` は `chain` を**再代入**するが、`flush()` は再代入**前**に受け取った Promise を await しているので、古いリンクで解決してしまう（新しい write は飛んだまま）。しかも `commit()` は既に `pending` を null にしているため、`trashFile` の2度目の `dispose()` にも消すものが無く、**生きている write を残したまま `trash()` へ進む**。成立条件は「遅い write」＋「ゴミ箱へ移動を押した後の継続入力」の同時成立なので、実際に踏むのは相当狭い。構造的な直し方は2つあり、**どちらが正かは M5 の設計次第なので両方を残す**: ①削除を確定した時点でそのファイルへの入力を受け付けなくする（`selectedPath` / saver の切り離しを `trash()` の前へ動かす、あるいは操作中フラグでエディタを止める）②`flush()` を「chain が静止するまでループする」意味論に変える（`interceptClose` 側の下記の件と同根なので、直すなら一緒に直す方が筋が良い）
- **モジュール規約に `createEmpty(title)` が加わった**: rev 6章の6点セットには無い7つ目のスロット。額縁の新規作成が `type` からモジュールを引く以上、雛形を置ける場所はモジュール側しかない。**2本目のモジュールもこれを実装する**（`src/core/registry.ts`）。あわせて `ModuleRegistry.list()` を足した（新規作成ボタンを登録済みモジュール分だけ並べるため。ボタンをハードコードしない）。規約6点の残る空きスロットは出力ロジック（規約5・M6）のみ
- **新規ファイルも正規形で書く**: 非正規形で作ると、作った直後の最初の1文字の編集で全行 diff が出る。`buildNewFile`（`src/core/new-file.ts`）はモジュールの `schema` を渡して既存のシリアライザを通す。テストが「スキーマ適合」と「再シリアライズでバイト一致」の両方を固定している（`src/core/new-file.test.ts`）
- **ファイル名は `<displayName>.json`、衝突時は `-2` から連番**（`src/core/file-naming.ts` の `resolveNewFileName`）。ファイル名は識別子ではない（rev 5章）ので意味は持たせず、衝突回避だけを目的とする。Windows は大文字小文字を区別しないので比較も区別しない。`title` は拡張子を除いたファイル名を初期値にする（単一性違反時にどちらの話か見分けられるようにするため）
- **作成したファイルの登録経路は `addCreatedFile` の1本**（`src/App.tsx`）: 新規作成と用語集の自動生成が「`classifyFile` で分類 → 一覧に足す → `computeIssues` → 開く」を同じ関数で通る。書いたテキストをそのまま分類し直すのは、editable にならないなら雛形かシリアライザが壊れている証拠だから（一覧に出す前に気付ける）。**M5 の外部変更の取り込みもここへ合流させられる**
- **`ensureFileOfType` の「既にある」は type 一致であって、開けることの保証ではない**（`src/core/file-ops.ts`）: 探索は `f.result.type` で行うが、`classifyFile` は **スキーマ検証より前に** `type` を読む（新版ファイルを「開けない」でなく「一覧表示のみ」に落とすため。`src/core/load.ts`。rev 5章）。したがってスキーマ違反の用語集（`rejected`）や未知 `schemaVersion` の用語集（`listOnly`）も「既にある」を満たし、呼び出し側はそれを開いて「このファイルは開けません」パネルに着地する。**M4 の空状態ボタンにとってはこれが正しい挙動**（勝手に2つ目を作らず、赤バッジと拒否理由で実情を見せる方が、単一性違反を増やすより良い）。ただし `ensureFileOfType` の JSDoc が主張する「**将来のインライン登録コンポーネントもこの関数を呼ぶ**」は、この点で**そのままでは成立しない**——インライン登録が欲しいのは「用語を1件足せる editable な用語集」であって「type が glossary のファイル」ではない。**インライン登録を実装する時点で、`editable` でない既存ファイルをどう扱うか（登録操作自体を無効化して拒否理由へ誘導するのが筋。黙って2つ目を作るのは単一性違反を増やすので不可）を決めてから呼ぶこと**
- **singleton モジュールは、既に1つあれば新規作成の導線を出さない**（`src/core/file-ops.ts` の `canCreateFileOfType`、`src/components/FileList.tsx`、`src/App.tsx`）: 「作れば単一性違反になる」と分かっている状態でボタンを押せるのは、アプリ自身が violation を製造する経路であり、rev 5章「問題は消せなくして見せる」の対象ではない。あの原則は Skill が2つ書いた・git マージで増えたといった**外から来た**違反を受け入れ、検出と赤表示、削除による解消を提供することを言っているのであって、**自分で違反を作る入口を出す理由にはならない**——検出と赤表示、削除による解消はそのまま残る。判定は type で行い、`rejected` / `listOnly` で開けない用語集も1件として数える（単一性は「type: glossary のファイルが2つ以上」という物理条件であり、壊れた用語集も「どちらを正とするか」の判断対象に含まれる。上記 `ensureFileOfType` の項と同じ理由。M2 で確定）。**実装直後は `App.tsx` の空状態ボタンだけが `hasGlossary` という独自ロジックでゲートされ、`FileList.tsx` のサイドバーボタンはゲート無しだった**——2つのボタンが別々のルール（片方はルールそのものが無い）で守られており、この不整合は人間の実機確認で見つかった。修正では `hasGlossary` を廃し、両方のボタンが `canCreateFileOfType` の1箇所を通るようにした。**2本目の singleton モジュールが増えても、この関数を呼ぶだけで同じ保護を自動的に得られる**（`FileList` はモジュール非依存のまま、`existingTypes: readonly (string | null)[]` prop で全ファイルの type を受け取るだけでよい）
- **`ProjectFile` / `computeIssues` は `src/core/project-file.ts` に移した**（App.tsx の肥大化対策。`computeIssues` は `appRegistry` をクロージャで掴まず引数で受け取る）。`computeIssues` の呼び出し経路は「フォルダ走査時」「ファイル選択時の読み直し」「編集時」の3本に「ファイル作成時」「ファイル削除時」が加わって5本になった（M2 の申し送りが「2経路」と書いているのは選択時を数え落としている）。**M5 の外部変更の取り込みが6本目**
- **モーダル中の操作言語停止の配線点は3箇所**（M3 の申し送りは2箇所と書いていたが不足だった）: `src/App.tsx` の `globalKeyContext(modalOpenRef.current)`（keydown リスナーは依存配列 `[]` でマウント時に1回しか張らないので、`modalOpen` を直接読むと常に初期値 false のままになる。**ref 経由であることが要点で、「簡潔に」state 直読みへ戻さないこと**）、`GlossaryEditor` の `onCellKeyDown`、そして `AliasCell`（別名パネルが独自に `resolveCommand` を呼ぶため、ここを忘れるとダイアログ表示中に別名パネルの Enter/Backspace/Esc が反応する）。`EditorProps` に `modalOpen: boolean` が入ったので、**2本目のモジュールのエディタもこれを受け取って自分の `resolveCommand` 呼び出しすべてに配る**
- **Radix の `AlertDialogAction` と `AlertDialogCancel` は内部的にどちらも `Dialog.Close`**: `composeEventHandlers(props.onClick, () => onOpenChange(false))` の形なので、確認ボタンを押しても `onClick` の後に `onOpenChange(false)` が走り、`onCancel` まで発火する。`ConfirmDialog` は確認側の `onClick` で `event.preventDefault()` してから `onConfirm()` を呼んで止めている（`composeEventHandlers` の `checkForDefaultPrevented` を使う）。キャンセル側は `onClick` を持たず `onOpenChange` に一本化。**2本目のモーダルを作るときも同じ罠を踏む**
- **確認ダイアログを挟む操作は、確定時点の状態を ref から読む**（`src/App.tsx` の `selectedPathRef`）: `onConfirm` は「ダイアログを開いたレンダ」のクロージャを持ったまま人間の操作を待つので、その間に in-flight の `selectFile` が解決すると選択が変わる。`deleteFile` が `selectedPath` をクロージャから読むと、消していないファイルの saver を dispose して選択を落とす経路になっていた。**M5 の二択ダイアログも同じ形になる**——確認を挟む操作では、判断に使う state を ref に写して確定時点で読むこと（`historyRef` / `runHistoryRef` / `modalOpenRef` と同じ理由・同じ形）
- **確認ダイアログはアプリに1つだけ置き、`confirm` state（`{ title, description, confirmLabel, onConfirm } | null`）で内容を差し替える**。ファイル削除の確認と「破棄して閉じる」の脱出口が同じ機構を共有している。`modalOpen = confirm !== null` がそのまま操作言語の停止条件になる
- **ファイル削除には確認を挟み、用語（行）の削除には挟まない**: 行の削除は Undo で戻せるが、ゴミ箱への移動はアプリの履歴では戻せない（戻す手段は OS のゴミ箱）。確認の有無はこの基準で決める
- **削除ボタンは `rejected` / `listOnly` の行にも出す**: 単一性違反の解消には「壊れている方の用語集を消す」が要る。ここを塞ぐと外部エディタを強いることになり、rev 5章「拒否は最小限に」に反する
- **保存できないまま閉じられない状態の脱出口は `destroy()` で抜ける**（`src/fs/app-window.ts` の `forceClose`）: `close()` だと `onCloseRequested` が再発火して interceptor がループする。M2 で追加済みの `core:window:allow-destroy` がそのまま効く

### M5 で扱うもの

M2・M3 の申し送りの M5 項目（自己書き込み除外は autosave の現構造を前提に設計する／取り込みは `applyEdit` と `computeIssues` の経路に合流させる／`saveError` のクリア条件／別名パネルの下書き再同期）は引き続き有効。M4 で新たに積んだものを以下に足す。

- **【データ喪失。M5 で必ず塞ぐ】ファイル作成が、走査後に外部で増えたファイルを黙って上書きする**（`src/core/file-ops.ts` の `createFile` / `src/App.tsx`）: `createFile` は衝突回避の名前を `existingNames` **だけ**から決めるが、その中身は `App.tsx` が渡す `files`（＝最後のフォルダ走査時点のメモリ上のスナップショット）である。一方 `writeProjectFile` → `writeTextFile` は既存ファイルを切り詰めて書く。M5 の監視が入るまで再走査の手段は「フォルダを開く」でもう一度同じフォルダを選び直すことだけなので、**スナップショットはいくらでも古くなりうる**。これは「行儀の悪い外部編集への配慮」ではなく、**確認もエラーも出さずに他人のファイルを消す経路**である。
  - 踏む手順は本プロジェクト自身のワークフローそのもの: 空のフォルダを開く → Claude に用語登録を頼む → `glossary-term-register` Skill がそのフォルダへ `用語集.json` を書く → アプリの表示は走査時のまま「このプロジェクトにはまだ用語集がありません」＋「用語集を作る」ボタン → 1クリックで Skill の書いた用語集が空の用語集に置き換わる。`ensureFileOfType` の「既にあるか」判定も同じスナップショット（`f.type`）を見るので、既存検出も名前の連番回避も揃って空振りする。エラーも確認ダイアログも出ない
  - 修正の形（M5 の計画者が再導出しなくて済むように）: `FileIo` に `exists: (path: string) => Promise<boolean>` を足し、名前解決をディスクに問い合わせる形にする——空いている名前が出るまでループするか、対象が存在した時点で明示的に失敗させる（どちらを既定にするかは M5 で決める。ファイル名は識別子ではない以上、連番回避で進む方が rev 5章と整合するが、`ensureFileOfType` は「既にあるなら開く」に倒すのが筋）。`exists` は `@tauri-apps/plugin-fs` が公開しているので Rust 側の追加は要らない。**ただし M2 の `core:window:allow-destroy` の教訓どおり、`fs:default` に `exists` が含まれるか、`fs:allow-exists` の追記が要るかは `src-tauri/capabilities/default.json` で必ず確認すること**（`fs:allow-read-dir` 等と同様、コマンド単位の許可が要る可能性が高い）
  - 監視（下の自己書き込み除外）が入れば窓は縮むが、**それだけでは塞がらない**——監視は取りこぼしうるし、走査直後の作成でも競合しうる。`exists` による確認は監視とは別に要る
- **削除・新規作成も監視の自己書き込み除外の対象になる**: フォルダ監視を入れると、アプリ自身のファイル作成・ゴミ箱移動が外部変更として跳ね返る。除外は「書き込み」だけでなく「作成」「消滅」も対象にすること
- **「外部で消えたファイル」の後始末は `deleteFile` と同じ形になる**（`src/App.tsx`）: 選択中なら `selectSeq.current++` で in-flight の `selectFile`/`openFolder` を捨てさせ、saver を **flush せずに** dispose し、`selectedPath` / `history` / `saveError` を落とし、`computeIssues` をやり直す。外部消滅で flush すると消えたファイルを書き戻す——M4 の削除と同じ事故
- **`ioError` / `saveError` / トーストの整理**: M4 でファイル作成・削除の失敗も `ioError` バナーに合流させた（`ファイルを作成できませんでした:` / `ファイルを削除できませんでした:` / `用語集を作成できませんでした:`）。現状バナーは2本（`ioError` と `saveError`）が縦に並ぶだけなので、M5 のトースト設計と併せて「どれをバナーに残し、どれをトーストにするか」を決める
- **`flush()` が「chain の静止」を保証しないので、close のゲートが write を残したまま通りうる**（`src/core/autosave.ts` / `src/App.tsx`。**M4 以前からある問題で、今回の修正ウェーブでは触っていない**）: `flush()` は `await commit()` するが、`commit()` が返すのは**その時点の** `chain` であり、await している間に再武装したタイマーが発火すると `commit()` が `chain` を再代入する——`flush()` は古いリンクで解決し、`pending` も新しい `commit()` が既に null にしているので `return pending === null` は `true` になる。結果、`interceptClose` の `if (await saver.flush()) return true` が**進行中の write を残したまま true を返し**、`win.destroy()` に進みうる（`preventDefault()` でウィンドウは生きているため、この間ユーザーは打ち続けられる）。上の「削除確定後も入力が止まっていない」と**同じ根**。`saveError` のクリア条件（M2・M3 の申し送りから継続）と同じく autosave の意味論に手を入れる話なので、**M5 でまとめて決めること**——`flush()` を「pending が空かつ chain が静止するまで繰り返す」に変えるのが素直だが、失敗時の再試行（catch による `pending` 復元）と組み合わせると無限ループになりうるので、打ち切り条件とセットで設計する
- **`confirm` スロットが1つしかない**（下記「残件」と同じ話）: 現状の生産者は「削除確認」と「破棄して閉じる」の2つで、M5 は外部変更の二択ダイアログという3人目を連れてくる。削除確認や close の脱出口と衝突しうるので、この時点で queue 化かスロット分離を判断すること

### M6 で扱うもの

M3 の申し送りの M6 項目（出力ロジックが規約6点セットの最後の空きスロット／種別の日本語ラベルは `src/modules/glossary/kind-labels.ts` を使い回す）は引き続き有効。M4 で新たに積んだものは無い。

### M7 で扱うもの

M3 の申し送りの M7 項目（別名パネル・検索欄・種別フィルタチップの仮置き／修飾キーの表示名は `platform.ts` を通す）は引き続き有効。M4 で新たに積んだものは以下。

- **確認ダイアログの見た目は shadcn の既定トークンのまま**（`src/components/ui/alert-dialog.tsx` は `npx shadcn@latest add alert-dialog` の生成物で手を入れていない）。`ConfirmDialog` を役割トークンへ寄せるのは M7。生成物そのものを書き換えるのか、`ConfirmDialog` 側で上書きするのかもこの時点で決める
- **新規作成ボタン・削除ボタン・空状態の文字色は既存の役割トークンの流用で仮置き**（`text-ink` / `text-ink-muted` / `text-warning` / `border-rule` / `hover:bg-surface`）。色値の直書きはしていないので、M7 はトークンの割当を見直すだけで済む
- **削除ボタンは「削除」の文字**（`src/components/FileList.tsx`）。アイコン化するならアクセシブル名（`aria-label="<名前> を削除"`）を維持したまま行うこと——DOM テストがこの名前で引いている

### いつでもよいが、忘れると実害化する残件

M4 で新たに見つかったもの（ブランチ全体レビューで出たものを含む。**レビューの記録は作業ワークスペースと一緒に消えるので、残すならここに書く**——本節が唯一の恒久的な記録である）。**ブランチ全体レビューで出た「削除したファイルが復活しない」に触る2件（`trashFile` の in-flight write／`deleteFile` の `wasSelected`）は、マージ前に修正済み**——上記「実装で確定した事項」の該当項目を参照。以下は残しているもの。

- **`src/App.tsx` に配線レベルのテストが1件も無い**（リポジトリに App のテスト自体が無い）: 「削除で書き戻さない・in-flight の write を待つ」は `trashFile` の単体テストだけが担保しており、App がその関数を正しい引数で（＝選択中のときだけ saver を渡して）呼ぶことは誰も検証していない。上で直した `selectedPathRef` の件も、単体テストでは踏めない位置にある。新規作成・用語集の自動生成・close の脱出口も同様。App のテストハーネスを1つ作るか、コアへの切り出しを進めるかの判断が要る（M4 では `project-file.ts` と `file-ops.ts` への切り出しでその方向に一歩進めた）
- **`confirm` の状態スロットが1つしかない**（`src/App.tsx`）: 削除確認を出したまま OS の × を押して flush が失敗すると、削除確認が無言で上書きされて要求が落ちる。発生条件が狭く実害も無い（何も削除されない）が、confirm の生産者が増えたら queue 化を検討する。M5 が3人目の生産者を連れてくる
- **`move_to_trash` が同期コマンドなので、削除中はウィンドウが固まる**（`src-tauri/src/lib.rs`）: Tauri v2 は `async` でないコマンドを**メインスレッド上で**実行する。`move_to_trash` は `fn`（非 async）で、中で呼ぶ `trash::delete` は Windows ではシェルのファイル操作 API を通るため、ゴミ箱の管理情報の更新・ネットワークパス・Defender のスキャンで**実時間がかかりうる**。その間ウィンドウは無反応になる。ローカルの小さな JSON では体感しにくいが、条件が揃うと目に見える。直し方は `async fn` にするか `tauri::async_runtime::spawn_blocking` で包むかの二択で、**`trash` クレートは呼び出しごとに自前で COM を初期化するのでワーカースレッドで問題ない**
- **`forceClose()` の失敗が完全に無音**（`src/App.tsx`）: 確認ダイアログは `void pending?.onConfirm()` で起動するので、`onConfirm` 内の `forceClose()`（＝`destroy()`）が reject しても誰も受け取らない。その時点でダイアログは既に閉じ、`dispose()` が保留編集を捨てた**後**なので、ユーザーには「破棄して閉じるを押したのに何も起きない（そして編集は失われている）」としか見えない。脱出口として最悪の失敗の仕方をする。`try/catch` で `ioError` を立てるだけの3行で塞げる
- **`forceClose()` が `close()` でなく `destroy()` を呼ぶことを固定するテストが無い**（`src/fs/app-window.ts`）: `@tauri-apps/api/window` をモックする狭い単体テストで足りる。取り違えると interceptor ループ（閉じられなくなる）が再発する
- **`addCreatedFile` が同一パスを二重に一覧へ足しうる**（`src/App.tsx`）: 新規作成ボタンのダブルクリックや、1回目の IPC が遅いうちの2回目の押下で、両方が同じ `files` スナップショットから名前を解決して**同じパス**に行き着き、`setFiles((prev) => [...prev, entry])` が同じ `path` のエントリを2件作る。`FileList` は `key={file.path}` なので React のキーが重複し、`checkProjectConsistency` は物理的には1つのファイルに対して単一性違反バッジを出す（`group.length` が2になるため）。ディスク上は同じ内容で2回書かれるだけなのでファイルは壊れず、フォルダを開き直せば自己修復する。`prev.some((f) => f.path === created.path)` の一行ガードで塞げる
- **`src/core/file-naming.ts` の `ILLEGAL` は Windows の予約デバイス名（CON/PRN/AUX/NUL/COM1-9/LPT1-9）と末尾のドット・空白を弾かない**: 現状 `module.displayName` しか渡らないため実害は無い。**ユーザー入力（ファイル名の指定・リネーム UI）が直接届くようになった時点で塞ぐこと**
- **`FileList` の行ボタンのアクセシブル名が「`<名前>` を開く」で固定**（`src/components/FileList.tsx`）: スクリーンリーダーには `title`・「開けない」「編集不可」・issue 件数バッジが読まれない。`aria-describedby` で補うのが筋
- **`ConfirmDialog` の可読性・テストの小さな負債**: `ConfirmDialog.dom.test.tsx` の見出しを `getByText` で引いている（`AlertDialogTitle` は h2 なので `getByRole('heading')` が使える）。また `AlertDialogCancel` 側に「なぜハンドラが要らないか」の一行が無く、`preventDefault` を持つ Action 側との非対称が読み取りにくい

M2・M3 の申し送りからの継続（M4 では手を付けていない）:

- **unmount 時の effect が `void flush()` の直後に `dispose()` を呼ぶ**（`src/App.tsx`）: flush 失敗で復元された pending を捨てる経路。実際の close は `interceptClose` 側を通るので現状は実害なし
- **編集1打鍵ごとに全ファイルの `checkConsistency` を再実行している**（M4 でファイル作成・削除の経路が増えたが、いずれも頻度が低いので事情は変わらない）
- **定義セル・種別セルは `mark(index, field)` を参照していない**（`src/modules/glossary/GlossaryEditor.tsx`）。これらを指す検証ルールが増えた時点で、issue 一覧には出るのにセルが赤くならない
- **`@testing-library/user-event` を devDependencies に入れたが未使用**
- **`resolveCommand` の細かい非対称**（macOS の `Ctrl+Backspace` / `Alt+Shift+↑↓`）
- **`CellInput` の `caretAtStart` / `caretAtEnd` は collapsed なキャレットのみ true**（`src/components/CellInput.tsx`）

※ M2 の申し送りの「`checkProjectConsistency` の `out.set` が上書き代入」は M3（`addIssue` ヘルパの追加）で、M2 の申し送りの「保存できないと閉じられない」は M4 Task 8 で解消済み。

### rev への反映事項

**本節の分は反映済み**（このコミットで `docs/overview-rev.md` を編集した）:

- **7章**: 「Rustは原則書かない」の例外として `move_to_trash` を明記
- **6章**: モジュール規約6点の直後に `createEmpty(title)` を追記

あわせて、**M3 の申し送りの「rev への反映事項」3件（10章の Ctrl+Y／編集中の Undo/Redo／導出表示中に止める操作の一般化）が M3 完了時から未反映のまま残っていた**ので、同じコミットで反映した。教訓として、**rev への反映は当該マイルストーンの完了コミットで済ませ、申し送りに TODO として残さない**こと——次のマイルストーンの計画者は rev を「正」として読むため、反映漏れは設計と実装の食い違いとして伝播する。

### 実装計画そのものに含まれていた誤り（次回の計画立案への教訓）

計画（`docs/superpowers/plans/2026-08-05-m4-file-operations.md`）は着手前に3件修正し（commit `4ec937d`）、さらに実装・レビューの段で3件が出た。M3 の申し送りの教訓（**計画のコードは検証済みの正ではなく、レビューを通す前提の下書きとして扱う**）は M4 でも同じ形で再現している。

着手前に見つかったもの:

1. Task 2 のテストが `@tauri-apps` のモックを1つしか置いていなかった（実際には `api/core` / `api/path` / `plugin-dialog` / `plugin-fs` の4つが要る。テスト対象がインポートするモジュールを数え落とすと import 時に落ちる）
2. Task 5 が `onDelete={() => {}}` の no-op スタブを作り、Task 6 が即座に置き換える構成だった → 削除ボタンとその prop を Task 6 に一本化した。**次のタスクが即消すスタブを置く分割は、分割線そのものが間違っている**
3. 実機確認（`npm run tauri dev`）を実装者が実行する前提で書かれていた。**サブエージェントは GUI を操作できない**ので、実機確認は人間の作業として計画に明記する（M4 では最後にまとめて実施する形にした）

実装・レビューの段で出たもの:

4. **`createNewFile` と `ensureGlossary` に同じ9行を書けと指示していた**（Task 7 のレビューで Important 判定。人間が「今直す」と裁定し `addCreatedFile` に抽出）。**計画に完全なコードを載せると、そのコードの設計上の欠陥まで忠実に実装される**——重複は実装者が「計画通りに書いた」結果として生まれる
5. Task 4 の `ConfirmDialog` のコード（`AlertDialogAction onClick={props.onConfirm}`）では、確認ボタンでも `onCancel` が発火してテストが落ちた（Radix の内部 close 発火。上記「実装で確定した事項」参照）。**ライブラリの内部挙動は計画時点では未検証**であり、計画のコードを verbatim で書けという指示と衝突する。実装者はライブラリのソースを読んで機構を確認し、レビュアーも同じ経路を辿って追認した
6. Task 5 の期待テスト件数が「5件」と書かれていたが、計画が示したテストファイル自体には `it` が4件しか無かった（数え間違い。実装者は件数に合わせてテストを増やさず、計画の矛盾として報告した——これが正しい対応）

