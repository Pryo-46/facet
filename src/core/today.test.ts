import { describe, expect, it } from 'vitest'
import { todayString } from './today'

describe('todayString', () => {
  it('ローカル時刻の年月日を YYYY-MM-DD で返す', () => {
    // ローカル時刻のコンストラクタで作る（UTC ではない）。
    // **UTC で作ると、実行環境の時差しだいで前日・翌日になり、
    // テストがマシンの設定で色を変える**
    expect(todayString(new Date(2026, 7, 30, 23, 59, 59))).toBe('2026-08-30')
  })

  it('月と日を2桁に揃える', () => {
    expect(todayString(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(todayString(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('日付が変わる境目でローカルの日を返す（UTC へ寄せない）', () => {
    // 00:00 ちょうどはその日である。UTC 変換を挟むと東側の時間帯で前日に落ちる
    expect(todayString(new Date(2026, 7, 30, 0, 0, 0))).toBe('2026-08-30')
  })

  it('引数を省略すると「いま」を返す（既定値の注入）', () => {
    const now = new Date()
    expect(todayString()).toBe(todayString(now))
  })
})
