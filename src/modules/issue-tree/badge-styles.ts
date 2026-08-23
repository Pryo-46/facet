import type { BadgeGroup } from './derive'

/**
 * 俯瞰のバッジの見た目（`docs/issue-tree/俯瞰モック/バッジ語彙.html` の6行）。
 *
 * **部品ではなく普通のモジュールに置く。** 畳んだ行・展開パネルの「判断」節・
 * 「以前の判断」・課題の見送り、と4箇所が同じ見た目を要る。部品の中に書くと
 * 写しが増え、片方だけ変わったときに「同じ意味なのに違う見た目」が静かに生まれる。
 *
 * **クラス名は完全な字面で書くこと。** Tailwind の走査は静的なので、
 * `` `text-${色}` `` のように名前を組み立てると生成 CSS にそのクラスが載らず、
 * 画面だけが無色になる（テストも tsc も検知しない）。ここでは**組み上がった
 * 断片どうしを繋ぐ**だけにしてある
 */

/**
 * バッジの共通の形。高さは `BADGE_HEIGHT`（20px）の行に収まる 18px。
 *
 * `h-[18px]` は任意値だが、`conventions.test.ts` が弾く任意値は `text-[...]`
 * だけである（`/\btext-(xl|[3-9]xl)\b|\btext-\[[^\]]*\]/`。実装時に確認済み）。
 * 文字は `text-xs`——モックは 11px だが、フォントサイズの段は
 * xs / sm / base / lg の4段しか持たない（M7 決定6）
 */
const base =
  'inline-flex h-[18px] items-center rounded px-1.5 text-xs leading-none font-medium whitespace-nowrap'

/**
 * 5語の面。**面を塗るのは決着した2語（支持・棄却）だけ**——開いている
 * （保留・未決）は枠で、エピックの外（見送り）は薄い枠で見せる。
 * `bg-ink text-surface` は新しい色の組ではない（`ink` が `surface` の上で
 * 4.5:1 を満たすことを `palette.test.ts` が見ており、比は対称）
 */
const faces: Record<BadgeGroup, string> = {
  yes: 'bg-ok text-ok-fg',
  no: 'bg-ink text-surface',
  hold: 'border border-warning text-warning',
  open: 'border border-dashed border-warning text-warning',
  deferred: 'border border-ink-muted text-ink-muted',
}

/**
 * 抑制された配下は群を問わず薄い枠だけ（「いま作業する面ではない」）。
 * **`opacity-*` で薄くしない**——検算したコントラストを割る。そのために
 * 明度の段（`ink-faint`）が足してある
 */
const faint = 'border border-ink-faint text-ink-faint'

export function badgeClass(group: BadgeGroup, suppressed: boolean): string {
  return `${base} ${suppressed ? faint : faces[group]}`
}
