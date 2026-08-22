/**
 * import 文の静的解析（テスト専用のコア）。
 *
 * **なぜ src/core/ にあるか。** 同梱 Skill はアプリのソースをバイト一致で
 * コピーして持ち、そのコピーは Node の型ストリップで実行される——値 import が
 * 1つでもあるとコピー側で相対解決できず、書き出しスクリプトが実行時に落ちる。
 * この「値 import を持たないこと」の検査は、コピーを持つモジュールが増える
 * たびに要る（sequence / issue-tree）。判定を各テストへ書き写すと、
 * 混在ケース（`import { type X, y }`）のような取りこぼしの直しが片方にしか
 * 入らないので、**判定は1箇所に置き、テストはそれを import する**
 */

/**
 * ソース中の import 文を1つずつ切り出す（複数行にまたがるものも含む）。
 * `import` で始まる行から、最初に現れる `from '...'` 節、または
 * `from` を伴わない副作用 import（`import './x'`）の引用符節までを1文とみなす。
 */
export function extractImportStatements(src: string): string[] {
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
export function isValueImportStatement(statement: string): boolean {
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
