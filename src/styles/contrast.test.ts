import { describe, expect, it } from 'vitest'
import {
  composite,
  contrastRatio,
  decodeSrgb,
  deltaEok,
  encodeSrgb,
  type LinearRgb,
  oklchToLinear,
  parseOklch,
  relativeLuminance,
  simulate,
  toHex,
} from './contrast'

// 設計スペックの確定値から。Task 2 の palette.css と同じ値を使う
const CANVAS = { L: 0.921, C: 0.012, H: 96.4 }
const INK = { L: 0.205, C: 0, H: 89.9 }
const WARNING = { L: 0.518, C: 0.132, H: 34.6 }
const OK = { L: 0.5, C: 0.068, H: 126 }

describe('parseOklch', () => {
  it('3値の oklch を数値にする', () => {
    expect(parseOklch('oklch(0.921 0.012 96.4)')).toEqual(CANVAS)
  })

  it('前後の空白を許す', () => {
    expect(parseOklch('  oklch(0.205 0 89.9)  ')).toEqual(INK)
  })

  it('アルファ付きは null を返す', () => {
    // palette.css は「不透明な色だけ」を持つ規約（設計スペック 決定3）。
    // 半透明が紛れ込んだらコントラスト計算が意味を失うので、
    // 黙って読み飛ばさず Task 2 のテストで落とせるようにする
    expect(parseOklch('oklch(0.518 0.132 34.6 / .13)')).toBeNull()
  })

  it('hex は null を返す', () => {
    expect(parseOklch('#a64630')).toBeNull()
  })

  it('var 参照は null を返す', () => {
    expect(parseOklch('var(--warning)')).toBeNull()
  })
})

describe('oklchToLinear と toHex', () => {
  it('Basalt Black は #171717 に戻る', () => {
    expect(toHex(oklchToLinear(INK))).toBe('#171717')
  })

  it('Lava Paper は #e7e5dc に戻る', () => {
    expect(toHex(oklchToLinear(CANVAS))).toBe('#e7e5dc')
  })

  it('色域外はクランプする（負の成分で NaN や範囲外を出さない）', () => {
    const hex = toHex(oklchToLinear({ L: 0.5, C: 0.4, H: 140 }))
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('relativeLuminance', () => {
  it('白は 1、黒は 0', () => {
    expect(relativeLuminance([1, 1, 1])).toBeCloseTo(1, 10)
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 10)
  })
})

describe('contrastRatio', () => {
  const canvas = oklchToLinear(CANVAS)
  const ink = oklchToLinear(INK)

  it('同じ色は 1:1', () => {
    expect(contrastRatio(canvas, canvas)).toBeCloseTo(1, 10)
  })

  it('引数の順序によらない', () => {
    expect(contrastRatio(ink, canvas)).toBeCloseTo(contrastRatio(canvas, ink), 10)
  })

  it('ink と canvas は 14.19:1', () => {
    expect(contrastRatio(ink, canvas)).toBeCloseTo(14.19, 1)
  })
})

describe('deltaEok', () => {
  it('同じ色は 0', () => {
    const c = oklchToLinear(WARNING)
    expect(deltaEok(c, c)).toBeCloseTo(0, 10)
  })

  it('ライトの warning と ok は 0.151', () => {
    expect(deltaEok(oklchToLinear(WARNING), oklchToLinear(OK))).toBeCloseTo(0.151, 2)
  })
})

describe('simulate', () => {
  it('normal は元の色をそのまま返す', () => {
    const c = oklchToLinear(WARNING)
    expect(simulate(c, 'normal')).toEqual(c)
  })

  it('P型・D型では warning と ok の色差が縮む', () => {
    const w = oklchToLinear(WARNING)
    const o = oklchToLinear(OK)
    const normal = deltaEok(w, o)
    for (const vision of ['protan', 'deutan'] as const) {
      const simulated = deltaEok(simulate(w, vision), simulate(o, vision))
      expect(simulated, `${vision} で色差が縮んでいない`).toBeLessThan(normal)
    }
  })
})

describe('アルファ合成', () => {
  const BLACK: LinearRgb = [0, 0, 0]
  const WHITE: LinearRgb = [1, 1, 1]

  it('alpha 1 は前景そのもの、alpha 0 は背景そのもの', () => {
    expect(composite(BLACK, WHITE, 1)).toEqual(BLACK)
    expect(composite(BLACK, WHITE, 0)).toEqual(WHITE)
  })

  it('合成はガンマ補正済み sRGB 上で行う（線形空間で混ぜない）', () => {
    // ガンマ空間で 0.5 に混ざった結果を線形へ戻すと 0.2140。
    // 線形空間で混ぜていたら 0.5 になる——この差がこのテストの主張である。
    // **toHex を経由しない**：黒と白の中点は 127.5 と丸めの境界に乗るため、
    // 期待値が処理系の丸めに依存してしまう（閾値ちょうどの値を置かない）
    const [r, g, b] = composite(BLACK, WHITE, 0.5)
    expect(r).toBeCloseTo(0.2140, 4)
    expect(g).toBeCloseTo(0.2140, 4)
    expect(b).toBeCloseTo(0.2140, 4)
  })

  it('sRGB の伝達関数が往復する', () => {
    for (const v of [0, 0.001, 0.05, 0.25, 0.5, 0.9, 1]) {
      expect(decodeSrgb(encodeSrgb(v))).toBeCloseTo(v, 10)
    }
  })

  it('現行のプレースホルダの重ね（text-warning/70 を warning/10 の面へ）が 2.8:1 付近になる', () => {
    // docs/open-issues.md が実測として記録した値。合成モデルが
    // 正しいことの裏付けであり、壊れたら計算のどこかが狂っている
    const surface = oklchToLinear({ L: 0.961, C: 0.007, H: 88.6 })
    const warning = oklchToLinear({ L: 0.518, C: 0.132, H: 34.6 })
    const face = composite(warning, surface, 0.1)
    expect(contrastRatio(composite(warning, face, 0.7), face)).toBeCloseTo(2.8, 1)
  })
})
