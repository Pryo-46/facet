/**
 * 色の検証に使う計算。**アプリの実行時には使わない**（テストからのみ呼ぶ）。
 *
 * 依存を足さない方針（M7 設計スペック 決定4）のため、oklch → 線形 sRGB →
 * 相対輝度の変換を自前で持つ。変換式は CSS Color 4 の定義そのまま。
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
 * Tailwind v4 の `bg-warning/25` は
 * `color-mix(in oklab, var(--color-warning) 25%, transparent)` を生成する。
 * `transparent` との混合は premultiplied で行われるため、結果は
 * 「元の色にアルファ 25% が付いたもの」と厳密に等価であり、そのあと
 * ブラウザがこの関数と同じ合成を行う。だから alpha をそのまま渡してよい
 */
export function composite(fg: LinearRgb, bg: LinearRgb, alpha: number): LinearRgb {
  const mix = (i: 0 | 1 | 2): number =>
    decodeSrgb(clamp01(encodeSrgb(fg[i]) * alpha + encodeSrgb(bg[i]) * (1 - alpha)))
  return [mix(0), mix(1), mix(2)]
}

/** テストの出力に人が読める色を出すため。判定には使わない */
export function toHex(rgb: LinearRgb): string {
  const channel = (v: number): string =>
    Math.round(clamp01(encodeSrgb(v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`
}
