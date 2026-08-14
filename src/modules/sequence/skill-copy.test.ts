import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 同梱 Skill（sequence-register）は、アプリのソース2本のバイト一致コピーを持つ。
 *
 * **なぜコピーなのか。** Skill はアプリがユーザーのプロジェクトフォルダへ
 * 置き直すため（src/core/skill-sync.ts）、実行時に src/ は存在しない。
 * 一方で手で複製すると、エラーカタログ Skill と同じ
 * 「追従漏れがテストで検知されない」状態になる（open-issues に記録あり）。
 * **バイト一致のコピー＋この検査**なら、ズレた瞬間に赤くなる
 */
const COPIES = [
  { app: 'src/modules/sequence/questions.ts', skill: '.claude/skills/sequence-register/scripts/questions.ts' },
  { app: 'src/core/canonical.ts', skill: '.claude/skills/sequence-register/scripts/canonical.ts' },
]

/**
 * ソース中の import 文を1つずつ切り出す（複数行にまたがるものも含む）。
 * `import` で始まる行から、最初に現れる `from '...'` 節、または
 * `from` を伴わない副作用 import（`import './x'`）の引用符節までを1文とみなす。
 */
function extractImportStatements(src: string): string[] {
  return [...src.matchAll(/^import\b[\s\S]*?(?:from\s+['"][^'"]*['"]|['"][^'"]*['"])\s*;?/gm)].map((m) => m[0])
}

/**
 * import 文が実行時に値の解決を要する「値 import」かどうかを判定する。
 *
 * `import type ...` と、名前付き specifier が全て `type` 修飾された
 * `import { type X, type Y } from ...` は型ストリップで消えるので値 import ではない。
 * 一方 `import { type X, y } from ...` のように type 修飾と値 specifier が
 * 混在する場合は、`y` の解決が必要なので値 import として扱う（見落とすと
 * コピー側で相対解決できず sequence-write.mjs が実行時に落ちる）。
 */
function isValueImportStatement(statement: string): boolean {
  const trimmed = statement.trim()
  if (/^import\s+type\s/.test(trimmed)) return false

  const bracesMatch = trimmed.match(/\{([\s\S]*)\}/)
  if (!bracesMatch) return true // default / namespace / side-effect import はすべて値 import

  const before = trimmed.slice(0, bracesMatch.index)
  if (/import\s+\w/.test(before)) return true // `import Foo, { ... }` の Foo は値 specifier

  const specifiers = bracesMatch[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  return specifiers.some((spec) => !/^type\s/.test(spec))
}

describe.each(COPIES)('sequence-register 同梱の $app', ({ app, skill }) => {
  it('アプリ側とバイト一致する', () => {
    expect(readFileSync(skill)).toEqual(readFileSync(app))
  })

  it('値 import を持たない（コピーが Node で相対解決できる条件）', () => {
    // 値 import があるとコピー側で解決できず、sequence-write.mjs が落ちる。
    const src = readFileSync(app, 'utf8')
    const valueImports = extractImportStatements(src).filter(isValueImportStatement)
    expect(valueImports).toEqual([])
  })

  it('消去できない構文（enum / パラメータプロパティ）を持たない', () => {
    // 型ストリップは型注釈しか消せない。enum は実行時の値を持つので落ちる
    const src = readFileSync(app, 'utf8')
    expect(src).not.toMatch(/^\s*(export\s+)?(const\s+)?enum\s/m)
    expect(src).not.toMatch(/constructor\s*\([^)]*\b(public|private|protected|readonly)\s/)
  })
})

describe('isValueImportStatement', () => {
  const cases: [name: string, statement: string, expected: boolean][] = [
    ['単純な named import', "import { foo } from './bar'", true],
    ['複数行の named import', "import {\n  foo,\n} from './bar'", true],
    ['type 修飾と値 specifier の混在（回帰ケース）', "import { type Foo, bar } from './bar'", true],
    ['import type 節', "import type { Foo } from './bar'", false],
    ['単一の type 修飾 specifier', "import { type Foo } from './bar'", false],
    ['全て type 修飾された複数 specifier', "import { type Foo, type Bar } from './bar'", false],
    ['副作用 import（引用符のみ）', "import './side-effect'", true],
    ['副作用 import（セミコロン付き）', 'import "./side-effect";', true],
  ]

  it.each(cases)('%s → %s', (_name, statement, expected) => {
    expect(isValueImportStatement(statement)).toBe(expected)
  })
})
