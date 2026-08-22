import { describe, expect, it } from 'vitest'
import { edgePath } from './edges'

describe('edgePath', () => {
  it('親の右辺の中央から子の左辺の中央へ引く', () => {
    const d = edgePath({ x: 0, y: 0, width: 100, height: 40 }, { x: 200, y: 100, width: 80, height: 20 })
    expect(d.startsWith('M 100 20 ')).toBe(true)
    expect(d.endsWith(' 200 110')).toBe(true)
  })

  it('列が近すぎても最低 16px は曲げる（直線に潰さない）', () => {
    // 張り出しが (x2 - x1) / 2 = 2 になる配置。16 に引き上がること
    const d = edgePath({ x: 0, y: 0, width: 100, height: 40 }, { x: 104, y: 0, width: 80, height: 40 })
    expect(d).toContain('C 116 20, 88 20,')
  })
})
