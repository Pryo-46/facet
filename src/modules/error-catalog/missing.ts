import type { MissingTally } from '@/core/missing-tally'
import type { ErrorEntry } from '@/types/error-catalog'
import type { ErrorField, ResolutionLevel } from './fields'

/**
 * セルの欠落（黄色い面）の判定（M10 決定14）。
 *
 * M22 で `warnings.ts` から改名。判定源は reading-guide と一対一
 * （docs/missing-semantics.md）——中身の判定は変えていない。
 *
 * **欠落は `ConsistencyIssue` ではない。** 用語集と同じく、エディタが
 * この判定を直接見てセルを塗る（`term.definition === ''` を見ているのと同じ形）。
 * issue に載せると一覧が欠落で埋まり、赤の指摘が読めなくなる。
 *
 * **対応3種は「そのレベルが関与するとき」だけ黄色くする。** 全 Action の
 * 空文字を常に欠落にすると、ほとんどのエラーは1レベルしか関与しないため
 * 表の半分が常時黄色になり、警告としての信号が死ぬ。
 * `none`（誰にも解決できない）だけは3つとも対象——復旧不可でも
 * 「作り直してください」「この状態で進めて問題ありません」という案内は存在し、
 * そこがサポートサイトで最も需要の高い問い合わせになる（session-notes 2-3）
 */
const DECLARED_BY: Record<'userAction' | 'supportAction' | 'engineerAction', ResolutionLevel> = {
  userAction: 'user',
  supportAction: 'support',
  engineerAction: 'engineer',
}

export function isMissingCell(entry: ErrorEntry, field: ErrorField): boolean {
  switch (field) {
    // 発生タイミングと原因2種は resolutionLevel の宣言と無関係なので、空なら常に
    case 'occurrence':
    case 'causeForSupport':
    case 'causeForSpec':
      return entry[field] === ''
    case 'userAction':
    case 'supportAction':
    case 'engineerAction':
      return (
        entry[field] === '' &&
        (entry.resolutionLevel === DECLARED_BY[field] || entry.resolutionLevel === 'none')
      )
    case 'resolutionLevel':
      return entry.resolutionLevel === 'undecided'
    // name は空をスキーマが禁じており（minLength 1）、notes は検知対象外の自由メモ
    case 'name':
    case 'notes':
      return false
  }
}

/** 帯とジャンプの対象になるフィールド（対応3種を含む。関与判定は isMissingCell に任せる） */
export const TALLIED_FIELDS: readonly ErrorField[] = [
  'occurrence',
  'causeForSupport',
  'causeForSpec',
  'userAction',
  'supportAction',
  'engineerAction',
]

export function tallyMissing(errors: readonly ErrorEntry[]): MissingTally {
  let undecided = 0
  let blank = 0
  for (const entry of errors) {
    if (isMissingCell(entry, 'resolutionLevel')) undecided += 1
    for (const field of TALLIED_FIELDS) if (isMissingCell(entry, field)) blank += 1
  }
  const parts = [
    { kind: 'undecided', label: '未分類', count: undecided, variant: 'open' as const },
    { kind: 'blank', label: '未記入', count: blank, variant: 'open' as const },
  ].filter((p) => p.count > 0)
  return { total: undecided + blank, parts }
}
