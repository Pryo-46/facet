import { describe, expect, it } from 'vitest'
import { COLUMNS, DEFAULT_WIDTHS, nextWidthIndex, WIDTH_INDEX } from './columns'
import { FIELD_ORDER } from './fields'

describe('用語テーブルの列', () => {
  it('No を除いた列の並びが FIELD_ORDER と一致する', () => {
    // 表の列と Tab のセル移動順が食い違うと、操作言語が破綻する。
    // No は編集対象ではない導出列で GlossaryField ではないため、先頭を除いて比べる
    expect(COLUMNS.map((c) => c.field)).toEqual(['no', ...FIELD_ORDER])
  })

  it('幅を持たない列は定義列だけ（残りを埋める列）', () => {
    expect(COLUMNS.filter((c) => c.defaultWidth === null).map((c) => c.field)).toEqual([
      'definition',
    ])
  })

  it('WIDTH_INDEX が COLUMNS の添字を幅配列の添字へ写す', () => {
    // 幅配列は固定幅の5列（No・名称・種別・別名・備考）だけを持つので、
    // COLUMNS の添字とは一致しない。ここを取り違えると、掴んだ列と動く列がずれる
    expect(WIDTH_INDEX).toEqual([0, 1, 2, null, 3, 4])
  })

  it('既定幅が並び順で並ぶ', () => {
    expect(DEFAULT_WIDTHS).toEqual([56, 176, 128, 176, 256])
  })

  it('幅を持つ列の数と DEFAULT_WIDTHS の長さが一致する', () => {
    expect(DEFAULT_WIDTHS).toHaveLength(COLUMNS.filter((c) => c.defaultWidth !== null).length)
  })
})

describe('nextWidthIndex', () => {
  it('幅を持たない定義列(添字3)の次は、右隣の別名列の幅配列上の添字を返す', () => {
    // COLUMNS: no(0) name(1) kind(2) definition(3) aliases(4) notes(5)
    // widths:  no(0) name(1) kind(2)                aliases(3) notes(4)
    expect(nextWidthIndex(3)).toBe(3)
  })

  it('固定幅を持つ列の添字を渡しても、そのさらに次の固定幅列を返す', () => {
    expect(nextWidthIndex(1)).toBe(2) // name の次は kind
  })

  it('最後の列より後ろには幅を持つ列が無いので null を返す', () => {
    expect(nextWidthIndex(5)).toBeNull() // notes より後ろは無い
  })
})
