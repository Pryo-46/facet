# 技術セットアップの前提

> **完了済み。やり直さないこと。** 計画フレームワークが想定する出発点（リポジトリが存在し、テストがグリーンで通る状態）は M0 として実施済み。**実装計画の第1タスクを環境構築にしないこと。**
>
> ツール横断の前提であり、用語集固有ではない。M0 の手順書そのものは [`archive/setup-instructions.md`](archive/setup-instructions.md) にある。

## 構成

- **Tauri 2 ＋ Vite ＋ React ＋ TypeScript。** `npm run tauri dev` で起動する
- **Tailwind CSS ＋ shadcn/ui。** 役割トークンは `src/index.css` にあり、値は仮置き（確定は M7）
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

**Rust は原則書かない**（[`overview-rev.md`](overview-rev.md) 7章）。ロジックは全て TypeScript 側。例外は次の2つだけ。

- **自前の Tauri コマンドは `move_to_trash` の1本**（OS のゴミ箱へ移す。fs プラグインは完全削除しか持たない）。判断は置かず `trash` クレートを呼ぶだけ。**自前コマンドは ACL 対象外なので capabilities への追記は要らない**
- **プラグインの登録**（`lib.rs` の `.plugin(...)` 1行と Cargo 依存1行）。判断もロジックも持たないので原則の例外ではない

**新しい Tauri の JS API を使うたびに `src-tauri/capabilities/default.json` を確認すること。** 権限が無いと**実行時に静かに動かない**。これまでに3回踏んでいる:

| API | 必要だったもの | 欠けたときの症状 |
| --- | --- | --- |
| `window.destroy()`（close 横取り） | `core:window:allow-destroy` | ウィンドウが閉じなくなる |
| `watch()`（フォルダ監視） | Cargo feature `watch` ＋ `fs:allow-watch` | 監視が静かに始まらない |
| `exists()`（新規作成の名前解決） | `fs:allow-exists` | — |

`dialog:default` は `allow-save` を含むので保存ダイアログに追記は不要。**`save()` で選んだパスは dialog プラグインが fs の実行時 scope へ入れる**ので、プロジェクトフォルダの外へも書ける。
