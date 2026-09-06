import type { BadgeVariant } from '@/components/badge-styles'
import type { BadgeGroup, IssueEventKind } from './derive'

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
 * 課題の**旗**（`IssueEventKind`）を、仮説の判断と同じ `BadgeGroup` へ写す。
 *
 * **`Record<IssueEventKind, BadgeGroup>` にしてある**——旗の種別が増えたら
 * `tsc` がここで落ちる（`switch` や手書きの三項に畳むと黙って古びる。
 * `derive.ts` の `ISSUE_EVENT_LABELS` と同じ理由）。
 *
 * - `resolved` → `yes`（判断の緑）。「答えが出た」は仮説の**支持**と同じ結論の色。
 *   キャンバスの「バッジ語彙」アートボードが解決を `b-yes` と定めている
 * - `deferred` → `deferred`（見送りの群＝`surface-muted` の面・`rule` の枠）
 *
 * **読み手は2つある**——課題の箱の旗のバッジと、帯の別枠チップ（どちらも
 * `IssueTreeEditor.tsx`）。**同じ語が場所によって色を変えないための1箇所**なので、
 * どちらかに写像を書き写さないこと。両方が同じ面を出すことは
 * `IssueTreeEditor.dom.test.tsx` の「帯の別枠チップと箱のバッジは同じ面を出す」が見る。
 *
 * **箱の側は `badgeVariantOf` へ渡すこと。** 抑制された配下では旗の種別によらず
 * `faint` へ落ちる（第2引数）——「いま作業する面ではない」が種別より優先する。
 * 直に `badgeClass` へ渡すと、その落とし込みが消える。
 * **帯のチップは通さない**——木全体の集計であって、どの枝の下にも居ないため
 *（`false` を渡す形にすると「抑制されうる」と読めてしまう）
 */
export const FLAG_BADGE_GROUPS: Record<IssueEventKind, BadgeGroup> = {
  deferred: 'deferred',
  resolved: 'yes',
}

/**
 * 帯の集計チップの `OpenKind` → variant 対応（仮説なし・未決＝破線 `open`、
 * 保留＝実線 `hold`、FB待ち＝着信の青 `pending`）は `derive.ts` の
 * `toMissingTally` にある（帯そのものは共通部品 `MissingTally` で、
 * variant は `MissingTallyPart` が運ぶので、ここに個別の
 * `chipVariantOf` を置く理由は無い）。対応表そのものは
 * `toMissingTally` の実装とテスト（`derive.test.ts`）を見ること
 */
