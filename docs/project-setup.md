# 技術セットアップの前提

> **完了済み。やり直さないこと。** 計画フレームワークが想定する出発点（リポジトリが存在し、テストがグリーンで通る状態）は M0 として実施済み。**実装計画の第1タスクを環境構築にしないこと。**
>
> ツール横断の前提であり、用語集固有ではない。M0 の手順書そのものは [`archive/setup-instructions.md`](archive/setup-instructions.md) にある。

## 構成

- **Tauri 2 ＋ Vite ＋ React ＋ TypeScript。** `npm run tauri dev` で起動する
- **Tailwind CSS ＋ shadcn/ui。** 役割トークンは `src/index.css` の `@theme inline` にあり、**色値は `src/styles/palette.css` だけが持つ**（M7 で確定。[`overview-rev.md`](overview-rev.md) 9章）
- **ウィンドウの初期サイズは 1280×800、最小は 1000×600**（`src-tauri/tauri.conf.json`）。用語テーブルの固定4列の合計が 736px、サイドバーが 256px なので、**1030px 付近から備考列が切れ始める**（M8 の実機確認で確認）。定義列が残り幅を吸収する構造上、狭めても横スクロールは出ず、代わりに列が潰れる——だから下限はウィンドウ側で持つ。初期値を 800×600 のままにすると起動した瞬間に崩れた状態から始まる
- **Vitest。** `npm test`。環境は既定 `node`、DOM テストのみファイル先頭の `// @vitest-environment jsdom` で切り替える
- **型生成。** `schemas/*.schema.json` → `src/types/*.ts` が `npm run gen:types` で通る
- **`.gitattributes` に `*.json text eol=lf`**（**必須。** Windows の autocrlf 下では、これが無いと commit 時に CRLF 変換され全行 diff になり、正規形の LF が Git 上で無意味になる）

## 計画時に前提を取り違えやすい点

- **型定義は書かない。** `src/types/glossary.ts` はスキーマからの生成物で、**コミットしていない**（`.gitignore` 済み）。`prepare` / `predev` / `prebuild` / `pretest` で自動再生成されるため、スキーマと型がズレることはない。手書きの型と二重管理しない
- **Tailwind は v4** で、`tailwind.config.js` も `postcss.config.js` も存在しない。トークンは CSS の `@theme inline` で定義する。旧来の JS 設定を前提にした手順は通らない
- **shadcn/ui は Radix ベース（`-b radix`）** で初期化済み。コンポーネント追加は `npx shadcn@latest add <名前>` で、必要になった時点で足す
- **`src/components/ui/**` は生成物**のため lint 対象外にしてある。手で整形しない
- **テストファイルも型チェック対象**（`tsconfig.test.json`）。M6 まで `exclude` の継承で素通りしていたのを塞いだ。`extends` した設定に `include` だけ書いても効かない

## Rust と capabilities

**Rust は原則書かない**（[`overview-rev.md`](overview-rev.md) 7章）。ロジックは全て TypeScript 側。例外は次の3つだけ。

- **自前の Tauri コマンドは `move_to_trash` の1本**（OS のゴミ箱へ移す。fs プラグインは完全削除しか持たない）。判断は置かず `trash` クレートを呼ぶだけ。**自前コマンドは ACL 対象外なので capabilities への追記は要らない**
- **PTY（擬似端末）のコマンド4本**（`pty_spawn` / `pty_write` / `pty_resize` / `pty_kill`。M11。Claude Code の端末ペインを本物の端末として動かすため）。判断は置かず、実行ファイル名も引数も TypeScript が渡す。**こちらも自前コマンドなので ACL 対象外**
- **プラグインの登録**（`lib.rs` の `.plugin(...)` 1行と Cargo 依存1行）。判断もロジックも持たないので原則の例外ではない

**新しい Tauri の JS API を使うたびに `src-tauri/capabilities/default.json` を確認すること。** 権限が無いと**実行時に静かに動かない**。下表の最初の5行はこれまでに実機で踏んだ実績。最後の2行（M18）は**先回りして入れた**もので、まだ実機で確認しておらず踏んだ実績ではない:

| API | 必要だったもの | 欠けたときの症状 |
| --- | --- | --- |
| `window.destroy()`（close 横取り） | `core:window:allow-destroy` | ウィンドウが閉じなくなる |
| `watch()`（フォルダ監視） | Cargo feature `watch` ＋ `fs:allow-watch` | 監視が静かに始まらない |
| `exists()`（新規作成の名前解決） | `fs:allow-exists` | — |
| `mkdir()` / `remove()`（M11。同梱 Skill をプロジェクトフォルダの `.claude/skills/` へ置き直す） | `fs:allow-mkdir` / `fs:allow-remove` | Skill が置かれず、端末で Skill が見つからない |
| `resolveResource()` ＋ `readDir()`（M11。同梱 Skill の読み出し） | `fs:allow-read-dir` / `fs:allow-read-text-file` の `$RESOURCE/skills/**` scope | 同上 |
| `writeImage()`（M18。図の PNG をクリップボードへ） | `clipboard-manager:allow-write-image` ＋ **Cargo feature `image-png`** | 画像コピーが実行時に失敗する（未確認——M18 の実機確認は未実施） |
| `writeFile()`（M18。PNG をファイルへ） | `fs:allow-write-file` | 画像保存が実行時に失敗する（同上） |

**`clipboard-manager:allow-write-text` があっても画像は書けない**（別権限）。`fs:allow-write-file` も同様に `fs:allow-write-text-file` とは別で、こちらが**バイナリ書き込み**（`writeFile`）用である。

**Cargo feature `image-png` が要るのは、`writeImage` に生の PNG バイト列を渡す形が documented な契約ではないため。** `@tauri-apps/plugin-clipboard-manager` の `writeImage` は「デコード済みの画像」を受け取る想定で（実装例は生 RGBA の `number[]`）、`html-to-image` が返す**エンコード済み PNG** を渡すには `@tauri-apps/api/image` の `Image.fromBytes(pngBytes)` を通す。この `fromBytes` が Tauri 側で `ico`/`png` のデコーダを要求するので、`src-tauri/Cargo.toml` の `tauri` 依存を `features = ["image-png"]` にしてある（[`overview-rev.md`](overview-rev.md) 7章の「feature 有効化は原則の例外ではない」——判断を持たず、ネイティブ機能を有効にするだけ）。**capabilities だけ足しても動かない**組み合わせなので、片方だけ直しても症状は変わらない。

`dialog:default` は `allow-save` を含むので保存ダイアログに追記は不要。**`save()` で選んだパスは dialog プラグインが fs の実行時 scope へ入れる**ので、プロジェクトフォルダの外へも書ける（画像の保存もこの経路に乗る）。
