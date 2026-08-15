import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PtySpawnSpec } from '@/core/terminal/pty-io'

/**
 * `src/fs/pty.ts` の生存台帳のテスト。**Tauri の口そのもの（invoke の
 * 引数）ではなく、「どの PTY がいつ殺されるか」を見る。**
 *
 * `Channel` は `onmessage` を持つだけの器として置き換える——pty.ts は
 * new して invoke へ渡し、Rust から届いたイベントを onmessage で受ける。
 * テストからは invoke の引数経由でその器を掴み、exit を差し込む
 */
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  Channel: class {
    onmessage: ((message: unknown) => void) | null = null
  },
}))

const { killAllPtys, tauriPtyIo } = await import('./pty')

function spec(over: Partial<PtySpawnSpec> = {}): PtySpawnSpec {
  return {
    program: 'claude',
    args: [],
    cwd: '/proj',
    cols: 80,
    rows: 24,
    onData: () => undefined,
    onExit: () => undefined,
    ...over,
  }
}

/** `pty_spawn` の応答をテストから握るためのモック実装 */
function gatedSpawn(): { resolve: (id: number) => void } {
  const gate = { resolve: (_id: number) => undefined as void }
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd !== 'pty_spawn') return undefined
    return await new Promise<number>((r) => {
      gate.resolve = r
    })
  })
  return gate
}

/** その spawn に渡された Channel（テストから exit を差し込む口） */
function spawnedChannel(): { onmessage: ((message: unknown) => void) | null } {
  const call = invokeMock.mock.calls.find((c) => c[0] === 'pty_spawn')
  const args = call?.[1] as { channel: { onmessage: ((message: unknown) => void) | null } }
  return args.channel
}

beforeEach(() => {
  invokeMock.mockReset()
})

// **台帳はモジュールの中に残るので、テストごとに空にして次へ渡す**
afterEach(async () => {
  invokeMock.mockImplementation(async () => undefined)
  await killAllPtys()
  invokeMock.mockReset()
})

describe('killAllPtys', () => {
  it('起動を終えた PTY を殺す', async () => {
    invokeMock.mockImplementation(async (cmd: string) => (cmd === 'pty_spawn' ? 7 : undefined))
    await tauriPtyIo.spawn(spec())
    invokeMock.mockClear()

    await killAllPtys()

    expect(invokeMock).toHaveBeenCalledWith('pty_kill', { id: 7 })
  })

  it('**spawn の解決前に呼ばれても取りこぼさない**', async () => {
    // `live` への登録は pty_spawn の解決後なので、invoke が in-flight の
    // 間に全殺しが走ると素通りしていた（M11 の残件）
    const gate = gatedSpawn()
    const spawning = tauriPtyIo.spawn(spec())

    const killing = killAllPtys()
    gate.resolve(9)
    await spawning
    await killing

    expect(invokeMock).toHaveBeenCalledWith('pty_kill', { id: 9 })
  })

  it('**起動中に全殺しされた PTY を台帳へ載せ直さない**（世代の判定そのもの）', async () => {
    // 上のテストは in-flight の待ち合わせだけでも通る——`pty_kill` が飛ぶ
    // 事実は待ち合わせが担うため。**世代の判定が無いと、待ち合わせが済んだ
    // 後に spawn 側が `live.add(id)` してしまい、空にしたはずの台帳に1本
    // だけ生き残る。** ここはそれを踏む: レースのあともう一度全殺しして、
    // 同じ id へ kill が飛ばないこと（＝台帳に幽霊が残っていないこと）を見る
    const gate = gatedSpawn()
    const spawning = tauriPtyIo.spawn(spec())

    const killing = killAllPtys()
    gate.resolve(9)
    await spawning
    await killing

    invokeMock.mockClear()
    invokeMock.mockImplementation(async () => undefined)
    await killAllPtys()

    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('起動中だった PTY の kill が終わるまで解決しない', async () => {
    // ここで待たないと、アプリ終了経路（interceptClose → killAllPtys →
    // close）で kill が間に合わず孤児が残る
    let killDone = false
    const gate = { resolve: (_id: number) => undefined as void }
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'pty_spawn') {
        return await new Promise<number>((r) => {
          gate.resolve = r
        })
      }
      if (cmd === 'pty_kill') {
        await new Promise((r) => setTimeout(r, 10))
        killDone = true
      }
      return undefined
    })
    const spawning = tauriPtyIo.spawn(spec())

    const killing = killAllPtys()
    gate.resolve(9)
    await spawning
    await killing

    expect(killDone).toBe(true)
  })

  it('全殺しのあとに起動した PTY は通常どおり台帳へ載る（判定が居座らない）', async () => {
    // 「1回全殺ししたらそれ以降どの端末も台帳に載らない」実装でも上の
    // 2本は通ってしまう。フォルダ切替のたびに全殺しは走るので、ここが
    // 居座ると次のフォルダの端末が終了時に回収されなくなる
    invokeMock.mockImplementation(async (cmd: string) => (cmd === 'pty_spawn' ? 11 : undefined))
    await killAllPtys()
    await tauriPtyIo.spawn(spec())
    invokeMock.mockClear()

    await killAllPtys()

    expect(invokeMock).toHaveBeenCalledWith('pty_kill', { id: 11 })
  })

  it('（既存の挙動）exit が invoke の解決より先に届いたら台帳へ載せず、その場で片付ける', async () => {
    const gate = gatedSpawn()
    const onExit = vi.fn()
    const spawning = tauriPtyIo.spawn(spec({ onExit }))

    spawnedChannel().onmessage?.({ event: 'exit', data: { code: 0 } })
    expect(onExit).toHaveBeenCalledWith(0)

    gate.resolve(13)
    await spawning
    expect(invokeMock).toHaveBeenCalledWith('pty_kill', { id: 13 })

    // 台帳に載っていないので、次の全殺しでは何も飛ばない
    invokeMock.mockClear()
    invokeMock.mockImplementation(async () => undefined)
    await killAllPtys()
    expect(invokeMock).not.toHaveBeenCalled()
  })
})
