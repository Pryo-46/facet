// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Badge, badgeClass, BADGE_BOX_HEIGHT } from './Badge'

afterEach(cleanup)

describe('Badge', () => {
  it('文言をそのまま描く', () => {
    render(<Badge variant="open">未決</Badge>)
    expect(screen.getByText('未決')).not.toBeNull()
  })

  it('開いている語（open / hold / invalid / pending）は面を持たず、決着した語（yes / no）は面を持つ', () => {
    // 「開いているものは線、決着したものは面」（rev 9章 規約2）を部品の口で固定する
    for (const v of ['open', 'hold', 'invalid', 'pending'] as const) {
      expect(badgeClass(v), v).not.toMatch(/\bbg-/)
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
