import { describe, expect, it } from 'vitest'
import type { ErrorCatalogSchemaVersion1, ErrorEntry } from '@/types/error-catalog'
import { checkErrorCatalogConsistency } from './consistency'

function entry(over: Partial<ErrorEntry> = {}): ErrorEntry {
  return {
    id: 'error_AAAAAAAAAA',
    name: 'エラー',
    occurrence: '',
    resolutionLevel: 'none',
    causeForSupport: '',
    causeForSpec: '',
    userAction: '',
    supportAction: '',
    engineerAction: '',
    notes: '',
    ...over,
  }
}

function catalog(errors: ErrorEntry[]): ErrorCatalogSchemaVersion1 {
  return { schemaVersion: 1, type: 'errorCatalog', title: 'テストカタログ', errors }
}

const rules = (data: ErrorCatalogSchemaVersion1): string[] =>
  checkErrorCatalogConsistency(data).map((i) => i.rule)

describe('duplicate-id', () => {
  it('同じ ID の全行を配列位置で指す（ID では行を一意に指せない）', () => {
    const issues = checkErrorCatalogConsistency(
      catalog([
        entry({ id: 'error_AAAAAAAAAA', name: 'A' }),
        entry({ id: 'error_BBBBBBBBBB', name: 'B' }),
        entry({ id: 'error_AAAAAAAAAA', name: 'C' }),
      ]),
    )
    const dup = issues.filter((i) => i.rule === 'duplicate-id')
    expect(dup).toHaveLength(1)
    expect(dup[0].locations.map((l) => l.entityIndex)).toEqual([0, 2])
    expect(dup[0].locations.every((l) => l.field === 'id')).toBe(true)
  })

  it('ID は正規化しない完全一致で見る（大小の違う ID は別物）', () => {
    expect(
      rules(
        catalog([
          entry({ id: 'error_AAAAAAAAAA', name: 'A' }),
          entry({ id: 'error_aaaaaaaaaa', name: 'B' }),
        ]),
      ),
    ).not.toContain('duplicate-id')
  })
})

describe('duplicate-name', () => {
  it('同名の行を name セルで指す', () => {
    const issues = checkErrorCatalogConsistency(
      catalog([
        entry({ id: 'error_AAAAAAAAAA', name: 'ログイン失敗' }),
        entry({ id: 'error_BBBBBBBBBB', name: 'ログイン失敗' }),
      ]),
    )
    const dup = issues.filter((i) => i.rule === 'duplicate-name')
    expect(dup).toHaveLength(1)
    expect(dup[0].locations.map((l) => l.entityIndex)).toEqual([0, 1])
    expect(dup[0].locations.every((l) => l.field === 'name')).toBe(true)
  })

  it('照合は用語集と同じ規則（NFKC ＋ 前後空白 ＋ 大小同一視）', () => {
    expect(
      rules(
        catalog([
          entry({ id: 'error_AAAAAAAAAA', name: 'ログイン' }),
          entry({ id: 'error_BBBBBBBBBB', name: ' ﾛｸﾞｲﾝ ' }),
        ]),
      ),
    ).toContain('duplicate-name')
  })
})

describe('resolution-action-missing', () => {
  it('user を宣言しているのにユーザーの対応が空なら、そのセルを指す', () => {
    const issues = checkErrorCatalogConsistency(
      catalog([entry({ name: 'A', resolutionLevel: 'user', userAction: '' })]),
    )
    const missing = issues.filter((i) => i.rule === 'resolution-action-missing')
    expect(missing).toHaveLength(1)
    expect(missing[0].locations).toEqual([
      { entityId: 'error_AAAAAAAAAA', entityIndex: 0, field: 'userAction' },
    ])
  })

  it('support / engineer もそれぞれの対応セルを指す', () => {
    const issues = checkErrorCatalogConsistency(
      catalog([
        entry({ id: 'error_AAAAAAAAAA', name: 'A', resolutionLevel: 'support' }),
        entry({ id: 'error_BBBBBBBBBB', name: 'B', resolutionLevel: 'engineer' }),
      ]),
    )
    expect(
      issues
        .filter((i) => i.rule === 'resolution-action-missing')
        .map((i) => i.locations[0].field),
    ).toEqual(['supportAction', 'engineerAction'])
  })

  it('宣言したレベルの対応が埋まっていれば出ない（他の対応が空でも関係ない）', () => {
    expect(
      rules(
        catalog([
          entry({ name: 'A', resolutionLevel: 'user', userAction: 'やり直す', supportAction: '' }),
        ]),
      ),
    ).not.toContain('resolution-action-missing')
  })

  it('none と undecided では出ない（対応文の空は warning であって赤ではない）', () => {
    expect(rules(catalog([entry({ name: 'A', resolutionLevel: 'none' })]))).not.toContain(
      'resolution-action-missing',
    )
    expect(rules(catalog([entry({ name: 'B', resolutionLevel: 'undecided' })]))).not.toContain(
      'resolution-action-missing',
    )
  })
})

describe('ルールの範囲', () => {
  it('レベル2は3ルールだけ（warning を issue に混ぜない）', () => {
    // 空欄だらけでも undecided でも、赤の指摘は増えない。
    // 混ぜると issue 一覧が warning で埋まり、赤の指摘が読めなくなる
    expect(
      rules(catalog([entry({ id: 'error_AAAAAAAAAA', name: 'A', resolutionLevel: 'undecided' })])),
    ).toEqual([])
  })
})
