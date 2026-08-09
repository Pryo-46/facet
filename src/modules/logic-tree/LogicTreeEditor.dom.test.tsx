// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { LogicTreeEditor } from './LogicTreeEditor'

afterEach(cleanup)

const ID = (n: number): string => `node_${String(n).padStart(10, 'a')}`

const file = (spec: [number, number | null, string][]): LogicTreeSchemaVersion1 => ({
  schemaVersion: 1,
  type: 'logicTree',
  title: 'テスト',
  nodes: spec.map(([id, parent, text]) => ({
    id: ID(id),
    parentId: parent === null ? null : ID(parent),
    text,
  })),
})

/** 額縁と同じく、onChange を state に反映する殻を被せる */
function Harness({ initial }: { initial: LogicTreeSchemaVersion1 }) {
  const [data, setData] = useState(initial)
  return <LogicTreeEditor data={data} onChange={setData} issues={[]} modalOpen={false} />
}

describe('LogicTreeEditor（描画）', () => {
  it('ノードの文言を入力欄として出す', () => {
    render(<Harness initial={file([[1, null, '退会できない'], [2, 1, '導線が分からない']])} />)
    expect((screen.getByLabelText('ノード1') as HTMLTextAreaElement).value).toBe('退会できない')
    expect((screen.getByLabelText('ノード2') as HTMLTextAreaElement).value).toBe('導線が分からない')
  })

  it('文言を打つと onChange が呼ばれる', () => {
    const onChange = vi.fn()
    render(
      <LogicTreeEditor
        data={file([[1, null, '']])}
        onChange={onChange}
        issues={[]}
        modalOpen={false}
      />,
    )
    fireEvent.change(screen.getByLabelText('ノード1'), { target: { value: '退会できない' } })
    expect(onChange.mock.calls[0][0].nodes[0].text).toBe('退会できない')
    // 同じノードへの連続入力は1履歴にまとまってほしいのでキーを渡す
    expect(onChange.mock.calls[0][1]).toBe(`${ID(1)}#0:text`)
  })

  it('IME 変換中の入力は親へ上げない（未確定文字列の巻き戻りを防ぐ）', () => {
    const onChange = vi.fn()
    render(
      <LogicTreeEditor
        data={file([[1, null, '']])}
        onChange={onChange}
        issues={[]}
        modalOpen={false}
      />,
    )
    const el = screen.getByLabelText('ノード1')
    fireEvent.compositionStart(el)
    fireEvent.change(el, { target: { value: 'たいかい' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.compositionEnd(el, { target: { value: '退会' } })
    expect(onChange.mock.calls[0][0].nodes[0].text).toBe('退会')
  })

  it('空の状態では「クリックして開始」を出し、押すとルートができてフォーカスが乗る', () => {
    render(<Harness initial={file([])} />)
    fireEvent.click(screen.getByRole('button', { name: 'クリックして開始' }))
    const node = screen.getByLabelText('ノード1')
    expect(node).toBeDefined()
    expect(document.activeElement).toBe(node)
  })

  it('ノードがあるときは「クリックして開始」を出さない', () => {
    render(<Harness initial={file([[1, null, 'x']])} />)
    expect(screen.queryByRole('button', { name: 'クリックして開始' })).toBe(null)
  })

  it('整合性検証の指摘を画面に出す', () => {
    render(
      <LogicTreeEditor
        data={file([[1, null, 'x']])}
        onChange={() => {}}
        issues={[{ rule: 'multiple-root', message: 'ルートが2件あります', locations: [] }]}
        modalOpen={false}
      />,
    )
    expect(screen.getByText('ルートが2件あります')).toBeDefined()
  })

  it('循環しているノードは図に出さない（位置を持たないので落ちない）', () => {
    // 1 は正常なルート、2 と 3 が互いを親にしている
    render(
      <Harness
        initial={{
          schemaVersion: 1,
          type: 'logicTree',
          title: 'テスト',
          nodes: [
            { id: ID(1), parentId: null, text: 'a' },
            { id: ID(2), parentId: ID(3), text: 'b' },
            { id: ID(3), parentId: ID(2), text: 'c' },
          ],
        }}
      />,
    )
    expect(screen.getByLabelText('ノード1')).toBeDefined()
    expect(screen.queryByLabelText('ノード2')).toBe(null)
  })
})
