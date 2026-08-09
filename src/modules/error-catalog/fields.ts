import type { ErrorEntry } from '@/types/error-catalog'

/**
 * エラーカタログエディタのフィールド宣言（M10 決定8）。
 * ID は列に出さない（機械用の参照キーであり、人間が常時見る情報ではない）。
 *
 * **並びはスキーマの properties 記載順と一致させること**（fields.test.ts が検査する）。
 * 正規形のキー順・画面の列順・出力の列順を1つの並びに揃えておくと、
 * どこかだけがずれるという事故が起きない
 */
export const ERROR_FIELDS = [
  'name',
  'occurrence',
  'resolutionLevel',
  'causeForSupport',
  'causeForSpec',
  'userAction',
  'supportAction',
  'engineerAction',
  'notes',
] as const

export type ErrorField = (typeof ERROR_FIELDS)[number]

/** 値が string のフィールド（resolutionLevel だけが enum なので外れる） */
export type ProseField = Exclude<ErrorField, 'resolutionLevel'>

export type ResolutionLevel = ErrorEntry['resolutionLevel']

export const FIELD_LABELS: Record<ErrorField, string> = {
  name: 'エラー名',
  occurrence: '発生タイミング',
  resolutionLevel: '解決レベル',
  // 開発向けでは2つの原因が並ぶので、括弧で粒度を書き分ける
  causeForSupport: '原因（業務）',
  causeForSpec: '原因（仕様）',
  userAction: 'ユーザーの対応',
  supportAction: 'サポートの対応',
  engineerAction: 'エンジニアの対応',
  notes: '備考',
}
