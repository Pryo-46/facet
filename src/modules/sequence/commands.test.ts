import { describe, expect, it } from 'vitest'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import {
  addActorAfter,
  addFirstActor,
  addStepAfter,
  addStepLast,
  createActorAndAssign,
  moveActor,
  moveStep,
  removeActor,
  removeStep,
  setActorDomain,
  setActorName,
  setAnswerText,
  setStepActor,
  setStepLabel,
  setStepShape,
  stepShapeOf,
  toggleNotApplicable,
} from './commands'

function data(): SequenceSchemaVersion1 {
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
      { id: 'step_Aaaaaaaaa2', kind: 'call', from: 'actor_Aaaaaaaaa2', to: 'actor_Aaaaaaaaa3', label: 'b', awaitsReply: true },
      { id: 'step_Aaaaaaaaa3', kind: 'self', from: 'actor_Aaaaaaaaa3', label: 'c' },
    ],
  }
}

describe('actor 操作', () => {
  it('addFirstActor は空の参加者を1人足してフォーカスする', () => {
    const r = addFirstActor({ ...data(), actors: [], steps: [] })
    expect(r.data.actors).toHaveLength(1)
    expect(r.data.actors[0].name).toBe('')
    expect(r.data.actors[0].id).toMatch(/^actor_[A-Za-z0-9]{10}$/)
    expect(r.focus).toEqual({ kind: 'actor', index: 0 })
  })

  it('addActorAfter は直後に挿入する（末尾追加と区別できる位置で見る）', () => {
    const r = addActorAfter(data(), 0)
    expect(r.data.actors.map((a) => a.name)).toEqual(['画面', '', 'API', '決済'])
    expect(r.focus).toEqual({ kind: 'actor', index: 1 })
  })

  it('removeActor は参加者だけ消し、参照しているステップは残す（missing-actor は検証の仕事）', () => {
    const r = removeActor(data(), 1)
    expect(r.data.actors.map((a) => a.name)).toEqual(['画面', '決済'])
    expect(r.data.steps).toHaveLength(3)
    expect(r.data.steps[0].to).toBe('actor_Aaaaaaaaa2')
    expect(r.focus).toEqual({ kind: 'actor', index: 0 })
  })

  it('moveActor は隣と入れ替える（3人の真ん中を右へ＝末尾との入れ替えではない）', () => {
    const r = moveActor(data(), 1, 1)
    expect(r.data.actors.map((a) => a.name)).toEqual(['画面', '決済', 'API'])
    expect(r.focus).toEqual({ kind: 'actor', index: 2 })
  })

  it('端の moveActor は何もしない', () => {
    const r = moveActor(data(), 0, -1)
    expect(r.data.actors.map((a) => a.name)).toEqual(['画面', 'API', '決済'])
  })

  it('setActorDomain は空文字で domain キー自体を消す', () => {
    const withDomain = setActorDomain(data(), 0, '自社')
    expect(withDomain.actors[0].domain).toBe('自社')
    const cleared = setActorDomain(withDomain, 0, '')
    expect('domain' in cleared.actors[0]).toBe(false)
  })
})

describe('step 操作', () => {
  it('addStepAfter の既定値: from は前の to、to は前の from（会話の往復）、kind は call・応答待ち', () => {
    const r = addStepAfter(data(), 0)
    expect(r.data.steps).toHaveLength(4)
    const added = r.data.steps[1]
    expect(added.from).toBe('actor_Aaaaaaaaa2')
    expect(added.to).toBe('actor_Aaaaaaaaa1')
    expect(added.kind).toBe('call')
    expect(added.awaitsReply).toBe(true)
    expect(added.label).toBe('')
    expect(r.focus).toEqual({ kind: 'step', index: 1 })
  })

  it('addStepAfter: self（to 無し）の後は from を引き継ぐ', () => {
    const r = addStepAfter(data(), 2)
    const added = r.data.steps[3]
    expect(added.from).toBe('actor_Aaaaaaaaa3')
    expect(added.to).toBe('actor_Aaaaaaaaa3')
  })

  it('addStepLast: ステップ0件では先頭の2参加者を from/to にする', () => {
    const r = addStepLast({ ...data(), steps: [] })
    expect(r.data.steps).toHaveLength(1)
    expect(r.data.steps[0].from).toBe('actor_Aaaaaaaaa1')
    expect(r.data.steps[0].to).toBe('actor_Aaaaaaaaa2')
  })

  it('removeStep のフォーカスは前の行（先頭を消したら次の行、無ければ null）', () => {
    expect(removeStep(data(), 1).focus).toEqual({ kind: 'step', index: 0 })
    expect(removeStep(data(), 0).focus).toEqual({ kind: 'step', index: 0 })
    const one = { ...data(), steps: data().steps.slice(0, 1) }
    expect(removeStep(one, 0).focus).toBeNull()
  })

  it('moveStep は3行の真ん中を下へ動かすと末尾になる（削除→挿入のずれが無い）', () => {
    const r = moveStep(data(), 1, 1)
    expect(r.data.steps.map((s) => s.label)).toEqual(['a', 'c', 'b'])
    expect(r.focus).toEqual({ kind: 'step', index: 2 })
  })

  it('createActorAndAssign は参加者を末尾に足して参照を差し替える（1操作）', () => {
    const next = createActorAndAssign(data(), 0, 'to', 'メール基盤')
    expect(next.actors).toHaveLength(4)
    expect(next.actors[3].name).toBe('メール基盤')
    expect(next.steps[0].to).toBe(next.actors[3].id)
  })
})

describe('setStepShape', () => {
  it('self にすると to と awaitsReply が消える', () => {
    const next = setStepShape(data(), 0, 'self')
    expect(next.steps[0].kind).toBe('self')
    expect('to' in next.steps[0]).toBe(false)
    expect('awaitsReply' in next.steps[0]).toBe(false)
  })

  it('reply にすると awaitsReply が消えて to は残る', () => {
    const next = setStepShape(data(), 0, 'reply')
    expect(next.steps[0].kind).toBe('reply')
    expect(next.steps[0].to).toBe('actor_Aaaaaaaaa2')
    expect('awaitsReply' in next.steps[0]).toBe(false)
  })

  it('call-async は awaitsReply: false', () => {
    const next = setStepShape(data(), 0, 'call-async')
    expect(next.steps[0].kind).toBe('call')
    expect(next.steps[0].awaitsReply).toBe(false)
  })

  it('形を変えても failures は消さない（立たなくなった答えは赤表示で残る。黙って消さない）', () => {
    const withAnswer = setAnswerText(data(), 0, 'failed', 'エラー表示')
    const next = setStepShape(withAnswer, 0, 'reply')
    expect(next.steps[0].failures?.failed).toEqual({ decision: 'handled', text: 'エラー表示' })
  })

  it('stepShapeOf は4値を往復する', () => {
    expect(stepShapeOf(data().steps[0])).toBe('call-sync')
    expect(stepShapeOf(setStepShape(data(), 0, 'call-async').steps[0])).toBe('call-async')
    expect(stepShapeOf(setStepShape(data(), 0, 'reply').steps[0])).toBe('reply')
    expect(stepShapeOf(setStepShape(data(), 0, 'self').steps[0])).toBe('self')
  })
})

describe('範囲外 index は何もしない（グローバル制約）', () => {
  it('参加者を書き換える関数は範囲外 index で元データをそのまま返す', () => {
    const d = data()
    expect(setActorName(d, 99, 'x')).toBe(d)
    expect(setActorDomain(d, 99, 'x')).toBe(d)
  })

  it('ステップを書き換える関数は範囲外 index で元データをそのまま返す', () => {
    const d = data()
    expect(setStepLabel(d, 99, 'x')).toBe(d)
    expect(setStepActor(d, 99, 'from', 'actor_Aaaaaaaaa1')).toBe(d)
    expect(setStepShape(d, 99, 'self')).toBe(d)
    expect(createActorAndAssign(d, 99, 'from', '新規')).toBe(d)
  })
})

describe('答えスロット', () => {
  it('setAnswerText は handled として書く', () => {
    const next = setAnswerText(data(), 0, 'failed', 'エラー表示')
    expect(next.steps[0].failures).toEqual({ failed: { decision: 'handled', text: 'エラー表示' } })
  })

  it('setAnswerText の空文字はキーごと消す（未定義へ戻る）。failures が空になったら failures ごと消す', () => {
    const withAnswer = setAnswerText(data(), 0, 'failed', 'x')
    const cleared = setAnswerText(withAnswer, 0, 'failed', '')
    expect('failures' in cleared.steps[0]).toBe(false)
  })

  it('ifExecuted は unknown の中に入る。unknown 未回答でも部分回答として持てる', () => {
    const next = setAnswerText(data(), 0, 'ifExecuted', '取引IDで冪等')
    expect(next.steps[0].failures?.unknown).toEqual({
      ifExecuted: { decision: 'handled', text: '取引IDで冪等' },
    })
  })

  it('ifExecuted を消しても unknown 本体の答えは残る', () => {
    let d = setAnswerText(data(), 0, 'unknown', 'リトライ')
    d = setAnswerText(d, 0, 'ifExecuted', '冪等')
    d = setAnswerText(d, 0, 'ifExecuted', '')
    expect(d.steps[0].failures?.unknown).toEqual({ decision: 'handled', text: 'リトライ' })
  })

  it('toggleNotApplicable: 未定義 → notApplicable → 未定義', () => {
    const on = toggleNotApplicable(data(), 0, 'failed')
    expect(on.steps[0].failures?.failed).toEqual({ decision: 'notApplicable' })
    const off = toggleNotApplicable(on, 0, 'failed')
    expect('failures' in off.steps[0]).toBe(false)
  })

  it('toggleNotApplicable: handled（text あり）→ notApplicable（text 温存）→ handled に戻る', () => {
    const handled = setAnswerText(data(), 0, 'failed', 'エラー表示')
    const na = toggleNotApplicable(handled, 0, 'failed')
    expect(na.steps[0].failures?.failed).toEqual({ decision: 'notApplicable', text: 'エラー表示' })
    const back = toggleNotApplicable(na, 0, 'failed')
    expect(back.steps[0].failures?.failed).toEqual({ decision: 'handled', text: 'エラー表示' })
  })

  it('decision 無し・text だけの unknown（スキーマが許す部分状態。外部/Skill 作成ファイルで到達）は、failed スロットの編集や toggleNotApplicable で消えない', () => {
    const base = data()
    const withPartialUnknown: SequenceSchemaVersion1 = {
      ...base,
      steps: [
        { ...base.steps[0], failures: { unknown: { text: 'メモだけ（decision 無し）' } } },
        ...base.steps.slice(1),
      ],
    }

    const edited = setAnswerText(withPartialUnknown, 0, 'failed', 'エラー表示')
    expect(edited.steps[0].failures?.unknown).toEqual({ text: 'メモだけ（decision 無し）' })
    expect(edited.steps[0].failures?.failed).toEqual({ decision: 'handled', text: 'エラー表示' })

    const toggled = toggleNotApplicable(withPartialUnknown, 0, 'failed')
    expect(toggled.steps[0].failures?.unknown).toEqual({ text: 'メモだけ（decision 無し）' })
    expect(toggled.steps[0].failures?.failed).toEqual({ decision: 'notApplicable' })
  })

  it('コマンドは元データを破壊しない（非破壊性を構造操作でも確認）', () => {
    const d = data()
    const before = JSON.stringify(d)
    addStepAfter(d, 0)
    removeActor(d, 0)
    setAnswerText(d, 0, 'failed', 'x')
    setStepShape(d, 0, 'self')
    expect(JSON.stringify(d)).toBe(before)
  })
})
