// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { OutputProfile } from '@/core/registry'
import { ExportMenu } from './ExportMenu'

afterEach(cleanup)

const profile = (id: string, label: string): OutputProfile<unknown> => ({
  id,
  label,
  fileSuffix: '',
  toMarkdown: () => '',
})

const one = [profile('default', 'Markdown')]
const two = [profile('support', 'サポート向け'), profile('dev', '開発向け')]

describe('ExportMenu: プロファイルが1本のとき', () => {
  it('ドロップダウンを出さず、押すとその1本で実行する（用語集の画面は変わらない）', () => {
    const onCopy = vi.fn()
    const onExport = vi.fn()
    render(
      <ExportMenu
        outputs={one}
        disabled={false}
        copyLabel="Markdown をコピー"
        exportLabel="Markdown を書き出す"
        onCopy={onCopy}
        onExport={onExport}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Markdown をコピー' }))
    expect(onCopy).toHaveBeenCalledWith(one[0])
    fireEvent.click(screen.getByRole('button', { name: 'Markdown を書き出す' }))
    expect(onExport).toHaveBeenCalledWith(one[0])
  })

  it('disabled のときは押せない', () => {
    const onCopy = vi.fn()
    render(
      <ExportMenu
        outputs={one}
        disabled
        copyLabel="Markdown をコピー"
        exportLabel="Markdown を書き出す"
        onCopy={onCopy}
        onExport={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Markdown をコピー' }))
    expect(onCopy).not.toHaveBeenCalled()
  })
})

describe('ExportMenu: 出力できるファイルを選んでいないとき', () => {
  it('プロファイルが空でもボタンは出る（押せないだけ）', () => {
    const onCopy = vi.fn()
    render(
      <ExportMenu
        outputs={[]}
        disabled
        copyLabel="Markdown をコピー"
        exportLabel="Markdown を書き出す"
        onCopy={onCopy}
        onExport={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Markdown をコピー' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Markdown をコピー' }))
    expect(onCopy).not.toHaveBeenCalled()
  })
})

describe('ExportMenu: プロファイルが2本以上のとき', () => {
  it('コピーはメニューを開き、選んだプロファイルで実行する', async () => {
    const onCopy = vi.fn()
    render(
      <ExportMenu
        outputs={two}
        disabled={false}
        copyLabel="Markdown をコピー"
        exportLabel="Markdown を書き出す"
        onCopy={onCopy}
        onExport={vi.fn()}
      />,
    )
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Markdown をコピー' }),
      { button: 0, ctrlKey: false },
    )
    const item = await screen.findByRole('menuitem', { name: '開発向け' })
    fireEvent.click(item)
    expect(onCopy).toHaveBeenCalledWith(two[1])
  })

  it('書き出しも同じ選択肢を出す', async () => {
    const onExport = vi.fn()
    render(
      <ExportMenu
        outputs={two}
        disabled={false}
        copyLabel="Markdown をコピー"
        exportLabel="Markdown を書き出す"
        onCopy={vi.fn()}
        onExport={onExport}
      />,
    )
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Markdown を書き出す' }),
      { button: 0, ctrlKey: false },
    )
    const item = await screen.findByRole('menuitem', { name: 'サポート向け' })
    fireEvent.click(item)
    expect(onExport).toHaveBeenCalledWith(two[0])
  })
})
