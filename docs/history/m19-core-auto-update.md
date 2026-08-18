# M19 申し送り: Windows の自動アップデート

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。

M19 は Windows 版に「アプリ内でのボタン操作による自動アップデート」を足すマイルストーンで、設計は [`../superpowers/specs/2026-08-19-m19-auto-update-design.md`](../superpowers/specs/2026-08-19-m19-auto-update-design.md)（`69c43f3`）、実装計画は [`../superpowers/plans/2026-08-19-m19-auto-update.md`](../superpowers/plans/2026-08-19-m19-auto-update.md)（`8b7c2f6`）。

コミット範囲: `1ec696b`（前マイルストーン完了）〜 `HEAD`。

```
4a9424f feat(m19): updater / process プラグインを入れる
6eff30d feat(m19): 額縁に更新ボタンと起動時チェックを足す
c01fe97 refactor(m19): 進捗 callback の引数名を chunk に改める
7739eb6 feat(m19): Tauri の updater API を src/fs に隔離する
82f6ede chore(m19): updater / process の npm 依存を入れる
acdbe30 test(m19): CARGO フィクスチャの退化テストデータを直す
c2a2f2c feat(m19): latest.json の生成スクリプトとリリース手順を置く
f52a708 feat(m19): 更新状態の機械をコアに置く
8b7c2f6 docs(m19): 自動アップデートの実装計画を書く
69c43f3 docs(m19): 自動アップデートの設計を書く
```

最終状態（本タスクでの実行結果）: `npm test` 116 files / 1445 tests 全緑、`npx tsc -b` エラー無し、`npm run lint` 警告・エラー無し、`(cd src-tauri && cargo build && cargo test)` ビルド成功・既存テスト1本（`pty::tests::kill_is_not_blocked_by_a_stuck_write`）緑。

---

## 実装で確定した事項

### 1. `installMode` という名前のキーが2つあり、意味が違う

`src-tauri/tauri.conf.json` に同名のキーが2箇所ある。

- `bundle.windows.nsis.installMode`（`"currentUser"`）: **誰向けにインストールするか。** `perMachine` は管理者昇格を要求し、[昇格が要る NSIS では updater が動かない報告](https://github.com/tauri-apps/tauri/issues/7184)がある。
- `plugins.updater.windows.installMode`（`"passive"`）: **updater がインストーラをどう起動するか。** [`quiet` は更新後に再起動しない既知の不具合](https://github.com/tauri-apps/tauri/issues/7560)がある。

**両方とも既定と同じ値だが明示した。** 既定に頼ると、将来ここを触った人が「そもそも2つある」ことに気づかないまま更新経路を黙って壊しうる。

### 2. updater / process はデスクトップ限定のプラグインとして分離した

`src-tauri/tauri.conf.json` に `bundle.android` の設定が残っているため、モバイルビルドの余地を壊さないよう次の2箇所で分けた。

- `src-tauri/Cargo.toml`: `[target.'cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))'.dependencies]` に `tauri-plugin-updater` / `tauri-plugin-process` を入れる。
- `src-tauri/src/lib.rs`: `#[cfg(desktop)]` で builder をシャドウイングし、`.plugin(tauri_plugin_updater::Builder::new().build())` と `.plugin(tauri_plugin_process::init())` をデスクトップビルドだけに足す。

### 3. CSP は触っていない

更新の取得（HTTP フェッチ・署名検証）は Rust 側（updater プラグイン）が行うため、webview の `connect-src` の対象外。

### 4. `process:default` ではなく `process:allow-restart` だけを足した

`src-tauri/capabilities/default.json` に `updater:default` と `process:allow-restart` を追加。アプリを終了させる権限（`process:default` に含まれる `allow-exit` 等）は要らないため絞った。

### 5. `latest.json` の形

`scripts/make-latest-json.mjs` が `version` / `notes` / `pub_date` / `platforms.windows-x86_64.{signature,url}` を持つ JSON を生成する。`resolveVersion()` が `package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`（`[package]` セクション）の3箇所の版番号が一致することを確かめ、揃っていなければ3つの実値を並べて例外を投げる。**揃えにはいかない**——判断を持たせないための意図的な仕様。

### 6. 署名鍵は人間が生成した

鍵 ID `E4D4941B2D95D2ED`。秘密鍵は `~/.tauri/facet.key`（人間の環境にのみ存在）、公開鍵は `tauri.conf.json` の `plugins.updater.pubkey` にコミット済み。リリース手順は `docs/release.md` に新設。

### 7. mac を対象から外した判断とその理由

引っかかるのは updater 自体ではなく、**その手前にある「未署名の `.app`」という現状**。未署名／ad-hoc 署名の `.app` はダウンロード時に quarantine 属性が付き、Gatekeeper が「壊れているため開けません」を出す。これは v1.0.0 の dmg に既に当てはまっている問題で、updater を足しても解決しない。加えて、mac を対象に含めると **minisign の秘密鍵を2台に置く**ことになり、鍵管理の面でも避けた。`scripts/make-latest-json.mjs` の `buildLatestJson()` は mac を `platforms` に含めない（コメントで明記）。`docs/release.md` にも「mac の dmg は同じリリースに足すが `latest.json` には載せない」と明記した。

---

## 計画に由来した欠陥（レビューで見つかったもの）

### 1. `make-latest-json.test.mjs` の `CARGO` フィクスチャが退化していた

`[package]` の `version` が `[dependencies]` の裸の `version` より前にあったため、セクションを切り出さない素朴な正規表現でも偶然一致し、「依存の version 行に釣られない」というテスト名が主張することをデータが証明していなかった。`[workspace.package]` を `[package]` の前に置き、前後の両側に釣り餌がある形に直した（`acdbe30`）。

### 2. `src/fs/updater.ts` の callback 第1引数の名前がミスリーディングだった

`downloaded` という名前なのに、実際に運ぶのは今回届いた差分（チャンク）だった。累計は `src/core/update-check.ts` の `progress()` が `downloaded + chunk` の形で持つ。型だけ読んだ人が二重加算しうるため `chunk` に改名した（`c01fe97`）。

### 3. mac のテストが退化していた（実装者が発見）

ガードを外しても緑のままだったため、ミューテーションで実際に赤くなることを確かめ直した（詳細はコミットログ・SDD ledger 参照）。

---

## 計画のセルフレビューで潰したもの（実装には届いていない）

### 多重起動の錠前を `setUpdateState` の更新関数の中で判定する下書きがあった

計画の**下書き**は、多重起動の錠前を `setUpdateState` に渡す更新関数（`setUpdateState(prev => ...)`）の中で「始まったか」を判定するコードになっていた。React はその更新関数が同期に呼ばれる保証を持たないため、あの形だと連打と起動時チェックの重なりで2本走る。

**この欠陥は実装には一度も届いていない。** 計画を書いた人間が自己レビューでこの誤りに気づき、`docs/superpowers/plans/2026-08-19-m19-auto-update.md` をコミットする前に、`updateBusyRef`（ref。実行中かどうかを止める実際の錠前）と `canCheck(state)`（`src/core/update-check.ts`。ボタンの `disabled` を導く純関数）の2つに役を分けて直した。コミット（`8b7c2f6`）のメッセージにその経緯が残っている。コミットされた計画は最初から `updateBusyRef` を指定しており、「**state で判定しないこと**——`setUpdateState` に渡す更新関数が同期に呼ばれる保証は無いため…」というほぼ同じ説明コメントを持つ（計画 800行台）。実装（`src/App.tsx`）はこの計画をそのまま実装しただけで、独自の修正は行っていない。

---

## 実機確認（Step 8）について

**未実施。** エージェントは Tauri の GUI を操作できないため、次の9項目はいずれも実行していない。人間が `npm run tauri dev` および実リリース（v1.0.1 相当）を使って確認する必要がある。

まず開発ビルドで見える範囲（`npm run tauri dev`）:

1. ネットワークを切って起動し、何も表示されないこと（静かな失敗）
2. ネットワークを切って更新ボタンを押し、トーストにエラーが出ること
3. ネットワークを繋いで押し、「facet は最新版です」が出ること

次に、中身の変更がほぼ無い v1.0.1 を本物のリリースとして出し、v1.0.0 から実際に更新されるかを見る（ローカルの静的サーバでは代用しない）:

4. v1.0.0 を起動して、ボタンが「v1.0.1 に更新」に変わるか
5. 押して確認ダイアログ → ダウンロード進捗のトースト → インストールまで通るか
6. UAC が出ないか（`nsis.installMode: currentUser` の想定どおりか）
7. SmartScreen が出ないか（updater が起動するインストーラに mark-of-the-web が付かない想定どおりか）
8. 更新後にアプリが自動で戻ってくるか
9. 戻ってきた（あるいは手で開いた）アプリが 1.0.1 になっているか

**8 が「戻ってこない」でも不具合として追わない**——確認ダイアログの文面（「更新後に facet を開き直してください。」`src/App.tsx`）が既に吸収している。戻ってくることが確認できたら、その一文を削って `App.tsx` を直し、テストも合わせて直すこと。

この未実施は `docs/open-issues.md` の「次に手を付ける候補」に追加した。あわせて、実機確認でしか確定しない2点（自動再起動の有無・SmartScreen の有無）を「挙動の穴」に `[M19]` タグで追加した。

---

## `docs/open-issues.md` への反映

解消として消したものは無い（本マイルストーンで着手前から開いていた残件を解消する変更は無い）。

新たに追記したもの:

- 「挙動の穴」に2件（`[M19]`）: 更新後の自動再起動の有無が未確認であること、SmartScreen の有無が未確認であること。
- 「次に手を付ける候補」に2件: M19 の実機確認（上記9項目）が未実施であること、未署名配布そのもの（mac の Gatekeeper・Windows の SmartScreen）が M19 では解決していないこと。
