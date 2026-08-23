/**
 * 色の計算。**主な用途は色の検証（テスト）だが、実行時にも1箇所から呼ぶ**
 * ——端末（xterm）は `oklch()` を解釈しないので、役割トークンを sRGB の
 * 16進へ変換する必要がある（M17。`src/core/terminal/theme.ts`）。
 *
 * 依存を足さない方針（M7 設計スペック 決定4）のため、oklch → 線形 sRGB →
 * 相対輝度の変換を自前で持つ。変換式は CSS Color 4 の定義そのまま。
 *
 * **このファイルは `.claude/skills/palette-retheme/scripts/palette-fit.mjs` から
 * Node の型ストリップで直接 import される**（設計スペック 決定H）。だから
 * 消去可能な構文だけで書くこと——`enum` やコンストラクタのパラメータ
 * プロパティを入れると型ストリップが落ちる。
 */

/** `oklch(L C H)` の3値。L は 0..1、C は 0 以上、H は度 */
export interface Oklch {
  L: number
  C: number
  H: number
}

/** 線形 sRGB。各成分 0..1（ガンマ補正前） */
export type LinearRgb = readonly [number, number, number]

/** 色覚型。protan＝1型2色覚、deutan＝2型2色覚 */
export type Vision = 'normal' | 'protan' | 'deutan'

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

/**
 * `oklch(0.921 0.012 96.4)` を数値へ。
 *
 * **アルファ付き（`oklch(... / .13)`）も null を返す。** palette.css は
 * 不透明な色だけを持つ規約なので、半透明が紛れ込んだらそれ自体が違反であり、
 * 黙って無視せず呼び出し側で落とせるようにする。
 */
export function parseOklch(value: string): Oklch | null {
  const m = /^oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\)$/.exec(value.trim())
  if (m === null) return null
  return { L: Number(m[1]), C: Number(m[2]), H: Number(m[3]) }
}

/** `parseAnyCssColor` の結果。`alpha` は 0..1（指定が無ければ 1） */
export interface ParsedColor {
  rgb: LinearRgb
  alpha: number
}

/**
 * テーマの配布物に現れる色をひととおり読む**緩いパーサ**。
 *
 * **`parseOklch` と役割が違う。** あちらは palette.css の門番で、
 * 「不透明な `oklch(L C H)`」以外を弾くのが仕事である。こちらは
 * 外から持ち込まれた値を受け取る入口なので、hex も hsl も `%` 表記も
 * アルファ付きも読む。**門番の方を緩めてはいけない。**
 *
 * 名前付き色（`red` / `chartreuse`）は読まない。テーマが使うことは稀で、
 * 148 色の対応表を持ち込む価値がない。
 */
export function parseAnyCssColor(value: string): ParsedColor | null {
  const v = value.trim().toLowerCase()

  const hex = /^#([0-9a-f]{3,8})$/.exec(v)
  if (hex !== null) {
    const d = hex[1]
    const expand = (s: string): string => (s.length === 1 ? s + s : s)
    let parts: string[]
    if (d.length === 3 || d.length === 4) parts = d.split('').map(expand)
    else if (d.length === 6 || d.length === 8) parts = (d.match(/../g) ?? []).slice()
    else return null
    const [r, g, b, a] = parts.map((p) => parseInt(p, 16) / 255)
    return {
      rgb: [decodeSrgb(clamp01(r)), decodeSrgb(clamp01(g)), decodeSrgb(clamp01(b))],
      alpha: a ?? 1,
    }
  }

  // 関数記法は「名前(引数列)」で共通に割る。区切りはカンマでも空白でも
  // よく、アルファは `/` の後ろ（CSS Color 4）かカンマの4つ目に来る
  const fn = /^(rgba?|hsla?|oklch)\(([^)]*)\)$/.exec(v)
  if (fn === null) return null
  const [rawArgs, rawAlpha] = fn[2].split('/')
  const args = rawArgs.trim().split(/[\s,]+/).filter((s) => s !== '')
  const alphaText = rawAlpha ?? (args.length === 4 ? args[3] : undefined)
  // パーセント表記を小数へ。`Number(s) / 100` は演算による丸め誤差で
  // 小数点直書き（例: 0.921）と1ビットずれることがある（92.1 / 100 は
  // 0.9209999999999999 になる）。文字列のまま小数点を2桁左へ動かしてから
  // 数値化すれば、リテラルを書いたときと同じ変換経路を通るのでずれない
  const percentToFraction = (s: string): number => {
    const neg = s.startsWith('-')
    const body = neg ? s.slice(1) : s
    const dot = body.indexOf('.')
    const intPart = dot === -1 ? body : body.slice(0, dot)
    const fracPart = dot === -1 ? '' : body.slice(dot + 1)
    const digits = intPart + fracPart
    const pointPos = intPart.length - 2
    const shifted =
      pointPos <= 0
        ? `0.${'0'.repeat(-pointPos)}${digits}`
        : `${digits.slice(0, pointPos)}.${digits.slice(pointPos)}`
    return Number(`${neg ? '-' : ''}${shifted}`)
  }
  const num = (s: string): number => (s.endsWith('%') ? percentToFraction(s.slice(0, -1)) : Number(s))
  const alpha = alphaText === undefined ? 1 : num(alphaText.trim())
  if (args.length < 3 || !args.slice(0, 3).every((s) => Number.isFinite(num(s)))) return null
  if (!Number.isFinite(alpha)) return null

  if (fn[1].startsWith('rgb')) {
    // rgb() の数値は 0..255、パーセントなら 0..100%。
    // **範囲外はクランプする**（`rgb(300 300 300)` は有効な CSS で、
    // ブラウザは 255 にクランプして描画する。クランプしないと 1 を
    // 超えた線形値が出て、コントラスト比が実際より高く出る。Important 3）
    const ch = (s: string): number =>
      decodeSrgb(clamp01(s.endsWith('%') ? num(s) : Number(s) / 255))
    return { rgb: [ch(args[0]), ch(args[1]), ch(args[2])], alpha }
  }

  if (fn[1].startsWith('hsl')) {
    // CSS Color 4 の変換。h は度、s と l は 0..1。
    // **s / l は `%` が無ければ無効な CSS。** フラクションとして読むと
    // 数値上は動いてしまうが、それは「もっともらしい間違った色」になる
    // だけなので、正直に null を返す（Important 3）
    if (!args[1].endsWith('%') || !args[2].endsWith('%')) return null
    const h = ((Number.parseFloat(args[0]) % 360) + 360) % 360
    const s = num(args[1])
    const l = num(args[2])
    const c = s * Math.min(l, 1 - l)
    const at = (n: number): number => {
      const k = (n + h / 30) % 12
      return decodeSrgb(clamp01(l - c * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
    }
    return { rgb: [at(0), at(8), at(4)], alpha }
  }

  // oklch。L は 0..1 の小数でも 0..100% でもよい。
  //
  // **既知の制限:** C の `%` 表記（例 `oklch(70% 20% 30)`）は CSS Color 4
  // では 0.4 を 100% として解釈する（20% → 0.08）が、ここでは L と同じ
  // 「100% = 1.0」として読むため 0.20 になる。配布テーマで C を `%` 表記
  // する例は稀なため、実装はせずここに記録するだけに留める
  return {
    rgb: oklchToLinear({ L: num(args[0]), C: num(args[1]), H: Number(args[2]) }),
    alpha,
  }
}

/** oklch → 線形 sRGB。色域外はクランプする */
export function oklchToLinear(color: Oklch): LinearRgb {
  const h = (color.H * Math.PI) / 180
  const a = color.C * Math.cos(h)
  const b = color.C * Math.sin(h)
  const l = (color.L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (color.L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (color.L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/** 線形 sRGB → OKLab。色覚シミュレーション後の色差を測るのに使う */
export function linearToOklab(rgb: LinearRgb): readonly [number, number, number] {
  const l = Math.cbrt(0.4122214708 * rgb[0] + 0.5363325363 * rgb[1] + 0.0514459929 * rgb[2])
  const m = Math.cbrt(0.2119034982 * rgb[0] + 0.6806995451 * rgb[1] + 0.1073969566 * rgb[2])
  const s = Math.cbrt(0.0883024619 * rgb[0] + 0.2817188376 * rgb[1] + 0.6299787005 * rgb[2])
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/**
 * 線形 sRGB → oklch。`oklchToLinear` の逆。
 *
 * **H は 0..360 に正規化する**（`atan2` は -π..π を返す）。C が 0 に近い
 * 無彩色では H は意味を持たないが、値としては返す
 */
export function linearToOklch(rgb: LinearRgb): Oklch {
  const [L, a, b] = linearToOklab(rgb)
  const deg = (Math.atan2(b, a) * 180) / Math.PI
  return { L, C: Math.hypot(a, b), H: deg < 0 ? deg + 360 : deg }
}

/** WCAG 2.x の相対輝度 */
export function relativeLuminance(rgb: LinearRgb): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

/** WCAG 2.x のコントラスト比。引数の順序によらず 1 以上を返す */
export function contrastRatio(a: LinearRgb, b: LinearRgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** `fitLightness` に渡す条件。「`against` に対して `min`:1 以上」 */
export interface FitCondition {
  against: LinearRgb
  min: number
}

/**
 * 色相と彩度を保ったまま、全条件を満たす明度を探す。
 *
 * **二分探索を使わない。** `oklchToLinear` は色域外をクランプするため、
 * 彩度が高い色では L に対するコントラストが単調でなくなり、平坦域が
 * できる。二分探索は単調性を前提にするのでそこで誤った答えを返す。
 * 総当たりなら仮定が要らず、色は高々11個×2モードなので実行時間も問題にならない。
 *
 * **明暗の関係を反転させる解は採らない。** 地より暗い文字を「地より
 * 明るくすれば要件を満たす」と解くのは数値的には正しいが、配色の
 * 意味が変わる。元の色が相手より暗ければ暗い側だけを探す。
 *
 * 満たす明度が無ければ `null`。
 */
export function fitLightness(
  color: Oklch,
  conditions: readonly FitCondition[],
  options: { step?: number } = {},
): Oklch | null {
  const step = options.step ?? 0.001
  // 整数で回す。`L += step` を千回足すと誤差が溜まる
  const steps = Math.round(1 / step)
  const baseLuminance = relativeLuminance(oklchToLinear(color))
  const wasDarker = conditions.map((c) => baseLuminance < relativeLuminance(c.against))

  let best: number | null = null
  for (let i = 0; i <= steps; i++) {
    const L = i / steps
    const rgb = oklchToLinear({ ...color, L })
    const luminance = relativeLuminance(rgb)
    const satisfies = conditions.every(
      (c, k) =>
        luminance < relativeLuminance(c.against) === wasDarker[k] &&
        contrastRatio(rgb, c.against) >= c.min,
    )
    if (!satisfies) continue
    if (best === null || Math.abs(L - color.L) < Math.abs(best - color.L)) best = L
  }
  return best === null ? null : { ...color, L: best }
}

/**
 * OKLab 空間のユークリッド距離。知覚的にほぼ均等なので「見分けられるか」の
 * 目安に使える。0.10 を下回ると「同じ色の濃淡」に見え始める
 */
export function deltaEok(a: LinearRgb, b: LinearRgb): number {
  const [l1, a1, b1] = linearToOklab(a)
  const [l2, a2, b2] = linearToOklab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/**
 * Machado et al. (2009) の severity=1.0 の行列。
 * **線形 sRGB に適用する**（ガンマ補正後の値に掛けると結果がずれる）
 */
const VISION_MATRIX: Record<Exclude<Vision, 'normal'>, readonly number[]> = {
  protan: [
    0.152286, 1.052583, -0.204868,
    0.114503, 0.786281, 0.099216,
    -0.003882, -0.048116, 1.051998,
  ],
  deutan: [
    0.367322, 0.860646, -0.227968,
    0.280085, 0.672501, 0.047413,
    -0.01182, 0.04294, 0.968881,
  ],
}

/** 色覚多様性のシミュレーション。`normal` は恒等 */
export function simulate(rgb: LinearRgb, vision: Vision): LinearRgb {
  if (vision === 'normal') return rgb
  const m = VISION_MATRIX[vision]
  return [
    clamp01(m[0] * rgb[0] + m[1] * rgb[1] + m[2] * rgb[2]),
    clamp01(m[3] * rgb[0] + m[4] * rgb[1] + m[5] * rgb[2]),
    clamp01(m[6] * rgb[0] + m[7] * rgb[1] + m[8] * rgb[2]),
  ]
}

/**
 * 線形 sRGB → ガンマ補正済み sRGB（0..1）。CSS Color 4 の伝達関数。
 * `toHex` が内側に持っていた式をここへ出した（合成でも同じ式が要るため）
 */
export function encodeSrgb(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
}

/** ガンマ補正済み sRGB（0..1）→ 線形 sRGB。`encodeSrgb` の逆 */
export function decodeSrgb(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/**
 * 半透明の前景を背景に重ねた「見える色」を返す（M8 決定11）。
 *
 * **合成はガンマ補正済み sRGB の上で行う。** ブラウザが画面へ塗るときの
 * 空間がそこだからで、線形空間で混ぜると実際より明るい色が出る。
 *
 * Tailwind v4 で「`invalid` を 25% の透過で重ねた面」を書くと
 * `color-mix(in oklab, var(--color-invalid) 25%, transparent)` を生成する。
 * `transparent` との混合は premultiplied で行われるため、結果は
 * 「元の色にアルファ 25% が付いたもの」と厳密に等価であり、そのあと
 * ブラウザがこの関数と同じ合成を行う。だから alpha をそのまま渡してよい
 */
export function composite(fg: LinearRgb, bg: LinearRgb, alpha: number): LinearRgb {
  const mix = (i: 0 | 1 | 2): number =>
    decodeSrgb(clamp01(encodeSrgb(fg[i]) * alpha + encodeSrgb(bg[i]) * (1 - alpha)))
  return [mix(0), mix(1), mix(2)]
}

/**
 * 線形 sRGB を `#rrggbb` へ。**判定には使わない**（丸めが入る）。
 * テストの出力に人が読める色を出すためと、oklch を解釈しない相手
 *（xterm）へ色を渡すために使う
 */
export function toHex(rgb: LinearRgb): string {
  const channel = (v: number): string =>
    Math.round(clamp01(encodeSrgb(v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`
}
