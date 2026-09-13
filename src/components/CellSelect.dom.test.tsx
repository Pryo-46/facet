// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CellSelect } from './CellSelect'

afterEach(cleanup)

const OPTIONS = ['screen', 'data', 'undecided'] as const
const LABELS: Record<string, string> = { screen: '画面', data: 'データ', undecided: '未分類' }

function renderSelect(value: string) {
  return renderSelect2(value, {})
}

/** `changeOnArrows` / `openOnEnter` を渡す版。既定の呼び出しは renderSelect に任せる */
function renderSelect2(value: string, opts: { changeOnArrows?: boolean; openOnEnter?: boolean }) {
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
      changeOnArrows={opts.changeOnArrows}
      openOnEnter={opts.openOnEnter}
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

  it('changeOnArrows が偽のとき、閉じたまま素の ↓ は値を変えずセルの操作言語へ渡る', () => {
    const { onPick, onKeyDown, trigger } = renderSelect2('data', { changeOnArrows: false })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(onPick).not.toHaveBeenCalled()
    expect(onKeyDown).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menuitemradio')).toBeNull()
  })

  it('openOnEnter が真のとき、Enter でメニューが開く', () => {
    const { onKeyDown, trigger } = renderSelect2('screen', { openOnEnter: true })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(onKeyDown).not.toHaveBeenCalled()
    expect(screen.getByRole('menuitemradio', { name: '画面' })).toBeDefined()
  })

  it('openOnEnter が真でも、主修飾キー＋Enter はメニューを開かずセルの操作言語へ渡る', () => {
    const { onKeyDown, trigger } = renderSelect2('screen', { openOnEnter: true })
    fireEvent.keyDown(trigger, { key: 'Enter', ctrlKey: true })
    expect(onKeyDown).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menuitemradio')).toBeNull()
  })

  it('onOpenChange はメニューを開くと true、閉じると false で呼ばれる', () => {
    const onOpenChange = vi.fn()
    const onPick = vi.fn()
    render(
      <CellSelect
        value="screen"
        options={OPTIONS}
        labelOf={(v) => LABELS[v] ?? v}
        onPick={onPick}
        aria-label="種別（1行目）"
        data-cell="row1:kind"
        className="w-full"
        onOpenChange={onOpenChange}
      />,
    )
    const trigger = screen.getByRole('button', { name: '種別（1行目）' })
    fireEvent.keyDown(trigger, { key: ' ' })
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'データ' }))
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('itemLabelOf を渡すと開いた項目の文字だけ変わり、閉じたセルの文字は labelOf のまま', () => {
    const onPick = vi.fn()
    render(
      <CellSelect
        value="screen"
        options={OPTIONS}
        labelOf={(v) => LABELS[v] ?? v}
        itemLabelOf={(v) => (v === 'screen' ? '空にする' : (LABELS[v] ?? v))}
        onPick={onPick}
        aria-label="種別（1行目）"
        data-cell="row1:kind"
        className="w-full"
      />,
    )
    const trigger = screen.getByRole('button', { name: '種別（1行目）' })
    expect(trigger.textContent).toBe('画面')
    fireEvent.keyDown(trigger, { key: ' ' })
    expect(screen.getByRole('menuitemradio', { name: '空にする' })).toBeDefined()
    expect(screen.queryByRole('menuitemradio', { name: '画面' })).toBeNull()
    expect(trigger.textContent).toBe('画面')
  })
})
