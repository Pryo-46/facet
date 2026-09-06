import { describe, expect, it } from 'vitest'
import glossarySchema from '../../../schemas/glossary.schema.json'
import { KIND_LABELS, kindLabel } from './kind-labels'

describe('kindLabel', () => {
  it('スキーマの enum の全値に日本語ラベルがある', () => {
    // enum を拡張したらここが赤くなる（ラベルの足し忘れを機械的に検出する）
    for (const kind of glossarySchema.$defs.term.properties.kind.enum) {
      expect(KIND_LABELS[kind], `${kind} のラベルがありません`).toBeTruthy()
    }
  })

  it('undecided は Markdown 出力と同じ「未分類」', () => {
    expect(kindLabel('undecided')).toBe('未分類')
  })

  it('未知の値は生値のまま返す（未知 enum でクラッシュしない）', () => {
    expect(kindLabel('condition')).toBe('condition')
  })
})
