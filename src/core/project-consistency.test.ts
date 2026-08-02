import { describe, expect, it } from 'vitest'
import type { ConsistencyIssue } from './consistency'
import { addIssue, checkProjectConsistency } from './project-consistency'
import { createRegistry, type AnyToolModule } from './registry'

function fakeModule(type: string, singleton: boolean): AnyToolModule {
  return {
    type,
    displayName: type === 'glossary' ? '用語集' : type,
    schemaVersion: 1,
    schema: {},
    idPrefixes: [type],
    Editor: () => null,
    checkConsistency: () => [],
    singleton,
    migrate: (d) => d,
  }
}

function makeRegistry() {
  const registry = createRegistry()
  registry.register(fakeModule('glossary', true))
  registry.register(fakeModule('sequence', false))
  return registry
}

describe('checkProjectConsistency', () => {
  it('singleton の type が1ファイルだけなら issue なし', () => {
    const out = checkProjectConsistency(
      [{ path: 'C:\\p\\glossary.json', type: 'glossary' }],
      makeRegistry(),
    )
    expect(out.size).toBe(0)
  })

  it('singleton の type が2ファイルあると両方に singleton-violation が付く', () => {
    const out = checkProjectConsistency(
      [
        { path: 'C:\\p\\a.json', type: 'glossary' },
        { path: 'C:\\p\\b.json', type: 'glossary' },
        { path: 'C:\\p\\seq.json', type: 'sequence' },
      ],
      makeRegistry(),
    )
    expect([...out.keys()].sort()).toEqual(['C:\\p\\a.json', 'C:\\p\\b.json'])
    const issue = out.get('C:\\p\\a.json')![0]
    expect(issue.rule).toBe('singleton-violation')
    expect(issue.message).toContain('用語集')
    expect(issue.message).toContain('2件')
    expect(issue.locations).toEqual([])
  })

  it('singleton でない type は複数あっても issue なし', () => {
    const out = checkProjectConsistency(
      [
        { path: 'C:\\p\\s1.json', type: 'sequence' },
        { path: 'C:\\p\\s2.json', type: 'sequence' },
      ],
      makeRegistry(),
    )
    expect(out.size).toBe(0)
  })

  it('未知の type と type null は対象外（クラッシュしない）', () => {
    const out = checkProjectConsistency(
      [
        { path: 'C:\\p\\x1.json', type: 'unknownTool' },
        { path: 'C:\\p\\x2.json', type: 'unknownTool' },
        { path: 'C:\\p\\plain.json', type: null },
      ],
      makeRegistry(),
    )
    expect(out.size).toBe(0)
  })

  it('同じファイルへの issue は上書きせず積み上げる', () => {
    const out = new Map<string, ConsistencyIssue[]>()
    addIssue(out, 'a.json', { rule: 'r1', message: 'one', locations: [] })
    addIssue(out, 'a.json', { rule: 'r2', message: 'two', locations: [] })
    expect(out.get('a.json')?.map((i) => i.rule)).toEqual(['r1', 'r2'])
  })
})
