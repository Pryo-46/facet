# ドキュメントの地図

facet は「人間は構造化された UI で入力し、ツールが網羅性の担保・描画・構造化テキスト出力を担う」会議用ツール群。用語集・エラーカタログ・ロジックツリー・シーケンス・課題ツリーの5ツールがある。

## どれを読むか

| 知りたいこと | 読むもの |
| --- | --- |
| なぜこの設計なのか | [`overview-rev.md`](overview-rev.md)。全体方針の正。他の文書は `rev N章` の形で参照する |
| デザインの規約 | [`overview-rev.md`](overview-rev.md) 9章。診断の原則と決定 D1〜D20 |
| 欠落の規約 | [`missing-semantics.md`](missing-semantics.md)。判定源は `src/core/reading-guide.md` と一対一 |
| 用語集の範囲と仕様の理由 | [`glossary/scope.md`](glossary/scope.md)、[`glossary/session-notes.md`](glossary/session-notes.md) |
| ロジックツリーの範囲とキャンバスの技術 | [`logic-tree/logic-tree-m1-scope.md`](logic-tree/logic-tree-m1-scope.md)、[`logic-tree/logic-tree-canvas-tech-notes.md`](logic-tree/logic-tree-canvas-tech-notes.md) |
| シーケンスの範囲と仕様の理由 | [`sequence/sequence-m1-scope.md`](sequence/sequence-m1-scope.md)、[`sequence/sequence-design-notes.md`](sequence/sequence-design-notes.md) |
| エラーカタログの仕様の理由 | [`error-catalog/error-catalog-session-notes.md`](error-catalog/error-catalog-session-notes.md) |
| 課題ツリーの設計 | [`issue-tree/仮説検証モジュール-設計ノート.md`](issue-tree/仮説検証モジュール-設計ノート.md)。モックは `issue-tree/俯瞰モック/` |
| 環境・ビルド・Tauri の前提 | [`project-setup.md`](project-setup.md) |
| リリースの出し方 | [`release.md`](release.md) |
| いま何が残っているか | [`open-issues.md`](open-issues.md)。Claude が着手できる項目だけ |
| 計画を書く前に知るべき規則 | [`lessons-for-planning.md`](lessons-for-planning.md) |
| 実装計画・設計スペック | [`superpowers/plans/`](superpowers/plans/)、[`superpowers/specs/`](superpowers/specs/) |

## 文書の3種類

| 種類 | 文書 | 扱い |
| --- | --- | --- |
| 正（規範） | `overview-rev.md`、`missing-semantics.md`、各ツールのフォルダ、`project-setup.md` | いま従う設計判断。変わったら該当する文を置き換える |
| 現在の状態 | `open-issues.md` | 解消したら消す |
| 記録 | git のコミットと PR | 経緯はここにだけある。文書には書かない |

書き方の規則は [`../CLAUDE.md`](../CLAUDE.md) にある。

## ツールが増えたとき

`docs/<tool>/` を1フォルダ切る。中身のファイル名と本数はツールに合わせてよい。残件は `open-issues.md` にツール横断で1本。

## リポジトリ内の他の「正」

- `schemas/*.schema.json`: 各ツールのデータ形式の正。型（`src/types/*.ts`）はここから生成する
- `.claude/skills/`: AI 側の実装。ユーザーのデータを作る登録 Skill 5本（アプリと正規形が一致していなければならない）と、アプリ自身を触る `palette-retheme`
- `src/core/reading-guide.md`: 利用者のフォルダへ配る読み方ガイド
