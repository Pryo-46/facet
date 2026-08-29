import { describe, expect, it } from 'vitest'
import { DEFAULT_TABLE_OPTIONS, type TableOptions } from '@/core/table-export'
import type { ErrorCatalogSchemaVersion1 } from '@/types/error-catalog'
import { DEV_PROFILE, SUPPORT_PROFILE } from './profiles'
import { errorCatalogToTable } from './table'

const opts = (patch: Partial<TableOptions> = {}): TableOptions => ({
  ...DEFAULT_TABLE_OPTIONS,
  ...patch,
})

const data: ErrorCatalogSchemaVersion1 = {
  schemaVersion: 1,
  type: 'errorCatalog',
  title: 'エラーカタログ',
  errors: [
    {
      id: 'error_aaaaaaaaaa',
      name: '在庫不足',
      occurrence: '受注確定時',
      resolutionLevel: 'support',
      causeForSupport: '在庫が引当できない',
      causeForSpec: '引当ロジックの競合',
      userAction: 'サポートへ連絡する',
      supportAction: '在庫を手動で引き当てる',
      engineerAction: '',
      notes: '',
    },
    {
      id: 'error_bbbbbbbbbb',
      name: '与信エラー',
      occurrence: '',
      resolutionLevel: 'undecided',
      causeForSupport: '',
      causeForSpec: '',
      userAction: '',
      supportAction: '',
      engineerAction: '',
      notes: '',
    },
  ],
}

describe('errorCatalogToTable', () => {
  it('解決レベルが列に残る（markdownFields は使わない。表に h3 見出しは無い）', () => {
    expect(errorCatalogToTable(data, SUPPORT_PROFILE, opts()).header).toEqual([
      'No',
      'エラー名',
      '発生タイミング',
      '解決レベル',
      '原因（業務）',
      'ユーザーの対応',
      'サポートの対応',
      'エンジニアの対応',
    ])
  })

  it('開発向けは列が2本多い（原因（仕様）と備考）', () => {
    const header = errorCatalogToTable(data, DEV_PROFILE, opts()).header
    expect(header).toContain('原因（仕様）')
    expect(header).toContain('備考')
  })

  it('解決レベルは日本語ラベルにする', () => {
    const rows = errorCatalogToTable(data, SUPPORT_PROFILE, opts()).rows
    expect(rows[0][3]).toBe('サポート対応')
    expect(rows[1][3]).toBe('未分類')
  })

  it('No 列はデータ配列の位置（index + 1）', () => {
    expect(errorCatalogToTable(data, SUPPORT_PROFILE, opts()).rows[1][0]).toBe('2')
  })

  it('showUndefined オンで notes 以外の空欄を（未定義）にする（Markdown と同じ規則）', () => {
    const row = errorCatalogToTable(data, DEV_PROFILE, opts()).rows[1]
    // 開発向けの並び: No / エラー名 / 発生タイミング / 解決レベル / 原因（業務） /
    //                原因（仕様） / ユーザーの対応 / サポートの対応 / エンジニアの対応 / 備考
    expect(row[2]).toBe('（未定義）') // 発生タイミング
    expect(row[4]).toBe('（未定義）') // 原因（業務）
    expect(row[9]).toBe('') // 備考は空のまま
  })

  it('showUndefined オフなら空欄は空のまま', () => {
    const row = errorCatalogToTable(data, DEV_PROFILE, opts({ showUndefined: false })).rows[1]
    expect(row[2]).toBe('')
    expect(row[4]).toBe('')
  })

  it('numbering オフなら No 列が出ない', () => {
    const table = errorCatalogToTable(data, SUPPORT_PROFILE, opts({ numbering: false }))
    expect(table.header[0]).toBe('エラー名')
    expect(table.rows[0][0]).toBe('在庫不足')
  })

  it('visible を渡すと、その ID の行だけを出し No は振り直さない', () => {
    const table = errorCatalogToTable(
      data,
      SUPPORT_PROFILE,
      opts(),
      new Set(['error_bbbbbbbbbb']),
    )
    expect(table.rows).toHaveLength(1)
    expect(table.rows[0][0]).toBe('2')
  })
})
