import { describe, expect, it } from 'vitest'
import {
  composite,
  contrastRatio,
  decodeSrgb,
  deltaEok,
  encodeSrgb,
  fitLightness,
  type LinearRgb,
  linearToOklch,
  oklchToLinear,
  parseAnyCssColor,
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

describe('parseAnyCssColor', () => {
  it('#rrggbb を読む', () => {
    // toHex は encodeSrgb を通すので、8bit の色は厳密に往復する
    expect(toHex(parseAnyCssColor('#3c6e47')!.rgb)).toBe('#3c6e47')
  })

  it('#rgb を #rrggbb と同じに読む', () => {
    expect(parseAnyCssColor('#3a7')!.rgb).toEqual(parseAnyCssColor('#33aa77')!.rgb)
  })

  it('rgb() を空白区切りでもカンマ区切りでも読む', () => {
    const spaced = parseAnyCssColor('rgb(60 110 71)')!.rgb
    expect(toHex(spaced)).toBe('#3c6e47')
    expect(parseAnyCssColor('rgb(60, 110, 71)')!.rgb).toEqual(spaced)
  })

  it('hsl() の色相がチャンネルに正しく対応する', () => {
    // 赤と青の取り違えのような配線ミスを捕まえる。
    // 純色（S=100% L=50%）を避けて中間の彩度で見る
    const maxChannelAt = (h: number): number => {
      const rgb = parseAnyCssColor(`hsl(${h} 60% 45%)`)!.rgb
      return rgb.indexOf(Math.max(...rgb))
    }
    expect(maxChannelAt(0), 'H=0 は赤が最大').toBe(0)
    expect(maxChannelAt(120), 'H=120 は緑が最大').toBe(1)
    expect(maxChannelAt(240), 'H=240 は青が最大').toBe(2)
  })

  it('hsl() が既知の対応に一致する', () => {
    // hsl(210 50% 40%) = #336699。**3チャンネルとも 8bit の整数
    // （51 / 102 / 153）にちょうど乗る値を選んである**——127.5 のような
    // 丸めの境界に期待値を置かない（M8 の教訓）
    expect(toHex(parseAnyCssColor('hsl(210 50% 40%)')!.rgb)).toBe('#336699')
  })

  it('彩度 0 の hsl は無彩色になる', () => {
    const [r, g, b] = parseAnyCssColor('hsl(200 0% 40%)')!.rgb
    expect(r).toBeCloseTo(g, 10)
    expect(g).toBeCloseTo(b, 10)
  })

  it('oklch のパーセント表記を小数と同じに読む', () => {
    // ここが Morphos や tweakcn の配布物をそのまま貼ったときに効く
    expect(parseAnyCssColor('oklch(92.1% 0.012 96.4)')!.rgb).toEqual(
      oklchToLinear({ L: 0.921, C: 0.012, H: 96.4 }),
    )
  })

  it('アルファを落として値で返す', () => {
    const parsed = parseAnyCssColor('oklch(0.518 0.132 34.6 / 0.13)')!
    expect(parsed.alpha).toBeCloseTo(0.13, 10)
    expect(parsed.rgb).toEqual(oklchToLinear(WARNING))
  })

  it('アルファが無ければ 1 を返す', () => {
    expect(parseAnyCssColor('#3c6e47')!.alpha).toBe(1)
  })

  it('読めないものは null を返す', () => {
    // 名前付き色（chartreuse）は意図的に非対応。テーマが使うことは稀で、
    // 148 色の表を持ち込む価値がない。読めなければ人が直せばよい
    for (const v of ['var(--warning)', 'transparent', 'chartreuse', '', 'oklch()', '#12']) {
      expect(parseAnyCssColor(v), v).toBeNull()
    }
  })

  it('厳格な parseOklch は緩んでいない', () => {
    // **この検査がこのタスクの安全装置である。** 緩いパーサを足すついでに
    // 既存の門番を広げてしまうと、palette.css に % 表記やアルファが
    // 入り込めるようになり、palette.test.ts が守っていたものが消える
    expect(parseOklch('oklch(92.1% 0.012 96.4)')).toBeNull()
    expect(parseOklch('oklch(0.518 0.132 34.6 / 0.13)')).toBeNull()
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

describe('linearToOklch', () => {
  it('oklchToLinear の逆になる', () => {
    // **C=0 の色を使わない。** 無彩色では H が意味を持たず復元されないので、
    // 往復の検査には向かない（INK は C=0 なのでここでは使えない）
    for (const c of [WARNING, OK, CANVAS]) {
      const back = linearToOklch(oklchToLinear(c))
      expect(back.L, `L ${JSON.stringify(c)}`).toBeCloseTo(c.L, 3)
      expect(back.C, `C ${JSON.stringify(c)}`).toBeCloseTo(c.C, 3)
      expect(back.H, `H ${JSON.stringify(c)}`).toBeCloseTo(c.H, 1)
    }
  })

  it('無彩色は C が 0 になる', () => {
    expect(linearToOklch([0.5, 0.5, 0.5]).C).toBeCloseTo(0, 3)
  })

  it('H を 0..360 で返す', () => {
    // atan2 は -π..π を返すので、度へ直しただけでは負の色相が出る。
    // palette.css に負の色相を書いても CSS としては有効だが、既存の値
    // （34.6 / 96.4 / 126）と並べたとき読み手が比較できなくなる
    const corners: LinearRgb[] = [
      [0.6, 0.2, 0.2],
      [0.2, 0.6, 0.2],
      [0.2, 0.2, 0.6],
      [0.6, 0.6, 0.2],
      [0.2, 0.6, 0.6],
      [0.6, 0.2, 0.6],
    ]
    for (const rgb of corners) {
      const h = linearToOklch(rgb).H
      expect(h, `${toHex(rgb)} の色相`).toBeGreaterThanOrEqual(0)
      expect(h, `${toHex(rgb)} の色相`).toBeLessThan(360)
    }
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

describe('fitLightness', () => {
  const canvas = oklchToLinear(CANVAS)
  const surface = oklchToLinear({ L: 0.961, C: 0.007, H: 88.6 })

  it('既に満たしている色は動かさない', () => {
    // ink は canvas 上 14.19:1 なので、4.5 を課しても動かす理由がない
    expect(fitLightness(INK, [{ against: canvas, min: 4.5 }])!.L).toBeCloseTo(INK.L, 3)
  })

  it('色相と彩度を動かさない', () => {
    const fitted = fitLightness(WARNING, [{ against: canvas, min: 7 }])!
    expect(fitted.C).toBe(WARNING.C)
    expect(fitted.H).toBe(WARNING.H)
  })

  it('要件を満たすところまで L を動かす', () => {
    const fitted = fitLightness(WARNING, [{ against: canvas, min: 7 }])!
    expect(contrastRatio(oklchToLinear(fitted), canvas)).toBeGreaterThanOrEqual(7)
  })

  it('要件を満たす範囲で元に最も近い L を選ぶ', () => {
    // **「動かしすぎる実装」と取り違えられないための検査。**
    // 走査の向きだけ間違えて「最初に見つかった解」を返す実装は
    // L=0(真っ黒)を返すが、それでも上の3つは緑のままである
    const fitted = fitLightness(WARNING, [{ against: canvas, min: 7 }])!
    expect(fitted.L).toBeCloseTo(0.424, 3)
    // 1刻みだけ元へ戻すと要件を割る(＝これ以上近い解は無い)
    const nearer = { ...WARNING, L: fitted.L + 0.001 }
    expect(contrastRatio(oklchToLinear(nearer), canvas)).toBeLessThan(7)
  })

  it('複数の条件を同時に満たす', () => {
    // canvas より surface の方が明るいので、両方を satisfy するには
    // 明るい方に合わせる必要がある
    const fitted = fitLightness({ L: 0.7, C: 0.068, H: 126 }, [
      { against: canvas, min: 4.5 },
      { against: surface, min: 4.5 },
    ])!
    expect(contrastRatio(oklchToLinear(fitted), canvas)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(oklchToLinear(fitted), surface)).toBeGreaterThanOrEqual(4.5)
  })

  it('明暗の関係を反転させる解を採らない', () => {
    // **背景と元の色をこの値にしてあるのは偶然ではない。**
    // oklch(0.56 0.02 120) は白と 4.63:1、黒と 4.54:1 で、暗い側にも
    // 明るい側にも解がある稀な明度である。元を L=0.54 に置くと
    // 「明るい側へ飛ばす解(L≈0.989)」の方が元の L に近くなるので、
    // 反転を禁じていない実装はそちらを返す。禁じていれば暗い側を返す
    const against = oklchToLinear({ L: 0.56, C: 0.02, H: 120 })
    const fitted = fitLightness({ L: 0.54, C: 0.02, H: 120 }, [{ against, min: 4.5 }])!
    expect(fitted.L).toBeLessThan(0.54)
  })

  it('どの明度でも満たせなければ null を返す', () => {
    // 白と黒の比は 21:1 が上限なので、25:1 は誰にも作れない
    const white = oklchToLinear({ L: 1, C: 0, H: 0 })
    expect(fitLightness(INK, [{ against: white, min: 25 }])).toBeNull()
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
