# プロジェクトの登録と切り替え（設計）

## 背景・目的

`settings.json` が覚えているフォルダは `lastProjectDir` の1件だけで、別の案件へ移るにはフォルダ選択ダイアログでパスを辿り直すことになる。数件を並行して検討し日をまたいで往復する使い方では、移るたびにこの手間が掛かる。

登録済みのプロジェクトを名前で選んで切り替えられるようにする。

## スコープ

- 対象: プロジェクトの登録・改名・お気に入り・一覧からの除外
- 対象: ヘッダ左の枠をプロジェクトの切り替え口にする
- 対象: 登録先が見つからないときの表示と再指定
- 対象: 版番号を設定画面へ移す
- 対象外: 説明文・ステータス・タグ。中身の情報はフォルダの中が正で、アプリは名前とパスだけを持つ
- 対象外: プロジェクト単位の設定。設定はアプリ全体に効いたままにする
- 対象外: 手による並べ替え。順序はお気に入りと最終オープン日時が決める

## 設計

### 1. 登録の値（`src/core/projects.ts`、新規）

型・正規化・並び順を持つ純ロジックで、Tauri もファイルシステムも知らない。

```ts
export interface RegisteredProject {
  /** 同一性の鍵。末尾の区切りを落とした形で持つ */
  path: string
  /** 表示名。既定は開いたフォルダの名前 */
  name: string
  favorite: boolean
  /** ISO8601 */
  lastOpenedAt: string
}
```

`AppSettings` には入れない。同じファイルに載るが、設定画面で選ぶ値ではなく開いたフォルダの記録で、`lastProjectDir` を `AppSettings` の外に置いている線引きと同じ側にある。

現在開いているプロジェクトを指すフィールドは持たない。起動時に復元するのは `lastOpenedAt` が最大の1件で足り、同じ情報を2箇所に置く必要がない。

関数は4本。

- `normalizeProjects(raw: unknown): RegisteredProject[]` — 配列でない入力は空配列。要素ごとに `path` が文字列で空でないことを見て、外れた要素を落とす。**空文字列の `path` は必ず落とす**——`allowProjectDir("")` は fs の実行時 scope をファイルシステム全体へ広げる（`readLastProjectDir` のコメント参照）。`name` が文字列でないか空なら `path` の末尾から作る。`favorite` が真偽値でなければ false、`lastOpenedAt` が文字列でなければエポック。`path` が重なる要素は先に現れた方を残す
- `sortProjects(projects): RegisteredProject[]` — お気に入りを先に置き、どちらの群も `lastOpenedAt` の降順に並べる
- `folderName(path: string): string` — `/` と `\` の両方を区切りとして末尾を取る。Windows と POSIX のどちらのパスも同じ関数が扱う
- `touchProject(projects, path, now): RegisteredProject[]` — 該当する登録の `lastOpenedAt` を更新し、無ければ `folderName` を表示名として足す

表示名の重複は許す。同一性の鍵は `path` なので壊れない。見分けが付かない行は UI の側でパスを添える。

### 2. 保存と移行（`src/fs/settings-fs.ts`、変更）

読んで重ねて書く既存の `writeMerged` をそのまま使い、`projects` キーを足す。

- `readProjects(): Promise<RegisteredProject[]>` — `projects` を `normalizeProjects` に通す。**`projects` キーが無く `lastProjectDir` がある場合だけ、その1件を取り込んだ配列を返す。** 表示名は `folderName`、`lastOpenedAt` はエポック
- `saveProjects(projects): Promise<void>` — `theme` と `canvas` を保ったまま書く

`saveLastProjectDir` と `readLastProjectDir` は残す。前者は呼び出し元を失うが、`readLastProjectDir` は移行の入力として要る。移行後も旧キーはファイルに残る。`projects` がある限り読み手が参照しないので、消す仕組みは足さない。

`src-tauri/capabilities/default.json` は変更しない。同じ `$APPCONFIG/settings.json` を読み書きするだけで、許可は揃っている。

### 3. 存在確認（`src-tauri/src/lib.rs`、変更）

登録先が消えている行をメニューの中でグレーにするには、開いていないフォルダの存在を確かめる必要がある。`fileExists` は fs プラグインの `exists` で scope の中しか見えず、確認のために `allowProjectDir` を全件へ掛けると、開いてもいないフォルダへ fs の実行時 scope が広がる。

`dirs_exist(paths: Vec<String>) -> Vec<bool>` を自前コマンドとして足す。自前コマンドは ACL の対象外なので capabilities への追記は要らない（`move_to_trash` と同じ扱い）。**できるのは存在の確認だけで、読み書きの経路は開かない。**

`src/fs/project-fs.ts` に `dirsExist(paths: string[]): Promise<boolean[]>` を置いて包む。

### 4. ヘッダの枠（`src/App.tsx`、変更）

見出しと版番号が占めている `w-64` の枠を `ProjectMenu` に置き換える。枠の幅はサイドバーと揃えたまま保つ。

`facet` の `h1` は視覚的に隠して残す。文書の見出しを失わないためで、見える位置にはプロジェクト名が出る。

帯の「フォルダを開く」ボタンは削る。フォルダを開く経路がメニューの「プロジェクトを追加」1本になり、開いたフォルダは必ず登録される。

`openFolder` と `switchFolder` は残す。メニューの行を押したときの経路は `allowProjectDir` → `switchFolder` → `touchProject` の保存で、切り替えの後始末（端末の終了とペインの畳み）を1本に寄せた既存の判断は動かさない。**`switchFolder` が成功したときだけ `lastOpenedAt` を更新する**——開けなかったフォルダを次回の復元先にしない。

起動時の復元は `readLastProjectDir` ではなく `readProjects` を読み、`lastOpenedAt` が最大の1件を開く。scope の取り直しと、あらゆる失敗を通常起動として握りつぶす扱いは現状のまま。

### 5. `ProjectMenu`（`src/components/ProjectMenu.tsx`、新規）

`ExportMenu` と同じ `src/components/ui/dropdown-menu.tsx` に乗る。

トリガーは現在のプロジェクト名。1件も登録が無いときは「プロジェクトを追加」を出し、押すとフォルダ選択ダイアログが直接開く。

中身はお気に入りの群、区切り、その他の群、区切り、「プロジェクトを追加」。行にホバーしたときだけ星と省略記号のボタンを出す。星はお気に入りを切り替え、**メニューを閉じない**——続けて別の行を触れるようにするため。省略記号は「プロジェクト名を変更」と「一覧から外す」を持つ。

表示名が他の行と重なっている行にだけ、パスを小さく添える。全件に添えるとメニューが縦に伸びるだけで、見分けが要るのは重なった行に限られる。

開いた時点で `dirsExist` を1回呼び、結果を閉じるまで保持する。見つからない行はグレーにして「見つからない」を添え、押すとフォルダ選択ダイアログを開いて `path` を差し替える。**表示名とお気に入りは保つ。** 自動では消さない。

**開いているプロジェクトには「一覧から外す」を出さない。** 出すと、開いているのに一覧に無いという状態ができ、トリガーに出す名前の持ち主がいなくなる。

一覧から外すときに確認は挟まない。フォルダは消えず、失うのは表示名とお気に入りだけで、再び追加すれば戻る。

### 6. 改名ダイアログ（`src/components/RenameProjectDialog.tsx`、新規）

`SettingsDialog` と同じ `src/components/ui/dialog.tsx` を土台にする。入力欄1つ、読むだけのパス、キャンセルと OK。開いた時点で現在の名前を全選択しておく。

**入力欄をメニューの項目の中に置かない。** Radix の `DropdownMenu` は項目のキー入力を頭文字ジャンプに使うので、打った文字が入力欄と項目の移動の両方に取られる。`Esc` もメニューを閉じる側に先に効く。

名前を空にして確定したらフォルダ名へ戻す。名前の無い行を作れないようにするためで、エラーを出すより手数が少ない。

開いている間は `KeyContext.modalOpen` を true にする（rev 10章の境界規則）。モーダルキューには積まない——利用者が能動的に開く画面なので、`SettingsDialog` と同じ扱いにする。

### 7. 版番号（`src/components/settings/GeneralSettings.tsx`、変更）

テーマの下に区切りを置き、アプリ名と版番号を並べて出す。`readAppVersion` の呼び出しは `src/App.tsx` に残し、値を props で渡す。設定パネルは `SettingsPanelProps` を取る形で揃っているので、版番号のためだけに型を広げず、`SettingsDialog` が受けて `GeneralSettings` に渡す。

読めなかったときは行ごと出さない。意味の無い記号を置かない既存の扱いに合わせる。

### 8. 文書の更新

`docs/overview-rev.md` 6章「ファイル一覧の額縁機能」に、プロジェクトの登録と切り替えを額縁の機能として1項足す。アプリが持つのは名前とパスと最終オープン日時だけで、中身の情報はフォルダの中が正である、という線引きを書く。

同 7章の自前 Tauri コマンドの一覧に `dirs_exist` を足す。**一覧の直前にある件数の文も直す。**

`docs/open-issues.md` の `writeMerged` の直列化に関する項目を書き直す。`projects` が3人目の書き手になり、フォルダの切り替えと設定の保存が近接したときに落ちる範囲が広がる。

### 9. テスト

- `projects.ts` の `normalizeProjects`。配列でない入力・`path` が空文字列の要素・`path` の重複・欠けたキー・型の違う値
- `projects.ts` の `sortProjects`。お気に入りが上に固定され、どちらの群も最終オープン順になること
- `projects.ts` の `folderName`。`/` と `\` の両方、末尾に区切りが付いた入力
- `settings-fs.ts` の移行。`projects` が無く `lastProjectDir` だけがある設定から1件を作ること、`projects` があれば `lastProjectDir` を見ないこと
- `settings-fs.ts` の merge。`projects` を書いても `theme` と `canvas` が残ること、その逆
- `ProjectMenu` の DOM テスト。お気に入りの切り替えでメニューが閉じないこと、見つからない行がその旨を持つこと、開いているプロジェクトに「一覧から外す」が出ないこと、表示名が重なった行にだけパスが添うこと
- `RenameProjectDialog` の DOM テスト。空で確定するとフォルダ名へ戻ること
- `App.dom.test.tsx` に、起動時に `lastOpenedAt` が最大の登録を開くこと
