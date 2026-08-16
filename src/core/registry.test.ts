import { describe, expect, it } from 'vitest'
import { createRegistry, type AnyToolModule } from './registry'

function fakeModule(type: string, prefixes: string[]): AnyToolModule {
  return {
    type,
    displayName: type,
    icon: () => null,
    schemaVersion: 1,
    schema: {},
    idPrefixes: prefixes,
    Editor: () => null,
    checkConsistency: () => [],
    outputs: [{ id: 'default', label: 'Markdown', fileSuffix: '', toMarkdown: () => '' }],
    imageOutputs: [],
    singleton: false,
    migrate: (d) => d,
    createEmpty: () => ({}),
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

  it('同一モジュール内の ID プレフィクス重複も例外', () => {
    const registry = createRegistry()
    expect(() => registry.register(fakeModule('glossary', ['term', 'term']))).toThrow(/term/)
  })
})

describe('list', () => {
  it('登録順に全モジュールを返す', () => {
    const registry = createRegistry()
    const a = fakeModule('a', ['a'])
    const b = fakeModule('b', ['b'])
    registry.register(a)
    registry.register(b)
    expect(registry.list().map((m) => m.type)).toEqual(['a', 'b'])
  })
})
