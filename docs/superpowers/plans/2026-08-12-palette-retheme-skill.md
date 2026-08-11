# 配色差し替え Skill 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 外部テーマ（shadcn 系の `theme.css` / Morphos の `theme.json` / 色のリスト）を渡すと、`src/styles/palette.css` の11トークン×2モードを埋め、コントラスト要件を満たすまで明度を調整し、`palette.test.ts` が緑になる状態まで持っていく Skill を作る。

**Architecture:** `.claude/skills/palette-retheme/` に Skill を置く。**計算（色形式の正規化・コントラストの実測・明度の探索）は `src/styles/` のテスト専用コードに置き、同梱スクリプトはそれを呼ぶだけの薄いラッパにする。** 判断（役割への対応づけ・対応物がない色の決定）は `SKILL.md` のヒアリング手順が担う。`palette.css` への書き込みは Claude が `Edit` で行い、スクリプトは書かない（由来コメントを守るため）。

**Tech Stack:** TypeScript（`src/styles/`）／Vitest（既存）／Node.js ESM の型ストリップ（`.mjs` から `.ts` を直接 import）／Markdown（`SKILL.md`）。

**設計スペック:** [`2026-08-12-palette-retheme-skill-design.md`](2026-08-12-palette-retheme-skill-design.md)。**実装前に必ず読むこと。** 以下で「決定X」と書いたらこの文書の決定を指す。

---

## Global Constraints

以下は**全タスクの要件に暗黙に含まれる**。

- **アプリの実行時の挙動を1ミリも変えない。** 触ってよいのは次だけ。他に触ったら「計画の矛盾」として報告する
  - `src/styles/contrast.ts`（**追加のみ**。既存の関数の中身を変えない）
  - `src/styles/contrast.test.ts`（追加のみ）
  - `src/styles/palette-requirements.ts`（新規）
  - `src/styles/palette.test.ts`（**Task 4 の切り出しに伴う import への置き換えのみ**。テストの内容と件数を変えない）
  - `.claude/skills/palette-retheme/**`（新規）
  - `docs/**`（Task 7 のみ）
- **`src/styles/palette.css` を変更しない。** この計画は Skill を作るのであって、配色を差し替えるのではない
- **`src/index.css` を変更しない。** 31トークンの紐づけは rev 9章の確定事項
- **`parseOklch` を緩めない**（決定G）。`%` 表記とアルファを弾く門番であり、これが `palette.test.ts` の前提になっている
- **`contrast.ts` に消去不能な TypeScript 構文を書かない**（決定H）。`enum` とコンストラクタのパラメータプロパティを入れると、`.mjs` からの型ストリップ import が壊れる。型注釈・`interface`・`type` は消去可能なので問題ない
- **リポジトリ直下で `npm install` しない。** この計画は依存を1つも増やさない
- **文言はすべて日本語**（コメント・出力・`SKILL.md`）
- **`SKILL.md` の文体は `.claude/skills/error-catalog-register/SKILL.md` に揃える**（断定調、表で選択肢を示す、「なぜそうするか」を必ず書く、「やらないこと」で締める）
- **計画の指示が矛盾していたら、辻褄を合わせずに「計画の矛盾」として報告する。** 報告には**実行したコマンドとその出力を貼る**

## File Structure

| ファイル | 責務 |
| --- | --- |
| `src/styles/contrast.ts`（既存・追加） | 色の**計算**。oklch ⇄ 線形 sRGB、コントラスト比、色差、アルファ合成。ここに `linearToOklch` / `parseAnyCssColor` / `fitLightness` を足す |
| `src/styles/palette-requirements.ts`（新規） | `palette.css` が満たすべき**契約**。トークン一覧・コントラスト要件・重ね合わせの濃さ・CSS からトークンを読む関数。**配色を差し替えてもここは変わらない** |
| `src/styles/palette.test.ts`（既存・変更） | 契約の**検査**。上2つを import して測る。テストの内容は変えない |
| `.claude/skills/palette-retheme/SKILL.md`（新規） | **判断**の手順。入力の読み方・役割への対応づけ・ヒアリング・報告 |
| `.claude/skills/palette-retheme/scripts/palette-fit.mjs`（新規） | 上2つを呼んで**測って出す**だけ。固有のロジックを持たない |

---

## Task 1: `linearToOklch`

**Files:**
- Modify: `src/styles/contrast.ts`（末尾付近に追加）
- Test: `src/styles/contrast.test.ts`

**Interfaces:**
- Consumes: 既存の `linearToOklab(rgb: LinearRgb): readonly [number, number, number]`、`Oklch`、`LinearRgb`
- Produces: `linearToOklch(rgb: LinearRgb): Oklch` — 後続タスクが「拾った色を `palette.css` に書ける形へ直す」ために使う

- [ ] **Step 1: 失敗するテストを書く**

`src/styles/contrast.test.ts` の import に `linearToOklch` を足し、`describe('oklchToLinear と toHex', ...)` の直後に置く。

```ts
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
```

- [ ] **Step 2: 落ちることを確認する**

```
npx vitest run src/styles/contrast.test.ts
```

期待: `linearToOklch is not a function`（または import エラー）で失敗。

- [ ] **Step 3: 実装する**

`contrast.ts` の `linearToOklab` の直後に置く。

```ts
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
```

- [ ] **Step 4: 通ることを確認する**

```
npx vitest run src/styles/contrast.test.ts
```

期待: このファイルの `it` がすべて緑。

- [ ] **Step 5: コミット**

```bash
git add src/styles/contrast.ts src/styles/contrast.test.ts
git commit -m "feat(palette): 線形 sRGB から oklch への逆変換を足す"
```

---

## Task 2: `parseAnyCssColor`

**Files:**
- Modify: `src/styles/contrast.ts`
- Test: `src/styles/contrast.test.ts`

**Interfaces:**
- Consumes: `decodeSrgb`、`oklchToLinear`、`LinearRgb`、`Oklch`
- Produces: `parseAnyCssColor(value: string): ParsedColor | null` と `interface ParsedColor { rgb: LinearRgb; alpha: number }` — スクリプトが下書きの色を読むのに使う。**アルファは落として値で返す**（`palette.css` は不透明色しか持てないが、入力には混ざりうるので、呼び出し側が「落とした」と警告できるよう情報は残す）

- [ ] **Step 1: 失敗するテストを書く**

import に `parseAnyCssColor` を足し、`describe('parseOklch', ...)` の直後に置く。

```ts
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
```

- [ ] **Step 2: 落ちることを確認する**

```
npx vitest run src/styles/contrast.test.ts
```

期待: `parseAnyCssColor is not a function` で失敗。**「厳格な parseOklch は緩んでいない」だけは最初から緑**（既存の実装が既に満たしている）。

- [ ] **Step 3: 実装する**

`contrast.ts` の `parseOklch` の直後に置く。**下記は下書きであり検証済みの正ではない。** 正規表現の取りこぼしに気づいたら直してよいが、テストの期待値の側を実装に合わせて緩めないこと。

```ts
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
    return { rgb: [decodeSrgb(r), decodeSrgb(g), decodeSrgb(b)], alpha: a ?? 1 }
  }

  // 関数記法は「名前(引数列)」で共通に割る。区切りはカンマでも空白でも
  // よく、アルファは `/` の後ろ（CSS Color 4）かカンマの4つ目に来る
  const fn = /^(rgba?|hsla?|oklch)\(([^)]*)\)$/.exec(v)
  if (fn === null) return null
  const [rawArgs, rawAlpha] = fn[2].split('/')
  const args = rawArgs.trim().split(/[\s,]+/).filter((s) => s !== '')
  const alphaText = rawAlpha ?? (args.length === 4 ? args[3] : undefined)
  const num = (s: string): number => (s.endsWith('%') ? Number(s.slice(0, -1)) / 100 : Number(s))
  const alpha = alphaText === undefined ? 1 : num(alphaText.trim())
  if (args.length < 3 || !args.slice(0, 3).every((s) => Number.isFinite(num(s)))) return null
  if (!Number.isFinite(alpha)) return null

  if (fn[1].startsWith('rgb')) {
    // rgb() の数値は 0..255、パーセントなら 0..100%
    const ch = (s: string): number => decodeSrgb(s.endsWith('%') ? num(s) : Number(s) / 255)
    return { rgb: [ch(args[0]), ch(args[1]), ch(args[2])], alpha }
  }

  if (fn[1].startsWith('hsl')) {
    // CSS Color 4 の変換。h は度、s と l は 0..1
    const h = ((Number.parseFloat(args[0]) % 360) + 360) % 360
    const s = num(args[1])
    const l = num(args[2])
    const c = s * Math.min(l, 1 - l)
    const at = (n: number): number => {
      const k = (n + h / 30) % 12
      return decodeSrgb(l - c * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
    }
    return { rgb: [at(0), at(8), at(4)], alpha }
  }

  // oklch。L は 0..1 の小数でも 0..100% でもよい
  return {
    rgb: oklchToLinear({ L: num(args[0]), C: num(args[1]), H: Number(args[2]) }),
    alpha,
  }
}
```

- [ ] **Step 4: 通ることを確認する**

```
npx vitest run src/styles/contrast.test.ts
```

期待: このファイルの `it` がすべて緑。

- [ ] **Step 5: コミット**

```bash
git add src/styles/contrast.ts src/styles/contrast.test.ts
git commit -m "feat(palette): テーマの配布物に現れる色形式を読むパーサを足す"
```

---

## Task 3: `fitLightness`

**Files:**
- Modify: `src/styles/contrast.ts`
- Test: `src/styles/contrast.test.ts`

**Interfaces:**
- Consumes: `oklchToLinear`、`relativeLuminance`、`contrastRatio`、`Oklch`、`LinearRgb`
- Produces: `fitLightness(color: Oklch, conditions: readonly FitCondition[], options?: { step?: number }): Oklch | null` と `interface FitCondition { against: LinearRgb; min: number }`

- [ ] **Step 1: 失敗するテストを書く**

import に `fitLightness` を足し、`describe('contrastRatio', ...)` の直後に置く。**期待値はすべて実測済み**（設計スペックの検証で `contrast.ts` の実装に対して測った値）。

```ts
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
    // L=0（真っ黒）を返すが、それでも上の3つは緑のままである
    const fitted = fitLightness(WARNING, [{ against: canvas, min: 7 }])!
    expect(fitted.L).toBeCloseTo(0.424, 3)
    // 1刻みだけ元へ戻すと要件を割る（＝これ以上近い解は無い）
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
    // 「明るい側へ飛ばす解（L≈0.989）」の方が元の L に近くなるので、
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
```

- [ ] **Step 2: 落ちることを確認する**

```
npx vitest run src/styles/contrast.test.ts
```

期待: `fitLightness is not a function` で失敗。

- [ ] **Step 3: 実装する**

`contrast.ts` の `contrastRatio` の直後に置く。

```ts
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
```

- [ ] **Step 4: 通ることを確認する**

```
npx vitest run src/styles/contrast.test.ts
```

期待: このファイルの `it` がすべて緑。

- [ ] **Step 5: 変異させて検査が働くことを確かめる**

**この手順を飛ばさない。** 反転の禁止と「最も近い解」は、外すと**静かに誤った提案を出す**種類の欠陥である。

1. `luminance < relativeLuminance(c.against) === wasDarker[k] &&` の行を一時的に消す → 「明暗の関係を反転させる解を採らない」が落ちることを確認する
2. 戻す
3. `if (best === null || Math.abs(...) < Math.abs(...)) best = L` を `if (best === null) best = L` に一時的に変える → 「要件を満たす範囲で元に最も近い L を選ぶ」が落ちることを確認する
4. 戻す
5. `npx vitest run src/styles/contrast.test.ts` が緑に戻ったことを確認する

**両方の変異でテストが落ちなければ、テストが守っていない。** その場合は「計画の矛盾」として、実行したコマンドと出力を貼って報告する。

- [ ] **Step 6: コミット**

```bash
git add src/styles/contrast.ts src/styles/contrast.test.ts
git commit -m "feat(palette): 要件を満たす明度を探す関数を足す"
```

---

## Task 4: 要件テーブルを `palette-requirements.ts` へ切り出す

**Files:**
- Create: `src/styles/palette-requirements.ts`
- Modify: `src/styles/palette.test.ts:17-97`（定数と読み取り関数の宣言を import に置き換える）

**Interfaces:**
- Produces（**定数はすべて元の `as const` を保ったまま移す**。`readonly string[]` へ緩めると `palette.test.ts` 側のトークン名の型が消える）:
  - `TOKENS`（11個）
  - `MODES`（`{ label, pattern }` の2件）
  - `REQUIREMENTS`（`{ token, min, use }`）
  - `BACKGROUNDS`（`['canvas', 'surface']`）
  - `OVERLAYS`（`{ label, alpha, className }`）
  - `OVERLAY_FOREGROUNDS`（`{ token, use }`）
  - `OVERLAY_MIN: number`
  - `stripCssComments(css: string): string`
  - `readTokenBlock(css: string, selectorPattern: string, label: string): Record<string, string>`

**これは切り出しであってリファクタではない。** テストの内容・件数・期待値を1つも変えないこと。**移した定数のコメントも1文字も落とさずに持っていく**——あれらは「なぜ `grid` が要件に無いか」「なぜ背景を2つ見るか」という設計判断の記録であり、この計画で最も失われやすい情報である。

- [ ] **Step 1: 新しいファイルを作る**

`src/styles/palette-requirements.ts` を作り、`palette.test.ts` の次の宣言を**コメントごと**移す。

- `stripComments`（→ `stripCssComments` に改名して export）
- `readBlock`（→ `readTokenBlock` に改名して export。**第1引数に `css: string` を足す**。元は module scope の `paletteCss` を見ていた）
- `TOKENS` / `MODES` / `REQUIREMENTS` / `BACKGROUNDS` / `OVERLAYS` / `OVERLAY_FOREGROUNDS` / `OVERLAY_MIN`

ファイル冒頭に置く説明:

```ts
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
```

`readTokenBlock` は次の形にする（中身は元の `readBlock` のまま）。

```ts
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
```

- [ ] **Step 2: `palette.test.ts` を import に置き換える**

冒頭に import を足し、移した宣言を削除する。呼び出し箇所は2種類だけ。

- `stripComments(...)` → `stripCssComments(...)`（3箇所: `paletteCss` / `indexCss` の定義。`stripTsComments` は**別物なので触らない**）
- `readBlock(pattern, label)` → `readTokenBlock(paletteCss, pattern, label)`（`toPalette` の中と、`describe('palette.css の形式')` の中）

- [ ] **Step 3: 切り出し前と同じ結果になることを確認する**

```
npx vitest run src/styles/palette.test.ts
```

期待: **切り出し前と同じ数の `it` がすべて緑。** 件数が変わっていたら移し漏れか二重宣言なので、「計画の矛盾」として報告する。

- [ ] **Step 4: コメント内の `}` でブロック抽出が壊れないことを固める**

`readTokenBlock` が公開関数になったので、その前提を1本だけテストで固定する。`palette-requirements.test.ts` を新規に作る。

```ts
import { describe, expect, it } from 'vitest'
import { readTokenBlock, stripCssComments } from './palette-requirements'

describe('readTokenBlock', () => {
  it('コメントを落としてから読めば、コメント内の } でブロックが切れない', () => {
    // palette.css のヘッダコメントは長く、将来 `{` `}` を含む説明
    // （CSS の書き方の例など）が入りうる。**実データに今それが無いので、
    // この前提は現在どのテストも守っていない。** 公開関数にする
    // ついでに固定する
    const css = `
/* 例: .dark { --x: 1 } のように書く */
:root {
    --canvas: oklch(0.921 0.012 96.4);
    --ink: oklch(0.205 0 89.9);
}
`
    const block = readTokenBlock(stripCssComments(css), ':root', 'ライト')
    expect(block.canvas).toBe('oklch(0.921 0.012 96.4)')
    expect(block.ink).toBe('oklch(0.205 0 89.9)')
  })

  it('ブロックが無ければ投げる', () => {
    expect(() => readTokenBlock(':root { --canvas: red; }', '\\.dark', 'ダーク')).toThrow()
  })
})
```

- [ ] **Step 5: 全体が緑であることを確認する**

```
npm test
npx tsc -b
npm run lint
```

期待: すべて緑。**対象を絞らない**（`conventions.test.ts` が `src/` 全体を走査しており、新しいファイルもその対象に入る）。

- [ ] **Step 6: コミット**

```bash
git add src/styles/palette-requirements.ts src/styles/palette-requirements.test.ts src/styles/palette.test.ts
git commit -m "refactor(palette): 要件テーブルと読み取りを palette-requirements.ts へ出す"
```

---

## Task 5: 同梱スクリプト `palette-fit.mjs`

**Files:**
- Create: `.claude/skills/palette-retheme/scripts/palette-fit.mjs`

**Interfaces:**
- Consumes: `../../../../src/styles/contrast.ts` の `parseAnyCssColor` / `linearToOklch` / `oklchToLinear` / `contrastRatio` / `composite` / `deltaEok` / `simulate` / `toHex` / `fitLightness`、`../../../../src/styles/palette-requirements.ts` の全 export
- Produces: CLI のみ（他のコードから import されない）

**このスクリプトは固有のロジックを持たない。** 読む・呼ぶ・出すだけである。判定の式を1つでもここに書いたら、それは `contrast.ts` か `palette-requirements.ts` に置くべきものが漏れている。

- [ ] **Step 1: ディレクトリと使い方を決める**

```
.claude/skills/palette-retheme/scripts/palette-fit.mjs
```

CLI:

```
node scripts/palette-fit.mjs --in <path>
```

- `<path>` が `.css` → `palette.css` として読む（`readTokenBlock` で `:root` と `.dark` を拾う）
- `<path>` が `.json` → 下書きとして読む。形は `{ "light": { "canvas": "#eae6de", ... }, "dark": { ... } }`
- 引数が無い／ファイルが無い／トークンが足りない → 何が足りないかを日本語で述べて終了コード 2

**終了コード:** 全要件を満たせば 0、1つでも満たさなければ 1、使い方の誤りは 2。

- [ ] **Step 2: 実装する**

構造は次の5段。**下記は下書きであり検証済みの正ではない。**

1. 引数を読む
2. 入力を `{ light: Record<token, string>, dark: Record<token, string> }` に正規化する
3. 各色を `parseAnyCssColor` → `linearToOklch` にかけ、`oklch(L C H)` の文字列と hex を作る。**アルファが 1 でない色は警告として集める**（`palette.css` には書けないので落としたことを伝える）
4. `palette-requirements.ts` の表に沿って測る。落ちた項目は `fitLightness` に条件をまとめて渡し、提案の L を得る
5. 出力する

要件の組み立て方（`REQUIREMENTS` × `BACKGROUNDS` を1トークンぶんまとめて `fitLightness` に渡す）:

```js
// あるトークンが満たすべき条件は「canvas に対して」「surface に対して」の
// 複数ある。**1つずつ直すと、片方を直したもう片方が割れる。**
// まとめて渡せば、両方を同時に満たす L が返る。
// `oklch` は段3で作った Record<token, Oklch>、`linear` は同じく
// Record<token, LinearRgb>
const conditions = BACKGROUNDS.map((bg) => ({
  against: linear[bg],
  min: requirement.min * 1.03, // 閾値ちょうどを置かない（決定E）
}))
const suggestion = fitLightness(oklch[requirement.token], conditions)
```

**`grid` に提案が出ないことを確認する。** `grid` は `REQUIREMENTS` に入っていない（方眼紙の線は装飾で、薄いことに意味がある）ので、この組み立てを通ると自然に測定対象から外れる。**もし `grid` の行に `✗` や提案が出たら、要件の表を読み違えている。**

半透明の重ね合わせ（`OVERLAYS` × `OVERLAY_FOREGROUNDS` × `BACKGROUNDS`）は `composite` で面を作ってから測る。**ここは提案を出さない**——面の色は `warning` から来るので、直すべきは `warning` か `ink-muted` であり、どちらを動かすかは判断だからである。落ちたことと実測値だけを出す。

ΔE は `deltaEok(simulate(warning, vision), simulate(ok, vision))` を3つの `vision` で出す。**合否を付けない**（決定J）。

- [ ] **Step 3: 出力の形を決める**

Claude が読んで次の手を決められる形にする。落ちた行は `✗` で始め、提案を同じ行に置く。

```
== ライト ==
  canvas         oklch(0.921 0.012 96.4)   #e7e5dc
  surface        oklch(0.961 0.007 88.6)   #f5f3ee
  ink            oklch(0.205 0 89.9)       #171717
  ...

  コントラスト
    ✓ ink        / canvas    14.19:1  (>= 4.50)
    ✓ ink        / surface   15.42:1  (>= 4.50)
    ✗ ink-muted  / surface    4.21:1  (>= 4.50)  → L を 0.381 から 0.362 へ
    ...

  重ね合わせ
    ✓ ink        / bg-warning/20 on canvas    8.31:1  (>= 4.64)
    ...

== ダーク ==
  ...

warning と ok の色差（ΔE、合否は付けない）
  ライト  normal=0.151  protan=0.050  deutan=0.041
  ダーク  normal=0.148  protan=0.048  deutan=0.039

要件を満たさない項目が 1 件あります。
```

満たせない提案（`fitLightness` が `null`）は `→ この色相・彩度では満たせない（彩度を下げるか色を変える必要がある）` と出す。

- [ ] **Step 4: 現行の配色で全部通ることを確認する**

**これがこのスクリプトの検算である。** `palette.test.ts` が緑なのだから、同じ値を食わせて全 ✓ にならなければスクリプトが壊れている。

```
node .claude/skills/palette-retheme/scripts/palette-fit.mjs --in src/styles/palette.css
echo $?
```

期待: すべての行が `✓`、末尾に「要件を満たさない項目はありません」、終了コード 0。ΔE はライトが `normal=0.151 protan=0.050 deutan=0.041` 付近（`palette.test.ts` が `console.info` で出す値と一致すること）。

- [ ] **Step 5: 壊した配色で落ちることを確認する**

**この手順を飛ばさない。** 全 ✓ しか見ていないと、「何も測らずに ✓ を出すだけ」の実装でも緑に見える。

一時的な下書き JSON を**リポジトリの外**（scratchpad）に作る。現行の値をコピーし、`ink-muted` のライトだけを `oklch(0.75 0.007 170.1)`（明るすぎて `surface` 上で 4.5:1 を割る値）に変える。

```
node .claude/skills/palette-retheme/scripts/palette-fit.mjs --in <scratchpad>/broken.json
echo $?
```

期待: `ink-muted` の行が `✗` になり、提案の L が出て、終了コード 1。**他の行は `✓` のまま**（1箇所の変更が無関係な行を巻き込んでいない）。

- [ ] **Step 6: コミット**

```bash
git add .claude/skills/palette-retheme/scripts/palette-fit.mjs
git commit -m "feat(skill): 配色差し替えの検算スクリプトを追加する"
```

---

## Task 6: `SKILL.md`

**Files:**
- Create: `.claude/skills/palette-retheme/SKILL.md`

**Interfaces:**
- Consumes: Task 5 のスクリプト（`node scripts/palette-fit.mjs --in <path>`）
- Produces: なし（手順書）

**設計スペックの決定A〜Kをそのまま手順に落とす。** 迷ったら設計スペックの本文を読み、**理由ごと** `SKILL.md` へ持っていくこと——既存2本の Skill は「なぜそうするか」を必ず書く文体で、理由を落とすと次に読む AI が判断を再現できない。

- [ ] **Step 1: frontmatter を書く**

```yaml
---
name: palette-retheme
description: facet 自身の配色（src/styles/palette.css）を、渡されたテーマに差し替える。「配色を変えて」「テーマを差し替えて」「この theme.css を入れて」「palette.css を書き換えて」「もっと暗い配色にして」と言われたときに使う。外部テーマの31変数のうち facet が使うのは6つだけで、対応物がない役割（ok / grid / surface-accent / warning-fg / ok-fg）は候補を出してユーザーに選ばせる。コントラストの実測と明度の調整は同梱スクリプトが行うため、色を手で見繕わない。
---
```

**「色」という語だけで起動させない。** 用語集のデータやチャートの色と混ざる。対象が facet の外観であることを条件に含める。

- [ ] **Step 2: 本文を書く**

次の11節を、この順で書く。各節に必ず含める内容を示す。

| 節 | 必ず書くこと |
| --- | --- |
| 冒頭 | この Skill が触るのは**アプリ自身のソース**（`src/styles/palette.css`）であること。既存2本（用語集・エラーカタログ）は**ユーザーのデータ**を触るので種類が違うこと |
| 1. 作業前の確認 | `git status --short` を見る。`palette.css` に未コミットの変更があれば上書き前にユーザーへ伝える。**勝手にコミットも stash もしない**（決定K） |
| 2. 入力を読む | 2系統（shadcn 系の CSS 変数／名前付きパレット）。`%` 表記とアルファは同梱スクリプトが正規化するので**手で直さない**。Web から取りに行かない |
| 3. 役割へ対応づける | 決定Bの表をそのまま載せる。**残り25変数を捨てること**と、その理由（`--primary: var(--ink)` は「ボタンが緑になると `ok` と衝突する」から）。テーマの主張色が facet に現れないことをユーザーへ伝える |
| 4. `destructive` を疑う | 決定D。Morphos の生成ミスで「削除」が緑になった実例。色相が `ok` 候補と近ければ確認する |
| 5. 対応物がない5つを決める | 決定Cの表をそのまま載せる。**`ok` は必ず聞く**、他は候補と既定値を示して1往復。`ok` を `surface-accent` に流用しない |
| 6. 検算する | `node scripts/palette-fit.mjs --in <下書き.json>` の使い方と、下書き JSON の形。**終了コードが 0 になるまで繰り返す。** 現行配色を基準に取りたいときは `--in src/styles/palette.css` |
| 7. `palette.css` を書く | Claude が `Edit` で値を差し替える。**同じ編集で由来コメントも書き直す**（決定F）。ヘッダの「由来は Morphos の morphous-basalt」の段落も対象。**色値以外（半径・フォント・余白）を持ち込まない** |
| 8. テストを走らせる | `npm test`（**対象を絞らない**）。`palette.test.ts` だけでなく `conventions.test.ts` も見る |
| 9. 報告する | 決定Jの4つ（動かした量／捨てたテーマ色／ΔE 3種／候補から選んだ5つ）。ΔE には合否を付けない |
| 10. 迷ったときの原則 | 意味を持つ3系統（`ink` / `warning` / `ok`）の意味論は色値が変わっても維持する。`grid` は装飾なので薄いことに意味があり、コントラストを上げる方向に「調整」しない |
| 11. やらないこと | 下記 |

「やらないこと」に書く項目:

- **`index.css` を触らない。** 31トークンの紐づけは rev 9章の確定事項
- **`palette.css` に色値以外を書かない**（半径・フォント・余白。同ファイルの禁止事項）
- **スクリプトに `palette.css` を書かせない**（由来コメントが消える）
- **Web からテーマを取ってこない。** 入力は貼られた内容かファイルパスだけ
- **ΔE を理由に差し替えを止めない。** 数字は見せるだけで、判断はユーザーのもの（M7 決定4）
- **色見本や実機の確認を完了条件にしない。** テストが緑になったら完了

- [ ] **Step 3: 既存 Skill と文体が揃っているか確かめる**

`.claude/skills/error-catalog-register/SKILL.md` と並べて読み、断定調・表の使い方・「なぜそうするか」の density が揃っていることを確認する。

- [ ] **Step 4: コミット**

```bash
git add .claude/skills/palette-retheme/SKILL.md
git commit -m "feat(skill): 配色差し替え Skill の手順書を書く"
```

---

## Task 7: ドキュメントへ反映する

**Files:**
- Modify: `docs/open-issues.md`
- Modify: `docs/overview-rev.md`（4章・9章）
- Modify: `docs/README.md:73`

**`docs/history/` は作らない。** これはマイルストーンではなく Skill の追加であり、前例（`error-catalog-register` を作ったとき）も history を作っていない。実装で確定した設計判断は設計スペックに書いてあり、rev への反映で足りる。

- [ ] **Step 1: `docs/open-issues.md` を更新する**

3箇所。**消すのではなく追記する**（どれも解消していない）。

1. 「小さな負債」節の**2本の Skill の `evals/grade.mjs` で自己位置解決の形が揃っていない**に追記:

> 3本目（`palette-retheme`）は evals を持たないため、この揃え直しの機会にはならなかった。

2. 「デザイン」節の **`warning` と `ok` が P型・D型色覚で識別できない**に追記:

> `palette-retheme` Skill が差し替えのたびに ΔE 3種を報告するので、次に配色を触るときには必ずこの数字が目に入る。

3. 「小さな負債」節に1項目を新設:

> - **`palette-fit.mjs` が Node の型ストリップに依存している**（`.claude/skills/palette-retheme/scripts/`）: `.mjs` から `src/styles/contrast.ts` を直接 import しており、Node 22.18 未満では動かない。また `contrast.ts` に `enum` やコンストラクタのパラメータプロパティを書くと**消去できない構文**として落ちる（型注釈・`interface`・`type` は問題ない）。ロジックを複製しないための選択で、複製との比較では正しいが、**依存が Node のバージョンと構文の制約という見えにくい形で残っている** `[Skill]`

- [ ] **Step 2: `docs/overview-rev.md` 4章を更新する**

「Skill群：AIを対話的な共同作成者にする」の想定リストの後に、Skill の種類が2つあることを足す。

> **Skill には2種類ある。** 上記はいずれも**ユーザーのデータ**（プロジェクトフォルダの JSON）を作る Skill で、アプリとの接点はファイルだけという構造に乗る。これとは別に、**アプリ自身のソースを触る Skill** がある——`palette-retheme`（`src/styles/palette.css` の配色を差し替える）がそれで、接点はリポジトリのファイルであり、検証はアプリのテストが行う。同梱スクリプトが「コピーを持たない」原則に従う点は共通だが、**参照先がスキーマではなく `src/styles/` のテスト専用コードである**。

- [ ] **Step 3: `docs/overview-rev.md` 9章を更新する**

「決定：役割トークンとパレットの分離」の1つ目の箇条書き（M7 で色値を確定した…の段落）の末尾に足す。

> **差し替えの手順は `.claude/skills/palette-retheme/` が持つ。** 外部テーマの31変数のうち facet が使うのは6つだけで（残りは `index.css` が役割トークンから導出している）、対応物がない `ok` / `grid` / `surface-accent` / `warning-fg` / `ok-fg` は候補から人が選ぶ。要件を割った色は**色相と彩度を保ったまま明度だけ**動かす。要件の表そのものは `src/styles/palette-requirements.ts` にあり、**配色を差し替えても変わらない**。

- [ ] **Step 4: `docs/README.md` を更新する**

73行目は今のままだと3本目に当てはまらない。

変更前:

```
- `.claude/skills/` — AI 側の実装。アプリと**正規形が完全一致**していなければならない
```

変更後:

```
- `.claude/skills/` — AI 側の実装。**2種類ある**——ユーザーのデータを作るもの（用語集・エラーカタログ。アプリと**正規形が完全一致**していなければならない）と、アプリ自身のソースを触るもの（`palette-retheme`。配色の差し替え）
```

- [ ] **Step 5: 全体の検証**

```
npm test
npx tsc -b
npm run lint
```

期待: すべて緑。

- [ ] **Step 6: 実機確認の痕跡が無いことを確認する**

CLAUDE.md の後片付け手順。この計画は `sample-project/` を触らないが、確認は行う。

```
git status --short
```

期待: 空。何か出たら中身を見てから消す。

- [ ] **Step 7: コミット**

```bash
git add docs/
git commit -m "docs(skill): 配色差し替え Skill を rev と残件へ反映する"
```

---

## 完了の判定

- `npm test` / `npx tsc -b` / `npm run lint` がすべて緑
- `node .claude/skills/palette-retheme/scripts/palette-fit.mjs --in src/styles/palette.css` が全 ✓ で終了コード 0
- `src/styles/palette.css` と `src/index.css` に**1バイトの変更も無い**（`git diff origin/main --stat` で確認する）
