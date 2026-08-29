// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import type React from 'react'
import type { PtyIo } from '@/core/terminal/pty-io'
import type { TerminalSession } from '@/core/terminal/sessions'

/**
 * xterm が実際に描画先として受け取った要素。**クラス名で引かない**——
 * `.min-h-0.flex-1` は外側のラッパにも一致し、掴む相手が並び順で決まってしまう。
 * `term.open()` に渡る要素こそが「端末の中身」の定義そのもので、
 * `onContextMenu` が付いているのもこの要素
 */
let hostEl: HTMLElement | null = null

// xterm は canvas を使うので jsdom では動かない。まるごと差し替える
const term = {
  open: vi.fn((el: HTMLElement) => {
    hostEl = el
  }),
  // 実物の write は非同期（typings: "fires when the data was processed by
  // the parser"）だが、テストでは同期的に callback を呼べば十分——
  // callback 経由で modes.bracketedPasteMode を読む TerminalTab 側の
  // 待ち合わせを、非同期のタイミングを気にせず検証できる
  write: vi.fn((_data: unknown, callback?: () => void) => callback?.()),
  paste: vi.fn(),
  hasSelection: vi.fn(() => false),
  getSelection: vi.fn(() => ''),
  clearSelection: vi.fn(),
  onData: vi.fn(),
  dispose: vi.fn(),
  loadAddon: vi.fn(),
  attachCustomKeyEventHandler: vi.fn(),
  // xterm の `options` は書き換え可能で（typings/xterm.d.ts の
  // `options: ITerminalOptions`）、配色の差し替えはここへ代入する
  options: {} as Record<string, unknown>,
  // xterm が解析済みの DEC private mode を公開する場所
  // （typings/xterm.d.ts の `modes: IModes`）。テストから
  // `term.modes.bracketedPasteMode` を直接切り替えて、2004 を
  // 「見た」状態を模す
  modes: { bracketedPasteMode: false },
  cols: 80,
  rows: 24,
}
const fit = { fit: vi.fn() }
// vi.fn() の実装にアロー関数を渡すと `new` できない（アロー関数は
// [[Construct]] を持たない。vitest 4 系はコンストラクタ呼び出し時に
// 実装をそのまま new するため、ここは function 式にする必要がある）
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(function () {
    return term
  }),
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(function () {
    return fit
  }),
}))

// jsdom には ResizeObserver が無い。observe されたコールバックをテストから
// 呼べるフェイクに差し替える
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  callback: ResizeObserverCallback
  disconnect = vi.fn()
  unobserve = vi.fn()
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    FakeResizeObserver.instances.push(this)
  }
  // **実物の ResizeObserver は observe() を呼んだ時点で初回通知を1回自動で
  // 発火する**（対象の現在の寸法で）。このフェイクがそれを模していなかった
  // ため、「fit() は済んでいるが起動直後の pty_resize がまだ実寸で1回も
  // 飛んでいない」という穴を、既存のテストが誰も踏まずに素通りしていた
  // （指摘1）。jsdom の要素は getBoundingClientRect が既定で 0 を返すため、
  // ここでの自動発火は通常 0x0 になり、寸法 0 のガードに素直に吸収される
  observe = vi.fn((target: Element) => {
    const rect = target.getBoundingClientRect()
    this.trigger(rect.width, rect.height)
  })
  trigger(width: number, height: number): void {
    const entries = [{ contentRect: { width, height } } as ResizeObserverEntry]
    this.callback(entries, this as unknown as ResizeObserver)
  }
}
vi.stubGlobal('ResizeObserver', FakeResizeObserver)

const { Terminal: TerminalMock } = await import('@xterm/xterm')
const { TerminalTab, INSERTION_QUIET_MS, INSERTION_MAX_WAIT_MS } = await import('./TerminalTab')

// PTY からの出力バイト列。中身に意味は無い——bracketed paste が有効に
// なったかどうかは `term.modes.bracketedPasteMode`（xterm が解析した結果）
// で判定するので、ここでは「何かデータが来た」ことを表せれば十分
const SOME_PTY_OUTPUT = new Uint8Array([0x61])

/**
 * `term.modes.bracketedPasteMode` を true にしてから PTY 出力を1回流す。
 * TerminalTab は onData の callback（write が処理し終えた合図）の中で
 * modes を読むので、モードを立てるだけでは足りず、出力を流して
 * callback を発火させる必要がある。
 *
 * **これだけでは流れない**（M28修正の核心）。2004 を検出しても静穏タイマーが
 * 動き出すだけで、`INSERTION_QUIET_MS` 経つまで `term.paste()` は呼ばれない。
 * 「もう流し終えた」状態まで進めたいテストは `enableBracketedPasteAndSettle`
 * を使う
 */
function enableBracketedPasteAndEmit(pty: ReturnType<typeof fakePty>): void {
  term.modes.bracketedPasteMode = true
  pty.emit(SOME_PTY_OUTPUT)
}

/**
 * 2004 を検出させたうえで、静穏（`INSERTION_QUIET_MS`）を偽タイマーで
 * 進めて「もう流し終えた」状態まで持っていく。**呼び出し側で
 * `vi.useFakeTimers()` 済みであること**が前提——実タイマーで
 * `INSERTION_QUIET_MS` 待つとテストが遅くなる
 */
async function enableBracketedPasteAndSettle(pty: ReturnType<typeof fakePty>): Promise<void> {
  enableBracketedPasteAndEmit(pty)
  await vi.advanceTimersByTimeAsync(INSERTION_QUIET_MS)
}

function session(over: Partial<TerminalSession> = {}): TerminalSession {
  return { id: 1, label: 'Claude 1', ptyId: null, status: 'starting', message: null, initialText: null, ...over }
}

type TabProps = React.ComponentProps<typeof TerminalTab>

function fakeClipboard(text = '') {
  return {
    readText: vi.fn(async () => text),
    writeText: vi.fn(async () => undefined),
  }
}

/**
 * 既定の props を1箇所に集める。**props が増えるたびに全テストを触らずに済む**
 * ようにするため（M28 で insertion / clipboardIo / onError が増える）。
 * `rerender` するテストは、この戻り値を展開してから差分だけ上書きする
 */
function tabProps(over: Partial<TabProps> & { ptyIo: PtyIo }): TabProps {
  return {
    session: session(),
    cwd: '/proj',
    hidden: false,
    insertion: null,
    clipboardIo: fakeClipboard(),
    onError: vi.fn(),
    onRunning: vi.fn(),
    onExited: vi.fn(),
    onFailed: vi.fn(),
    ...over,
  }
}

function renderTab(over: Partial<TabProps> & { ptyIo: PtyIo }) {
  const props = tabProps(over)
  return { ...render(<TerminalTab {...props} />), props }
}

function fakePty() {
  const spawned: Array<{ cwd: string; program: string }> = []
  const resized: Array<{ id: number; cols: number; rows: number }> = []
  let onData: ((b: Uint8Array) => void) | null = null
  let onExit: ((c: number | null) => void) | null = null
  const io: PtyIo = {
    spawn: async (spec) => {
      spawned.push({ cwd: spec.cwd, program: spec.program })
      onData = spec.onData
      onExit = spec.onExit
      return 7
    },
    write: vi.fn(async () => undefined),
    resize: vi.fn(async (id, cols, rows) => {
      resized.push({ id, cols, rows })
    }),
    kill: vi.fn(async () => undefined),
  }
  return { io, spawned, resized, emit: (b: Uint8Array) => onData?.(b), exit: (c: number | null) => onExit?.(c) }
}

/**
 * StrictMode の二重マウント検証専用。呼び出しごとに違う PTY ID を返す
 * ——「生き残った側」と「捨てられた側」を ID で区別するため
 */
function fakePtyMultiSpawn() {
  const issuedIds: number[] = []
  const killedIds: number[] = []
  // spawn ごとの onExit を ID 別に持っておく。捨てられた側の onExit を
  // テストから明示的に呼べるようにするため
  const onExits = new Map<number, (code: number | null) => void>()
  // spawn ごとの onData も ID 別に持っておく。**捨てられた側へ流しても
  // 差し込まれないこと**（disposed で弾かれること）を突く経路に使う
  const onDatas = new Map<number, (b: Uint8Array) => void>()
  let nextId = 100
  const io: PtyIo = {
    spawn: async (spec) => {
      const id = nextId++
      issuedIds.push(id)
      onExits.set(id, spec.onExit)
      onDatas.set(id, spec.onData)
      return id
    },
    write: vi.fn(async () => undefined),
    resize: vi.fn(async () => undefined),
    kill: vi.fn(async (id: number) => {
      killedIds.push(id)
    }),
  }
  return {
    io,
    issuedIds,
    killedIds,
    exit: (id: number, code: number | null) => onExits.get(id)?.(code),
    emit: (id: number, b: Uint8Array) => onDatas.get(id)?.(b),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // 前のテストで書き換わった状態を戻す（fit() のモック実装が cols/rows を
  // 変えるテストがあるため）
  term.cols = 80
  term.rows = 24
  term.options = {}
  term.modes.bracketedPasteMode = false
  term.hasSelection.mockReturnValue(false)
  term.getSelection.mockReturnValue('')
  FakeResizeObserver.instances = []
  // vi.clearAllMocks() は実装（term.open が hostEl へ代入する処理）を消さない
  // ので、前のテストの要素を持ち越さないようここで明示的に落とす
  hostEl = null
})
afterEach(() => {
  cleanup()
  // このファイルの一部のテストだけ vi.useFakeTimers() を使う（静穏・上限の
  // タイマーを検証するため）。**テストごとに real へ戻す安全網をここへ
  // 一括で置く**——個々のテストが戻し忘れても、次のテストへ偽タイマーが
  // 漏れない（real のときに呼んでも無害）
  vi.useRealTimers()
})

describe('TerminalTab', () => {
  it('マウントで PTY を1本起動し、running を知らせる', async () => {
    const pty = fakePty()
    const onRunning = vi.fn()
    renderTab({ ptyIo: pty.io, onRunning })
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    expect(pty.spawned).toEqual([{ cwd: '/proj', program: 'claude' }])
  })

  it('PTY の出力を xterm へそのまま渡す', async () => {
    const pty = fakePty()
    renderTab({ ptyIo: pty.io })
    await waitFor(() => expect(pty.spawned).toHaveLength(1))
    const bytes = new Uint8Array([0xe3, 0x81, 0x82])
    pty.emit(bytes)
    // **第1引数（実際に書き込むバイト列）が変わっていないことが要**。
    // callback を渡すようになっても、画面に出る中身は今までどおり
    expect(term.write).toHaveBeenCalledWith(bytes, expect.any(Function))
  })

  it('子が終了したら exited を知らせる', async () => {
    const pty = fakePty()
    const onExited = vi.fn()
    renderTab({ ptyIo: pty.io, onExited })
    await waitFor(() => expect(pty.spawned).toHaveLength(1))
    pty.exit(0)
    expect(onExited).toHaveBeenCalledWith(1, '終了しました（コード 0）')
  })

  it('起動に失敗したら failed を知らせる', async () => {
    const pty = fakePty()
    pty.io.spawn = async () => {
      throw new Error('program not found')
    }
    const onFailed = vi.fn()
    renderTab({ ptyIo: pty.io, onFailed })
    await waitFor(() =>
      expect(onFailed).toHaveBeenCalledWith(
        1,
        'Claude Code を起動できませんでした: program not found',
      ),
    )
  })

  it('起動直後、fit() 後の実寸で pty_resize を1回呼ぶ（指摘1: spawn 前の fit() では ptyId が無く resize できない穴）', async () => {
    // spawn 解決前（ptyIdRef.current が null の間）に「隠れている間は測らない」
    // effect が fit() を1回走らせ、xterm の既定サイズ（80x24）を実寸へ変える
    // ことがある。その時点では PTY へ resize を送れないため、何もしないと
    // PTY は 80x24 のまま取り残される。fit() が実寸で桁数・行数を変えるさまを
    // 模して、spawn 解決後に実寸で resize が飛ぶことを確認する
    const pty = fakePty()
    // fit() は「隠れている間は測らない」effect（spawn 解決前、ptyId がまだ
    // 無い）と、spawn 解決直後（本テストが検証する箇所）の2回走る。
    // mockImplementationOnce を2回積んで、実物の fit() が実寸へ変える
    // さまをそれぞれの呼び出しで模す（mockImplementation で永続的に
    // 差し替えると、他のテストへ副作用が漏れる）
    fit.fit.mockImplementationOnce(() => {
      term.cols = 45
      term.rows = 12
    })
    fit.fit.mockImplementationOnce(() => {
      term.cols = 45
      term.rows = 12
    })
    const onRunning = vi.fn()
    renderTab({ ptyIo: pty.io, onRunning })
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    expect(pty.resized).toEqual([{ id: 7, cols: 45, rows: 12 }])
  })

  it('隠れて起動した場合、起動直後には resize しない（表示に戻ったときの hidden effect に任せる）', async () => {
    // display:none では寸法が測れない。spawn 解決時点で hidden なら、
    // ここで測って resize してはいけない（隠れている間は測らないという
    // 既存の原則と同じ）
    const pty = fakePty()
    renderTab({ ptyIo: pty.io, hidden: true })
    await waitFor(() => expect(pty.spawned).toHaveLength(1))
    expect(pty.resized).toEqual([])
  })

  it('**隠れている間は fit しない。表示に戻った瞬間に1回だけ fit して resize する**', async () => {
    // display:none の間は xterm が寸法を測れない（clientWidth が 0）。
    // ここで測ると開き直したときだけ表示が崩れる
    const pty = fakePty()
    const { rerender, props } = renderTab({
      ptyIo: pty.io,
      session: session({ status: 'running', ptyId: 7 }),
      hidden: true,
    })
    await waitFor(() => expect(pty.spawned).toHaveLength(1))
    expect(fit.fit).not.toHaveBeenCalled()

    rerender(<TerminalTab {...props} hidden={false} />)
    await waitFor(() => expect(fit.fit).toHaveBeenCalledTimes(1))
    expect(pty.resized).toEqual([{ id: 7, cols: 80, rows: 24 }])
  })

  it('exited のときタブの中に文言を出す', () => {
    const pty = fakePty()
    const { getByText } = renderTab({
      ptyIo: pty.io,
      session: session({ status: 'exited', message: '終了しました（コード 0）' }),
    })
    expect(getByText('終了しました（コード 0）')).toBeTruthy()
  })

  it('アンマウントすると自分の PTY を殺す（台帳が ptyId を知る前に閉じられても孤児にしない）', async () => {
    // プロセスの寿命は台帳（App の closeTerminalNow）に一本化してあるが、
    // spawn の解決と台帳への反映（onRunning）の隙間で閉じられると台帳は
    // ptyId を知らない。cleanup でも殺しておけばその窓が消える
    const pty = fakePty()
    const onRunning = vi.fn()
    const { unmount } = renderTab({ ptyIo: pty.io, onRunning })
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    expect(pty.io.kill).not.toHaveBeenCalled()

    unmount()

    await waitFor(() => expect(pty.io.kill).toHaveBeenCalledWith(7))
  })

  it('StrictMode の二重マウントでも running は生き残った1本だけに通知し、捨てた側は kill で回収する', async () => {
    // 開発時の StrictMode は effect を「実行 → 後片付け → 再実行」で二重に
    // 走らせる。spawn は2回起きるが、台帳に2本登録されては困る
    // （＝孤児 PTY が残る）。生き残った側だけ onRunning、捨てた側は
    // ptyIo.kill() で回収されるはず
    const pty = fakePtyMultiSpawn()
    const onRunning = vi.fn()
    render(
      <StrictMode>
        <TerminalTab {...tabProps({ ptyIo: pty.io, onRunning })} />
      </StrictMode>,
    )

    // 二重マウントで spawn が2回呼ばれるのを待つ
    await waitFor(() => expect(pty.issuedIds).toHaveLength(2))
    // running の通知は1回だけ（台帳に2本登録されない）
    await waitFor(() => expect(onRunning).toHaveBeenCalledTimes(1))
    // 捨てられた側は kill で回収される（孤児が残らない）
    await waitFor(() => expect(pty.killedIds).toHaveLength(1))

    const survivedId = onRunning.mock.calls[0]?.[1] as number
    const killedId = pty.killedIds[0]
    // running に通知された ID と kill された ID は別物で、
    // 合わせると発行された2本と一致する(取りこぼしも重複もない)
    expect(survivedId).not.toBe(killedId)
    expect([survivedId, killedId].sort()).toEqual([...pty.issuedIds].sort())
  })

  it('StrictMode で捨てられた側の PTY が終了イベントを出しても onExited は呼ばれない（生き残った側の終了は伝わる）', async () => {
    // 指摘1: disposed で守られていない onExit は、捨てられた側（kill 済み）の
    // 終了イベントを生きているセッションの終了として誤通知してしまう。
    // これが実機の3症状（誤った終了表示／フォルダ切替の確認が出ない／
    // タブを閉じても kill が飛ばない）の共通原因だった
    const pty = fakePtyMultiSpawn()
    const onRunning = vi.fn()
    const onExited = vi.fn()
    render(
      <StrictMode>
        <TerminalTab {...tabProps({ ptyIo: pty.io, onRunning, onExited })} />
      </StrictMode>,
    )

    await waitFor(() => expect(pty.issuedIds).toHaveLength(2))
    await waitFor(() => expect(onRunning).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(pty.killedIds).toHaveLength(1))

    const survivedId = onRunning.mock.calls[0]?.[1] as number
    const killedId = pty.killedIds[0] as number

    // 1. 捨てられた側の onExit を発火させても onExited は呼ばれない
    pty.exit(killedId, 1)
    expect(onExited).not.toHaveBeenCalled()

    // 2. 生き残った側の onExit を発火させたら onExited は呼ばれる
    //    （守りすぎて本物の終了まで落としていないこと）
    pty.exit(survivedId, 0)
    expect(onExited).toHaveBeenCalledTimes(1)
    expect(onExited).toHaveBeenCalledWith(1, '終了しました（コード 0）')
  })

  it('ペインの寸法が変わったら fit() を走らせ、桁数・行数が変わっていれば pty_resize を呼ぶ', async () => {
    const pty = fakePty()
    const onRunning = vi.fn()
    renderTab({ ptyIo: pty.io, onRunning })
    // 表示中でマウントすると「隠れている間は測らない」effect の fit() に加え、
    // spawn 解決直後にも実寸で pty_resize が1回飛ぶ（指摘1の修正）。
    // ResizeObserver 由来の呼び出しだけを見たいので、起動が落ち着いた
    // （running になった）時点で fit の呼び出し回数と resized の記録を
    // 両方クリアする
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    fit.fit.mockClear()
    pty.resized.length = 0

    const observer = FakeResizeObserver.instances.at(-1)
    expect(observer).toBeDefined()

    // fit() が実際に桁数・行数を変えるケースを模す
    fit.fit.mockImplementationOnce(() => {
      term.cols = 100
      term.rows = 30
    })
    observer?.trigger(800, 600)

    expect(fit.fit).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(pty.resized).toEqual([{ id: 7, cols: 100, rows: 30 }]))
  })

  it('桁数・行数が変わらない通知では pty_resize を呼ばない', async () => {
    const pty = fakePty()
    const onRunning = vi.fn()
    renderTab({ ptyIo: pty.io, onRunning })
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    fit.fit.mockClear()
    // 起動直後の resize（指摘1の修正）を含めない。ここで見たいのは
    // ResizeObserver 由来の呼び出しだけ
    pty.resized.length = 0

    const observer = FakeResizeObserver.instances.at(-1)
    // fit() のデフォルト実装は term.cols / term.rows を変えない
    observer?.trigger(800, 600)

    expect(fit.fit).toHaveBeenCalledTimes(1)
    expect(pty.resized).toEqual([])
  })

  it('寸法が 0 の通知では fit しない（隠れている間の通知を無視する）', async () => {
    const pty = fakePty()
    const onRunning = vi.fn()
    renderTab({ ptyIo: pty.io, onRunning })
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    fit.fit.mockClear()
    // 起動直後の resize（指摘1の修正）を含めない。ここで見たいのは
    // ResizeObserver 由来の呼び出しだけ
    pty.resized.length = 0

    const observer = FakeResizeObserver.instances.at(-1)
    observer?.trigger(0, 0)

    expect(fit.fit).not.toHaveBeenCalled()
    expect(pty.resized).toEqual([])
  })

  it('Shift+Enter で ESC+CR を書き込み、xterm の既定処理を止める', async () => {
    const pty = fakePty()
    const onRunning = vi.fn()
    renderTab({ ptyIo: pty.io, onRunning })
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))

    const handler = term.attachCustomKeyEventHandler.mock.calls[0]?.[0] as (
      event: KeyboardEvent,
    ) => boolean
    expect(handler).toBeDefined()

    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true })
    const preventDefault = vi.spyOn(event, 'preventDefault')
    const result = handler(event)

    expect(result).toBe(false)
    // xterm は false を返しても preventDefault() を自分では呼ばない
    // （node_modules/@xterm/xterm/lib/xterm.js）。呼んでおかないとブラウザの
    // 既定動作が生き残り、隠し textarea に本物の改行が挿入されてしまう
    // （1回目は改行できるが、2回目以降は改行されず送信される症状の原因）
    expect(preventDefault).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(pty.io.write).toHaveBeenCalledWith(7, `${String.fromCharCode(27)}\r`),
    )
  })

  it('素の Enter では書き込まない（preventDefault も呼ばない）', async () => {
    const pty = fakePty()
    const onRunning = vi.fn()
    renderTab({ ptyIo: pty.io, onRunning })
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))

    const handler = term.attachCustomKeyEventHandler.mock.calls[0]?.[0] as (
      event: KeyboardEvent,
    ) => boolean

    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false })
    const preventDefault = vi.spyOn(event, 'preventDefault')
    const result = handler(event)

    expect(result).toBe(true)
    expect(pty.io.write).not.toHaveBeenCalled()
    // 素の Enter は xterm に通常どおり処理させる必要がある。ここで
    // preventDefault してしまうと xterm 自身の Enter 処理まで止まる
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('Ctrl+Shift+Enter では書き込まない（修飾キーの取り違えを防ぐ、preventDefault も呼ばない）', async () => {
    const pty = fakePty()
    const onRunning = vi.fn()
    renderTab({ ptyIo: pty.io, onRunning })
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))

    const handler = term.attachCustomKeyEventHandler.mock.calls[0]?.[0] as (
      event: KeyboardEvent,
    ) => boolean

    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, ctrlKey: true })
    const preventDefault = vi.spyOn(event, 'preventDefault')
    const result = handler(event)

    expect(result).toBe(true)
    expect(pty.io.write).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('アンマウント後に term.onData 経由の書き込みが遅れて失敗しても onFailed は呼ばれない（disposed で守る）', async () => {
    // レビュー指摘: term.onData の中の write().catch() が disposed で
    // 守られていなかった。書き込みが「アンマウント後に」失敗する経路を、
    // write() の解決を手元で握って再現する
    const pty = fakePty()
    let rejectWrite: (err: unknown) => void = () => undefined
    pty.io.write = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectWrite = reject
        }),
    )
    const onRunning = vi.fn()
    const onFailed = vi.fn()
    const { unmount } = renderTab({ ptyIo: pty.io, onRunning, onFailed })
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))

    // term.onData に登録されたコールバック（xterm からのキー入力を PTY へ
    // 書き込む経路）を取り出し、書き込みを開始させる。write() はまだ解決しない
    const registeredOnData = term.onData.mock.calls.at(-1)?.[0] as (data: string) => void
    expect(registeredOnData).toBeDefined()
    registeredOnData('a')

    // ここでアンマウント（disposed = true, term.dispose()）。この時点では
    // 書き込みの失敗はまだ届いていない
    unmount()

    // 遅れて書き込みが失敗する
    rejectWrite(new Error('boom'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onFailed).not.toHaveBeenCalled()
  })

  it('（対照）アンマウントしていなければ term.onData 経由の書き込み失敗で onFailed を呼ぶ', async () => {
    // 上のテストと対にして、disposed ガードが「守りすぎ」ではないことを確認する
    const pty = fakePty()
    pty.io.write = vi.fn(async () => {
      throw new Error('boom')
    })
    const onRunning = vi.fn()
    const onFailed = vi.fn()
    renderTab({ ptyIo: pty.io, onRunning, onFailed })
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))

    const registeredOnData = term.onData.mock.calls.at(-1)?.[0] as (data: string) => void
    registeredOnData('a')

    await waitFor(() =>
      expect(onFailed).toHaveBeenCalledWith(1, '端末へ書き込めませんでした: boom'),
    )
  })

  it('StrictMode で捨てられた側の Shift+Enter ハンドラの書き込みが失敗しても onFailed は呼ばれない（生き残った側は呼ばれる）', async () => {
    // レビュー指摘: attachCustomKeyEventHandler は起動 effect の中で無条件に
    // 呼ばれるため、StrictMode の二重マウントで2回登録される。ptyIdRef は
    // コンポーネント本体の useRef で両方の effect クロージャから共有されて
    // いるので、捨てられた側のハンドラが発火しても書き込み先は「生き残った
    // 側」の実在する ptyId になる。session.id も共有なので、ここで disposed
    // ガードが無いと生きているセッションが誤って failed に落ちる
    const pty = fakePtyMultiSpawn()
    const onRunning = vi.fn()
    const onFailed = vi.fn()
    render(
      <StrictMode>
        <TerminalTab {...tabProps({ ptyIo: pty.io, onRunning, onFailed })} />
      </StrictMode>,
    )

    await waitFor(() => expect(pty.issuedIds).toHaveLength(2))
    await waitFor(() => expect(onRunning).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(pty.killedIds).toHaveLength(1))

    expect(term.attachCustomKeyEventHandler).toHaveBeenCalledTimes(2)
    const discardedHandler = term.attachCustomKeyEventHandler.mock.calls[0]?.[0] as (
      event: KeyboardEvent,
    ) => boolean
    const survivedHandler = term.attachCustomKeyEventHandler.mock.calls[1]?.[0] as (
      event: KeyboardEvent,
    ) => boolean

    pty.io.write = vi.fn(async () => {
      throw new Error('boom')
    })
    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true })

    // 1. 捨てられた側のハンドラの書き込みが失敗しても onFailed は呼ばれない
    discardedHandler(event)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onFailed).not.toHaveBeenCalled()

    // 2. 生き残った側のハンドラの書き込みが失敗したら onFailed が呼ばれる
    //    （守りすぎて本物の失敗まで落としていないこと）
    survivedHandler(event)
    await waitFor(() =>
      expect(onFailed).toHaveBeenCalledWith(1, '端末へ書き込めませんでした: boom'),
    )
  })

  it('起動待ちの間に打った入力を捨てず、spawn の解決後に打った順で送る', async () => {
    // `term.onData` の登録が spawn の解決後だと、ここで打った文字はどこにも
    // 届かない（M11 の残件「起動待ちの間に端末へ打った入力が無音で消える」）。
    // spawn の解決をテストから握って、その窓を作る
    const writes: Array<[number, string]> = []
    let release: () => void = () => undefined
    const io: PtyIo = {
      spawn: async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return 7
      },
      write: vi.fn(async (id: number, data: string) => {
        writes.push([id, data])
      }),
      resize: vi.fn(async () => undefined),
      kill: vi.fn(async () => undefined),
    }
    const onRunning = vi.fn()
    renderTab({ ptyIo: io, onRunning })

    // **spawn の解決前に onData が登録されていること**が穴そのもの
    await waitFor(() => expect(term.onData).toHaveBeenCalled())
    const emit = term.onData.mock.calls.at(-1)?.[0] as (data: string) => void
    emit('a')
    emit('b')
    // まだ PTY の ID が無いので送れない
    expect(writes).toEqual([])

    release()
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    // 溜めた2文字が、打った順で流れる
    expect(writes).toEqual([
      [7, 'a'],
      [7, 'b'],
    ])
  })

  it('起動待ちの間の Shift+Enter も捨てず、解決後に送る', async () => {
    // Shift+Enter のハンドラは `ptyId !== null` のときだけ書き込んでいたので、
    // 起動待ちの改行は黙って落ちていた。上のテストと分けるのは、こちらが
    // 通る別の経路（attachCustomKeyEventHandler）だから
    const writes: string[] = []
    let release: () => void = () => undefined
    const io: PtyIo = {
      spawn: async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return 7
      },
      write: vi.fn(async (_id: number, data: string) => {
        writes.push(data)
      }),
      resize: vi.fn(async () => undefined),
      kill: vi.fn(async () => undefined),
    }
    const onRunning = vi.fn()
    renderTab({ ptyIo: io, onRunning })
    await waitFor(() => expect(term.attachCustomKeyEventHandler).toHaveBeenCalled())
    const handler = term.attachCustomKeyEventHandler.mock.calls[0]?.[0] as (
      event: KeyboardEvent,
    ) => boolean
    handler(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }))
    expect(writes).toEqual([])

    release()
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    expect(writes).toEqual([`${String.fromCharCode(27)}\r`])
  })

  describe('起動時の差し込み（M28 実機修正: 2004 かつ出力が静まってから流す）', () => {
    // 実機の診断で確定した事実: xterm が貼り付けを ESC[200~ … ESC[201~ で
    // 囲むのはアプリが DECSET 2004（bracketed paste mode）を送った後だけ
    // ——ここまでは正しかった。だが `claude` は raw mode の初期化の一環として
    // REPL の入力欄を作るより**前**に 2004 を有効にするため、2004 を見た
    // 瞬間はまだ「貼り付けを受け付ける準備ができた」ではなかった
    // （term.paste() は呼ばれるのに Claude の入力欄に残らない不具合の原因）。
    //
    // **2004 を見た後、出力が INSERTION_QUIET_MS 途切れる（＝描き終えて
    // 入力待ちになった）まで待ってから流す。** INSERTION_MAX_WAIT_MS たっても
    // 静穏が来なければ、待たずに流す（保留し続けるのが一番悪い）。
    //
    // **判定は xterm のパーサ任せ**（term.modes.bracketedPasteMode）。
    // 以前は PTY の生バイト列から ESC[?2004h を自前で探していたが、
    // 実機では DEC private mode がアプリによって `CSI ? 1049 ; 2004 h` の
    // ようにまとめて送られることがあり、リテラル一致では取り逃がして
    // いた（起動時の差し込みが行われない不具合の原因）。

    it('bracketedPasteMode が false のまま PTY 出力が来ても差し込まれない', async () => {
      const pty = fakePty()
      renderTab({ ptyIo: pty.io, session: session({ initialText: '@docs/a.json ' }) })
      await waitFor(() => expect(pty.spawned).toHaveLength(1))

      pty.emit(SOME_PTY_OUTPUT)

      expect(term.paste).not.toHaveBeenCalled()
    })

    // **ここが今回の修正の核心。** 2004 を見ただけ（静穏を待つ前）では
    // 流れないことを主張する。以前はここで即座に term.paste() が呼ばれて
    // いたが、それが「呼ばれているのに入力欄に残らない」不具合の原因だった
    it('bracketedPasteMode が true になっただけでは流れない', async () => {
      const pty = fakePty()
      renderTab({ ptyIo: pty.io, session: session({ initialText: '@docs/a.json ' }) })
      await waitFor(() => expect(pty.spawned).toHaveLength(1))

      enableBracketedPasteAndEmit(pty)

      expect(term.paste).not.toHaveBeenCalled()
    })

    it('2004 を見た後、INSERTION_QUIET_MS のあいだ出力が無ければ流れる', async () => {
      const pty = fakePty()
      vi.useFakeTimers()
      renderTab({ ptyIo: pty.io, session: session({ initialText: '@docs/a.json ' }) })
      // spawn は setTimeout を使わないただの async 関数なので、偽タイマーの
      // 下でもマイクロタスクの解決は進む。0ms 分だけ進めて spawn の解決
      // （上限タイマーの起動）を確定させる
      await vi.advanceTimersByTimeAsync(0)
      expect(pty.spawned).toHaveLength(1)

      await enableBracketedPasteAndSettle(pty)

      expect(term.paste).toHaveBeenCalledWith('@docs/a.json ')
      expect(term.paste).toHaveBeenCalledTimes(1)
    })

    it('INSERTION_QUIET_MS 経つ前に出力が来たら待ち直す（静穏タイマーがリセットされる）', async () => {
      const pty = fakePty()
      vi.useFakeTimers()
      renderTab({ ptyIo: pty.io, session: session({ initialText: '@docs/a.json ' }) })
      await vi.advanceTimersByTimeAsync(0)

      term.modes.bracketedPasteMode = true
      pty.emit(SOME_PTY_OUTPUT) // t=0（静穏タイマーは t=INSERTION_QUIET_MS で発火する予定）
      await vi.advanceTimersByTimeAsync(INSERTION_QUIET_MS - 200)

      // 発火する前にもう一度出力が来る。タイマーは張り直され、
      // ここからさらに INSERTION_QUIET_MS 経たないと流れない
      pty.emit(SOME_PTY_OUTPUT) // t=INSERTION_QUIET_MS-200
      await vi.advanceTimersByTimeAsync(INSERTION_QUIET_MS - 200)
      // 最初の出力から見ればもう INSERTION_QUIET_MS 経っているが、
      // リセットされているのでまだ流れていないはず
      expect(term.paste).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(200)
      expect(term.paste).toHaveBeenCalledWith('@docs/a.json ')
      expect(term.paste).toHaveBeenCalledTimes(1)
    })

    it('2004 を見る前は、出力が途切れても流れない（静穏タイマーを張らないため）', async () => {
      const pty = fakePty()
      vi.useFakeTimers()
      renderTab({ ptyIo: pty.io, session: session({ initialText: '@docs/a.json ' }) })
      await vi.advanceTimersByTimeAsync(0)

      // bracketedPasteMode はまだ false のまま、出力だけが来る
      pty.emit(SOME_PTY_OUTPUT)
      await vi.advanceTimersByTimeAsync(INSERTION_QUIET_MS * 2)

      expect(term.paste).not.toHaveBeenCalled()
    })

    it('initialText が null なら bracketedPasteMode が true になり静穏になっても差し込まれない', async () => {
      const pty = fakePty()
      vi.useFakeTimers()
      renderTab({ ptyIo: pty.io })
      await vi.advanceTimersByTimeAsync(0)

      await enableBracketedPasteAndSettle(pty)

      expect(term.paste).not.toHaveBeenCalled()
    })

    it('spawn 解決から INSERTION_MAX_WAIT_MS たったら、静穏が来ていなくても保留をそのまま差し込む', async () => {
      const pty = fakePty()
      vi.useFakeTimers()
      renderTab({ ptyIo: pty.io, session: session({ initialText: '@docs/a.json ' }) })

      // spawn は setTimeout を使わないただの async 関数なので、偽タイマーの
      // 下でもマイクロタスクの解決は進む。0ms 分だけ進めて spawn の解決
      // （上限タイマーの起動）を確定させる
      await vi.advanceTimersByTimeAsync(0)
      expect(pty.spawned).toHaveLength(1)
      expect(term.paste).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(INSERTION_MAX_WAIT_MS)

      expect(term.paste).toHaveBeenCalledWith('@docs/a.json ')
      expect(term.paste).toHaveBeenCalledTimes(1)
    })

    // #13: `insertion`（@ ボタン／ドロップ）も起動時の差し込みと同じ保留の列を
    // 使う。起動中（約1秒、その後の静穏待ちも含む）に @ を押すと、直前まで
    // はここが素通りで `term.paste()` が即座に呼ばれており、起動時の
    // 差し込みと同じ症状（末尾のスペースが @ の補完に食われる）が
    // 再現していた

    it('準備前に来た insertion は保留され、2004 を見て静穏になってから paste される', async () => {
      const pty = fakePty()
      vi.useFakeTimers()
      const { rerender, props: base } = renderTab({ ptyIo: pty.io })
      await vi.advanceTimersByTimeAsync(0)

      // まだ準備できていない。ここでは paste されない
      rerender(<TerminalTab {...base} insertion={{ seq: 1, text: '@a.json ' }} />)
      expect(term.paste).not.toHaveBeenCalled()

      // 2004 は見たが、まだ静穏していない。ここでも流れない
      term.modes.bracketedPasteMode = true
      pty.emit(SOME_PTY_OUTPUT)
      expect(term.paste).not.toHaveBeenCalled()

      // 静穏になったら、保留していた insertion がここで流れる
      await vi.advanceTimersByTimeAsync(INSERTION_QUIET_MS)
      expect(term.paste).toHaveBeenCalledWith('@a.json ')
      expect(term.paste).toHaveBeenCalledTimes(1)
    })

    it('initialText と、準備前に来た insertion の両方があるとき、initialText → insertion の順で paste される', async () => {
      const pty = fakePty()
      vi.useFakeTimers()
      const { rerender, props: base } = renderTab({
        ptyIo: pty.io,
        session: session({ initialText: '@docs/a.json ' }),
      })
      await vi.advanceTimersByTimeAsync(0)

      // まだ準備できていない。起動時の差し込み（先頭）に続けて
      // insertion（@ ボタン）が押される
      rerender(<TerminalTab {...base} insertion={{ seq: 1, text: '@b.json ' }} />)
      expect(term.paste).not.toHaveBeenCalled()

      await enableBracketedPasteAndSettle(pty)

      // **押された順**——initialText が列の先頭、insertion がその後ろ
      expect(term.paste.mock.calls).toEqual([['@docs/a.json '], ['@b.json ']])
    })

    it('もう流し終えた後に来た insertion は即座に paste される', async () => {
      const pty = fakePty()
      vi.useFakeTimers()
      const { rerender, props: base } = renderTab({ ptyIo: pty.io })
      await vi.advanceTimersByTimeAsync(0)

      // 先に流し終えておく（initialText が無いので何も paste されない）。
      // 以降の insertion は保留を経由しない
      await enableBracketedPasteAndSettle(pty)
      expect(term.paste).not.toHaveBeenCalled()

      rerender(<TerminalTab {...base} insertion={{ seq: 1, text: '@a.json ' }} />)
      expect(term.paste).toHaveBeenCalledTimes(1)
      expect(term.paste).toHaveBeenCalledWith('@a.json ')
    })

    it('spawn 解決から INSERTION_MAX_WAIT_MS たったら、initialText と insertion の列がまとめて paste される', async () => {
      const pty = fakePty()
      vi.useFakeTimers()
      const { rerender, props: base } = renderTab({
        ptyIo: pty.io,
        session: session({ initialText: '@docs/a.json ' }),
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(pty.spawned).toHaveLength(1)

      // まだ準備できていない間に insertion が押される
      rerender(<TerminalTab {...base} insertion={{ seq: 1, text: '@b.json ' }} />)
      expect(term.paste).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(INSERTION_MAX_WAIT_MS)

      // 押された順（initialText → insertion）でまとめて流れる
      expect(term.paste.mock.calls).toEqual([['@docs/a.json '], ['@b.json ']])
    })

    it('onExit で保留を捨て、静穏・上限の両方のタイマーを解除する', async () => {
      const pty = fakePty()
      vi.useFakeTimers()
      renderTab({ ptyIo: pty.io, session: session({ initialText: '@docs/a.json ' }) })
      await vi.advanceTimersByTimeAsync(0)

      // 2004 を検出させ、静穏タイマー（と、spawn 解決時に張られた上限
      // タイマー）の両方が生きている状態にする
      term.modes.bracketedPasteMode = true
      pty.emit(SOME_PTY_OUTPUT)

      pty.exit(0)

      // 両方のタイマーが解除されていれば、上限ぶん時間を進めても
      // paste は呼ばれない（解除し忘れがあれば、どちらかのタイマーが
      // 生き残ってここで誤って流れてしまう）
      await vi.advanceTimersByTimeAsync(INSERTION_MAX_WAIT_MS)
      expect(term.paste).not.toHaveBeenCalled()
    })
  })

  it('insertion.seq が変わったときだけ差し込む（もう流し終えた後は即座に paste する）', async () => {
    const pty = fakePty()
    vi.useFakeTimers()
    const { rerender, props: base } = renderTab({ ptyIo: pty.io })
    await vi.advanceTimersByTimeAsync(0)
    // **先に準備を済ませておく。** このテストの主張は「seq の重複排除」で
    // あって「2004・静穏待ちのゲート」ではない（ゲートは上の describe が見る）。
    // 見せておかないと insertion effect が即座に paste せず保留へ積むだけに
    // なり、以降のアサーションが成り立たない
    await enableBracketedPasteAndSettle(pty)

    rerender(<TerminalTab {...base} insertion={{ seq: 1, text: '@a.json ' }} />)
    expect(term.paste).toHaveBeenCalledTimes(1)
    expect(term.paste).toHaveBeenCalledWith('@a.json ')

    // **同じ seq で再描画しても二度は流さない。** ここが「同じ指示が二度
    // 実行されない」という主張そのもの
    rerender(<TerminalTab {...base} insertion={{ seq: 1, text: '@a.json ' }} />)
    expect(term.paste).toHaveBeenCalledTimes(1)

    // **同じ text でも seq が進めば流す**（同じファイルを続けて2回渡す操作）
    rerender(<TerminalTab {...base} insertion={{ seq: 2, text: '@a.json ' }} />)
    expect(term.paste).toHaveBeenCalledTimes(2)
  })

  it('StrictMode の二重マウントでも起動時の差し込みは1回だけ', async () => {
    const pty = fakePtyMultiSpawn()
    vi.useFakeTimers()
    render(
      <StrictMode>
        <TerminalTab {...tabProps({ ptyIo: pty.io, session: session({ initialText: '@a.json ' }) })} />
      </StrictMode>,
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(pty.issuedIds).toHaveLength(2)

    // 両方に出力を流し、静穏になるまで進める（bracketedPasteMode は先に
    // true にしておく）。**捨てられた側は disposed で弾かれ、生き残った
    // 側だけが流す**——onRunning を取っていないのでどちらが生存側かは
    // 区別できないが、両方へ流しても1回にしかならないことがその証拠になる
    term.modes.bracketedPasteMode = true
    for (const id of pty.issuedIds) pty.emit(id, SOME_PTY_OUTPUT)
    await vi.advanceTimersByTimeAsync(INSERTION_QUIET_MS)

    expect(term.paste).toHaveBeenCalledTimes(1)
    expect(term.paste).toHaveBeenCalledWith('@a.json ')
  })

  it('選択があればコピーして選択を解除する（メニューは出さない）', async () => {
    const pty = fakePty()
    const clipboardIo = fakeClipboard()
    term.hasSelection.mockReturnValue(true)
    term.getSelection.mockReturnValue('選択したところ')
    renderTab({ ptyIo: pty.io, clipboardIo })
    await waitFor(() => expect(pty.spawned).toHaveLength(1))

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    const dispatched = hostEl?.dispatchEvent(event)

    expect(dispatched).toBe(false) // preventDefault された＝既定メニューは出ない
    await waitFor(() => expect(clipboardIo.writeText).toHaveBeenCalledWith('選択したところ'))
    // **書き込みが解決してから選択を外す**（設計 §7.1 の順）ので、
    // clearSelection の呼び出しも非同期に待つ
    await waitFor(() => expect(term.clearSelection).toHaveBeenCalledTimes(1))
    expect(clipboardIo.readText).not.toHaveBeenCalled()
  })

  it('選択が無ければクリップボードを貼り付ける', async () => {
    const pty = fakePty()
    const clipboardIo = fakeClipboard('貼るテキスト')
    renderTab({ ptyIo: pty.io, clipboardIo })
    await waitFor(() => expect(pty.spawned).toHaveLength(1))

    hostEl?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))

    await waitFor(() => expect(term.paste).toHaveBeenCalledWith('貼るテキスト'))
    expect(clipboardIo.writeText).not.toHaveBeenCalled()
  })

  it('クリップボードが空なら何もしない', async () => {
    const pty = fakePty()
    const clipboardIo = fakeClipboard('')
    renderTab({ ptyIo: pty.io, clipboardIo })
    await waitFor(() => expect(pty.spawned).toHaveLength(1))

    hostEl?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))

    await waitFor(() => expect(clipboardIo.readText).toHaveBeenCalled())
    expect(term.paste).not.toHaveBeenCalled()
  })

  it('コピーの失敗は握り潰さず onError へ出す（セッションは殺さない）', async () => {
    const pty = fakePty()
    const clipboardIo = fakeClipboard()
    clipboardIo.writeText.mockRejectedValue(new Error('denied'))
    term.hasSelection.mockReturnValue(true)
    term.getSelection.mockReturnValue('x')
    const onError = vi.fn()
    const onFailed = vi.fn()
    renderTab({ ptyIo: pty.io, clipboardIo, onError, onFailed })
    await waitFor(() => expect(pty.spawned).toHaveLength(1))

    hostEl?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))

    await waitFor(() => expect(onError).toHaveBeenCalledWith('コピーできませんでした: denied'))
    // **`onFailed` は呼ばない。** あれはセッションが死んだときの経路で、
    // コピーの失敗でタブを「終了」扱いにしてはいけない
    expect(onFailed).not.toHaveBeenCalled()
    // **失敗したときは選択を残す。** 先に外していると、やり直すための
    // 選択が既に消えている（修正4。設計 §7.1 の順）
    expect(term.clearSelection).not.toHaveBeenCalled()
  })
})

describe('端末の配色（M28: ダーク固定）', () => {
  /**
   * jsdom は `palette.css` を読まないので `getPropertyValue` は空文字を返す。
   * `TerminalTab` は `.dark` を付けた使い捨て要素から読むので、その要素への
   * 問い合わせだけを差し替える。**`documentElement`（アプリの明暗の
   * 切り替え先）への問い合わせは別の値で差し替え、他の要素は実物へ委ねる**
   *（testing-library の内部も getComputedStyle を使うため、丸ごと
   * 差し替えるとクエリが壊れる）。documentElement 側を変えても結果が
   * 変わらないことが、「`.dark` の要素だけを読んでいる」ことの証拠になる
   */
  let darkTokens: Record<string, string> = {}
  let rootTokens: Record<string, string> = {}
  let spy: { mockRestore: () => void } | null = null

  const LIGHT: Record<string, string> = {
    '--surface': 'oklch(0.985 0 0)',
    '--ink': 'oklch(0.18 0 0)',
    '--surface-muted': 'oklch(0.91 0 0)',
  }
  const DARK: Record<string, string> = {
    '--surface': 'oklch(0.205 0 0)',
    '--ink': 'oklch(0.88 0 0)',
    '--surface-muted': 'oklch(0.27 0 0)',
  }

  beforeEach(() => {
    darkTokens = {}
    rootTokens = {}
    const real = window.getComputedStyle.bind(window)
    spy = vi.spyOn(window, 'getComputedStyle').mockImplementation(((
      element: Element,
      pseudo?: string | null,
    ) => {
      if (element instanceof HTMLElement && element.classList.contains('dark')) {
        return {
          getPropertyValue: (name: string) => darkTokens[name] ?? '',
        } as unknown as CSSStyleDeclaration
      }
      if (element === document.documentElement) {
        return {
          getPropertyValue: (name: string) => rootTokens[name] ?? '',
        } as unknown as CSSStyleDeclaration
      }
      return real(element, pseudo)
    }) as typeof window.getComputedStyle)
  })
  afterEach(() => {
    spy?.mockRestore()
    spy = null
  })

  it('マウント時に .dark 側の役割トークンから配色を作って xterm へ渡す', async () => {
    darkTokens = DARK
    const pty = fakePty()
    const onRunning = vi.fn()
    renderTab({ ptyIo: pty.io, onRunning })
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))

    const options = (TerminalMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      minimumContrastRatio?: number
      theme?: { background?: string }
    }
    // 16色は xterm の既定のまま。読めない濃さは minimumContrastRatio に任せる
    expect(options.minimumContrastRatio).toBe(4.5)
    expect(options.theme?.background).toMatch(/^#[0-9a-f]{6}$/)

    // 読み取り用の使い捨て要素を残さない（残すと DOM に見えない要素が溜まる）
    expect(document.body.querySelectorAll('.dark')).toHaveLength(0)
  })

  /**
   * xterm の Terminal はコンストラクタへ渡した `theme` をそのまま保持する
   * わけではない（このファイルのモックはコンストラクタ引数を無視する）ので、
   * `new Terminal(options)` に渡った引数そのもの
   *（`TerminalMock.mock.calls[callIndex][0]`）を見て確かめる
   */
  const constructedBackground = (callIndex: number): string | undefined => {
    const options = (TerminalMock as unknown as ReturnType<typeof vi.fn>).mock.calls[
      callIndex
    ]?.[0] as { theme?: { background?: string } }
    return options.theme?.background
  }

  it('documentElement（アプリの明暗）を変えても配色は変わらない（.dark の要素だけを読む）', async () => {
    darkTokens = DARK
    rootTokens = LIGHT
    const pty1 = fakePty()
    const { unmount } = renderTab({ ptyIo: pty1.io })
    await waitFor(() => expect(pty1.spawned).toHaveLength(1))
    unmount()

    // documentElement 側だけ変える。**darkTokens は変えていない**
    rootTokens = DARK
    const pty2 = fakePty()
    renderTab({ ptyIo: pty2.io })
    await waitFor(() => expect(pty2.spawned).toHaveLength(1))

    expect(constructedBackground(1)).toBe(constructedBackground(0))
    expect(constructedBackground(0)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('.dark 側のトークンを変えると配色も変わる（読んでいる先がそこである証拠）', async () => {
    darkTokens = DARK
    const pty1 = fakePty()
    const { unmount } = renderTab({ ptyIo: pty1.io })
    await waitFor(() => expect(pty1.spawned).toHaveLength(1))
    unmount()

    darkTokens = LIGHT
    const pty2 = fakePty()
    renderTab({ ptyIo: pty2.io })
    await waitFor(() => expect(pty2.spawned).toHaveLength(1))

    expect(constructedBackground(1)).not.toBe(constructedBackground(0))
  })

  it('トークンが読めなければ配色を渡さない（xterm の既定に任せる）', async () => {
    darkTokens = {}
    const pty = fakePty()
    const onRunning = vi.fn()
    renderTab({ ptyIo: pty.io, onRunning })
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))

    const options = (TerminalMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      theme?: unknown
    }
    expect(options.theme).toBeUndefined()
  })
})
