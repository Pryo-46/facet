# M7: デザイントークン確定 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rev 9章が「仮置き」として空けていた色値とフォント指定を確定させ、`src/index.css` に二層で並存している shadcn 標準トークンと facet 役割トークンを一本化した上で、**配色を1ファイルの差し替えで変えられる構造**と、**差し替えた結果が壊れていないことを検証するテスト**を用意する。

**Architecture:** 色値は `src/styles/palette.css` ただ1つに隔離する（AI に配色変更を頼むとき、書き換え対象がこのファイルだけになる）。`src/index.css` は役割名の定義と shadcn 31トークンの導出だけを持ち、色値を一切持たない。検証は `src/styles/contrast.ts`（oklch → 線形 sRGB → 相対輝度の純関数。依存を足さない）を土台に、`palette.test.ts` が CSS をテキストとして読んでコントラスト要件を検査し、`conventions.test.ts` がソースを走査して色値の直書きと許可外のフォントサイズを弾く。

**Tech Stack:** TypeScript / React 19 / Vite 8 / Vitest 4（環境は既定 `node`）／Tailwind CSS v4（`@theme` / `@theme inline`）＋ shadcn/ui。**新しい依存は追加しない。**

**設計スペック:** [`2026-08-09-m7-design-tokens-design.md`](2026-08-09-m7-design-tokens-design.md)。**色値の由来・採用しなかった案・数字の根拠はすべてそちらにある。** 本計画は手順のみ。

---

## Global Constraints

以下は `docs/overview-rev.md` と設計スペックから引いた制約。**全タスクの要件に暗黙に含まれる。**

- **色値の直書き禁止**（rev 9章）。コンポーネントは役割名（`text-ink` / `bg-warning` / `border-rule` …）だけを使う。**色値を持ってよいのは `src/styles/palette.css` ただ1つ。** Task 5 でこれを機械検査に変える
- **`src/components/ui/**` は shadcn の生成物。手で整形しない**（rev 7章）。走査・検査の対象からも外す
- **Rust には一切触れない。** M7 に Tauri 側の変更はない
- **新しい依存を足さない。** 色計算は数十行の自前実装で足りる（設計スペック 決定4）
- **`@theme` に書いてよいのは色以外**（フォント・行間・半径）。**色は `palette.css`**。この境界を崩さない（設計スペック 決定5）
- **型定義は書かない。** `src/types/glossary.ts` はスキーマからの生成物
- **警告ゼロ基準。** `npm run lint`（oxlint）が警告を出したらタスク完了としない
- **テストは対象ファイルの隣に置く。** DOM テストは対象ファイル先頭の `// @vitest-environment jsdom` で切り替える（M7 では DOM テストを新規に書かない）
- **実機確認（`npm run tauri dev` の GUI 操作）は人間の作業**（Task 6）。サブエージェントは GUI を操作できないので、実装タスクの完了条件に実機確認を含めない
- **`sample-project/` を編集したままコミットしない**（`CLAUDE.md` の後片付け手順）

### 計画のコードの扱い（M3・M4・M5 で3回続けて再現した教訓）

**この計画に載っているコードは検証済みの正ではない。レビューを通す前提の下書きとして扱うこと。** 実装中に計画の指示が矛盾していたり、ライブラリの実挙動と食い違ったりしたら、**辻褄を合わせずに「計画の矛盾」として報告する。**

- **テストの件数を書かない。** 期待値は常に「このファイルの `it` がすべて緑」と書く
- **数値の期待値は本計画に書いてあるものをそのまま使う。** すべて実装予定と同じ式で算出済み（設計スペックの色値表と一致する）。**自分で計算し直して違う値になったら、辻褄を合わせずに報告すること**

---

## この計画で触るファイル

| | 役割 |
| --- | --- |
| `src/styles/contrast.ts` | **新規。** oklch → 線形 sRGB → 相対輝度・OKLab・色覚シミュレーションの純関数。アプリの実行時には使わない（テストからのみ） |
| `src/styles/contrast.test.ts` | **新規。** 上の単体テスト |
| `src/styles/palette.css` | **新規。** 色値だけ。ライト（`:root`）とダーク（`.dark`）の2ブロック |
| `src/styles/palette.test.ts` | **新規。** `palette.css` と `index.css` を読んでコントラスト要件・`destructive` の紐づきを検査 |
| `src/styles/conventions.test.ts` | **新規。** `src/` を走査して色値の直書きと許可外のフォントサイズを弾く |
| `src/index.css` | **修正。** 色値を `palette.css` へ移し、shadcn 31トークンを役割トークンから導出。フォントと行間を確定 |
| `docs/overview-rev.md` | **修正。** 9章に確定内容を反映（Task 7） |
| `docs/open-issues.md` | **修正。** 残件の増減（Task 7） |
| `docs/history/m7-core-design-tokens.md` | **新規。** 申し送り（Task 7） |

**`src/components/**` と `src/modules/**` は触らない。** 既存コンポーネントは M1 から役割名だけで書かれているので、トークンの値が変われば自動的に新しい色になる。

---

## Task 1: 色計算の純関数

**Files:**
- Create: `src/styles/contrast.ts`
- Test: `src/styles/contrast.test.ts`

**Interfaces:**
- Consumes: なし（このタスクが最初）
- Produces: 以下を `src/styles/contrast.ts` から export する。Task 2 の `palette.test.ts` がすべて使う
  - `interface Oklch { L: number; C: number; H: number }`
  - `type LinearRgb = readonly [number, number, number]`
  - `type Vision = 'normal' | 'protan' | 'deutan'`
  - `parseOklch(value: string): Oklch | null`
  - `oklchToLinear(color: Oklch): LinearRgb`
  - `linearToOklab(rgb: LinearRgb): readonly [number, number, number]`
  - `relativeLuminance(rgb: LinearRgb): number`
  - `contrastRatio(a: LinearRgb, b: LinearRgb): number`
  - `deltaEok(a: LinearRgb, b: LinearRgb): number`
  - `simulate(rgb: LinearRgb, vision: Vision): LinearRgb`
  - `toHex(rgb: LinearRgb): string`

- [ ] **Step 1: 失敗するテストを書く**

`src/styles/contrast.test.ts` を新規作成:

```ts
import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  deltaEok,
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/styles/contrast.test.ts`
Expected: FAIL（`./contrast` が解決できない）

- [ ] **Step 3: 実装を書く**

`src/styles/contrast.ts` を新規作成:

```ts
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

/** テストの出力に人が読める色を出すため。判定には使わない */
export function toHex(rgb: LinearRgb): string {
  const channel = (v: number): string => {
    const srgb = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
    return Math.round(clamp01(srgb) * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/styles/contrast.test.ts`
Expected: このファイルの `it` がすべて緑

- [ ] **Step 5: 型チェックと lint**

Run: `npx tsc -b && npm run lint`
Expected: どちらもエラー・警告なし

- [ ] **Step 6: コミット**

```bash
git add src/styles/contrast.ts src/styles/contrast.test.ts
git commit -m "色の検証に使う計算を用意する

oklch から線形 sRGB を起こし、WCAG のコントラスト比と OKLab の色差を
出す純関数。色覚多様性のシミュレーション（Machado 2009）も持つ。
アプリの実行時には使わず、パレットを検証するテストからのみ呼ぶ。

依存は足さない。数十行で書ける計算のために色ライブラリを入れると、
配色を差し替えるたびにその依存が計算式ごと変わりうる。"
```

---

## Task 2: パレットを1ファイルに隔離し、検証テストを付ける

**Files:**
- Create: `src/styles/palette.css`
- Test: `src/styles/palette.test.ts`

**Interfaces:**
- Consumes: `./contrast` の `parseOklch` / `oklchToLinear` / `contrastRatio` / `deltaEok` / `simulate` / `toHex` と型 `LinearRgb` / `Vision`（Task 1）
- Produces: `src/styles/palette.css` が定義する CSS 変数 `--canvas` / `--surface` / `--ink` / `--ink-muted` / `--rule` / `--grid` / `--warning` / `--ok` / `--warning-fg` / `--ok-fg`。Task 3 の `index.css` がこれらを参照する

> **このタスクでは `index.css` を触らない。** `palette.css` はまだどこからも `@import` されていない状態で、テストだけが読む。アプリの見た目は変わらない。取り込みは Task 3。

- [ ] **Step 1: 失敗するテストを書く**

`src/styles/palette.test.ts` を新規作成:

```ts
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
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run src/styles/palette.test.ts`
Expected: FAIL（`palette.css` が存在しない）

- [ ] **Step 3: palette.css を書く**

`src/styles/palette.css` を新規作成:

```css
/* =========================================================================
 * facet のパレット
 *
 * ★ このファイルは色値だけを持つ。★
 *   半径・余白・フォント・行間を書かないこと。配色の差し替えが
 *   レイアウトや書体の差し替えを巻き込まなくするための境界である。
 *
 * ★ 色値を持ってよいのはこのファイルだけ。★
 *   コンポーネントは役割名（text-ink / bg-warning / border-rule …）を使う。
 *   src/styles/conventions.test.ts が直書きを機械的に弾く。
 *
 * 配色を差し替えるときは **このファイルだけ** を書き換える。
 * 結果は src/styles/palette.test.ts が検証する:
 *   - ink / ink-muted / warning / ok が canvas と surface の両方に対し 4.5:1 以上
 *   - rule が両方に対し 3:1 以上
 *   - warning-fg / ok-fg がそれぞれの面に対し 4.5:1 以上
 *   （grid は方眼紙の線＝装飾なので対象外）
 *
 * 役割（rev 9章）:
 *   ink        文字・線・ヘッダ（既定の前景）
 *   ink-muted  抑えた文字
 *   warning    警告・削除・未定義
 *   ok         応答・結果・確定
 *   canvas     地（方眼紙を敷く面）
 *   surface    カード・モーダル・テーブルの面
 *   rule       セル境界・入力枠（情報を伝えるので 3:1 が要る）
 *   grid       方眼紙の線（装飾）
 *
 * ライトとダークは独立に置く。反転による自動生成はしない（rev 9章）。
 *
 * 由来は Morphos の morphous-basalt。ただし配布されている theme.css は
 * 使っていない——light.destructive が Primary（Lichen Green）で上書き
 * される生成ミスがあり、そのまま入れると「削除」が緑になる。
 * theme.json の palette から拾い、コントラスト要件を満たすよう明度だけ
 * 調整した値である。閾値ちょうどには合わせていない（要件より 3% 以上の
 * 余裕がある）。数字の根拠は
 * docs/superpowers/plans/2026-08-09-m7-design-tokens-design.md
 * ========================================================================= */

:root {
    /* ライト */
    --canvas: oklch(0.921 0.012 96.4);      /* Lava Paper */
    --surface: oklch(0.961 0.007 88.6);     /* Ash Surface */
    --ink: oklch(0.205 0 89.9);             /* Basalt Black */
    --ink-muted: oklch(0.381 0.007 170.1);  /* Column Grey */
    --rule: oklch(0.6 0.014 120);           /* Mineral Line の色相から導出 */
    --grid: oklch(0.824 0.014 120.3);       /* Mineral Line */
    --warning: oklch(0.518 0.132 34.6);     /* Ember Fault を 4.5:1 超へ */
    --ok: oklch(0.5 0.068 126);             /* Lichen Green を 4.5:1 超へ */

    /* warning / ok を面として使うときに載せる文字色 */
    --warning-fg: oklch(0.961 0.007 88.6);
    --ok-fg: oklch(0.961 0.007 88.6);
}

.dark {
    /* ダーク。ライトの反転ではなく独立に置いた値 */
    --canvas: oklch(0.18 0.004 164.6);      /* Void Basalt */
    --surface: oklch(0.205 0 89.9);         /* Basalt Black */
    --ink: oklch(0.85 0.007 88.6);          /* Ash Surface をそのまま置くと 16.79:1 で眩しい */
    --ink-muted: oklch(0.698 0.042 120);    /* Grey Lichen */
    --rule: oklch(0.508 0.007 170.1);       /* Column Grey では 1.89:1 なので持ち上げた */
    --grid: oklch(0.26 0.006 165);
    --warning: oklch(0.68 0.13 35);
    --ok: oklch(0.75 0.085 126);

    --warning-fg: oklch(0.18 0.004 164.6);
    --ok-fg: oklch(0.18 0.004 164.6);
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/styles/palette.test.ts`
Expected: このファイルの `it` がすべて緑。あわせて出力に次の2行が出る（値は目安。**ここで失敗させない**）

```
[palette] ライト warning/ok ΔE — normal=0.151 / protan=0.050 / deutan=0.041
[palette] ダーク warning/ok ΔE — normal=0.171 / protan=0.137 / deutan=0.065
```

- [ ] **Step 5: コミット**

```bash
git add src/styles/palette.css src/styles/palette.test.ts
git commit -m "色値を palette.css 1ファイルに隔離し、検証を付ける

配色を差し替えるとき AI に書き換えを頼む対象がこのファイルだけになる。
テストは CSS をテキストとして読む——色値を TS 側にも持って CSS を生成
する方式にすると正が2箇所に増え、「このファイルだけ書き換えればいい」
と言えなくなる。

コントラストは canvas と surface の両方を背景として見る。テーブルも
モーダルも surface の上に乗るので、地だけで満たしても足りない。

warning と ok の色差は出力するが失敗させない。採用した配色は P型・D型で
実用域を割ることを承知で選んでおり、ここを門番にすると差し替えのたびに
人間の判断が要る。数字を残せば次に色を触る人が気づく。"
```

---

## Task 3: index.css を一本化する

**Files:**
- Modify: `src/index.css`（全面的に書き換える）
- Test: `src/styles/palette.test.ts`（`destructive` の紐づき検査を追記）

**Interfaces:**
- Consumes: `src/styles/palette.css` の CSS 変数（Task 2）
- Produces: Tailwind のユーティリティ `text-ink` / `text-ink-muted` / `bg-canvas` / `bg-surface` / `bg-warning` / `bg-ok` / `border-rule` / `bg-grid` ほか。**既存コンポーネントが使っている役割名を1つも壊さない**

**振る舞いの変更（意図的なもの。ここに無い差分は計画外）:**

1. shadcn の31トークンが無彩色のグレーから役割トークン由来の色になる。**モーダル・ドロップダウン・ボタンの色が変わる**
2. `--destructive` が `warning` になる（従来は shadcn 既定の赤 `oklch(0.577 0.245 27.325)`）
3. `.dark` の shadcn ブロックが消える。ライト／ダークの出し分けは `palette.css` が一手に持つ
4. `--border` / `--input` がダークで半透明（`oklch(1 0 0 / 10%)`）ではなく不透明な `rule` になる
5. `bg-grid` が新設される（**このタスクでは誰も使わない。** 方眼紙の実装はスコープ外）

- [ ] **Step 1: index.css を書き換える**

`src/index.css` の全内容を次で置き換える:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/geist";
@import "./styles/palette.css";

@custom-variant dark (&:is(.dark *));

/* =========================================================================
 * 役割トークン（rev 9章）を Tailwind のユーティリティに生やす。
 * text-ink / bg-canvas / border-rule / bg-warning … がここから来る。
 *
 * ★ 色値はここに書かない。src/styles/palette.css が唯一の出所。★
 * ========================================================================= */
@theme inline {
    /* Task 4 で値を確定する。ここでは現状のまま残す——
       shadcn の alert-dialog.tsx が font-heading を使っており、
       --font-heading を落とすとユーティリティごと消えてビルドが壊れる */
    --font-heading: var(--font-sans);
    --font-sans: 'Geist Variable', sans-serif;

    --color-ink: var(--ink);
    --color-ink-muted: var(--ink-muted);
    --color-warning: var(--warning);
    --color-warning-fg: var(--warning-fg);
    --color-ok: var(--ok);
    --color-ok-fg: var(--ok-fg);
    --color-canvas: var(--canvas);
    --color-surface: var(--surface);
    --color-rule: var(--rule);
    --color-grid: var(--grid);

    /* shadcn の生成物が参照するトークン */
    --color-sidebar-ring: var(--sidebar-ring);
    --color-sidebar-border: var(--sidebar-border);
    --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
    --color-sidebar-accent: var(--sidebar-accent);
    --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
    --color-sidebar-primary: var(--sidebar-primary);
    --color-sidebar-foreground: var(--sidebar-foreground);
    --color-sidebar: var(--sidebar);
    --color-chart-5: var(--chart-5);
    --color-chart-4: var(--chart-4);
    --color-chart-3: var(--chart-3);
    --color-chart-2: var(--chart-2);
    --color-chart-1: var(--chart-1);
    --color-ring: var(--ring);
    --color-input: var(--input);
    --color-border: var(--border);
    --color-destructive: var(--destructive);
    --color-accent-foreground: var(--accent-foreground);
    --color-accent: var(--accent);
    --color-muted-foreground: var(--muted-foreground);
    --color-muted: var(--muted);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-secondary: var(--secondary);
    --color-primary-foreground: var(--primary-foreground);
    --color-primary: var(--primary);
    --color-popover-foreground: var(--popover-foreground);
    --color-popover: var(--popover);
    --color-card-foreground: var(--card-foreground);
    --color-card: var(--card);
    --color-foreground: var(--foreground);
    --color-background: var(--background);

    --radius-sm: calc(var(--radius) * 0.6);
    --radius-md: calc(var(--radius) * 0.8);
    --radius-lg: var(--radius);
    --radius-xl: calc(var(--radius) * 1.4);
    --radius-2xl: calc(var(--radius) * 1.8);
    --radius-3xl: calc(var(--radius) * 2.2);
    --radius-4xl: calc(var(--radius) * 2.6);
}

/* =========================================================================
 * shadcn の31トークン。**すべて役割トークンから導出する。**
 *
 * ライト／ダークの出し分けは palette.css の :root / .dark が持つので、
 * ここは1ブロックで足りる（var(--canvas) が両モードで解決される）。
 * .dark 用のブロックを作らないこと——作ると色の出所が2箇所になる。
 * ========================================================================= */
:root {
    --background: var(--canvas);
    --foreground: var(--ink);
    --card: var(--surface);
    --card-foreground: var(--ink);
    --popover: var(--surface);
    --popover-foreground: var(--ink);

    /* ボタン・選択状態。**Lichen Green を primary に流さない**——
       ボタンが緑になると ok（確定）と意味が衝突する */
    --primary: var(--ink);
    --primary-foreground: var(--surface);
    --secondary: var(--canvas);
    --secondary-foreground: var(--ink);
    --muted: var(--canvas);
    --muted-foreground: var(--ink-muted);
    --accent: var(--canvas);
    --accent-foreground: var(--ink);

    /* 破壊的アクション。Morphos の theme.css はここが Primary で上書き
       される生成ミスがあり、Basalt では緑になっていた。
       palette.test.ts が紐づきを検査する */
    --destructive: var(--warning);

    --border: var(--rule);
    --input: var(--rule);
    /* フォーカスリング。**ok を当てない**——「いまフォーカスがある」と
       「確定した」は別の意味であり、同じ色にすると型区別が薄まる */
    --ring: var(--ink);

    /* facet では未使用。無彩色のまま残すと、shadcn のコンポーネントを
       後から足したときにそこだけ浮くので役割トークンから導出しておく */
    --chart-1: var(--ink);
    --chart-2: var(--ink-muted);
    --chart-3: var(--rule);
    --chart-4: var(--warning);
    --chart-5: var(--ok);

    --sidebar: var(--surface);
    --sidebar-foreground: var(--ink);
    --sidebar-primary: var(--ink);
    --sidebar-primary-foreground: var(--surface);
    --sidebar-accent: var(--canvas);
    --sidebar-accent-foreground: var(--ink);
    --sidebar-border: var(--rule);
    --sidebar-ring: var(--ink);

    /* 色ではない */
    --radius: 0.625rem;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
    }
  body {
    @apply bg-background text-foreground;
    }
  html {
    @apply font-sans;
    }
}
```

> **`--font-heading` / `--font-sans` は現状のまま残してある。** 値の確定は Task 4。このタスクで変わるのは色だけ。

- [ ] **Step 2: `destructive` の検査を palette.test.ts に追記**

`src/styles/palette.test.ts` の末尾に追加:

```ts
const indexCss = stripComments(readFileSync(new URL('../index.css', import.meta.url), 'utf8'))

describe('index.css', () => {
  it('destructive が warning に紐づいている', () => {
    // Morphos の theme.css は light.destructive が Primary で上書きされる
    // 生成ミスがあり、Basalt では「削除」が緑になっていた。
    // 配色を差し替えるたびに人の目で確かめなくて済むよう機械で見る
    expect(indexCss).toMatch(/--destructive:\s*var\(--warning\)\s*;/)
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
})
```

- [ ] **Step 3: テストが通ることを確認**

Run: `npm test`
Expected: 既存テストを含めてすべて緑。**既存の DOM テストが落ちたら、それは役割名を壊した印なので直すこと**（このタスクは色の値だけを変え、クラス名を変えない）

- [ ] **Step 4: ビルドが通ることを確認**

Run: `npx tsc -b && npm run build`
Expected: どちらも成功。**Tailwind が `bg-grid` などの新しいユーティリティを生成できているかはここで分かる**（`@theme inline` の記述ミスはビルド時に落ちる）

- [ ] **Step 5: lint**

Run: `npm run lint`
Expected: 警告なし

- [ ] **Step 6: コミット**

```bash
git add src/index.css src/styles/palette.test.ts
git commit -m "shadcn のトークンを役割トークンから導出して一本化する

これまで shadcn 標準の無彩色グレー31個と facet の役割トークンが無関係に
並存しており、shadcn 由来のモーダル・ドロップダウン・ボタンだけが facet の
色を纏っていなかった。

ライトとダークの出し分けは palette.css が一手に持つので、shadcn 側は
:root の1ブロックで足りる。.dark 用のブロックを作ると色の出所が2箇所に
増えるため作らない。

primary に Lichen Green を流さない。ボタンが緑になると ok（確定）と
意味が衝突する。ring にも ok を当てない——「いまフォーカスがある」と
「確定した」は別の意味である。"
```

---

## Task 4: フォントとタイポグラフィを確定する

**Files:**
- Modify: `src/index.css`（`@theme inline` にフォントと行間を足す）

**Interfaces:**
- Consumes: なし
- Produces: `--font-sans` / `--font-mono` / `--text-{xs,sm,base,lg}--line-height`

**振る舞いの変更（意図的なもの）:**

1. **日本語の書体が変わる。** これまで `'Geist Variable', sans-serif` で、Geist は日本語グリフを持たないため環境依存のフォールバック（Windows では MS UI Gothic になりうる）に落ちていた
2. **行間が広がる。** `text-sm` が 1.43 → 1.65。テーブルの行が高くなる
3. `font-mono` が使えるようになる（**このタスクでは誰も使わない。** 適用はスコープ外）

- [ ] **Step 1: `@theme inline` のフォント指定を差し替える**

`src/index.css` の `@theme inline` ブロック先頭にある2行

```css
    --font-heading: var(--font-sans);
    --font-sans: 'Geist Variable', sans-serif;
```

（Task 3 で付けたコメントごと）を、次で置き換える:

```css
    /* タイポグラフィ（M7 決定6）。
     *
     * サイズは Tailwind の既定のまま（xs 12 / sm 14 / base 16 / lg 18px）。
     * 再定義しない——既存コードは sm と xs でほぼ回っており、shadcn の
     * 生成物も text-sm を既定にしている。ここで語彙を作り直しても得るものがない。
     *
     * **使ってよいのは xs / sm / base / lg の4段だけ。**
     * xl 以上と任意値 text-[...] は src/styles/conventions.test.ts が弾く。
     *
     * 行間だけ日本語向けに上書きする。Tailwind の既定は英文基準で、
     * text-sm は 1.43。用語集の定義・備考は自由記述の複数行が入る欄なので、
     * ここが読みにくさに直結する。
     *
     * Geist は日本語グリフを持たない。和文のフォールバックを明示しないと
     * 環境依存で MS UI Gothic に落ちる。和文フォントは同梱しない——
     * rev 7章が配布形態を Windows のデスクトップアプリと定めており、
     * Yu Gothic UI は Windows 8.1 以降の標準搭載なので事実上固定される */
    --font-heading: var(--font-sans);
    --font-sans: 'Geist Variable', 'Yu Gothic UI', 'Hiragino Sans', sans-serif;
    --font-mono: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    --text-xs--line-height: 1.5;
    --text-sm--line-height: 1.65;
    --text-base--line-height: 1.5;
    --text-lg--line-height: 1.4;
```

- [ ] **Step 2: ビルドしてユーティリティが生成されることを確認**

Run: `npm run build`
Expected: 成功

- [ ] **Step 3: 生成された CSS に行間が乗っているか確認**

Run: `grep -c "line-height" dist/assets/*.css`
Expected: 1 以上（0 なら `@theme inline` の記述が効いていない。**その場合は辻褄を合わせず報告すること** — Tailwind v4 の `--text-*--line-height` は `@theme` 側に置く必要があるかもしれない）

- [ ] **Step 4: テストと lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑・警告なし

- [ ] **Step 5: コミット**

```bash
git add src/index.css
git commit -m "フォントと行間を確定する

--font-sans が 'Geist Variable', sans-serif のままだった。Geist は日本語
グリフを持たないため、facet の画面に出る日本語のほぼ全てが環境依存の
フォールバックに落ちており、Windows では MS UI Gothic になりうる。
会議で画面共有する道具なので実害がある。

行間の指定はこれまで1箇所も無く、全て英文基準の既定（text-sm で 1.43）
のまま動いていた。定義・備考は自由記述の複数行が入る欄なので、ここを
日本語向けに開く。サイズ自体は既定のまま再定義しない。"
```

---

## Task 5: 規約をソースから機械検査する

**Files:**
- Test: `src/styles/conventions.test.ts`（新規）

**Interfaces:**
- Consumes: なし（`node:fs` だけ）
- Produces: なし（テストのみ）

> **このタスクで既存コードを直す必要は無いはず。** 着手時点で色値の直書きは 0 件、許可外の `text-*` は shadcn 生成物の 1 件（除外対象）のみであることを確認済み。**もし違反が出たら、それは Task 3・4 で混入したものなので直すこと。**

- [ ] **Step 1: テストを書く**

`src/styles/conventions.test.ts` を新規作成:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC_DIR = fileURLToPath(new URL('../', import.meta.url))

/**
 * 走査から外すもの。**増やすときは必ず理由をここに書くこと。**
 * 除外が理由なく増えると、検査は残っているのに何も守らなくなる
 */
const EXCLUDED = [
  // shadcn の生成物。rev 7章「手で整形しない」
  'components/ui/',
]

/** テストファイルは対象外。期待値として色値を持つことがある（contrast.test.ts） */
const isTest = (name: string): boolean => /\.(test|spec)\.tsx?$/.test(name)

function sourceFiles(): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      const rel = path.relative(SRC_DIR, full).split(path.sep).join('/')
      if (EXCLUDED.some((prefix) => rel.startsWith(prefix))) continue
      if (entry.isDirectory()) {
        walk(full)
      } else if (/\.tsx?$/.test(entry.name) && !isTest(entry.name)) {
        found.push(full)
      }
    }
  }
  walk(SRC_DIR)
  return found
}

const relative = (file: string): string =>
  path.relative(SRC_DIR, file).split(path.sep).join('/')

function offendingLines(pattern: RegExp): string[] {
  const out: string[] = []
  for (const file of sourceFiles()) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (pattern.test(line)) out.push(`src/${relative(file)}:${index + 1}  ${line.trim()}`)
      })
  }
  return out
}

describe('走査の対象', () => {
  it('ソースを1つ以上見つけている', () => {
    // 除外条件の書き間違いで0件になり、何も検査しないまま緑になるのを防ぐ
    expect(sourceFiles().length).toBeGreaterThan(0)
  })

  it('shadcn の生成物を含まない', () => {
    expect(sourceFiles().filter((f) => relative(f).startsWith('components/ui/'))).toEqual([])
  })
})

describe('色値の直書き禁止（rev 9章）', () => {
  it('色値を持つのは src/styles/palette.css だけ', () => {
    const offenders = offendingLines(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/)
    expect(
      offenders,
      `色値は palette.css だけが持つ。役割名（text-ink / bg-warning …）を使うこと:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

describe('フォントサイズの段階（M7 決定6）', () => {
  it('text-xs / text-sm / text-base / text-lg 以外を使っていない', () => {
    // 「許可外」を直接探す。text-ink のような色のユーティリティと区別する
    // 必要があるので、許可リストとの照合ではなく xl 以上と任意値を弾く
    const offenders = offendingLines(/\btext-(xl|[2-9]xl|\[[^\]]*\])\b/)
    expect(
      offenders,
      `使ってよいのは text-xs / text-sm / text-base / text-lg の4段:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
```

- [ ] **Step 2: テストを実行**

Run: `npx vitest run src/styles/conventions.test.ts`
Expected: このファイルの `it` がすべて緑

- [ ] **Step 3: 検査が本当に効くことを確かめる**

一時的に `src/App.tsx` の任意の行へ `// #ff0000` を書き足して実行する。

Run: `npx vitest run src/styles/conventions.test.ts`
Expected: FAIL し、メッセージに `src/App.tsx:<行番号>` が出る

**確認できたら書き足した行を必ず消す。**

Run: `git diff --exit-code src/App.tsx`
Expected: 差分なし（終了コード 0）

- [ ] **Step 4: 全体を通す**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑・警告なし

- [ ] **Step 5: コミット**

```bash
git add src/styles/conventions.test.ts
git commit -m "色値の直書きとフォントサイズの段階を機械検査にする

rev 9章の「色値の直書き禁止」は M1 から規約としてのみ守られてきた。
守られてはいたが、守られていることを確かめる手段が人の目しか無かった。
タイポグラフィの段階制限も放っておけば同じになる。

除外は shadcn の生成物とテストファイルだけ。走査が0件になって何も
検査しないまま緑になる事故を防ぐため、対象を1つ以上見つけていること
自体もテストする。"
```

---

## Task 6: 実機確認（人間の作業）

**Files:** なし（確認のみ）

> **サブエージェントはこのタスクを実行できない。** GUI 操作が要る。ここまでのタスクが緑になったら人間に引き渡すこと。

- [ ] **Step 1: 起動**

Run: `npm run tauri dev`

- [ ] **Step 2: ライトモードで見る**

確認項目:

- [ ] 地（`canvas`）が Lava Paper のごく淡い灰白になっている。純白ではない
- [ ] ファイル一覧・エディタの面（`surface`）が地よりわずかに明るく、**浮いて見える**
- [ ] テーブルのセル境界（`rule`）が見える。薄すぎて消えていない
- [ ] 未定義の用語（`definition` が空）の赤が、**背景に沈まず目に入る**
- [ ] issue 件数のバッジが読める
- [ ] 日本語が MS UI Gothic ではない（**字面が崩れていない**）。英数字は Geist、日本語は Yu Gothic UI
- [ ] テーブルの行間が広すぎない（`text-sm` の 1.65）。**1画面に入る行数が実用に耐えるか**

- [ ] **Step 3: ダークモードで見る**

画面右上のテーマ切替ボタンを押す（`App.tsx` の `toggleTheme`）。

- [ ] 本文が眩しくない（`ink` は L0.850 で 11.89:1。Ash Surface そのままの 16.79:1 ではない）
- [ ] セル境界が見える（ダークの `rule` は canvas 上 3.25 / surface 上 3.10）
- [ ] 未定義の赤が読める

- [ ] **Step 4: shadcn 由来の UI を見る**

ファイルを削除しようとして確認ダイアログを出す（**実際に削除まで進めなくてよい**）。

- [ ] モーダルの面と枠が facet の色になっている（無彩色のグレーのままではない）
- [ ] **削除ボタンが赤系（`warning`）である。** ここが緑や灰色なら `--destructive` の導出が効いていない
- [ ] 外部変更のトーストを出す（別のエディタで用語集を書き換える）。枠と面が facet の色になっている

- [ ] **Step 5: 気づいたことを記録する**

行間・ホバーの見え方・未定義セルの文字色など、**この計画で「実機確認で決める」としたものの結論**をメモする。Task 7 の申し送りに書く。

- [ ] **Step 6: 遊び場の痕跡を捨てる**

```bash
git checkout -- sample-project/ && git clean -fd sample-project/
git status --short
```

Expected: 空

---

## Task 7: ドキュメントを更新する

**Files:**
- Create: `docs/history/m7-core-design-tokens.md`
- Modify: `docs/overview-rev.md`（9章）
- Modify: `docs/open-issues.md`
- Modify: `docs/README.md`（マイルストーン表の M7 の行）

> `CLAUDE.md` の「マイルストーン完了時に触る3箇所」に従う。**rev への反映を申し送りの TODO に残さない**（M4 の教訓）。

- [ ] **Step 1: rev 9章を書き換える**

`docs/overview-rev.md` の「### 決定：役割トークンとパレットの分離。色値は仮置き」節を書き換える。

**変えないもの**: 二層構造、3系統のアクセント、ライト／ダーク独立パレット、shadcn の規約に乗ること。

**削除する2つの記述**（どちらも役目を終えた。原文はこう書かれている）:

> - 現行デザインは正式採用**しない**。色は未確定であり、ドッグフーディング後に決める。ただし構造だけ先に確定させ、色の差し替えをパレット定義1ファイルの書き換えで済むようにする。

> - 初期値として現行3色（#22303C / #C73E3A / #2C7A6E）をライトモード側パレットに流用してよいが、あくまで仮置きであることをコード上も明示する。

**置き換える内容**:

- 見出しから「色値は仮置き」を外す
- 1つ目の削除箇所には、**M7 で Morphos の Basalt を下敷きに確定したこと**、`src/styles/palette.css` 1ファイルの差し替えで変えられること、`palette.test.ts` がコントラスト要件を検証することを書く
- 無彩色系の列挙に、`rule`（セル境界・入力枠。**情報を伝えるので 3:1 が要る**）と `grid`（方眼紙の線。**装飾なのでコントラスト要件の対象外**）が**別トークンである**ことを足す
- 「確定要素」節のフォントの記述を、確定した値（Geist ＋ 和文フォールバック、`--font-mono` の新設、4段のスケールと日本語向けの行間）に置き換える

**`rev N章` の章番号とファイル名は動かさない**（249箇所から参照されている）。

- [ ] **Step 2: rev 11章の1行を書き換える**

同じファイルの「## 11. 検証の観点（ドッグフーディング）」にある

> - **色・デザインの確定（9章）** はドッグフーディングの使用感を経てから行う。

を、**確定済みであること**と、**残っている検証はドッグフーディングを経てから行うもの**（P型・D型での識別性、会議で投影したときの読みやすさ、テーブルの行間の密度）に書き換える。

- [ ] **Step 3: open-issues.md を更新する**

**消すもの:** 無し（M7 が解消する既存項目は無い）。

**足すもの:**

```markdown
## デザイン

- **`warning` と `ok` が P型・D型色覚で識別できない**（`src/styles/palette.css`）: 採用した Basalt 由来の配色は、OKLab の色差が標準色覚で 0.151 / P型 0.050 / D型 0.041（ライト）。0.10 を下回ると「同じ色の濃淡」に見え始める。**色を差し替えるときに、青緑側（`oklch(0.470 0.075 168)` 付近）へ振る案を再検討すること。** `palette.test.ts` がこの数字を毎回出力するが、意図的に失敗させていない（設計スペック 決定4） `[M7]`
- **`ok` がどのコンポーネントからも参照されていない**（`src/styles/palette.css`）: rev 9章の3系統として定義とテストはあるが、facet の画面に「確定・応答」を色で示す箇所がまだ無い（トーストは種別を持たない）。**成功トーストなどを作った時点で使う** `[M7]`
- **方眼紙背景が未実装**（rev 9章「確定要素」）: `grid` トークンは定義済みで、`bg-grid` も生えているが、背景を敷く実装が無い `[M7]`
```

**実機確認（Task 6）で見つかったものがあれば、あわせて足す。**

- [ ] **Step 4: 申し送りを書く**

`docs/history/m7-core-design-tokens.md` を新規作成。**そのとき何が起きたかの記録であり、後から書き換えない。** 最低限これらを含める:

- Morphos の `theme.css` の生成ミス（`light.destructive` が Primary で上書きされる）を Sandpiper・Basalt・Ibex の3つで確認したこと。**将来ほかのモチーフに差し替えるときも同じ検査が要る**
- 二分探索で 4.50:1 ちょうどに合わせた値が、oklch から線形 sRGB を起こし直すと 4.49:1 になった件。**閾値ちょうどの値を置かない**
- `rule` を `canvas` だけ見て決めたら `surface` 上で 3:1 を割った件。**背景は両方見る**
- Basalt の `Mineral Line` が罫線として 1.36:1 しか出ず、`rule` と `grid` を分ける必要が出た経緯
- 候補 A（Lichen Green そのまま）が canvas 上 2.72:1 で使えず、B（暗くする）を選んだこと。C（青緑）が識別性で優れていたが世界観を優先したこと
- 実機確認で決めたこと（行間の最終値、未定義セルの文字色、ホバーの見え方）

- [ ] **Step 5: README のマイルストーン表を更新する**

`docs/README.md` の表で `| M7（未着手） | デザイントークン整備 | コア |` を、他の行と同じ形式（`history/` へのリンク付き）に直す。

- [ ] **Step 6: 全体を通す**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑・警告なし

- [ ] **Step 7: コミット**

```bash
git add docs/
git commit -m "M7 の確定内容をドキュメントへ反映する

rev 9章の「色値は仮置き」を確定に置き換え、初期値として残していた
現行3色の記述を消す。grid と rule が別トークンであることと、確定した
フォント・行間を足す。

open-issues には、P型・D型で warning と ok が識別できないこと、ok が
まだどこからも参照されていないこと、方眼紙背景が未実装であることを
新たに記録する。"
```

---

## 完了条件

- [ ] `npm test` がすべて緑
- [ ] `npx tsc -b` がエラーなし
- [ ] `npm run lint` が警告なし
- [ ] `npm run build` が成功
- [ ] 実機確認（Task 6）の全項目を人間が確認済み
- [ ] `git status --short` が空（`sample-project/` の痕跡が残っていない）
- [ ] `docs/overview-rev.md` 9章に「仮置き」の記述が残っていない
