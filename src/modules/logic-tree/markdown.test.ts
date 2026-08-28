import { describe, expect, it } from 'vitest'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { logicTreeToMarkdown } from './markdown'

const TREE: LogicTreeSchemaVersion1 = {
  schemaVersion: 1,
  type: 'logicTree',
  title: '売上の分解',
  nodes: [
    { id: 'node_aaaaaaaaaa', parentId: null, text: '売上が落ちた' },
    { id: 'node_bbbbbbbbbb', parentId: 'node_aaaaaaaaaa', text: '客数が減った' },
    { id: 'node_cccccccccc', parentId: 'node_bbbbbbbbbb', text: '新規が減った' },
    { id: 'node_dddddddddd', parentId: 'node_aaaaaaaaaa', text: '単価が下がった' },
  ],
}

describe('logicTreeToMarkdown', () => {
  it('h1 を使わず、title が h2', () => {
    const md = logicTreeToMarkdown(TREE)
    expect(md).toContain('## 売上の分解')
    expect(md).not.toMatch(/^# /m)
  })

  it('mermaid の flowchart を出す', () => {
    const md = logicTreeToMarkdown(TREE)
    expect(md).toContain('```mermaid')
    expect(md).toContain('flowchart LR')
    expect(md).toContain('n1["売上が落ちた"] --> n2["客数が減った"]')
    expect(md).toContain('n2["客数が減った"] --> n3["新規が減った"]')
    expect(md).toContain('n1["売上が落ちた"] --> n4["単価が下がった"]')
  })

  it('入れ子の箇条書きを出す', () => {
    const md = logicTreeToMarkdown(TREE)
    expect(md).toContain('- 売上が落ちた\n  - 客数が減った\n    - 新規が減った\n  - 単価が下がった')
  })

  it('空文言は（未定義）', () => {
    const withEmpty: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [
        { id: 'node_aaaaaaaaaa', parentId: null, text: '' },
        { id: 'node_bbbbbbbbbb', parentId: 'node_aaaaaaaaaa', text: '子' },
      ],
    }
    const md = logicTreeToMarkdown(withEmpty)
    expect(md).toContain('- （未定義）')
    expect(md).toContain('n1["（未定義）"]')
  })

  it('mermaid と衝突する文字をエスケープする', () => {
    const risky: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [{ id: 'node_aaaaaaaaaa', parentId: null, text: 'A["B"] と C' }],
    }
    const md = logicTreeToMarkdown(risky)
    // " は実体参照へ、[ ] は全角へ逃がす（生のまま出すとラベルのパースが壊れる）
    expect(md).toContain('n1["A［&quot;B&quot;］ と C"]')
    // 箇条書き側は Markdown なのでエスケープしない
    expect(md).toContain('- A["B"] と C')
  })

  it('ノードが1つでも図と箇条書きの両方を出す', () => {
    const single: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [{ id: 'node_aaaaaaaaaa', parentId: null, text: 'ひとつだけ' }],
    }
    const md = logicTreeToMarkdown(single)
    expect(md).toContain('flowchart LR')
    expect(md).toContain('n1["ひとつだけ"]')
    expect(md).toContain('- ひとつだけ')
  })

  it('改行を含む文言は図では空白に畳み、箇条書きでは残す', () => {
    const multiline: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [{ id: 'node_aaaaaaaaaa', parentId: null, text: '上\n下' }],
    }
    const md = logicTreeToMarkdown(multiline)
    // mermaid のラベルは1行でないと壊れる
    expect(md).toContain('n1["上 下"]')
  })
})
