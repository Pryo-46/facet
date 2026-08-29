import { describe, expect, it } from 'vitest'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { nodesToMiroPayload } from './miro-export'

/**  親 ─┬─ 枝A ─┬─ 枝Aの子1
 *       │       └─ 枝Aの子2
 *       └─ ずいぶん長い文言のノード                */
const TREE: LogicTreeSchemaVersion1 = {
  schemaVersion: 1,
  type: 'logicTree',
  title: 'テスト',
  nodes: [
    { id: 'node_aaaaaaaaaa', parentId: null, text: '親' },
    { id: 'node_bbbbbbbbbb', parentId: 'node_aaaaaaaaaa', text: '枝A' },
    { id: 'node_cccccccccc', parentId: 'node_bbbbbbbbbb', text: '枝Aの子1' },
    { id: 'node_dddddddddd', parentId: 'node_bbbbbbbbbb', text: '枝Aの子2' },
    { id: 'node_eeeeeeeeee', parentId: 'node_aaaaaaaaaa', text: 'ずいぶん長い文言のノード' },
  ],
}

/**
 * payload から objects を取り出す最小限の形。中身は widgetData.type 以外
 * 見ないので unknown のまま扱い、各テストで必要な形へその場でキャストする
 *（ブリーフの `Record<string, never>[]` は tsc が通らないための書き換え。
 *  意図——本数・親子・幅揃え・座標・style の値・決定性の検証——は変えていない）
 */
interface MiroObjectShape {
  widgetData: { type: string }
}

function objectsOf(payload: unknown): unknown[] {
  return (payload as { data: { objects: unknown[] } }).data.objects
}
function textWidgets(payload: unknown): unknown[] {
  return objectsOf(payload).filter((o) => (o as MiroObjectShape).widgetData.type === 'text')
}
function lineWidgets(payload: unknown): unknown[] {
  return objectsOf(payload).filter((o) => (o as MiroObjectShape).widgetData.type === 'line')
}

describe('nodesToMiroPayload', () => {
  it('ノードとエッジの本数が合う（N ノードなら N-1 エッジ）', () => {
    const { payload } = nodesToMiroPayload(TREE)
    expect(textWidgets(payload)).toHaveLength(5)
    expect(lineWidgets(payload)).toHaveLength(4)
  })

  it('エッジは親→子を指す', () => {
    const { payload } = nodesToMiroPayload(TREE)
    const texts = textWidgets(payload) as unknown as { widgetData: { json: { text: string } } }[]
    const labelAt = (i: number) => texts[i].widgetData.json.text
    const lines = lineWidgets(payload) as unknown as {
      widgetData: { json: { primary: { widgetIndex: number }; secondary: { widgetIndex: number } } }
    }[]
    const pairs = lines.map((l) => [
      labelAt(l.widgetData.json.primary.widgetIndex),
      labelAt(l.widgetData.json.secondary.widgetIndex),
    ])
    expect(pairs).toContainEqual(['<p>親</p>', '<p>枝A</p>'])
    expect(pairs).toContainEqual(['<p>枝A</p>', '<p>枝Aの子1</p>'])
    expect(pairs).toContainEqual(['<p>枝A</p>', '<p>枝Aの子2</p>'])
    expect(pairs).toContainEqual(['<p>親</p>', '<p>ずいぶん長い文言のノード</p>'])
  })

  it('同じ深さのノードは幅が揃う（列内の最大に合わせる）', () => {
    const { payload } = nodesToMiroPayload(TREE)
    const texts = textWidgets(payload) as unknown as {
      widgetData: { json: { text: string; size: { width: number } } }
    }[]
    const widthOf = (label: string) =>
      texts.find((t) => t.widgetData.json.text === `<p>${label}</p>`)?.widgetData.json.size.width
    // 深さ1 は「枝A」と「ずいぶん長い文言のノード」。長い方に揃う
    expect(widthOf('枝A')).toBe(widthOf('ずいぶん長い文言のノード'))
    // 深さ2 は別の列なので、深さ1 とは違ってよい
    expect(widthOf('枝Aの子1')).toBe(widthOf('枝Aの子2'))
  })

  it('兄弟は y 座標が上から順に並び、親は子の中央に来る', () => {
    const { payload } = nodesToMiroPayload(TREE)
    const texts = textWidgets(payload) as unknown as {
      widgetData: { json: { text: string; _position: { offsetPx: { x: number; y: number } } } }
    }[]
    const at = (label: string) =>
      texts.find((t) => t.widgetData.json.text === `<p>${label}</p>`)!.widgetData.json._position.offsetPx
    expect(at('枝Aの子1').y).toBeLessThan(at('枝Aの子2').y)
    expect(at('枝A').y).toBeLessThan(at('ずいぶん長い文言のノード').y)
    // 親は枝Aと長い文言の間
    expect(at('親').y).toBeGreaterThan(at('枝A').y)
    expect(at('親').y).toBeLessThan(at('ずいぶん長い文言のノード').y)
    // 深さが進むと x が増える
    expect(at('親').x).toBeLessThan(at('枝A').x)
    expect(at('枝A').x).toBeLessThan(at('枝Aの子1').x)
  })

  it('見た目の値が仕様どおり（角あり枠・黒・中央寄せ・autoLayout true）', () => {
    const { payload } = nodesToMiroPayload(TREE)
    const first = textWidgets(payload)[0] as unknown as {
      widgetData: { json: { style: string } }
      'ns:mindmap': { autoLayout: boolean }
    }
    const style = JSON.parse(first.widgetData.json.style)
    expect(style.st).toBe(28)
    expect(style.brc).toBe(1710618)
    expect(style.tc).toBe(1710618)
    expect(style.bro).toBe(1)
    expect(style.bc).toBe(-1)
    expect(style.ta).toBe('c')
    expect(first['ns:mindmap'].autoLayout).toBe(true)

    const line = lineWidgets(payload)[0] as unknown as { widgetData: { json: { style: string } } }
    expect(JSON.parse(line.widgetData.json.style).lc).toBe(1710618)
  })

  it('毎回同じ結果になる（固定値だけを使い、乱数も時刻も混ぜない）', () => {
    const a = JSON.stringify(nodesToMiroPayload(TREE).payload)
    const b = JSON.stringify(nodesToMiroPayload(TREE).payload)
    expect(a).toBe(b)
  })

  it('texts は Miro に渡す表示用の並び（DFS 行きがけ順）', () => {
    const { texts } = nodesToMiroPayload(TREE)
    expect(texts).toEqual(['親', '枝A', '枝Aの子1', '枝Aの子2', 'ずいぶん長い文言のノード'])
  })

  it('空文言のノードも落とさずに出す', () => {
    const withEmpty: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [
        { id: 'node_aaaaaaaaaa', parentId: null, text: '親' },
        { id: 'node_bbbbbbbbbb', parentId: 'node_aaaaaaaaaa', text: '' },
      ],
    }
    expect(textWidgets(nodesToMiroPayload(withEmpty).payload)).toHaveLength(2)
  })

  it('HTML として危険な文字をエスケープする', () => {
    const risky: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [{ id: 'node_aaaaaaaaaa', parentId: null, text: 'A & B <script>' }],
    }
    const { payload, texts } = nodesToMiroPayload(risky)
    const first = textWidgets(payload)[0] as unknown as { widgetData: { json: { text: string } } }
    expect(first.widgetData.json.text).toBe('<p>A &amp; B &lt;script&gt;</p>')
    // div 側（表示用）も同じくエスケープされていること
    expect(texts[0]).toBe('A &amp; B &lt;script&gt;')
  })

  it('plainTexts は texts と同じ並びで、エスケープしない生の文言を返す', () => {
    const risky: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [{ id: 'node_aaaaaaaaaa', parentId: null, text: 'A & B <script>' }],
    }
    const { texts, plainTexts } = nodesToMiroPayload(risky)
    // texts（HTML 用）はエスケープ済み、plainTexts（プレーンテキスト用）は生のまま
    expect(texts[0]).toBe('A &amp; B &lt;script&gt;')
    expect(plainTexts[0]).toBe('A & B <script>')
    // DFS 行きがけ順は共通（並びが構造的に一致する）
    expect(nodesToMiroPayload(TREE).plainTexts).toEqual([
      '親',
      '枝A',
      '枝Aの子1',
      '枝Aの子2',
      'ずいぶん長い文言のノード',
    ])
  })
})
