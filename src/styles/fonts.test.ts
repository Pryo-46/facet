import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 同梱フォントの生成 CSS（M26。UI ノート D6〜D8・§7 U1）の検査。
 *
 * fontsource の static 版 CSS は woff2 と woff を両方参照するので素の
 * import はできない（woff まで dist に入る）。woff2 だけ参照する CSS を
 * scripts/gen-fonts-css.mjs が生成し、その形をここで固定する。
 * fontsource を更新してファイル名や分割数が変わると、ここが赤くなる
 */
const CSS_PATH = fileURLToPath(new URL('./fonts.css', import.meta.url))
const css = readFileSync(CSS_PATH, 'utf8')
const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? []

const facesOf = (family: string, weight: string): string[] =>
  faces.filter(
    (f) => f.includes(`'${family}'`) && new RegExp(`font-weight:\\s*${weight};`).test(f),
  )

describe('同梱フォントの生成 CSS（M26）', () => {
  it('woff2 以外のフォント参照が無い', () => {
    // .woff2) は .woff) に一致しない（2 が続くので閉じ括弧が来ない）
    expect(css).not.toMatch(/\.woff\)/)
    expect(css).not.toMatch(/format\('woff'\)/)
  })

  it('3書体と必要ウェイトが揃っている', () => {
    expect(facesOf('IBM Plex Sans Variable', '100 700').length).toBeGreaterThan(0)
    // JP は unicode-range 123 分割（§4.2: 字数サブセット禁止。全字収録のまま分割だけ使う。
    // files/ にはこの他に CSS から参照されない一体型 japanese-*.woff2 が 1 本あるが、
    // 参照しないので同梱もされない——分割数をファイル数 124 と数え違えないこと）
    for (const w of ['400', '500', '600']) {
      expect(facesOf('IBM Plex Sans JP', w).length, `JP ${w}`).toBe(123)
    }
    for (const w of ['400', '700']) {
      expect(facesOf('IBM Plex Mono', w).length, `Mono ${w}`).toBeGreaterThan(0)
    }
  })

  it('参照している woff2 がすべて node_modules に実在する', () => {
    const urls = [...css.matchAll(/url\(([^)]+\.woff2)\)/g)].map((m) => m[1]!)
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) {
      expect(existsSync(path.resolve(path.dirname(CSS_PATH), u)), u).toBe(true)
    }
  })
})
