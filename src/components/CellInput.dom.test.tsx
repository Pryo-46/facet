// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CellInput } from './CellInput'

// globals: false なので自動クリーンアップは効かない。明示的に呼ぶ
afterEach(cleanup)

describe('CellInput', () => {
  it('変換中は親へ値を上げず、確定時に1回だけ上げる（IME の巻き戻り防止）', () => {
    const onValueChange = vi.fn()
    render(<CellInput value="" onValueChange={onValueChange} aria-label="名称" />)
    const el = screen.getByLabelText('名称') as HTMLInputElement

    fireEvent.compositionStart(el)
    fireEvent.change(el, { target: { value: 'じゅちゅう' } })
    expect(onValueChange).not.toHaveBeenCalled()
    // 変換中の表示は入力そのもの（親の値で巻き戻らない）
    expect(el.value).toBe('じゅちゅう')

    fireEvent.compositionEnd(el, { target: { value: '受注' } })
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith('受注')
  })

  it('変換していない入力はそのまま親へ上がる', () => {
    const onValueChange = vi.fn()
    render(<CellInput value="" onValueChange={onValueChange} aria-label="名称" />)
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'API' } })
    expect(onValueChange).toHaveBeenCalledWith('API')
  })

  it('sanitize が null を返す入力はデータに載せない（空の名称）', () => {
    const onValueChange = vi.fn()
    render(
      <CellInput
        value="受注"
        onValueChange={onValueChange}
        sanitize={(raw) => (raw.trim() === '' ? null : raw)}
        aria-label="名称"
      />,
    )
    const el = screen.getByLabelText('名称') as HTMLInputElement
    fireEvent.change(el, { target: { value: '' } })
    expect(onValueChange).not.toHaveBeenCalled()
    // 表示は空のまま編集を続けられる
    expect(el.value).toBe('')
    // セルを抜けたら確定値に戻る
    fireEvent.blur(el)
    expect(el.value).toBe('受注')
  })

  it('親から来た値の変更が表示に反映される（Undo の表示反映の経路）', () => {
    const { rerender } = render(<CellInput value="受注" onValueChange={() => {}} aria-label="名称" />)
    const el = screen.getByLabelText('名称') as HTMLInputElement
    fireEvent.change(el, { target: { value: '受注書' } })
    rerender(<CellInput value="受注書" onValueChange={() => {}} aria-label="名称" />)
    expect(el.value).toBe('受注書')
    // Undo で親が戻したら表示も戻る
    rerender(<CellInput value="受注" onValueChange={() => {}} aria-label="名称" />)
    expect(el.value).toBe('受注')
  })
})

/**
 * macOS（WKWebView）と Linux（WebKitGTK）は、変換を確定した Enter の keydown を
 * compositionend の **後** に投げる。そのイベントの isComposing は false なので、
 * 操作言語の IME ガード（resolveCommand の1行目）をすり抜ける。
 * WebKit bug 165004
 */
describe('CellInput: 変換確定の Enter（WebKit の順序）', () => {
  const setup = () => {
    const onFieldKeyDown = vi.fn()
    render(
      <CellInput value="" onValueChange={() => {}} onFieldKeyDown={onFieldKeyDown} aria-label="名称" />,
    )
    return { onFieldKeyDown, el: screen.getByLabelText('名称') }
  }

  it('compositionend の直後に来た Enter は呼び出し側へ渡さない', () => {
    const { onFieldKeyDown, el } = setup()
    fireEvent.compositionStart(el)
    fireEvent.change(el, { target: { value: 'じゅちゅう' } })
    fireEvent.compositionEnd(el, { target: { value: '受注' } })
    // isComposing は false で来る。これが WebKit の順序
    fireEvent.keyDown(el, { key: 'Enter' })
    expect(onFieldKeyDown).not.toHaveBeenCalled()
  })

  it('確定の Enter を離したあとの Enter は通す（行を増やせなくなっては困る）', () => {
    const { onFieldKeyDown, el } = setup()
    fireEvent.compositionStart(el)
    fireEvent.compositionEnd(el, { target: { value: '受注' } })
    fireEvent.keyDown(el, { key: 'Enter' })
    fireEvent.keyUp(el, { key: 'Enter' })
    fireEvent.keyDown(el, { key: 'Enter' })
    expect(onFieldKeyDown).toHaveBeenCalledTimes(1)
  })

  it('Chromium の順序（keydown が先）でも確定後の打鍵を握り潰さない', () => {
    const { onFieldKeyDown, el } = setup()
    fireEvent.compositionStart(el)
    // 変換中の keydown。isComposing が true なので誰も反応しない
    fireEvent.keyDown(el, { key: 'Enter', isComposing: true })
    fireEvent.compositionEnd(el, { target: { value: '受注' } })
    fireEvent.keyUp(el, { key: 'Enter' })
    fireEvent.keyDown(el, { key: 'Enter' })
    expect(onFieldKeyDown).toHaveBeenCalledTimes(1)
  })

  it('変換中の keydown は呼び出し側へ渡さない', () => {
    const { onFieldKeyDown, el } = setup()
    fireEvent.compositionStart(el)
    fireEvent.keyDown(el, { key: 'Enter', isComposing: true })
    expect(onFieldKeyDown).not.toHaveBeenCalled()
  })

  it('変換と関係のない Enter はそのまま渡す', () => {
    const { onFieldKeyDown, el } = setup()
    fireEvent.keyDown(el, { key: 'Enter' })
    expect(onFieldKeyDown).toHaveBeenCalledTimes(1)
  })
})

describe('CellInput: 複数行', () => {
  it('multiline なら textarea として描かれる', () => {
    render(<CellInput multiline value="" onValueChange={() => {}} aria-label="定義" />)
    expect(screen.getByLabelText('定義').tagName).toBe('TEXTAREA')
  })

  it('multiline でない既定は input のまま', () => {
    render(<CellInput value="" onValueChange={() => {}} aria-label="名称" />)
    expect(screen.getByLabelText('名称').tagName).toBe('INPUT')
  })

  it('textarea でも変換中は親へ値を上げない（IME の巻き戻り防止）', () => {
    const onValueChange = vi.fn()
    render(<CellInput multiline value="" onValueChange={onValueChange} aria-label="定義" />)
    const el = screen.getByLabelText('定義') as HTMLTextAreaElement

    fireEvent.compositionStart(el)
    fireEvent.change(el, { target: { value: 'じゅちゅう' } })
    expect(onValueChange).not.toHaveBeenCalled()

    fireEvent.compositionEnd(el, { target: { value: '受注' } })
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith('受注')
  })

  it('改行を含む値をそのまま扱える（外部が書いた複数行の定義）', () => {
    const onValueChange = vi.fn()
    render(<CellInput multiline value="" onValueChange={onValueChange} aria-label="定義" />)
    fireEvent.change(screen.getByLabelText('定義'), { target: { value: '1行目\n2行目' } })
    expect(onValueChange).toHaveBeenCalledWith('1行目\n2行目')
  })

  it('autoSize={false} でも IME 変換中は親へ値を上げない', () => {
    const onValueChange = vi.fn()
    render(
      <CellInput multiline autoSize={false} aria-label="ノード" value="" onValueChange={onValueChange} />,
    )
    const el = screen.getByLabelText('ノード')
    fireEvent.compositionStart(el)
    fireEvent.change(el, { target: { value: 'じゅちゅう' } })
    expect(onValueChange).not.toHaveBeenCalled()
    fireEvent.compositionEnd(el, { target: { value: '受注' } })
    expect(onValueChange).toHaveBeenCalledWith('受注')
  })
})

describe('autoSize', () => {
  // jsdom はレイアウトを持たないので、measure() が読む値を差し込んで
  // 「測れる環境」を作る。これをしないと measure() は行間の判定で抜けてしまい、
  // autoSize の有無に関わらず rows が 1 のままになって、分岐を区別できない
  let restore: (() => void) | null = null

  beforeEach(() => {
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'scrollHeight',
    )
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 100,
    })
    const original = window.getComputedStyle
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation(((
      el: Element,
      pseudo?: string | null,
    ) => {
      const style = original.call(window, el, pseudo ?? undefined)
      return new Proxy(style, {
        get(target, key) {
          if (key === 'lineHeight') return '20px'
          if (key === 'paddingTop' || key === 'paddingBottom') return '0px'
          return Reflect.get(target, key)
        },
      })
    }) as typeof window.getComputedStyle)
    restore = () => {
      spy.mockRestore()
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', scrollHeightDescriptor)
      } else {
        delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).scrollHeight
      }
    }
  })

  afterEach(() => {
    restore?.()
    restore = null
  })

  it('既定（autoSize 省略）では内容に合わせて rows を決める', () => {
    render(<CellInput multiline aria-label="セル" value={'あ\nい\nう'} onValueChange={() => {}} />)
    // scrollHeight 100 / lineHeight 20 = 5行
    expect((screen.getByLabelText('セル') as HTMLTextAreaElement).rows).toBe(5)
  })

  it('autoSize={false} のとき rows を自分で決めない（高さは CSS に委ねる）', () => {
    render(
      <CellInput
        multiline
        autoSize={false}
        aria-label="セル"
        value={'あ\nい\nう'}
        onValueChange={() => {}}
      />,
    )
    expect((screen.getByLabelText('セル') as HTMLTextAreaElement).rows).toBe(1)
  })
})

describe('CellInput: 遅延スライスの到着（loadingdone）で測り直される', () => {
  // ↑の autoSize 節と同じ土台（scrollHeight スタブ ＋ getComputedStyle の
  // lineHeight '20px'）を差し込んで「測れる環境」を作り、そこに今回の
  // document.fonts fake（fire ヘルパ）を重ねる。scrollHeight を可変にして
  // loadingdone の前後で値を変え、rows が実際に動くかを見る
  type Listener = (e: unknown) => void
  let listeners: Map<string, Set<Listener>>
  let restore: (() => void) | null = null
  let scrollHeight = 100

  beforeEach(() => {
    listeners = new Map()
    scrollHeight = 100
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        ready: new Promise<void>(() => {}),
        addEventListener: (type: string, fn: Listener) => {
          if (!listeners.has(type)) listeners.set(type, new Set())
          listeners.get(type)!.add(fn)
        },
        removeEventListener: (type: string, fn: Listener) => {
          listeners.get(type)?.delete(fn)
        },
      },
    })

    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'scrollHeight',
    )
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })
    const original = window.getComputedStyle
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation(((
      el: Element,
      pseudo?: string | null,
    ) => {
      const style = original.call(window, el, pseudo ?? undefined)
      return new Proxy(style, {
        get(target, key) {
          if (key === 'lineHeight') return '20px'
          if (key === 'paddingTop' || key === 'paddingBottom') return '0px'
          return Reflect.get(target, key)
        },
      })
    }) as typeof window.getComputedStyle)
    restore = () => {
      spy.mockRestore()
      if (scrollHeightDescriptor) {
        Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', scrollHeightDescriptor)
      } else {
        delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).scrollHeight
      }
    }
  })

  afterEach(() => {
    // **順序に注意。** ファイル先頭の `afterEach(cleanup)` はこの describe の
    // 外側で登録されているため、後（アンマウント）に走る。先に document.fonts
    // を外すと、アンマウント時の effect クリーンアップが
    // removeEventListener を呼べず落ちる——ここで先にアンマウントしておく
    cleanup()
    Reflect.deleteProperty(document, 'fonts')
    restore?.()
    restore = null
  })

  const fire = (type: string, event: unknown): void => {
    for (const fn of listeners.get(type) ?? []) fn(event)
  }

  it('loadingdone の到着で rows が測り直される（5行 → 7行）', () => {
    render(<CellInput multiline aria-label="セル" value={'あ\nい\nう'} onValueChange={() => {}} />)
    const el = screen.getByLabelText('セル') as HTMLTextAreaElement
    // scrollHeight 100 / lineHeight 20 = 5行
    expect(el.rows).toBe(5)
    // 珍しい字のスライスが後から届いて必要行数が変わった、に相当する変化
    scrollHeight = 140
    act(() => fire('loadingdone', { fontfaces: [{}] }))
    // scrollHeight 140 / lineHeight 20 = 7行
    expect(el.rows).toBe(7)
  })

  it('multiline でマウントすると loadingdone に購読し、アンマウントで外れる', () => {
    const { unmount } = render(
      <CellInput multiline aria-label="セル" value="" onValueChange={() => {}} />,
    )
    expect(listeners.get('loadingdone')?.size).toBe(1)
    unmount()
    expect(listeners.get('loadingdone')?.size).toBe(0)
  })
})
