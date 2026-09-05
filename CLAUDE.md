# facet — 作業のしかた

## 実装計画は worktree を作ってから書く

マイルストーンの実装計画（`docs/superpowers/plans/YYYY-MM-DD-*.md`）を書くときは、**先に worktree を作り、その中で計画ファイルを書いてコミットする。**

```
1. EnterWorktree（例: m7-design-tokens）
2. その worktree の中で計画を書く
3. その worktree で計画をコミットする（各マイルストーンの最初のコミットになる）
4. 実装 → PR → マージ
```

**主チェックアウト（`C:\Dev\Projects\facet`）で計画ファイルを作らないこと。**

理由は2つある。M6 で両方とも実際に踏んだ。

- **マージ後の `git pull` が止まる。** 計画ファイルは追跡対象（M1 から一貫して各マイルストーンの最初のコミット）なので、主チェックアウトに同名の未追跡ファイルがあると「未追跡ファイルが上書きされる」で pull が中断する
- **より悪いのは、残った未追跡コピーが着手前の古い版であること。** 計画は着手前のスキャンで修正されることがある（M6 では分割線の誤りなど3件を `739a79b` で直した）。主チェックアウトに残るのはその修正が入っていない版なので、**次にそのファイルを開いた人が誤った計画を読む**

主チェックアウトに計画の未追跡コピーが残ってしまったら、`git show origin/main:<path>` と突き合わせて古い方を消すこと。中身が違うなら、消すべきは未追跡のコピーの方である。

## マージ後の後片付け（この順で行う）

**1. 実機確認の痕跡を捨てる**（worktree の中で）

`sample-project/` は **README から参照するお手本であり、同時に動作確認の遊び場でもある**。JSON 5本は追跡対象なので、実機確認で編集したら**元に戻す**（お手本の変更は、意図してそう決めたときだけコミットする）。`README-for-AI.md` と `.claude/` はアプリが自動で置き直す配布物、書き出した `.md` は確認の痕跡で、いずれも `sample-project/.gitignore` で追跡外にしてある。

```
git checkout -- sample-project/ && git clean -fdx sample-project/
git status --short          # 空になること
```

`-x` を付けるのは、`.gitignore` した自動生成物（アプリが置き直す `.claude/` 一式。**その `skills/*/scripts/generated/` は `npm run gen:skills` が作る生成物で、原本は `schemas/` と `src/` の側にある**——M30 より前はここに `npm install` 済みの `node_modules` が入り数百 MB になっていた）も落とすため。**お手本の JSON は追跡対象なので `checkout` が戻す**——`clean` では消えない。

**2. マージする**（PR 経由でも `git merge` でも）

**3. 主チェックアウトを最新にする**

```
cd <主チェックアウト>
git pull
npm install                 # ← 省略しない
```

**`npm install` を飛ばさないこと。** マージが依存を増やしていることがあり（M6 では `@tauri-apps/plugin-clipboard-manager`）、古い `node_modules` のままだと `tsc -b` が「モジュールが見つからない」で落ちる。**このエラーは直前に触った変更のせいに見えるので、原因を誤診する。** 実際 M6 の後に一度踏んだ。

```
npm test && npx tsc -b && npm run lint   # ここで緑を確認してから次へ
(cd src-tauri && cargo test)             # Rust 側（M17 から。npm test には含まれない）
```

**4. worktree を消す**

`ExitWorktree`（`action: "remove"`）が「N コミットを失う」と警告することがあるが、**主チェックアウトの `main` が古いだけ**のことが多い。消す前に確認する:

```
git branch -r --contains <ブランチの先頭コミット>   # origin/main が出れば失うものは無い
```

**5. 残骸を掃除する**

worktree の実体は `node_modules` と `src-tauri/target` で数 GB になる。`ExitWorktree` がディレクトリを消しきれないことがあり、`.claude/worktrees/` に空の殻が溜まる。

```
rm -rf .claude/worktrees/<今回作成したWorktreeフォルダ>/*
git worktree prune          # 登録だけ残った幽霊を消す
git worktree list           # 主チェックアウトだけになること
```

削除時の「Device or resource busy」は、`npm run tauri dev` かエクスプローラがまだ掴んでいる。閉じてから再実行すれば消える。

## ドキュメント

**入口は [`docs/README.md`](docs/README.md)。** 読者は Claude だけで、人間は読まない。文書は3種類に分かれる。

| 種類 | 文書 | 扱い |
| --- | --- | --- |
| 正（規範） | `docs/overview-rev.md`／`docs/missing-semantics.md`／`docs/<tool>/`／`docs/project-setup.md` | いま従う設計判断。変わったら該当する文を置き換える |
| 現在の状態 | `docs/open-issues.md` | Claude が着手できる残件の一覧。解消したら消す |
| 記録 | git のコミットと PR | 経緯はここにだけある。文書には書かない |

**実装計画を書く前に読むもの**: `docs/lessons-for-planning.md`、`docs/open-issues.md`、対象ツールの `docs/<tool>/` の scope。

`rev N章` は `docs/overview-rev.md` の N 章を指す通称。**ファイル名と章番号は動かさない。**

## 文書の書き方

- **現在形で書く。** 経緯・マイルストーン番号・日付・「消した／足した」の記録は書かない。経緯は git のコミットと PR にある
- 1項目は2文まで。太字は1段落に1箇所まで。全角括弧の入れ子を作らない
- 既存文書の文体に合わせるのではなく、この規則に合わせる
- 文書の運用に関する規約（何をどこに書くか・件数を数えるか）は `CLAUDE.md` にあるものだけ。他の文書の書きぶりから運用規約を推定して計画に転記しない

## マイルストーン完了時に触る2箇所

1. **`docs/open-issues.md`** — 解消した項目を消し、見つけた項目を足す。上書きであり、変更の記録は残さない
2. **`docs/overview-rev.md`** — 設計判断が変わったときだけ、該当する章の文を書き換える。追記ではなく置換

`docs/history/` は作らない。申し送りに相当する内容は PR の本文に書く。

## 人間への依頼

- 人間の作業（実機確認・署名鍵・配布・スクリーンショット撮影・仕様の裁定）は文書に書かない。**実装完了時の最終メッセージと PR 本文で依頼する。** 実機確認のチェックリストは PR 本文に置く
- `docs/open-issues.md` に載せるのは Claude が着手できる項目だけ

## 計画とレビュー

- 計画の Global Constraints に「文書の書き方」を継承させる
- レビューは文書の差分に対して「削れる文があるか」「現在形か」を見る。「書いてあるか」だけで合否を決めない
- `docs/lessons-for-planning.md` への追記は規則1行だけ。エピソードは PR の本文に書く

## 採番

コア・用語集・エラーカタログは `MN`、ロジックツリー・シーケンス・課題ツリーは `<tool>-mN`。ブランチ名と計画ファイル名に使う。
