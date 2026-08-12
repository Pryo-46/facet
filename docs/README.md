# ドキュメントの地図

facet は「人間は構造化された UI で入力し、ツールが網羅性の担保・描画・構造化テキスト出力を担う」会議用ツール群。用語集エディタが1本目、エラーカタログが2本目、ロジックツリーが3本目（キャンバス系の1本目）、シーケンスが4本目（キャンバス系の2本目）。状態遷移が続く予定。

## どれを読むか

| 知りたいこと | 読むもの |
| --- | --- |
| なぜこの設計なのか | [`overview-rev.md`](overview-rev.md) — **全体方針の「正」**。3〜10章が設計制約の本体。他の文書はここを `rev N章` の形で参照する |
| 何をどの順で作るか（用語集） | [`glossary/scope.md`](glossary/scope.md) |
| 用語集の仕様がなぜそう決まったか | [`glossary/session-notes.md`](glossary/session-notes.md) |
| 何をどの順で作るか（ロジックツリー） | [`logic-tree/logic-tree-m1-scope.md`](logic-tree/logic-tree-m1-scope.md) |
| ロジックツリーのキャンバスがなぜこの技術なのか | [`logic-tree/logic-tree-canvas-tech-notes.md`](logic-tree/logic-tree-canvas-tech-notes.md) |
| 何をどの順で作るか（シーケンス） | [`sequence/sequence-m1-scope.md`](sequence/sequence-m1-scope.md) |
| シーケンスの仕様がなぜそう決まったか（異常系を「描く」ではなく「問う」） | [`sequence/sequence-design-notes.md`](sequence/sequence-design-notes.md) |
| エラーカタログの仕様がなぜそう決まったか | [`error-catalog/error-catalog-session-notes.md`](error-catalog/error-catalog-session-notes.md) |
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

**採番は複数系統ある。** コア・用語集・エラーカタログの流れは通し番号（`M1`〜`M10`）だが、**ロジックツリーは `logic-tree-mN`、シーケンスは `sequence-mN` で独立して採番する**——これらのツールは自分の段階（M1〜）を持ち、上の流れと**並行して進む**ため、通し番号にすると同じ `M11` が複数生まれる。ツールが独自の段階を切ったときは同じ形（`<tool>-mN`）で採番すること。

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
| [M9](history/m9-core-list-editor-and-output-profiles.md) | リストエディタのコア化と出力プロファイル | コア |
| [M10](history/m10-error-catalog-editor.md) | エラーカタログエディタ | エラーカタログ |
| [M11](history/m11-core-claude-code-pane.md) | Claude Code ペイン | コア |
| [logic-tree-m1](history/logic-tree-m1-keyboard-editor.md) | キーボードで打ち切れるキャンバスエディタ | ロジックツリー |
| [sequence-m1](history/sequence-m1-keyboard-editor.md) | ステップ入力＋全ステップに立つ「失敗したら？」の問い | シーケンス |

## ツールが増えたとき

```
docs/glossary/        scope.md  session-notes.md
docs/logic-tree/      logic-tree-m1-scope.md  logic-tree-canvas-tech-notes.md
docs/error-catalog/   error-catalog-session-notes.md   ← エラーカタログのツールセッションで増えた3本目
docs/sequence/        sequence-m1-scope.md  sequence-design-notes.md
docs/history/         m10-....md  logic-tree-m1-....md  sequence-m1-....md  ← フォルダは1本。採番だけ複数系統
docs/open-issues.md                                    ← ツール横断で1本
```

ファイル名は `scope.md` / `session-notes.md` に固定していない。ツールごとに1フォルダを切ることだけが規約で、中身のファイル名・本数はツールセッションの都合に合わせてよい（`logic-tree/` と `error-catalog/` の実例を参照）。

## リポジトリ内の他の「正」

- `schemas/*.schema.json` — 各ツールのデータ形式の**正**。型（`src/types/*.ts`）はここから生成する。**コピーを作らない**（Skill 側も同じ実体を読む）
- `.claude/skills/` — AI 側の実装。**2種類ある**——ユーザーのデータを作るもの（用語集・エラーカタログ。アプリと**正規形が完全一致**していなければならない）と、アプリ自身のソースを触るもの（`palette-retheme`。配色の差し替え）
- `../CLAUDE.md` — 作業のしかた（worktree の使い方、マイルストーン完了時に触る場所）
