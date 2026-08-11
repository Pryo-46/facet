import { describe, expect, it } from 'vitest'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { checkSequenceConsistency } from './consistency'

function base(): SequenceSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'sequence',
    title: 't',
    actors: [
      { id: 'actor_Aaaaaaaaa1', name: '画面' },
      { id: 'actor_Aaaaaaaaa2', name: 'API' },
      { id: 'actor_Aaaaaaaaa3', name: '決済' },
    ],
    steps: [
      { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Aaaaaaaaa2', label: 'a', awaitsReply: true },
      { id: 'step_Aaaaaaaaa2', kind: 'reply', from: 'actor_Aaaaaaaaa2', to: 'actor_Aaaaaaaaa1', label: 'b' },
      { id: 'step_Aaaaaaaaa3', kind: 'self', from: 'actor_Aaaaaaaaa2', label: 'c' },
    ],
  }
}

describe('checkSequenceConsistency', () => {
  it('正常データは指摘なし（failures の欠落は未定義であって検証エラーではない）', () => {
    expect(checkSequenceConsistency(base())).toEqual([])
  })

  it('ID重複: actor と step で別々に検出し、重複した全行を指す', () => {
    const d = base()
    d.steps[2] = { ...d.steps[2], id: 'step_Aaaaaaaaa1' }
    const issues = checkSequenceConsistency(d)
    const dup = issues.filter((i) => i.rule === 'duplicate-id')
    expect(dup).toHaveLength(1)
    expect(dup[0].locations.map((l) => l.entityIndex)).toEqual([0, 2])
  })

  it('missing-actor: from の参照切れは from フィールドを指す', () => {
    const d = base()
    d.steps[0] = { ...d.steps[0], from: 'actor_Zzzzzzzzz9' }
    const issues = checkSequenceConsistency(d)
    const miss = issues.filter((i) => i.rule === 'missing-actor')
    expect(miss).toHaveLength(1)
    expect(miss[0].locations[0]).toEqual({ entityId: 'step_Aaaaaaaaa1', entityIndex: 0, field: 'from' })
  })

  it('missing-actor: to の参照切れも同様（1ステップに2件出うる）', () => {
    const d = base()
    d.steps[0] = { ...d.steps[0], from: 'actor_Zzzzzzzzz8', to: 'actor_Zzzzzzzzz9' }
    const miss = checkSequenceConsistency(d).filter((i) => i.rule === 'missing-actor')
    expect(miss.flatMap((i) => i.locations.map((l) => l.field)).sort()).toEqual(['from', 'to'])
  })

  it('unposed-answer: reply に failed の答えがあると、reply が理由だと分かる文言で指摘する', () => {
    const d = base()
    d.steps[1] = { ...d.steps[1], failures: { failed: { decision: 'handled', text: 'x' } } }
    const issues = checkSequenceConsistency(d).filter((i) => i.rule === 'unposed-answer')
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('応答')
    expect(issues[0].locations[0]).toEqual({ entityId: 'step_Aaaaaaaaa2', entityIndex: 1, field: 'failures' })
  })

  it('unposed-answer: 投げっぱなしの呼出に failed があると awaitsReply が理由だと分かる文言で指摘する', () => {
    const d = base()
    d.steps[0] = {
      ...d.steps[0],
      awaitsReply: false,
      failures: { failed: { decision: 'handled', text: 'x' } },
    }
    const issues = checkSequenceConsistency(d).filter((i) => i.rule === 'unposed-answer')
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('awaitsReply')
  })

  it('unposed-answer: 投げっぱなしの unknown.ifExecuted も立っていない問い', () => {
    const d = base()
    d.steps[0] = {
      ...d.steps[0],
      awaitsReply: false,
      failures: { unknown: { decision: 'handled', text: 'x', ifExecuted: { decision: 'notApplicable' } } },
    }
    const issues = checkSequenceConsistency(d).filter((i) => i.rule === 'unposed-answer')
    expect(issues).toHaveLength(1)
  })

  it('to-mismatch: self に to がある', () => {
    const d = base()
    d.steps[2] = { ...d.steps[2], to: 'actor_Aaaaaaaaa1' } as (typeof d.steps)[number]
    const issues = checkSequenceConsistency(d).filter((i) => i.rule === 'to-mismatch')
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('内部処理')
  })

  it('to-mismatch: call に to が無い', () => {
    const d = base()
    const { to: _to, ...rest } = d.steps[0]
    d.steps[0] = rest as (typeof d.steps)[number]
    const issues = checkSequenceConsistency(d).filter((i) => i.rule === 'to-mismatch')
    expect(issues).toHaveLength(1)
  })

  it('missing-actor と to-mismatch は独立に出る（self の to が参照切れでも to-mismatch が優先ではない）', () => {
    const d = base()
    d.steps[2] = { ...d.steps[2], to: 'actor_Zzzzzzzzz9' } as (typeof d.steps)[number]
    const rules = checkSequenceConsistency(d).map((i) => i.rule).sort()
    expect(rules).toEqual(['missing-actor', 'to-mismatch'])
  })
})
