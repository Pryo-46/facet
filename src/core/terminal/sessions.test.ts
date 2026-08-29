import { describe, expect, it } from 'vitest'
import {
  activateSession,
  closeAll,
  closeSession,
  emptyTerminalState,
  hasRunning,
  isSessionRunning,
  markExited,
  markFailed,
  markRunning,
  openSession,
} from './sessions'

describe('openSession', () => {
  it('連番のラベルを付けて追加し、それをアクティブにする', () => {
    const a = openSession(emptyTerminalState)
    expect(a.sessions.map((s) => s.label)).toEqual(['Claude 1'])
    expect(a.activeId).toBe(a.sessions[0]?.id)

    const b = openSession(a)
    expect(b.sessions.map((s) => s.label)).toEqual(['Claude 1', 'Claude 2'])
    expect(b.activeId).toBe(b.sessions[1]?.id)
  })

  it('閉じた番号を再利用しない', () => {
    // 同じ名前が別の会話を指すのを避ける。会議中に「Claude 1 を見て」が
    // 通じなくなるのが一番困る
    const two = openSession(openSession(emptyTerminalState))
    const firstId = two.sessions[0]?.id ?? 0
    const after = openSession(closeSession(two, firstId))
    expect(after.sessions.map((s) => s.label)).toEqual(['Claude 2', 'Claude 3'])
  })

  it('起動前の状態は starting で ptyId を持たない', () => {
    const s = openSession(emptyTerminalState).sessions[0]
    expect(s?.status).toBe('starting')
    expect(s?.ptyId).toBeNull()
  })

  it('起動時に差し込む文字列を持てる', () => {
    const s = openSession(emptyTerminalState, '@docs/a.json ').sessions[0]
    expect(s?.initialText).toBe('@docs/a.json ')
  })

  it('省略したら null（ペインを開くだけのときは何も差し込まない）', () => {
    const s = openSession(emptyTerminalState).sessions[0]
    expect(s?.initialText).toBeNull()
  })
})

describe('closeSession', () => {
  it('閉じたのがアクティブなら隣をアクティブにする', () => {
    const three = openSession(openSession(openSession(emptyTerminalState)))
    const middle = three.sessions[1]?.id ?? 0
    const after = closeSession(activateSession(three, middle), middle)
    expect(after.activeId).toBe(after.sessions[1]?.id)
    expect(after.sessions.map((s) => s.label)).toEqual(['Claude 1', 'Claude 3'])
  })

  it('末尾を閉じたら1つ前をアクティブにする', () => {
    const two = openSession(openSession(emptyTerminalState))
    const last = two.sessions[1]?.id ?? 0
    const after = closeSession(two, last)
    expect(after.activeId).toBe(after.sessions[0]?.id)
  })

  it('最後の1本を閉じたらアクティブは null になる', () => {
    const one = openSession(emptyTerminalState)
    const after = closeSession(one, one.sessions[0]?.id ?? 0)
    expect(after.sessions).toEqual([])
    expect(after.activeId).toBeNull()
  })

  it('アクティブでないものを閉じてもアクティブは動かない', () => {
    const two = openSession(openSession(emptyTerminalState))
    const first = two.sessions[0]?.id ?? 0
    const after = closeSession(two, first)
    expect(after.activeId).toBe(two.activeId)
  })

  it('知らない id は素通しする', () => {
    const one = openSession(emptyTerminalState)
    expect(closeSession(one, 999)).toBe(one)
  })
})

describe('状態の遷移', () => {
  it('markRunning が ptyId を入れて running にする', () => {
    const one = openSession(emptyTerminalState)
    const id = one.sessions[0]?.id ?? 0
    const after = markRunning(one, id, 42)
    expect(after.sessions[0]?.status).toBe('running')
    expect(after.sessions[0]?.ptyId).toBe(42)
  })

  it('markExited が文言を入れて ptyId を落とす', () => {
    const one = markRunning(openSession(emptyTerminalState), 1, 42)
    const after = markExited(one, 1, '終了しました（コード 0）')
    expect(after.sessions[0]?.status).toBe('exited')
    expect(after.sessions[0]?.ptyId).toBeNull()
    expect(after.sessions[0]?.message).toBe('終了しました（コード 0）')
  })

  it('markFailed が文言を入れる', () => {
    const one = openSession(emptyTerminalState)
    const after = markFailed(one, 1, 'Claude Code が見つかりません')
    expect(after.sessions[0]?.status).toBe('failed')
    expect(after.sessions[0]?.message).toBe('Claude Code が見つかりません')
  })
})

describe('hasRunning / closeAll', () => {
  it('running が1つでもあれば hasRunning が true', () => {
    expect(hasRunning(emptyTerminalState)).toBe(false)
    const one = openSession(emptyTerminalState)
    // starting も「動いている」に数える（起動要求が飛んでいるため）
    expect(hasRunning(one)).toBe(true)
    expect(hasRunning(markExited(one, 1, ''))).toBe(false)
  })

  it('closeAll が全部消して採番だけ引き継ぐ', () => {
    const two = openSession(openSession(emptyTerminalState))
    const after = closeAll(two)
    expect(after.sessions).toEqual([])
    expect(after.activeId).toBeNull()
    expect(openSession(after).sessions[0]?.label).toBe('Claude 3')
  })
})

describe('isSessionRunning', () => {
  it('starting / running は true、exited / failed は false', () => {
    const starting = openSession(emptyTerminalState).sessions[0]
    if (starting === undefined) throw new Error('unreachable')
    expect(isSessionRunning(starting)).toBe(true)
    expect(isSessionRunning({ ...starting, status: 'running', ptyId: 42 })).toBe(true)
    expect(isSessionRunning({ ...starting, status: 'exited' })).toBe(false)
    expect(isSessionRunning({ ...starting, status: 'failed' })).toBe(false)
  })
})
