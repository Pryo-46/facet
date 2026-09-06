import { describe, expect, it } from 'vitest'

// 足場確認用。テストランナーがグリーンで通ることだけを見る。
// 実装計画フェーズはこの「テストが通っている状態」を出発点にする。
describe('テストランナー', () => {
  it('動く', () => {
    expect(true).toBe(true)
  })
})
