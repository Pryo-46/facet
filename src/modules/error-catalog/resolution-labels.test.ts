import { describe, expect, it } from 'vitest'
import errorCatalogSchema from '../../../schemas/error-catalog.schema.json'
import { RESOLUTION_LABELS, resolutionLabel } from './resolution-labels'

describe('resolutionLabel', () => {
  it('スキーマの enum の全値に日本語ラベルがある', () => {
    // enum を拡張したらここが赤くなる（ラベルの足し忘れを機械的に検出する）
    for (const level of errorCatalogSchema.$defs.errorEntry.properties.resolutionLevel.enum) {
      expect(RESOLUTION_LABELS[level], `${level} のラベルがありません`).toBeTruthy()
    }
  })

  it('undecided は用語集の出力と同じ「未分類」', () => {
    expect(resolutionLabel('undecided')).toBe('未分類')
  })

  it('未知の値は生値のまま返す（未知 enum でクラッシュしない）', () => {
    expect(resolutionLabel('escalated')).toBe('escalated')
  })
})
