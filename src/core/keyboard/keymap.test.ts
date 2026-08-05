import { describe, expect, it } from 'vitest'
import { resolveCommand, toKeyEventLike, type KeyContext, type KeyEventLike } from './keymap'

function key(over: Partial<KeyEventLike> & { key: string }): KeyEventLike {
  return { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false, ...over }
}

/** 名称セルを編集中（テキスト入力・空でない・キャレットは中間）の既定文脈 */
function ctx(over: Partial<KeyContext> = {}): KeyContext {
  return {
    platform: 'other',
    modalOpen: false,
    editing: true,
    fieldEmpty: false,
    deletableField: true,
    caretAtStart: false,
    caretAtEnd: false,
    arrowsOwnedByField: false,
    reorderEnabled: true,
    ...over,
  }
}

describe('resolveCommand: IME と境界規則', () => {
  it('変換中のキーは一切コマンドにしない（変換確定 Enter の誤爆防止）', () => {
    expect(resolveCommand(key({ key: 'Enter', isComposing: true }), ctx())).toBeNull()
    expect(resolveCommand(key({ key: 'Escape', isComposing: true }), ctx())).toBeNull()
  })

  it('モーダル表示中は操作言語を停止する（Esc の取り合いを排除）', () => {
    expect(resolveCommand(key({ key: 'Enter' }), ctx({ modalOpen: true }))).toBeNull()
    expect(resolveCommand(key({ key: 'Escape' }), ctx({ modalOpen: true }))).toBeNull()
  })
})

describe('resolveCommand: グローバル層', () => {
  it('Ctrl+Z / Ctrl+Shift+Z（Windows）', () => {
    expect(resolveCommand(key({ key: 'z', ctrlKey: true }), ctx())).toBe('undo')
    expect(resolveCommand(key({ key: 'z', ctrlKey: true, shiftKey: true }), ctx())).toBe('redo')
  })

  it('macOS では Cmd+Z / Cmd+Shift+Z', () => {
    const mac = ctx({ platform: 'mac' })
    expect(resolveCommand(key({ key: 'z', metaKey: true }), mac)).toBe('undo')
    expect(resolveCommand(key({ key: 'Z', metaKey: true, shiftKey: true }), mac)).toBe('redo')
    // macOS で Ctrl+Z は主修飾キーではない
    expect(resolveCommand(key({ key: 'z', ctrlKey: true }), mac)).toBeNull()
  })

  it('テキスト編集中でも Undo は操作言語が取る（制御入力なので標準 Undo に任せない）', () => {
    expect(resolveCommand(key({ key: 'z', ctrlKey: true }), ctx({ editing: true }))).toBe('undo')
  })

  it('その他の主修飾キー付き（Ctrl+C など）は奪わない', () => {
    expect(resolveCommand(key({ key: 'c', ctrlKey: true }), ctx())).toBeNull()
    expect(resolveCommand(key({ key: 'a', ctrlKey: true }), ctx())).toBeNull()
  })

  it('Esc は編集のキャンセル', () => {
    expect(resolveCommand(key({ key: 'Escape' }), ctx())).toBe('cancel')
  })

  it('Windows では Ctrl+Y も「やり直し」（デファクトの追加割当）', () => {
    expect(resolveCommand(key({ key: 'y', ctrlKey: true }), ctx())).toBe('redo')
    expect(resolveCommand(key({ key: 'Y', ctrlKey: true }), ctx())).toBe('redo')
  })

  it('macOS の Cmd+Y は「やり直し」にしない（その慣習が無い）', () => {
    expect(resolveCommand(key({ key: 'y', metaKey: true }), ctx({ platform: 'mac' }))).toBeNull()
  })

  it('Ctrl+Shift+Y は取らない', () => {
    expect(resolveCommand(key({ key: 'y', ctrlKey: true, shiftKey: true }), ctx())).toBeNull()
  })
})

describe('resolveCommand: 階層・リスト系ファミリー標準', () => {
  it('Enter は直後に行追加', () => {
    expect(resolveCommand(key({ key: 'Enter' }), ctx())).toBe('insert-item-after')
  })

  it('修飾つき Enter は取らない', () => {
    expect(resolveCommand(key({ key: 'Enter', shiftKey: true }), ctx())).toBeNull()
    expect(resolveCommand(key({ key: 'Enter', ctrlKey: true }), ctx())).toBeNull()
  })

  it('Tab はセル間移動（用語集に「子」が無いためファミリー標準の子追加には使わない）', () => {
    expect(resolveCommand(key({ key: 'Tab' }), ctx())).toBe('focus-next-field')
    expect(resolveCommand(key({ key: 'Tab', shiftKey: true }), ctx())).toBe('focus-prev-field')
  })

  it('空欄 Backspace は行削除。空でなければ通常の文字削除', () => {
    expect(resolveCommand(key({ key: 'Backspace' }), ctx({ fieldEmpty: true }))).toBe('delete-item')
    expect(resolveCommand(key({ key: 'Backspace' }), ctx({ fieldEmpty: false }))).toBeNull()
  })

  it('削除を認めない欄（定義セルなど）では空欄 Backspace でも行を消さない', () => {
    expect(
      resolveCommand(key({ key: 'Backspace' }), ctx({ fieldEmpty: true, deletableField: false })),
    ).toBeNull()
  })

  it('Alt+↑↓ は並び替え', () => {
    expect(resolveCommand(key({ key: 'ArrowUp', altKey: true }), ctx())).toBe('move-item-up')
    expect(resolveCommand(key({ key: 'ArrowDown', altKey: true }), ctx())).toBe('move-item-down')
  })

  it('導出表示中（検索・フィルタ適用中）は並び替えを無効化する', () => {
    const derived = ctx({ reorderEnabled: false })
    expect(resolveCommand(key({ key: 'ArrowUp', altKey: true }), derived)).toBeNull()
    expect(resolveCommand(key({ key: 'ArrowDown', altKey: true }), derived)).toBeNull()
  })
})

describe('resolveCommand: 矢印の境界規則', () => {
  it('編集中はキャレットが端にあるときだけ行間移動になる', () => {
    expect(resolveCommand(key({ key: 'ArrowUp' }), ctx({ caretAtStart: true }))).toBe('focus-prev')
    expect(resolveCommand(key({ key: 'ArrowUp' }), ctx({ caretAtStart: false }))).toBeNull()
    expect(resolveCommand(key({ key: 'ArrowDown' }), ctx({ caretAtEnd: true }))).toBe('focus-next')
    expect(resolveCommand(key({ key: 'ArrowDown' }), ctx({ caretAtEnd: false }))).toBeNull()
  })

  it('欄自身が↑↓を使う場合（select）は行間移動にしない', () => {
    const select = ctx({ editing: false, arrowsOwnedByField: true, caretAtStart: true, caretAtEnd: true })
    expect(resolveCommand(key({ key: 'ArrowUp' }), select)).toBeNull()
    // Alt+↑↓ の並び替えは select でも有効
    expect(resolveCommand(key({ key: 'ArrowUp', altKey: true }), select)).toBe('move-item-up')
  })

  it('Shift+矢印は選択拡張なので取らない', () => {
    expect(
      resolveCommand(key({ key: 'ArrowUp', shiftKey: true }), ctx({ caretAtStart: true })),
    ).toBeNull()
  })

  it('割り当ての無いキーは null', () => {
    expect(resolveCommand(key({ key: 'a' }), ctx())).toBeNull()
    expect(resolveCommand(key({ key: ' ' }), ctx())).toBeNull()
  })
})

describe('toKeyEventLike', () => {
  it('React の合成イベントは nativeEvent.isComposing を読む', () => {
    const e = {
      key: 'Enter',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      nativeEvent: { isComposing: true },
    }
    expect(toKeyEventLike(e).isComposing).toBe(true)
  })

  it('DOM イベントは自身の isComposing を読む', () => {
    const e = {
      key: 'Enter',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
    }
    expect(toKeyEventLike(e).isComposing).toBe(false)
  })
})
