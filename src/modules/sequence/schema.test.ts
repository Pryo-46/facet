import { describe, expect, it } from 'vitest'
import { createSchemaValidator } from '@/core/schema-validation'
import sequenceSchema from '../../../schemas/sequence.schema.json'
import type { JsonSchema } from '@/core/canonical'

const schema = sequenceSchema as JsonSchema
const validate = createSchemaValidator(schema)

/** 全フィールドが埋まった正常データ。各テストはここから1点だけ崩す */
function valid() {
  return {
    schemaVersion: 1,
    type: 'sequence',
    title: '注文確定',
    actors: [
      { id: 'actor_Aaaaaaaaa1', name: '画面' },
      { id: 'actor_Aaaaaaaaa2', name: 'API' },
    ],
    steps: [
      {
        id: 'step_Aaaaaaaaa1',
        kind: 'call',
        from: 'actor_Aaaaaaaaa1',
        to: 'actor_Aaaaaaaaa2',
        label: '注文を確定',
        awaitsReply: true,
        failures: {
          failed: { decision: 'handled', text: '入力エラーを表示' },
          unknown: {
            decision: 'handled',
            text: 'リトライする',
            ifExecuted: { decision: 'notApplicable' },
          },
        },
      },
      { id: 'step_Aaaaaaaaa2', kind: 'reply', from: 'actor_Aaaaaaaaa2', to: 'actor_Aaaaaaaaa1', label: '注文番号' },
      { id: 'step_Aaaaaaaaa3', kind: 'self', from: 'actor_Aaaaaaaaa2', label: '在庫を引当' },
    ],
  }
}

describe('sequence スキーマ（レベル1）', () => {
  it('正常データを受け入れる', () => {
    expect(validate(valid()).ok).toBe(true)
  })

  it('to / awaitsReply / failures の省略を受け入れる', () => {
    const d = valid()
    // self は to を持たない。reply は awaitsReply を持たない。failures 未回答は欠落
    expect(validate(d).ok).toBe(true)
  })

  // 責任境界（domain）は廃止した属性である。図にも出力にも問いの導出にも
  // 関与しないまま残っていたため消した。additionalProperties: false が
  // 効いている＝「消した」が意図であることを、ここで固定する
  it('廃止した domain を持つアクターを拒否する', () => {
    const d = valid()
    ;(d.actors[0] as Record<string, unknown>).domain = '自社'
    expect(validate(d).ok).toBe(false)
  })

  it('ID のプレフィクス違いを拒否する', () => {
    const d = valid()
    d.steps[0].id = 'node_Aaaaaaaaa1'
    expect(validate(d).ok).toBe(false)
  })

  it('ID が11文字だと拒否する（長すぎる方向）', () => {
    const d = valid()
    d.actors[0].id = 'actor_Aaaaaaaaa12'
    expect(validate(d).ok).toBe(false)
  })

  it('ID が9文字だと拒否する（短すぎる方向）', () => {
    const d = valid()
    d.actors[0].id = 'actor_Aaaaaaaa1'
    expect(validate(d).ok).toBe(false)
  })

  it('kind の未知値を拒否する', () => {
    const d = valid()
    ;(d.steps[0] as { kind: string }).kind = 'async'
    expect(validate(d).ok).toBe(false)
  })

  it('call なのに awaitsReply が無いと拒否する', () => {
    const d = valid()
    delete (d.steps[0] as Record<string, unknown>).awaitsReply
    expect(validate(d).ok).toBe(false)
  })

  it('reply に awaitsReply があると拒否する', () => {
    const d = valid()
    ;(d.steps[1] as Record<string, unknown>).awaitsReply = true
    expect(validate(d).ok).toBe(false)
  })

  it('self に awaitsReply があると拒否する', () => {
    const d = valid()
    ;(d.steps[2] as Record<string, unknown>).awaitsReply = false
    expect(validate(d).ok).toBe(false)
  })

  it('self に to があってもレベル1では受け入れる（レベル2の担当）', () => {
    const d = valid()
    ;(d.steps[2] as Record<string, unknown>).to = 'actor_Aaaaaaaaa1'
    expect(validate(d).ok).toBe(true)
  })

  it('call に to が無くてもレベル1では受け入れる（レベル2の担当）', () => {
    const d = valid()
    delete (d.steps[0] as Record<string, unknown>).to
    expect(validate(d).ok).toBe(true)
  })

  it('handled なのに text が無いと拒否する', () => {
    const d = valid()
    ;(d.steps[0].failures as Record<string, unknown>).failed = { decision: 'handled' }
    expect(validate(d).ok).toBe(false)
  })

  it('notApplicable は text 無しでよい', () => {
    const d = valid()
    ;(d.steps[0].failures as Record<string, unknown>).failed = { decision: 'notApplicable' }
    expect(validate(d).ok).toBe(true)
  })

  it('unknown は decision 無しで ifExecuted だけ持てる（部分回答）', () => {
    const d = valid()
    ;(d.steps[0].failures as Record<string, unknown>).unknown = {
      ifExecuted: { decision: 'handled', text: '取引IDで冪等' },
    }
    expect(validate(d).ok).toBe(true)
  })

  it('failures の未知キーを拒否する（類型はスキーマ固定）', () => {
    const d = valid()
    ;(d.steps[0].failures as Record<string, unknown>).timeout = { decision: 'handled', text: 'x' }
    expect(validate(d).ok).toBe(false)
  })

  it('reply の failures はレベル1では受け入れる（立っていない問いはレベル2の担当）', () => {
    const d = valid()
    ;(d.steps[1] as Record<string, unknown>).failures = {
      failed: { decision: 'handled', text: 'x' },
    }
    expect(validate(d).ok).toBe(true)
  })

  it('トップレベルの未知キーを拒否する', () => {
    const d = valid() as Record<string, unknown>
    d.zones = []
    expect(validate(d).ok).toBe(false)
  })

  it('handled なのに text が空文字だと拒否する', () => {
    const d = valid()
    ;(d.steps[0].failures as Record<string, unknown>).failed = { decision: 'handled', text: '' }
    expect(validate(d).ok).toBe(false)
  })

  // ---- 変異耐性の宿題 ----
  // 未知キーの拒否はトップレベルと failures マップだけ検査済みだった。
  // 入れ子の additionalProperties: false を1段ずつ固定する

  it('actors の項目の未知キーを拒否する', () => {
    const d = valid()
    ;(d.actors[0] as Record<string, unknown>).color = 'red'
    expect(validate(d).ok).toBe(false)
  })

  it('steps の項目の未知キーを拒否する', () => {
    const d = valid()
    ;(d.steps[0] as Record<string, unknown>).note = 'x'
    expect(validate(d).ok).toBe(false)
  })

  it('answerSlot の未知キーを拒否する', () => {
    const d = valid()
    ;(d.steps[0].failures as Record<string, unknown>).failed = {
      decision: 'handled',
      text: 'x',
      reason: 'y',
    }
    expect(validate(d).ok).toBe(false)
  })

  it('unknownSlot の未知キーを拒否する', () => {
    const d = valid()
    ;(d.steps[0].failures as Record<string, unknown>).unknown = {
      decision: 'handled',
      text: 'x',
      retries: 3,
    }
    expect(validate(d).ok).toBe(false)
  })

  it('unknownSlot の decision の未知値を拒否する', () => {
    // answerSlot は decision が const の oneOf、unknownSlot だけが enum。
    // enum を広げる変異はここでしか捕まらない
    const d = valid()
    ;(d.steps[0].failures as Record<string, unknown>).unknown = { decision: 'maybe', text: 'x' }
    expect(validate(d).ok).toBe(false)
  })

  it('schemaVersion の const 違反を拒否する', () => {
    const d = valid()
    ;(d as Record<string, unknown>).schemaVersion = 2
    expect(validate(d).ok).toBe(false)
  })

  it('type の const 違反を拒否する', () => {
    const d = valid()
    ;(d as Record<string, unknown>).type = 'glossary'
    expect(validate(d).ok).toBe(false)
  })

  it('from のパターン違反を拒否する（actor_ 以外のプレフィクス）', () => {
    const d = valid()
    d.steps[0].from = 'step_Aaaaaaaaa1'
    expect(validate(d).ok).toBe(false)
  })

  it('to のパターン違反を拒否する（10文字に満たない）', () => {
    // steps は3種の形の union に推論され、self には to が無いのでキャストして代入する
    //（既存テストの delete (d.steps[0] as Record<string, unknown>).to と同じ理由）
    const d = valid()
    ;(d.steps[0] as Record<string, unknown>).to = 'actor_Aaaaaaaa1'
    expect(validate(d).ok).toBe(false)
  })
})
