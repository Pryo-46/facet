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
  const onCreate = vi.fn()
  const onFieldKeyDown = vi.fn()
  render(
    <ActorRefCell
      value="actor_Aaaaaaaaa2"
      actors={actors}
      invalid={false}
      aria-label="送り手"
      data-cell="s1:from"
      onSelect={onSelect}
      onCreate={onCreate}
      onFieldKeyDown={onFieldKeyDown}
      {...over}
    />,
  )
  return {
    onSelect,
    onCreate,
    onFieldKeyDown,
    input: screen.getByLabelText('送り手') as HTMLInputElement,
  }
}

describe('ActorRefCell', () => {
  it('参照先の名前を表示する', () => {
    expect(setup().input.value).toBe('API')
  })

  it('参照切れは空表示で invalid を親から受けた見た目になる', () => {
    const { input } = setup({ value: undefined, invalid: true })
    expect(input.value).toBe('')
  })

  it('↑↓ で actors 配列順に即時切替する（3人の真ん中から両方向）', () => {
    const { onSelect, input } = setup()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa3')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa1')
  })

  it('端では回り込む（末尾で↓→先頭）', () => {
    const { onSelect, input } = setup({ value: 'actor_Aaaaaaaaa3' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa1')
  })

  it('既存名を打って blur すると onSelect（NFKC・大文字小文字を同一視して照合）', () => {
    const { onSelect, onCreate, input } = setup()
    fireEvent.change(input, { target: { value: 'api' } })
    fireEvent.blur(input)
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa2')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('前方一致が1人に絞れるなら確定できる（「決」→ 決済）', () => {
    const { onSelect, input } = setup()
    fireEvent.change(input, { target: { value: '決' } })
    fireEvent.blur(input)
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa3')
  })

  it('前方一致が複数（曖昧）なら onCreate に落ちる（「決」→ 決済／決済API）', () => {
    const ambiguousActors = [
      ...actors,
      { id: 'actor_Aaaaaaaaa4', name: '決済API' },
    ]
    const { onSelect, onCreate, input } = setup({ actors: ambiguousActors })
    fireEvent.change(input, { target: { value: '決' } })
    fireEvent.blur(input)
    expect(onCreate).toHaveBeenCalledWith('決')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('未登録名を打って blur すると onCreate', () => {
    const { onSelect, onCreate, input } = setup()
    fireEvent.change(input, { target: { value: 'メール基盤' } })
    fireEvent.blur(input)
    expect(onCreate).toHaveBeenCalledWith('メール基盤')
    expect(onSelect).not.toHaveBeenCalledWith(expect.stringMatching(/^actor_Zzz/))
  })

  it('空にして blur すると元の参照に戻る（onSelect も onCreate も呼ばない）', () => {
    const { onSelect, onCreate, input } = setup()
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onCreate).not.toHaveBeenCalled()
    expect(input.value).toBe('API')
  })

  it('ドラフトがある状態の Enter は確定だけして親のキー処理へ渡さない', () => {
    // **1打鍵＝1操作。** 渡すと親（操作言語）が同じ Enter を
    // 「次のステップを追加」と読み、commit() より古いデータから作った
    // 追加で確定を上書きする（未登録名ならインライン作成した参加者ごと消える）
    const { onSelect, onFieldKeyDown, input } = setup()
    fireEvent.change(input, { target: { value: '決済' } })
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false)
    expect(onSelect).toHaveBeenCalledWith('actor_Aaaaaaaaa3')
    expect(onFieldKeyDown).not.toHaveBeenCalled()
  })

  it('未登録名のドラフトでも同じ（onCreate だけが起きる）', () => {
    const { onCreate, onFieldKeyDown, input } = setup()
    fireEvent.change(input, { target: { value: 'メール基盤' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCreate).toHaveBeenCalledWith('メール基盤')
    expect(onFieldKeyDown).not.toHaveBeenCalled()
  })

  it('ドラフトが無い Enter は親へ委譲する（行追加の経路を塞がない）', () => {
    const { onSelect, onCreate, onFieldKeyDown, input } = setup()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onFieldKeyDown).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('Tab はドラフトがあっても親へ委譲する（確定して次の欄へ抜ける）', () => {
    // Tab の写像（focus-next-field）はデータを触らないので上書きが起きない。
    // ここを塞ぐとキャンバスから Tab 順で抜けられなくなる
    const { onSelect, onFieldKeyDown, input } = setup()
    fireEvent.change(input, { target: { value: '決済' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(onSelect).toHaveBeenCalledWith('actor_Aaaaaaaaa3')
    expect(onFieldKeyDown).toHaveBeenCalled()
  })

  it('IME 変換中の ↑↓ は候補切替しない', () => {
    const { onSelect, input } = setup()
    fireEvent.keyDown(input, { key: 'ArrowDown', isComposing: true })
    expect(onSelect).not.toHaveBeenCalled()
  })
})
