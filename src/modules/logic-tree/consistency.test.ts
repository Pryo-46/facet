import { describe, expect, it } from 'vitest'
import type { LogicTreeSchemaVersion1, TreeNode } from '@/types/logic-tree'
import { checkLogicTreeConsistency } from './consistency'

const ID = {
  a: 'node_aaaaaaaaaa',
  b: 'node_bbbbbbbbbb',
  c: 'node_cccccccccc',
  missing: 'node_zzzzzzzzzz',
}

const file = (nodes: TreeNode[]): LogicTreeSchemaVersion1 => ({
  schemaVersion: 1,
  type: 'logicTree',
  title: 'テスト',
  nodes,
})

const rules = (nodes: TreeNode[]): string[] =>
  checkLogicTreeConsistency(file(nodes)).map((i) => i.rule)

describe('checkLogicTreeConsistency', () => {
  it('正しい木では指摘が出ない', () => {
    expect(
      rules([
        { id: ID.a, parentId: null, text: '退会できない' },
        { id: ID.b, parentId: ID.a, text: '導線が分からない' },
      ]),
    ).toEqual([])
  })

  it('ノード0件は正常（新規作成直後）', () => {
    expect(rules([])).toEqual([])
  })

  it('ID の重複を指摘する', () => {
    expect(
      rules([
        { id: ID.a, parentId: null, text: 'x' },
        { id: ID.a, parentId: null, text: 'y' },
      ]),
    ).toContain('duplicate-id')
  })

  it('ID 重複の locations は重複した全件の配列位置を指す', () => {
    const issues = checkLogicTreeConsistency(
      file([
        { id: ID.a, parentId: null, text: 'x' },
        { id: ID.a, parentId: null, text: 'y' },
      ]),
    )
    const dup = issues.find((i) => i.rule === 'duplicate-id')
    expect(dup?.locations.map((l) => l.entityIndex)).toEqual([0, 1])
  })

  it('循環を指摘する', () => {
    expect(
      rules([
        { id: ID.a, parentId: ID.b, text: 'x' },
        { id: ID.b, parentId: ID.a, text: 'y' },
      ]),
    ).toContain('cyclic-parent')
  })

  it('ルートが2つ以上あることを指摘する', () => {
    expect(
      rules([
        { id: ID.a, parentId: null, text: 'x' },
        { id: ID.b, parentId: null, text: 'y' },
      ]),
    ).toContain('multiple-root')
  })

  it('ルートが1つなら指摘しない', () => {
    expect(rules([{ id: ID.a, parentId: null, text: 'x' }])).toEqual([])
  })

  it('親が実在しないことを指摘する', () => {
    const got = rules([
      { id: ID.a, parentId: null, text: 'x' },
      { id: ID.b, parentId: ID.missing, text: 'y' },
    ])
    expect(got).toContain('missing-parent')
    // 参照切れのノードはルート扱いになるので多重ルートも同時に出る。
    // 両方出ることが正しい（片方だけ直しても図は1本にならない）
    expect(got).toContain('multiple-root')
  })

  it('親が実在しないノードの locations は parentId のセルを指す', () => {
    const issues = checkLogicTreeConsistency(
      file([
        { id: ID.a, parentId: null, text: 'x' },
        { id: ID.b, parentId: ID.missing, text: 'y' },
      ]),
    )
    const miss = issues.find((i) => i.rule === 'missing-parent')
    expect(miss?.locations).toEqual([{ entityId: ID.b, entityIndex: 1, field: 'parentId' }])
  })

  it('メッセージは日本語で、どのノードの話か分かる', () => {
    const issues = checkLogicTreeConsistency(
      file([
        { id: ID.a, parentId: null, text: '退会できない' },
        { id: ID.b, parentId: null, text: '解約できない' },
      ]),
    )
    expect(issues[0].message).toContain('退会できない')
    expect(issues[0].message).toContain('解約できない')
  })
})
