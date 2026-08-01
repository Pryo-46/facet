# facet

仕様整理ツール詰め合わせ。第1弾は用語集。

Tauri（Windows ターゲット優先）+ React + TypeScript。**ロジックは全て TypeScript 側に置き、Rust は書かない。** Tauri は fs / dialog の標準プラグインを提供する層としてのみ使う（理由は `docs/setup/setup-instructions.md` 1章）。

現在の状態は **M0（足場のみ）**。アプリの機能はまだ何も実装していない。

## 使い方

```
npm install        # 依存の導入＋スキーマからの型生成
npm run tauri dev  # アプリを起動
npm test           # Vitest
npm run build      # 型チェック＋フロントのビルド
```

Rust ツールチェーン（`cargo`）が必要。`npm run tauri dev` の初回は Rust のコンパイルに数分かかる。

## スキーマと型

`schemas/glossary.schema.json` が用語集の**正**。TypeScript の型は手書きせず、ここから生成する。

```
npm run gen:types  # → src/types/glossary.ts
```

生成物はコミットしない（`.gitignore` 済み）。`npm install` / `dev` / `build` / `test` の前に自動で再生成されるため、スキーマと型がズレることはない。

用語集を書き込む Skill（`.claude/skills/glossary-term-register/`）も**このファイルを直接参照する**。スキーマのコピーを増やさないこと。Skill 側は親ディレクトリを遡って探すので設定は不要だが、明示したい場合は環境変数 `FACET_GLOSSARY_SCHEMA` で渡せる。

## 色

コンポーネントに色値を直書きしない。`src/index.css` 末尾で定義した役割トークン（`ink` / `warning` / `ok` ＋無彩色系）を経由する。

**現在の色値は仮置き。** ドッグフーディング後に確定する。ライトとダークは別パレットで、反転による自動生成はしない（反転すると警告色が背景に沈む）。

## `.gitattributes`

`*.json text eol=lf` は必須。これが無いと autocrlf 環境で JSON が CRLF 化し、アプリが LF で書き出す正規形が Git 上で無意味になって毎回全行 diff が出る。「変更履歴を仕様の変更履歴として読める」という設計目的が壊れる。

## ドキュメント

- `docs/overview-rev.md` — 設計方針
- `docs/setup/setup-instructions.md` — M0 の環境構築指示書
- `docs/glossary-session-notes.md` — 用語集スキーマの決定経緯
