import { describe, expect, it } from 'vitest'
import { PROFILE_COLUMNS } from './columns'
import { CAUSE_MIN_WIDTH } from './column-widths'
import { DEV_PROFILE, PROFILES, SUPPORT_PROFILE } from './profiles'

/** 1440px の窓からサイドバーと余白を引いた実効幅の目安（決定17） */
const EFFECTIVE_WIDTH = 1150

describe('PROFILE_COLUMNS', () => {
  it('画面の列は No ＋ プロファイルの fields', () => {
    for (const profile of PROFILES) {
      const fields = PROFILE_COLUMNS[profile.id].columns.map((c) => c.field)
      expect(fields).toEqual(['no', ...profile.fields])
    }
  })

  it('幅を持たない列は causeForSupport だけ（残り幅を吸収する列）', () => {
    for (const profile of PROFILES) {
      const flex = PROFILE_COLUMNS[profile.id].columns.filter((c) => c.defaultWidth === null)
      expect(flex.map((c) => c.field)).toEqual(['causeForSupport'])
    }
  })

  it('widthIndex は幅を持つ列に 0 からの連番、持たない列に null を返す', () => {
    for (const profile of PROFILES) {
      const cols = PROFILE_COLUMNS[profile.id]
      const assigned = cols.widthIndex.filter((w): w is number => w !== null)
      expect(assigned, profile.id).toEqual(assigned.map((_, i) => i))
      expect(cols.defaultWidths, profile.id).toHaveLength(assigned.length)
    }
  })

  it('causeForSupport の位置から nextWidthIndex を引くと右隣の列の幅添字が返る', () => {
    for (const profile of PROFILES) {
      const cols = PROFILE_COLUMNS[profile.id]
      const i = cols.columns.findIndex((c) => c.field === 'causeForSupport')
      const next = cols.nextWidthIndex(i)
      expect(next, profile.id).not.toBeNull()
      // 右隣（サポート向けでは userAction）の幅添字であること
      expect(next, profile.id).toBe(cols.widthIndex[i + 1])
    }
  })

  it('既定幅の合計は、実効幅から吸収列の最小幅を引いた残りに収まる（横スクロールを出さない）', () => {
    for (const profile of PROFILES) {
      const sum = PROFILE_COLUMNS[profile.id].defaultWidths.reduce((a, b) => a + b, 0)
      expect(sum + CAUSE_MIN_WIDTH, profile.id).toBeLessThan(EFFECTIVE_WIDTH)
    }
  })

  it('開発向けの散文列はサポート向けより狭い（列が2本多いぶんを吸収する）', () => {
    const widthOf = (id: 'support' | 'dev', field: string): number | null =>
      PROFILE_COLUMNS[id].columns.find((c) => c.field === field)?.defaultWidth ?? null
    expect(widthOf(DEV_PROFILE.id, 'userAction')).toBeLessThan(
      widthOf(SUPPORT_PROFILE.id, 'userAction') as number,
    )
  })
})
