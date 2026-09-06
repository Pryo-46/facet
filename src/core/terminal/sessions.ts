/**
 * 端末タブの台帳（コア・純ロジック。React も Tauri も知らない）。
 *
 * **ラベルは連番固定で、会話の内容からは決めない**（rev 4章。facet が
 * Claude の出力を読んで解釈することになるため。設計 決定8）。
 * 閉じた番号は再利用しない——同じ名前が別の会話を指すと、会議中の
 *「Claude 1 を見て」が通じなくなる
 */

export type SessionStatus = 'starting' | 'running' | 'exited' | 'failed'

export interface TerminalSession {
  /** facet 側の連番。**PTY の ID とは別物**（起動前は PTY がまだ無い） */
  readonly id: number
  readonly label: string
  readonly ptyId: number | null
  readonly status: SessionStatus
  /** exited / failed のときタブの中に出す文言。それ以外は null */
  readonly message: string | null
  /**
   * 起動直後に1回だけ差し込む文字列。無ければ null。
   *
   * **`insertion` の仕組み（`TerminalTab` の props）には乗せない。** あちらは
   * 「動いているタブへ差し込む」もので、ここは **PTY がまだ無い**段階の話
   */
  readonly initialText: string | null
}

export interface TerminalState {
  readonly sessions: readonly TerminalSession[]
  readonly activeId: number | null
  /** 次に振る番号。**単調増加**（閉じても戻さない） */
  readonly nextSeq: number
}

export const emptyTerminalState: TerminalState = {
  sessions: [],
  activeId: null,
  nextSeq: 1,
}

/**
 * タブを1本足す。`initialText` は起動直後に1回だけ差し込む文字列。
 * **省略可能にしてある**——ペインを開くだけの経路（何も渡さない）が既存の
 * 呼び出しのまま動くようにするため
 */
export function openSession(
  state: TerminalState,
  initialText: string | null = null,
): TerminalState {
  const session: TerminalSession = {
    id: state.nextSeq,
    label: `Claude ${state.nextSeq}`,
    ptyId: null,
    status: 'starting',
    message: null,
    initialText,
  }
  return {
    sessions: [...state.sessions, session],
    activeId: session.id,
    nextSeq: state.nextSeq + 1,
  }
}

export function closeSession(state: TerminalState, id: number): TerminalState {
  const at = state.sessions.findIndex((s) => s.id === id)
  if (at < 0) return state
  const sessions = state.sessions.filter((s) => s.id !== id)
  if (state.activeId !== id) return { ...state, sessions }
  // 閉じたのがアクティブなら隣へ移す。同じ位置に来たもの（＝右隣）を優先し、
  // 末尾を閉じたときだけ1つ前へ戻る
  const next = sessions[at] ?? sessions[at - 1] ?? null
  return { ...state, sessions, activeId: next?.id ?? null }
}

export function activateSession(state: TerminalState, id: number): TerminalState {
  return state.sessions.some((s) => s.id === id) ? { ...state, activeId: id } : state
}

function patch(
  state: TerminalState,
  id: number,
  change: (s: TerminalSession) => TerminalSession,
): TerminalState {
  if (!state.sessions.some((s) => s.id === id)) return state
  return { ...state, sessions: state.sessions.map((s) => (s.id === id ? change(s) : s)) }
}

export function markRunning(state: TerminalState, id: number, ptyId: number): TerminalState {
  return patch(state, id, (s) => ({ ...s, ptyId, status: 'running', message: null }))
}

export function markExited(state: TerminalState, id: number, message: string): TerminalState {
  return patch(state, id, (s) => ({ ...s, ptyId: null, status: 'exited', message }))
}

export function markFailed(state: TerminalState, id: number, message: string): TerminalState {
  return patch(state, id, (s) => ({ ...s, ptyId: null, status: 'failed', message }))
}

/**
 * そのタブが起動中・実行中か（タブを閉じる確認の要否）。
 * `hasRunning` はセッション全体を見るので、1本のタブの状態を見る用途には
 * 合わない——別に切り出す
 */
export function isSessionRunning(session: TerminalSession): boolean {
  return session.status === 'starting' || session.status === 'running'
}

/** 起動中・実行中のタブが1つでもあるか（フォルダ切替の確認の要否） */
export function hasRunning(state: TerminalState): boolean {
  return state.sessions.some(isSessionRunning)
}

export function closeAll(state: TerminalState): TerminalState {
  return { ...state, sessions: [], activeId: null }
}
