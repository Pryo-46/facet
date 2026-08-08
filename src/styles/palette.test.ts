import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  deltaEok,
  oklchToLinear,
  parseOklch,
  simulate,
  toHex,
  type LinearRgb,
  type Vision,
} from './contrast'

/** コメントを落としてから読む（`}` を含むコメントがブロック抽出を壊さないように） */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

const paletteCss = stripComments(readFileSync(new URL('./palette.css', import.meta.url), 'utf8'))

/** `:root { ... }` / `.dark { ... }` から `--name: value` を拾う */
function readBlock(selectorPattern: string, label: string): Record<string, string> {
  const m = new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`).exec(paletteCss)
  if (m === null) throw new Error(`${label} のブロックが palette.css に見つからない`)
  const out: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const d = /^\s*--([a-z-]+)\s*:\s*([^;]+);/.exec(line)
    if (d !== null) out[d[1]] = d[2].trim()
  }
  return out
}

const TOKENS = [
  'canvas',
  'surface',
  'ink',
  'ink-muted',
  'rule',
  'grid',
  'warning',
  'ok',
  'warning-fg',
  'ok-fg',
] as const

const MODES = [
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
const REQUIREMENTS = [
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
const BACKGROUNDS = ['canvas', 'surface'] as const

function toPalette(pattern: string, label: string): Record<string, LinearRgb> {
  const block = readBlock(pattern, label)
  const out: Record<string, LinearRgb> = {}
  for (const name of TOKENS) {
    const raw = block[name]
    if (raw === undefined) throw new Error(`${label} に --${name} が無い`)
    const parsed = parseOklch(raw)
    if (parsed === null) {
      throw new Error(`${label} の --${name} が「不透明な oklch(L C H)」ではない: ${raw}`)
    }
    out[name] = oklchToLinear(parsed)
  }
  return out
}

describe('palette.css の形式', () => {
  for (const mode of MODES) {
    it(`${mode.label}に全トークンがあり、すべて不透明な oklch である`, () => {
      const block = readBlock(mode.pattern, mode.label)
      for (const name of TOKENS) {
        expect(block[name], `--${name} が無い`).toBeDefined()
        expect(
          parseOklch(block[name]),
          `--${name} が oklch(L C H) の形ではない: ${block[name]}`,
        ).not.toBeNull()
      }
    })
  }
})

for (const mode of MODES) {
  describe(`${mode.label}のコントラスト`, () => {
    const palette = toPalette(mode.pattern, mode.label)

    for (const bg of BACKGROUNDS) {
      for (const req of REQUIREMENTS) {
        it(`${req.token}（${req.use}）が ${bg} の上で ${req.min}:1 以上`, () => {
          const ratio = contrastRatio(palette[req.token], palette[bg])
          expect(
            ratio,
            `${toHex(palette[req.token])} / ${toHex(palette[bg])} = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(req.min)
        })
      }
    }

    for (const [fg, face] of [
      ['warning-fg', 'warning'],
      ['ok-fg', 'ok'],
    ] as const) {
      it(`${fg} が ${face} の面の上で 4.5:1 以上`, () => {
        const ratio = contrastRatio(palette[fg], palette[face])
        expect(ratio, `${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
      })
    }
  })
}

describe('warning と ok の識別（記録のみ。失敗させない）', () => {
  for (const mode of MODES) {
    it(`${mode.label}の ΔE を標準色覚・P型・D型で出力する`, () => {
      const palette = toPalette(mode.pattern, mode.label)
      const measured = (['normal', 'protan', 'deutan'] as Vision[]).map((vision) => {
        const d = deltaEok(simulate(palette.warning, vision), simulate(palette.ok, vision))
        return `${vision}=${d.toFixed(3)}`
      })

      // ★ この値では失敗させない（設計スペック 決定4）。
      //
      //   採用した配色は P型・D型で ΔE が実用域（0.10）を割る。それを承知で
      //   選んでおり、ここで失敗にすると配色を差し替えるたびに人間の判断を
      //   要求する門番になる。**このテストが守るものは無い。見せるだけである。**
      //   閾値を足して「守るもの」に変えるなら、それは設計判断の変更なので
      //   設計スペックの側を先に直すこと
      console.info(`[palette] ${mode.label} warning/ok ΔE — ${measured.join(' / ')}`)
      expect(measured).toHaveLength(3)
    })
  }
})
