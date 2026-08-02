import { describe, expect, it } from 'vitest'
import { createRegistry, type AnyToolModule } from './registry'

function fakeModule(type: string, prefixes: string[]): AnyToolModule {
  return {
    type,
    schemaVersion: 1,
    schema: {},
    idPrefixes: prefixes,
    Editor: () => null,
    migrate: (d) => d,
  }
}

describe('createRegistry', () => {
  it('登録したモジュールを type で引ける', () => {
    const registry = createRegistry()
    const mod = fakeModule('glossary', ['term'])
    registry.register(mod)
    expect(registry.get('glossary')).toBe(mod)
  })

  it('未知の type は undefined', () => {
    const registry = createRegistry()
    expect(registry.get('stateMachine')).toBeUndefined()
  })

  it('type の重複登録は例外', () => {
    const registry = createRegistry()
    registry.register(fakeModule('glossary', ['term']))
    expect(() => registry.register(fakeModule('glossary', ['word']))).toThrow()
  })

  it('ID プレフィクスの重複登録は例外（rev 5章の衝突防止）', () => {
    const registry = createRegistry()
    registry.register(fakeModule('glossary', ['term']))
    expect(() => registry.register(fakeModule('stateMachine', ['state', 'term']))).toThrow(
      /term/,
    )
  })
})
