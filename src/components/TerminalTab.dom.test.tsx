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
  // xterm の `options` は書き換え可能で（typings/xterm.d.ts の
  // `options: ITerminalOptions`）、配色の差し替えはここへ代入する
  options: {} as Record<string, unknown>,
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
  term.options = {}
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
        dark={false}
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
        dark={false}
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
        dark={false}
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
        dark={false}
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
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        dark={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))
    expect(pty.resized).toEqual([{ id: 7, cols: 45, rows: 12 }])
  })

  it('隠れて起動した場合、起動直後には resize しない（表示に戻ったときの hidden effect に任せる）', async () => {
    // display:none では寸法が測れない。spawn 解決時点で hidden なら、
    // ここで測って resize してはいけない（隠れている間は測らないという
    // 既存の原則と同じ）
    const pty = fakePty()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden
        dark={false}
        onRunning={vi.fn()}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(pty.spawned).toHaveLength(1))
    expect(pty.resized).toEqual([])
  })

  it('**隠れている間は fit しない。表示に戻った瞬間に1回だけ fit して resize する**', async () => {
    // display:none の間は xterm が寸法を測れない（clientWidth が 0）。
    // ここで測ると開き直したときだけ表示が崩れる
    const pty = fakePty()
    const props = {
      session: session({ status: 'running', ptyId: 7 }),
      cwd: '/proj',
      ptyIo: pty.io,
      dark: false,
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
        dark={false}
        onRunning={vi.fn()}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    expect(getByText('終了しました（コード 0）')).toBeTruthy()
  })

  it('アンマウントすると自分の PTY を殺す（台帳が ptyId を知る前に閉じられても孤児にしない）', async () => {
    // プロセスの寿命は台帳（App の closeTerminalNow）に一本化してあるが、
    // spawn の解決と台帳への反映（onRunning）の隙間で閉じられると台帳は
    // ptyId を知らない。cleanup でも殺しておけばその窓が消える
    const pty = fakePty()
    const onRunning = vi.fn()
    const { unmount } = render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        dark={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
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
        <TerminalTab
          session={session()}
          cwd="/proj"
          ptyIo={pty.io}
          hidden={false}
          dark={false}
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
          dark={false}
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
        dark={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
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
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        dark={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
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
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        dark={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
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
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        dark={false}
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
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        dark={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
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
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        dark={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
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
    const { unmount } = render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        dark={false}
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
        dark={false}
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
          dark={false}
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
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={io}
        hidden={false}
        dark={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )

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
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={io}
        hidden={false}
        dark={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
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
})

describe('端末の配色', () => {
  /**
   * jsdom は `palette.css` を読まないので `getPropertyValue` は空文字を返す。
   * ルート要素への問い合わせだけを差し替え、**他の要素は実物へ委ねる**
   *（testing-library の内部も getComputedStyle を使うため、丸ごと
   * 差し替えるとクエリが壊れる）
   */
  const tokens: Record<string, string> = {}
  let spy: { mockRestore: () => void } | null = null

  const LIGHT: Record<string, string> = {
    '--surface': 'oklch(0.961 0.007 88.6)',
    '--ink': 'oklch(0.205 0 89.9)',
    '--surface-accent': 'oklch(0.87 0.04 126)',
  }
  const DARK: Record<string, string> = {
    '--surface': 'oklch(0.205 0 89.9)',
    '--ink': 'oklch(0.85 0.007 88.6)',
    '--surface-accent': 'oklch(0.28 0.04 126)',
  }

  const setTokens = (next: Record<string, string>): void => {
    for (const key of Object.keys(tokens)) delete tokens[key]
    Object.assign(tokens, next)
  }

  beforeEach(() => {
    const real = window.getComputedStyle.bind(window)
    spy = vi.spyOn(window, 'getComputedStyle').mockImplementation(((
      element: Element,
      pseudo?: string | null,
    ) =>
      element === document.documentElement
        ? ({
            getPropertyValue: (name: string) => tokens[name] ?? '',
          } as unknown as CSSStyleDeclaration)
        : real(element, pseudo)) as typeof window.getComputedStyle)
  })
  afterEach(() => {
    spy?.mockRestore()
    spy = null
  })

  it('マウント時に役割トークンから配色を作って xterm へ渡す', async () => {
    setTokens(LIGHT)
    const pty = fakePty()
    const onRunning = vi.fn()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        dark={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))

    const options = (TerminalMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      minimumContrastRatio?: number
      theme?: { background?: string }
    }
    // 16色は xterm の既定のまま。ライトの面でも読める濃さへ寄せさせる
    expect(options.minimumContrastRatio).toBe(4.5)
    expect(options.theme?.background).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('ライトからダークへ切り替えると配色を渡し直す', async () => {
    setTokens(LIGHT)
    const pty = fakePty()
    const props = {
      session: session(),
      cwd: '/proj',
      ptyIo: pty.io,
      hidden: false,
      onRunning: vi.fn(),
      onExited: vi.fn(),
      onFailed: vi.fn(),
    }
    const { rerender } = render(<TerminalTab {...props} dark={false} />)
    await waitFor(() => expect(term.options.theme).toBeDefined())
    const light = (term.options.theme as { background: string }).background

    setTokens(DARK)
    rerender(<TerminalTab {...props} dark />)

    await waitFor(() =>
      expect((term.options.theme as { background: string }).background).not.toBe(light),
    )
  })

  it('トークンが読めなければ配色を渡さない（xterm の既定に任せる）', async () => {
    setTokens({})
    const pty = fakePty()
    const onRunning = vi.fn()
    render(
      <TerminalTab
        session={session()}
        cwd="/proj"
        ptyIo={pty.io}
        hidden={false}
        dark={false}
        onRunning={onRunning}
        onExited={vi.fn()}
        onFailed={vi.fn()}
      />,
    )
    await waitFor(() => expect(onRunning).toHaveBeenCalledWith(1, 7))

    const options = (TerminalMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      theme?: unknown
    }
    expect(options.theme).toBeUndefined()
  })
})
