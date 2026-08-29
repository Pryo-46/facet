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
    render(<ExportMenu outputs={one} unusable={null} onCopy={onCopy} onExport={onExport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Markdown をコピー' }))
    expect(onCopy).toHaveBeenCalledWith(one[0])
    fireEvent.click(screen.getByRole('button', { name: 'Markdown を書き出す' }))
    expect(onExport).toHaveBeenCalledWith(one[0])
  })

  it('unusable が文字列のときは押せず、理由が title に出る', () => {
    const onCopy = vi.fn()
    render(
      <ExportMenu
        outputs={one}
        unusable="ファイルを選んでください"
        onCopy={onCopy}
        onExport={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: 'Markdown をコピー' })
    fireEvent.click(button)
    expect(onCopy).not.toHaveBeenCalled()
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.getAttribute('title')).toBe('ファイルを選んでください')
  })
})

describe('ExportMenu: 出力できるファイルを選んでいないとき', () => {
  it('プロファイルが空でもボタンは出る（押せないだけ）', () => {
    const onCopy = vi.fn()
    render(
      <ExportMenu
        outputs={[]}
        unusable="ファイルを選んでください"
        onCopy={onCopy}
        onExport={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: 'Markdown をコピー' })
    expect(button).toBeTruthy()
    fireEvent.click(button)
    expect(onCopy).not.toHaveBeenCalled()
    expect(button.getAttribute('aria-disabled')).toBe('true')
  })

  it('unusable が null でも outputs が空なら「Markdown 出力を持たない」で押せない', () => {
    // ファイルは選んでいる（unusable: null）が、このツールは Markdown 出力を
    // 持たない場合。ExportMenu 自身が outputs の空を見て理由を差し替える
    const onCopy = vi.fn()
    render(<ExportMenu outputs={[]} unusable={null} onCopy={onCopy} onExport={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Markdown をコピー' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.getAttribute('title')).toBe('このツールは Markdown 出力を持ちません')
    fireEvent.click(button)
    expect(onCopy).not.toHaveBeenCalled()
  })
})

describe('ExportMenu: プロファイルが2本以上のとき', () => {
  it('コピーはメニューを開き、選んだプロファイルで実行する', async () => {
    const onCopy = vi.fn()
    render(<ExportMenu outputs={two} unusable={null} onCopy={onCopy} onExport={vi.fn()} />)
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
    render(<ExportMenu outputs={two} unusable={null} onCopy={vi.fn()} onExport={onExport} />)
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Markdown を書き出す' }),
      { button: 0, ctrlKey: false },
    )
    const item = await screen.findByRole('menuitem', { name: 'サポート向け' })
    fireEvent.click(item)
    expect(onExport).toHaveBeenCalledWith(two[0])
  })

  it('押せないときはメニューではなく通常のボタンを出す（開けないメニューを出す理由が無い）', () => {
    const onCopy = vi.fn()
    render(
      <ExportMenu
        outputs={two}
        unusable="ファイルを選んでください"
        onCopy={onCopy}
        onExport={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: 'Markdown をコピー' })
    fireEvent.pointerDown(button, { button: 0, ctrlKey: false })
    fireEvent.click(button)
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(onCopy).not.toHaveBeenCalled()
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.getAttribute('title')).toBe('ファイルを選んでください')
  })
})
