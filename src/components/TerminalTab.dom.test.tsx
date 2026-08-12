// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import type { PtyIo } from '@/core/terminal/pty-io'
import type { TerminalSession } from '@/core/terminal/sessions'

// xterm は canvas を使うので jsdom では動かない。まるごと差し替える
const term = {
  open: vi.fn(),
  write: vi.fn(),
  onData: vi.fn(),
  dispose: vi.fn(),
  loadAddon: vi.fn(),
  attachCustomKeyEventHandler: vi.fn(),
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
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    FakeResizeObserver.instances.push(this)
  }
  trigger(width: number, height: number): void {
    const entries = [{ contentRect: { width, height } } as ResizeObserverEntry]
    this.callback(entries, this as unknown as ResizeObserver)
  }
}
vi.stubGlobal('ResizeObserver', FakeResizeObserver)

const { TerminalTab } = await import('./TerminalTab')

function session(over: Partial<TerminalSession> = {}): TerminalSession {
  return { id: 1, label: 'Claude 1', ptyId: null, status: 'starting', message: null, ...over }
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
  let nextId = 100
  const io: PtyIo = {
    spawn: async (spec) => {
      const id = nextId++
      issuedIds.push(id)
      onExits.set(id, spec.onExit)
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
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // 前のテストで書き換わった状態を戻す（fit() のモック実装が cols/rows を
  // 変えるテストがあるため）
  term.cols = 80
  term.rows = 24
  FakeResizeObserver.instances = []
})
afterEach(cleanup)

describe('TerminalTab', () => {
  it('マウントで PTY を1本起動し、running を知らせる', async () => {
    const pty = fakePty()
    const onRunning = vi.fn()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    expect(pty.spawned).toEqual([{ cwd: '/proj', program: 'claude' }])
  })

  it('PTY の出力を xterm へそのまま渡す', async () => {
    const pty = fakePty()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={vi.fn()}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(pty.spawned).toHaveLength(1))
    const bytes = new Uint8Array([0xe3, 0x81, 0x82])
    pty.emit(bytes)
    expect(term.write).toHaveBeenCalledWith(bytes)
  })

  it('子が終了したら exited を知らせる', async () => {
    const pty = fakePty()
    const onExited = vi.fn()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={vi.fn()}
        onExited={onExited}
        onFailed={vi.fn()}
      />,
    )
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
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={vi.fn()}
        onExited={vi.fn()}
        onFailed={onFailed}
      />,
    )
    await waitFor(() =>
      expect(onFailed).toHaveBeenCalledWith(
        1,
        'Claude Code を起動できませんでした: program not found',
      ),
    )
  })

  it('**隠れている間は fit しない。表示に戻った瞬間に1回だけ fit して resize する**', async () => {
    // display:none の間は xterm が寸法を測れない（clientWidth が 0）。
    // ここで測ると開き直したときだけ表示が崩れる
    const pty = fakePty()
    const props = {
      session: session({ status: 'running', ptyId: 7 }),
      cwd: '/proj',
      ptyIo: pty.io,
      onRunning: vi.fn(),
      onExited: vi.fn(),
      onFailed: vi.fn(),
    }
    const { rerender } = render(<TerminalTab {...props} hidden />)
    await waitFor(() => expect(pty.spawned).toHaveLength(1))
    expect(fit.fit).not.toHaveBeenCalled()

    rerender(<TerminalTab {...props} hidden={false} />)
    await waitFor(() => expect(fit.fit).toHaveBeenCalledTimes(1))
    expect(pty.resized).toEqual([{ id: 7, cols: 80, rows: 24 }])
  })

  it('exited のときタブの中に文言を出す', () => {
    const pty = fakePty()
    const { getByText } = render(
      <TerminalTab
        session={session({ status: 'exited', message: '終了しました（コード 0）' })}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={vi.fn()}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    expect(getByText('終了しました（コード 0）')).toBeTruthy()
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
        <TerminalTab
          session={session()}
          cwd="/proj"
          ptyIo={pty.io}
          hidden={false}
          onRunning={onRunning}
          onExited={vi.fn()}
          onFailed={vi.fn()}
        />
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
        <TerminalTab
          session={session()}
          cwd="/proj"
          ptyIo={pty.io}
          hidden={false}
          onRunning={onRunning}
          onExited={onExited}
          onFailed={vi.fn()}
        />
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
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    // 表示中でマウントすると「隠れている間は測らない」effect が起動直後に
    // 1回 fit() を呼ぶ。ResizeObserver 由来の呼び出しだけを見たいので、
    // 起動が落ち着いた（running になった）時点で一旦クリアする
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    fit.fit.mockClear()

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
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    fit.fit.mockClear()

    const observer = FakeResizeObserver.instances.at(-1)
    // fit() のデフォルト実装は term.cols / term.rows を変えない
    observer?.trigger(800, 600)

    expect(fit.fit).toHaveBeenCalledTimes(1)
    expect(pty.resized).toEqual([])
  })

  it('寸法が 0 の通知では fit しない（隠れている間の通知を無視する）', async () => {
    const pty = fakePty()
    const onRunning = vi.fn()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    fit.fit.mockClear()

    const observer = FakeResizeObserver.instances.at(-1)
    observer?.trigger(0, 0)

    expect(fit.fit).not.toHaveBeenCalled()
    expect(pty.resized).toEqual([])
  })

  it('Shift+Enter で ESC+CR を書き込み、xterm の既定処理を止める', async () => {
    const pty = fakePty()
    const onRunning = vi.fn()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))

    const handler = term.attachCustomKeyEventHandler.mock.calls[0]?.[0] as (
      event: KeyboardEvent,
    ) => boolean
    expect(handler).toBeDefined()

    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true })
    const result = handler(event)

    expect(result).toBe(false)
    await waitFor(() =>
      expect(pty.io.write).toHaveBeenCalledWith(7, `${String.fromCharCode(27)}\r`),
    )
  })

  it('素の Enter では書き込まない', async () => {
    const pty = fakePty()
    const onRunning = vi.fn()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))

    const handler = term.attachCustomKeyEventHandler.mock.calls[0]?.[0] as (
      event: KeyboardEvent,
    ) => boolean

    const result = handler(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false }))

    expect(result).toBe(true)
    expect(pty.io.write).not.toHaveBeenCalled()
  })

  it('Ctrl+Shift+Enter では書き込まない（修飾キーの取り違えを防ぐ）', async () => {
    const pty = fakePty()
    const onRunning = vi.fn()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))

    const handler = term.attachCustomKeyEventHandler.mock.calls[0]?.[0] as (
      event: KeyboardEvent,
    ) => boolean

    const result = handler(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, ctrlKey: true }),
    )

    expect(result).toBe(true)
    expect(pty.io.write).not.toHaveBeenCalled()
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
    const { unmount } = render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={onFailed}
      />,
    )
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
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={onFailed}
      />,
    )
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
        <TerminalTab
          session={session()}
          cwd="/proj"
          ptyIo={pty.io}
          hidden={false}
          onRunning={onRunning}
          onExited={vi.fn()}
          onFailed={onFailed}
        />
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
})
