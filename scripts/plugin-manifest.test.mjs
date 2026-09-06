import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * プラグインの名前と版は2つのファイルが述べる。**食い違うと、install した
 * 人の手元だけで別の版が入る**——`claude plugin validate` は plugin.json しか
 * 見ないので、ズレはここでしか止まらない
 */
describe('プラグインのマニフェスト', () => {
  const plugin = JSON.parse(readFileSync('plugins/facet/.claude-plugin/plugin.json', 'utf8'))
  const market = JSON.parse(readFileSync('.claude-plugin/marketplace.json', 'utf8'))
  const entry = market.plugins.find((p) => p.name === plugin.name)

  it('marketplace が plugin.json と同じ名前の項目を持つ', () => {
    expect(entry).toBeDefined()
  })

  it('版が一致する', () => {
    expect(entry.version).toBe(plugin.version)
  })

  it('marketplace の source が実体を指す', () => {
    expect(entry.source).toBe('./plugins/facet')
  })
})
