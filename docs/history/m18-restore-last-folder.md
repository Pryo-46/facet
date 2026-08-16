# M18 申し送り: 起動時に直近フォルダを自動で復元する

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。

M18 は「起動時、直近に開いていたフォルダを自動で開く」機能を追加するマイルストーンで、実装計画は [`../superpowers/plans/2026-08-16-restore-last-folder.md`](../superpowers/plans/2026-08-16-restore-last-folder.md)（設計は [`../superpowers/specs/2026-08-16-restore-last-folder-design.md`](../superpowers/specs/2026-08-16-restore-last-folder-design.md)）。

コミット範囲: `f383254`（設計）〜`2a05a8a`（Task 4）＋ Task 5（本コミット）。タスクとコミットの対応は Task 1 = `6a86181`（`src/fs/settings-fs.ts` 新設）、Task 2 = `0261cef`（Rust コマンド `allow_project_dir`）、Task 3 = `f1d30da`（フォルダを開いたら保存）、Task 4 = `2a05a8a`（起動時に復元）、Task 5 = 本コミット（全体検証＋申し送り）。最終状態は `npm test` 114 files / 1411 tests 全緑、`npx tsc -b` / `npm run lint` エラー・警告無し、`cargo build` / `cargo test`（既存1本 `pty::tests::kill_is_not_blocked_by_a_stuck_write`）緑。

---

## 実装で確定した事項

### 1. `allow_project_dir` が必要だった理由（Task 2・設計時点で確定）

フォルダ選択ダイアログ（`pickProjectFolder` → `@tauri-apps/plugin-dialog`）が fs プラグインの実行時 scope へ入れる許可は**セッション限り**で、次回起動には引き継がれない。起動時の自動復元はダイアログを経由せずにパスを直接使うため、`fileExists` や `openFolder` の前に scope を明示的に取り直す必要がある。

パターンは `.claude/` 向けの `allow_skill_dir`（M11・rev 7章）と同一——**判断は一切置かない自前コマンド**として `src-tauri/src/lib.rs` に `allow_project_dir(app, dir)` を追加し、`scope.allow_directory(Path::new(&dir), true)` を呼ぶだけにした。capabilities への追記は不要（自前コマンドは capabilities のスコープ機構の外にある）。rev 7章「実際に認めた例外」に4件目として追記した（本タスクで反映）。

### 2. `settings-fs.ts` は `BaseDirectory` を使わず `appConfigDir()` + `join` で解決する（Task 1）

`project-fs.ts` の流儀に揃えた（spec 1節）。`readLastProjectDir` はファイル不在・読み込み失敗・JSON 破損・キー不在のいずれでも例外を投げず `null` を返す——起動時復元は「読めなければ通常起動」の一枚岩の握りつぶしで扱う設計（spec スコープ節・4節）。`saveLastProjectDir` は設定ディレクトリの存在確認→無ければ `mkdir({recursive:true})`→書き込みの順で、TOCTOU（確認後に消える）は `mkdir` が冪等なため実害が無い。

### 3. `App.tsx` の起動時復元 effect は、計画の `cancelled` フラグをあえて外した（Task 4）

計画（`docs/superpowers/plans/2026-08-16-restore-last-folder.md` Task 4 Step 3）は `cancelled` フラグ＋3箇所の早期 return＋`return () => { cancelled = true }` という React 標準の cleanup パターンを指定していたが、実装はこれを落とし、一回性ガード（`hasAttemptedRestoreRef`）だけを残した。

**理由**: React 19（`package.json` は `^19.2.8`。実装時の報告は「React 18」と誤記したが結論に影響なし）の StrictMode は、開発時の二重マウントを**マウント→cleanup→再マウントを同一タスク内で同期的に**行う（`react-dom-client.development.js` の `commitDoubleInvokeEffectsInDEV` を実装者・レビュアーの双方が実ソースで確認）。`readLastProjectDir()` の最初の `await` が解決するより前に1回目の cleanup が走るため、`cancelled` は非同期処理が実質何も進まないうちに `true` になる。その後の再マウントは一回性ガードで無視されるので、**計画どおりのコードでは復元が永久に起動しない**。

`hasAttemptedRestoreRef` だけを残す代替が安全な理由: `App` はアプリの生存期間そのままマウントされ続けるルートコンポーネントで、実 unmount が起きるのは StrictMode の合成的な二重起動と `App.dom.test.tsx` の `cleanup()` だけ。React 19 には setState-after-unmount の警告が無いため、「本当の unmount 後に `openProject`/`setProjectDir` が走る」という懸念にも実害・検出可能性がない。

**レビューでの独立検証**: レビュアー（opus）はこの判断を実装者の報告を鵜呑みにせず、`react-dom` の実ソース（`react-dom-client.development.js:18432-18439`, `:18697-18707`）を直接読んで同期的な disconnect/reconnect の挙動を裏取りした。計画からの逸脱ではあるが、**計画のコードが StrictMode 下で自己矛盾していた**ことが確認された正当な判断として確定している。詳細は本マイルストーンの SDD ledger（`.superpowers/sdd/2026-08-16-restore-last-folder/progress.md` Task 4 の項）を参照。

### 4. `openProject` を依存配列から意図的に外した exhaustive-deps 警告に、理由コメントを付けた（Task 5・本タスク）

Task 4 完了時点で `npm run lint` は `src/App.tsx` の起動時復元 effect に `react-hooks/exhaustive-deps` の警告（`openProject` 依存漏れ）を出していたが、理由コメント無しで残っていた（このコードベースは同種の抑制6箇所すべてに理由を添える house style——`TerminalTab.tsx` / `CellInput.tsx` / `SequenceEditor.tsx` / `LogicTreeEditor.tsx`）。SDD ledger が「最終レビューで triage」と明記していたため、本タスクで `// eslint-disable-next-line react-hooks/exhaustive-deps` に理由コメントを添えて解消した（`openProject` は毎レンダー再生成されるが、`hasAttemptedRestoreRef` の一回性ガードで実行は起動時の1回に固定されているため、依存に加えても実行回数は変わらない）。`npm run lint` は警告0件になった。

---

## 実機確認（Step 5）について

**未実施——人間に委ねる。** 本タスクを担当したエージェントは対話的に GUI を操作する手段を持たず（Tauri のネイティブウィンドウを操作するツールが無い）、計画 Task 5 が求める「フォルダを開く→終了→再起動して同じフォルダが自動で開くことを目視確認」「存在しないフォルダに見せかけて静かに通常起動することを確認」はいずれも実施していない。

代わりに行ったのは次の2点のみ:

1. **自動テストでのカバレッジ**: `App.dom.test.tsx`「起動時のフォルダ復元」describe（5ケース——正常復元・保存パス無し・保存パスが実在しない・`allowProjectDir` 失敗・StrictMode 二重マウントでの単発実行）が、目視確認が検証しようとしている分岐をコード上でカバーしている。
2. **ビルド・起動可否の確認**: `npm run tauri dev` をバックグラウンドで起動し、Vite・Rust 側のビルドが成功し、`facet.exe` プロセスが実際に立ち上がって数秒間生存していることを `tasklist` で確認してから `taskkill` で終了した。クラッシュ・パニック・ビルドエラーは無かった。

**この2点は Step 5 の完全な代替ではない。** 自動テストは実際の Tauri fs scope・実ファイルシステム・実ウィンドウのライフサイクルを検証しておらず、ビルド確認は「起動する」ことしか見ていない——「フォルダが実際に復元されるか」「存在しないフォルダで本当に静かに通常起動するか」は未検証のまま残っている。次にこの機能を触る人、あるいはリリース前に、`npm run tauri dev` を人間が操作して計画 Task 5 のチェックリストを埋める必要がある。

---

## `docs/open-issues.md` への反映

解消として消したものは無い（本マイルストーンは既存の残件を触っていない）。

新たに追記したもの（実装時に見つかった Minor 指摘のうち、後から踏む可能性があるもの）:

- **「テストが無い箇所」**に1件追加: `readLastProjectDir` が `lastProjectDir` が空文字列のとき `null` ではなく `""` をそのまま返す（`src/fs/settings-fs.ts`）。起動時復元の effect は `dir === null` だけで早期returnするため、`""` は `allowProjectDir("")` → `fileExists("")` まで進み、後者が `false` を返すので実害は無い（通常起動にフォールバックする）が、意図（「保存されていなければ null」）とコードの動作にズレがある。
- **「小さな負債」**に1件追加: `settingsFilePath()` ヘルパー（`src/fs/settings-fs.ts`）が `saveLastProjectDir` から使われておらず、`appConfigDir()` + `join` のパス結合が2箇所に重複している（`readLastProjectDir` は使い、`saveLastProjectDir` は直接呼ぶ）。

Step 5（実機確認）が未実施であることは、上の節に明記した。これは「開いている残件」というより「まだ着手していないタスク」なので `open-issues.md` には追記していない——次にこの機能に触る人、またはリリース判断をする人が本書を読めば分かる。
