import { describe, expect, it } from 'vitest'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { MIRO_MINDMAP_CF_HTML_BASE64 } from './miro.fixture'
import { miroMindmapExchange } from './miro'

const originalCfHtml = () =>
  Buffer.from(MIRO_MINDMAP_CF_HTML_BASE64, 'base64').toString('utf8')

const TREE: LogicTreeSchemaVersion1 = {
  schemaVersion: 1,
  type: 'logicTree',
  title: '往復テスト',
  nodes: [
    { id: 'node_aaaaaaaaaa', parentId: null, text: '親' },
    { id: 'node_bbbbbbbbbb', parentId: 'node_aaaaaaaaaa', text: '子1' },
    { id: 'node_cccccccccc', parentId: 'node_aaaaaaaaaa', text: '子2' },
    { id: 'node_dddddddddd', parentId: 'node_bbbbbbbbbb', text: '孫' },
  ],
}

describe('miroMindmapExchange', () => {
  it('id と label を持つ', () => {
    expect(miroMindmapExchange.id).toBe('miro-mindmap')
    expect(miroMindmapExchange.label).toBe('Miro のマインドマップ')
  })

  it('canImport は原本を受け入れ、無関係な HTML を弾く', () => {
    expect(miroMindmapExchange.canImport(originalCfHtml())).toBe(true)
    expect(miroMindmapExchange.canImport('<p>ただの貼り付け</p>')).toBe(false)
    expect(miroMindmapExchange.canImport('')).toBe(false)
  })

  it('fromClipboard は title を持つロジックツリーを返す', () => {
    const result = miroMindmapExchange.fromClipboard(originalCfHtml(), 'ロジックツリー2')
    if (!result.ok) throw new Error(`取り込めるはず: ${result.reason}`)
    expect(result.data.schemaVersion).toBe(1)
    expect(result.data.type).toBe('logicTree')
    expect(result.data.title).toBe('ロジックツリー2')
    expect(result.data.nodes).toHaveLength(6)
  })

  it('fromClipboard は Miro のデータでなければ理由を返す', () => {
    const result = miroMindmapExchange.fromClipboard('<p>ちがう</p>', 'x')
    expect(result.ok).toBe(false)
  })

  it('往復しても木の形と文言が保たれる', () => {
    const { html } = miroMindmapExchange.toClipboard(TREE)
    const back = miroMindmapExchange.fromClipboard(html, '往復テスト')
    if (!back.ok) throw new Error('往復できるはず')

    // ID は採番し直されるので、**形と文言で比べる**。
    // 復号側は DFS 行きがけ順で並び直る（miro-export.test.ts が言う「texts は DFS
    // 行きがけ順」と対になる仕様）ため、元の TREE の宣言順（レベル順）とは
    // 配列の並びが一致しない。並び自体は往復の保証対象ではないので、
    // text で安定ソートしてから比較する
    const shape = (data: LogicTreeSchemaVersion1) => {
      const byId = new Map(data.nodes.map((n) => [n.id, n]))
      return data.nodes
        .map((n) => ({
          text: n.text,
          parent: n.parentId === null ? null : (byId.get(n.parentId)?.text ?? '?'),
        }))
        .sort((a, b) => a.text.localeCompare(b.text))
    }
    expect(shape(back.data)).toEqual(shape(TREE))
  })

  it('toClipboard は html と text の両方を返す', () => {
    const { html, text } = miroMindmapExchange.toClipboard(TREE)
    expect(html).toContain('data-meta=')
    // text は他アプリに貼るためのもの。DFS 行きがけ順の文言を改行で連ねる
    expect(text).toBe('親\n子1\n孫\n子2')
  })
})
