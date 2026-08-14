import { describe, expect, it } from 'vitest'
import { formatHintKeys } from './hint-text'

describe('formatHintKeys', () => {
  it('$mod は Windows/Linux で Ctrl になる', () => {
    expect(formatHintKeys('$mod+Enter', 'other')).toBe('Ctrl+Enter')
  })

  it('$mod は macOS で Cmd になる', () => {
    expect(formatHintKeys('$mod+Enter', 'mac')).toBe('Cmd+Enter')
  })

  it('$alt は Windows/Linux で Alt、macOS で Option になる', () => {
    expect(formatHintKeys('$alt+↑↓', 'other')).toBe('Alt+↑↓')
    expect(formatHintKeys('$alt+↑↓', 'mac')).toBe('Option+↑↓')
  })

  it('プレースホルダが複数あっても全部置き換える', () => {
    expect(formatHintKeys('$mod+$alt+A', 'mac')).toBe('Cmd+Option+A')
  })

  it('プレースホルダが無ければそのまま返す', () => {
    expect(formatHintKeys('Tab', 'mac')).toBe('Tab')
  })
})
