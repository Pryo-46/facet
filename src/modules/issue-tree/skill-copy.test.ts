import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractImportStatements, isValueImportStatement } from '@/core/import-analysis'

/**
 * 同梱 Skill（issue-tree-register）は、アプリのソース2本のバイト一致コピーを持つ。
 *
 * **なぜコピーなのか。** Skill はアプリがユーザーのプロジェクトフォルダへ
 * 置き直すため（src/core/skill-sync.ts）、実行時に src/ は存在しない。
 * 一方で手で複製すると、エラーカタログ Skill と同じ
 * 「追従漏れがテストで検知されない」状態になる（open-issues に記録あり）。
 * **バイト一致のコピー＋この検査**なら、ズレた瞬間に赤くなる
 */
const COPIES = [
  { app: 'src/modules/issue-tree/derive.ts', skill: '.claude/skills/issue-tree-register/scripts/derive.ts' },
  { app: 'src/core/canonical.ts', skill: '.claude/skills/issue-tree-register/scripts/canonical.ts' },
]

describe.each(COPIES)('issue-tree-register 同梱の $app', ({ app, skill }) => {
  it('アプリ側とバイト一致する', () => {
    expect(readFileSync(skill)).toEqual(readFileSync(app))
  })

  it('値 import を持たない（コピーが Node で相対解決できる条件）', () => {
    // 値 import があるとコピー側で解決できず、issue-tree-write.mjs が落ちる。
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
