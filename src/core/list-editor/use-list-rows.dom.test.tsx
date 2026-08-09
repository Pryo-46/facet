// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { cellId, useListRows } from './use-list-rows'

afterEach(cleanup)

interface Row {
  id: string
  name: string
}

let seq = 0

/** フックだけを載せた最小の表。列は name の1本 */
function Harness(props: { initial: Row[]; onEmptied?: () => void }) {
  const [items, setItems] = useState<Row[]>(props.initial)
  const rows = useListRows<Row>({
    items,
    onItemsChange: (next) => setItems(next),
    makeItem: () => ({ id: `row_${++seq}`, name: '新しい行' }),
    firstField: 'name',
    onEmptied: props.onEmptied,
  })
  return (
    <div ref={rows.containerRef}>
      {items.map((item, index) => (
        <div key={rows.rowKeys[index]}>
          {/* 値は controlled にする。production の CellInput も controlled で、
              行の同一性キー（rowKeys）が並び替えの前後で再利用されうる
              （ID 重複時は occurrence 順のため）以上、defaultValue の
              uncontrolled input だと React が値を更新しない場面がある */}
          <input
            aria-label={`name-${index}`}
            data-cell={cellId(rows.rowKeys[index], 'name')}
            value={item.name}
            onChange={() => {}}
          />
          <button type="button" aria-label={`insert-${index}`} onClick={() => rows.insertAfter(index)} />
          <button type="button" aria-label={`delete-${index}`} onClick={() => rows.deleteAt(index)} />
          <button type="button" aria-label={`up-${index}`} onClick={() => rows.moveBy(index, -1, 'name')} />
          <button type="button" aria-label={`down-${index}`} onClick={() => rows.moveBy(index, 1, 'name')} />
        </div>
      ))}
      <button type="button" ref={rows.addButtonRef} aria-label="add">
        追加
      </button>
    </div>
  )
}

const two = (): Row[] => [
  { id: 'row_a', name: 'A' },
  { id: 'row_b', name: 'B' },
]

function names(): string[] {
  return (screen.getAllByLabelText(/^name-/) as HTMLInputElement[]).map((el) => el.value)
}

describe('cellId', () => {
  it('行の鍵とフィールドを連結する', () => {
    expect(cellId('row_a#0', 'name')).toBe('row_a#0:name')
  })
})

describe('rowKeys', () => {
  it('ID が重複していても出現順で区別する', () => {
    render(<Harness initial={[{ id: 'dup', name: 'A' }, { id: 'dup', name: 'B' }]} />)
    const cells = screen.getAllByLabelText(/^name-/)
    expect(cells[0].getAttribute('data-cell')).toBe('dup#0:name')
    expect(cells[1].getAttribute('data-cell')).toBe('dup#1:name')
  })
})

describe('insertAfter', () => {
  it('直後に行が増え、新しい行の先頭セルへフォーカスが移り全選択される', () => {
    render(<Harness initial={two()} />)
    fireEvent.click(screen.getByLabelText('insert-0'))
    expect(names()).toEqual(['A', '新しい行', 'B'])
    const inserted = screen.getByLabelText('name-1') as HTMLInputElement
    expect(document.activeElement).toBe(inserted)
    // 既定値を打ち替えられるよう全選択する
    expect(inserted.selectionStart).toBe(0)
    expect(inserted.selectionEnd).toBe(inserted.value.length)
  })
})

describe('deleteAt', () => {
  it('削除後は同じ位置の行へフォーカスが移る', () => {
    render(<Harness initial={two()} />)
    fireEvent.click(screen.getByLabelText('delete-0'))
    expect(names()).toEqual(['B'])
    expect(document.activeElement).toBe(screen.getByLabelText('name-0'))
  })

  it('末尾を消したときは新しい末尾へ移る（body に落とさない）', () => {
    render(<Harness initial={two()} />)
    fireEvent.click(screen.getByLabelText('delete-1'))
    expect(names()).toEqual(['A'])
    expect(document.activeElement).toBe(screen.getByLabelText('name-0'))
  })

  it('0件になったら onEmptied を呼び、追加ボタンへフォーカスを逃がす', () => {
    const onEmptied = vi.fn()
    render(<Harness initial={[{ id: 'row_a', name: 'A' }]} onEmptied={onEmptied} />)
    fireEvent.click(screen.getByLabelText('delete-0'))
    expect(onEmptied).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(screen.getByLabelText('add'))
  })

  it('0件にならないときは onEmptied を呼ばない', () => {
    const onEmptied = vi.fn()
    render(<Harness initial={two()} onEmptied={onEmptied} />)
    fireEvent.click(screen.getByLabelText('delete-0'))
    expect(onEmptied).not.toHaveBeenCalled()
  })
})

describe('moveBy', () => {
  it('上へ移すと並びが入れ替わり、フォーカスが移動先の行に追従する', () => {
    render(<Harness initial={two()} />)
    fireEvent.click(screen.getByLabelText('up-1'))
    expect(names()).toEqual(['B', 'A'])
    // 動かした行（B）は今 0 番目にいる
    expect(document.activeElement).toBe(screen.getByLabelText('name-0'))
  })

  it('先頭で上、末尾で下は何も起きない（範囲外で壊れない）', () => {
    render(<Harness initial={two()} />)
    fireEvent.click(screen.getByLabelText('up-0'))
    expect(names()).toEqual(['A', 'B'])
    fireEvent.click(screen.getByLabelText('down-1'))
    expect(names()).toEqual(['A', 'B'])
  })

  it('ID が重複していても、移動後の配列から鍵を引き直して正しい行を追う', () => {
    render(<Harness initial={[{ id: 'dup', name: 'A' }, { id: 'dup', name: 'B' }]} />)
    fireEvent.click(screen.getByLabelText('down-0'))
    expect(names()).toEqual(['B', 'A'])
    // 動かした行（A）は今 1 番目。移動前の rowKeys[0]（dup#0）は別の行を指す
    expect(document.activeElement).toBe(screen.getByLabelText('name-1'))
  })
})
