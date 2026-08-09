# ドキュメントの地図

facet は「人間は構造化された UI で入力し、ツールが網羅性の担保・描画・構造化テキスト出力を担う」会議用ツール群。用語集エディタが1本目で、ロジックツリー / シーケンス / 状態遷移が続く予定。

## どれを読むか

| 知りたいこと | 読むもの |
| --- | --- |
| なぜこの設計なのか | [`overview-rev.md`](overview-rev.md) — **全体方針の「正」**。3〜10章が設計制約の本体。他の文書はここを `rev N章` の形で参照する |
| 何をどの順で作るか（用語集） | [`glossary/scope.md`](glossary/scope.md) |
| 用語集の仕様がなぜそう決まったか | [`glossary/session-notes.md`](glossary/session-notes.md) |
| 環境・ビルド・Tauri の前提 | [`project-setup.md`](project-setup.md) |
| **いま何が壊れている／未着手か** | [`open-issues.md`](open-issues.md) — **生きた文書**。解消したら消す |
| **計画を書く前に知るべき失敗** | [`lessons-for-planning.md`](lessons-for-planning.md) |
| あのマイルストーンで何が起きたか | [`history/`](history/) — 追記専用。以後変えない |
| 実装計画・設計スペック | [`superpowers/plans/`](superpowers/plans/)  |
| 役目を終えた文書 | [`archive/`](archive/) |

## 文書の3つの寿命

構成はこの区別でできている。**書き足すときは、その情報がどの寿命かを決めてから場所を選ぶ。**

| 寿命 | 文書 | 扱い |
| --- | --- | --- |
| **正（living・規範）** | `overview-rev.md`, `glossary/*`, `project-setup.md` | 実装で確定した設計判断は**ここへ反映する**。マイルストーンの完了コミットで済ませ、TODO として申し送りに残さない |
| **現在の状態（living・可変）** | `open-issues.md` | 解消したら**消す**。消した事実は `history/` に残る |
| **記録（append-only・不変）** | `history/`, `lessons-for-planning.md` | そのとき何が起きたかの監査証跡。後から書き換えない（`lessons-` は一般化した規則を足していく） |

`history/` に書いた残件を「今も開いているか」の判断材料にしないこと。それは `open-issues.md` の仕事。

## マイルストーンの履歴

ファイル名は `mN-<機能>-<主題>.md`。機能はフォルダで分けず名前に入れている——マイルストーンはツールを跨ぐことがあり（M6 は用語集とコアの半々）、フォルダで強制すると嘘になるため。`docs/history/*glossary*` で機能横断に引ける。

| | 主題 | |
| --- | --- | --- |
| [M1](history/m1-core-walking-skeleton.md) | 歩けるスケルトン | コア |
| [M2](history/m2-core-validation-layer.md) | 検証レイヤの完成 | コア |
| [M3](history/m3-glossary-editor-operability.md) | エディタの操作性 | 用語集 |
| [M4](history/m4-core-file-operations.md) | ファイル一覧の額縁とファイル操作 | コア |
| [M5](history/m5-core-external-change-detection.md) | 外部変更検知 | コア |
| [M6](history/m6-glossary-core-markdown-and-app-controller.md) | Markdown 出力と App の副作用切り出し | 用語集・コア |
| [M7](history/m7-core-design-tokens.md) | デザイントークン確定 | コア |
| [M8](history/m8-glossary-editor-appearance.md) | 用語集エディタの見た目と操作性 | 用語集 |

## ツールが増えたとき

```
docs/glossary/     scope.md  session-notes.md
docs/logic-tree/   scope.md  session-notes.md      ← 2本目はこう並ぶ
docs/history/      m7-....md  m8-....md            ← 時系列1本のまま
docs/open-issues.md                                ← ツール横断で1本
```

## リポジトリ内の他の「正」

- `schemas/*.schema.json` — 各ツールのデータ形式の**正**。型（`src/types/*.ts`）はここから生成する。**コピーを作らない**（Skill 側も同じ実体を読む）
- `.claude/skills/` — AI 側の実装。アプリと**正規形が完全一致**していなければならない
- `../CLAUDE.md` — 作業のしかた（worktree の使い方、マイルストーン完了時に触る場所）
