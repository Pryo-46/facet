import { describe, expect, it } from 'vitest'
import type { ErrorEntry } from '@/types/error-catalog'
import { EMPTY_FILTER, filterErrorIndices, isDerivedView } from './search'

function entry(over: Partial<ErrorEntry> = {}): ErrorEntry {
  return {
    id: 'error_AAAAAAAAAA',
    name: 'エラー',
    occurrence: '',
    resolutionLevel: 'user',
    causeForSupport: '',
    causeForSpec: '',
    userAction: '',
    supportAction: '',
    engineerAction: '',
    notes: '',
    ...over,
  }
}

const entries: ErrorEntry[] = [
  entry({ id: 'error_AAAAAAAAAA', name: 'ログインできない', resolutionLevel: 'user' }),
  entry({
    id: 'error_BBBBBBBBBB',
    name: '保存に失敗する',
    resolutionLevel: 'engineer',
    causeForSupport: 'ディスクの空きがない',
  }),
  entry({
    id: 'error_CCCCCCCCCC',
    name: '印刷できない',
    resolutionLevel: 'undecided',
    notes: 'ログインの話ではない',
  }),
]

describe('filterErrorIndices', () => {
  it('絞り込みなしなら元配列の位置をそのまま返す', () => {
    expect(filterErrorIndices(entries, EMPTY_FILTER)).toEqual([0, 1, 2])
  })

  it('検索は原因や対応も横断する', () => {
    expect(filterErrorIndices(entries, { query: 'ディスク', levels: [] })).toEqual([1])
  })

  it('備考は検索対象に含めない（検知対象外の自由メモ）', () => {
    // 「ログイン」は 0 の name と 2 の notes に出るが、2 は引っかからない
    expect(filterErrorIndices(entries, { query: 'ログイン', levels: [] })).toEqual([0])
  })

  it('照合は重複判定と同じ normalizeForMatch（NFKC・大小同一視）', () => {
    expect(filterErrorIndices(entries, { query: 'ﾛｸﾞｲﾝ', levels: [] })).toEqual([0])
  })

  it('エントリ側の値も正規化して照合する（クエリ側だけの正規化では拾えない）', () => {
    // 半角カナ・大文字で書かれたエントリを、全角・小文字のクエリで引く。
    // entry 側の normalizeForMatch を外すとこのテストだけが赤くなる
    const skewed: ErrorEntry[] = [
      entry({ id: 'error_DDDDDDDDDD', name: 'ﾛｸﾞｲﾝできない' }),
      entry({ id: 'error_EEEEEEEEEE', name: 'CSV 出力に失敗する', causeForSupport: 'ENCODING の不一致' }),
    ]
    expect(filterErrorIndices(skewed, { query: 'ログイン', levels: [] })).toEqual([0])
    expect(filterErrorIndices(skewed, { query: 'encoding', levels: [] })).toEqual([1])
  })

  it('解決レベルの絞り込みは複数指定が OR', () => {
    expect(filterErrorIndices(entries, { query: '', levels: ['user', 'engineer'] })).toEqual([0, 1])
  })

  it('検索と解決レベルは AND', () => {
    expect(filterErrorIndices(entries, { query: 'できない', levels: ['user'] })).toEqual([0])
  })
})

describe('isDerivedView', () => {
  it('検索文字列か解決レベルの絞り込みがあれば導出表示', () => {
    expect(isDerivedView(EMPTY_FILTER)).toBe(false)
    expect(isDerivedView({ query: 'a', levels: [] })).toBe(true)
    expect(isDerivedView({ query: '', levels: ['user'] })).toBe(true)
  })

  it('空白だけのクエリは導出表示にしない（前後空白は入力ノイズ）', () => {
    expect(isDerivedView({ query: '  ', levels: [] })).toBe(false)
  })
})
