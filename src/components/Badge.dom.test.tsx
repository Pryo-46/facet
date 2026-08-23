// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Badge } from './Badge'
import { badgeClass, BADGE_BOX_HEIGHT } from './badge-styles'

afterEach(cleanup)

describe('Badge', () => {
  it('文言をそのまま描く', () => {
    render(<Badge variant="open">未決</Badge>)
    expect(screen.getByText('未決')).not.toBeNull()
  })

  it('開いている語（open / hold / invalid / pending）は淡い面と線を持ち、決着した語（yes / no）は濃い面を持つ', () => {
    // 「開いているものは淡い面と線、決着したものは濃い面」（rev 9章 規約2。
    // M21 の実機確認で「線だけでは方眼と罫線に埋もれて拾えない」と判断されて
    // 淡い面を足した）を部品の口で固定する
    const pale = { open: 'missing', hold: 'missing', invalid: 'invalid', pending: 'pending' } as const
    for (const [v, axis] of Object.entries(pale) as [keyof typeof pale, string][]) {
      expect(badgeClass(v), v).toContain(`bg-${axis}-face`)
      expect(badgeClass(v), v).toContain(`border-${axis}`)
      // 濃い面（判断軸）は持たない。淡い面と濃い面は明度で分かれる
      expect(badgeClass(v), v).not.toMatch(/\bbg-judge-/)
    }
    expect(badgeClass('yes')).toMatch(/\bbg-judge-yes\b/)
    expect(badgeClass('no')).toMatch(/\bbg-judge-no\b/)
  })

  it('未決だけが破線', () => {
    expect(badgeClass('open')).toMatch(/\bborder-dashed\b/)
    for (const v of ['hold', 'invalid', 'pending', 'yes', 'no', 'deferred', 'faint'] as const) {
      expect(badgeClass(v), v).not.toMatch(/\bborder-dashed\b/)
    }
  })

  it('高さの定数がクラスと一致している（layout が読む値）', () => {
    expect(badgeClass('open')).toContain(`h-[${BADGE_BOX_HEIGHT}px]`)
  })
})
