// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DEFAULT_SETTINGS, type AppSettings } from '@/core/settings'
import { SettingsDialog } from './SettingsDialog'

afterEach(cleanup)

// タブの切り替えだけ fireEvent.click ではなく fireEvent.mouseDown を使う。
// Radix の TabsTrigger は onMouseDown で選択を切り替えており、click イベント単体
// では拾えない（チェックボックス・ラジオは React が click で onChange を発火する
// ので click のままでよい）
function clickTab(name: string): void {
  fireEvent.mouseDown(screen.getByRole('tab', { name }))
}

function show(settings: AppSettings = DEFAULT_SETTINGS) {
  const onChange = vi.fn()
  const onClose = vi.fn()
  render(
    <SettingsDialog open settings={settings} onChange={onChange} onClose={onClose} />,
  )
  return { onChange, onClose }
}

describe('SettingsDialog', () => {
  it('一般のタブから始まる', () => {
    show()
    expect(screen.getByRole('radio', { name: 'システムに合わせる' })).toBeTruthy()
  })

  it('テーマを選ぶと渡される', () => {
    const { onChange } = show()
    fireEvent.click(screen.getByRole('radio', { name: 'ダーク' }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, theme: 'dark' })
  })

  it('操作のタブへ切り替えるとパンとズームが出る', () => {
    show()
    clickTab('操作')
    expect(screen.getByRole('checkbox', { name: '空きスペースの左ドラッグ' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: '修飾キーなしのホイールでズームする' })).toBeTruthy()
  })

  it('パンの手段を切ると渡される', () => {
    const { onChange } = show()
    clickTab('操作')
    fireEvent.click(screen.getByRole('checkbox', { name: '中ボタンのドラッグ' }))
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      canvas: { ...DEFAULT_SETTINGS.canvas, panWithMiddleDrag: false },
    })
  })

  it('最後に残ったパンの手段は切れない', () => {
    // 盤面を動かせない状態を設定から作らせない
    const { onChange } = show({
      ...DEFAULT_SETTINGS,
      canvas: {
        ...DEFAULT_SETTINGS.canvas,
        panWithSpaceDrag: false,
        panWithMiddleDrag: false,
      },
    })
    clickTab('操作')
    const last = screen.getByRole('checkbox', { name: '空きスペースの左ドラッグ' })
    expect(last.hasAttribute('disabled')).toBe(true)
    // fireEvent.click は jsdom の change 発火を直接叩くため disabled を無視する。
    // ネイティブの .click() は isDisabled チェックを通るので、ブラウザの実際の
    // 挙動（disabled はクリックを配送しない）をここで再現できる
    last.click()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ズームは最後の1つでも切れる', () => {
    // Ctrl+ホイールが常に効くので、切っても操作できなくならない
    const { onChange } = show()
    clickTab('操作')
    const zoom = screen.getByRole('checkbox', { name: '修飾キーなしのホイールでズームする' })
    expect(zoom.hasAttribute('disabled')).toBe(false)
    fireEvent.click(zoom)
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      canvas: { ...DEFAULT_SETTINGS.canvas, zoomWithoutModifier: false },
    })
  })

  it('閉じるボタンで閉じる', () => {
    const { onClose } = show()
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(onClose).toHaveBeenCalled()
  })
})
