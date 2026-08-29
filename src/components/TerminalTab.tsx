import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import { buildTerminalTheme, TERMINAL_MIN_CONTRAST } from '@/core/terminal/theme'
import type { ClipboardIo } from '@/core/terminal/clipboard-io'
import { CLAUDE_ARGS, CLAUDE_PROGRAM, type PtyIo } from '@/core/terminal/pty-io'
import type { TerminalSession } from '@/core/terminal/sessions'

/**
 * 端末タブ1本。xterm 1個と PTY 1本が対応する。
 *
 * **面・文字・カーソル・選択は facet の役割トークンから流し込む**（M17）。
 * 色値はソースに現れない——`palette.css` のトークンを実行時に読んで
 * 変換する（`src/core/terminal/theme.ts`。conventions.test.ts）。
 * **ANSI の16色は xterm の既定のまま**で、ライトの面での読みやすさは
 * `minimumContrastRatio` に任せる（理由は theme.ts）
 */

export interface TerminalTabProps {
  session: TerminalSession
  cwd: string
  ptyIo: PtyIo
  /** 畳んでいる／非アクティブ。**アンマウントはしない**（設計 決定6） */
  hidden: boolean
  /**
   * ダーク表示か。**色そのものは渡さない**——色は `palette.css` が持ち、
   * この値は「トークンを読み直す合図」としてだけ使う
   */
  dark: boolean
  /**
   * 動いているタブへの差し込み指示（M28）。**`seq` が変わったときだけ**流す。
   * `seq` は App が持つ単調増加の連番で、同じ指示が二度実行されないための鍵。
   *
   * **`text` を effect の依存に入れないこと**——同じファイルを続けて2回渡す
   * 操作で2回目が落ちる
   */
  insertion: { seq: number; text: string } | null
  /** コピー／貼り付けの口。**額縁が注入する**（コンポーネントは `@/fs/` を知らない） */
  clipboardIo: ClipboardIo
  /**
   * セッションを殺さない失敗の通知先（M28。App のトーストへ出る）。
   * **`session.message` を使わないこと**——あれは `exited` / `failed` の欄で、
   * コピーの失敗でタブを死んだ扱いにしてはいけない
   */
  onError: (message: string) => void
  onRunning: (id: number, ptyId: number) => void
  onExited: (id: number, message: string) => void
  onFailed: (id: number, message: string) => void
}

// facet 側で改行を代行する。ESC + CR（バイトで 0x1b 0x0d）。生の制御文字を
// ソースに直接置かないため String.fromCharCode(27) で組み立てる
const SHIFT_ENTER_SEQUENCE = `${String.fromCharCode(27)}\r`

/** 例外を人に見せる文字列にする */
const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * 役割トークンを実行時に読む。**jsdom では空文字が返る**ので、テスト環境
 * では配色を渡さず xterm の既定に落ちる
 */
const readToken = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name)

export function TerminalTab(props: TerminalTabProps): React.JSX.Element {
  const { session, cwd, ptyIo, hidden, dark, insertion, clipboardIo } = props
  const { onRunning, onExited, onFailed, onError } = props
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<number | null>(null)

  /**
   * **起動待ちの間に打たれた入力。** `spawn` が解決するまで PTY の ID が
   * 無いので送れない。捨てると起動までの約1秒だけ打鍵が無音で消えるので、
   * ここへ積んで解決後に打たれた順で流す。
   *
   * **上限は設けない**（溜まるのは約1秒ぶん。上限を設けると「どこから
   * 捨てるか」という新しい判断が要る）
   */
  const pendingRef = useRef<string[]>([])

  // コールバックは最新を ref から読む。**起動の effect は1回だけ**——
  // 依存に入れると props が変わるたびに端末がもう1本立つ
  const cb = useRef({ onRunning, onExited, onFailed })
  cb.current = { onRunning, onExited, onFailed }

  // spawn が解決した時点の hidden を知るための ref。起動 effect は1回しか
  // 走らないので、クロージャに閉じ込めた hidden は古い値のままになる
  const hiddenRef = useRef(hidden)
  hiddenRef.current = hidden

  // 隠れている間に Plex Mono の読み込みが終わったときの「適用待ち」置き場。
  // 可視化した瞬間の hidden effect（下）がここを見て、fontFamily の代入と
  // fit() をまとめて行う
  const pendingFontRef = useRef<string | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const initialTheme = buildTerminalTheme(readToken)
    const term = new Terminal({
      convertEol: false,
      fontSize: 13,
      // 16色は xterm の既定のまま。ライトの面でも読める濃さへ xterm 自身に
      // 寄せさせる（core/terminal/theme.ts）
      minimumContrastRatio: TERMINAL_MIN_CONTRAST,
      // 読めなければ渡さない。**空の theme を渡さないこと**——xterm の既定を
      // 上書きして真っ黒でも真っ白でもない中途半端な面になる
      ...(initialTheme === null ? {} : { theme: initialTheme }),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    termRef.current = term
    fitRef.current = fit

    let disposed = false

    // 端末のフォントは Plex Mono（U1 決着。700 は ANSI 太字用に同梱済み）。
    // **読み込みが済んでから fontFamily を入れる**——xterm はセル寸法を
    // fontFamily を代入した時点のフォントで測るので、届く前に入れると
    // フォールバック書体の寸法で固まる。fonts.ready は「使われたフォント」
    // しか待たず、この時点で Plex Mono はまだ 1 文字も描かれていないので、
    // fonts.load で明示的に読み込む（通常・太字の両方）。
    // 読めない環境（jsdom）では何もしない＝xterm 既定のまま（theme.ts の
    // 「半端に流し込まない」と同じ判断）
    if ('fonts' in document) {
      void Promise.all([
        document.fonts.load("13px 'IBM Plex Mono'", 'Wg1|'),
        document.fonts.load("bold 13px 'IBM Plex Mono'", 'Wg1|'),
      ])
        .then(() => {
          if (disposed) return
          const mono = getComputedStyle(document.documentElement)
            .getPropertyValue('--font-mono')
            .trim()
          // トークンが読めなければ入れない（既定のまま）——theme.ts と同じ扱い
          if (mono === '') return
          // **隠れている間は代入も fit() も遅らせる。** host は display:none で
          // 0×0 になっており、この時点で fontFamily を入れて fit() すると
          // 0×0 の寸法で測ってしまう（204-219 と同じ理由）。fontFamily だけ
          // 先に代入する形にもしない——次に fit() が呼ばれるまでの間、
          // 実際に使っているフォントと違う寸法のまま表示される隙ができる。
          // 読めた値は ref に置いておき、可視化時の hidden effect に任せる
          if (hiddenRef.current) {
            pendingFontRef.current = mono
            return
          }
          term.options.fontFamily = mono
          fit.fit()
        })
        .catch(() => {
          // 読み込み失敗は既定フォントのまま動かす（端末が使えないより良い）
        })
    }

    /**
     * 端末への送信口。**書き込みはすべてここを通す。** ID がまだ無い間は
     * 待ち行列へ積むだけにして、`spawn` の解決時に同じ順で流し直す
     */
    const send = (data: string): void => {
      const ptyId = ptyIdRef.current
      if (ptyId === null) {
        pendingRef.current.push(data)
        return
      }
      // 書き込みの失敗もタブの中に出す（設計 決定13）。握り潰すと
      // 「打っても何も起きない端末」になり、原因が画面から読めない
      void ptyIo.write(ptyId, data).catch((err: unknown) => {
        // **disposed で守る**——StrictMode で捨てられた側のハンドラが
        // 書き込みに失敗しても、生きているセッションを failed にしない
        if (disposed) return
        cb.current.onFailed(
          session.id,
          `端末へ書き込めませんでした: ${err instanceof Error ? err.message : String(err)}`,
        )
      })
    }

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
      send(SHIFT_ENTER_SEQUENCE)
      return false
    })

    // **登録は spawn の前。** 解決を待って登録すると、起動までの約1秒に
    // 打った文字がどこにも届かない
    term.onData(send)

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
          // 下の cleanup と同じく `.catch` を付ける。拒否した invoke を
          // 放っておくと unhandled rejection になる
          void ptyIo.kill(ptyId).catch(() => undefined)
          return
        }
        ptyIdRef.current = ptyId
        // 起動待ちに積んだ入力を、打たれた順で流す。**配列を先に空にする**
        // ——send() の中でまた積まれる余地を残さない
        const queued = pendingRef.current
        pendingRef.current = []
        for (const data of queued) send(data)
        // 起動時の差し込み（M28）。**待ち行列の後**——起動待ちに打たれた文字より
        // 先に参照を入れると、打った文字が参照の前へ出てしまう。
        // **`hidden` は見ない**（`fit()` と違い寸法を測らないので、隠れていても
        // 差し込んでよい）。`disposed` の判定は上の分岐で済んでいる
        if (session.initialText !== null) term.paste(session.initialText)
        // 起動直後の PTY へ実寸を伝える。ここまでの fit()（隠れている間は
        // 測らない effect）は spawn 前——つまり ptyIdRef.current が null の
        // 間——に走っていることがあり、そのときは pty_resize を送れない。
        // その結果、xterm は実寸（fit 後）なのに PTY は xterm の既定
        // （80x24）のままという不一致が起動のたびに残る（実機で気付かれ
        // なかったのは、スプリッタのドラッグやタブ切替の resize/fit で
        // 自己修復するため）。ここで fit() をやり直し、実寸で1回だけ
        // resize する。**隠れている間は測らない**（hidden effect と同じ
        // 理由——display:none では寸法が 0 になる。表示に戻ったときは
        // 既存の hidden effect が拾う）
        if (!hiddenRef.current) {
          // **ref ではなくこの effect のローカルの `fit` を使う。** ref は
          // StrictMode で「別の effect が作った addon」を掴みうる唯一の経路
          fit.fit()
          void ptyIo.resize(ptyId, term.cols, term.rows).catch(() => undefined)
        }
        cb.current.onRunning(session.id, ptyId)
      })
      .catch((err: unknown) => {
        if (disposed) return
        // 起動できなかったので、溜まった入力は行き先が無い
        pendingRef.current = []
        cb.current.onFailed(
          session.id,
          `Claude Code を起動できませんでした: ${err instanceof Error ? err.message : String(err)}`,
        )
      })

    return () => {
      disposed = true
      // **自分の PTY を殺してから捨てる。** 台帳（App.tsx の
      // closeTerminalNow）も殺すが、`spawn` の解決と台帳への反映
      //（onRunning）の隙間で閉じられると台帳は ptyId を知らない。
      // **二重に殺しても無害**——pty_kill は既に消えた id に対して
      // 何もしない（src-tauri/src/pty.rs の sessions.remove が None を返す）。
      // ここで ref を null に落とすので、StrictMode で捨てられた側の
      // cleanup が生き残った側の ID を掴むこともない
      const ptyId = ptyIdRef.current
      ptyIdRef.current = null
      if (ptyId !== null) void ptyIo.kill(ptyId).catch(() => undefined)
      term.dispose()
    }
    // 起動は1回だけ。cwd が変わる経路は「フォルダ切替」で、そのときは
    // タブごと作り直される（設計 決定12）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * ライト／ダークの切り替えに追従する。**色の入れ替えは CSS 側で起きる**
   * ので、ここは「読み直して xterm へ渡し直す」だけ。`dark` はその合図で、
   * 値そのものは使わない（起動 effect より後に走るので、マウント時は
   * 同じ配色をもう一度渡すことになるが実害は無い）
   */
  useEffect(() => {
    const term = termRef.current
    if (term === null) return
    const theme = buildTerminalTheme(readToken)
    if (theme !== null) term.options.theme = theme
    // `dark` は合図として依存に入れる。値は読まない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark])

  /**
   * 動いているタブへの差し込み（M28）。
   *
   * **消化済みの `seq` を ref で覚える。** effect の依存を `seq` だけにしても、
   * StrictMode の二重マウントでは mount → cleanup → mount で2回走る。
   * マウント時点で `insertion` が入っている経路は現状無いが、ここを守っておけば
   * 「二度差し込まれた」という追いにくい不具合の余地が消える
   */
  const lastInsertedRef = useRef<number | null>(null)
  const insertionSeq = insertion?.seq ?? null
  useEffect(() => {
    const term = termRef.current
    if (term === null || insertion === null) return
    if (lastInsertedRef.current === insertion.seq) return
    lastInsertedRef.current = insertion.seq
    term.paste(insertion.text)
    // **依存は `seq` だけ。** `insertion` そのものを入れると、App が同じ内容で
    // 作り直したオブジェクトでも走る。`text` を入れてもいけない（上の注釈）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertionSeq])

  // **隠れている間は測らない。** display:none では clientWidth が 0 になり、
  // ここで fit すると開き直したときだけ表示が崩れる（設計 決定6）
  useEffect(() => {
    if (hidden) return
    const term = termRef.current
    const fit = fitRef.current
    const ptyId = ptyIdRef.current
    if (term === null || fit === null) return
    // 隠れている間に Plex Mono の読み込みが終わっていれば、ここで初めて
    // 代入する。fontFamily を入れてから fit() で測り直す順を守る
    // （起動 effect のフォント読み込みブロックと同じ理由）
    if (pendingFontRef.current !== null) {
      term.options.fontFamily = pendingFontRef.current
      pendingFontRef.current = null
    }
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

  /**
   * 端末の中の右クリック（M28）。**メニューは出さず1動作で済ませる**
   *（Windows Terminal と同じ作法）。選択があればコピーして選択を解除、
   * 無ければ貼り付ける。
   *
   * **`preventDefault()` がすべての要。** 呼ばなければ WebView2 の既定メニューが出る
   */
  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const term = termRef.current
    if (term === null) return
    if (term.hasSelection()) {
      const selected = term.getSelection()
      term.clearSelection()
      void clipboardIo.writeText(selected).catch((err: unknown) => {
        onError(`コピーできませんでした: ${errorText(err)}`)
      })
      return
    }
    void clipboardIo
      .readText()
      .then((text) => {
        // 空は日常的な状態（クリップボードが空／テキストでない）。黙って何もしない
        if (text === '') return
        term.paste(text)
      })
      .catch((err: unknown) => {
        onError(`貼り付けできませんでした: ${errorText(err)}`)
      })
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${hidden ? 'hidden' : ''}`}>
      {session.message !== null && (
        <p className="border-b border-rule px-3 py-2 text-base text-invalid">{session.message}</p>
      )}
      <div ref={hostRef} className="min-h-0 flex-1" onContextMenu={handleContextMenu} />
    </div>
  )
}
