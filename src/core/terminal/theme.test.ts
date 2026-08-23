import { describe, expect, it } from 'vitest'
import { buildTerminalTheme, TERMINAL_MIN_CONTRAST } from './theme'
import { contrastRatio, parseAnyCssColor, relativeLuminance } from '@/styles/contrast'

/**
 * 役割トークンの値。**`src/styles/palette.css` から逐語で写したもの**で、
 * ここでの役目は「入力の形が本物と同じであること」だけ。パレットを
 * 差し替えたらここも古くなるが、**このテストが検証するのは変換と
 * 組み立てであってパレットの値ではない**（パレットの値は
 * `src/styles/palette.test.ts` の仕事）
 */
const LIGHT: Record<string, string> = {
  '--surface': 'oklch(0.961 0.007 88.6)',
  '--ink': 'oklch(0.205 0 89.9)',
  '--surface-muted': 'oklch(0.91 0 0)',
}
const DARK: Record<string, string> = {
  '--surface': 'oklch(0.205 0 89.9)',
  '--ink': 'oklch(0.85 0.007 88.6)',
  '--surface-muted': 'oklch(0.27 0 0)',
}

const reader =
  (tokens: Record<string, string>) =>
  (name: string): string =>
    tokens[name] ?? ''

const rgb = (hex: string) => {
  const parsed = parseAnyCssColor(hex)
  if (parsed === null) throw new Error(`読めない色: ${hex}`)
  return parsed.rgb
}

describe('buildTerminalTheme', () => {
  it('役割トークンを sRGB の16進へ変換して返す', () => {
    // xterm は oklch を解釈しないので、#rrggbb にして渡す必要がある
    const theme = buildTerminalTheme(reader(LIGHT))
    expect(theme).not.toBeNull()
    for (const value of Object.values(theme ?? {})) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('ライトでは明るい面に暗い文字、ダークではその逆になる', () => {
    // 「トークンを読まずに固定値を返す実装」と区別するため、2つのトークン
    // 集合で結果が入れ替わることを見る
    const light = buildTerminalTheme(reader(LIGHT))
    const dark = buildTerminalTheme(reader(DARK))
    expect(light).not.toBeNull()
    expect(dark).not.toBeNull()
    if (light === null || dark === null) return

    expect(relativeLuminance(rgb(light.background))).toBeGreaterThan(
      relativeLuminance(rgb(light.foreground)),
    )
    expect(relativeLuminance(rgb(dark.background))).toBeLessThan(
      relativeLuminance(rgb(dark.foreground)),
    )
  })

  it('文字と面のコントラストが本文の要件を満たす', () => {
    for (const tokens of [LIGHT, DARK]) {
      const theme = buildTerminalTheme(reader(tokens))
      expect(theme).not.toBeNull()
      if (theme === null) continue
      expect(
        contrastRatio(rgb(theme.foreground), rgb(theme.background)),
      ).toBeGreaterThanOrEqual(TERMINAL_MIN_CONTRAST)
    }
  })

  it('カーソルは文字と同じ色、その上に乗る文字は面と同じ色', () => {
    // ブロックカーソルの下の1文字が読めるために要る対応
    const theme = buildTerminalTheme(reader(LIGHT))
    expect(theme?.cursor).toBe(theme?.foreground)
    expect(theme?.cursorAccent).toBe(theme?.background)
  })

  it('トークンが1つでも読めなければ null を返す', () => {
    // 半端に流し込むと、面だけ変わって文字が読めない端末になる。
    // 「無い」と「読めない形」の両方を見る（jsdom では前者、パレットに
    // 別記法が紛れ込んだときは後者になる）
    const missing = { ...LIGHT }
    delete missing['--ink']
    expect(buildTerminalTheme(reader(missing))).toBeNull()
    expect(buildTerminalTheme(reader({ ...LIGHT, '--surface': 'rebeccapurple' }))).toBeNull()
    // `--surface-muted` **単独**の欠落も踏む。selectionBackground を null
    // ガードから落とす／別のトークン名に結ぶ形の退行は、上の2つでは
    // 素通りする。**`--surface-muted` は palette-retheme で人が選ぶ5つの
    // 1つ**（rev 9章）なので、配色差し替えで最も落ちやすい
    const noAccent = { ...LIGHT }
    delete noAccent['--surface-muted']
    expect(buildTerminalTheme(reader(noAccent))).toBeNull()
  })
})
