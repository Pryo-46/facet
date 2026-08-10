import { describe, expect, it } from 'vitest'
import { poseQuestions, questionLabels } from './questions'

const call = (awaitsReply: boolean) =>
  ({ kind: 'call', awaitsReply }) as const

describe('poseQuestions', () => {
  it('応答を待つ呼出は3問すべて立つ', () => {
    expect(poseQuestions(call(true))).toEqual({ failed: true, unknown: true, ifExecuted: true })
  })
  it('投げっぱなしの呼出は unknown だけ立つ', () => {
    expect(poseQuestions(call(false))).toEqual({ failed: false, unknown: true, ifExecuted: false })
  })
  it('内部処理は failed だけ立つ', () => {
    expect(poseQuestions({ kind: 'self' })).toEqual({ failed: true, unknown: false, ifExecuted: false })
  })
  it('応答には問いが立たない', () => {
    expect(poseQuestions({ kind: 'reply' })).toEqual({ failed: false, unknown: false, ifExecuted: false })
  })
  it('awaitsReply 欠落（型上は起きないが外部データで起きうる）は true 扱い＝安全側', () => {
    expect(poseQuestions({ kind: 'call' })).toEqual({ failed: true, unknown: true, ifExecuted: true })
  })
})

describe('questionLabels', () => {
  it('文言はステップ種別で変わる（キーは同じ）', () => {
    expect(questionLabels(call(true)).unknown).toBe('結果不明だったら？')
    expect(questionLabels(call(false)).unknown).toBe('届かなかったかもしれない。それでよいか？')
    expect(questionLabels({ kind: 'self' }).failed).toBe('処理失敗したら？')
    expect(questionLabels(call(true)).failed).toBe('失敗が確定したら？')
    expect(questionLabels(call(true)).ifExecuted).toBe('実行済みだったら？')
  })
  it('reply には問いが立たない（すべて空文字）', () => {
    expect(questionLabels({ kind: 'reply' })).toEqual({ failed: '', unknown: '', ifExecuted: '' })
  })
  it('非活性キーは空文字（self）', () => {
    const labels = questionLabels({ kind: 'self' })
    expect(labels.unknown).toBe('')
    expect(labels.ifExecuted).toBe('')
  })
  it('非活性キーは空文字（call+awaitsReply:false）', () => {
    const labels = questionLabels(call(false))
    expect(labels.failed).toBe('')
    expect(labels.ifExecuted).toBe('')
  })
  it('活性キーはすべて非空（call+awaitsReply:true）', () => {
    const labels = questionLabels(call(true))
    expect(labels.failed).not.toBe('')
    expect(labels.unknown).not.toBe('')
    expect(labels.ifExecuted).not.toBe('')
  })
})
