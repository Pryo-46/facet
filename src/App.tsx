import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { PanelLeft, PanelRight } from 'lucide-react'
import { ChoiceDialog } from '@/components/ChoiceDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ExportMenu } from '@/components/ExportMenu'
import { FileHeader } from '@/components/FileHeader'
import { EDITOR_MIN_WIDTH, PANE_MIN_WIDTH, PaneSplitter } from '@/components/PaneSplitter'
import { TerminalPane } from '@/components/TerminalPane'
import { buttonBase } from '@/components/button-styles'
import { FileList } from '@/components/FileList'
import { ToastStack } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import {
  createAppController,
  type AppController,
  type AppHost,
  type AppIo,
  type BannerKind,
} from '@/core/app-controller'
import { createAutoSaver } from '@/core/autosave'
import { createCoalescer } from '@/core/coalesce'
import { createColumnWidthStore, resizeColumns } from '@/core/column-resize'
import { groupFiles } from '@/core/file-grouping'
import { canCreateFileOfType } from '@/core/file-ops'
import {
  canRedo,
  canUndo,
  createHistory,
  record,
  redo as redoHistory,
  undo as undoHistory,
  type HistoryState,
} from '@/core/history'
import { isOutsideGlobalLayer } from '@/core/keyboard/global-layer'
import { resolveCommand, toKeyEventLike, type KeyContext } from '@/core/keyboard/keymap'
import { currentPlatform } from '@/core/keyboard/platform'
import { titleOf, withTitle } from '@/core/load'
import { dropModal, pushModal, shiftModal, type ModalRequest } from '@/core/modal-queue'
import type { ProjectFile } from '@/core/project-file'
import { READING_GUIDE_FILENAME, syncReadingGuide } from '@/core/reading-guide'
import { scanFolder } from '@/core/scan'
import { BUNDLED_SKILLS, syncBundledSkills } from '@/core/skill-sync'
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
  type TerminalState,
} from '@/core/terminal/sessions'
import { dismissToast, dismissToastByKey, pushToast, type ToastItem } from '@/core/toasts'
import { forceClose, interceptClose } from '@/fs/app-window'
import { copyToClipboard } from '@/fs/clipboard'
import {
  askSaveMarkdownPath,
  fileExists,
  joinPath,
  listJsonFiles,
  moveFileToTrash,
  pickProjectFolder,
  readProjectFile,
  watchFolder,
  writeProjectFile,
} from '@/fs/project-fs'
import { killAllPtys, tauriPtyIo } from '@/fs/pty'
import { tauriReadingGuideIo } from '@/fs/reading-guide-io'
import { allowSkillDir, tauriSkillSyncIo } from '@/fs/skill-resources'
import { appRegistry } from '@/modules'

const AUTOSAVE_DELAY_MS = 500

/**
 * 端末ペインの既定幅。**永続化しない**——「アプリを閉じるまで」が
 * モジュールの生存期間とちょうど一致する（M8 決定7 と同じ扱い）
 */
const paneWidthStore = createColumnWidthStore([420])

/**
 * 監視イベントを束ねる窓。fs プラグイン側のデバウンス（300ms）とは別に、
 * 1回の保存が複数イベントを送ってくるのを1回の再走査にまとめる
 */
const WATCH_COALESCE_MS = 150

/** バナーの表示順（**いま続いている状態**を出す場所。起きた出来事はトースト） */
const BANNER_ORDER: readonly BannerKind[] = ['io', 'save', 'scan', 'watch']

/**
 * コントローラへ渡す I/O。React に依存しないのでモジュール直下で1度だけ組む。
 * **ここが「コアは Tauri を知らない」の境界**——src/fs/* の関数を差すだけ
 */
const appIo: AppIo = {
  scan: (dir) => scanFolder(dir, { list: listJsonFiles, read: readProjectFile }, appRegistry),
  read: readProjectFile,
  write: writeProjectFile,
  exists: fileExists,
  trash: moveFileToTrash,
  join: joinPath,
  copyText: copyToClipboard,
  askSavePath: askSaveMarkdownPath,
  // **アプリを閉じるときに端末も全部殺す。** Windows では ConPTY の子は
  // ホストプロセスの終了で自動的には死なず、claude が孤児として残る
  forceClose: async () => {
    await killAllPtys()
    await forceClose()
  },
  createSaver: (spec) => createAutoSaver({ delayMs: AUTOSAVE_DELAY_MS, ...spec }),
}

/**
 * 額縁が取るグローバル層のキー文脈（rev 10章）。Undo/Redo だけを扱うため
 * 構造依存層の文脈は固定値でよい。modalOpen はダイアログが開いている間 true
 */
function globalKeyContext(modalOpen: boolean): KeyContext {
  return {
    platform: currentPlatform(),
    modalOpen,
    editing: false,
    fieldEmpty: false,
    deletableField: false,
    caretAtStart: false,
    caretAtEnd: false,
    arrowsOwnedByField: false,
    reorderEnabled: false,
    // 額縁のグローバル層はどのツールでも Undo/Redo だけを扱う。「子」という
    // 概念が及ばない層なので false 固定でよい
    hierarchical: false,
    horizontal: false,
  }
}

function App() {
  const [dark, setDark] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [paneOpen, setPaneOpen] = useState(false)
  const [terminals, setTerminals] = useState<TerminalState>(emptyTerminalState)
  // タブを閉じる確認ダイアログの `onConfirm` は承認まで遅延実行される
  // （レビュー指摘2）。`historyRef` / `modalOpenRef` と同じ「最新値の
  // 読み取り口」——確認待ちの間にタブが自然終了（`onExited`）していても、
  // 承認された時点の最新の台帳から `ptyId` を引き直せるようにする
  const terminalsRef = useRef(terminals)
  terminalsRef.current = terminals
  // **`paneWidthStore` が持つのは「ユーザーが選んだ幅」（意図）だけ。**
  // 書き込むのはドラッグ／キーボード／リセット（`PaneSplitter` の
  // `useColumnResize`）だけにする。ここでは読むだけ
  const paneWidth = useSyncExternalStore(paneWidthStore.subscribe, paneWidthStore.getSnapshot)
  const splitRef = useRef<HTMLDivElement | null>(null)
  // window リスナーはマウント時に1回しか張らないので、最新値は ref から読む
  //（**state 直読みに「簡潔化」しないこと**。常に初期値になる）
  const terminalPaneRef = useRef<HTMLElement | null>(null)

  /**
   * `splitRef`（サイドバーを含まない、エディタ＋ペインの区間）の実測幅
   *（実機確認の指摘A。M11 Task 11）。**ここには意図の幅を書き込まない。**
   *
   * レビュー指摘1: 最初の実装は `ResizeObserver` のコールバックで
   * `paneWidthStore.set(resizeColumns(...))` を直接呼び、クランプ後の
   * 値をそのまま意図として永続化していた。その結果、ウィンドウを一度でも
   * 狭めると store の値が 320px に潰れ、ウィンドウを元の大きさへ戻しても
   * 320px のまま二度と戻らなかった（`resizeColumns` は「今の意図」からの
   * 差分でしか計算しないため、潰れた値からは復元できない）。
   *
   * **直し方**: 「意図」（store）と「今画面に出す幅」（意図 ＋ 実測幅を
   * `resizeColumns` に通した戻り値）を分ける。実測幅はこの state に
   * 記録するだけにし、表示幅は描画のたびに `displayPaneWidth` として
   * 計算する。ウィンドウを広げれば `available` が増え、次の描画で
   * 意図の幅まで自然に戻る
   */
  const [paneAvailable, setPaneAvailable] = useState(0)

  useEffect(() => {
    const el = splitRef.current
    if (el === null) return
    const measure = () => setPaneAvailable(el.clientWidth)
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /**
   * 実際に画面へ出すペイン幅。**上限クランプの判断は `column-resize.ts`
   * 1箇所に保つ**——ここでも `resizeColumns` に `delta: 0` で通すだけで、
   * 新しい判断ロジックは書かない。`paneAvailable` が 0（未測定。jsdom や
   * 初回描画）のときは `resizeColumns` が上限を掛けないので、意図の幅が
   * そのまま出る
   */
  const displayPaneWidth =
    resizeColumns({
      widths: paneWidth,
      index: 0,
      delta: 0,
      minWidth: PANE_MIN_WIDTH,
      available: paneAvailable,
      flexMinWidth: EDITOR_MIN_WIDTH,
    })[0] ?? paneWidth[0]

  /**
   * タブを1本足す。**開く直前に必ず Skill を同期する**（設計 決定10）——
   * Skill の更新・追加が黙って取り残されないようにするため。
   * 同期に失敗しても起動は続ける（Skill が無くても端末は使える。設計 決定13）
   */
  const openTerminal = async () => {
    const dir = projectDir
    if (dir === null) return
    try {
      // scope の付与を先に。mac では `.claude/` がダイアログ由来の scope に
      // 入らないので、これが無いと同期の最初の exists で落ちる
      await allowSkillDir(dir)
      await syncBundledSkills(dir, tauriSkillSyncIo, BUNDLED_SKILLS)
    } catch (err: unknown) {
      showToast({
        message: `Skill をプロジェクトへ配置できませんでした（Skill 無しで起動します）: ${
          err instanceof Error ? err.message : String(err)
        }`,
        key: 'skill-sync',
      })
    }
    setTerminals((prev) => openSession(prev))
  }

  const closeTerminalNow = (id: number) => {
    // **updater の外で殺す。** setState の updater は純粋でなければならない
    //（StrictMode の二重実行で kill が2回飛ぶ。showToast の id 採番と同じ理由）
    // **`terminals` を直読みしない。** 確認ダイアログの `onConfirm` から
    // 遅延して呼ばれるので、閉じるボタンを押した瞬間のクロージャではなく
    // `terminalsRef.current` で承認された時点の最新の台帳を読む
    //（レビュー指摘2。historyRef と同じ理由）
    const target = terminalsRef.current.sessions.find((s) => s.id === id)
    if (target !== undefined && target.ptyId !== null) void tauriPtyIo.kill(target.ptyId)
    setTerminals((prev) => closeSession(prev, id))
  }

  /**
   * タブを閉じる。**実行中（starting/running）のタブは確認を経由する。**
   * 計画の決定12（確認なしで即座に殺す）を、実機で使った人間が「確認は出して
   * ほしい」と覆した（Task 11）。exited/failed は殺す PTY が無いので確認なしで
   * 閉じてよい。`key` を切ることで、同じタブへの × 連打が要求を積み上げず
   * 1件に置き換わる（switch-folder / close と同じ作法）
   */
  const closeTerminal = (id: number) => {
    const target = terminals.sessions.find((s) => s.id === id)
    if (target === undefined) return
    if (!isSessionRunning(target)) {
      closeTerminalNow(id)
      return
    }
    setModals((prev) =>
      pushModal(prev, {
        kind: 'confirm',
        key: `close-tab-${id}`,
        title: `${target.label} を終了しますか？`,
        description: '会話は Claude Code 側に残るので、--resume で戻せます。',
        confirmLabel: '終了する',
        onConfirm: () => closeTerminalNow(id),
      }),
    )
  }
  const [projectDir, setProjectDir] = useState<string | null>(null)
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  // 編集中データは履歴の present が正（Undo/Redo で入れ替わる。ファイル単位・
  // メモリ内。それ以前への復帰は Git の担当。rev 5章）
  const [history, setHistory] = useState<HistoryState<unknown> | null>(null)
  // コントローラが「いま編集中の内容」を読むための口。**最新値の読み取り口**であって
  // スナップショットではない（過去の値を凍結する用途に使わないこと。M5 の誤り2）
  const historyRef = useRef<HistoryState<unknown> | null>(null)
  historyRef.current = history
  const [banners, setBanners] = useState<Record<BannerKind, string | null>>({
    io: null,
    save: null,
    scan: null,
    watch: null,
  })
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastSeq = useRef(0)
  // モーダルの要求キュー。生産者は「ファイル削除の確認」「破棄して閉じる」
  //「外部変更の二択」の3つ。開いている間は操作言語を止める（rev 10章の境界規則）
  const [modals, setModals] = useState<ModalRequest[]>([])
  const head = modals[0] ?? null
  const modalOpen = modals.length > 0
  // window リスナーはマウント時の1回しか張らないので、最新値は ref から読む
  //（**state 直読みに「簡潔化」しないこと**。常に初期値 false になる）
  const modalOpenRef = useRef(modalOpen)
  modalOpenRef.current = modalOpen

  const setBanner = useCallback((kind: BannerKind, message: string | null) => {
    setBanners((prev) => (prev[kind] === message ? prev : { ...prev, [kind]: message }))
  }, [])
  const showToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    // updater は純粋でなければならない（StrictMode の二重実行で id を余分に
    // 消費しないよう、id は先に計算する）
    const id = ++toastSeq.current
    setToasts((prev) => pushToast(prev, { ...toast, id }))
  }, [])
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => dismissToast(prev, id))
  }, [])

  /**
   * コントローラは1度だけ作る。**state に入れないこと**——作り直すと台帳・選択・
   * 自動保存を丸ごと失う。ホストのコールバックはすべて setState か ref 読みなので
   * 再生成の必要が無い
   */
  const controllerRef = useRef<AppController | null>(null)
  if (controllerRef.current === null) {
    const host: AppHost = {
      setFiles,
      setProjectDir,
      setSelectedPath,
      // **これが Undo 履歴の破棄そのもの**（外部変更の取り込み時。rev 3章）
      setDocument: (data) => setHistory(data === null ? null : createHistory(data)),
      setBanner,
      showToast,
      dismissToast: (key) => setToasts((prev) => dismissToastByKey(prev, key)),
      showModal: (request) => setModals((prev) => pushModal(prev, request)),
      dropModal: (key) => setModals((prev) => dropModal(prev, key)),
      clearModals: () => setModals([]),
      getEditingData: () => historyRef.current?.present ?? null,
    }
    controllerRef.current = createAppController(appIo, host, appRegistry)
  }
  const controller = controllerRef.current

  const editingData = history === null ? null : history.present

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }

  // アンマウント時。**flush しない**——失敗で復元された pending を捨てる経路になる。
  // 実際のウィンドウ close は下の interceptClose を通る。
  //（StrictMode の二重マウントでもここは saver を止めるだけなので実害が無い）
  useEffect(() => {
    return () => controller.dispose()
  }, [controller])

  // ウィンドウ close を横取りしてコントローラのゲートに委ねる。
  useEffect(() => {
    const unlisten = interceptClose(async () => {
      const ok = await controller.requestClose()
      // **閉じると決まってから殺す。** false（閉じない）のときに殺すと、
      // 閉じ損ねたのに端末だけ失う。ここが通常のアプリ終了の唯一の経路
      //（`appIo.forceClose` は「破棄して閉じる」の脱出口だけを通る、別経路）
      if (ok) await killAllPtys()
      return ok
    })
    return () => {
      void unlisten.then((f) => f())
    }
  }, [controller])

  /**
   * フォルダを開き、開けたときだけ読み方ガイドを配る（スペック設計2）。
   * ガイドを書けなくても開くこと自体は成立させる——Skill 同期と同じ姿勢
   *（設計 決定13）。開けなかったフォルダには書かない（開けない場所へ
   * ファイルを増やさない）
   */
  const openProject = async (dir: string): Promise<boolean> => {
    const opened = await controller.openFolder(dir)
    if (!opened) return false
    try {
      await syncReadingGuide(dir, tauriReadingGuideIo)
    } catch (err: unknown) {
      showToast({
        message: `読み方ガイド（${READING_GUIDE_FILENAME}）を配置できませんでした: ${
          err instanceof Error ? err.message : String(err)
        }`,
        key: 'reading-guide-sync',
      })
    }
    return true
  }

  /**
   * 端末を全部終了してからフォルダを切り替える。**作業ディレクトリが
   * プロジェクトフォルダに固定されている**ので、残すと「別フォルダを見ている
   * Claude」が古い cwd のまま居座り、Skill も新しいフォルダ側に置かれる
   *（設計 決定12）。
   *
   * **`openFolder` が成功したときだけ端末を殺す。** 走査失敗などでフォルダを
   * 切り替えられなかった場合に先に端末を殺すと、ユーザーは元のフォルダに
   * 留まったまま Claude Code セッションだけを失う。cwd は TerminalTab の
   * 起動 effect がマウント時にしか読まないので、先に openFolder を待っても
   * 生きている端末が古い cwd のまま化けることはない（設計 決定12）
   */
  const switchFolder = async (dir: string) => {
    const opened = await openProject(dir)
    if (!opened) return
    await killAllPtys()
    setTerminals((prev) => closeAll(prev))
    setPaneOpen(false)
  }

  const openFolder = async () => {
    const dir = await pickProjectFolder()
    if (dir === null) return
    if (!hasRunning(terminals)) {
      await openProject(dir)
      return
    }
    setModals((prev) =>
      pushModal(prev, {
        kind: 'confirm',
        key: 'switch-folder',
        title: 'Claude Code のタブを終了してフォルダを切り替えますか？',
        description:
          '端末の作業フォルダは開いているプロジェクトに固定されています。会話は Claude Code 側に残るので、--resume で戻せます。',
        confirmLabel: '終了して切り替える',
        onConfirm: () => switchFolder(dir),
      }),
    )
  }

  const selected = files.find((f) => f.path === selectedPath) ?? null
  const selectedModule =
    selected && selected.result.status === 'editable'
      ? appRegistry.get(selected.result.type)
      : undefined
  // **`appRegistry.list()` を JSX の中で呼ばないこと。** 毎レンダーで新しい
  // 配列が返るため、下の groups の useMemo が毎回作り直しになる
  const modules = useMemo(() => appRegistry.list(), [])
  const groups = useMemo(() => groupFiles(files, modules), [files, modules])
  // 走査済み全ファイルの type（読めなかったファイルは null）。singleton 判定は
  // 型でなく物理条件（type が2件以上）なので、rejected/listOnly の type も含める
  const existingTypes = files.map((f) => f.result.type)
  const glossaryModule = appRegistry.get('glossary')
  // 用語集0個は正常な状態（新規プロジェクト）。押せば作れることを空状態で示す。
  // サイドバーの新規作成ボタンと同じ canCreateFileOfType を通すことで、
  //「作れる」の判定を1箇所に保つ
  const canCreateGlossary =
    glossaryModule !== undefined && canCreateFileOfType(glossaryModule, existingTypes)

  // 出力できるのは「開けているファイルを選んでいて、編集中データが揃っている」とき。
  // コントローラ側でも同じ条件を確認しているが、UI はそれを押せる／押せないの形で見せる
  const canExport = selectedModule !== undefined && editingData !== null

  const runHistory = (kind: 'undo' | 'redo') => {
    const h = historyRef.current
    if (h === null || selectedPath === null || selectedModule === undefined) return
    const next = kind === 'undo' ? undoHistory(h) : redoHistory(h)
    // 戻れない／進めないときは同一参照が返る
    if (next === h) return
    setHistory(next)
    controller.applyEdit(selectedPath, selectedModule, next.present)
  }

  // window リスナーからは常に最新の runHistory を呼ぶ（購読はマウント時の1回だけ）
  const runHistoryRef = useRef(runHistory)
  runHistoryRef.current = runHistory

  // グローバル層（rev 10章）: Undo/Redo は全ツール共通で額縁が取る。
  // 制御入力ではブラウザ標準の Undo が React の再レンダリングと食い違うため、
  // テキスト編集中もアプリの履歴に一本化する（境界規則への明示的な例外）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 端末ペインは操作言語の管轄外（rev 10章）。ここを通さないと
      // 端末の Ctrl+Z が Claude Code に届かず facet の Undo になる
      if (isOutsideGlobalLayer(e.target, terminalPaneRef.current)) return
      const cmd = resolveCommand(toKeyEventLike(e), globalKeyContext(modalOpenRef.current))
      if (cmd !== 'undo' && cmd !== 'redo') return
      e.preventDefault()
      runHistoryRef.current(cmd)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // フォルダ単位の監視（rev 3章。ファイル単位では外部リネームが取れない）。
  // イベントの種類は見ず、束ねて再走査する。フォルダを切り替えたら張り替える
  useEffect(() => {
    if (projectDir === null) return
    const coalescer = createCoalescer(WATCH_COALESCE_MS, () => {
      void controller.externalChange()
    })
    let unwatch: (() => void) | null = null
    let stopped = false
    const stop = () => {
      stopped = true
      // 先に監視を止めてから coalescer を捨てる——逆順だと、その間に届いた
      // イベントが notify() で無条件にタイマーを張り直し、切替/アンマウントの
      // 約 WATCH_COALESCE_MS 後に迷子の再走査が1回走る
      unwatch?.()
      unwatch = null
      coalescer.dispose()
    }
    // **開発中のページリロードでは React の後片付けが走らない。** projectDir は
    // state なのでリロードで消え、JS 側はフォルダを開き直すまで監視を張り直さない
    // 一方、Rust 側の watcher は生き残って死んだコールバックへイベントを送り続ける
    //（[TAURI] Couldn't find callback id ...）。本番のアプリはリロードしないが、
    // 検証中は「監視しているつもりで監視していない」状態になり、症状がバグと
    // 区別できなくなる（M5 の実機確認で踏んだ）
    const onBeforeUnload = () => stop()
    window.addEventListener('beforeunload', onBeforeUnload)
    void watchFolder(projectDir, () => coalescer.notify())
      .then((fn) => {
        // effect の後片付けが先に走っていたら、掴んだ監視をその場で止める
        if (stopped) fn()
        else {
          unwatch = fn
          setBanner('watch', null)
        }
      })
      .catch((err: unknown) => {
        setBanner(
          'watch',
          `フォルダの監視を開始できませんでした（外部の変更は自動で反映されません）: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      })
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      stop()
    }
  }, [projectDir, controller, setBanner])

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-canvas bg-grid-paper text-ink">
      <header className="flex items-center gap-4 border-b border-rule bg-surface px-6 py-3">
        <h1 className="text-lg font-bold text-ink">facet</h1>
        <Button onClick={() => void openFolder()}>フォルダを開く</Button>
        <Button
          variant="outline"
          disabled={history === null || !canUndo(history)}
          onClick={() => runHistory('undo')}
        >
          元に戻す
        </Button>
        <Button
          variant="outline"
          disabled={history === null || !canRedo(history)}
          onClick={() => runHistory('redo')}
        >
          やり直す
        </Button>
        <ExportMenu
          outputs={selectedModule?.outputs ?? []}
          disabled={!canExport}
          onCopy={(profile) => void controller.copyMarkdown(profile)}
          onExport={(profile) => void controller.exportMarkdown(profile)}
        />
        {projectDir && <span className="text-sm text-ink-muted">{projectDir}</span>}
        <button
          type="button"
          aria-label={sidebarOpen ? 'ファイル一覧を畳む' : 'ファイル一覧を開く'}
          aria-pressed={sidebarOpen}
          className={`${buttonBase} ml-auto p-1 text-ink-muted`}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <PanelLeft aria-hidden className="size-4" />
        </button>
        {/* **ラベルを `Claude Code を開く` にしないこと。** TerminalPane の
            空状態のボタンと accessible name が衝突し、テストの getByRole が
            2つ拾って落ちる */}
        <button
          type="button"
          aria-label={paneOpen ? 'Claude Code ペインを畳む' : 'Claude Code ペインを開く'}
          aria-pressed={paneOpen}
          disabled={projectDir === null}
          className={`${buttonBase} p-1 text-ink-muted`}
          onClick={() => {
            const next = !paneOpen
            setPaneOpen(next)
            if (next && terminals.sessions.length === 0) void openTerminal()
          }}
        >
          <PanelRight aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          className={`${buttonBase} text-sm text-ink-muted underline`}
          onClick={toggleTheme}
        >
          {dark ? 'ライト' : 'ダーク'}
        </button>
      </header>

      {BANNER_ORDER.map((kind) =>
        banners[kind] === null ? null : (
          <p key={kind} className="px-6 py-2 text-sm text-warning">
            {banners[kind]}
          </p>
        ),
      )}

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <aside className="w-64 shrink-0 overflow-y-auto border-r border-rule bg-surface">
            <FileList
              groups={groups}
              selectedPath={selectedPath}
              modules={modules}
              existingTypes={existingTypes}
              projectOpen={projectDir !== null}
              onSelect={(file) => void controller.selectFile(file.path)}
              onCreate={(module) => void controller.createNewFile(module)}
              onDelete={(file) => controller.requestDelete(file)}
            />
          </aside>
        )}

        {/* 幅を測る対象はエディタとペインの区間だけ（サイドバーの開閉に幅の
            上限計算が影響されないよう、splitRef はこの内側の div に置く） */}
        <div ref={splitRef} className="flex min-h-0 min-w-0 flex-1">
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {selected !== null && (
              <FileHeader
                title={
                  selected.result.status === 'editable' && editingData !== null
                    ? titleOf(editingData)
                    : (selected.result.title ?? '')
                }
                fileName={selected.name}
                typeLabel={selectedModule?.displayName ?? null}
                editable={selected.result.status === 'editable' && editingData !== null}
                onTitleChange={(next) => {
                  if (editingData === null || selectedModule === undefined) return
                  const updated = withTitle(editingData, next)
                  // エディタの onChange と同じ2本立て。**片方だけにしないこと**
                  //（record が無いと Undo が効かず、applyEdit が無いと保存されない）
                  setHistory((h) =>
                    h === null ? h : record(h, updated, 'title', Date.now()),
                  )
                  controller.applyEdit(selected.path, selectedModule, updated)
                }}
              />
            )}
            <div className="min-h-0 flex-1 overflow-auto">
              {selected === null && (
                <div className="p-6">
                  <p className="text-sm text-ink-muted">ファイルを選ぶとここで編集できます。</p>
                  {projectDir !== null && canCreateGlossary && glossaryModule !== undefined && (
                    <div className="mt-4">
                      <p className="text-sm text-ink-muted">
                        このプロジェクトにはまだ用語集がありません（新規プロジェクトでは正常な状態です）。
                      </p>
                      <button
                        type="button"
                        className={`${buttonBase} mt-2 border border-rule px-3 py-1 text-sm text-ink hover:bg-surface`}
                        onClick={() => void controller.ensureFileOfType(glossaryModule)}
                      >
                        用語集を作る
                      </button>
                    </div>
                  )}
                </div>
              )}
              {selected && selected.result.status !== 'editable' && selected.issues.length > 0 && (
                <ul className="list-disc px-6 pt-4 pl-10 text-sm text-warning">
                  {selected.issues.map((issue, i) => (
                    <li key={`${issue.rule}-${i}`}>{issue.message}</li>
                  ))}
                </ul>
              )}
              {selected?.result.status === 'rejected' && (
                <div className="p-6">
                  <h2 className="mb-2 font-bold text-warning">
                    このファイルは開けません（{selected.result.reason}）
                  </h2>
                  <ul className="list-disc pl-5 text-sm text-ink">
                    {selected.result.errors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-ink-muted">
                    外部エディタで修正してからフォルダを開き直してください。
                  </p>
                </div>
              )}
              {selected?.result.status === 'listOnly' && (
                <p className="p-6 text-sm text-ink-muted">{selected.result.reason}</p>
              )}
              {selected?.result.status === 'editable' && selectedModule && editingData !== null && (
                <selectedModule.Editor
                  key={selected.path}
                  data={editingData}
                  issues={selected.issues}
                  modalOpen={modalOpen}
                  onChange={(next: unknown, mergeKey?: string | null) => {
                    setHistory((h) => (h === null ? h : record(h, next, mergeKey ?? null, Date.now())))
                    controller.applyEdit(selected.path, selectedModule, next)
                  }}
                />
              )}
            </div>
          </section>

          {paneOpen && projectDir !== null && (
            <PaneSplitter
              containerRef={splitRef}
              store={paneWidthStore}
              // ドラッグ／キーボードの基準を「いま画面に出している幅」にする
              // （レビュー指摘。store の意図を直接基準にすると、狭めた状態で
              // ハンドルに触れたときにデッドゾーンが生まれ、クランプ後の値を
              // そのまま意図として書き戻してしまう）
              referenceWidth={displayPaneWidth}
            />
          )}
          {projectDir !== null && (
            <aside
              ref={terminalPaneRef}
              // **`paneOpen && <aside>` にしないこと。** アンマウントすると
              // xterm のスクロールバックが消え、開き直すたびに新しい claude が
              // 立ち上がる（設計 決定6）。畳む＝隠すだけ。
              // display は排他なので三項で切り替える（`hidden` と `flex` を
              // 並べてもどちらが勝つかは出力順まかせになる）
              className={`${paneOpen ? 'flex' : 'hidden'} shrink-0 flex-col border-l border-rule`}
              style={{ width: displayPaneWidth }}
            >
              <TerminalPane
                state={terminals}
                cwd={projectDir}
                ptyIo={tauriPtyIo}
                paneVisible={paneOpen}
                onOpen={() => void openTerminal()}
                onClose={closeTerminal}
                onActivate={(id) => setTerminals((prev) => activateSession(prev, id))}
                onRunning={(id, ptyId) => setTerminals((prev) => markRunning(prev, id, ptyId))}
                onExited={(id, message) => setTerminals((prev) => markExited(prev, id, message))}
                onFailed={(id, message) => setTerminals((prev) => markFailed(prev, id, message))}
              />
            </aside>
          )}
        </div>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismiss} modalOpen={modalOpen} />
      <ConfirmDialog
        open={head?.kind === 'confirm'}
        title={head?.kind === 'confirm' ? head.title : ''}
        description={head?.kind === 'confirm' ? head.description : ''}
        confirmLabel={head?.kind === 'confirm' ? head.confirmLabel : ''}
        onConfirm={() => {
          // 表示中の要求を先に片付けてから起動する（M4 で確定した形）
          const request = head
          setModals((prev) => shiftModal(prev))
          if (request?.kind === 'confirm') void request.onConfirm()
        }}
        onCancel={() => setModals((prev) => shiftModal(prev))}
      />
      <ChoiceDialog
        open={head?.kind === 'choice'}
        title={head?.kind === 'choice' ? head.title : ''}
        description={head?.kind === 'choice' ? head.description : ''}
        primaryLabel={head?.kind === 'choice' ? head.primaryLabel : ''}
        secondaryLabel={head?.kind === 'choice' ? head.secondaryLabel : ''}
        onPrimary={() => {
          const request = head
          setModals((prev) => shiftModal(prev))
          if (request?.kind === 'choice') void request.onPrimary()
        }}
        onSecondary={() => {
          const request = head
          setModals((prev) => shiftModal(prev))
          if (request?.kind === 'choice') void request.onSecondary()
        }}
      />
    </main>
  )
}

export default App
