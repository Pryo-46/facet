# 自動アップデート（設計）

## 背景・目的

v1.0.0 を GitHub の public リポジトリで公開した（[リリース](https://github.com/Pryo-46/facet/releases/tag/v1.0.0)）。現状、利用者が新しい版を手に入れる唯一の経路は「リリースページを自分で見に行って、インストーラを落として実行し直す」であり、**利用者は新版が出たことを知る手段を持たない。**

Tauri v2 の updater プラグインは、静的な JSON をエンドポイントとして版の有無を判定する。public リポジトリなら `https://github.com/<owner>/<repo>/releases/latest/download/<asset>` が認証なしで取得でき、しかも常に最新の（プレリリースでない）リリースへ解決される。**この構成が今回の条件に最も素直に嵌まる。**

本設計は、Windows 版 facet に「新版の存在を知らせ、押せばその場で更新される」経路を作ることを目的とする。

## スコープ

- **対象: Windows（NSIS の x64 インストーラ）のみ。**
- **対象外: macOS の自動アップデート。** 理由は下の「なぜ mac を外すか」。mac は従来どおり dmg を手で落としてもらう。
- 対象外: 更新の強制（利用者が押さない限り何も起きない）。
- 対象外: リリース作業の CI 化。手元ビルドのまま、`latest.json` の生成だけスクリプトにする。`latest.json` の形さえ確定していれば、後から CI に差し替えてもアプリ側は無変更で済む。
- 対象外: 差分更新・バックグラウンドダウンロード。インストーラは 2MB 程度なので、丸ごと落として問題にならない。

### なぜ mac を外すか

引っかかるのは updater ではなく、**その手前の「未署名の mac アプリ」という現状**である。

- 未署名／ad-hoc 署名の `.app` はダウンロード時に quarantine 属性が付き、Gatekeeper が「壊れているため開けません」を出す。Windows の SmartScreen のように［詳細情報］→［実行］で抜けられる類ではない。**これは v1.0.0 の dmg に既に当てはまっている問題**で、自動アップデートの有無とは独立している
- updater 経由の更新に限れば、アプリ自身が展開するので quarantine は付かず、理屈の上ではこの壁を通らない。ただし「更新後にアプリが開けなくなる」という報告が実在する（[tauri#1883](https://github.com/tauri-apps/tauri/issues/1883)）
- mac の成果物は mac でしかビルドできないため、対象に含めると **minisign の秘密鍵を2台に置く**ことになる。鍵の複製は事故のもとで、外せるなら外したい

正攻法は Apple Developer Program（年 99 ドル）での Developer ID 署名＋公証だが、それは本マイルストーンとは別の意思決定である。

## 設計

### 1. Rust 側（`src-tauri/`）

- `Cargo.toml` に `tauri-plugin-updater = "2"` と `tauri-plugin-process = "2"` を追加
- `src/lib.rs` の `tauri::Builder` に登録する。**updater / process はデスクトップ専用プラグイン**なので `#[cfg(desktop)]` で囲う（`android` ターゲットの設定が `tauri.conf.json` に残っているため、モバイルビルドを壊さない）:

```rust
#[cfg(desktop)]
let builder = builder
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init());
```

判断は一切置かない（rev 7章）。チェックも適用も TypeScript 側から呼ぶ。

### 2. capabilities（`src-tauri/capabilities/default.json`）

`permissions` に2つ追記する:

- `updater:default` — `allow-check` / `allow-download` / `allow-install` / `allow-download-and-install` を含む
- `process:allow-restart` — 更新後の再起動用。`process:default` は `allow-exit` も含むが、**アプリを終了させる権限は要らないので `allow-restart` だけを明示的に足す**

`description` の末尾に、既存の書式（各許可の理由を短く書き添えるスタイル）で一文追記する。

### 3. `tauri.conf.json`

```json
"bundle": {
  "createUpdaterArtifacts": true,
  "windows": {
    "nsis": {
      "installMode": "currentUser"
    }
  }
},
"plugins": {
  "updater": {
    "pubkey": "<tauri signer generate が出す公開鍵>",
    "endpoints": ["https://github.com/Pryo-46/facet/releases/latest/download/latest.json"],
    "windows": { "installMode": "passive" }
  }
}
```

（既存のキーは省略。`bundle.windows.nsis` には現在 `languages` / `installerIcon` / `uninstallerIcon` がある）

**`installMode` という名前のキーが2つあり、意味が違う。取り違えないこと:**

| キー | 値 | 意味 |
| --- | --- | --- |
| `bundle.windows.nsis.installMode` | `currentUser` | **誰向けにインストールするか。** 既定と同じ値だが**明示する**——`perMachine` は管理者昇格を要求し、[昇格が要る NSIS では updater が動かない報告がある](https://github.com/tauri-apps/tauri/issues/7184)。既定に頼ると、将来ここを触った人が更新経路を黙って壊せてしまう |
| `plugins.updater.windows.installMode` | `passive` | **updater がインストーラをどう起動するか。** 進捗バーだけ出て操作は要らない。`quiet` は選ばない——[更新後にアプリが再起動しない報告がある](https://github.com/tauri-apps/tauri/issues/7560) |

**CSP は変更しない。** 更新の取得は Rust 側が行うため、webview の `connect-src` の対象外である。

`createUpdaterArtifacts: true` は Windows では `.sig` ファイルの生成を有効にする（mac の `.app.tar.gz` も出るが、`latest.json` に載せないので配られない）。

### 4. `src/fs/updater.ts`（新規）— 副作用の境界

既存の `src/fs/*` と同じ役割で、Tauri の updater API をここに隔離する。コアは Tauri を知らない。

```ts
export interface AvailableUpdate {
  version: string
  /** ダウンロード〜インストールを実行する。**成功しても戻ってこない**（アプリが終了する） */
  install: (onProgress: (downloaded: number, total: number | null) => void) => Promise<void>
}

/** 新版があれば返す。無ければ null。**例外はそのまま投げる**（呼び出し側が握り潰すか見せるかを決める） */
export function checkForUpdate(): Promise<AvailableUpdate | null>
```

`@tauri-apps/plugin-updater` の `check()` と `Update#downloadAndInstall()`、`@tauri-apps/plugin-process` の `relaunch()` をここで呼ぶ。**進捗イベント（`Started` / `Progress` / `Finished`）の累計はこのモジュールが取る**——コアに Tauri のイベント型を漏らさないため。

`relaunch()` は `downloadAndInstall()` の直後に呼ぶが、**Windows ではここへ到達しない可能性が高い**（インストール実行時に OS がプロセスを落とす。下の「未検証」参照）。到達しなくても害は無い。

### 5. `src/core/update-check.ts`（新規）— 純ロジック

React も Tauri も知らない状態機械。テストはここに書く。

```ts
export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'none' }                                        // 確認したが最新だった
  | { kind: 'available'; version: string }
  | { kind: 'installing'; version: string; downloaded: number; total: number | null }
  | { kind: 'error'; message: string }
```

遷移関数（`startCheck` / `foundUpdate` / `foundNone` / `startInstall` / `progress` / `failed`）を純関数で置く。持たせる判断は3つだけ:

- **`checking` / `installing` の間は新しいチェックを受け付けない**（多重起動の防止。手動ボタンの連打と起動時チェックが重なりうる）
- **`installing` からは `error` にしか抜けない**（成功時はアプリが終了するので、成功の状態を持つ意味がない）
- **ボタンの見え方を状態から導く関数を置く**（`buttonLabel(state)` / `isEmphasized(state)`）。App.tsx に `state.kind === ...` の分岐を散らさないため

### 6. 見せ方（`src/App.tsx`）

**ヘッダのテーマトグルの隣にボタンを1つ足す。** 既存のアイコンボタン（サイドバー・端末・テーマ）と同じ `buttonBase` の流儀に揃える。

| 状態 | 見え方 |
| --- | --- |
| `idle` / `none` / `error` | `RefreshCw` アイコンのみ、`text-ink-muted`。`aria-label` は「更新を確認」 |
| `checking` | 同じ見た目で `disabled` |
| `available` | **テキスト付きの強調ボタンに変わる**（`Download` アイコン ＋「v1.1.0 に更新」、`bg-surface-accent text-ink`） |
| `installing` | `disabled`。進捗は Toast 側に出す |

強調に `bg-surface-accent text-ink` を使うのは、`TerminalPane` の選択中タブと同じ前例に揃えるため。**新しい役割トークンは足さない**（`--ok` は現状どこにも使われておらず、ここで初めて使うと配色の意図を1箇所だけ増やすことになる）。

**warning バナー行（`BANNER_ORDER`）は使わない。** あそこは「いま開いているプロジェクトの問題」を出す場所であり、アプリの更新は別の関心事である（`src/core/toasts.ts` 冒頭の「バナーは続いている状態、トーストは起きた出来事」という M5 の線引きに従う）。

**mac ではこのボタンを描画しない。** `latest.json` に `darwin-*` を載せない以上、mac で押せば必ず「最新版です」と表示することになり、**嘘をつくボタン**になる。判定は既存の `currentPlatform() === 'mac'` を使う。

#### 起動時チェック

`useEffect` で1回だけ走らせる。`readLastProjectDir` による復元と同じ形（`useRef` の一回性ガード ＋ `cancelled` フラグ）を踏襲する。**失敗は静かに握り潰す**（`console.error` のみ）——ネットワークが無い環境で起動するたびにエラーが出るのは雑音でしかない。

**エラーを利用者に見せるのは、利用者が自分でボタンを押したときだけ。** そのときは Toast に出す。

#### 適用の流れ

`available` のボタンを押す → **`pushModal` で `kind: 'confirm'` を積む**（既存のモーダルキューに乗せる。`key` は `'update'`）→ 承諾でダウンロード開始 → 進捗を Toast（`key: 'update-progress'` で置き換え）→ インストール（アプリ終了）。

確認ダイアログの文面は**端末セッションが動いているかで変える**（`hasRunning(terminal)` が既にある）:

- 動いていない: 「更新のため facet を終了します。編集内容は自動保存済みです。」
- 動いている: 「更新のため facet を終了します。**Claude Code のセッションは切断されます。**編集内容は自動保存済みです。」

**「更新後に facet を開き直してください」も文面に含める。** 自動で戻ってくるかは実機確認まで確定しないため（下の「未検証」）、戻ってこない場合でも利用者が迷子にならない文面を先に置く。実機で自動復帰が確認できたら、この一文を削る。

### 7. リリース手順（`scripts/make-latest-json.mjs` 新規、`docs/release.md` 新規）

スクリプトがやることは3つだけ。判断は置かない。

1. **`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` のバージョン3箇所が一致するか検査し、違えば異常終了する。** 現状この3つは手で揃えられており、ずれると `latest.json` の `version` と実際の成果物が食い違う——**その食い違いは「更新したのに更新されない」という最も分かりにくい壊れ方をする**
2. `src-tauri/target/release/bundle/nsis/facet_<v>_x64-setup.exe.sig` を読む
3. `latest.json` を書き出す:

```json
{
  "version": "1.1.0",
  "notes": "https://github.com/Pryo-46/facet/releases/tag/v1.1.0",
  "pub_date": "2026-08-19T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<.sig の中身をそのまま>",
      "url": "https://github.com/Pryo-46/facet/releases/download/v1.1.0/facet_1.1.0_x64-setup.exe"
    }
  }
}
```

アップロードはスクリプトにやらせない（`gh release create` に成果物として渡す）。**`latest.json` を毎リリースの asset として上げ忘れると更新経路が止まる**ので、`docs/release.md` の手順に必ず含める。

`docs/release.md` には次を書く: 鍵の生成、環境変数（`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`）、ビルド、スクリプト実行、`gh release create` に渡す asset 一覧、mac の dmg を別途 mac で作って同じリリースに足すこと。

### 8. 署名鍵の保管

```
npm run tauri signer generate -- -w ~/.tauri/facet.key
```

- **公開鍵は `tauri.conf.json` にコミットする**（公開して問題ない。むしろ配布物に埋め込む必要がある）
- 秘密鍵はリポジトリ外（`~/.tauri/facet.key`）。パスワードを付ける
- **この鍵を失うと、以後どのバージョンからも自動更新できなくなる。** 公開鍵は配布済みのアプリに焼き込まれており、新しい鍵で署名した更新はそれらのアプリから検証に失敗する。復旧手段は「利用者に手でインストールし直してもらう」しかない
- したがって **`docs/release.md` の手順に「秘密鍵とパスワードをパスワードマネージャへバックアップする」を人間の作業として明記する**

## テスト方針

- `src/core/update-check.ts` の遷移テスト（vitest）:
  - `checking` 中の再チェック要求が無視される
  - `installing` 中の再チェック要求が無視される
  - `available` → `startInstall` → `progress` の累計が正しい
  - `failed` から `startCheck` で再挑戦できる
  - `buttonLabel` / `isEmphasized` が各状態で期待どおり
- `src/fs/updater.ts` は Tauri API を呼ぶだけの層なので、単体テストは置かない（既存の `src/fs/*` と同じ扱い）
- `src/App.dom.test.tsx` に統合ケースを追加（`vi.mock('@/fs/updater', ...)`。既定値は「更新なし」に揃え、他の describe の前提を崩さない）:
  - 起動時チェックで新版が見つかると、ヘッダのボタンが強調表示に変わる
  - 起動時チェックが失敗しても画面に何も出ない
  - 手動チェックが失敗すると Toast が出る
  - ボタンを押すと確認ダイアログが出て、承諾するまで `install` が呼ばれない
  - 端末セッションが動いているとき、確認ダイアログの文面に切断の警告が入る
  - `currentPlatform()` が `'mac'` のときボタンが描画されない
- `scripts/make-latest-json.mjs` のバージョン整合チェックのテスト（一致/不一致）
- Rust 側はプラグイン登録のみなので `cargo test` に追加しない。既存スイートが通ることだけ確認する

### 実機確認（人間の手が要る）

エージェントは Tauri の GUI を操作できない。以下は人間が行う。

**一番現実に近い検証は、中身の変更がほぼ無い v1.0.1 を本物のリリースとして出し、v1.0.0 から実際に更新されるかを見ること。** ローカルの静的サーバで `latest.json` を配る代用も可能だが、本番と経路（HTTPS・GitHub のリダイレクト・`releases/latest/download` の解決）が違うため、確認したいことが確認できない。

確認項目:

1. v1.0.0 を起動して、ヘッダのボタンが強調表示に変わるか
2. 押して確認ダイアログ → ダウンロード進捗 Toast → インストールまで通るか
3. **UAC が出ないか**（`nsis.installMode: currentUser` の想定どおりか）
4. **SmartScreen が出ないか**（updater が起動するインストーラに mark-of-the-web が付かない想定どおりか）
5. **更新後にアプリが自動で戻ってくるか**
6. 戻ってきた（あるいは手で開いた）アプリのバージョンが 1.0.1 になっているか
7. ネットワークを切って起動し、何も表示されないこと（静かな失敗）
8. ネットワークを切って手動チェックを押し、Toast にエラーが出ること

## 未検証として残るもの

- **更新後にアプリが自動で再起動するか。** Windows ではインストール実行時に OS がプロセスを落とすため、`relaunch()` に到達しない可能性が高い。`passive` モードでは NSIS 側が再起動する想定だが、[`quiet` では再起動しない既知の不具合](https://github.com/tauri-apps/tauri/issues/7560)がある以上、`passive` でも実機で見るまで確定しない。**戻ってこなかった場合は不具合として追わず、確認ダイアログの文面（§6）で吸収する**
- **未署名の exe を updater が起動したときに SmartScreen が出るか。** ブラウザ経由でないため mark-of-the-web が付かず出ない見込みだが、実機で確認する
- **インストーラの種類は一致していなければならない**（NSIS で入れたなら NSIS で更新する）。MSI は `bundle.targets` から既に外してあるので現状問題ないが、[取り違えると更新が失敗する](https://github.com/tauri-apps/tauri/issues/7931)。`docs/release.md` に一文残す

## 参照

- [Tauri v2 Updater プラグイン](https://v2.tauri.app/plugin/updater/)
- rev 7章（ロジックは TypeScript 側、Rust 側に判断を置かない）
- `docs/history/m18-restore-last-folder.md`（起動時 effect の一回性ガードの前例）
