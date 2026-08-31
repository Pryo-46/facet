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

`sample-project/` は **README から参照するお手本であり、同時に動作確認の遊び場でもある**。JSON 4本は追跡対象なので、実機確認で編集したら**元に戻す**（お手本の変更は、意図してそう決めたときだけコミットする）。`README-for-AI.md` と `.claude/` はアプリが自動で置き直す配布物、書き出した `.md` は確認の痕跡で、いずれも `sample-project/.gitignore` で追跡外にしてある。

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

**入口は [`docs/README.md`](docs/README.md)**（どこに何があるかの地図）。文書は寿命で3つに分かれている:

| 寿命 | 文書 | 扱い |
| --- | --- | --- |
| **正**（規範） | `docs/overview-rev.md`（全体方針）／`docs/glossary/`（ツール別）／`docs/project-setup.md`（技術前提） | 実装で確定した設計判断は**ここへ反映する** |
| **現在の状態**（可変） | `docs/open-issues.md` | 解消したら**消す** |
| **記録**（不変） | `docs/history/mN-*.md`（マイルストーンの申し送り）／`docs/lessons-for-planning.md`（計画の教訓） | 後から書き換えない |

`docs/history/` に書かれた残件を「今も開いているか」の判断に使わないこと。それは `open-issues.md` の仕事。

**実装計画を書く前に読むもの**: `docs/lessons-for-planning.md`、`docs/open-issues.md`、直近1〜2本の `docs/history/`、対象ツールの `docs/<tool>/scope.md`。

## マイルストーン完了時に触る3箇所

1. **`docs/history/mN-<機能>-<主題>.md` を新規作成** — そのとき何が起きたか（実装で確定した事項・見つかった欠陥・実機確認の結果）。以後変えない
2. **`docs/open-issues.md` を編集** — 解消したものを消し、新たに見つけたものを足す。**消し忘れると残件が幽霊として残り、足し忘れると静かに消える**
3. **`docs/overview-rev.md` へ反映**（設計判断が確定したなら）＋ 教訓があれば `docs/lessons-for-planning.md` に追記

**rev への反映は完了コミットで済ませ、TODO として申し送りに残さない。** 次の計画者は rev を「正」として読むため、反映漏れは設計と実装の食い違いとして伝播する（M4 の教訓）。

`rev N章` は 249 箇所から参照されている通称。**`overview-rev.md` のファイル名と章番号は動かさない。**
