import { describe, expect, it } from 'vitest'
import type { ErrorEntry } from '@/types/error-catalog'
import { isMissingCell, tallyMissing } from './missing'

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
  it('空なら resolutionLevel によらず常に欠落', () => {
    for (const level of ['user', 'support', 'engineer', 'none', 'undecided'] as const) {
      const e = entry({ resolutionLevel: level })
      expect(isMissingCell(e, 'occurrence'), level).toBe(true)
      expect(isMissingCell(e, 'causeForSupport'), level).toBe(true)
      expect(isMissingCell(e, 'causeForSpec'), level).toBe(true)
    }
  })

  it('埋まっていれば欠落にならない', () => {
    const e = entry({ occurrence: '送信時', causeForSupport: '入力誤り', causeForSpec: '401' })
    expect(isMissingCell(e, 'occurrence')).toBe(false)
    expect(isMissingCell(e, 'causeForSupport')).toBe(false)
    expect(isMissingCell(e, 'causeForSpec')).toBe(false)
  })
})

describe('対応3種', () => {
  it('宣言されたレベルの対応が空なら欠落', () => {
    expect(isMissingCell(entry({ resolutionLevel: 'user' }), 'userAction')).toBe(true)
    expect(isMissingCell(entry({ resolutionLevel: 'support' }), 'supportAction')).toBe(true)
    expect(isMissingCell(entry({ resolutionLevel: 'engineer' }), 'engineerAction')).toBe(true)
  })

  it('関与しないレベルの対応は空でも欠落にしない（表の半分が黄色になるのを避ける）', () => {
    const user = entry({ resolutionLevel: 'user' })
    expect(isMissingCell(user, 'supportAction')).toBe(false)
    expect(isMissingCell(user, 'engineerAction')).toBe(false)
  })

  it('none は3つとも欠落（復旧不可でも案内文は存在する）', () => {
    const none = entry({ resolutionLevel: 'none' })
    expect(isMissingCell(none, 'userAction')).toBe(true)
    expect(isMissingCell(none, 'supportAction')).toBe(true)
    expect(isMissingCell(none, 'engineerAction')).toBe(true)
  })

  it('undecided は対応3種を欠落にしない（まだ誰が対応するか決めていない）', () => {
    const undecided = entry({ resolutionLevel: 'undecided' })
    expect(isMissingCell(undecided, 'userAction')).toBe(false)
    expect(isMissingCell(undecided, 'supportAction')).toBe(false)
    expect(isMissingCell(undecided, 'engineerAction')).toBe(false)
  })

  it('埋まっていれば欠落にならない', () => {
    expect(
      isMissingCell(entry({ resolutionLevel: 'none', userAction: '作り直す' }), 'userAction'),
    ).toBe(false)
  })
})

describe('解決レベル・エラー名・備考', () => {
  it('解決レベルは undecided のときだけ欠落', () => {
    expect(isMissingCell(entry({ resolutionLevel: 'undecided' }), 'resolutionLevel')).toBe(true)
    expect(isMissingCell(entry({ resolutionLevel: 'none' }), 'resolutionLevel')).toBe(false)
    expect(isMissingCell(entry({ resolutionLevel: 'user' }), 'resolutionLevel')).toBe(false)
  })

  it('エラー名と備考は欠落にならない（空はスキーマ違反／検知対象外の自由メモ）', () => {
    const e = entry({ notes: '' })
    expect(isMissingCell(e, 'name')).toBe(false)
    expect(isMissingCell(e, 'notes')).toBe(false)
  })
})

describe('tallyMissing', () => {
  it('未分類と未記入を別の part で数える', () => {
    // resolutionLevel: 'undecided'・全文空 → undecided 1 ＋ blank
    // （occurrence/causeForSupport/causeForSpec の3。対応3種はどのレベルにも
    // 関与しないので数えない）
    const undecidedRow = entry({ resolutionLevel: 'undecided' })
    // resolutionLevel: 'user' で userAction 空 → blank に数える
    const userRow = entry({
      resolutionLevel: 'user',
      occurrence: '送信時',
      causeForSupport: '入力誤り',
      causeForSpec: '401',
      userAction: '',
    })
    // resolutionLevel: 'engineer' で userAction 空・engineerAction 埋め →
    // userAction は関与しないレベルなので数えない
    const engineerRow = entry({
      resolutionLevel: 'engineer',
      occurrence: '送信時',
      causeForSupport: '入力誤り',
      causeForSpec: '401',
      userAction: '',
      engineerAction: '作り直す',
    })
    const t = tallyMissing([undecidedRow, userRow, engineerRow])
    expect(t.total).toBe(5)
    expect(t.parts).toEqual([
      { kind: 'undecided', label: '未分類', count: 1, variant: 'open' },
      { kind: 'blank', label: '未記入', count: 4, variant: 'open' },
    ])
  })

  it('未記入はセル単位で数える（1行に複数ありうる）', () => {
    // none は対応3種すべてが関与するので、1行で occurrence・causeForSupport・
    // causeForSpec・userAction・supportAction・engineerAction の6セルが欠落になりうる
    const row = entry({ resolutionLevel: 'none' })
    const t = tallyMissing([row])
    expect(t.parts.find((p) => p.kind === 'blank')?.count).toBe(6)
  })

  it('0 件の part は入れない', () => {
    expect(
      tallyMissing([
        entry({
          resolutionLevel: 'none',
          occurrence: '送信時',
          causeForSupport: '入力誤り',
          causeForSpec: '401',
          userAction: '作り直す',
          supportAction: '案内する',
          engineerAction: '調査する',
        }),
      ]).parts,
    ).toEqual([])
  })
})
