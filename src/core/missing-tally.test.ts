import { describe, expect, it } from 'vitest'
import { TALLY_TOTAL_LABEL, tallyLine, type MissingTally } from './missing-tally'

describe('tallyLine', () => {
  it('合計と内訳を課題ツリーの帯と同じ形で出す', () => {
    const t: MissingTally = {
      total: 3,
      parts: [
        { kind: 'a', label: '仮説なし', count: 1, variant: 'open' },
        { kind: 'b', label: '未決', count: 2, variant: 'open' },
      ],
    }
    expect(tallyLine(t)).toBe('⚠ 要対応 3（仮説なし 1 ／ 未決 2）')
  })

  it('0 件なら ⚠ も内訳も出さない', () => {
    expect(tallyLine({ total: 0, parts: [] })).toBe('要対応 0')
  })

  it('count 0 の part は出さない（parts に混ざっていても）', () => {
    const t: MissingTally = {
      total: 1,
      parts: [
        { kind: 'a', label: '未定義', count: 1, variant: 'open' },
        { kind: 'b', label: '未分類', count: 0, variant: 'open' },
      ],
    }
    expect(tallyLine(t)).toBe('⚠ 要対応 1（未定義 1）')
  })

  it('TALLY_TOTAL_LABEL は 要対応', () => {
    expect(TALLY_TOTAL_LABEL).toBe('要対応')
  })
})
