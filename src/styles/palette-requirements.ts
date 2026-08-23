/**
 * `palette.css` が満たすべき**契約**。
 *
 * ★ ここは配色ではない。★ 色値は1つも持たない。「どのトークンが要るか」
 *   「どの面の上で何:1 を満たすべきか」「面どうしの明度差」「意味色の色差」
 *   「どのトークンが無彩色か」だけを持つ。
 *   **配色を差し替えてもこのファイルは変わらない。**
 *
 * 読み手は2つある——`palette.test.ts`（検査する）と
 * `.claude/skills/palette-retheme/scripts/palette-fit.mjs`（差し替え時に測る）。
 * **同じ表を2箇所に書かないためにここへ出した。** 書き写すと、片方だけ
 * 直したときに検算と検査が食い違ったまま両方が緑を返す。
 *
 * **このファイルは上記の `.mjs` から Node の型ストリップで直接 import される**
 * （設計スペック 決定H）。だから消去可能な構文だけで書くこと——`enum` や
 * コンストラクタのパラメータプロパティを入れると型ストリップが落ちる。
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
  'surface-muted',
  'ink',
  'ink-muted',
  'ink-faint',
  'rule',
  'grid',
  'missing',
  'invalid',
  'pending',
  'judge-yes',
  'judge-yes-fg',
  'judge-no',
  'judge-no-fg',
] as const

export type Token = (typeof TOKENS)[number]

export const MODES = [
  { label: 'ライト', pattern: ':root' },
  { label: 'ダーク', pattern: '\\.dark' },
] as const

/**
 * 背景に対して満たすべきコントラスト。
 *
 * **`grid` がここに無いのは意図的。** 方眼紙の線は純粋な装飾であり、
 * WCAG 1.4.11（情報を伝える非テキスト UI 要素は 3:1）の対象外。
 * むしろ薄いことに意味がある（M7 設計スペック 決定2）
 */
export const REQUIREMENTS = [
  { token: 'ink', min: 4.5, use: '本文・見出し' },
  { token: 'ink-muted', min: 4.5, use: '抑えた文字' },
  // **非アクティブな内容の文字と枠。** WCAG 1.4.3 は非アクティブ UI 部品を
  // 本文の 4.5:1 から免除しているが、読めなくてよいわけではない——
  // 「いま作業する面ではない」と読めて、かつ消えて見えない段として 3:1 を課す。
  // **アクティブな本文に使わない**（使うと本文の保証を割る）
  { token: 'ink-faint', min: 3.0, use: '非アクティブの文字・枠（抑制された配下）' },
  { token: 'rule', min: 3.0, use: 'セル境界・入力枠' },
  // 意味色3軸は線と文字にしか使わないが、**文字**に使う以上 4.5:1 が要る
  { token: 'missing', min: 4.5, use: '欠落（未定義・未決・仮説なし・保留）の線と文字' },
  { token: 'invalid', min: 4.5, use: '無効（重複・参照切れ・整合性違反）の線と文字' },
  { token: 'pending', min: 4.5, use: '着信（返答していない入力）の線と文字' },
] as const

/**
 * **背景は canvas / surface / surface-muted の3面を見る。**
 * テーブルもカードもモーダルも surface の上に乗るので canvas だけでは足りない
 * （ダークの rule を canvas だけ見て決めたとき surface 上で 2.997:1 と 3:1 を割った）。
 * surface-muted（一段沈んだ面）も、選択中タブ・種類見出し・見送りの箱として
 * 文字とバッジと罫線が載る汎用の面なので、同じ集合に入れる。
 * M8 の `surface-accent` を集合に入れなかった判断（淡い緑を選べなくなる）は、
 * 面が無彩色になった今は効かない——無彩色の面なら 3:1 / 4.5:1 は明度だけで作れる
 */
export const BACKGROUNDS = ['canvas', 'surface', 'surface-muted'] as const

/**
 * 判断の面に載せる文字色の要件。judge-yes-fg / judge-no-fg は自分の面にしか
 * 載らない専用の文字色で、`BACKGROUNDS` に対して測る意味が無い
 */
export const FACE_REQUIREMENTS = [
  { token: 'judge-yes-fg', face: 'judge-yes', min: 4.5, use: '支持の面の文字' },
  { token: 'judge-no-fg', face: 'judge-no', min: 4.5, use: '棄却の面の文字' },
] as const

/**
 * 面どうしの明度差。支持と棄却は正反対の結論なので、白黒印刷でも
 * 判別できる 3:1 を課す（UI ノート D15「支持を明るく、棄却を暗く」）
 */
export const FACE_PAIRS = [{ a: 'judge-yes', b: 'judge-no', min: 3.0 }] as const

/**
 * 意味色どうしの識別。**標準・P型・D型のすべてで** OKLab の色差が
 * `DISTINCT_MIN` 以上であること。M7 は warning/ok の色差を印字するだけで
 * 失敗させなかった（M7 決定4）が、意味色が4つに増えた今は
 * 「色は当てにならない」と学習された瞬間に警告機能が死ぬので、門番にする。
 *
 * **満たせないときは 0.08 まで下げてよい。** 下げたらこの定数の隣に
 * 実測値と理由を書く。閾値を黙って消さない（設計スペック 決定5）
 */
export const DISTINCT_PAIRS = [
  { a: 'missing', b: 'invalid' },
  { a: 'missing', b: 'pending' },
  { a: 'missing', b: 'judge-yes' },
  { a: 'invalid', b: 'pending' },
  { a: 'invalid', b: 'judge-yes' },
  { a: 'pending', b: 'judge-yes' },
] as const
export const DISTINCT_MIN = 0.1

/**
 * 無彩色でなければならないトークン。「色を持つのは意味だけ」（rev 9章）を
 * 機械検査にする。微かな暖色（M7 の canvas は C 0.012）も装飾なので弾く
 */
export const ACHROMATIC = [
  'canvas',
  'surface',
  'surface-muted',
  'ink',
  'ink-muted',
  'ink-faint',
  'rule',
  'grid',
  'judge-no',
  'judge-no-fg',
] as const
export const ACHROMATIC_MAX_C = 0.01

/**
 * **書いた C と、実際に出る C のずれの上限。**
 *
 * `oklch(L C H)` は sRGB より広いので、C を上げすぎた値はブラウザ（と
 * `oklchToLinear`）が sRGB へクランプする。クランプされてもコントラストも
 * ΔE も通るため、「C 0.12 の黄土」と書いたまま 0.102 の色が出ている状態を
 * 誰も見つけられない——M21 のライトの `missing` が実際にそうだった。
 * 往復（oklch → 線形 sRGB → oklch）で C が戻るかどうかで見る
 */
export const GAMUT_MAX_C_DRIFT = 0.005

/**
 * 閾値ちょうどを置かない（M7 の教訓）。**この余裕は `palette-fit.mjs` の
 * 提案（`fitLightness` に渡す条件）とも共有する。** 値を変えるならここ
 * 1箇所を直せば両方に効く——書き写すと片方だけ直したときに食い違う。
 */
export const MARGIN = 1.03
