// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { LogicTreeEditor } from './LogicTreeEditor'
import { NODE_INSET_Y } from './measure'

/**
 * Web フォントの読み込み後に測り直すことの検証。
 *
 * **`LogicTreeEditor.dom.test.tsx` とファイルを分けてある。** `vi.mock` は
 * ファイル先頭に巻き上げられてそのファイル全体に効くので、同居させると
 * 描画のテスト10本が偽の測定器で走ることになり、意味が変わってしまう
 *（`vi.doMock` ＋ 動的 import で1本だけ差し替える手もあるが、
 *  ファイルを分ける方が「どのテストが何を見ているか」が読んで分かる）。
 *
 * **観測点はノード矩形の `style.height` である（M24 で幅から移した）。**
 * ノードの幅は M24 で固定（`NODE_WIDTH`）になったので、測定器を差し替えても
 * 動かない。**幅を観測点にしたままにすると、この番人は何も検証しなくなる**
 * ——高さは行数を通じてフォントに依存し続けるので、そちらへ移してある。
 * 「測定層と描画層が同一のフォントトークンを参照する」（rev 9章）が
 * 壊れたときに赤くなるのが、このテストの役目である
 */
const state = vi.hoisted(() => ({ calls: 0 }))

// createCanvasMeasurer だけを「呼ばれるたびに太く測る」偽物に差し替える。
// readCanvasFont / FALLBACK_CANVAS_FONT / sameFont は実物のまま——
// このテストが見たいのは「測定器が作り直されるか」だけである
vi.mock('@/core/canvas/canvas-font', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/canvas/canvas-font')>()
  return {
    ...actual,
    createCanvasMeasurer: () => {
      state.calls += 1
      const perChar = state.calls === 1 ? 10 : 20
      return (text: string) => text.length * perChar
    },
  }
})

/**
 * 20文字。**この長さは「倍化がちょうど行の境界をまたぐ」ように選んである。**
 *
 * 内容幅は 320 − `NODE_INSET_X`(11) × 2 ＝ 298px。文字数 L が1行に収まるのは
 * `L × perChar ≦ 298` のときなので、`perChar` 10 で1行・20 で2行になる L は
 * **15 以上 29 以下**。その中央付近の 20 を採った。
 *
 * **短くしないこと。** 12文字（M24 より前の値）では 12×20＝240 ≦ 298 で
 * 2回目も1行のままになり、高さが動かず、この番人が黙って死ぬ
 */
const TEXT = 'あいうえおかきくけこさしすせそたちつてと'

const data: LogicTreeSchemaVersion1 = {
  schemaVersion: 1,
  type: 'logicTree',
  title: 'テスト',
  nodes: [{ id: 'node_AAAAAAAAAA', parentId: null, text: TEXT }],
}

let resolveFonts: () => void

beforeEach(() => {
  // jsdom は document.fonts を持たない。effect が通る形を差し込む
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      ready: new Promise<void>((resolve) => {
        resolveFonts = resolve
      }),
    },
  })
})

afterEach(() => {
  cleanup()
  // **document は環境の共有物。差し込んだものは必ず外す**
  Reflect.deleteProperty(document, 'fonts')
  state.calls = 0
})

describe('LogicTreeEditor（Web フォントの読み込み後の測り直し）', () => {
  it('document.fonts.ready の解決でノードの高さが測り直される（1行 → 2行）', async () => {
    render(<LogicTreeEditor data={data} onChange={() => {}} issues={[]} modalOpen={false} />)
    const box = screen.getByLabelText('ノード1').parentElement
    const inset = NODE_INSET_Y * 2

    // **1行ぶんの高さを実測から取る。** `lineHeight` の値をリテラルで
    // 書かないのは、段（rev 9章）が変わったときに黙って取り残されないため
    const oneLine = Number.parseFloat(box?.style.height ?? '') - inset
    expect(oneLine).toBeGreaterThan(0)

    // **getComputedStyle が返す値は読み込みの前後で変わらない**ので、
    // フォントの同一性で判定していると測り直しは起きない。
    // 世代カウンタが測定器の鍵に入っていて初めてここが動く
    resolveFonts()
    await waitFor(() => {
      // ちょうど1行ぶん増えた＝太く測り直して折り返しが1つ増えた
      expect(Number.parseFloat(box?.style.height ?? '')).toBe(inset + oneLine * 2)
    })
    expect(state.calls).toBe(2)
  })
})
