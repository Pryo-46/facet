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

/**
 * コメントを空にしてから走査する。**行番号を保つため、改行だけ残して中身を消す。**
 *
 * 検査したいのは「コンポーネントが色値を直書きしていないか」であって、
 * 説明のために色を書いた JSDoc は違反ではない（実際 contrast.ts の
 * JSDoc が oklch の例を持っている）。同じ問題を palette.test.ts は
 * stripComments で解いており、そちらに揃える。
 *
 * 文字列リテラル内の `//` も巻き添えで消えるが、色値とフォントサイズの
 * 検出には影響しない。
 */
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ''))
    .replace(/\/\/[^\n]*/g, '')

function offendingLines(pattern: RegExp): string[] {
  const out: string[] = []
  for (const file of sourceFiles()) {
    const stripped = stripComments(readFileSync(file, 'utf8'))
    stripped
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
