// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { LogicTreeEditor } from './LogicTreeEditor'

/**
 * Web フォントの読み込み後に測り直すことの検証。
 *
 * **`LogicTreeEditor.dom.test.tsx` とファイルを分けてある。** `vi.mock` は
 * ファイル先頭に巻き上げられてそのファイル全体に効くので、同居させると
 * 描画のテスト10本が偽の測定器で走ることになり、意味が変わってしまう
 *（`vi.doMock` ＋ 動的 import で1本だけ差し替える手もあるが、
 *  ファイルを分ける方が「どのテストが何を見ているか」が読んで分かる）。
 *
 * 観測点は**ノード矩形の style.width**。測定器が作り直されれば幅が変わるので、
 * 内部状態を露出させなくても DOM から見える
 */
const state = vi.hoisted(() => ({ calls: 0 }))

// createNodeMeasurer だけを「呼ばれるたびに太く測る」偽物に差し替える。
// readNodeFont / FALLBACK_NODE_FONT / sameFont は実物のまま——
// このテストが見たいのは「測定器が作り直されるか」だけである
vi.mock('./node-font', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./node-font')>()
  return {
    ...actual,
    createNodeMeasurer: () => {
      state.calls += 1
      const perChar = state.calls === 1 ? 10 : 20
      return (text: string) => text.length * perChar
    },
  }
})

/** 12文字。幅は 12×10+22=142px → 12×20+22=262px（22 は NODE_INSET_X×2） */
const TEXT = 'あいうえおかきくけこさし'

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
  it('document.fonts.ready の解決でノードの幅が測り直される', async () => {
    render(<LogicTreeEditor data={data} onChange={() => {}} issues={[]} modalOpen={false} />)
    const box = screen.getByLabelText('ノード1').parentElement
    expect(box?.style.width).toBe('142px')

    // **getComputedStyle が返す値は読み込みの前後で変わらない**ので、
    // フォントの同一性で判定していると測り直しは起きない。
    // 世代カウンタが測定器の鍵に入っていて初めてここが動く
    resolveFonts()
    await waitFor(() => {
      expect(box?.style.width).toBe('262px')
    })
    expect(state.calls).toBe(2)
  })
})
