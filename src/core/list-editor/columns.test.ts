import { describe, expect, it } from 'vitest'
import { defaultWidths, nextWidthIndex, widthIndex, type ColumnSpec } from './columns'

/** 3列目だけが幅を持たない（残りを埋める）列構成 */
const COLUMNS: readonly ColumnSpec<string>[] = [
  { field: 'a', defaultWidth: 176 },
  { field: 'b', defaultWidth: 128 },
  { field: 'c', defaultWidth: null },
  { field: 'd', defaultWidth: 176 },
  { field: 'e', defaultWidth: 256 },
]

describe('widthIndex', () => {
  it('列の添字を幅配列の添字へ写す。幅を持たない列は null', () => {
    // 幅配列は固定幅の列だけを並び順で持つので、列の添字とは一致しない。
    // ここを取り違えると、掴んだ列と動く列がずれる
    expect(widthIndex(COLUMNS)).toEqual([0, 1, null, 2, 3])
  })

  it('全列が幅を持つなら恒等写像', () => {
    expect(widthIndex([
      { field: 'a', defaultWidth: 10 },
      { field: 'b', defaultWidth: 20 },
    ])).toEqual([0, 1])
  })

  it('列が無ければ空', () => {
    expect(widthIndex([])).toEqual([])
  })
})

describe('defaultWidths', () => {
  it('幅を持つ列の既定幅だけを並び順で返す', () => {
    expect(defaultWidths(COLUMNS)).toEqual([176, 128, 176, 256])
  })

  it('長さが「幅を持つ列の数」と一致する', () => {
    expect(defaultWidths(COLUMNS)).toHaveLength(
      COLUMNS.filter((c) => c.defaultWidth !== null).length,
    )
  })
})

describe('nextWidthIndex', () => {
  const index = widthIndex(COLUMNS)

  it('幅を持たない列(添字2)の次は、右隣の固定幅列の幅配列上の添字', () => {
    expect(nextWidthIndex(index, 2)).toBe(2)
  })

  it('固定幅を持つ列を渡しても、そのさらに次の固定幅列を返す', () => {
    expect(nextWidthIndex(index, 0)).toBe(1)
  })

  it('最後の列より後ろには幅を持つ列が無いので null', () => {
    expect(nextWidthIndex(index, 4)).toBeNull()
  })

  it('末尾が幅を持たない列でも null を返す（範囲外を読まない）', () => {
    const tail = widthIndex([
      { field: 'a', defaultWidth: 10 },
      { field: 'b', defaultWidth: null },
    ])
    expect(nextWidthIndex(tail, 0)).toBeNull()
  })
})
