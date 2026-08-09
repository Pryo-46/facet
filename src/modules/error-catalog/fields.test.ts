import { describe, expect, it } from 'vitest'
import errorCatalogSchema from '../../../schemas/error-catalog.schema.json'
import { ERROR_FIELDS, FIELD_LABELS } from './fields'

describe('ERROR_FIELDS', () => {
  it('スキーマの errorEntry のキーから id を除いたものと順序まで一致する', () => {
    // 列の足し忘れ・並びのずれを機械的に検出する。スキーマにフィールドを
    // 足したのにここへ足さないと、画面にも出力にも出ないまま静かに残る
    const keys = Object.keys(errorCatalogSchema.$defs.errorEntry.properties).filter(
      (k) => k !== 'id',
    )
    expect([...ERROR_FIELDS]).toEqual(keys)
  })

  it('全フィールドに日本語ラベルがある', () => {
    for (const field of ERROR_FIELDS) {
      expect(FIELD_LABELS[field], `${field} のラベルがありません`).toBeTruthy()
    }
  })

  it('2つの原因は画面上で見分けられるラベルを持つ（開発向けでは両方が並ぶ）', () => {
    expect(FIELD_LABELS.causeForSupport).not.toBe(FIELD_LABELS.causeForSpec)
  })
})
