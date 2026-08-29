import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'
import { buildTerminalTheme, TERMINAL_MIN_CONTRAST, type TerminalTheme } from '@/core/terminal/theme'
import type { ClipboardIo } from '@/core/terminal/clipboard-io'
import { CLAUDE_ARGS, CLAUDE_PROGRAM, type PtyIo } from '@/core/terminal/pty-io'
import type { TerminalSession } from '@/core/terminal/sessions'

/**
 * 端末タブ1本。xterm 1個と PTY 1本が対応する。
 *
 * **面・文字・カーソル・選択は常にダーク固定**（M28 実機確認）。端末は
 * facet の面ではなく「端末の面」で、ライトのアプリの中でも黒いままの方が
 * 読みやすいという人間の判断——M17 の「端末も facet の役割トークンに
 * 合わせる」を反転した。色そのものの出所は変えない——`palette.css` の
 * `.dark` が持つ値を実行時に読んで変換する（`src/core/terminal/theme.ts`。
 * conventions.test.ts）。**ANSI の16色は xterm の既定のまま**で、
 * 読みやすさは `minimumContrastRatio` に任せる（理由は theme.ts）
 */

export interface TerminalTabProps {
  session: TerminalSession
  cwd: string
  ptyIo: PtyIo
  /** 畳んでいる／非アクティブ。**アンマウントはしない**（設計 決定6） */
  hidden: boolean
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
 * DECSET 2004（bracketed paste の有効化）。ESC[?2004h（バイトで
 * 0x1b 0x5b 0x3f 0x32 0x30 0x30 0x34 0x68）。xterm が貼り付けを
 * ESC[200~ … ESC[201~ で囲むのは、アプリがこれを送った後だけ
 * （node_modules/@xterm/xterm/lib/xterm.js）。起動時の差し込みと、
 * まだこれを見ていない間に来た insertion（@ ボタン／ドロップ）は、
 * これが PTY の出力に現れるまで保留する（下の起動 effect と insertion effect）
 */
const BRACKETED_PASTE_ENABLE = new Uint8Array([0x1b, 0x5b, 0x3f, 0x32, 0x30, 0x30, 0x34, 0x68])

/** `needle` の長さ − 1 バイトだけ前置して境界跨ぎを拾うための、直前チャンク末尾の切り出し */
const tailBytes = (
  bytes: Uint8Array<ArrayBufferLike>,
  length: number,
): Uint8Array<ArrayBufferLike> => (bytes.length <= length ? bytes : bytes.slice(bytes.length - length))

const concatBytes = (
  a: Uint8Array<ArrayBufferLike>,
  b: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBufferLike> => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

/** `haystack` が `needle` を部分列として含むか（バイト列の単純な総当たり探索） */
const containsSequence = (haystack: Uint8Array<ArrayBufferLike>, needle: Uint8Array<ArrayBufferLike>): boolean => {
  if (needle.length === 0 || haystack.length < needle.length) return false
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let matched = true
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        matched = false
        break
      }
    }
    if (matched) return true
  }
  return false
}

/**
 * 端末の配色を**ダーク側の役割トークン固定**で作る（M28 実機確認）。
 * `palette.css` は `.dark` クラスでダーク値を再定義しており、カスタム
 * プロパティは継承するので、`.dark` を付けた要素からは、アプリがライトの
 * ときでもダーク側の値が読める。読む先は非表示の使い捨て要素——`document.body`
 * へ一時的に付けて `getComputedStyle` で読み、読み終わったら外す
 *（残すと DOM に見えない要素が溜まる）。
 *
 * **`buildTerminalTheme` の呼び出し1回につき要素を1つで済ませる。**
 * `buildTerminalTheme` は渡した関数をトークンの数だけ複数回呼ぶので、
 * ここでラップして要素の生成・破棄を1回にまとめる（トークンごとに
 * 作り直さない）。
 *
 * **jsdom では `getComputedStyle` がトークンを解決せず空文字を返す**ので
 * `buildTerminalTheme` は null を返し、xterm の既定に落ちる
 *（この既存の挙動は変えない）
 */
const buildDarkTerminalTheme = (): TerminalTheme | null => {
  const probe = document.createElement('div')
  probe.className = 'dark'
  probe.style.display = 'none'
  document.body.appendChild(probe)
  try {
    const readToken = (name: string): string => getComputedStyle(probe).getPropertyValue(name)
    return buildTerminalTheme(readToken)
  } finally {
    document.body.removeChild(probe)
  }
}

export function TerminalTab(props: TerminalTabProps): React.JSX.Element {
  const { session, cwd, ptyIo, hidden, insertion, clipboardIo } = props
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

  /**
   * まだ差し込んでいない保留の列（M28）。**実機で末尾のスペースが消える
   * 不具合の修正**——spawn 解決直後は claude の TUI がまだ立ち上がっておらず、
   * xterm が貼り付けを囲む条件（DECSET 2004）を満たさない。ここでは差し込まず、
   * PTY の出力に ESC[?2004h が現れてから差し込む（起動 effect の onData）。
   * 5秒たっても来なければ従来どおり差し込む（保留し続けるのが一番悪い）。
   *
   * **起動時の差し込み（`session.initialText`）だけでなく、まだ 2004 を
   * 見ていない間に押された `insertion`（@ ボタン／ドロップ）もここへ積む。**
   * 差し込み口を1本にする M28 の設計に合わせ、待ち合わせも1箇所に揃える
   * （下の insertion effect）。先頭が `initialText`、その後ろに押された順で
   * `insertion` が並ぶ
   */
  const pendingInsertionsRef = useRef<string[]>([])

  /**
   * bracketed paste が使える状態になったか。ESC[?2004h を見た、または
   * 5秒の上限に達したら true。**一度 true になったら戻らない**——それ以降の
   * `insertion` は保留せず即座に `term.paste()` する（下の insertion effect）
   */
  const bracketedPasteReadyRef = useRef(false)

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const initialTheme = buildDarkTerminalTheme()
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

    // このマウント（StrictMode では2回走りうる）の分の保留を用意する。
    // 起動時の差し込み（initialText）があれば列の先頭に置く。以後 insertion
    // effect が押された順で後ろへ積む
    pendingInsertionsRef.current = session.initialText === null ? [] : [session.initialText]
    bracketedPasteReadyRef.current = false
    // 直前チャンクの末尾。ESC[?2004h はチャンクの境目で割れることがあるので、
    // 次のチャンクの先頭に前置してから探す（境界を跨いだ発生を落とさない）
    let insertionTail: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
    let insertionTimer: ReturnType<typeof setTimeout> | null = null

    /**
     * 保留の列を順に差し込み、タイマーを解除する。**「2004 を見た」への
     * 遷移も兼ねる**——以後 insertion effect は保留を積まず即座に paste する。
     * 二重に呼んでも無害（2回目は列が空なので何も paste しない）
     */
    const flushPendingInsertion = (): void => {
      bracketedPasteReadyRef.current = true
      if (insertionTimer !== null) {
        clearTimeout(insertionTimer)
        insertionTimer = null
      }
      const queued = pendingInsertionsRef.current
      pendingInsertionsRef.current = []
      for (const text of queued) term.paste(text)
    }

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
          // まだ 2004 を見ていない間だけ、bracketed paste が有効になった
          // 合図（ESC[?2004h）を探す。**保留の列が空でも走らせる**——起動時の
          // 差し込みが無いセッションでも、後から来る insertion（@ ボタン／
          // ドロップ）のために「見たか」を早く確定させておきたい。
          // 見つかったらここで保留をまとめて差し込む——**この検出こそが
          // 「末尾のスペースが消える」不具合の直し方そのもの**
          // （ファイル冒頭のコメント参照）
          if (!bracketedPasteReadyRef.current) {
            const combined = concatBytes(insertionTail, bytes)
            if (containsSequence(combined, BRACKETED_PASTE_ENABLE)) {
              flushPendingInsertion()
            } else {
              // 次のチャンクとの継ぎ目のために末尾を覚えておく
              // （必要なのはシーケンスの長さ − 1 バイトぶんだけ）
              insertionTail = tailBytes(combined, BRACKETED_PASTE_ENABLE.length - 1)
            }
          }
        },
        // **disposed で守る**——捨てられた側の PTY の終了イベントが遅れて
        // 届いても、生きている側のセッションを「終了済み」にしてはいけない
        // （台帳の markExited が ptyId を null に落とし、hasRunning が false
        // になり、タブを閉じても kill が飛ばなくなる）
        onExit: (code) => {
          if (disposed) return
          // 差し込む先がもう無い。タイマーだけ律儀に解除して保留の列を捨てる
          pendingInsertionsRef.current = []
          if (insertionTimer !== null) {
            clearTimeout(insertionTimer)
            insertionTimer = null
          }
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
        // 起動時の差し込み（M28）は上の onData が bracketed paste の合図を
        // 見て流す。**ここでは差し込まない**——ここは claude の TUI が
        // 立ち上がるより前で、囲まれずに1文字ずつ打たれたのと同じに見える
        // （@ のファイル検索が末尾のスペースを候補の確定として食う）。
        // 代わりに、いつまでも来ない場合の上限だけをここで仕掛ける。
        // **保留の列が空でも走らせる。** 2004 を見たかどうかは insertion
        // （@ ボタン／ドロップ）の待ち合わせにも使う1つの状態なので、
        // 起動時の差し込みが無いセッションでも「諦める」上限は要る——
        // さもないと後から来る insertion がいつまでも保留され続ける。
        // **`hidden` は見ない**（`fit()` と違い寸法を測らないので、隠れていても
        // 差し込んでよい）。`disposed` の判定は上の分岐で済んでいる
        if (!bracketedPasteReadyRef.current) {
          insertionTimer = setTimeout(() => {
            insertionTimer = null
            if (disposed) return
            flushPendingInsertion()
          }, 5000)
        }
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
      // 差し込みのタイマーは必ず解除する。解除し忘れると、5秒後に
      // disposed 済みの Terminal へ paste() しようとする
      // （タイマー本体の disposed ガードで実害は無いが、掃除は cleanup の役目）
      if (insertionTimer !== null) {
        clearTimeout(insertionTimer)
        insertionTimer = null
      }
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
   * 動いているタブへの差し込み（M28）。
   *
   * **消化済みの `seq` を ref で覚える。** effect の依存を `seq` だけにしても、
   * StrictMode の二重マウントでは mount → cleanup → mount で2回走る。
   * マウント時点で `insertion` が入っている経路は現状無いが、ここを守っておけば
   * 「二度差し込まれた」という追いにくい不具合の余地が消える
   *
   * **即座に paste するのは 2004 を既に見ている（準備できている）ときだけ。**
   * 起動中（約1秒）に `@` を押すと、起動時の差し込みと同じ理由で bracketed
   * paste に囲まれないまま TUI の前に流れ、同じ症状（末尾のスペースが @ の
   * 補完に食われる）が起きる。まだなら起動時の差し込みと同じ保留の列
   * （`pendingInsertionsRef`）へ積み、2004 を見てから（起動 effect の
   * flushPendingInsertion が）まとめて流す。**seq の重複排除を先に済ませて
   * から**保留に積む——同じ指示を二度積まないため
   */
  const lastInsertedRef = useRef<number | null>(null)
  const insertionSeq = insertion?.seq ?? null
  useEffect(() => {
    const term = termRef.current
    if (term === null || insertion === null) return
    if (lastInsertedRef.current === insertion.seq) return
    lastInsertedRef.current = insertion.seq
    if (bracketedPasteReadyRef.current) {
      term.paste(insertion.text)
    } else {
      pendingInsertionsRef.current.push(insertion.text)
    }
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
   *
   * **ここは 2004 待ちのゲートに通さない。** 起動時の差し込みと `@`（insertion
   * effect）は facet が勝手に送るものなので、準備できるまで待たせて構わない。
   * 一方、右クリックは人が「いま貼る」と決めた操作で、5秒の上限まで黙って
   * 遅らせる方が「消える」より悪い——だからここだけ `term.paste()` を即座に
   * 呼ぶ（この非対称は意図したもの）
   */
  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const term = termRef.current
    if (term === null) return
    if (term.hasSelection()) {
      const selected = term.getSelection()
      void clipboardIo
        .writeText(selected)
        // **成功してから選択を外す。** 先に外すと、失敗したときに
        // やり直すための選択が消えている（設計 §7.1 の順）
        .then(() => term.clearSelection())
        .catch((err: unknown) => {
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
