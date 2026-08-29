import { describe, expect, it } from 'vitest'
import { DEFAULT_TABLE_OPTIONS, type TableOptions } from '@/core/table-export'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { logicTreeToTable } from './table'

const opts = (patch: Partial<TableOptions> = {}): TableOptions => ({
  ...DEFAULT_TABLE_OPTIONS,
  ...patch,
})

/** id は `node_` ＋ 英数字10文字。読めるように連番の末尾だけ変える */
const id = (n: number) => `node_${String(n).padStart(10, 'a')}`

const node = (n: number, parent: number | null, text: string) => ({
  id: id(n),
  parentId: parent === null ? null : id(parent),
  text,
})

/**
 * 売上が下がった
 *   客数が減った   → 新規が減った / 離脱が増えた
 *   単価が下がった → 値引きが増えた / 安いプランへの移行
 *   （空文言）
 */
const data: LogicTreeSchemaVersion1 = {
  schemaVersion: 1,
  type: 'logicTree',
  title: 'ロジックツリー',
  nodes: [
    node(1, null, '売上が下がった'),
    node(2, 1, '客数が減った'),
    node(3, 2, '新規が減った'),
    node(4, 2, '離脱が増えた'),
    node(5, 1, '単価が下がった'),
    node(6, 5, '値引きが増えた'),
    node(7, 5, '安いプランへの移行'),
    node(8, 1, ''),
  ],
}

describe('logicTreeToTable', () => {
  it('列は No ＋ 最大深さぶんの「第N階層」', () => {
    expect(logicTreeToTable(data, opts()).header).toEqual([
      'No',
      '第1階層',
      '第2階層',
      '第3階層',
    ])
  })

  it('行は葉ごとに1本（中間ノードは自分の行を持たない）', () => {
    expect(logicTreeToTable(data, opts()).rows).toHaveLength(5)
  })

  it('親は先頭行だけに出す（既定）', () => {
    expect(logicTreeToTable(data, opts()).rows).toEqual([
      ['1-1-1', '売上が下がった', '客数が減った', '新規が減った'],
      ['1-1-2', '', '', '離脱が増えた'],
      ['1-2-1', '', '単価が下がった', '値引きが増えた'],
      ['1-2-2', '', '', '安いプランへの移行'],
      ['1-3', '', '（未定義）', ''],
    ])
  })

  it('repeatParent オンなら親を毎行くり返す', () => {
    const rows = logicTreeToTable(data, opts({ repeatParent: true })).rows
    expect(rows[1]).toEqual(['1-1-2', '売上が下がった', '客数が減った', '離脱が増えた'])
    expect(rows[4]).toEqual(['1-3', '売上が下がった', '（未定義）', ''])
  })

  it('numberStyle が serial なら通し番号', () => {
    const rows = logicTreeToTable(data, opts({ numberStyle: 'serial' })).rows
    expect(rows.map((r) => r[0])).toEqual(['1', '2', '3', '4', '5'])
  })

  it('numbering オフなら No 列が出ない', () => {
    const table = logicTreeToTable(data, opts({ numbering: false }))
    expect(table.header).toEqual(['第1階層', '第2階層', '第3階層'])
    expect(table.rows[0]).toEqual(['売上が下がった', '客数が減った', '新規が減った'])
  })

  it('showUndefined オフなら空文言は空のまま', () => {
    expect(logicTreeToTable(data, opts({ showUndefined: false })).rows[4][2]).toBe('')
  })

  it('葉より浅い階層の残り列は空にする', () => {
    // 1-3 は深さ2の葉なので、第3階層は空
    expect(logicTreeToTable(data, opts()).rows[4][3]).toBe('')
  })

  it('ノードが1件だけなら1行1列', () => {
    const one = { ...data, nodes: [node(1, null, 'ルートだけ')] }
    const table = logicTreeToTable(one, opts())
    expect(table.header).toEqual(['No', '第1階層'])
    expect(table.rows).toEqual([['1', 'ルートだけ']])
  })

  it('ノードが0件でも第1階層の見出しは出す（No だけの表にしない）', () => {
    const empty = { ...data, nodes: [] }
    expect(logicTreeToTable(empty, opts()).header).toEqual(['No', '第1階層'])
    expect(logicTreeToTable(empty, opts()).rows).toEqual([])
  })

  it('多重ルート（受け入れて赤表示するファイル）はルートごとに番号が進む', () => {
    const two = {
      ...data,
      nodes: [node(1, null, 'A'), node(2, null, 'B'), node(3, 2, 'B1')],
    }
    expect(logicTreeToTable(two, opts()).rows).toEqual([
      ['1', 'A', ''],
      ['2-1', 'B', 'B1'],
    ])
  })
})
