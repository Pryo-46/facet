import { describe, expect, it } from 'vitest'
import { isMissingNode, tallyMissing } from './missing'

describe('isMissingNode', () => {
  it('text が空は欠落、埋まっていれば欠落でない', () => {
    expect(isMissingNode({ text: '' })).toBe(true)
    expect(isMissingNode({ text: '退会できない' })).toBe(false)
  })
})

describe('tallyMissing', () => {
  it('件数と part を返す', () => {
    const t = tallyMissing([{ text: '' }, { text: 'a' }, { text: '' }])
    expect(t.total).toBe(2)
    expect(t.parts).toEqual([{ kind: 'text', label: '未記入', count: 2, variant: 'open' }])
  })
  it('0 件なら parts は空', () => {
    expect(tallyMissing([{ text: 'a' }])).toEqual({ total: 0, parts: [] })
  })
})
