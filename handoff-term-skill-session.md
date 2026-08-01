# 引き継ぎ: 用語登録Skill作成セッション

作成日: 2026-07-23 ／ 前提: overview-rev.md（handoff-04 の反映後）＋ glossary-session-notes.md ＋ glossary.schema.json
※ ファイル名を handoff-05 としないのは、rev が過去文書として handoff-05 を参照しており番号が衝突するため。

## 目的（handoff-04 からの継承）

AI連携の全ラウンドトリップを最小構成で通す検証。
**Skillがスキーマを読む → ユーザーにヒアリングして用語集JSONを書く → アプリが二段検証して開く。**

用語集スキーマは確定済み（glossary.schema.json）。このセッションの成果物は Skill 一式のみ。

## Skill の構成（rev 4章の決定を反映）

1. **SKILL.md**: ヒアリング手順と出力仕様
   - ヒアリングで name / kind / definition / aliases を埋める。ユーザーが即答できない項目は `undecided`・空文字のまま書いてよい（アプリ側で warning 可視化される設計。無理に埋めさせない——埋まっていない事実こそが情報）
   - 出力仕様に正規形（下記）を含める。ただしこれは緩和策であり、保証はアプリの受け口（rev 5章）
2. **ID採番スクリプト**: nanoid `customAlphabet`（A-Za-z0-9 の62文字）・10文字、`term_` プレフィクス付与。SKILL.md に「IDは必ずこれで採番せよ」と明記
3. **書き込み前検証スクリプト**: glossary.schema.json でのバリデーション。スキーマファイルはアプリと同一の実体を参照（正は一つ。コピーを同梱しない）

## 正規形（2026-08-01 確定。正は rev 5章「正規形の定義」。以下は要約）

- キー順: スキーマの properties 記載順（エンベロープ: schemaVersion → type → title → terms ／ 用語: id → name → kind → definition → aliases → notes）。**ハードコードせず実行時にスキーマから読む**
- インデント: スペース2 ／ 区切りは `JSON.stringify(v, null, 2)` 準拠 ／ 非ASCIIはエスケープしない ／ 改行: LF ／ 末尾改行あり ／ UTF-8（BOMなし）
- 改行の担保としてプロジェクト雛形に `.gitattributes`（`*.json text eol=lf`）を同梱する（追加決定。autocrlf による全行diffの回避）
- 提案値からの変更点: なし（追加規定として 区切り・非ASCII・キー順の参照方式・.gitattributes を明文化）

## 検証チェックリスト（このセッションで実地確認すること）

- [ ] ラウンドトリップ成立: Skill が書いたファイルをアプリが開ける（スキーマ検証通過）
- [ ] **ID捏造の検出**: わざと存在しないID・不正形式ID（連番、11文字、`_`入りID等）を混ぜたファイルを用意し、スキーマ検証（形式違反→レベル1）と整合性検証（重複→レベル2）がそれぞれ捕まえることを確認
- [ ] 正規形の努力目標が機能するか: Skill 出力がそのまま正規形になっているか（diff ノイズの実測）
- [ ] 最小登録のラウンドトリップ: `undecided`・空 definition のまま書かれた用語が warning 可視化されるか
- [ ] alias 重複（同一用語内・用語間）がレベル2で赤表示されるか

## 依存関係の登録

- Skill は `type: glossary` × `schemaVersion: 1` に紐づく（rev 4章の追従管理）。Skill 側にこの対応を明記すること

## 蒸し返さないこと（handoff-04 セッションで決定済み）

MCP的な書き込みツールは作らない（Skill＋同梱スクリプト方式で確定）／スキーマ・enum・ID規約の内容（glossary-session-notes.md 参照）／正規化の保証はアプリの受け口
