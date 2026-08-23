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
      `色値は palette.css だけが持つ。役割名（text-ink / bg-missing …）を使うこと:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('Tailwind 標準パレットのユーティリティを使っていない', () => {
    // #rrggbb や oklch(...) の直書きより、こちらの方が起きやすい違反。
    // bg-red-500 のような Tailwind 標準パレットのクラスは色値の直書きと
    // 検査パターンが違うため上のテストをすり抜ける。役割名（bg-missing …）
    // を経由しない色は、配色をpalette.cssで差し替えても追従しないので弾く
    const TAILWIND_PALETTE =
      /\b(bg|text|border|ring|fill|stroke|decoration|outline|from|via|to)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|[1-9]00|950)\b/
    const offenders = offendingLines(TAILWIND_PALETTE)
    expect(
      offenders,
      `Tailwind 標準パレットは配色差し替えに追従しない。役割名（text-ink / bg-missing …）を使うこと:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

describe('フォントサイズの段階（M7 決定6、M14 で1段追加）', () => {
  it('text-xs / text-sm / text-base / text-lg / text-2xl 以外を使っていない', () => {
    // 「許可外」を直接探す。text-ink のような色のユーティリティと区別する
    // 必要があるので、許可リストとの照合ではなく許可外の段と任意値を弾く。
    //
    // **`text-xl` は飛ばして `text-2xl` だけを開けてある。** 段は「使う役割が
    // あるぶんだけ」持つ約束で（M7 決定6）、M14 で足したのはアプリ名
    // （額縁の看板）1つだけ。text-lg（画面タイトル）との差が 2px しかない
    // text-xl は、足しても「どちらを使うのか」を決められない
    //
    // 任意値側は末尾に \b を付けない——`]` の直後は語構成文字ではないため
    // \b が成立せず、`text-[13px]` のような検出が一度も発火しなかった
    const offenders = offendingLines(/\btext-(xl|[3-9]xl)\b|\btext-\[[^\]]*\]/)
    expect(
      offenders,
      `使ってよいのは text-xs / text-sm / text-base / text-lg / text-2xl の5段:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

describe('役割トークンの使い方（rev 9章 M21）', () => {
  it('旧トークン名（warning / ok / surface-accent）をクラス名として使っていない', () => {
    const offenders = offendingLines(
      /\b(?:[a-z-]+:)?(bg|text|border|ring|outline|stroke|fill|decoration|placeholder|divide)-(warning|warning-fg|ok|ok-fg|surface-accent)\b/,
    )
    expect(offenders, `M21 で消えたトークン。missing / invalid / pending / judge-* / surface-muted に振り分けること:\n${offenders.join('\n')}`).toEqual([])
  })

  it('欠落・無効・着信を面にしない（線と文字だけ）', () => {
    const offenders = offendingLines(/\b(?:[a-z-]+:)?bg-(missing|invalid|pending)\b/)
    expect(offenders, `開いているものは線、決着したものは面（規約2）:\n${offenders.join('\n')}`).toEqual([])
  })

  it('判断の面を線や文字にしない（-fg を除く）', () => {
    const offenders = offendingLines(/\b(?:[a-z-]+:)?(text|border|outline|ring|stroke|fill|decoration)-judge-(yes|no)\b(?!-fg)/)
    expect(offenders, `judge-yes / judge-no は面。文字は judge-*-fg を使う:\n${offenders.join('\n')}`).toEqual([])
  })

  it('役割トークンに透過を掛けていない', () => {
    // トークンのコントラストは palette.test.ts が値で保証する。透過を掛けた
    // 使用箇所はその保証の外に出る。半透明の面（M8 の bg-warning/20）が
    // 消えた今、正当な透過は残っていない
    const offenders = offendingLines(
      /\b(?:[a-z-]+:)?(bg|text|border|ring|outline|stroke|fill|decoration|placeholder|divide)-(canvas|surface|surface-muted|ink|ink-muted|ink-faint|rule|grid|missing|invalid|pending|judge-yes|judge-yes-fg|judge-no|judge-no-fg)\/\d+/,
    )
    expect(offenders, `透過は使わない。一段薄くしたければ ink-muted / ink-faint の段を使う:\n${offenders.join('\n')}`).toEqual([])
  })

  it('<Button> は variant が outline / ghost のどちらか（塗りの primary は使わない）', () => {
    // JSX の開始タグは複数行に跨るので、行単位の offendingLines ではなくタグ単位で見る。
    // `<Button\b` は `<ButtonGroup` に当たらない（\b が b と G の間で成立しない）
    const out: string[] = []
    for (const file of sourceFiles()) {
      const stripped = stripComments(readFileSync(file, 'utf8'))
      for (const m of stripped.matchAll(/<Button\b[^>]*>/g)) {
        if (!/\bvariant="(outline|ghost)"/.test(m[0])) {
          const line = stripped.slice(0, m.index).split('\n').length
          out.push(`src/${relative(file)}:${line}  ${m[0].replace(/\s+/g, ' ').slice(0, 80)}`)
        }
      }
    }
    expect(out, `facet は塗りボタンを置かない（UI ノート D19）。variant="outline" か "ghost" を書く:\n${out.join('\n')}`).toEqual([])
  })
})
