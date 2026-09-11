import { describe, expect, it } from 'vitest'
import { createSchemaValidator } from '@/core/schema-validation'
import { appRegistry } from '@/modules'
import { decisionTableModule } from './module'

const validate = createSchemaValidator(decisionTableModule.schema)

describe('decisionTableModule', () => {
  it('createEmpty はスキーマ検証を通る（雛形が壊れていたら新規作成が全滅する）', () => {
    const empty = decisionTableModule.createEmpty('新しい表')
    expect(validate(empty).ok).toBe(true)
    expect(decisionTableModule.checkConsistency(empty)).toEqual([])
  })

  it('createEmpty は条件も結果も持たない', () => {
    const empty = decisionTableModule.createEmpty('新しい表')
    expect(empty.conditions).toEqual([])
    expect(empty.outcomes).toEqual([])
    expect(empty.rows).toEqual([])
  })

  it('出力を持たない（額縁が書き出しボタンを押せなくする）', () => {
    expect(decisionTableModule.outputs).toEqual([])
  })

  it('表形式コピーもクリップボード交換も宣言しない', () => {
    expect(decisionTableModule.tableExport).toBeUndefined()
    expect(decisionTableModule.clipboardExchanges).toBeUndefined()
  })

  it('単一性を宣言しない（論点ごとに表を分ける）', () => {
    expect(decisionTableModule.singleton).toBe(false)
  })

  it('migrate は現行版に対して恒等', () => {
    const empty = decisionTableModule.createEmpty('t')
    expect(decisionTableModule.migrate(empty, 1)).toEqual(empty)
  })

  it('レジストリに登録されている', () => {
    expect(appRegistry.get('decisionTable')?.displayName).toBe('デシジョンテーブル')
  })

  it('ID プレフィクスが他のモジュールと衝突しない', () => {
    // createRegistry は重複を register の時点で投げる。ここでは引けることを見る
    expect(decisionTableModule.idPrefixes).toEqual(['cond', 'out'])
  })
})
