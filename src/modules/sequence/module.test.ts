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

  it('createEmpty は参加者1人で作る（空状態のボタンを廃止したため）', () => {
    const empty = sequenceModule.createEmpty('新しいシーケンス')
    expect(empty.actors).toHaveLength(1)
    expect(empty.actors[0].name).toBe('')
    expect(empty.steps).toEqual([])
  })

  it('出力プロファイルは1本（図と表を1つの Markdown にまとめる）', () => {
    expect(sequenceModule.outputs).toHaveLength(1)
    expect(sequenceModule.outputs[0].id).toBe('default')
    expect(sequenceModule.outputs[0].fileSuffix).toBe('')
  })

  it('出力は h2 の見出し・Mermaid ブロック・表を含む', () => {
    const md = sequenceModule.outputs[0].toMarkdown({
      schemaVersion: 1,
      type: 'sequence',
      title: 'サンプル',
      actors: [
        { id: 'actor_Aaaaaaaaa1', name: '画面' },
        { id: 'actor_Aaaaaaaaa2', name: 'API' },
      ],
      steps: [
        { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Aaaaaaaaa2', label: '注文', awaitsReply: true },
      ],
    })
    expect(md).toContain('## サンプル')
    expect(md).toContain('```mermaid')
    expect(md).toContain('| No | from → to |')
  })

  it('describeIssueEffect を持つ（額縁の確認ダイアログが使う）', () => {
    expect(sequenceModule.outputs[0].describeIssueEffect).toBeTypeOf('function')
  })

  it('migrate は現行版に対して恒等', () => {
    const empty = sequenceModule.createEmpty('t')
    expect(sequenceModule.migrate(empty, 1)).toEqual(empty)
  })
})

describe('sequenceModule.imageOutputs', () => {
  it('「問いを含む」「問いを含めない」の2本を持つ', () => {
    expect(sequenceModule.imageOutputs.map((p) => p.id)).toEqual(['with-gutter', 'without-gutter'])
    expect(sequenceModule.imageOutputs[1].excludeRoles).toEqual(['gutter'])
    expect(sequenceModule.imageOutputs[0].excludeRoles).toBeUndefined()
  })
})
