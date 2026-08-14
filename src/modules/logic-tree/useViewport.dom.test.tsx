// @vitest-environment jsdom
import { useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { useViewport } from './useViewport'
import { INITIAL_TRANSFORM, type Rect, type Transform } from './viewport'

afterEach(cleanup)

/**
 * jsdom はレイアウトを持たないので、キャンバスの寸法だけ差し込む。
 * **d3-zoom の配線そのものはレイアウトを要求しない**（ホイールとマウスの
 * 座標はイベントが運んでくる）ので、ここまで用意すれば挙動は追える
 */
const VIEW = { width: 1000, height: 600 }

function giveSize(el: HTMLElement): void {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: VIEW.width })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: VIEW.height })
}

/** ビューポートの状態を DOM に出す殻。内部状態を覗かずに検証するため */
function Harness({ rect, enabled = true }: { rect?: Rect; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const { transform, spaceHeld, ensureVisible } = useViewport(ref, enabled)
  return (
    <>
      <div
        ref={ref}
        data-testid="canvas"
        data-x={transform.x}
        data-y={transform.y}
        data-k={transform.k}
        data-space={String(spaceHeld)}
      >
        <textarea aria-label="文言" />
        <button
          type="button"
          onClick={() => {
            if (rect !== undefined) ensureVisible(rect)
          }}
        >
          追従
        </button>
      </div>
      {/* キャンバスの外側。額縁のツールバーに相当する */}
      <button type="button">保存</button>
    </>
  )
}

const canvas = (): HTMLElement => screen.getByTestId('canvas')

const read = (): Transform => {
  const el = canvas()
  return { x: Number(el.dataset.x), y: Number(el.dataset.y), k: Number(el.dataset.k) }
}

/** 1ノッチ（deltaY=100）ぶんの倍率。既定の wheelDelta なら 4 倍になる値 */
const ONE_NOTCH = 2 ** 0.2

describe('useViewport（Space の押下監視）', () => {
  it('テキスト入力中でないときの Space はパンの押下として取り、既定動作を止める', () => {
    render(<Harness />)
    expect(canvas().dataset.space).toBe('false')
    // 何も入力していないときの Space はページのスクロールに使われる
    expect(fireEvent.keyDown(window, { code: 'Space', key: ' ' })).toBe(false)
    expect(canvas().dataset.space).toBe('true')
  })

  it('テキスト入力中の Space は素通しする（ここを抜くと文字が打てなくなる）', () => {
    // **ノードの入力欄は常に textarea。** 既定動作を止めると空白が入らなくなる
    //（rev 10章 境界規則）
    render(<Harness />)
    const field = screen.getByLabelText('文言')
    field.focus()
    expect(fireEvent.keyDown(field, { code: 'Space', key: ' ' })).toBe(true)
    expect(canvas().dataset.space).toBe('false')
  })

  it('キャンバスの外にフォーカスがあるときの Space は奪わない', () => {
    // **ボタンにとって Space は活性化のキー。** ここを取ると、ロジックツリーを
    // 開いている間ずっと額縁のツールバーが「押しても何も起きない」ようになる
    render(<Harness />)
    screen.getByRole('button', { name: '保存' }).focus()
    expect(fireEvent.keyDown(window, { code: 'Space', key: ' ' })).toBe(true)
    expect(canvas().dataset.space).toBe('false')
  })

  it('キャンバスの中のボタンにフォーカスがあるときも Space は奪わない', () => {
    // **位置ではなく役割で判定する。** 帯の「ノードを追加」は
    // キャンバスの内側にあるので、「外か」で判定すると最初の画面で潰れる
    render(<Harness />)
    screen.getByRole('button', { name: '追従' }).focus()
    expect(fireEvent.keyDown(window, { code: 'Space', key: ' ' })).toBe(true)
    expect(canvas().dataset.space).toBe('false')
  })

  it('どこにもフォーカスが無いとき（body）は取る', () => {
    // キャンバスの空きをクリックした直後がこの状態。ここまで弾くとパンできない
    render(<Harness />)
    expect(document.activeElement).toBe(document.body)
    expect(fireEvent.keyDown(window, { code: 'Space', key: ' ' })).toBe(false)
    expect(canvas().dataset.space).toBe('true')
  })

  it('モーダルが開いている間は Space を取らない（rev 10章 境界規則）', () => {
    render(<Harness enabled={false} />)
    expect(fireEvent.keyDown(window, { code: 'Space', key: ' ' })).toBe(true)
    expect(canvas().dataset.space).toBe('false')
  })

  it('押しっぱなしのままモーダルが開いたら押下を解く', () => {
    // 解かないと、モーダルを閉じた後も「Space を押している」状態が残り、
    // ただの左ドラッグが図をパンさせる
    const { rerender } = render(<Harness />)
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    expect(canvas().dataset.space).toBe('true')
    rerender(<Harness enabled={false} />)
    expect(canvas().dataset.space).toBe('false')
  })

  it('モーダルを開いて閉じても視点（ズーム・パン）が保たれる', () => {
    // **d3 の配線は `enabled` で張り直さないこと。** 張り直すと初期値の
    // 流し込みが走り、モーダルを開閉するたびに視点が初期位置へ戻る
    //（気づきにくい形の退行なので、ここで固定しておく）
    const { rerender } = render(<Harness />)
    fireEvent.wheel(canvas(), { deltaY: -100, ctrlKey: true })
    const zoomed = read()
    expect(zoomed).not.toEqual(INITIAL_TRANSFORM)

    rerender(<Harness enabled={false} />)
    rerender(<Harness enabled />)
    expect(read()).toEqual(zoomed)
  })

  it('モーダルを閉じると Space の監視が戻る', () => {
    const { rerender } = render(<Harness enabled={false} />)
    rerender(<Harness enabled />)
    expect(fireEvent.keyDown(window, { code: 'Space', key: ' ' })).toBe(false)
    expect(canvas().dataset.space).toBe('true')
  })

  it('Space を離すと押下が解ける', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    fireEvent.keyUp(window, { code: 'Space', key: ' ' })
    expect(canvas().dataset.space).toBe('false')
  })

  it('押しっぱなしのまま窓を離れても押下が解ける', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    fireEvent.blur(window)
    expect(canvas().dataset.space).toBe('false')
  })

  it('外したあとは window に監視が残らない', () => {
    // **残ると他のテスト（と実アプリの別画面）から Space が奪われる**
    const view = render(<Harness />)
    view.unmount()
    expect(fireEvent.keyDown(window, { code: 'Space', key: ' ' })).toBe(true)
  })
})

describe('useViewport（ズーム）', () => {
  it('Ctrl+ホイールでカーソルを中心に拡大する（1ノッチで約1.15倍）', () => {
    // **d3-zoom の既定はここを2つとも外している。** 既定の filter は
    // `!event.ctrlKey` で Ctrl+ホイールを弾き、既定の wheelDelta は
    // ctrl 付きに10倍を掛ける（1ノッチで4倍）
    render(<Harness />)
    fireEvent.wheel(canvas(), { deltaY: -100, ctrlKey: true })
    const t = read()
    expect(t.k).toBeCloseTo(ONE_NOTCH, 5)
    // カーソル（jsdom では左上の 0,0）が動かないように原点が寄る
    expect(t.x).toBeCloseTo(INITIAL_TRANSFORM.x * ONE_NOTCH, 5)
  })

  it('Cmd+ホイールでもズームする（macOS）', () => {
    render(<Harness />)
    fireEvent.wheel(canvas(), { deltaY: -100, metaKey: true })
    expect(read().k).toBeCloseTo(ONE_NOTCH, 5)
  })

  it('修飾キーの無いホイールはズームしない', () => {
    // 素のホイールを奪うと、キャンバスの上でページの縦スクロールが効かなくなる
    render(<Harness />)
    fireEvent.wheel(canvas(), { deltaY: -100 })
    expect(read()).toEqual(INITIAL_TRANSFORM)
  })

  it('外したあとはキャンバスのホイールも取らない', () => {
    // d3 が要素に張った wheel は自分では外れない。**握ったままだと、
    // 外したはずのエディタが既定動作を止め続ける**（d3 は取ったホイールに
    // preventDefault を掛けるので、ここは jsdom からでも見える）
    const view = render(<Harness />)
    const el = canvas()
    view.unmount()
    expect(fireEvent.wheel(el, { deltaY: -100, ctrlKey: true })).toBe(true)
  })

  it('倍率に下限と上限がある', () => {
    render(<Harness />)
    for (let i = 0; i < 40; i += 1) fireEvent.wheel(canvas(), { deltaY: -100, ctrlKey: true })
    expect(read().k).toBe(3)
    for (let i = 0; i < 80; i += 1) fireEvent.wheel(canvas(), { deltaY: 100, ctrlKey: true })
    expect(read().k).toBe(0.2)
  })
})

describe('useViewport（パン）', () => {
  // **ドラッグの後始末を1 tick 流してから次へ進む。** d3 はドラッグの終わりに
  // 「直後のクリックを1回だけ握り潰す」listener を window の捕捉段に置き、
  // `setTimeout(0)` で外す（実ブラウザでドラッグの終了がクリックとして
  // 解釈されるのを防ぐため）。同期のまま次のテストへ進むと、その listener が
  // 生き残って**別のテストのクリックが消える**
  afterEach(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  })

  /**
   * マウスイベントを1つ送る。
   *
   * **`view` は後から差し込む。** d3 は押下の `event.view` に対して
   * 移動・解放の監視を張る（＝ドラッグ中に要素の外へ出ても追える）が、
   * vitest の jsdom 環境では `window` が IDL の Window そのものではないため
   * `new MouseEvent({ view })` が構築時に弾かれる。実ブラウザのイベントは
   * 必ず view を持つので、ここは環境の都合を埋めているだけである
   */
  function sendMouse(
    kind: 'mouseDown' | 'mouseMove' | 'mouseUp',
    target: HTMLElement | Window,
    init: MouseEventInit,
  ): void {
    const event = createEvent[kind](target as HTMLElement, init)
    Object.defineProperty(event, 'view', { value: window })
    fireEvent(target as HTMLElement, event)
  }

  /** 押下 → 移動 → 解放。d3 は移動と解放を window で受ける */
  function drag(el: HTMLElement, init: MouseEventInit): void {
    sendMouse('mouseDown', el, { clientX: 0, clientY: 0, ...init })
    sendMouse('mouseMove', window, { clientX: 30, clientY: 20 })
    sendMouse('mouseUp', window, {})
  }

  it('中ボタンのドラッグでパンする', () => {
    render(<Harness />)
    drag(canvas(), { button: 1 })
    const t = read()
    expect(t.x).toBe(INITIAL_TRANSFORM.x + 30)
    expect(t.y).toBe(INITIAL_TRANSFORM.y + 20)
    expect(t.k).toBe(1)
  })

  it('enabled が false の間は中ボタンドラッグでもパンしない', () => {
    render(<Harness enabled={false} />)
    drag(canvas(), { button: 1 })
    expect(read()).toEqual(INITIAL_TRANSFORM)
  })

  it('Space を押しながらの左ドラッグでパンする', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    drag(canvas(), { button: 0 })
    expect(read().x).toBe(INITIAL_TRANSFORM.x + 30)
  })

  it('素の左ドラッグではパンしない', () => {
    // 左ドラッグはノードの中の文字選択に要る。奪うと編集できなくなる
    render(<Harness />)
    drag(canvas(), { button: 0 })
    expect(read()).toEqual(INITIAL_TRANSFORM)
  })

  it('Space を離した後の左ドラッグはパンしない', () => {
    // 押下の解除がハンドラに届いていること（ハンドラは張り直されないので
    // 最新の値を ref から読めていないとここが緑にならない）
    render(<Harness />)
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    fireEvent.keyUp(window, { code: 'Space', key: ' ' })
    drag(canvas(), { button: 0 })
    expect(read()).toEqual(INITIAL_TRANSFORM)
  })
})

describe('useViewport（新ノードへの追従）', () => {
  /** 画面外（右）にある矩形。x=1200 は k=1・x=40 のとき画面幅 1000 の外 */
  const OUTSIDE: Rect = { x: 1200, y: 0, width: 200, height: 40 }

  it('画面外の矩形が収まるまでパンする（倍率は変えない）', () => {
    render(<Harness rect={OUTSIDE} />)
    giveSize(canvas())
    fireEvent.click(screen.getByRole('button', { name: '追従' }))
    const t = read()
    // 右端 1200+40+200=1440 を 1000-48 まで戻す → x は 40-488=-448
    expect(t.x).toBe(-448)
    // 上端 0+40=40 は余白 48 の内側に入っていないので 8 だけ下げる
    expect(t.y).toBe(48)
    expect(t.k).toBe(1)
  })

  it('画面に収まっている矩形では動かさない', () => {
    // 勝手に視点が動くと、画面共有中に全員が現在地を見失う
    render(<Harness rect={{ x: 100, y: 100, width: 200, height: 40 }} />)
    giveSize(canvas())
    fireEvent.click(screen.getByRole('button', { name: '追従' }))
    expect(read()).toEqual(INITIAL_TRANSFORM)
  })

  it('寸法を持たない（まだ描かれていない）ときは何もしない', () => {
    render(<Harness rect={OUTSIDE} />)
    fireEvent.click(screen.getByRole('button', { name: '追従' }))
    expect(read()).toEqual(INITIAL_TRANSFORM)
  })

  it('追従の後のホイールが、追従後の位置から続く（表示が飛ばない）', () => {
    // **追従は必ず d3 を経由して動かす。** React の state だけ書き換えると
    // d3 の内部状態が INITIAL のまま残り、次のホイールで画面が元の場所へ飛ぶ
    render(<Harness rect={OUTSIDE} />)
    giveSize(canvas())
    fireEvent.click(screen.getByRole('button', { name: '追従' }))
    fireEvent.wheel(canvas(), { deltaY: -100, ctrlKey: true })
    // 追従後（x=-448）を起点に拡大した値。内部状態が古いと +45.9 付近になる
    expect(read().x).toBeCloseTo(-448 * ONE_NOTCH, 5)
  })
})

describe('useViewport（enabled: モーダル・ポップアップ中の停止）', () => {
  it('enabled が false の間は Ctrl+ホイールでズームしない', () => {
    // rev 10章の境界規則。**キー監視だけでなく d3-zoom の filter も止める**——
    // 止めないと、Radix のポップアップが開いたままズームして位置がずれる
    //（Radix は scroll と resize は追うが transform の変化は追わない）
    render(<Harness enabled={false} />)
    fireEvent.wheel(canvas(), { deltaY: -100, ctrlKey: true })
    expect(read()).toEqual(INITIAL_TRANSFORM)
  })

  it('enabled を true に戻すとズームできる（最初の値で凍らせない）', () => {
    // **filter はマウント時に1回しか張らない。** enabled を素の値で閉じ込めると
    // 最初の値で凍り、モーダルを閉じてもキャンバスが死んだままになる
    const { rerender } = render(<Harness enabled={false} />)
    rerender(<Harness enabled />)
    fireEvent.wheel(canvas(), { deltaY: -100, ctrlKey: true })
    expect(read().k).toBeCloseTo(ONE_NOTCH, 5)
  })
})
