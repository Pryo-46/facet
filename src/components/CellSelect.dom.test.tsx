// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CellSelect } from './CellSelect'

afterEach(cleanup)

const OPTIONS = ['screen', 'data', 'undecided'] as const
const LABELS: Record<string, string> = { screen: '画面', data: 'データ', undecided: '未分類' }

function renderSelect(value: string) {
  const onPick = vi.fn()
  const onKeyDown = vi.fn()
  render(
    <CellSelect
      value={value}
      options={OPTIONS}
      labelOf={(v) => LABELS[v] ?? v}
      onPick={onPick}
      aria-label="種別（1行目）"
      data-cell="row1:kind"
      className="w-full"
      onKeyDown={onKeyDown}
    />,
  )
  return { onPick, onKeyDown, trigger: screen.getByRole('button', { name: '種別（1行目）' }) }
}

describe('CellSelect', () => {
  it('トリガーは現在値のラベルと data-cell を持つ', () => {
    const { trigger } = renderSelect('screen')
    expect(trigger.textContent).toBe('画面')
    expect(trigger.getAttribute('data-cell')).toBe('row1:kind')
  })

  it('閉じたまま ↓ で次の値、↑ で前の値。メニューは開かない', () => {
    const { onPick, trigger } = renderSelect('data')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(onPick).toHaveBeenLastCalledWith('undecided')
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    expect(onPick).toHaveBeenLastCalledWith('screen')
    expect(screen.queryByRole('menuitemradio')).toBeNull()
  })

  it('端で止まる（ネイティブ select と同じ。循環しない）', () => {
    const first = renderSelect('screen')
    fireEvent.keyDown(first.trigger, { key: 'ArrowUp' })
    expect(first.onPick).not.toHaveBeenCalled()
    expect(first.trigger.textContent).toBe('画面')

    cleanup()
    const last = renderSelect('undecided')
    fireEvent.keyDown(last.trigger, { key: 'ArrowDown' })
    expect(last.onPick).not.toHaveBeenCalled()
    expect(last.trigger.textContent).toBe('未分類')
  })

  it('Space で開いて項目を選ぶと onPick が走り、現在値に印が付いている', () => {
    const { onPick, trigger } = renderSelect('screen')
    fireEvent.keyDown(trigger, { key: ' ' })
    const current = screen.getByRole('menuitemradio', { name: '画面' })
    expect(current.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'データ' }))
    expect(onPick).toHaveBeenCalledWith('data')
  })

  it('Enter は開かずにセルの操作言語へ渡る（ネイティブ select と同じ）', () => {
    const { onKeyDown, trigger } = renderSelect('screen')
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(onKeyDown).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menuitemradio')).toBeNull()
  })

  it('Alt+↑↓ と Tab は親のセル操作へ渡り、素の ↑↓ は渡らない', () => {
    const { onKeyDown, trigger } = renderSelect('screen')
    fireEvent.keyDown(trigger, { key: 'ArrowDown', altKey: true })
    fireEvent.keyDown(trigger, { key: 'Tab' })
    expect(onKeyDown).toHaveBeenCalledTimes(2)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(onKeyDown).toHaveBeenCalledTimes(2)
  })
})
