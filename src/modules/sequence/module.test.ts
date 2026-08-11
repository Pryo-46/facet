import { describe, expect, it } from 'vitest'
import { createSchemaValidator } from '@/core/schema-validation'
import { sequenceModule } from './module'

const validate = createSchemaValidator(sequenceModule.schema)

describe('sequenceModule', () => {
  it('createEmpty はスキーマ検証を通る（雛形が壊れていたら新規作成が全滅する）', () => {
    const empty = sequenceModule.createEmpty('新しいシーケンス')
    expect(validate(empty).ok).toBe(true)
    expect(sequenceModule.checkConsistency(empty)).toEqual([])
  })

  it('outputs は0本（額縁は出力ボタンを押せなくする）', () => {
    expect(sequenceModule.outputs).toEqual([])
  })

  it('migrate は現行版に対して恒等', () => {
    const empty = sequenceModule.createEmpty('t')
    expect(sequenceModule.migrate(empty, 1)).toEqual(empty)
  })
})
