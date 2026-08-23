import type { BadgeVariant } from '@/components/badge-styles'
import type { BadgeGroup } from './derive'
import type { OpenKind } from './open-targets'

/**
 * 課題ツリーの語彙（`BadgeGroup` / `OpenKind`）を共通部品の variant へ写す。
 * **部品は課題ツリーの語彙を知らない**——この対応だけがモジュール側に残る。
 *
 * 抑制された配下は群を問わず `faint`（「いま作業する面ではない」）。
 * `opacity-*` で薄くしない——検算したコントラストを割る
 */
export function badgeVariantOf(group: BadgeGroup, suppressed: boolean): BadgeVariant {
  if (suppressed) return 'faint'
  return group
}

/**
 * 帯の集計チップ。仮説なし・未決は「まだ見ていない」（破線）、保留は
 * 「見たが決められない」（実線）、**未判断は着信**（レビューの FB に
 * 返答していない＝欠落ではなく受信箱。rev 9章 M21）
 */
export function chipVariantOf(kind: OpenKind): BadgeVariant {
  switch (kind) {
    case 'hold':
      return 'hold'
    case 'judgement':
      return 'pending'
    case 'hypothesis':
    case 'result':
      return 'open'
  }
}
