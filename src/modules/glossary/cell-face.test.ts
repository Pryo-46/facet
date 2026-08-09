import { describe, expect, it } from 'vitest'
import type { ConsistencyIssue, ConsistencyLocation } from '@/core/consistency'
import { buildErrorMarks, cellFace, hasError } from './cell-face'

const loc = (entityId: string, entityIndex: number | null, field: string | null): ConsistencyLocation => ({
  entityId,
  entityIndex,
  field,
})

const issue = (locations: ConsistencyLocation[]): ConsistencyIssue => ({
  rule: 'test-rule',
  message: 'テスト用のメッセージ',
  locations,
})

describe('buildErrorMarks / hasError', () => {
  it('entityIndex で引き、entityId では引かない（ID 重複時に全行へ波及しない）', () => {
    // 'dup' という同じ entityId を持つ2行のうち、issue が指すのは index 0 だけ
    const marks = buildErrorMarks([issue([loc('dup', 0, 'name')])])
    expect(hasError(marks, 0, 'name')).toBe(true)
    // index 1 も同じ entityId 'dup' を持ちうるが、entityIndex が別なので波及しない
    expect(hasError(marks, 1, 'name')).toBe(false)
  })

  it('entityIndex が同じでも field が違えば別のセルだけがエラーになる', () => {
    const marks = buildErrorMarks([issue([loc('a', 0, 'name')])])
    expect(hasError(marks, 0, 'name')).toBe(true)
    expect(hasError(marks, 0, 'definition')).toBe(false)
  })

  it('field が null の location は、行の集合には入るがセルの鍵は増えない', () => {
    const marks = buildErrorMarks([issue([loc('a', 0, null)])])
    // 行（index 0）自体はマップに入る
    expect(marks.has(0)).toBe(true)
    // だがフィールド集合そのものは空——null が紛れ込んで鍵が増えていないこと
    expect(marks.get(0)?.size).toBe(0)
    // 特定のフィールドはどれもエラーにならない（'id' も含めて）
    expect(hasError(marks, 0, 'name')).toBe(false)
    expect(hasError(marks, 0, 'id')).toBe(false)
  })
})

describe('cellFace', () => {
  it('エラーが警告より優先する（同じセルが両方の条件を満たすとき error）', () => {
    const marks = buildErrorMarks([issue([loc('a', 0, 'kind')])])
    expect(cellFace(marks, 0, 'kind', true)).toBe('error')
  })

  it('エラーが無く warn=true のときは warn を返す', () => {
    const marks = buildErrorMarks([])
    expect(cellFace(marks, 0, 'kind', true)).toBe('warn')
  })

  it('エラーも警告も無ければ none を返す', () => {
    const marks = buildErrorMarks([])
    expect(cellFace(marks, 0, 'kind', false)).toBe('none')
  })

  it('行全体がエラー（id）のときは、フィールド個別のエラーより優先して none を返す（二重塗り防止）', () => {
    // ID 重複と名称重複が同時に起きた行を模す
    const marks = buildErrorMarks([issue([loc('a', 0, 'id'), loc('a', 0, 'name')])])
    expect(cellFace(marks, 0, 'name', false)).toBe('none')
  })

  it('行全体がエラーな行があっても、他の行のセルには影響しない', () => {
    const marks = buildErrorMarks([issue([loc('a', 0, 'id')])])
    expect(cellFace(marks, 1, 'name', true)).toBe('warn')
  })
})
