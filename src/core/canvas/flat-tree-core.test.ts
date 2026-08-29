import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractImportStatements, isValueImportStatement } from '@/core/import-analysis'
import { buildFlatTree, orderFlatNodes } from './flat-tree-core'

/**
 * このファイルは登録 Skill（logic-tree-register）へバイト一致でコピーされる。
 * コピー先は Node の型ストリップで実行されるので、値 import も enum も持てない。
 * **制約を破った瞬間にここが赤くなる**——バイト一致そのものの検査は
 * src/modules/logic-tree/skill-copy.test.ts が持つ
 */
describe('flat-tree-core.ts のコピー制約', () => {
  const src = readFileSync('src/core/canvas/flat-tree-core.ts', 'utf8')

  it('値 import を持たない', () => {
    expect(extractImportStatements(src).filter(isValueImportStatement)).toEqual([])
  })

  it('相対 import を持たない', () => {
    expect(extractImportStatements(src).filter((s) => /from\s+['"]\./.test(s))).toEqual([])
  })

  it('消去できない構文（enum / パラメータプロパティ）を持たない', () => {
    expect(src).not.toMatch(/^\s*(export\s+)?(const\s+)?enum\s/m)
    expect(src).not.toMatch(/constructor\s*\([^)]*\b(public|private|protected|readonly)\s/)
  })
})

describe('buildFlatTree', () => {
  it('循環しているノードを unreachable に入れ、parents を null に倒す', () => {
    const built = buildFlatTree([
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'c' },
      { id: 'c', parentId: 'b' },
    ])
    expect(built.roots.map((r) => r.index)).toEqual([0])
    expect(built.unreachable).toEqual([1, 2])
    expect(built.parents[1]).toBeNull()
    expect(built.parents[2]).toBeNull()
  })

  it('親の参照切れはルート扱いにし、位置を missingParent に記録する', () => {
    const built = buildFlatTree([
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'zzz' },
    ])
    expect(built.missingParent).toEqual([1])
    expect(built.roots.map((r) => r.index)).toEqual([0, 1])
  })
})

describe('orderFlatNodes', () => {
  it('乱れた配列を DFS 行きがけ順へ戻し、到達不能なノードを末尾に残す', () => {
    const ordered = orderFlatNodes([
      { id: 'c', parentId: 'a' },
      { id: 'a', parentId: null },
      { id: 'x', parentId: 'y' },
      { id: 'b', parentId: 'a' },
      { id: 'y', parentId: 'x' },
    ])
    expect(ordered.map((n) => n.id)).toEqual(['a', 'c', 'b', 'x', 'y'])
  })
})
