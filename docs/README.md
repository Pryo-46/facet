# ドキュメントの地図

facet は「人間は構造化された UI で入力し、ツールが網羅性の担保・描画・構造化テキスト出力を担う」会議用ツール群。用語集エディタが1本目、エラーカタログが2本目、ロジックツリーが3本目（キャンバス系の1本目）、シーケンスが4本目（キャンバス系の2本目）、課題ツリーが5本目（キャンバス系の3本目）。状態遷移が続く予定。

## どれを読むか

| 知りたいこと | 読むもの |
| --- | --- |
| なぜこの設計なのか | [`overview-rev.md`](overview-rev.md) — **全体方針の「正」**。3〜10章が設計制約の本体。他の文書はここを `rev N章` の形で参照する |
| UI の見た目がなぜそう決まったか（色は意味だけ・欠落は線・判断は面） | [`facet-UI設計ノート.md`](facet-UI設計ノート.md) — **UI の設計ノート**（診断と決定 D1〜D19。**A〜F への分割は設計スペック [`superpowers/plans/2026-08-23-m21-design-tokens-v2-design.md`](superpowers/plans/2026-08-23-m21-design-tokens-v2-design.md) の末尾にある**。A（色の規約）は M21、C（未定義表現の本体）は M22、B（タイポグラフィ）は M23 で実装した。**D（レイアウト固定）は M24 で幅だけ決着した**——ノード幅の固定は実装し、**テーブルの行高固定＋2行省略は「変えない」と決め**、**ツリーの高さの打ち切りは実装したあと実機で撤回した**（`textarea` がキャレットに追従しない。D3 の「M24 での実施結果」の追記節）。**F（見送り集計の別枠・select 置換・角丸統一）は M25 で決着した**（U4「破線エッジの意味」も同時に決着）。**E（フォント同梱）は M26 で実装した**——IBM Plex 3書体を woff2 のみの生成 CSS で同梱し、D8 は「カラム名の階層をウェイトに移さない」という形で決着した（U2・U3 も同時に、実装からの言語化として書き起こした）。**残るのは D の高さ（省略。M24 で撤回済み）のみ**で、[`open-issues.md`](open-issues.md) の「デザイン」節に1項ある。**その決着は M26 の中で人間に諮る**） |
| どのデータが欠落か・欠落の集計と行番号での指し方 | [`missing-semantics.md`](missing-semantics.md) — **欠落の規約**（判定源は `src/core/reading-guide.md` と一対一。M22） |
| 何をどの順で作るか（用語集） | [`glossary/scope.md`](glossary/scope.md) |
| 用語集の仕様がなぜそう決まったか | [`glossary/session-notes.md`](glossary/session-notes.md) |
| 何をどの順で作るか（ロジックツリー） | [`logic-tree/logic-tree-m1-scope.md`](logic-tree/logic-tree-m1-scope.md) |
| ロジックツリーのキャンバスがなぜこの技術なのか | [`logic-tree/logic-tree-canvas-tech-notes.md`](logic-tree/logic-tree-canvas-tech-notes.md) |
| 何をどの順で作るか（シーケンス） | [`sequence/sequence-m1-scope.md`](sequence/sequence-m1-scope.md) |
| シーケンスの仕様がなぜそう決まったか（異常系を「描く」ではなく「問う」） | [`sequence/sequence-design-notes.md`](sequence/sequence-design-notes.md) |
| エラーカタログの仕様がなぜそう決まったか | [`error-catalog/error-catalog-session-notes.md`](error-catalog/error-catalog-session-notes.md) |
| 課題ツリーの仕様がなぜそう決まったか（ステータスを持たず追記だけで現在が決まる） | [`issue-tree/仮説検証モジュール-設計ノート.md`](issue-tree/仮説検証モジュール-設計ノート.md) — **課題ツリーの設計の「正」**（判断 D1〜D11・スコープの IN/OUT。俯瞰の表現は D10、保留は D11） |
| 環境・ビルド・Tauri の前提 | [`project-setup.md`](project-setup.md) |
| リリースの出し方・署名鍵の扱い | [`release.md`](release.md) |
| **いま何が壊れている／未着手か** | [`open-issues.md`](open-issues.md) — **生きた文書**。解消したら消す |
| **計画を書く前に知るべき失敗** | [`lessons-for-planning.md`](lessons-for-planning.md) |
| あのマイルストーンで何が起きたか | [`history/`](history/) — 追記専用。以後変えない |
| 実装計画・設計スペック | [`superpowers/plans/`](superpowers/plans/)  |
| 役目を終えた文書 | [`archive/`](archive/) |

## 文書の3つの寿命

構成はこの区別でできている。**書き足すときは、その情報がどの寿命かを決めてから場所を選ぶ。**

| 寿命 | 文書 | 扱い |
| --- | --- | --- |
| **正（living・規範）** | `overview-rev.md`, `missing-semantics.md`, `glossary/*`, `project-setup.md` | 実装で確定した設計判断は**ここへ反映する**。マイルストーンの完了コミットで済ませ、TODO として申し送りに残さない |
| **現在の状態（living・可変）** | `open-issues.md` | 解消したら**消す**。消した事実は `history/` に残る |
| **記録（append-only・不変）** | `history/`, `lessons-for-planning.md` | そのとき何が起きたかの監査証跡。後から書き換えない（`lessons-` は一般化した規則を足していく） |

`history/` に書いた残件を「今も開いているか」の判断材料にしないこと。それは `open-issues.md` の仕事。

## マイルストーンの履歴

ファイル名は `mN-<機能>-<主題>.md`。機能はフォルダで分けず名前に入れている——マイルストーンはツールを跨ぐことがあり（M6 は用語集とコアの半々）、フォルダで強制すると嘘になるため。`docs/history/*glossary*` で機能横断に引ける。

**採番は複数系統ある（現在4系統）。** コア・用語集・エラーカタログの流れは通し番号（`M1`〜`M25`）だが、**ロジックツリーは `logic-tree-mN`、シーケンスは `sequence-mN`、課題ツリーは `issue-tree-mN` で独立して採番する**——これらのツールは自分の段階（M1〜）を持ち、上の流れと**並行して進む**ため、通し番号にすると同じ `M11` が複数生まれる。ツールが独自の段階を切ったときは同じ形（`<tool>-mN`）で採番すること。

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
| [M13](history/m13-core-file-titles-and-list-grouping.md) | ファイルの名前と一覧の種類別ソート | コア |
| [M14](history/m14-core-ui-polish.md) | 額縁・サイドメニュー・各ツール画面の見た目整理 | コア |
| [M15](history/m15-skill-hygiene.md) | 同梱 Skill とアプリの複製・同期の衛生 | コア |
| [M16](history/m16-test-homework.md) | テストの宿題 | コア・シーケンス |
| [M17](history/m17-core-terminal-fixes.md) | 端末ペインの残件6件（配色・入力・プロセスの寿命） | コア |
| [M18](history/m18-restore-last-folder.md) | 起動時に直近フォルダを自動で復元する | コア |
| [M19](history/m19-core-auto-update.md) | Windows の自動アップデート | コア |
| [M20](history/m20-core-canvas.md) | キャンバス基盤のコア化 | コア |
| [M21](history/m21-core-design-tokens-v2.md) | 役割トークン v2——色を持つのは意味だけ | コア・デザイン |
| [M22](history/m22-core-missing-semantics.md) | 欠落の規約——空は空のまま、数えて、行番号で指す | コア・デザイン |
| [M23](history/m23-core-typography.md) | タイポグラフィスケール v2——3サイズ4段、密度は行高で稼ぐ | コア・デザイン |
| [M24](history/m24-core-node-width-lock.md) | ツリーのノード幅固定——幅を導出しない、高さは3行で止める | コア・ロジックツリー・課題ツリー・デザイン |
| [M25](history/m25-core-ui-note-f.md) | UI ノート F の決着——見送りの別枠集計・⚠ のアイコン化・select 置換・角丸統一 | コア・用語集・エラーカタログ・課題ツリー・デザイン |
| [M26](history/m26-core-font-bundle.md) | フォント同梱——IBM Plex 3書体を woff2 で同梱し、OS 依存の導出をやめる | コア・デザイン |
| [logic-tree-m1](history/logic-tree-m1-keyboard-editor.md) | キーボードで打ち切れるキャンバスエディタ | ロジックツリー |
| [sequence-m1](history/sequence-m1-keyboard-editor.md) | ステップ入力＋全ステップに立つ「失敗したら？」の問い | シーケンス |
| [sequence-m2](history/sequence-m2-usability.md) | 会議で使ってみて出た使い勝手9点 | シーケンス |
| [sequence-m3](history/sequence-m3-mouse-and-output.md) | マウス操作と出力（Markdown・Mermaid） | シーケンス |
| [sequence-m4](history/sequence-m4-register-skill.md) | シーケンス登録 Skill（会話→ JSON） | シーケンス・コア |
| [issue-tree-m1](history/issue-tree-m1-editor.md) | 課題ツリーエディタ（ステータスを持たない追記型イベント列） | 課題ツリー |
| [issue-tree-m2](history/issue-tree-m2-register-skill.md) | 課題ツリー登録 Skill（会話→ JSON）とお手本 | 課題ツリー・コア |
| [issue-tree-m3](history/issue-tree-m3-overview-ui.md) | 課題ツリーの俯瞰 UI と語彙（箱は課題だけ・仮説は行・判断は1つ） | 課題ツリー・コア（初の schemaVersion 移行）・デザイン |

## ツールが増えたとき

```
docs/glossary/        scope.md  session-notes.md
docs/logic-tree/      logic-tree-m1-scope.md  logic-tree-canvas-tech-notes.md
docs/error-catalog/   error-catalog-session-notes.md   ← エラーカタログのツールセッションで増えた3本目
docs/sequence/        sequence-m1-scope.md  sequence-design-notes.md
docs/issue-tree/      仮説検証モジュール-設計ノート.md  仮説検証モック.jsx  俯瞰モック/  ← 設計ノートが「正」。モックは見え方の参考
                        （俯瞰モック/ は issue-tree-m3 の3枚。facet の実トークン・実寸法で描いた静止 HTML で、寸法はここから逐語で取る）
docs/history/         m10-....md  logic-tree-m1-....md  sequence-m1-....md  ← フォルダは1本。採番だけ複数系統
docs/open-issues.md                                    ← ツール横断で1本
```

ファイル名は `scope.md` / `session-notes.md` に固定していない。ツールごとに1フォルダを切ることだけが規約で、中身のファイル名・本数はツールセッションの都合に合わせてよい（`logic-tree/` と `error-catalog/` の実例を参照）。

## リポジトリ内の他の「正」

- `schemas/*.schema.json` — 各ツールのデータ形式の**正**。型（`src/types/*.ts`）はここから生成する。**コピーを作らない**（Skill 側も同じ実体を読む）
- `.claude/skills/` — AI 側の実装。**2種類ある**——ユーザーのデータを作るもの（用語集・エラーカタログ・シーケンス・課題ツリー。アプリと**正規形が完全一致**していなければならない。`src/core/skill-sync.ts` の `BUNDLED_SKILLS` に載り、プロジェクトフォルダへコピーされる）と、アプリ自身のソースを触るもの（`palette-retheme`。配色の差し替え。同梱しない）
- `../CLAUDE.md` — 作業のしかた（worktree の使い方、マイルストーン完了時に触る場所）
