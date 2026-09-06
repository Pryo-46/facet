import { describe, expect, it } from 'vitest'
import { buildClaudeArgs } from './claude-args'

describe('claude に渡す引数', () => {
  it('同梱プラグインを渡さないときは空になる', () => {
    expect(buildClaudeArgs(null)).toEqual([])
  })

  it('同梱プラグインのパスを --plugin-dir で渡す', () => {
    expect(buildClaudeArgs('C:\\app\\plugin')).toEqual(['--plugin-dir', 'C:\\app\\plugin'])
  })

  it('空文字は渡さない（パス解決に失敗した値でプラグインを読ませない）', () => {
    expect(buildClaudeArgs('')).toEqual([])
  })
})
