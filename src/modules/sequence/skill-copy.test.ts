import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 同梱 Skill（sequence-register）は、アプリのソース2本のバイト一致コピーを持つ。
 *
 * **なぜコピーなのか。** Skill はアプリがユーザーのプロジェクトフォルダへ
 * 置き直すため（src/core/skill-sync.ts）、実行時に src/ は存在しない。
 * 一方で手で複製すると、エラーカタログ Skill と同じ
 * 「追従漏れがテストで検知されない」状態になる（open-issues #78）。
 * **バイト一致のコピー＋この検査**なら、ズレた瞬間に赤くなる
 */
const COPIES = [
  { app: 'src/modules/sequence/questions.ts', skill: '.claude/skills/sequence-register/scripts/questions.ts' },
  { app: 'src/core/canonical.ts', skill: '.claude/skills/sequence-register/scripts/canonical.ts' },
]

describe.each(COPIES)('sequence-register 同梱の $app', ({ app, skill }) => {
  it('アプリ側とバイト一致する', () => {
    expect(readFileSync(skill)).toEqual(readFileSync(app))
  })

  it('値 import を持たない（コピーが Node で相対解決できる条件）', () => {
    // 値 import があるとコピー側で解決できず、sequence-write.mjs が落ちる。
    // `import type ...` と `import { type X } from` は型ストリップで消えるので許す
    const src = readFileSync(app, 'utf8')
    const valueImports = [...src.matchAll(/^import\s+(?!type\s)(.*)$/gm)]
      .map((m) => m[0])
      .filter((line) => !/^import\s*\{\s*type\s/.test(line))
    expect(valueImports).toEqual([])
  })

  it('消去できない構文（enum / パラメータプロパティ）を持たない', () => {
    // 型ストリップは型注釈しか消せない。enum は実行時の値を持つので落ちる
    const src = readFileSync(app, 'utf8')
    expect(src).not.toMatch(/^\s*(export\s+)?(const\s+)?enum\s/m)
    expect(src).not.toMatch(/constructor\s*\([^)]*\b(public|private|protected|readonly)\s/)
  })
})
