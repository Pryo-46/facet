import { describe, expect, it } from 'vitest'
import { DEFAULT_TABLE_OPTIONS, type TableOptions } from '@/core/table-export'
import type { GlossarySchemaVersion1 } from '@/types/glossary'
import { glossaryToTable } from './table'

const opts = (patch: Partial<TableOptions> = {}): TableOptions => ({
  ...DEFAULT_TABLE_OPTIONS,
  ...patch,
})

const data: GlossarySchemaVersion1 = {
  schemaVersion: 1,
  type: 'glossary',
  title: '用語集',
  terms: [
    {
      id: 'term_aaaaaaaaaa',
      name: '受注',
      kind: 'event',
      definition: '顧客からの注文を受け付けること',
      aliases: ['受注登録', 'オーダー'],
      notes: '',
    },
    {
      id: 'term_bbbbbbbbbb',
      name: '与信',
      kind: 'undecided',
      definition: '',
      aliases: [],
      notes: 'メモ',
    },
  ],
}

describe('glossaryToTable', () => {
  it('列は画面の並びそのまま（種別が列にある。Markdown のように h3 見出しへ逃がさない）', () => {
    expect(glossaryToTable(data, opts()).header).toEqual([
      'No',
      '名称',
      '種別',
      '定義',
      '別名',
      '備考',
    ])
  })

  it('No 列はデータ配列の位置（index + 1）', () => {
    const rows = glossaryToTable(data, opts()).rows
    expect(rows[0][0]).toBe('1')
    expect(rows[1][0]).toBe('2')
  })

  it('numbering オフなら No 列が出ない', () => {
    const table = glossaryToTable(data, opts({ numbering: false }))
    expect(table.header).toEqual(['名称', '種別', '定義', '別名', '備考'])
    expect(table.rows[0][0]).toBe('受注')
  })

  it('種別は日本語ラベルにする（画面・Markdown と同じ対応表）', () => {
    expect(glossaryToTable(data, opts()).rows[0][2]).toBe('イベント')
    expect(glossaryToTable(data, opts()).rows[1][2]).toBe('未分類')
  })

  it('別名は読点で連ねる（1行1件で持っているものを表に収めるときだけ）', () => {
    expect(glossaryToTable(data, opts()).rows[0][4]).toBe('受注登録、オーダー')
  })

  it('showUndefined オンで定義の空だけを（未定義）にする（別名・備考は空のまま）', () => {
    const row = glossaryToTable(data, opts()).rows[1]
    expect(row[3]).toBe('（未定義）')
    expect(row[4]).toBe('')
    expect(row[5]).toBe('メモ')
  })

  it('showUndefined オフなら定義の空も空のまま', () => {
    expect(glossaryToTable(data, opts({ showUndefined: false })).rows[1][3]).toBe('')
  })

  it('visible を渡すと、その ID の行だけを出す', () => {
    const table = glossaryToTable(data, opts(), new Set(['term_bbbbbbbbbb']))
    expect(table.rows).toHaveLength(1)
    expect(table.rows[0][1]).toBe('与信')
  })

  it('visible で絞っても No は振り直さない（画面の No と食い違わせない）', () => {
    const table = glossaryToTable(data, opts(), new Set(['term_bbbbbbbbbb']))
    expect(table.rows[0][0]).toBe('2')
  })

  it('visible が null なら全件', () => {
    expect(glossaryToTable(data, opts(), null).rows).toHaveLength(2)
  })

  it('用語が0件でも見出しは出す', () => {
    const empty = { ...data, terms: [] }
    expect(glossaryToTable(empty, opts()).rows).toEqual([])
    expect(glossaryToTable(empty, opts()).header).toHaveLength(6)
  })
})
