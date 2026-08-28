import { describe, expect, it } from 'vitest'
import { MIRO_MINDMAP_CF_HTML_BASE64 } from './miro.fixture'
import { decodeMiroClipboard } from './miro-codec'
import { miroPayloadToNodes, stripMiroText } from './miro-import'

function originalPayload(): unknown {
  return decodeMiroClipboard(Buffer.from(MIRO_MINDMAP_CF_HTML_BASE64, 'base64').toString('utf8'))
}

describe('stripMiroText', () => {
  it('p タグを剥がす', () => {
    expect(stripMiroText('<p>親ノード</p>')).toBe('親ノード')
  })
  it('段落が複数なら改行で繋ぐ', () => {
    expect(stripMiroText('<p>1行目</p><p>2行目</p>')).toBe('1行目\n2行目')
  })
  it('br も改行にする', () => {
    expect(stripMiroText('<p>上<br>下</p>')).toBe('上\n下')
    expect(stripMiroText('<p>上<br />下</p>')).toBe('上\n下')
  })
  it('装飾は捨てて中身だけ残す', () => {
    expect(stripMiroText('<p><b>太字</b>と<span style="color:red">色</span></p>')).toBe('太字と色')
  })
  it('エンティティを実体に戻す', () => {
    expect(stripMiroText('<p>A&amp;B &lt;C&gt; &quot;D&quot; &#39;E&#39; &nbsp;F</p>')).toBe(
      'A&B <C> "D" \'E\'  F',
    )
  })
  it('空の段落は空文字', () => {
    expect(stripMiroText('<p></p>')).toBe('')
  })
})

/** テスト用の Miro オブジェクトを組む最小のヘルパ */
function node(text: string, y: number) {
  return {
    widgetData: {
      json: { _position: { offsetPx: { x: 0, y } }, size: { width: 90, height: 34 }, text: `<p>${text}</p>` },
      type: 'text',
    },
    'ns:mindmap': { theme: 'colorBranch' },
  }
}
function line(from: number, to: number) {
  return {
    widgetData: {
      json: { primary: { widgetIndex: from }, secondary: { widgetIndex: to } },
      type: 'line',
    },
    'ns:mindmap': { mindmap: true },
  }
}
const payloadOf = (objects: unknown[]) => ({ data: { objects, meta: {} } })

describe('miroPayloadToNodes', () => {
  it('原本から木を復元する（親1・子3・孫2）', () => {
    const result = miroPayloadToNodes(originalPayload())
    if (!result.ok) throw new Error(`取り込めるはず: ${result.reason}`)
    const byText = new Map(result.nodes.map((n) => [n.text, n]))
    expect(result.nodes).toHaveLength(6)

    const root = byText.get('親ノード')
    if (root === undefined) throw new Error('親ノードが無い')
    expect(root.parentId).toBe(null)

    for (const text of ['子ノード１', '子ノード２', '子ノード３']) {
      expect(byText.get(text)?.parentId).toBe(root.id)
    }
    const child1 = byText.get('子ノード１')
    for (const text of ['孫ノード１', '孫ノード２']) {
      expect(byText.get(text)?.parentId).toBe(child1?.id)
    }
  })

  it('配列は DFS 行きがけ順、兄弟は y 座標の昇順で並ぶ', () => {
    const result = miroPayloadToNodes(originalPayload())
    if (!result.ok) throw new Error('取り込めるはず')
    // 原本の objects の並びは 親,子1,孫1,子2,子3,孫2（＝ボードで作った順）。
    // **それに引きずられず**、y 昇順の兄弟順で DFS した並びになること
    expect(result.nodes.map((n) => n.text)).toEqual([
      '親ノード',
      '子ノード１',
      '孫ノード１',
      '孫ノード２',
      '子ノード２',
      '子ノード３',
    ])
  })

  it('兄弟順はエッジの出現順ではなく y 座標で決まる', () => {
    // エッジは 下→上 の順に置き、y は 上→下。**y が勝つこと**を見る
    const objects = [
      node('親', 0), // 0
      node('下の子', 100), // 1
      node('上の子', -100), // 2
      line(0, 1),
      line(0, 2),
    ]
    const result = miroPayloadToNodes(payloadOf(objects))
    if (!result.ok) throw new Error('取り込めるはず')
    expect(result.nodes.map((n) => n.text)).toEqual(['親', '上の子', '下の子'])
  })

  it('ID は node_ 接頭の新規採番で、Miro の initialId を持ち込まない', () => {
    const result = miroPayloadToNodes(originalPayload())
    if (!result.ok) throw new Error('取り込めるはず')
    for (const n of result.nodes) expect(n.id).toMatch(/^node_[A-Za-z0-9]{10}$/)
    expect(new Set(result.nodes.map((n) => n.id)).size).toBe(result.nodes.length)
  })

  it('ns:mindmap を持たないオブジェクトは黙って捨てる（インデックスはずれない）', () => {
    const sticky = { widgetData: { json: { text: '<p>付箋</p>' }, type: 'text' } }
    // sticky を先頭と中間に挟み、line の widgetIndex（1 と 3）が指す位置は
    // 「フィルタ前」の配列位置のまま。先にフィルタしてから index を振り直す
    // バグを入れると、この widgetIndex がずれたノードを指してしまい親子関係が壊れる
    const objects = [sticky, node('親', 0), sticky, node('子', 10), line(1, 3)]
    const result = miroPayloadToNodes(payloadOf(objects))
    if (!result.ok) throw new Error('取り込めるはず')
    expect(result.nodes.map((n) => n.text)).toEqual(['親', '子'])
    expect(result.nodes[1].parentId).toBe(result.nodes[0].id)
  })

  it('同じ子に複数の親エッジが来たら最初の1本を採る', () => {
    const objects = [
      node('A', 0), // 0 ルート
      node('Parent1', 20), // 1 DFS では後に訪問される（y が大きい）
      node('Parent2', 10), // 2 DFS では先に訪問される（y が小さい）
      node('Child', 0), // 3
      line(0, 1), // A→Parent1
      line(0, 2), // A→Parent2
      line(1, 3), // Parent1→Child（先着。採用されるはず）
      line(2, 3), // Parent2→Child（後着。無視されるはず）
    ]
    const result = miroPayloadToNodes(payloadOf(objects))
    if (!result.ok) throw new Error('取り込めるはず')
    const byText = new Map(result.nodes.map((n) => [n.text, n]))
    // **DFS は y の小さい Parent2 を先に訪問するが、Child の親を決めるのは
    // エッジの処理順（先着）であって DFS の訪問順ではない。** ここが崩れていると
    // Child は（後から訪問される）Parent1 ではなく Parent2 の子になってしまう
    expect(byText.get('Child')?.parentId).toBe(byText.get('Parent1')?.id)
  })

  it('自己ループのエッジは無視する', () => {
    const objects = [
      node('A', 0), // 0 ルート
      node('B', 10), // 1
      node('C', 20), // 2
      line(0, 1), // A→B
      line(2, 2), // C の自己ループ（無視されるべき）
      line(0, 2), // A→C（自己ループの直後だが、無視されず採用されるべき）
    ]
    const result = miroPayloadToNodes(payloadOf(objects))
    if (!result.ok) throw new Error('取り込めるはず（自己ループが親子関係を汚染していないか）')
    const byText = new Map(result.nodes.map((n) => [n.text, n]))
    const a = byText.get('A')
    expect(byText.get('B')?.parentId).toBe(a?.id)
    expect(byText.get('C')?.parentId).toBe(a?.id)
    expect(result.nodes.map((n) => n.text)).toEqual(['A', 'B', 'C'])
  })

  it('ルートが2つ以上なら本数を添えて断る', () => {
    const objects = [node('木A', 0), node('木B', 10), node('木C', 20)]
    const result = miroPayloadToNodes(payloadOf(objects))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('断るはず')
    expect(result.reason).toContain('3')
    expect(result.reason).toContain('マインドマップ1つ分')
  })

  it('ノードが0個なら断る', () => {
    expect(miroPayloadToNodes(payloadOf([])).ok).toBe(false)
    const onlySticky = [{ widgetData: { json: { text: '<p>付箋</p>' }, type: 'text' } }]
    const result = miroPayloadToNodes(payloadOf(onlySticky))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('断るはず')
    expect(result.reason).toContain('マインドマップが見つかりません')
  })

  it('循環していたら断る', () => {
    // 2つのノードが互いを親にする（ルートが1つも無い）
    const objects = [node('A', 0), node('B', 10), line(0, 1), line(1, 0)]
    const result = miroPayloadToNodes(payloadOf(objects))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('断るはず')
    expect(result.reason).toContain('木の形になっていません')
  })

  it('Miro のデータの形をしていなければ断る', () => {
    expect(miroPayloadToNodes(null).ok).toBe(false)
    expect(miroPayloadToNodes({}).ok).toBe(false)
    expect(miroPayloadToNodes({ data: { objects: 'ちがう' } }).ok).toBe(false)
  })
})
