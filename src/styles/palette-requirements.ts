/**
 * `palette.css` が満たすべき**契約**。
 *
 * ★ ここは配色ではない。★ 色値は1つも持たない。「どのトークンが要るか」
 *   「どの面の上で何:1 を満たすべきか」「半透明はどの濃さを使うか」だけを持つ。
 *   **配色を差し替えてもこのファイルは変わらない。**
 *
 * 読み手は2つある——`palette.test.ts`（検査する）と
 * `.claude/skills/palette-retheme/scripts/palette-fit.mjs`（差し替え時に測る）。
 * **同じ表を2箇所に書かないためにここへ出した。** 書き写すと、片方だけ
 * 直したときに検算と検査が食い違ったまま両方が緑を返す。
 */

/** コメントを落としてから読む（`}` を含むコメントがブロック抽出を壊さないように） */
export const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** `:root { ... }` / `.dark { ... }` から `--name: value` を拾う */
export function readTokenBlock(
  css: string,
  selectorPattern: string,
  label: string,
): Record<string, string> {
  const m = new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`).exec(css)
  if (m === null) throw new Error(`${label} のブロックが palette.css に見つからない`)
  const out: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const d = /^\s*--([a-z-]+)\s*:\s*([^;]+);/.exec(line)
    if (d !== null) out[d[1]] = d[2].trim()
  }
  return out
}

export const TOKENS = [
  'canvas',
  'surface',
  'surface-accent',
  'ink',
  'ink-muted',
  'rule',
  'grid',
  'warning',
  'ok',
  'warning-fg',
  'ok-fg',
] as const

export const MODES = [
  { label: 'ライト', pattern: ':root' },
  { label: 'ダーク', pattern: '\\.dark' },
] as const

/**
 * 背景に対して満たすべきコントラスト。
 *
 * **`grid` がここに無いのは意図的。** 方眼紙の線は純粋な装飾であり、
 * WCAG 1.4.11（情報を伝える非テキスト UI 要素は 3:1）の対象外。
 * むしろ薄いことに意味がある（設計スペック 決定2）
 */
export const REQUIREMENTS = [
  { token: 'ink', min: 4.5, use: '本文・見出し' },
  { token: 'ink-muted', min: 4.5, use: '抑えた文字' },
  { token: 'rule', min: 3.0, use: 'セル境界・入力枠' },
  { token: 'warning', min: 4.5, use: '未定義・削除' },
  { token: 'ok', min: 4.5, use: '確定・応答' },
] as const

/**
 * **背景は canvas と surface の両方を見る。**
 * テーブルもカードもモーダルも surface の上に乗るので、canvas だけで
 * 満たしても足りない（実際、ダークの rule を canvas だけ見て決めたとき
 * surface 上で 2.997:1 と 3:1 を割った）
 */
export const BACKGROUNDS = ['canvas', 'surface'] as const

/**
 * 半透明の重ね合わせ（M8 決定11）。**値は GlossaryEditor.tsx の
 * errorCell / warnCell と一致していなければならない**（下の紐づき検査が見る）
 */
export const OVERLAYS = [
  { label: 'エラーセル', alpha: 0.2, className: 'bg-warning/20' },
  { label: '未定義・未分類セル', alpha: 0.1, className: 'bg-warning/10' },
] as const

/**
 * これらの面の上に置く文字。**warning は置かない**（M8 決定12）——
 * 測ると warning/10 の面の上で 4.59:1 しか出ず、同系色が重なって読みにくい
 */
export const OVERLAY_FOREGROUNDS = [
  { token: 'ink', use: '本文' },
  { token: 'ink-muted', use: 'プレースホルダ「未定義」' },
] as const

/** 閾値ちょうどを置かない（M7 の教訓）。本文 4.5:1 に3%の余裕 */
export const OVERLAY_MIN = 4.5 * 1.03
