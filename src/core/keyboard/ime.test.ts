import { describe, expect, it } from 'vitest'
import { COMPOSITION_TAIL_MS, isCompositionTail } from './ime'

describe('isCompositionTail', () => {
  it('直前に変換が終わっていなければ、ただのキー操作', () => {
    expect(isCompositionTail(1000, null)).toBe(false)
  })

  it('compositionend と同時刻の打鍵は確定の尾（WebKit は同じネイティブイベントから両方を投げる）', () => {
    expect(isCompositionTail(1000, 1000)).toBe(true)
  })

  it('窓の内側なら尾', () => {
    expect(isCompositionTail(1000 + COMPOSITION_TAIL_MS, 1000)).toBe(true)
  })

  it('窓を過ぎた打鍵は独立した操作（確定のあとに人が押し直した Enter）', () => {
    expect(isCompositionTail(1000 + COMPOSITION_TAIL_MS + 1, 1000)).toBe(false)
  })

  /**
   * WKWebView の実測（2026-08-15）では、compositionend の**後**に届いた
   * 確定の keydown の timeStamp が **20ms 古かった**——WebKit は keydown に
   * ネイティブイベント本来の時刻を、compositionend にはディスパッチ時刻を
   * 刻むため。**「後に届いたのだから時刻も後」と決めつけないこと**
   */
  it('compositionend より古い時刻の打鍵も窓の内側なら尾（実測 -20ms）', () => {
    expect(isCompositionTail(1000 - 20, 1000)).toBe(true)
  })

  it('前後どちらでも窓を出たら独立した操作', () => {
    expect(isCompositionTail(1000 - COMPOSITION_TAIL_MS - 1, 1000)).toBe(false)
  })

  it('窓は人が押し直すには短すぎる長さに留める（確定直後の Enter を握り潰さない）', () => {
    expect(COMPOSITION_TAIL_MS).toBeLessThanOrEqual(150)
  })
})
