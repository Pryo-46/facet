import { describe, expect, it } from 'vitest'
import { COLUMNS, DEFAULT_WIDTHS, WIDTH_INDEX } from './columns'
import { FIELD_ORDER } from './fields'

describe('用語テーブルの列', () => {
  it('列の並びが FIELD_ORDER と一致する', () => {
    // 表の列と Tab のセル移動順が食い違うと、操作言語が破綻する
    expect(COLUMNS.map((c) => c.field)).toEqual([...FIELD_ORDER])
  })

  it('幅を持たない列は定義列だけ（残りを埋める列）', () => {
    expect(COLUMNS.filter((c) => c.defaultWidth === null).map((c) => c.field)).toEqual([
      'definition',
    ])
  })

  it('WIDTH_INDEX が COLUMNS の添字を幅配列の添字へ写す', () => {
    // 幅配列は固定幅の4列だけを持つので、COLUMNS の添字とは一致しない。
    // ここを取り違えると、掴んだ列と動く列がずれる
    expect(WIDTH_INDEX).toEqual([0, 1, null, 2, 3])
  })

  it('既定幅が並び順で並ぶ', () => {
    expect(DEFAULT_WIDTHS).toEqual([176, 128, 176, 256])
  })

  it('幅を持つ列の数と DEFAULT_WIDTHS の長さが一致する', () => {
    expect(DEFAULT_WIDTHS).toHaveLength(COLUMNS.filter((c) => c.defaultWidth !== null).length)
  })
})
