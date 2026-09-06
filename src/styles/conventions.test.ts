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
  // shadcn の生成物。改造は自由（rev 7章のソースコピー方式）だが、
  // 段・行間の規約は自作コードの側に課す——生成物の字面まで検査に合わせて
  // 書き換え続ける保守を負わないため（button.tsx の text-base / h-9 は
  // 意図した改造）
  'components/ui/',
]

/** テストファイルは対象外。期待値として色値を持つことがある（contrast.test.ts） */
const isTest = (name: string): boolean => /\.(test|spec)\.tsx?$/.test(name)

function sourceFiles(excluded: readonly string[] = EXCLUDED): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      const rel = path.relative(SRC_DIR, full).split(path.sep).join('/')
      if (excluded.some((prefix) => rel.startsWith(prefix))) continue
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
      `色値は palette.css だけが持つ。役割名（text-ink / bg-surface / text-missing …）を使うこと:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('Tailwind 標準パレットのユーティリティを使っていない', () => {
    // #rrggbb や oklch(...) の直書きより、こちらの方が起きやすい違反。
    // bg-red-500 のような Tailwind 標準パレットのクラスは色値の直書きと
    // 検査パターンが違うため上のテストをすり抜ける。役割名（text-missing …）
    // を経由しない色は、配色をpalette.cssで差し替えても追従しないので弾く
    const TAILWIND_PALETTE =
      /\b(bg|text|border|ring|fill|stroke|decoration|outline|from|via|to)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|[1-9]00|950)\b/
    const offenders = offendingLines(TAILWIND_PALETTE)
    expect(
      offenders,
      `Tailwind 標準パレットは配色差し替えに追従しない。役割名（text-ink / border-invalid …）を使うこと:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

describe('フォントサイズの段階（3サイズ4段）', () => {
  it('text-sm / text-base / text-xl 以外を使っていない', () => {
    // 「許可外」を直接探す。text-ink のような色のユーティリティと区別する
    // 必要があるので、許可リストとの照合ではなく許可外の段と任意値を弾く。
    //
    // **xs は D11 の 14px 下限を割るので使わず、lg は実使用が無く、2xl は
    // アプリ名を text-xl（22px）へ統合したため使わない。**
    // 2px 差の段（22 と 24）を体系に残さないため、xl と 2xl は同時に開けない。
    //
    // 任意値側は末尾に \b を付けない——`]` の直後は語構成文字ではないため
    // \b が成立せず、`text-[13px]` のような検出が一度も発火しなかった
    const offenders = offendingLines(/\btext-(xs|lg|[2-9]xl)\b|\btext-\[[^\]]*\]/)
    expect(
      offenders,
      `使ってよいのは text-sm / text-base / text-xl の3段（複数行は text-sm + leading-normal）:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

describe('行間の明示', () => {
  it('leading-* は leading-none（バッジと課題ツリーの節見出し）と leading-normal（複数行の欄）だけ', () => {
    // 行間の既定は @theme が持つ（sm 1.3 / base 1.25）。明示してよいのは
    // 「読ませる欄」の leading-normal（1.5）と、バッジ・課題ツリーの節見出しの leading-none だけ。
    // leading-5 のような数値指定は「行の高さをクラスで固定する書き方」で、
    // 段の再定義から静かに取り残される（open-issues で管理していた形）。
    // 任意値 leading-[...] も同じ理由で弾く
    const offenders = offendingLines(/\bleading-(?!none\b|normal\b)[\w[\].%-]+/)
    expect(
      offenders,
      `leading-* の明示は none / normal だけ（既定は @theme の行間トークン）:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})

describe('役割トークンの使い方（rev 9章）', () => {
  it('旧トークン名（warning / ok / surface-accent）をクラス名として使っていない', () => {
    const offenders = offendingLines(
      /\b(?:[a-z-]+:)?(bg|text|border|ring|outline|stroke|fill|decoration|placeholder|divide)-(warning|warning-fg|ok|ok-fg|surface-accent)\b/,
    )
    expect(offenders, `廃止したトークン。missing / invalid / pending / judge-* / surface-muted に振り分けること:\n${offenders.join('\n')}`).toEqual([])
  })

  it('欠落・無効・着信の面は淡い面（bg-*-face）だけ。線色そのものを面にしない', () => {
    // **`(?!-face)` を落とさないこと。** `\b` は `g` と `-` の間で成立するので、
    // 付けないと正当な `bg-missing-face` まで違反として拾う（検査3の
    // `(?!-fg)` と同じ穴）。淡い面を足したときに開けた口で、
    // 濃い面（`bg-missing` 等）は依然として禁止のまま
    const offenders = offendingLines(/\b(?:[a-z-]+:)?bg-(missing|invalid|pending)\b(?!-face)/)
    expect(
      offenders,
      `開いているものは淡い面（bg-missing-face 等）と線、決着したものは濃い面（規約2）:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('判断の面を線や文字にしない（-fg を除く）', () => {
    const offenders = offendingLines(/\b(?:[a-z-]+:)?(text|border|outline|ring|stroke|fill|decoration)-judge-(yes|no)\b(?!-fg)/)
    expect(offenders, `judge-yes / judge-no は面。文字は judge-*-fg を使う:\n${offenders.join('\n')}`).toEqual([])
  })

  it('役割トークンに透過を掛けていない', () => {
    // トークンのコントラストは palette.test.ts が値で保証する。透過を掛けた
    // 使用箇所はその保証の外に出る。正当な透過は残っていない
    const offenders = offendingLines(
      /\b(?:[a-z-]+:)?(bg|text|border|ring|outline|stroke|fill|decoration|placeholder|divide)-(canvas|surface|surface-muted|ink|ink-muted|ink-faint|rule|grid|missing|invalid|pending|missing-face|invalid-face|pending-face|judge-yes|judge-yes-fg|judge-yes-face|judge-no|judge-no-fg)\/\d+/,
    )
    expect(offenders, `透過は使わない。一段薄くしたければ ink-muted / ink-faint の段を使う:\n${offenders.join('\n')}`).toEqual([])
  })

  it('<Button> は variant が outline / ghost のどちらか（塗りの primary は使わない）', () => {
    // JSX の開始タグは複数行に跨るので、行単位の offendingLines ではなくタグ単位で見る。
    // `<Button\b` は `<ButtonGroup` に当たらない（\b が b と G の間で成立しない）
    //
    // **`<AlertDialogAction>` は規約の例外なので、ここでは見ない**（rev 9章）。
    // モーダルの本体はそのボタンで、主操作が1つだけ存在する——塗りが
    // 許されるのはそこだけである。`<Button` しか見ないこの検査は、
    // その例外を素通りさせる形になっている（見落としではない）
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
    expect(out, `facet は塗りボタンを置かない（rev 9章 D19）。variant="outline" か "ghost" を書く:\n${out.join('\n')}`).toEqual([])
  })
})

describe('角丸の段', () => {
  // 部品・セル・チップ＝rounded-sm（6px）／浮遊面（メニュー・ダイアログ）＝
  // rounded-md（8px）／意図した円＝rounded-full。裸の `rounded`（radius 倍率制の
  // 外にある固定 4px）・任意値・他の段は弾く。**sm と md の使い分けの当否は
  // 機械では判定できない**——この検査が守るのは「3語（＋方向付き）以外が
  // 現れない」ことだけで、使い分けはレビューと実機が守る
  const ALLOWED = /^rounded-(?:sm|md|full)$|^rounded-(?:t|b|l|r|tl|tr|bl|br)-(?:sm|md)$/

  it('rounded 系は rounded-sm / rounded-md / rounded-full（と方向付きの -sm/-md）だけ', () => {
    const offenders: string[] = []
    // **ui/ を除外しない。** EXCLUDED の理由（段・行間の規約は自作コードに課す）は
    // タイポグラフィの話で、角丸は ui/ を意図して改造した（button.tsx の
    // text-base / h-9 を改造したのと同じ扱い）。shadcn を将来更新したときに
    // rounded-lg が黙って戻るのを、この検査が捕まえる
    for (const file of sourceFiles([])) {
      const stripped = stripComments(readFileSync(file, 'utf8'))
      stripped.split('\n').forEach((line, index) => {
        for (const m of line.matchAll(/\brounded(?:-[\w[\]().,%*-]+)?/g)) {
          if (!ALLOWED.test(m[0])) {
            offenders.push(`src/${relative(file)}:${index + 1}  ${m[0]}`)
          }
        }
      })
    }
    expect(
      offenders,
      `角丸は rounded-sm（部品）/ rounded-md（浮遊面）/ rounded-full（円）だけ:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
