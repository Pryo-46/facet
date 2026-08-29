import { Plus, X } from 'lucide-react'
import { buttonBase } from '@/components/button-styles'
import { TerminalTab } from '@/components/TerminalTab'
import type { ClipboardIo } from '@/core/terminal/clipboard-io'
import type { PtyIo } from '@/core/terminal/pty-io'
import type { TerminalState } from '@/core/terminal/sessions'

/**
 * 端末ペインの枠とタブバー。
 *
 * **枠（タブバー・余白）は facet の役割トークンに合わせる**（M17）。
 * **端末の中身だけはダーク固定**（M28 実機確認。`TerminalTab` 参照）——
 * 端末は facet の面ではなく「端末の面」という人間の判断で、`dark` の
 * 中継はここには無い
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
  /**
   * 差し込み指示（M28）。App が**1つだけ**持ち、ここで宛先のタブへ振り分ける。
   * `targetId` と一致しないタブには `null` を渡す
   */
  insertion: { targetId: number; seq: number; text: string } | null
  /** コピー／貼り付けの口。`TerminalTab` へ中継するだけ（額縁が注入する） */
  clipboardIo: ClipboardIo
  /** セッションを殺さない失敗の通知先。`TerminalTab` へ中継するだけ（M28） */
  onError: (message: string) => void
  onOpen: () => void
  onClose: (id: number) => void
  onActivate: (id: number) => void
  onRunning: (id: number, ptyId: number) => void
  onExited: (id: number, message: string) => void
  onFailed: (id: number, message: string) => void
}

export function TerminalPane(props: TerminalPaneProps): React.JSX.Element {
  const { state, cwd, ptyIo, paneVisible, insertion, onOpen, onClose, onActivate } = props
  const { clipboardIo, onError, onRunning, onExited, onFailed } = props

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface"
      /*
       * **ペインの中では OS の既定メニューを出さない**（M28）。ここが受けるのは
       * タブバーと余白の分で、**止めるだけで何も起こさない**——タブバーで
       * 右クリックして貼り付けが起きるのはおかしい。端末の中身は `TerminalTab`
       * が先に拾ってコピー／貼り付けへ割り当てる（バブリングで両方が
       * `preventDefault` を呼ぶが無害）。
       * **アプリ全体では止めない**（人間の裁定）——エディタ側のテキスト欄では
       * OS のメニューからの貼り付けが使えたままになる
       */
      onContextMenu={(event) => event.preventDefault()}
    >
      {/*
       * role="tablist"/"tab" は名乗らない。スクリーンリーダー利用者は考慮しない
       * という依頼者判断のもと、対応する tabpanel も矢印キー移動も持たない
       * 中途半端な ARIA を残すより、素の button + aria-pressed の方が実態に合う
       */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-rule px-2 py-1">
        {state.sessions.map((session) => (
          <span key={session.id} className="flex shrink-0 items-center">
            <button
              type="button"
              aria-pressed={state.activeId === session.id}
              className={`${buttonBase} px-2 py-1 text-sm ${
                state.activeId === session.id ? 'bg-surface-muted text-ink' : 'text-ink-muted'
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
        {state.sessions.length > 0 && (
          <button
            type="button"
            aria-label="タブを追加"
            className={`${buttonBase} ml-1 shrink-0 p-1 text-ink-muted`}
            onClick={onOpen}
          >
            <Plus aria-hidden className="size-4" />
          </button>
        )}
      </div>

      {state.sessions.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <button
            type="button"
            className={`${buttonBase} border border-rule px-3 py-1 text-base text-ink`}
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
            insertion={
              insertion !== null && insertion.targetId === session.id ? insertion : null
            }
            clipboardIo={clipboardIo}
            onError={onError}
            onRunning={onRunning}
            onExited={onExited}
            onFailed={onFailed}
          />
        ))
      )}
    </div>
  )
}
