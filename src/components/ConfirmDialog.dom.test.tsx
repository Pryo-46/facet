// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConfirmDialog } from './ConfirmDialog'

afterEach(cleanup)

function setup(open = true) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDialog
      open={open}
      title="ファイルを削除しますか？"
      description="用語集.json を OS のゴミ箱へ移動します。"
      confirmLabel="ゴミ箱へ移動"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmDialog', () => {
  it('open が false のときは何も出さない', () => {
    setup(false)
    expect(screen.queryByText('ファイルを削除しますか？')).toBeNull()
  })

  it('見出しと説明を出す', () => {
    setup()
    expect(screen.getByText('ファイルを削除しますか？')).not.toBeNull()
    expect(screen.getByText('用語集.json を OS のゴミ箱へ移動します。')).not.toBeNull()
  })

  it('確認ボタンで onConfirm を呼ぶ', () => {
    const { onConfirm, onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'ゴミ箱へ移動' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('既定のキャンセルラベルは「キャンセル」で、押すと onCancel を呼ぶ', () => {
    const { onConfirm, onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('Esc でも onCancel を呼ぶ（モーダル中の Esc はダイアログが取る。rev 10章）', () => {
    const { onCancel } = setup()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })
})
