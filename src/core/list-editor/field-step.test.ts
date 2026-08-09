import { describe, expect, it } from 'vitest'
import { stepField } from './field-step'

const ORDER = ['a', 'b', 'c'] as const

describe('stepField', () => {
  it('Tab は右のセルへ', () => {
    expect(stepField(ORDER, 'a', 1)).toEqual({ field: 'b', rowDelta: 0 })
  })

  it('Shift+Tab は左のセルへ', () => {
    expect(stepField(ORDER, 'b', -1)).toEqual({ field: 'a', rowDelta: 0 })
  })

  it('右端の Tab は次の行の先頭列へ折り返す', () => {
    expect(stepField(ORDER, 'c', 1)).toEqual({ field: 'a', rowDelta: 1 })
  })

  it('左端の Shift+Tab は前の行の末尾列へ折り返す', () => {
    expect(stepField(ORDER, 'a', -1)).toEqual({ field: 'c', rowDelta: -1 })
  })

  it('1列しかないときは、どちらへ動いても同じ列のまま行だけ動く', () => {
    const one = ['only'] as const
    expect(stepField(one, 'only', 1)).toEqual({ field: 'only', rowDelta: 1 })
    expect(stepField(one, 'only', -1)).toEqual({ field: 'only', rowDelta: -1 })
  })
})
