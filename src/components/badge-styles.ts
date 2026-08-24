/**
 * 状態のバッジのクラス組み立て（rev 9章 M21）。**意味だけを受け、形は部品が持つ。**
 *
 * 語彙は「開いているものは淡い面と線、決着したものは濃い面」：
 *   open     欠落・まだ見ていない（未定義・未決・仮説なし）  missing の淡い面＋破線
 *   hold     欠落・見たが決められない（保留）                missing の淡い面＋実線
 *   invalid  無効（重複・参照切れ・整合性違反）              invalid の淡い面＋実線
 *   pending  着信（返答していない入力＝未判断）              pending の淡い面＋実線
 *   yes      支持                                            judge-yes の濃い面
 *   no       棄却                                            judge-no の濃い面
 *   deferred 見送り                                          surface-muted の面・rule の枠
 *   faint    抑制された配下（いま作業する面ではない）        ink-faint の枠と文字
 *
 * **クラス名は完全な字面で書くこと。** Tailwind の走査は静的なので、
 * `text-${色}` のように組み立てると生成 CSS に載らず画面だけが無色になる。
 *
 * `h-[20px]` は任意値だが、conventions.test.ts が弾く任意値は `text-[...]` だけ。
 * 文字は `text-sm`（M23 決定1。14px の補助段）。`leading-none` の行箱 14px ＋枠 2px＝16px を
 * `items-center` が箱 20px の中で上下 2px ずつの余白で挟む
 */
export type BadgeVariant = 'open' | 'hold' | 'invalid' | 'pending' | 'yes' | 'no' | 'deferred' | 'faint'

/** バッジ自身の高さ（px）。課題ツリーの measure.ts が行の高さをここから導く */
export const BADGE_BOX_HEIGHT = 20
/** 横の余白（px-1.5 = 6px）と枠線（1px）。幅の算出（layout.ts）が使う */
export const BADGE_PADDING_X = 6
export const BADGE_BORDER = 1

const base =
  'inline-flex h-[20px] items-center rounded border px-1.5 text-sm leading-none font-medium whitespace-nowrap'

// yes / no は面なので枠を透明にする（border を base に持たせ、全語で高さと幅の計算を揃えるため）
const faces: Record<BadgeVariant, string> = {
  open: 'border-dashed border-missing bg-missing-face text-missing',
  hold: 'border-missing bg-missing-face text-missing',
  invalid: 'border-invalid bg-invalid-face text-invalid',
  pending: 'border-pending bg-pending-face text-pending',
  yes: 'border-transparent bg-judge-yes text-judge-yes-fg',
  no: 'border-transparent bg-judge-no text-judge-no-fg',
  deferred: 'border-rule bg-surface-muted text-ink-muted',
  faint: 'border-ink-faint text-ink-faint',
}

export function badgeClass(variant: BadgeVariant): string {
  return `${base} ${faces[variant]}`
}
