import { describe, expect, it } from 'vitest'
import type { ErrorEntry } from '@/types/error-catalog'
import { isWarnCell } from './warnings'

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

describe('発生タイミングと原因', () => {
  it('空なら resolutionLevel によらず常に warning', () => {
    for (const level of ['user', 'support', 'engineer', 'none', 'undecided'] as const) {
      const e = entry({ resolutionLevel: level })
      expect(isWarnCell(e, 'occurrence'), level).toBe(true)
      expect(isWarnCell(e, 'causeForSupport'), level).toBe(true)
      expect(isWarnCell(e, 'causeForSpec'), level).toBe(true)
    }
  })

  it('埋まっていれば warning にならない', () => {
    const e = entry({ occurrence: '送信時', causeForSupport: '入力誤り', causeForSpec: '401' })
    expect(isWarnCell(e, 'occurrence')).toBe(false)
    expect(isWarnCell(e, 'causeForSupport')).toBe(false)
    expect(isWarnCell(e, 'causeForSpec')).toBe(false)
  })
})

describe('対応3種', () => {
  it('宣言されたレベルの対応が空なら warning', () => {
    expect(isWarnCell(entry({ resolutionLevel: 'user' }), 'userAction')).toBe(true)
    expect(isWarnCell(entry({ resolutionLevel: 'support' }), 'supportAction')).toBe(true)
    expect(isWarnCell(entry({ resolutionLevel: 'engineer' }), 'engineerAction')).toBe(true)
  })

  it('関与しないレベルの対応は空でも warning にしない（表の半分が黄色になるのを避ける）', () => {
    const user = entry({ resolutionLevel: 'user' })
    expect(isWarnCell(user, 'supportAction')).toBe(false)
    expect(isWarnCell(user, 'engineerAction')).toBe(false)
  })

  it('none は3つとも warning（復旧不可でも案内文は存在する）', () => {
    const none = entry({ resolutionLevel: 'none' })
    expect(isWarnCell(none, 'userAction')).toBe(true)
    expect(isWarnCell(none, 'supportAction')).toBe(true)
    expect(isWarnCell(none, 'engineerAction')).toBe(true)
  })

  it('undecided は対応3種を warning にしない（まだ誰が対応するか決めていない）', () => {
    const undecided = entry({ resolutionLevel: 'undecided' })
    expect(isWarnCell(undecided, 'userAction')).toBe(false)
    expect(isWarnCell(undecided, 'supportAction')).toBe(false)
    expect(isWarnCell(undecided, 'engineerAction')).toBe(false)
  })

  it('埋まっていれば warning にならない', () => {
    expect(
      isWarnCell(entry({ resolutionLevel: 'none', userAction: '作り直す' }), 'userAction'),
    ).toBe(false)
  })
})

describe('解決レベル・エラー名・備考', () => {
  it('解決レベルは undecided のときだけ warning', () => {
    expect(isWarnCell(entry({ resolutionLevel: 'undecided' }), 'resolutionLevel')).toBe(true)
    expect(isWarnCell(entry({ resolutionLevel: 'none' }), 'resolutionLevel')).toBe(false)
    expect(isWarnCell(entry({ resolutionLevel: 'user' }), 'resolutionLevel')).toBe(false)
  })

  it('エラー名と備考は warning にならない（空はスキーマ違反／検知対象外の自由メモ）', () => {
    const e = entry({ notes: '' })
    expect(isWarnCell(e, 'name')).toBe(false)
    expect(isWarnCell(e, 'notes')).toBe(false)
  })
})
