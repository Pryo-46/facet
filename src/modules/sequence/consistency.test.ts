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

  it('from と to が同じ参加者を指す call に self-call が出る', () => {
    const d = base()
    d.steps[0].to = d.steps[0].from
    const issues = checkSequenceConsistency(d)
    const found = issues.filter((i) => i.rule === 'self-call')
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('内部処理')
    expect(found[0].locations[0].field).toBe('shape')
  })

  it('from が参照切れのときは self-call を出さない（missing-actor に任せる）', () => {
    const d = base()
    d.steps[0].from = 'actor_Zzzzzzzzzz'
    d.steps[0].to = 'actor_Zzzzzzzzzz'
    const issues = checkSequenceConsistency(d)
    expect(issues.some((i) => i.rule === 'self-call')).toBe(false)
  })

  it('self の from は to と比較されない（self-call は self に出ない）', () => {
    const d = base()
    d.steps[0] = { ...d.steps[0], kind: 'self' }
    delete d.steps[0].to
    delete d.steps[0].awaitsReply
    expect(checkSequenceConsistency(d).some((i) => i.rule === 'self-call')).toBe(false)
  })

  it('参加者の ID 重複も duplicate-id で指摘される（actor 側のループの変異検知）', () => {
    const d = base()
    d.actors = [
      { id: 'actor_Aaaaaaaaaa', name: '画面' },
      { id: 'actor_Aaaaaaaaaa', name: 'API' },
    ]
    const found = checkSequenceConsistency(d).filter((i) => i.rule === 'duplicate-id')
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('参加者')
    expect(found[0].locations).toHaveLength(2)
  })

  it('reply なのに to が無いと to-mismatch が出る（call だけに絞る変異の検知）', () => {
    const d = base()
    d.steps[0] = { ...d.steps[0], kind: 'reply' }
    delete d.steps[0].to
    delete d.steps[0].awaitsReply
    const found = checkSequenceConsistency(d).filter((i) => i.rule === 'to-mismatch')
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('応答')
  })
})
