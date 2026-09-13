import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { UNDEFINED_TEXT } from './output-labels'

const SRC_DIR = fileURLToPath(new URL('../', import.meta.url))

/** 文言の唯一の置き場。`SRC_DIR` からの相対パス */
const HOME = 'core/output-labels.ts'

const relative = (file: string): string =>
  path.relative(SRC_DIR, file).split(path.sep).join('/')

/**
 * `src/` の本番コード。**母集合はディレクトリで取る**——ツールを名指しで並べると、
 * 7本目のツールが自前の定数を持っても検査に掛からない。
 * テストファイルは期待値として文言を持つので外す
 */
function sourceFiles(): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
        found.push(full)
      }
    }
  }
  walk(SRC_DIR)
  return found
}

/**
 * 引用符で囲んだ文言だけを探す。**コメントの中のバッククォートで囲んだ文言は
 * 説明であって定数ではない**ので拾わない。その代わり、テンプレートリテラルに
 * 直書きした文言も拾えない
 */
const literal = new RegExp(`['"]${UNDEFINED_TEXT}['"]`)

describe('UNDEFINED_TEXT', () => {
  it('出力の文言は既存の出力と同じ', () => {
    expect(UNDEFINED_TEXT).toBe('（未定義）')
  })

  it('置き場のファイル自身は文言を文字列リテラルで持つ（走査が空振りしていない）', () => {
    expect(literal.test(readFileSync(path.join(SRC_DIR, HOME), 'utf8'))).toBe(true)
  })

  it('本番コードで文言を文字列リテラルとして持つのは置き場の1ファイルだけ', () => {
    const offenders = sourceFiles()
      .filter((file) => relative(file) !== HOME)
      .filter((file) => literal.test(readFileSync(file, 'utf8')))
      .map(relative)
    expect(offenders).toEqual([])
  })
})
