// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ChoiceDialog } from './ChoiceDialog'

afterEach(cleanup)

function setup(open = true) {
  const onPrimary = vi.fn()
  const onSecondary = vi.fn()
  render(
    <ChoiceDialog
      open={open}
      title="外部でファイルが変更されました"
      description="用語集.json が外部で変更されました。保存していない編集があります。"
      primaryLabel="自分の編集で上書き"
      secondaryLabel="外部変更を取り込む（自分の編集は破棄）"
      onPrimary={onPrimary}
      onSecondary={onSecondary}
    />,
  )
  return { onPrimary, onSecondary }
}

describe('ChoiceDialog', () => {
  it('open が false のときは何も出さない', () => {
    setup(false)
    expect(screen.queryByRole('heading', { name: '外部でファイルが変更されました' })).toBeNull()
  })

  it('見出しと説明を出す', () => {
    setup()
    expect(screen.getByRole('heading', { name: '外部でファイルが変更されました' })).not.toBeNull()
    expect(screen.getByText(/保存していない編集があります/)).not.toBeNull()
  })

  it('第1の選択で onPrimary だけを呼ぶ', () => {
    const { onPrimary, onSecondary } = setup()
    fireEvent.click(screen.getByRole('button', { name: '自分の編集で上書き' }))
    expect(onPrimary).toHaveBeenCalledTimes(1)
    expect(onSecondary).not.toHaveBeenCalled()
  })

  it('第2の選択で onSecondary だけを呼ぶ', () => {
    const { onPrimary, onSecondary } = setup()
    fireEvent.click(screen.getByRole('button', { name: '外部変更を取り込む（自分の編集は破棄）' }))
    expect(onSecondary).toHaveBeenCalledTimes(1)
    expect(onPrimary).not.toHaveBeenCalled()
  })

  it('Esc では閉じない（決めないまま閉じると宙ぶらりんになる）', () => {
    const { onPrimary, onSecondary } = setup()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onPrimary).not.toHaveBeenCalled()
    expect(onSecondary).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '外部でファイルが変更されました' })).not.toBeNull()
  })

  it('onCancel を渡すとキャンセルのボタンが既定文言（「キャンセル」）で出て、押すと呼ばれる', () => {
    const onCancel = vi.fn()
    render(
      <ChoiceDialog
        open
        title="取り込む"
        description="どちらに取り込みますか。"
        primaryLabel="上書き"
        secondaryLabel="新規"
        onPrimary={vi.fn()}
        onSecondary={vi.fn()}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('cancelLabel を渡すと文言を上書きできる', () => {
    const onCancel = vi.fn()
    render(
      <ChoiceDialog
        open
        title="取り込む"
        description="どちらに取り込みますか。"
        primaryLabel="上書き"
        secondaryLabel="新規"
        cancelLabel="やめる"
        onPrimary={vi.fn()}
        onSecondary={vi.fn()}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('onCancel を渡すと Esc でも呼ばれる', () => {
    const onCancel = vi.fn()
    render(
      <ChoiceDialog
        open
        title="取り込む"
        description="どちらに取り込みますか。"
        primaryLabel="上書き"
        secondaryLabel="新規"
        onPrimary={vi.fn()}
        onSecondary={vi.fn()}
        onCancel={onCancel}
      />,
    )
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('onCancel を渡さなければキャンセルは出ない（既存の挙動）', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'キャンセル' })).toBe(null)
  })

  it('onCancel を渡すと3ボタン分の幅に広げる（既定幅だと3ボタンが収まらない）', () => {
    render(
      <ChoiceDialog
        open
        title="取り込む"
        description="どちらに取り込みますか。"
        primaryLabel="このツリーを上書き"
        secondaryLabel="新しいファイルに作る"
        onPrimary={vi.fn()}
        onSecondary={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('alertdialog').className).toContain('max-w-xl')
  })

  it('onCancel を渡さなければ幅は既定のまま（2ボタンで広げると間延びする）', () => {
    setup()
    const className = screen.getByRole('alertdialog').className
    expect(className).not.toContain('max-w-xl')
  })
})
