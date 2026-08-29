// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { VisibleRows } from '@/core/table-export'
import { useVisibleIdsReport } from './use-visible-ids'

afterEach(cleanup)

/** フックだけを載せた最小のハーネス。ボタンで ids を差し替えて再レンダーを起こす */
function Harness(props: {
  ids: readonly string[] | null
  total: number
  onVisibleIds?: (ids: VisibleRows, total: number) => void
}) {
  const [ids, setIds] = useState<readonly string[] | null>(props.ids)
  useVisibleIdsReport(ids, props.total, props.onVisibleIds)
  return (
    <button
      type="button"
      // 呼び出し側と同じ内容だが**新しく確保した配列**を差し込む。
      // key（文字列）が同じなら effect が再実行されないことを確かめるため
      onClick={() => setIds(ids === null ? null : [...ids])}
    >
      再レンダー
    </button>
  )
}

describe('useVisibleIdsReport', () => {
  it('ids が null なら null と全件数を報告する', () => {
    const onVisibleIds = vi.fn()
    render(<Harness ids={null} total={5} onVisibleIds={onVisibleIds} />)
    expect(onVisibleIds).toHaveBeenLastCalledWith(null, 5)
  })

  it('ids が空でなければ、その ID だけを持つ Set を報告する', () => {
    const onVisibleIds = vi.fn()
    render(<Harness ids={['a', 'b']} total={3} onVisibleIds={onVisibleIds} />)
    const [reported, total] = onVisibleIds.mock.calls.at(-1)!
    expect(total).toBe(3)
    expect([...(reported as Set<string>)]).toEqual(['a', 'b'])
  })

  it('空の ids は空の Set を報告する（null にも、空文字1件の Set にもしない）', () => {
    const onVisibleIds = vi.fn()
    render(<Harness ids={[]} total={0} onVisibleIds={onVisibleIds} />)
    const [reported] = onVisibleIds.mock.calls.at(-1)!
    expect(reported).not.toBeNull()
    expect((reported as Set<string>).size).toBe(0)
  })

  it('内容が同じで新しく確保された配列に差し替えても、再度は呼ばれない', () => {
    const onVisibleIds = vi.fn()
    render(<Harness ids={['a', 'b']} total={2} onVisibleIds={onVisibleIds} />)
    expect(onVisibleIds).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '再レンダー' }))
    expect(onVisibleIds).toHaveBeenCalledTimes(1)
  })

  it('onVisibleIds を渡さなくても例外を投げない', () => {
    expect(() => render(<Harness ids={['a']} total={1} />)).not.toThrow()
  })
})
