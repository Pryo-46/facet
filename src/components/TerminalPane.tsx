import { Plus, X } from 'lucide-react'
import { buttonBase } from '@/components/button-styles'
import { TerminalTab } from '@/components/TerminalTab'
import type { PtyIo } from '@/core/terminal/pty-io'
import type { TerminalState } from '@/core/terminal/sessions'

/**
 * 端末ペインの枠とタブバー。
 *
 * **ペインの枠は facet の役割トークン、端末の中は xterm の既定配色**
 *（理由は TerminalTab.tsx）
 */

export interface TerminalPaneProps {
  state: TerminalState
  cwd: string
  ptyIo: PtyIo
  /**
   * ペインが見えているか。**畳んでいる間もこのコンポーネントは生きている**
   *（アンマウントすると会話とプロセスが消える。設計 決定6）ので、
   * 「見えているか」は props で受け取る
   */
  paneVisible: boolean
  onOpen: () => void
  onClose: (id: number) => void
  onActivate: (id: number) => void
  onRunning: (id: number, ptyId: number) => void
  onExited: (id: number, message: string) => void
  onFailed: (id: number, message: string) => void
}

export function TerminalPane(props: TerminalPaneProps): React.JSX.Element {
  const { state, cwd, ptyIo, paneVisible, onOpen, onClose, onActivate } = props
  const { onRunning, onExited, onFailed } = props

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <div role="tablist" className="flex shrink-0 items-center gap-1 border-b border-rule px-2 py-1">
        {state.sessions.map((session) => (
          <span key={session.id} className="flex items-center">
            <button
              type="button"
              role="tab"
              aria-selected={state.activeId === session.id}
              className={`${buttonBase} px-2 py-1 text-xs ${
                state.activeId === session.id ? 'bg-surface-accent text-ink' : 'text-ink-muted'
              }`}
              onClick={() => onActivate(session.id)}
            >
              {session.label}
            </button>
            <button
              type="button"
              aria-label={`${session.label} を閉じる`}
              className={`${buttonBase} p-1 text-ink-muted`}
              onClick={() => onClose(session.id)}
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        <button
          type="button"
          aria-label="タブを追加"
          className={`${buttonBase} ml-1 p-1 text-ink-muted`}
          onClick={onOpen}
        >
          <Plus aria-hidden className="size-4" />
        </button>
      </div>

      {state.sessions.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <button
            type="button"
            className={`${buttonBase} border border-rule px-3 py-1 text-sm text-ink`}
            onClick={onOpen}
          >
            Claude Code を開く
          </button>
        </div>
      ) : (
        state.sessions.map((session) => (
          <TerminalTab
            key={session.id}
            session={session}
            cwd={cwd}
            ptyIo={ptyIo}
            hidden={!paneVisible || state.activeId !== session.id}
            onRunning={onRunning}
            onExited={onExited}
            onFailed={onFailed}
          />
        ))
      )}
    </div>
  )
}
