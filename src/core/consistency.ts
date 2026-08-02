/**
 * 整合性検証（レベル2＝受け入れて赤表示。rev 5章）の共通型。
 * スキーマ検証（レベル1）と違い、不合格でもファイルは開けて編集を継続できる。
 * 検証ロジックは2箇所に分かれる（rev 6章の責務内訳）:
 * - モジュール内検証: 自ファイルで完結する検証。各モジュールの checkConsistency
 * - コア横断検証: 単一ファイルでは判定できない検証。core/project-consistency.ts
 */
export interface ConsistencyLocation {
  /** 該当エンティティの ID */
  entityId: string
  /** セルまで特定できる場合のフィールド名。'id' は「行全体」の意味で使う（ID 列は UI に無い） */
  field: string | null
}

export interface ConsistencyIssue {
  /** ルール識別子（安定。テストと UI が参照する） */
  rule: string
  /** 人間向けの日本語メッセージ（ファイル一覧・エディタに表示） */
  message: string
  /** 赤表示すべき箇所。ファイル単位の問題（単一性違反など）は空配列 */
  locations: ConsistencyLocation[]
}
