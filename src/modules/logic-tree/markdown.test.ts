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

  it('mermaid のエンティティ記法と衝突する # ; もエスケープする（共通の escapeMermaidLabel 経由）', () => {
    const risky: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [{ id: 'node_aaaaaaaaaa', parentId: null, text: '#1;対応' }],
    }
    const md = logicTreeToMarkdown(risky)
    expect(md).toContain('n1["#35;1#59;対応"]')
    // 箇条書き側は Markdown なのでエスケープしない
    expect(md).toContain('- #1;対応')
  })

  it('多重ルートで、子を持たない孤立ルートも図に単独の行として出す（他ノードと共存するとき図から消えていた欠陥の再現）', () => {
    const multiRoot: LogicTreeSchemaVersion1 = {
      schemaVersion: 1,
      type: 'logicTree',
      title: 'T',
      nodes: [
        { id: 'node_lonelyroot0', parentId: null, text: 'ひとりぼっち' },
        { id: 'node_root2xxxxx0', parentId: null, text: 'root2' },
        { id: 'node_childofroot0', parentId: 'node_root2xxxxx0', text: 'root2の子' },
      ],
    }
    const md = logicTreeToMarkdown(multiRoot)
    // 辺を持たない lonely-root は単独行として出る（消えてはいけない）
    expect(md).toContain('n1["ひとりぼっち"]')
    expect(md).toContain('n2["root2"] --> n3["root2の子"]')
    // 箇条書きには常に3件とも出ており、図と件数が食い違ってはいけない
    expect(md).toContain('- ひとりぼっち')
    expect(md).toContain('- root2')
    expect(md).toContain('- root2の子')
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

  it('改行を含む文言は図では空白に畳み、箇条書きでは <br> に変える', () => {
    const multiline: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [{ id: 'node_aaaaaaaaaa', parentId: null, text: '上\n下' }],
    }
    const md = logicTreeToMarkdown(multiline)
    // mermaid のラベルは1行でないと壊れる
    expect(md).toContain('n1["上 下"]')
    // 箇条書き側はそのまま出すと構造が壊れるので <br> に変える（表のセルと同じ扱い）
    expect(md).toContain('- 上<br>下')
  })

  it('箇条書きの改行をそのまま出すと Markdown の見出しが注入されうるので <br> にする', () => {
    // NodeBox.tsx の Shift+Enter や Miro の複数段落の取り込みで実際に生まれる値
    const injected: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [
        { id: 'node_aaaaaaaaaa', parentId: null, text: '親' },
        { id: 'node_bbbbbbbbbb', parentId: 'node_aaaaaaaaaa', text: '上\n## 注入された見出し\n孫のように見える行' },
      ],
    }
    const md = logicTreeToMarkdown(injected)
    expect(md).toContain('- 上<br>## 注入された見出し<br>孫のように見える行')
    // 改行をそのまま出していれば生まれていたはずの独立した見出し行が無い
    expect(md).not.toMatch(/^## 注入された見出し$/m)
  })
})
