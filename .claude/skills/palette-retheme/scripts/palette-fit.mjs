#!/usr/bin/env node
/**
 * 配色差し替えの検算スクリプト。
 *
 * **固有のロジックを持たない。** 読む・呼ぶ・出すだけ。判定の式や要件の値は
 * すべて src/styles/contrast.ts と src/styles/palette-requirements.ts にある。
 * ここに contrast.ts の関数の再実装や palette-requirements.ts の表の書き写しが
 * 現れたら、それはこのスクリプトの設計が壊れている（このプロジェクトには
 * Skill スクリプトがアプリのロジックを複製し、両者が食い違った負債の記録がある）。
 *
 * 使い方:
 *   node palette-fit.mjs --in <path>
 *
 *   <path> が .css → palette.css として読む（:root と .dark ブロックを拾う）
 *   <path> が .json → 下書きとして読む。形は
 *     { "light": { "canvas": "#eae6de", ... }, "dark": { ... } }
 *
 * 終了コード: 全要件を満たせば 0、1つでも満たさなければ 1、使い方の誤りは 2。
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  contrastRatio,
  deltaEok,
  fitLightness,
  linearToOklch,
  oklchToLinear,
  parseAnyCssColor,
  parseOklch,
  simulate,
  toHex,
} from '../../../../src/styles/contrast.ts'
import {
  ACHROMATIC,
  ACHROMATIC_MAX_C,
  BACKGROUNDS,
  DISTINCT_MIN,
  DISTINCT_PAIRS,
  FACE_PAIRS,
  FACE_REQUIREMENTS,
  GAMUT_MAX_C_DRIFT,
  MARGIN,
  MODES,
  readTokenBlock,
  REQUIREMENTS,
  stripCssComments,
  TOKENS,
} from '../../../../src/styles/palette-requirements.ts'

// VISIONS は palette.test.ts と同じ3値。ΔE は合否の対象
// （DISTINCT_MIN、下の failCount 加算を見よ）。契約側（palette-requirements.ts）
// に VISIONS を置かないのは、色覚の種類が要件そのものではなく検査の観点
// だから——要件は DISTINCT_PAIRS と DISTINCT_MIN の側にある
const VISIONS = ['normal', 'protan', 'deutan']

// == 出口 ==================================================================

function usage() {
  return [
    '使い方: node palette-fit.mjs --in <path>',
    '',
    '  <path> が .css  → palette.css として読む（:root / .dark ブロックを拾う）',
    '  <path> が .json → 下書きとして読む。形は',
    '                    { "light": { "canvas": "...", ... }, "dark": { ... } }',
  ].join('\n')
}

function die(code, message) {
  console.error(message)
  if (code === 2) {
    console.error('')
    console.error(usage())
  }
  process.exit(code)
}

// == Step 1: 引数を読む =====================================================

const argv = process.argv.slice(2)
const inIndex = argv.indexOf('--in')
const inPath = inIndex === -1 ? undefined : argv[inIndex + 1]
if (inPath === undefined) die(2, '引数 --in <path> がありません。')

const ext = path.extname(inPath).toLowerCase()
if (ext !== '.css' && ext !== '.json') {
  die(2, `対応していない拡張子です（.css か .json を指定してください）: ${inPath}`)
}

let fileText
try {
  fileText = readFileSync(inPath, 'utf8')
} catch (err) {
  die(2, `ファイルを読めません: ${inPath}（${err.message}）`)
}

// == Step 2: { light, dark } へ正規化する ===================================

// JSON 下書きの "light" / "dark" キーと MODES を対応づける。
// **`pattern` の中身で判定する**（MODES の並び順には依存しない）。
// 配列の位置（MODES[0] / MODES[1]）で対応づけると、MODES を並び替えた
// だけで JSON のキーと中身が黙って入れ替わる
const PATTERN_TO_JSON_KEY = { ':root': 'light', '\\.dark': 'dark' }
const MODE_KEYS = MODES.map((mode) => {
  const key = PATTERN_TO_JSON_KEY[mode.pattern]
  if (key === undefined) {
    die(2, `MODES に未知の pattern があります（palette-requirements.ts を確認してください）: ${mode.pattern}`)
  }
  return { key, ...mode }
})

/** @type {Record<'light' | 'dark', Record<string, string>>} */
const raw = { light: {}, dark: {} }

if (ext === '.css') {
  const css = stripCssComments(fileText)
  for (const mode of MODE_KEYS) {
    let block
    try {
      block = readTokenBlock(css, mode.pattern, mode.label)
    } catch (err) {
      die(2, err.message)
    }
    raw[mode.key] = block
  }
} else {
  let parsed
  try {
    parsed = JSON.parse(fileText)
  } catch (err) {
    die(2, `${inPath} が正しい JSON ではありません（${err.message}）`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    die(2, `${inPath} はオブジェクトである必要があります（{ "light": {...}, "dark": {...} }）`)
  }
  for (const mode of MODE_KEYS) {
    const block = parsed[mode.key]
    if (typeof block !== 'object' || block === null) {
      die(2, `${inPath} に "${mode.key}"（${mode.label}）が無いか、オブジェクトではありません。`)
    }
    raw[mode.key] = block
  }
}

// トークンが足りない、または文字列でないか確認する
// （.json は自由形式なので数値や null が紛れ得る。.css は readTokenBlock が
// 常に文字列を返すのでここには掛からない）
for (const mode of MODE_KEYS) {
  const missing = TOKENS.filter((t) => typeof raw[mode.key][t] !== 'string')
  if (missing.length > 0) {
    die(2, `${mode.label}に無い、または文字列でないトークンがあります: ${missing.map((t) => `--${t}`).join(', ')}`)
  }
}

// == Step 3: 各色を測れる形にする ===========================================

/** @type {Record<'light' | 'dark', Record<string, [number, number, number]>>} */
const linear = { light: {}, dark: {} }
/** @type {Record<'light' | 'dark', Record<string, { L: number, C: number, H: number }>>} */
const oklch = { light: {}, dark: {} }
/** モードごとの alpha 警告 [{ token, value, alpha }] */
const alphaWarnings = { light: [], dark: [] }

for (const mode of MODE_KEYS) {
  for (const token of TOKENS) {
    const value = raw[mode.key][token]
    const parsed = parseAnyCssColor(value)
    if (parsed === null) {
      die(2, `${mode.label}の --${token} を色として読めません: ${value}`)
    }
    if (parsed.alpha !== 1) {
      alphaWarnings[mode.key].push({ token, value, alpha: parsed.alpha })
    }
    linear[mode.key][token] = parsed.rgb
    oklch[mode.key][token] = linearToOklch(parsed.rgb)
  }
}

// == Step 4/5: 測って出力する ===============================================

const fmtOklch = (c) => `oklch(${c.L.toFixed(3)} ${c.C.toFixed(3)} ${c.H.toFixed(1)})`
const fmtRatio = (r) => `${r.toFixed(2)}:1`
const pad = (s, n) => (s.length >= n ? s : s + ' '.repeat(n - s.length))

const lines = []
let failCount = 0

for (const mode of MODE_KEYS) {
  lines.push(`== ${mode.label} ==`)
  for (const token of TOKENS) {
    lines.push(
      `  ${pad(token, 15)}${pad(fmtOklch(oklch[mode.key][token]), 27)}${toHex(linear[mode.key][token])}`,
    )
  }
  if (alphaWarnings[mode.key].length > 0) {
    lines.push('')
    lines.push('  ⚠ 半透明の色（palette.css には書けないため、書き出す際は落としてください）')
    for (const w of alphaWarnings[mode.key]) {
      lines.push(`    ${w.token}: ${w.value}（alpha=${w.alpha}）`)
    }
  }
  lines.push('')

  // -- 書式（.css のみ） -----------------------------------------------------
  // 上の parseAnyCssColor は意図的に緩い（下書き JSON は hex / % 表記 /
  // アルファ付きも許す）。だが palette.css に書けるのは「不透明な
  // oklch(L C H)」だけ（palette.test.ts の門番は parseOklch）。.css を
  // 読んでいるときだけ、同じ厳格パーサでもう一度読み直して確認する——
  // ここを見落とすと、% 表記が紛れた palette.css でもこのスクリプトは
  // 0 を返し、npm test だけが落ちる（SKILL.md「終了コードが 0 なら
  // npm test も通る」を裏切る）。.json の下書きはそもそも自由形式が
  // 前提なので対象外
  if (ext === '.css') {
    lines.push('  書式（palette.css に書ける形か）')
    let formatOk = true
    for (const token of TOKENS) {
      const value = raw[mode.key][token]
      if (parseOklch(value) === null) {
        failCount += 1
        formatOk = false
        lines.push(
          `    ✗ ${pad(token, 12)}${value}  → 不透明な oklch(L C H) ではない（% 表記やアルファは不可）`,
        )
      }
    }
    if (formatOk) lines.push('    ✓ すべて不透明な oklch(L C H) です')
    lines.push('')
  }

  // -- コントラスト --------------------------------------------------------
  lines.push('  コントラスト')
  for (const req of REQUIREMENTS) {
    // 「あるトークンが満たすべき条件」は、このトークンを縛る**すべての背景**に
    // 対して同時に成り立たなければならない。1面だけを見て提案すると、
    // 他の面（canvas / surface / surface-muted のどれか）を割ったままになる
    // （Important 2。「1つずつ直すと片方がもう片方を割る」）
    const conditions = BACKGROUNDS.map((bg) => ({
      against: linear[mode.key][bg],
      min: req.min * MARGIN, // 閾値ちょうどを置かない
    }))
    let suggestion // 遅延評価。全 bg が通っていれば要らない
    let suggestionComputed = false

    for (const bg of BACKGROUNDS) {
      const ratio = contrastRatio(linear[mode.key][req.token], linear[mode.key][bg])
      const ok = ratio >= req.min
      const mark = ok ? '✓' : '✗'
      let suffix = ''
      if (!ok) {
        failCount += 1
        if (!suggestionComputed) {
          suggestion = fitLightness(oklch[mode.key][req.token], conditions)
          suggestionComputed = true
        }
        suffix =
          suggestion === null
            ? '  → この色相・彩度では満たせない（彩度を下げるか色を変える必要がある）'
            : `  → L を ${oklch[mode.key][req.token].L.toFixed(3)} から ${suggestion.L.toFixed(3)} へ`
      }
      lines.push(
        `    ${mark} ${pad(req.token, 12)}/ ${pad(bg, 9)}${fmtRatio(ratio).padStart(8)}  (>= ${req.min.toFixed(2)})${suffix}`,
      )
    }
  }
  lines.push('')

  // -- 面の文字 --------------------------------------------------------------
  // judge-yes-fg / judge-no-fg は自分の面（judge-yes / judge-no）にしか
  // 載らないので、条件はその面1つだけ。動かせるのは他に何にも縛られていない
  // fg 自身なので、コントラストと同じく提案を出す。
  //
  // **淡い面（`*-face`）の上に載る ink / ink-muted / 線色もこの節で見る。**
  // そちらは他の面にも縛られている側なので、出た提案（fg の L を動かす）は
  // そのまま採らない——直すのは面（`*-face`）の L の方である
  lines.push('  面の文字')
  for (const req of FACE_REQUIREMENTS) {
    const ratio = contrastRatio(linear[mode.key][req.token], linear[mode.key][req.face])
    const ok = ratio >= req.min
    const mark = ok ? '✓' : '✗'
    let suffix = ''
    if (!ok) {
      failCount += 1
      const conditions = [{ against: linear[mode.key][req.face], min: req.min * MARGIN }]
      const suggestion = fitLightness(oklch[mode.key][req.token], conditions)
      suffix =
        suggestion === null
          ? '  → この色相・彩度では満たせない（彩度を下げるか色を変える必要がある）'
          : `  → L を ${oklch[mode.key][req.token].L.toFixed(3)} から ${suggestion.L.toFixed(3)} へ`
    }
    lines.push(
      `    ${mark} ${pad(req.token, 12)}/ ${pad(req.face, 9)}${fmtRatio(ratio).padStart(8)}  (>= ${req.min.toFixed(2)})${suffix}`,
    )
  }
  lines.push('')

  // -- 面どうし --------------------------------------------------------------
  lines.push('  面どうし')
  for (const pair of FACE_PAIRS) {
    const ratio = contrastRatio(linear[mode.key][pair.a], linear[mode.key][pair.b])
    const ok = ratio >= pair.min
    if (!ok) failCount += 1
    lines.push(
      `    ${ok ? '✓' : '✗'} ${pad(pair.a, 12)}/ ${pad(pair.b, 9)}${fmtRatio(ratio).padStart(8)}  (>= ${pair.min.toFixed(2)})`,
    )
  }
  lines.push('')

  // -- 色域 ------------------------------------------------------------------
  // 書いた値が sRGB の外にあると、ブラウザも oklchToLinear もクランプする。
  // クランプされてもコントラストと ΔE は通るので、「C 0.12 の黄土」と書いた
  // まま実際は 0.102 の色が出ている状態を誰も見つけられない。往復で C が
  // 戻るかどうかで見る（palette.test.ts の「色域」と同じ判定）
  //
  // **見るのは `oklch(...)` で書かれた値だけ。** hex / rgb / hsl で渡された色は
  // 定義上 sRGB の中にあり、往復させても差は出ない（`oklch[mode.key][token]` は
  // 既に測った側の値なので、それを往復させると常に一致してしまう。ここでは
  // 生の文字列を厳格パーサでもう一度読む）
  lines.push(`  色域（sRGB に収まっているか。書いた C との差 < ${GAMUT_MAX_C_DRIFT}）`)
  for (const token of TOKENS) {
    const written = parseOklch(raw[mode.key][token])
    if (written === null) {
      lines.push(`    - ${pad(token, 12)}oklch 表記ではないので対象外（sRGB の中にある）`)
      continue
    }
    const measured = linearToOklch(oklchToLinear(written))
    const diff = Math.abs(measured.C - written.C)
    const ok = diff < GAMUT_MAX_C_DRIFT
    if (!ok) failCount += 1
    lines.push(
      `    ${ok ? '✓' : '✗'} ${pad(token, 12)}C ${written.C.toFixed(3)} → ${measured.C.toFixed(4)}（差 ${diff.toFixed(4)}）${ok ? '' : '  → C を下げる'}`,
    )
  }
  lines.push('')

  // -- 無彩色 ----------------------------------------------------------------
  lines.push(`  無彩色（C <= ${ACHROMATIC_MAX_C}）`)
  for (const token of ACHROMATIC) {
    const c = linearToOklch(linear[mode.key][token]).C
    const ok = c <= ACHROMATIC_MAX_C
    if (!ok) failCount += 1
    lines.push(`    ${ok ? '✓' : '✗'} ${pad(token, 12)}C = ${c.toFixed(4)}`)
  }
  lines.push('')
}

// -- 意味色の識別（標準・P型・D型で ΔE >= DISTINCT_MIN） ------------------------
lines.push(`意味色の識別（ΔE >= ${DISTINCT_MIN}、標準 / P型 / D型）`)
for (const mode of MODE_KEYS) {
  for (const pair of DISTINCT_PAIRS) {
    const values = VISIONS.map((vision) =>
      deltaEok(simulate(linear[mode.key][pair.a], vision), simulate(linear[mode.key][pair.b], vision)),
    )
    const ok = values.every((v) => v >= DISTINCT_MIN)
    if (!ok) failCount += 1
    const measured = VISIONS.map((vision, i) => `${vision}=${values[i].toFixed(3)}`)
    lines.push(`  ${ok ? '✓' : '✗'} ${pad(mode.label, 6)}${pad(`${pair.a} / ${pair.b}`, 22)}${measured.join('  ')}`)
  }
}
lines.push('')

lines.push(
  failCount === 0 ? '要件を満たさない項目はありません。' : `要件を満たさない項目が ${failCount} 件あります。`,
)

console.log(lines.join('\n'))
process.exit(failCount === 0 ? 0 : 1)
