import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  composite,
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
  'surface-accent',
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

const VISIONS = ['normal', 'protan', 'deutan'] as const satisfies readonly Vision[]

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

/**
 * 半透明の重ね合わせ（M8 決定11）。**値は GlossaryEditor.tsx の
 * errorCell / warnCell と一致していなければならない**（下の紐づき検査が見る）
 */
const OVERLAYS = [
  { label: 'エラーセル', alpha: 0.2, className: 'bg-warning/20' },
  { label: '未定義・未分類セル', alpha: 0.1, className: 'bg-warning/10' },
] as const

/**
 * これらの面の上に置く文字。**warning は置かない**（M8 決定12）——
 * 測ると warning/10 の面の上で 4.59:1 しか出ず、同系色が重なって読みにくい
 */
const OVERLAY_FOREGROUNDS = [
  { token: 'ink', use: '本文' },
  { token: 'ink-muted', use: 'プレースホルダ「未定義」' },
] as const

/** 閾値ちょうどを置かない（M7 の教訓）。本文 4.5:1 に3%の余裕 */
const OVERLAY_MIN = 4.5 * 1.03

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

    for (const bg of BACKGROUNDS) {
      for (const overlay of OVERLAYS) {
        for (const fg of OVERLAY_FOREGROUNDS) {
          it(`${fg.token}（${fg.use}）が ${overlay.className} を ${bg} に重ねた面の上で ${OVERLAY_MIN.toFixed(2)}:1 以上`, () => {
            const face = composite(palette.warning, palette[bg], overlay.alpha)
            const ratio = contrastRatio(palette[fg.token], face)
            expect(
              ratio,
              `${toHex(palette[fg.token])} / ${toHex(face)} = ${ratio.toFixed(2)}:1`,
            ).toBeGreaterThanOrEqual(OVERLAY_MIN)
          })
        }
      }
    }
  })
}

/**
 * 見出しの面（テーブルのカラム名）。
 *
 * **`BACKGROUNDS` に入れないのは意図的。** あちらは「あらゆる役割トークンが
 * 載りうる汎用の面」（地とカードの面）の集合で、`surface-accent` の上に載るのは
 * カラム名の文字だけである。`warning` や `ok` や `rule` をこの面の上で
 * 要件を満たすよう縛ると、淡い緑を選べなくなる（この面より暗い色でしか
 * 3:1 / 4.5:1 を作れないため）。**載らないものを検証しない**代わりに、
 * 載るものは両モードで必ず検証する
 */
describe('見出しの面（surface-accent）', () => {
  for (const mode of MODES) {
    const palette = toPalette(mode.pattern, mode.label)
    for (const token of ['ink', 'ink-muted'] as const) {
      it(`${mode.label}の ${token} が surface-accent の上で 4.5:1 以上`, () => {
        const ratio = contrastRatio(palette[token], palette['surface-accent'])
        expect(
          ratio,
          `${toHex(palette[token])} / ${toHex(palette['surface-accent'])} = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})

describe('warning と ok の識別（記録のみ。失敗させない）', () => {
  for (const mode of MODES) {
    it(`${mode.label}の ΔE を標準色覚・P型・D型で出力する`, () => {
      const palette = toPalette(mode.pattern, mode.label)
      const values = VISIONS.map((vision) =>
        deltaEok(simulate(palette.warning, vision), simulate(palette.ok, vision)),
      )
      const measured = VISIONS.map((vision, i) => `${vision}=${values[i].toFixed(3)}`)

      // ★ この値では失敗させない（設計スペック 決定4）。
      //
      //   採用した配色は P型・D型で ΔE が実用域（0.10）を割る。それを承知で
      //   選んでおり、ここで失敗にすると配色を差し替えるたびに人間の判断を
      //   要求する門番になる。**このテストが守るものは無い。見せるだけである。**
      //   閾値を足して「守るもの」に変えるなら、それは設計判断の変更なので
      //   設計スペックの側を先に直すこと。
      //   ただし「見せる数字が数字であること」だけは保証する——計算が壊れて
      //   NaN になっても、この形のアサーションは気づかずに緑を返すため
      console.info(`[palette] ${mode.label} warning/ok ΔE — ${measured.join(' / ')}`)
      expect(measured).toHaveLength(3)
      expect(values.every(Number.isFinite)).toBe(true)
    })
  }
})

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

  it('方眼紙のユーティリティが grid トークンから色を取る（M8 決定15）', () => {
    expect(indexCss).toMatch(/@utility\s+bg-grid-paper/)
    // 色は必ず役割トークン経由。直書きは同じ describe の別の it が弾く。
    //
    // **検査は @utility ブロックの中に絞る。** 以前は
    // `bg-grid-paper[\s\S]*var(--grid)` で「bg-grid-paper の後、ファイル末尾
    // までのどこかに var(--grid) がある」ことしか見ておらず、@utility が
    // index.css の最後にあるから緑になっていただけだった。後ろに
    // var(--grid) を使う定義を1つ足した瞬間に空洞化する——「症状を
    // 取り違えたテストは、無いテストより危険」（lessons-for-planning.md）
    // の型に当たるため、ブロックの範囲にスコープを絞る
    expect(indexCss).toMatch(/@utility\s+bg-grid-paper\s*\{[^}]*var\(--grid\)/)
  })

  it('マス目のサイズを持つ', () => {
    expect(indexCss).toMatch(/--grid-size:\s*\d+px/)
  })
})

/**
 * TSX のコメントを落とす。**行番号を保つ必要は無いので単純に消す。**
 *
 * 既存の `stripComments`（このファイルの先頭）は CSS 用で `/* *​/` しか
 * 落とさない。TSX には `//` があるうえ、下の検査が読む GlossaryEditor.tsx は
 * コメントの中で `/25`（不採用にした濃さ）に言及している。コメントを
 * 落とさずに走査すると、説明文が違反として検出される——M7 の Task 5 が
 * 踏んだ「計画自身が機械検査と衝突する」形そのものである
 */
const stripTsComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const glossaryEditorSource = stripTsComments(
  readFileSync(new URL('../modules/glossary/GlossaryEditor.tsx', import.meta.url), 'utf8'),
)

/**
 * モジュール配下の画面コンポーネントを走査する。**決め打ちのパスを列挙しない。**
 *
 * M10 で ErrorCatalogEditor.tsx が加わり、同じ半透明の濃さ（errorCell /
 * warnCell）を GlossaryEditor.tsx から独立に宣言した。パスを列挙する形だと
 * 3本目・4本目が増えたときに登録し忘れが構造的に起きるので、
 * conventions.test.ts の sourceFiles() と同じ「readdirSync で歩く」形に揃える。
 *
 * **`*Editor.tsx` に絞らない。** ロジックツリーは赤表示の面をエディタ本体
 * ではなく NodeBox.tsx（ノード1つ分の部品）が当てており、エディタだけを
 * 読む形では検算していない濃さがそこを素通りしていた
 */
const MODULES_DIR = fileURLToPath(new URL('../modules/', import.meta.url))

function componentSourceFiles(): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (/\.tsx$/.test(entry.name) && !/\.(test|spec)\.tsx$/.test(entry.name)) {
        found.push(full)
      }
    }
  }
  walk(MODULES_DIR)
  return found
}

const componentSources = componentSourceFiles().map((file) => ({
  file: path.relative(MODULES_DIR, file).split(path.sep).join('/'),
  source: stripTsComments(readFileSync(file, 'utf8')),
}))

describe('重ね合わせの値が実装と一致している', () => {
  it('走査でコンポーネントのソースを1つ以上見つけている', () => {
    // 除外条件の書き間違いや対象の取り違えで0件になり、何も検査しないまま
    // 緑になるのを防ぐ（conventions.test.ts「ソースを1つ以上見つけている」と同じ理由）
    expect(componentSources.length).toBeGreaterThan(0)
  })

  // 上の検算は OVERLAYS の alpha を見ているだけなので、実装が別の濃さを
  // 使っていても緑になる。**検算と実装を繋ぐのはこの検査である**
  //
  // 「その文字列がどこかにある」だけでは弱い——errorCell と warnCell の
  // 値を入れ替えても、両方の文字列は存在し続けるので緑のまま通ってしまう。
  // それでは「エラーが警告より濃い」という関係が壊れても検知できない。
  // 変数名と値を直接結びつけることで、入れ替えを検出できるようにする。
  //
  // **宣言している側を全部見る。** 決め打ちで1本だけ読むと、2本目以降が
  // 独立に別の濃さを宣言しても検知できない（M10 で実際に起きた）。
  //
  // 「全コンポーネントがこの2本を宣言している」ことは要求しない——
  // 表を持たないエディタ（ロジックツリー）はセルという単位を持たず、
  // 使いもしない定数を検査のためだけに置かせるのは本末転倒である。
  //
  // ただし**「宣言があるファイルだけを見る」形にはしないこと。** それだと
  // 検査対象がソース側の自己申告になり、定数名を errorCell → errorFace に
  // 変えるだけで検査から抜けられる（濃さを入れ替えても 20 と 10 はどちらも
  // 既知の alpha なので、下の「検算していない濃さ」も受け皿にならない）。
  // **名前が error / warn を名乗るなら濃さは検算した値でなければならない**
  // という否定形にして、名前を変えて逃げる道を塞ぐ
  it('errorCell と warnCell がそれぞれ検算した濃さに紐づいている', () => {
    const declaring = componentSources.filter(({ source }) =>
      /const\s+(errorCell|warnCell)\s*=/.test(source),
    )
    // 宣言が1本も無くなったら、この検査は何も守っていない
    expect(declaring.length).toBeGreaterThan(0)
    for (const { file, source } of declaring) {
      expect(source, file).toMatch(/const errorCell = 'bg-warning\/20'/)
      expect(source, file).toMatch(/const warnCell = 'bg-warning\/10'/)
    }
    for (const { file, source } of componentSources) {
      expect(source, file).not.toMatch(/const\s+\w*[eE]rror\w*\s*=\s*'bg-warning\/(?!20\b)\d+'/)
      expect(source, file).not.toMatch(/const\s+\w*[wW]arn\w*\s*=\s*'bg-warning\/(?!10\b)\d+'/)
    }
  })

  it('検算していない濃さを使っていない', () => {
    // bg- だけでなく border- / text- も見る。**枠線や文字も半透明の
    // warning を名乗りうる**ため、面（bg-）に絞ると素通りする
    // （GutterSlot.tsx の枠が実際にすり抜けていた。M1 sequence Task 12）
    for (const { file, source } of componentSources) {
      const used = [...source.matchAll(/(?:bg|border|text)-warning\/(\d+)/g)].map((m) =>
        Number(m[1]),
      )
      const known = OVERLAYS.map((o) => Math.round(o.alpha * 100))
      expect([...new Set(used)].filter((u) => !known.includes(u)), file).toEqual([])
    }
  })

  it('プレースホルダに warning 系の文字色を使っていない（M8 決定12）', () => {
    expect(glossaryEditorSource).not.toMatch(/placeholder:text-warning/)
  })
})
