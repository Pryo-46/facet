import type { ErrorField } from './fields'

/**
 * 出力プロファイル（M10 決定11）。
 *
 * **プロファイルが持つのはフィールドの並び1本だけ。** ここから
 * 画面の列（No ＋ fields）と Markdown の列（No ＋ fields − resolutionLevel）の
 * 両方を導出する。列セットの定義が2箇所にあると、片方だけ直したときに黙ってずれる。
 *
 * `fields` に `resolutionLevel` を含めるのは**画面には列として出す**ため。
 * 出力で列から消えるのは、グルーピング軸が h3 見出しになるからであって、
 * プロファイルが持っていないからではない
 */
export type ProfileId = 'support' | 'dev'

export interface ErrorProfile {
  /** 安定識別子。列幅ストアの鍵・出力プロファイルの id・テストが参照する */
  id: ProfileId
  /** ツールバーのトグルと出力ドロップダウンの表示名 */
  label: string
  /**
   * 書き出しの既定ファイル名に足す接尾辞。
   * **`label` から導出しない**（rev 6章 規約5。表示名は画面の都合で変わるが、
   * 書き出したファイル名は Git に成果物として残る側）
   */
  fileSuffix: string
  /** このプロファイルが扱うフィールドの並び */
  fields: readonly ErrorField[]
}

export const SUPPORT_PROFILE: ErrorProfile = {
  id: 'support',
  label: 'サポート向け',
  fileSuffix: '-サポート向け',
  fields: [
    'name',
    'occurrence',
    'resolutionLevel',
    'causeForSupport',
    'userAction',
    'supportAction',
    // エンジニアの対応もサポート向けに載せる（サポートが「エンジニアに何を
    // 依頼すべきか」を書けるようにするため。session-notes 2-6）
    'engineerAction',
  ],
}

export const DEV_PROFILE: ErrorProfile = {
  id: 'dev',
  label: '開発向け',
  fileSuffix: '-開発向け',
  fields: [
    'name',
    'occurrence',
    'resolutionLevel',
    'causeForSupport',
    'causeForSpec',
    'userAction',
    'supportAction',
    'engineerAction',
    'notes',
  ],
}

/** 並び順＝出力ドロップダウンとツールバーのトグルの並び。既定はサポート向け */
export const PROFILES: readonly ErrorProfile[] = [SUPPORT_PROFILE, DEV_PROFILE]

/**
 * Markdown の列（No 列を除く）。`resolutionLevel` は h3 のグループ見出しに
 * なるので列からは落とす
 */
export function markdownFields(profile: ErrorProfile): readonly ErrorField[] {
  return profile.fields.filter((f) => f !== 'resolutionLevel')
}
