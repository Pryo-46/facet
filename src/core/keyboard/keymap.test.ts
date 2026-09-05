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
    hierarchical: false,
    horizontal: false,
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

  it('Shift/Alt つき Enter は取らない（用語集のセル内改行が生きる）', () => {
    expect(resolveCommand(key({ key: 'Enter', shiftKey: true }), ctx())).toBeNull()
    expect(resolveCommand(key({ key: 'Enter', altKey: true }), ctx())).toBeNull()
  })

  it('主修飾キー＋Enter は toggle-item-state（design-notes 論点9）', () => {
    expect(resolveCommand(key({ key: 'Enter', ctrlKey: true }), ctx())).toBe('toggle-item-state')
    expect(
      resolveCommand(key({ key: 'Enter', metaKey: true }), ctx({ platform: 'mac' })),
    ).toBe('toggle-item-state')
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

describe('階層構造（hierarchical: true）', () => {
  it('Tab で子を追加する（rev 10章 階層・リスト系の標準）', () => {
    expect(
      resolveCommand(key({ key: 'Tab' }), ctx({ hierarchical: true })),
    ).toBe('insert-child')
  })

  it('Shift+Tab には意味を与えない（キャンバスから抜ける経路として残す）', () => {
    expect(
      resolveCommand(key({ key: 'Tab', shiftKey: true }), ctx({ hierarchical: true })),
    ).toBe(null)
  })

  it('← はキャレットが先頭にあるとき親へ移る', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowLeft' }),
        ctx({ hierarchical: true, editing: true, caretAtStart: true }),
      ),
    ).toBe('focus-parent')
  })

  it('← は文中では何もしない（キャレット移動が生きる）', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowLeft' }),
        ctx({ hierarchical: true, editing: true, caretAtStart: false }),
      ),
    ).toBe(null)
  })

  it('→ はキャレットが末尾にあるとき子へ移る', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowRight' }),
        ctx({ hierarchical: true, editing: true, caretAtEnd: true }),
      ),
    ).toBe('focus-child')
  })

  it('→ は文中では何もしない（キャレット移動が生きる）', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowRight' }),
        ctx({ hierarchical: true, editing: true, caretAtEnd: false }),
      ),
    ).toBe(null)
  })

  it('Alt+←→ には意味を与えない（並び替えは Alt+↑↓ の担当）', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowLeft', altKey: true }),
        ctx({ hierarchical: true, editing: true, caretAtStart: true }),
      ),
    ).toBe(null)
    expect(
      resolveCommand(
        key({ key: 'ArrowRight', altKey: true }),
        ctx({ hierarchical: true, editing: true, caretAtEnd: true }),
      ),
    ).toBe(null)
  })

  it('Shift+←→ には意味を与えない（選択の拡張は入力欄のもの）', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowLeft', shiftKey: true }),
        ctx({ hierarchical: true, editing: true, caretAtStart: true }),
      ),
    ).toBe(null)
    expect(
      resolveCommand(
        key({ key: 'ArrowRight', shiftKey: true }),
        ctx({ hierarchical: true, editing: true, caretAtEnd: true }),
      ),
    ).toBe(null)
  })

  it('Enter は階層でも「直後に追加」のまま', () => {
    expect(resolveCommand(key({ key: 'Enter' }), ctx({ hierarchical: true }))).toBe(
      'insert-item-after',
    )
  })

  it('Ctrl+C / Ctrl+V は階層でも奪わない（複製を後から入れるため）', () => {
    expect(resolveCommand(key({ key: 'c', ctrlKey: true }), ctx({ hierarchical: true }))).toBe(null)
    expect(resolveCommand(key({ key: 'v', ctrlKey: true }), ctx({ hierarchical: true }))).toBe(null)
  })

  it('IME 変換中は階層でも何も起こさない', () => {
    expect(
      resolveCommand(key({ key: 'Tab', isComposing: true }), ctx({ hierarchical: true })),
    ).toBe(null)
  })
})

describe('階層でない構造（hierarchical: false）は挙動が変わらない', () => {
  it('Tab は欄の移動のまま', () => {
    expect(resolveCommand(key({ key: 'Tab' }), ctx({ hierarchical: false }))).toBe(
      'focus-next-field',
    )
  })

  it('← / → には意味を与えない', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowLeft' }),
        ctx({ hierarchical: false, editing: true, caretAtStart: true }),
      ),
    ).toBe(null)
    expect(
      resolveCommand(
        key({ key: 'ArrowRight' }),
        ctx({ hierarchical: false, editing: true, caretAtEnd: true }),
      ),
    ).toBe(null)
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

  /**
   * WKWebView の実測。変換を確定した Enter は
   * `isComposing: false` で来るが `keyCode` は 229 のままだった:
   *
   *   11 compositionend
   *   12 keydown  Enter  keyCode=229  isComposing=false   ← これ
   *   13 keyup    Enter  keyCode=13   isComposing=false
   *
   * 229 は「IME が処理中」を表す予約値で、実在のキーには割り当てられない。
   * **isComposing より信用できる**——同じ物理キーでも、IME が食った打鍵だけが
   * 229 になり、離した keyup は本来の 13 に戻っている
   */
  it('keyCode 229（IME が処理中）は isComposing が false でも変換中として扱う', () => {
    const e = {
      key: 'Enter',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      nativeEvent: { isComposing: false, keyCode: 229 },
    }
    expect(toKeyEventLike(e).isComposing).toBe(true)
    expect(resolveCommand(toKeyEventLike(e), ctx())).toBe(null)
  })

  it('DOM イベントでも keyCode 229 を読む（window の keydown 経由）', () => {
    const e = {
      key: 'Enter',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      keyCode: 229,
    }
    expect(toKeyEventLike(e).isComposing).toBe(true)
  })

  it('本来の keyCode を持つ Enter は行追加のまま（塞ぎすぎない）', () => {
    const e = {
      key: 'Enter',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      nativeEvent: { isComposing: false, keyCode: 13 },
    }
    expect(toKeyEventLike(e).isComposing).toBe(false)
    expect(resolveCommand(toKeyEventLike(e), ctx())).toBe('insert-item-after')
  })

  it('keyCode を持たない環境でも従来どおり動く（jsdom の合成イベント）', () => {
    const e = {
      key: 'Enter',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      nativeEvent: { isComposing: false },
    }
    expect(toKeyEventLike(e).isComposing).toBe(false)
  })
})

// ---- horizontal / toggle-item-state / ←→ の arrowsOwnedByField ----

describe('horizontal（横リスト＝アクターヘッダ）', () => {
  it('Alt+← は move-item-up（前へ）、Alt+→ は move-item-down（次へ）', () => {
    expect(resolveCommand(key({ key: 'ArrowLeft', altKey: true }), ctx({ horizontal: true }))).toBe(
      'move-item-up',
    )
    expect(resolveCommand(key({ key: 'ArrowRight', altKey: true }), ctx({ horizontal: true }))).toBe(
      'move-item-down',
    )
  })

  it('素の ←→ はキャレット端でだけ focus-prev / focus-next', () => {
    expect(
      resolveCommand(key({ key: 'ArrowLeft' }), ctx({ horizontal: true, caretAtStart: true })),
    ).toBe('focus-prev')
    expect(
      resolveCommand(key({ key: 'ArrowLeft' }), ctx({ horizontal: true, caretAtStart: false })),
    ).toBeNull()
    expect(
      resolveCommand(key({ key: 'ArrowRight' }), ctx({ horizontal: true, caretAtEnd: true })),
    ).toBe('focus-next')
    expect(
      resolveCommand(key({ key: 'ArrowRight' }), ctx({ horizontal: true, caretAtEnd: false })),
    ).toBeNull()
  })

  it('horizontal では Alt+↑↓ は並び替えにならない（縦の意味が無い）', () => {
    expect(resolveCommand(key({ key: 'ArrowUp', altKey: true }), ctx({ horizontal: true }))).toBeNull()
    expect(resolveCommand(key({ key: 'ArrowDown', altKey: true }), ctx({ horizontal: true }))).toBeNull()
  })

  it('horizontal では素の（Alt 無し）↑↓ も関与しない（↑↓の horizontal ガードの変異耐性: キャレット端でも focus-prev/next にならない）', () => {
    expect(
      resolveCommand(key({ key: 'ArrowUp' }), ctx({ horizontal: true, caretAtStart: true })),
    ).toBeNull()
    expect(
      resolveCommand(key({ key: 'ArrowDown' }), ctx({ horizontal: true, caretAtEnd: true })),
    ).toBeNull()
  })

  it('reorderEnabled: false なら Alt+←→ も無効', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowLeft', altKey: true }),
        ctx({ horizontal: true, reorderEnabled: false }),
      ),
    ).toBeNull()
  })
})

describe('toggle-item-state（主修飾キー＋Enter）', () => {
  it('Ctrl+Enter で toggle-item-state', () => {
    expect(resolveCommand(key({ key: 'Enter', ctrlKey: true }), ctx())).toBe('toggle-item-state')
  })

  it('mac では Cmd+Enter', () => {
    expect(
      resolveCommand(key({ key: 'Enter', metaKey: true }), ctx({ platform: 'mac' })),
    ).toBe('toggle-item-state')
  })

  it('Shift や Alt が付いたら関与しない', () => {
    expect(
      resolveCommand(key({ key: 'Enter', ctrlKey: true, shiftKey: true }), ctx()),
    ).toBeNull()
    expect(
      resolveCommand(key({ key: 'Enter', ctrlKey: true, altKey: true }), ctx()),
    ).toBeNull()
  })
})

describe('←→ と arrowsOwnedByField（open-issues の穴の解消）', () => {
  it('hierarchical でも欄が矢印を使うなら ←→ は欄のもの（キャレット端でも構造移動に化けない＝ガードの変異耐性）', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowLeft' }),
        ctx({ hierarchical: true, arrowsOwnedByField: true, caretAtStart: true }),
      ),
    ).toBeNull()
    expect(
      resolveCommand(
        key({ key: 'ArrowRight' }),
        ctx({ hierarchical: true, arrowsOwnedByField: true, caretAtEnd: true }),
      ),
    ).toBeNull()
  })

  it('horizontal でも同様（キャレット端でも focus-prev/next に化けない＝ガードの変異耐性）', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowLeft' }),
        ctx({ horizontal: true, arrowsOwnedByField: true, caretAtStart: true }),
      ),
    ).toBeNull()
    expect(
      resolveCommand(
        key({ key: 'ArrowRight' }),
        ctx({ horizontal: true, arrowsOwnedByField: true, caretAtEnd: true }),
      ),
    ).toBeNull()
  })
})
