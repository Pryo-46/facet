# Skill をプラグインとして配る（設計）

## 背景・目的

アプリはプロジェクトフォルダを開くたび、同梱 Skill を `<project>/.claude/skills/` へ置き直す。**この「置き直す」構造だけのために、mac の fs 実行時 scope 許可（`allow_skill_dir`）・削除失敗の握りつぶし・`node_modules` の保護・書き込み権限が要る。** 利用者から見れば、自分のフォルダに facet が勝手にディレクトリを作る。

同じ構造がもう1つの制約も生む。Skill が届くのは facet でフォルダを開いた人だけで、**外の Claude Code は同じデータを前にしても登録 Skill を持たない。**

本マイルストーンは Skill を Claude Code のプラグインへ移す。狙いは2つで、アプリがプロジェクトフォルダに1バイトも書かなくなることと、facet を開かずに Skill が使えることである。

### 到達点

| | いま | あと |
| --- | --- | --- |
| プロジェクトフォルダへの書き込み | `.claude/skills/` 5本＋`README-for-AI.md` | **無し**（利用者が編集した JSON だけ） |
| 外の Claude Code | Skill 無し | `plugin install` で使える |
| Skill 名 | `glossary-term-register` | `facet:register-term` |
| fs の削除・作成権限 | 必要 | **不要** |

## スコープ

**やること**

- 登録 Skill 5本を `plugins/facet/skills/` へ移し、リポジトリを marketplace にする
- アプリの端末で `claude` を起動するとき、未導入なら同梱プラグインを `--plugin-dir` で渡す
- `README-for-AI.md` の内容を読み取り用 Skill へ移し、書き出しを廃止する
- 同梱 Skill の同期機構と、それが要求していた権限を撤去する
- 生成物 `scripts/generated/*.mjs` を追跡対象にする
- Skill を動詞から始まる名前へ改め、文書とアプリ内の文言を追従させる

**やらないこと**

- **旧版が置いた `<project>/.claude/skills/` の削除。** 検出して利用者に消すよう促すだけで、アプリは消さない。誤って利用者の Skill を消す経路を残さないため
- `palette-retheme` の移動。facet 自身のソースを触る開発用で、配布物ではない
- プラグインの版とアプリの版を機械的に一致させる仕組み。導入済みの版が古いことは起こり得るが、スキーマの移行が吸収する（`overview-rev.md` 5章）

## 設計

### 1. リポジトリの構成

```
facet/
  .claude-plugin/marketplace.json        # marketplace "facet"
  plugins/facet/
    .claude-plugin/plugin.json
    skills/
      read-project/                      # 読み方ガイド（読み取り専用）
      register-term/
      register-error/
      create-sequence/
      create-logic-tree/
      create-issue-tree/
  .claude/skills/palette-retheme/        # 開発用。移さない
```

`marketplace.json` の `plugins[].source` は `./plugins/facet`、`plugin.json` は `name` / `description` / `version` / `author` を持つ。`claude plugin validate plugins/facet` がこの4つで警告なく通る。

`scripts/gen-skills.mjs` の出力先と `src/core/skill-schema-copy.test.ts` の参照パスが移動に追従する。

### 2. Skill の名前

**名前は動詞から始める。** プラグイン名が前に付いて `facet:register-term` と読まれるので、対象名だけでは何をする Skill か分からない。

| いま | あと | 動詞の理由 |
| --- | --- | --- |
| `glossary-term-register` | `register-term` | プロジェクトに1つのマスタへ追記する |
| `error-catalog-register` | `register-error` | 同上 |
| `sequence-register` | `create-sequence` | ファイルを新しく作る |
| `logic-tree-register` | `create-logic-tree` | 同上 |
| `issue-tree-register` | `create-issue-tree` | 同上 |
| （`README-for-AI.md`） | `read-project` | 読むだけで書かない |

**名前は英数字とハイフンに限る。** 日本語を置くと非 ASCII が落ちて `facet:-----` に潰れる。日本語は `description` と本文が担う。

改名はディレクトリ名・`SKILL.md` の `name`・`gen-skills.mjs` の `SKILL_SOURCES`・書き出しのスモークテスト・各ツールの `docs/<tool>/` に一斉に及ぶ。

### 3. 配布の2経路

| 経路 | 誰が使うか | 入手 |
| --- | --- | --- |
| marketplace | 外の Claude Code | `claude plugin marketplace add Pryo-46/facet --sparse .claude-plugin plugins` → `claude plugin install facet@facet` |
| アプリ同梱 | facet の端末ペイン | `tauri.conf.json` の resources に `"../plugins/facet": "plugin"` |

`--sparse` があるので、install する側はアプリのソースを clone しない。

**アプリは導入済みのプラグインに譲る。** 端末セッションを開く前に `claude plugin list --json` を1回実行し、`id` が `facet@facet` の要素が `enabled` なら `--plugin-dir` を渡さない。判定が失敗したときは渡す側に倒す（Skill が無いより、同じ Skill が2つ見えるほうが軽い）。

引数の組み立ては純関数に置き、判定結果3通り（導入済み／未導入／判定失敗）をテストで固定する。

### 4. 読み方ガイドの Skill 化

`src/core/reading-guide.md` の内容は「`type` での判別・ID の解決・未決の扱い・ツール別の読み方」で、そのまま Skill の中身になる。`plugins/facet/skills/read-project/SKILL.md` へ移し、description は「`type: glossary` などの JSON があるフォルダを読む・要約する・質問に答えるとき」とする。

登録 Skill 5本が個別に持つ同じ前提はこのガイドへの参照に置き換える。

**失うのは「フォルダを開けば必ず目に入る」ことである。** 発火は description に依存し、プラグインを導入していない Claude には届かない。プラグイン導入を前提に置く設計なので、この差は受け入れる。

### 5. 生成物を追跡する

marketplace は git の内容をそのまま配るので、`scripts/generated/*.mjs` が追跡外だと install 先で Skill が動かない。`.gitignore` の除外を外し、生成物をコミットする。

**原本は変わらず `schemas/*.schema.json` と `src/` の側にある。** ズレは `npm run gen:skills` の後に `git diff --exit-code` を置いて検出する（生成は `pretest` で既に走る）。

### 6. 旧版の残骸

旧版を使ったフォルダには `<project>/.claude/skills/` の5本が残る。プロジェクトスコープの Skill はプラグインより先に見つかるので、**放置すると古い版が発火する。**

アプリはフォルダを開いたときに同梱名のディレクトリと `README-for-AI.md` の存在だけを見て、あればトーストで消すよう促す。読むだけなので `fs:allow-remove` は要らない。

### 7. 撤去するもの

| 対象 | 理由 |
| --- | --- |
| `src/core/skill-sync.ts` と対応するテスト | 置き直しをしない |
| `src/fs/skill-resources.ts` | 同上 |
| Rust の `allow_skill_dir` | 書き込み先が無い |
| capabilities の `fs:allow-mkdir` / `fs:allow-remove` / `$RESOURCE/skills/**` | 同上 |
| `README-for-AI.md` の書き出し | Skill へ移る |

`overview-rev.md` の「Skillの配布と同期」と「読み方ガイド」の節、`project-setup.md` の capabilities 表が同時に置き換わる。

### 8. facet 自身の開発

`.claude/settings.json` にリポジトリ自身を project スコープの marketplace として宣言し、このリポジトリで作業する Claude が移動後の Skill をそのまま使えるようにする。

## 検証

- `claude plugin validate plugins/facet` を CI に載せる
- 起動引数の純関数を3通りでテストする
- スキーマのバイト一致テストは移動後のパスで通す
- 生成物のコミット漏れを `git diff --exit-code` で検出する

**実機確認（人間）**

1. `plugin install` した Claude Code で、facet のフォルダを開かずに用語登録 Skill が発火すること
2. アプリの端末ペインで、未導入の状態でも Skill が使えること
3. 導入済みの状態で、同じ Skill が2つ現れないこと
4. 旧版が置いた `.claude/skills/` があるフォルダで、削除を促すトーストが出ること

## 実測

- `claude --plugin-dir <dir>` はディレクトリを読み、Skill は `<plugin名>:<skill名>` として現れる
- `claude plugin list --json` は `id`（`<plugin>@<marketplace>`）と `enabled` を返す
- `claude plugin marketplace add` は `--sparse <paths...>` を持ち、モノレポの一部だけを取得できる
- `plugin.json` は `name` / `description` / `version` / `author` で警告なく通る
- Skill 名の非 ASCII は落ちる（`用語を登録` は `facet:-----` になる）
