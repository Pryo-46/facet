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
  let nextId = 100
  const io: PtyIo = {
    spawn: async () => {
      const id = nextId++
      issuedIds.push(id)
      return id
    },
    write: vi.fn(async () => undefined),
    resize: vi.fn(async () => undefined),
    kill: vi.fn(async (id: number) => {
      killedIds.push(id)
    }),
  }
  return { io, issuedIds, killedIds }
}

beforeEach(() => {
  vi.clearAllMocks()
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
})
