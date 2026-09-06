import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  deltaEok,
  linearToOklch,
  oklchToLinear,
  parseOklch,
  simulate,
  toHex,
  type LinearRgb,
  type Vision,
} from './contrast'
import {
  ACHROMATIC,
  ACHROMATIC_MAX_C,
  BACKGROUNDS,
  DISTINCT_MIN,
  DISTINCT_PAIRS,
  FACE_PAIRS,
  FACE_REQUIREMENTS,
  GAMUT_MAX_C_DRIFT,
  MODES,
  readTokenBlock,
  REQUIREMENTS,
  stripCssComments,
  TOKENS,
} from './palette-requirements'

const paletteCss = stripCssComments(
  readFileSync(new URL('./palette.css', import.meta.url), 'utf8'),
)

const VISIONS = ['normal', 'protan', 'deutan'] as const satisfies readonly Vision[]

function toPalette(pattern: string, label: string): Record<string, LinearRgb> {
  const block = readTokenBlock(paletteCss, pattern, label)
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
      const block = readTokenBlock(paletteCss, mode.pattern, mode.label)
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

    for (const req of FACE_REQUIREMENTS) {
      it(`${req.token} が ${req.face} の面の上で ${req.min}:1 以上`, () => {
        const ratio = contrastRatio(palette[req.token], palette[req.face])
        expect(ratio, `${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(req.min)
      })
    }

    for (const pair of FACE_PAIRS) {
      it(`${pair.a} と ${pair.b} の面どうしが ${pair.min}:1 以上（白黒でも判別できる）`, () => {
        const ratio = contrastRatio(palette[pair.a], palette[pair.b])
        expect(ratio, `${toHex(palette[pair.a])} / ${toHex(palette[pair.b])} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(pair.min)
      })
    }
  })
}

describe('意味色の識別（標準・P型・D型）', () => {
  for (const mode of MODES) {
    const palette = toPalette(mode.pattern, mode.label)
    for (const pair of DISTINCT_PAIRS) {
      for (const vision of VISIONS) {
        it(`${mode.label}の ${pair.a} と ${pair.b} が ${vision} で ΔE ${DISTINCT_MIN} 以上`, () => {
          const d = deltaEok(simulate(palette[pair.a], vision), simulate(palette[pair.b], vision))
          // NaN は toBeGreaterThanOrEqual で落ちる（比較が false になる）ので別建ての検査は要らない
          expect(d, `ΔE = ${d.toFixed(3)}`).toBeGreaterThanOrEqual(DISTINCT_MIN)
        })
      }
    }
  }
})

/**
 * **書いた値と、画面に出る値が一致すること。**
 *
 * `oklch(L C H)` は sRGB より広い空間なので、C を上げすぎた値は
 * ブラウザ（と `oklchToLinear`）が sRGB へクランプする。クランプされても
 * コントラストや ΔE の検査は通ってしまうため、**「C 0.12 の黄土」と
 * 書いたまま実際は 0.102 の色が出ている**状態を誰も見つけられない。
 * ライトの `missing` が実際にそうなっていた。
 *
 * 往復（oklch → 線形 sRGB → oklch）で C が戻れば色域の中にある。
 * L も動くが、動く量は C の食い違いに従属するので C だけを見る。
 * 許容差は契約側（`GAMUT_MAX_C_DRIFT`）にある——`palette-fit.mjs` と共有する。
 */
describe('色域', () => {
  for (const mode of MODES) {
    const block = readTokenBlock(paletteCss, mode.pattern, mode.label)
    for (const token of TOKENS) {
      it(`${mode.label}の ${token} が sRGB の色域に収まっている（書いた値と測る値が一致する）`, () => {
        const written = parseOklch(block[token])
        if (written === null) throw new Error(`--${token} が oklch(L C H) ではない: ${block[token]}`)
        const measured = linearToOklch(oklchToLinear(written))
        const diff = Math.abs(measured.C - written.C)
        expect(
          diff,
          `書いた C = ${written.C} / 測った C = ${measured.C.toFixed(4)}（差 ${diff.toFixed(4)}）。C を下げること`,
        ).toBeLessThan(GAMUT_MAX_C_DRIFT)
      })
    }
  }
})

describe('無彩色（色を持つのは意味だけ）', () => {
  for (const mode of MODES) {
    const palette = toPalette(mode.pattern, mode.label)
    for (const token of ACHROMATIC) {
      it(`${mode.label}の ${token} の C が ${ACHROMATIC_MAX_C} 以下`, () => {
        const c = linearToOklch(palette[token]).C
        expect(c, `C = ${c.toFixed(4)}`).toBeLessThanOrEqual(ACHROMATIC_MAX_C)
      })
    }
  }
})

const indexCss = stripCssComments(readFileSync(new URL('../index.css', import.meta.url), 'utf8'))

describe('index.css', () => {
  it('destructive が invalid に紐づいている', () => {
    // Morphos の theme.css は light.destructive が Primary で上書きされる
    // 生成ミスがあり、Basalt では「削除」が緑になっていた。
    // 配色を差し替えるたびに人の目で確かめなくて済むよう機械で見る
    expect(indexCss).toMatch(/--destructive:\s*var\(--invalid\)\s*;/)
  })

  it('色値を直接持たない（palette.css が唯一の出所）', () => {
    expect(indexCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(indexCss).not.toMatch(/\boklch\(/)
    expect(indexCss).not.toMatch(/\brgba?\(/)
    expect(indexCss).not.toMatch(/\bhsla?\(/)
  })

  it('palette.css を読み込んでいる', () => {
    expect(indexCss).toMatch(/@import\s+"\.\/styles\/palette\.css"/)
  })

  it('.dark のブロックを持たない（モードの出し分けは palette.css の仕事）', () => {
    expect(indexCss).not.toMatch(/^\s*\.dark\s*\{/m)
  })

  it('方眼紙のユーティリティが grid トークンから色を取る', () => {
    expect(indexCss).toMatch(/@utility\s+bg-grid-paper/)
    // 色は必ず役割トークン経由。直書きは同じ describe の別の it が弾く。
    //
    // **検査は @utility ブロックの中に絞る。**
    // `bg-grid-paper[\s\S]*var(--grid)` のような「bg-grid-paper の後、ファイル末尾
    // までのどこかに var(--grid) がある」型の正規表現にすると、@utility が
    // index.css の最後にあるだけで緑になり、後ろに
    // var(--grid) を使う定義を1つ足した瞬間に空洞化する——「症状を
    // 取り違えたテストは、無いテストより危険」（lessons-for-planning.md）
    // の型に当たるため、ブロックの範囲にスコープを絞る
    expect(indexCss).toMatch(/@utility\s+bg-grid-paper\s*\{[^}]*var\(--grid\)/)
  })

  it('マス目のサイズを持つ', () => {
    expect(indexCss).toMatch(/--grid-size:\s*\d+px/)
  })

  /**
   * WebKit（macOS の WKWebView）は repeating-linear-gradient を「面の端から端まで
   * の1本の勾配」として標本化するため、24px 周期の 1px 線がほとんど落ちる。
   * mac の実機では縦線が画面全体で2本しか出ていなかった（QuickLook の
   * WebKit 描画でも再現：27本・間隔 6/19/37px とばらばらになる）。
   *
   * 1周期ぶんの絵を background-size で敷き詰める形にすれば、勾配の長さが
   * マス目1つに閉じるので標本化の誤差が出ない。**この形を戻さないこと**
   */
  it('マス目は1周期の敷き詰めで描く（repeating-linear-gradient を使わない）', () => {
    // indexCss はコメントを落としてある（このファイルの先頭を読むこと）ので、
    // 「使わない」と書いた解説そのものを違反として拾う心配は無い
    const utility = indexCss.match(/@utility\s+bg-grid-paper\s*\{[^}]*\}/)?.[0] ?? ''
    expect(utility).not.toMatch(/repeating-linear-gradient/)
    expect(utility).toMatch(/background-size:\s*var\(--grid-size\)\s+var\(--grid-size\)/)
  })
})
