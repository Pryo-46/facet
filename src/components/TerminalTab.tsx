import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import { CLAUDE_ARGS, CLAUDE_PROGRAM, type PtyIo } from '@/core/terminal/pty-io'
import type { TerminalSession } from '@/core/terminal/sessions'

/**
 * 端末タブ1本。xterm 1個と PTY 1本が対応する。
 *
 * **端末の中は xterm の既定配色にする。** 端末は端末として読む面であり、
 * rev 9章の「地は方眼、作業する面は無地」の対象外。facet の役割トークンを
 * 流し込まないことで、ソースに色値が現れずに済む（conventions.test.ts）
 */

export interface TerminalTabProps {
  session: TerminalSession
  cwd: string
  ptyIo: PtyIo
  /** 畳んでいる／非アクティブ。**アンマウントはしない**（設計 決定6） */
  hidden: boolean
  onRunning: (id: number, ptyId: number) => void
  onExited: (id: number, message: string) => void
  onFailed: (id: number, message: string) => void
}

// facet 側で改行を代行する。ESC + CR（バイトで 0x1b 0x0d）。生の制御文字を
// ソースに直接置かないため String.fromCharCode(27) で組み立てる
const SHIFT_ENTER_SEQUENCE = `${String.fromCharCode(27)}\r`

export function TerminalTab(props: TerminalTabProps): React.JSX.Element {
  const { session, cwd, ptyIo, hidden, onRunning, onExited, onFailed } = props
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<number | null>(null)

  // コールバックは最新を ref から読む。**起動の effect は1回だけ**——
  // 依存に入れると props が変わるたびに端末がもう1本立つ
  const cb = useRef({ onRunning, onExited, onFailed })
  cb.current = { onRunning, onExited, onFailed }

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const term = new Terminal({ convertEol: false, fontSize: 13 })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    termRef.current = term
    fitRef.current = fit

    let disposed = false

    // Claude Code の /terminal-setup は iTerm2/VSCode の設定ファイルを
    // 書き換えるコマンドで、埋め込み端末には効かない。キー処理はこちら側が
    // 握っているので Shift+Enter による改行は facet 側で代行する
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      if (event.key !== 'Enter' || !event.shiftKey) return true
      if (event.ctrlKey || event.altKey || event.metaKey) return true
      // xterm は false を返しても preventDefault() を呼ばずに抜ける
      // （node_modules/@xterm/xterm/lib/xterm.js）。ここで呼んでおかないと
      // ブラウザの既定動作が生き残り、隠し textarea に本物の改行が挿入
      // される。溜まった改行が次の入力で送出され、「1回目は改行できるが
      // 2回目以降は改行されず送信されてしまう」症状になる
      event.preventDefault()
      const ptyId = ptyIdRef.current
      if (ptyId !== null) {
        void ptyIo.write(ptyId, SHIFT_ENTER_SEQUENCE).catch((err: unknown) => {
          // **disposed で守る**——StrictMode で捨てられた側のハンドラが
          // 書き込みに失敗しても、生きているセッションを failed にしない
          if (disposed) return
          cb.current.onFailed(
            session.id,
            `端末へ書き込めませんでした: ${err instanceof Error ? err.message : String(err)}`,
          )
        })
      }
      return false
    })

    void ptyIo
      .spawn({
        program: CLAUDE_PROGRAM,
        args: [...CLAUDE_ARGS],
        cwd,
        cols: term.cols,
        rows: term.rows,
        // **バイト列のまま渡す。** ここで文字列化すると、読み取りの区切りが
        // マルチバイトの途中に落ちたときに日本語が化ける。
        // **disposed で守る**——StrictMode の二重マウントで捨てられた側の
        // PTY が出力を出しても、既に dispose 済みの Terminal へ書かない
        onData: (bytes) => {
          if (disposed) return
          term.write(bytes)
        },
        // **disposed で守る**——捨てられた側の PTY の終了イベントが遅れて
        // 届いても、生きている側のセッションを「終了済み」にしてはいけない
        // （台帳の markExited が ptyId を null に落とし、hasRunning が false
        // になり、タブを閉じても kill が飛ばなくなる）
        onExit: (code) => {
          if (disposed) return
          cb.current.onExited(session.id, `終了しました（コード ${code ?? '不明'}）`)
        },
      })
      .then((ptyId) => {
        if (disposed) {
          void ptyIo.kill(ptyId)
          return
        }
        ptyIdRef.current = ptyId
        term.onData((data) => {
          // 書き込みの失敗もタブの中に出す（設計 決定13）。握り潰すと
          // 「打っても何も起きない端末」になり、原因が画面から読めない
          void ptyIo.write(ptyId, data).catch((err: unknown) => {
            // **disposed で守る**——StrictMode で捨てられた側の Terminal に
            // 残った onData 経由の書き込みが失敗しても、生きているセッション
            // を failed にしない
            if (disposed) return
            cb.current.onFailed(
              session.id,
              `端末へ書き込めませんでした: ${err instanceof Error ? err.message : String(err)}`,
            )
          })
        })
        cb.current.onRunning(session.id, ptyId)
      })
      .catch((err: unknown) => {
        if (disposed) return
        cb.current.onFailed(
          session.id,
          `Claude Code を起動できませんでした: ${err instanceof Error ? err.message : String(err)}`,
        )
      })

    return () => {
      disposed = true
      term.dispose()
    }
    // 起動は1回だけ。cwd が変わる経路は「フォルダ切替」で、そのときは
    // タブごと作り直される（設計 決定12）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // **隠れている間は測らない。** display:none では clientWidth が 0 になり、
  // ここで fit すると開き直したときだけ表示が崩れる（設計 決定6）
  useEffect(() => {
    if (hidden) return
    const term = termRef.current
    const fit = fitRef.current
    const ptyId = ptyIdRef.current
    if (term === null || fit === null) return
    fit.fit()
    // リサイズの失敗は握り潰してよい。失敗するのは PTY が既に無いときで、
    // その事実は onExit が先にタブへ伝えている（書き込みと違い、握り潰しても
    // 「原因の分からない無反応」にはならない）
    if (ptyId !== null) void ptyIo.resize(ptyId, term.cols, term.rows).catch(() => undefined)
  }, [hidden, ptyIo])

  // ペイン幅の変化に追従する。スプリッタのドラッグでは hidden は変わらない
  // ので、上の effect だけでは端末の桁数が追従しない
  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry === undefined) return
      // **寸法が 0 のときは何もしない。** display:none の間も
      // ResizeObserver は変化を通知してくるが、そこで fit すると
      // 隠れている間に測ってしまう（既存の hidden effect と同じ理由）
      if (entry.contentRect.width === 0 || entry.contentRect.height === 0) return
      const term = termRef.current
      const fit = fitRef.current
      if (term === null || fit === null) return
      const prevCols = term.cols
      const prevRows = term.rows
      fit.fit()
      // **桁数・行数が実際に変わったときだけ pty_resize を呼ぶ。** ドラッグ中は
      // 毎フレーム通知が来るため、撃ち続けると子プロセスに SIGWINCH が飛び続ける
      if (term.cols === prevCols && term.rows === prevRows) return
      const ptyId = ptyIdRef.current
      if (ptyId !== null) void ptyIo.resize(ptyId, term.cols, term.rows).catch(() => undefined)
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [ptyIo])

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${hidden ? 'hidden' : ''}`}>
      {session.message !== null && (
        <p className="border-b border-rule px-3 py-2 text-sm text-warning">{session.message}</p>
      )}
      <div ref={hostRef} className="min-h-0 flex-1" />
    </div>
  )
}
