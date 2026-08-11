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
  composite,
  contrastRatio,
  deltaEok,
  fitLightness,
  linearToOklch,
  parseAnyCssColor,
  simulate,
  toHex,
} from '../../../../src/styles/contrast.ts'
import {
  BACKGROUNDS,
  MODES,
  OVERLAY_FOREGROUNDS,
  OVERLAY_MIN,
  OVERLAYS,
  readTokenBlock,
  REQUIREMENTS,
  stripCssComments,
  TOKENS,
} from '../../../../src/styles/palette-requirements.ts'

// palette-requirements.ts の VISIONS は「決定J: ΔE は合否の対象外」のため
// export されていない。ここは表示専用の値なので、要件として二重管理には
// あたらない（要件を増減させたければ REQUIREMENTS 側を直す）
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

// MODES は [ライト, ダーク] の順で固定（palette-requirements.ts）。
// JSON 下書きの "light" / "dark" キーとここで対応づける
const MODE_KEYS = [
  { key: 'light', ...MODES[0] },
  { key: 'dark', ...MODES[1] },
]

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

  // -- コントラスト --------------------------------------------------------
  lines.push('  コントラスト')
  for (const req of REQUIREMENTS) {
    // 「あるトークンが満たすべき条件」は canvas / surface の両方に対して
    // 同時に成り立たなければならない。1つずつ直すと片方がもう片方を割るので、
    // fitLightness には両方の条件を1回でまとめて渡す
    const conditions = BACKGROUNDS.map((bg) => ({
      against: linear[mode.key][bg],
      min: req.min * 1.03, // 閾値ちょうどを置かない
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

  // -- 重ね合わせ ------------------------------------------------------------
  // ここは提案を出さない。面の色は warning から来るので、直すべきは
  // warning か ink-muted であり、どちらを動かすかは人の判断
  lines.push('  重ね合わせ')
  for (const bg of BACKGROUNDS) {
    for (const overlay of OVERLAYS) {
      const face = composite(linear[mode.key].warning, linear[mode.key][bg], overlay.alpha)
      for (const fg of OVERLAY_FOREGROUNDS) {
        const ratio = contrastRatio(linear[mode.key][fg.token], face)
        const ok = ratio >= OVERLAY_MIN
        const mark = ok ? '✓' : '✗'
        if (!ok) failCount += 1
        const label = `${overlay.className} on ${bg}`
        lines.push(
          `    ${mark} ${pad(fg.token, 12)}/ ${pad(label, 22)}${fmtRatio(ratio).padStart(8)}  (>= ${OVERLAY_MIN.toFixed(2)})`,
        )
      }
    }
  }
  lines.push('')
}

// -- ΔE（合否は付けない） ----------------------------------------------------
lines.push('warning と ok の色差（ΔE、合否は付けない）')
for (const mode of MODE_KEYS) {
  const values = VISIONS.map((vision) =>
    deltaEok(simulate(linear[mode.key].warning, vision), simulate(linear[mode.key].ok, vision)),
  )
  const measured = VISIONS.map((vision, i) => `${vision}=${values[i].toFixed(3)}`)
  lines.push(`  ${pad(mode.label, 6)}${measured.join('  ')}`)
}
lines.push('')

lines.push(
  failCount === 0 ? '要件を満たさない項目はありません。' : `要件を満たさない項目が ${failCount} 件あります。`,
)

console.log(lines.join('\n'))
process.exit(failCount === 0 ? 0 : 1)
