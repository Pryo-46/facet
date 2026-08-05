import { describe, expect, it } from 'vitest'
import { FIELD_LABELS, FIELD_ORDER, stepField } from './fields'

describe('FIELD_ORDER', () => {
  it('列は名称／種別／定義／別名／備考の5つ（ID は列に出さない）', () => {
    expect(FIELD_ORDER).toEqual(['name', 'kind', 'definition', 'aliases', 'notes'])
  })

  it('全列に日本語の見出しがある', () => {
    for (const field of FIELD_ORDER) expect(FIELD_LABELS[field]).toBeTruthy()
  })
})

describe('stepField', () => {
  it('Tab は右のセルへ', () => {
    expect(stepField('name', 1)).toEqual({ field: 'kind', rowDelta: 0 })
  })

  it('Shift+Tab は左のセルへ', () => {
    expect(stepField('definition', -1)).toEqual({ field: 'kind', rowDelta: 0 })
  })

  it('右端の Tab は次の行の先頭列へ折り返す', () => {
    expect(stepField('notes', 1)).toEqual({ field: 'name', rowDelta: 1 })
  })

  it('左端の Shift+Tab は前の行の末尾列へ折り返す', () => {
    expect(stepField('name', -1)).toEqual({ field: 'notes', rowDelta: -1 })
  })
})
