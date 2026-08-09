import { describe, expect, it } from 'vitest'
import { ERROR_FIELDS } from './fields'
import { DEV_PROFILE, markdownFields, PROFILES, SUPPORT_PROFILE } from './profiles'

describe('プロファイル宣言', () => {
  it('サポート向けは仕様レベルの原因と備考を持たない', () => {
    expect(SUPPORT_PROFILE.fields).not.toContain('causeForSpec')
    expect(SUPPORT_PROFILE.fields).not.toContain('notes')
  })

  it('サポート向けもエンジニアの対応を持つ（何を依頼すべきかを書けるようにする）', () => {
    expect(SUPPORT_PROFILE.fields).toContain('engineerAction')
  })

  it('開発向けは全フィールドを宣言順のまま持つ', () => {
    expect([...DEV_PROFILE.fields]).toEqual([...ERROR_FIELDS])
  })

  it('サポート向けの列は開発向けの部分集合で、並びの前後が入れ替わらない', () => {
    const dev = [...DEV_PROFILE.fields]
    const support = [...SUPPORT_PROFILE.fields]
    for (const field of support) expect(dev).toContain(field)
    const positions = support.map((f) => dev.indexOf(f))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('id・label・fileSuffix が一意（書き出し名が衝突しない）', () => {
    expect(new Set(PROFILES.map((p) => p.id)).size).toBe(PROFILES.length)
    expect(new Set(PROFILES.map((p) => p.label)).size).toBe(PROFILES.length)
    expect(new Set(PROFILES.map((p) => p.fileSuffix)).size).toBe(PROFILES.length)
  })

  it('fileSuffix は label から導出しない（表示名と書き出し名は別の軸）', () => {
    expect(SUPPORT_PROFILE.fileSuffix).toBe('-サポート向け')
    expect(DEV_PROFILE.fileSuffix).toBe('-開発向け')
  })
})

describe('markdownFields', () => {
  it('resolutionLevel だけを落とし、他は宣言順のまま残す（グルーピング軸は h3 見出しになる）', () => {
    for (const profile of PROFILES) {
      const md = markdownFields(profile)
      expect(md).not.toContain('resolutionLevel')
      expect([...md]).toEqual(profile.fields.filter((f) => f !== 'resolutionLevel'))
    }
  })
})
