import { describe, expect, it } from 'vitest'
import type { SequenceSchemaVersion1, SequenceStep } from '@/types/sequence'
import { tallySequenceMissing } from './missing'

function data(patch: Partial<SequenceSchemaVersion1> = {}): SequenceSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'sequence',
    title: 't',
    actors: [
      { id: 'actor_Aaaaaaaaa1', name: '画面' },
      { id: 'actor_Aaaaaaaaa2', name: 'API' },
    ],
    steps: [],
    ...patch,
  }
}

function call(patch: Partial<SequenceStep> = {}): SequenceStep {
  return {
    id: 'step_Aaaaaaaaa1',
    kind: 'call',
    from: 'actor_Aaaaaaaaa1',
    to: 'actor_Aaaaaaaaa2',
    label: '注文を確定',
    awaitsReply: true,
    ...patch,
  }
}

describe('tallySequenceMissing', () => {
  it('未回答（立っている問いに decision が無い）と未記入（参加者名・ステップラベルの空）を分けて数える', () => {
    const t = tallySequenceMissing(
      data({
        actors: [
          { id: 'actor_Aaaaaaaaa1', name: '' },
          { id: 'actor_Aaaaaaaaa2', name: 'API' },
        ],
        // 応答待ちの呼出は failed / unknown / ifExecuted の3問が立つ。
        // failures が空なので3問とも未回答。ラベルの空で未記入がもう1件
        steps: [call({ label: '' })],
      }),
    )
    expect(t.missing.total).toBe(5)
    expect(t.missing.parts).toEqual([
      { kind: 'unanswered', label: '未回答', count: 3, variant: 'open' },
      { kind: 'blank', label: '未記入', count: 2, variant: 'open' },
    ])
    expect(t).toMatchObject({ handled: 0, notApplicable: 0 })
  })

  it('handled と notApplicable は欠落に数えず、それぞれのカウンタへ入れる（考慮不要は「決めた」＝確定）', () => {
    const t = tallySequenceMissing(
      data({
        steps: [
          call({
            failures: {
              failed: { decision: 'handled', text: 'エラー表示' },
              unknown: {
                decision: 'notApplicable',
                ifExecuted: { decision: 'handled', text: '冪等なので再送する' },
              },
            },
          }),
        ],
      }),
    )
    expect(t.missing.total).toBe(0)
    expect(t.missing.parts).toEqual([])
    expect(t).toMatchObject({ handled: 2, notApplicable: 1 })
  })

  it('text だけあって decision が無いスロットは未回答（答えたことにしない。presentAnswers と同じ規則）', () => {
    const t = tallySequenceMissing(
      data({ steps: [call({ failures: { unknown: { text: '書きかけ' } } })] }),
    )
    expect(t.missing.total).toBe(3)
    expect(t).toMatchObject({ handled: 0, notApplicable: 0 })
  })

  it('問いが立っていないスロットは数えない（reply は問い無し）', () => {
    const t = tallySequenceMissing(
      data({
        steps: [
          {
            id: 'step_Aaaaaaaaa2',
            kind: 'reply',
            from: 'actor_Aaaaaaaaa2',
            to: 'actor_Aaaaaaaaa1',
            label: '注文番号',
          },
        ],
      }),
    )
    expect(t.missing.total).toBe(0)
    expect(t).toMatchObject({ handled: 0, notApplicable: 0 })
  })

  it('立っていない問いに答えが在っても handled には数えない（種別切替の残骸。数えるのは立っている問いだけ）', () => {
    // 投げっぱなし（awaitsReply: false）は unknown だけが立つ。failed の答えは残骸
    const t = tallySequenceMissing(
      data({
        steps: [
          call({
            awaitsReply: false,
            failures: { failed: { decision: 'handled', text: '再試行する' } },
          }),
        ],
      }),
    )
    expect(t.missing.total).toBe(1)
    expect(t.missing.parts).toEqual([
      { kind: 'unanswered', label: '未回答', count: 1, variant: 'open' },
    ])
    expect(t).toMatchObject({ handled: 0, notApplicable: 0 })
  })

  it('self は failed だけが立つ（未回答は1件）', () => {
    const t = tallySequenceMissing(
      data({
        steps: [
          { id: 'step_Aaaaaaaaa3', kind: 'self', from: 'actor_Aaaaaaaaa2', label: '在庫を引当' },
        ],
      }),
    )
    expect(t.missing.total).toBe(1)
  })

  it('0 件の part は入れない（未回答が無く未記入だけのとき）', () => {
    const t = tallySequenceMissing(
      data({
        actors: [{ id: 'actor_Aaaaaaaaa1', name: '' }],
        steps: [],
      }),
    )
    expect(t.missing.parts).toEqual([
      { kind: 'blank', label: '未記入', count: 1, variant: 'open' },
    ])
  })
})
