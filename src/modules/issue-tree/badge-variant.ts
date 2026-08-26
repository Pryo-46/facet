import type { BadgeVariant } from '@/components/badge-styles'
import type { BadgeGroup } from './derive'

/**
 * 課題ツリーの語彙（`BadgeGroup`）を共通部品の variant へ写す。
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
 * 帯の集計チップの `OpenKind` → variant 対応（仮説なし・未決＝破線 `open`、
 * 保留＝実線 `hold`、未判断＝着信の青 `pending`）は、**M22 で `derive.ts` の
 * `toMissingTally` に吸収した**（帯そのものが共通部品 `MissingTally` に
 * 置き換わり、variant は `MissingTallyPart` が運ぶため、ここに個別の
 * `chipVariantOf` を残す理由が無くなった）。対応表そのものは
 * `toMissingTally` の実装とテスト（`derive.test.ts`）を見ること
 */
