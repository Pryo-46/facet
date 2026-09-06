// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActorRefCell } from './ActorRefCell'

afterEach(cleanup)

const actors = [
  { id: 'actor_Aaaaaaaaa1', name: '画面' },
  { id: 'actor_Aaaaaaaaa2', name: 'API' },
  { id: 'actor_Aaaaaaaaa3', name: '決済' },
]

function setup(over: Partial<Parameters<typeof ActorRefCell>[0]> = {}) {
  const onSelect = vi.fn()
  const onFieldKeyDown = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <ActorRefCell
      value="actor_Aaaaaaaaa2"
      actors={actors}
      invalid={false}
      aria-label="送り手"
      data-cell="s1:from"
      onSelect={onSelect}
      onOpenChange={onOpenChange}
      onFieldKeyDown={onFieldKeyDown}
      {...over}
    />,
  )
  return { onSelect, onFieldKeyDown, onOpenChange, cell: screen.getByLabelText('送り手') }
}

describe('ActorRefCell: 表示', () => {
  it('参照先の名前を表示する', () => {
    expect(setup().cell.textContent).toBe('API')
  })

  it('参照切れは（未解決）と表示する（空のボタンは押す場所が見えない）', () => {
    expect(setup({ value: undefined, invalid: true }).cell.textContent).toBe('（未解決）')
  })

  it('名前が空のアクターを指しているときは本文を空にし、欠落の面（破線＋淡い面）で示す。（未定義）とは書かない（決定1）', () => {
    const { cell } = setup({
      value: 'actor_Aaaaaaaaa9',
      actors: [{ id: 'actor_Aaaaaaaaa9', name: '' }],
    })
    expect(cell.textContent).toBe('')
    expect(cell.className).toContain('bg-missing-face')
    expect(cell.className).toContain('border-dashed')
    // 面と枠は片方だけ——通常時の枠が残ると border-missing が効かない
    expect(cell.className).not.toContain('border-rule')
    // **本文が空でも押す面積を残す。** 子が無いボタンは行ボックスを作らず
    // 内容高 0 に潰れる（jsdom はレイアウトを持たないのでクラスの字面で固定する）
    expect(cell.className).toContain('min-h-6.5')
  })

  it('名前が埋まっているセルは欠落の面を持たない', () => {
    const { cell } = setup()
    expect(cell.className).toContain('border-rule')
    expect(cell.className).not.toContain('bg-missing-face')
  })
})

describe('ActorRefCell: キーボード', () => {
  it('↑↓ で actors 配列順に即時切替する（3人の真ん中から両方向）', () => {
    const { onSelect, cell } = setup()
    fireEvent.keyDown(cell, { key: 'ArrowDown' })
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa3')
    fireEvent.keyDown(cell, { key: 'ArrowUp' })
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa1')
  })

  it('端では回り込む（末尾で↓→先頭）', () => {
    const { onSelect, cell } = setup({ value: 'actor_Aaaaaaaaa3' })
    fireEvent.keyDown(cell, { key: 'ArrowDown' })
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa1')
  })

  it('↓ はメニューを開かない', () => {
    const { cell } = setup()
    fireEvent.keyDown(cell, { key: 'ArrowDown' })
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('Alt+↓ は候補を切り替えず、onFieldKeyDown へ委譲する', () => {
    // アクター3人のフィクスチャで検査する——2人だと「切替が起きない」と
    // 「委譲された」の区別が実装によっては付かない
    const { onSelect, onFieldKeyDown, cell } = setup()
    fireEvent.keyDown(cell, { key: 'ArrowDown', altKey: true })
    expect(onSelect).not.toHaveBeenCalled()
    expect(onFieldKeyDown).toHaveBeenCalledOnce()
  })

  it('Enter はメニューを開かず onFieldKeyDown へ委譲する（ステップ追加の経路）', () => {
    const { onFieldKeyDown, cell } = setup()
    fireEvent.keyDown(cell, { key: 'Enter' })
    expect(onFieldKeyDown).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('アクターが0人のときの ↑↓ は何も起こさない', () => {
    const { onSelect, cell } = setup({ actors: [], value: undefined })
    // **例外を投げないことも「何も起こさない」の一部として検査する。**
    // cycle が early return を失うと actors[NaN] を読んで例外を投げるが、
    // それは onSelect を呼ぶ**前**に起きるため、onSelect の非呼び出しだけを
    // 見るアサーションは通ってしまう。しかも React は event handler 内の
    // 例外を synchronous throw で fireEvent へ返さない（内部で guarded
    // callback にくるんでいる）ので `expect(() => fireEvent(...)).toThrow()`
    // でも捕まえられない。React が投げ直す先は `window` の error イベント
    // （実測: fireEvent の呼び出し中に同期的に発火する）なので、ここで拾う
    const onWindowError = vi.fn((e: Event) => {
      e.preventDefault()
    })
    window.addEventListener('error', onWindowError)
    fireEvent.keyDown(cell, { key: 'ArrowDown' })
    window.removeEventListener('error', onWindowError)
    expect(onWindowError).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('ActorRefCell: マウス', () => {
  it('クリックでアクターの一覧が開き、選ぶと onSelect', async () => {
    const { onSelect, cell } = setup()
    fireEvent.pointerDown(cell, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: '決済' }))
    expect(onSelect).toHaveBeenCalledWith('actor_Aaaaaaaaa3')
  })

  it('一覧は actors の配列順（横の並びと同じ順で選べる）', async () => {
    const { cell } = setup()
    fireEvent.pointerDown(cell, { button: 0, ctrlKey: false })
    await screen.findByRole('menuitem', { name: '画面' })
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      '画面',
      'API',
      '決済',
    ])
  })

  it('開閉を onOpenChange で伝える', async () => {
    const { cell, onOpenChange } = setup()
    fireEvent.pointerDown(cell, { button: 0, ctrlKey: false })
    await screen.findByRole('menuitem', { name: '画面' })
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('名前が空のアクターのメニュー項目は語ではなく欠落の面で示す（空白の項目にせず、（未定義）とも書かない）', async () => {
    const { cell } = setup({
      actors: [...actors, { id: 'actor_Aaaaaaaaa9', name: '' }],
    })
    fireEvent.pointerDown(cell, { button: 0, ctrlKey: false })
    // 名前は menuitem 自身の aria-label。**素の span に付けない**——generic は
    // 命名禁止ロールで、実ブラウザでは名前が落ちて「空白の項目」になる
    const item = await screen.findByRole('menuitem', { name: '名前が空のアクター' })
    expect(item.getAttribute('aria-label')).toBe('名前が空のアクター')
    expect(item.textContent).toBe('')
    const mark = item.querySelector('span')!
    expect(mark.className).toContain('bg-missing-face')
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    expect(screen.queryByText('（未定義）')).toBeNull()
  })
})
