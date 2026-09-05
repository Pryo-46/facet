import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Download, Moon, PanelLeft, Redo2, RefreshCw, Sun, SquareTerminal, Undo2 } from 'lucide-react'
import { ChoiceDialog } from '@/components/ChoiceDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ExportMenu } from '@/components/ExportMenu'
import { FileHeader } from '@/components/FileHeader'
import { EDITOR_MIN_WIDTH, PANE_MIN_WIDTH, PaneSplitter } from '@/components/PaneSplitter'
import { TableCopyDialog } from '@/components/TableCopyDialog'
import { TerminalPane } from '@/components/TerminalPane'
import { ToolbarButton, UNSUPPORTED_REASON } from '@/components/ToolbarButton'
import { buttonBase } from '@/components/button-styles'
import { FileList } from '@/components/FileList'
import { IssueBanner } from '@/components/IssueBanner'
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
import { fileReference, fileReferences } from '@/core/terminal/file-reference'
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
import {
  buttonLabel,
  canCheck,
  failed,
  foundNone,
  foundUpdate,
  initialUpdateState,
  isEmphasized,
  // **`progress` のままにしないこと。** 額縁の文脈では「何の進捗か」が読めない
  progress as advanceProgress,
  startCheck,
  startInstall,
  type UpdateState,
} from '@/core/update-check'
import { readAppVersion } from '@/fs/app-version'
import { forceClose, interceptClose } from '@/fs/app-window'
import {
  copyHtmlToClipboard,
  copyToClipboard,
  readClipboardHtml,
  tauriClipboardIo,
} from '@/fs/clipboard'
import { onDragDrop } from '@/fs/drag-drop'
import {
  allowProjectDir,
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
import { readLastProjectDir, saveLastProjectDir } from '@/fs/settings-fs'
import { allowSkillDir, tauriSkillSyncIo } from '@/fs/skill-resources'
import { checkForUpdate, type AvailableUpdate } from '@/fs/updater'
import { appRegistry } from '@/modules'

const AUTOSAVE_DELAY_MS = 500

/**
 * 端末ペインの既定幅。**永続化しない**——「アプリを閉じるまで」が
 * モジュールの生存期間とちょうど一致する
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
  // Miro 等とのクリップボード交換。コントローラが押下時に使う
  copyHtml: copyHtmlToClipboard,
  readClipboardHtml,
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
 * 走っている最中の Skill 同期（フォルダごとに1本）。
 *
 * **同じフォルダの同期を並走させない。置き直しは冪等ではない:**
 * - 削除は tauri-plugin-fs が先に `symlink_metadata` を見るため、相手が先に
 *   消したパスでは「メタデータが取れない」で失敗する
 * - 片方の削除ループが相手の書き込みより後ろへずれ込むと、**置いたばかりの
 *   `scripts/` を消してしまう**（そちらの書き込みが ENOENT で落ちる）
 *
 * 出る症状は「Skill をプロジェクトへ配置できませんでした」——複数の実バグが
 * 同じ文言で出るので、次の実機確認を誤診させる。
 *
 * **並走が起きる経路。** StrictMode が二重に起こすのはマウント時の effect
 * だけで、マウント時点の `projectDir` は `null` なのでこの effect は即
 * return する。同期が始まるのはフォルダを開いた**更新**時で、
 * 更新の effect は二重に起こらない（`src/App.dom.test.tsx` を StrictMode で
 * 包んで実測: `interceptClose` は2回呼ばれるのに、同期は1回だけだった）。
 *
 * それでも並走はしうる: 同期が終わる前に**別のフォルダへ切り替えて戻る**と、
 * 前の同期が走ったまま同じフォルダの同期がもう1本始まる。
 *
 * **起動時に前回のフォルダを復元する機能があるが、その復元は別の
 * `useEffect` の中で非同期に `projectDir` をセットするため**、マウント直後
 *（この Skill 同期 effect が走る時点）ではまだ `projectDir` は `null` の
 * まま——StrictMode の二重マウントも、Skill 同期に関しては依然として
 * 発火しない（重複排除がガードしているのは相変わらず A→B→A のケースだけ）
 */
const skillSyncInFlight = new Map<string, Promise<void>>()

/**
 * フォルダ `dir` へ同梱 Skill を置く。走っている最中なら**その同じ実行を待つ**。
 *
 * `allowSkillDir` は同期の**前**に呼ぶ。mac では `.claude/` がダイアログ由来の
 * scope に入らないので、これが無いと同期の最初の `exists` で落ちる
 */
function syncSkillsOnce(dir: string): Promise<void> {
  const running = skillSyncInFlight.get(dir)
  if (running !== undefined) return running
  const task = (async () => {
    await allowSkillDir(dir)
    await syncBundledSkills(dir, tauriSkillSyncIo, BUNDLED_SKILLS)
  })().finally(() => {
    // 終わったら忘れる。次にフォルダを開き直したときは改めて置き直す
    skillSyncInFlight.delete(dir)
  })
  skillSyncInFlight.set(dir, task)
  return task
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
  // タブを閉じる確認ダイアログの `onConfirm` は承認まで遅延実行される。
  // `historyRef` / `modalOpenRef` と同じ「最新値の
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
  /** エクスプローラからファイルを持ってこられている最中か（設計 §6.3） */
  const [dropActive, setDropActive] = useState(false)

  /**
   * `splitRef`（サイドバーを含まない、エディタ＋ペインの区間）の実測幅。
   * **ここには意図の幅を書き込まない。**
   *
   * `ResizeObserver` のコールバックで `paneWidthStore.set(resizeColumns(...))`
   * を直接呼び、クランプ後の値をそのまま意図として永続化すると、ウィンドウを
   * 一度でも狭めたときに store の値が 320px に潰れ、ウィンドウを元の大きさへ
   * 戻しても 320px のまま戻らない（`resizeColumns` は「今の意図」からの
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
   * いま選択しているファイルの参照。無ければ null。
   * ペインを開く／タブを足すときの初期テキストになる（設計 §4.4）
   */
  const selectedReference = (): string | null =>
    projectDir === null || selectedPath === null ? null : fileReference(projectDir, selectedPath)

  /**
   * タブを1本足す。**Skill の同期はここでは行わない**——Skill はプロジェクトに
   * 属するものであって端末セッションに属するものではない。同期は
   * `projectDir` の effect（下の「同梱 Skill の配置」）がフォルダ1つにつき
   * 1回だけ走らせる。ここに置くと「＋ タブを追加」を押した回数だけ
   * 「消して置き直す」が起きる
   */
  const openTerminal = (initialText?: string) =>
    setTerminals((prev) => openSession(prev, initialText ?? selectedReference()))

  /**
   * 差し込み指示。**1つだけ持つ**——宛先の振り分けは `TerminalPane`、
   * 同じ指示を二度実行しない保証は `seq` の単調増加（`TerminalTab` が消化条件に使う）
   */
  const [insertion, setInsertion] = useState<{
    targetId: number
    seq: number
    text: string
  } | null>(null)
  const insertionSeq = useRef(0)

  /**
   * ファイルを Claude Code へ渡す（一覧の `@` ボタンとエクスプローラからの
   * ドロップが共有する）。**押した人がやりたいのは「渡すこと」**なので、ペインが
   * 閉じていても・タブが1本も無くても、開いて起動するところまで面倒を見る
   */
  const handoffToTerminal = (text: string) => {
    setPaneOpen(true)
    // **`terminals` を直読みしない。** ドロップのリスナは1回しか張らないので、
    // 最新の台帳は ref から読む（closeTerminalNow と同じ理由）
    //
    // **「実行中のタブが無い」も「タブが無い」と同じ扱いにする。**
    // markExited / markFailed はセッションを台帳に残し activeId も指したままにするので、
    // activeId の null 判定だけでは死んだ PTY へ書きに行ってしまう（pty_write が
    // 「その端末はもうありません」で拒否し、タブの文言が受け渡しと無関係な
    // 書き込み失敗に化ける）。押した人がやりたいのは「渡すこと」なので、新しく起こす
    const active =
      terminalsRef.current.sessions.find(
        (s) => s.id === terminalsRef.current.activeId && isSessionRunning(s),
      ) ?? null
    if (active === null) {
      openTerminal(text)
      return
    }
    // **採番は updater の外。** setState の updater は純粋でなければならない
    //（StrictMode の二重実行で seq を余分に消費する。showToast の id と同じ理由）
    const seq = ++insertionSeq.current
    setInsertion({ targetId: active.id, seq, text })
  }

  const closeTerminalNow = (id: number) => {
    // **updater の外で殺す。** setState の updater は純粋でなければならない
    //（StrictMode の二重実行で kill が2回飛ぶ。showToast の id 採番と同じ理由）
    // **`terminals` を直読みしない。** 確認ダイアログの `onConfirm` から
    // 遅延して呼ばれるので、閉じるボタンを押した瞬間のクロージャではなく
    // `terminalsRef.current` で承認された時点の最新の台帳を読む
    //（historyRef と同じ理由）
    const target = terminalsRef.current.sessions.find((s) => s.id === id)
    if (target !== undefined && target.ptyId !== null) void tauriPtyIo.kill(target.ptyId)
    setTerminals((prev) => closeSession(prev, id))
  }

  /**
   * タブを閉じる。**実行中（starting/running）のタブは確認を経由する。**
   * exited/failed は殺す PTY が無いので確認なしで
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
  // window リスナーはマウント時に1回しか張らないので、最新値は ref から読む
  //（terminalPaneRef の隣のコメントと同じ理由）
  const projectDirRef = useRef(projectDir)
  projectDirRef.current = projectDir
  const handoffRef = useRef(handoffToTerminal)
  handoffRef.current = handoffToTerminal
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  // 編集中データは履歴の present が正（Undo/Redo で入れ替わる。ファイル単位・
  // メモリ内。それ以前への復帰は Git の担当。rev 5章）
  const [history, setHistory] = useState<HistoryState<unknown> | null>(null)
  // コントローラが「いま編集中の内容」を読むための口。**最新値の読み取り口**であって
  // スナップショットではない（過去の値を凍結する用途に使わないこと）
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

  // ── 自動アップデート（Windows のみ。判定は描画時の currentPlatform） ──
  const [updateState, setUpdateState] = useState<UpdateState>(initialUpdateState)
  /**
   * 見つかった更新の実体。**state に入れないこと**——`install` という関数を
   * 持つので、`useState` に渡すと遅延初期化の関数と取り違えられる
   */
  const availableUpdateRef = useRef<AvailableUpdate | null>(null)
  /**
   * 更新の非同期処理が走っている間の錠前。**state で判定しないこと**——
   * `setUpdateState` に渡す更新関数が同期に呼ばれる保証は無いため、そこで
   * 「始まったか」を見ると、連打や「起動時チェックと手動チェックの重なり」で
   * 2本走る隙間ができる。`canCheck(state)` はボタンの `disabled` を導く役で、
   * こちらは実際の多重起動を止める役。**役が違うので両方要る**
   */
  const updateBusyRef = useRef(false)
  /**
   * 直前に押したトーストの文字列。**組み立てた文字列が前回と同じなら
   * `showToast` を呼ばない**——`showToast` は呼ぶたびに
   * 新しい id を採番し、`ToastStack` はその `id` を key にしている
   * （`src/components/Toast.tsx`）。同じ内容のトーストでも id が変われば
   * React は unmount → remount する。`ToastRow` は `role="status"` の
   * ライブリージョンなので、2MB のインストーラだと1回の更新で
   * スクリーンリーダーが約250回読み上げ直し、その間「閉じる」ボタンも
   * ポインタの下で作り直され続ける
   */
  const lastProgressMessage = useRef<string | null>(null)

  /**
   * 更新を確認する。**起動時は静かに諦める**——ネットワークが無い環境で
   * 起動するたびにエラーが出るのは雑音でしかない。見せるのは利用者が
   * 自分でボタンを押したときだけ
   */
  const runUpdateCheck = useCallback(
    async (manual: boolean) => {
      if (updateBusyRef.current) return
      updateBusyRef.current = true
      setUpdateState(startCheck)
      try {
        const update = await checkForUpdate()
        availableUpdateRef.current = update
        setUpdateState((prev) =>
          update === null ? foundNone(prev) : foundUpdate(prev, update.version),
        )
        if (manual && update === null) showToast({ message: 'facet は最新版です', key: 'update' })
      } catch (err: unknown) {
        console.error('更新の確認に失敗しました', err)
        const message = err instanceof Error ? err.message : String(err)
        setUpdateState((prev) => failed(prev, message))
        if (manual) showToast({ message: `更新を確認できませんでした: ${message}`, key: 'update' })
      } finally {
        updateBusyRef.current = false
      }
    },
    [showToast],
  )

  /**
   * 起動時に1回だけ確認する（**一回性ガードは起動時のフォルダ復元と同じ形**。
   * StrictMode の二重マウントで2回チェックしない）。
   *
   * **`cancelled` フラグは持たない。** App はアプリの生存期間そのまま
   * マウントされ続ける唯一のトップレベルで、実際に unmount されるのは
   * StrictMode の合成的な二重起動とテストの `cleanup()` だけ。React 18 以降は
   * アンマウント後の setState を警告しないので、握り潰す実害が無い一方、
   * フラグを持たせると（復元の effect と同じ理屈で）合成的な unmount が
   * 1回目の試み自体を壊す
   */
  const updateCheckedRef = useRef(false)
  useEffect(() => {
    if (updateCheckedRef.current) return
    updateCheckedRef.current = true
    void runUpdateCheck(false)
  }, [runUpdateCheck])

  /**
   * 額縁に出す版番号。**取れるまでと、取れなかったときは何も出さない**——
   * 額縁の添え物のために起動を落とさないし、`?` のような穴埋めも置かない
   * （見出しの隣に意味の無い記号が残るだけ）。一回性ガードを持たせないのは
   * 上の更新チェックと同じ理由（合成的な二重マウントが1回目を壊す）で、
   * 2回読んでも同じ値が返るだけの読み取りなので害が無い
   */
  const [appVersion, setAppVersion] = useState<string | null>(null)
  useEffect(() => {
    readAppVersion().then(setAppVersion, (err: unknown) => {
      console.error('版番号を取得できませんでした', err)
    })
  }, [])

  /**
   * 更新のインストールを要求する。**確認を挟むのは、承諾した瞬間に facet が
   * 終了するから**——保存済みでも、Claude Code のセッションは切れる。
   * 確認は既存のモーダルキューに乗せる（生産者を増やすだけで足りる）。
   *
   * `description` は**ただの文字列**（`ConfirmDialog` は `whitespace-pre-line`
   * で改行を活かすだけで、Markdown は解釈しない）。強調記法を書いても
   * `**` がそのまま出るので使わない
   */
  const requestInstall = useCallback(
    (version: string) => {
      const running = hasRunning(terminals)
      setModals((prev) =>
        pushModal(prev, {
          kind: 'confirm',
          key: 'update',
          title: 'facet を更新する',
          description: [
            `v${version} をダウンロードしてインストールします。`,
            '更新のため facet を終了します。編集内容は自動保存済みです。',
            ...(running ? ['Claude Code のセッションは切断されます。'] : []),
            '更新後に facet を開き直してください。',
          ].join('\n'),
          confirmLabel: '更新する',
          onConfirm: async () => {
            const update = availableUpdateRef.current
            if (update === null || updateBusyRef.current) return
            updateBusyRef.current = true
            setUpdateState((prev) => startInstall(prev))
            try {
              await update.install((chunk, total) => {
                setUpdateState((prev) => advanceProgress(prev, chunk, total))
              })
              // **成功してもここへは来ない見込み**（プロセスが落ちる）。
              // 来てしまった場合は installing のまま置く——`canCheck` が false を
              // 返し続けるので、更新中に見えるボタンのまま止まる。
              // **錠前をここで開けないのは意図的**（installing からは error にしか
              // 抜けない。`src/core/update-check.ts`）
            } catch (err: unknown) {
              updateBusyRef.current = false
              console.error('更新のインストールに失敗しました', err)
              const message = err instanceof Error ? err.message : String(err)
              setUpdateState((prev) => failed(prev, message))
              showToast({ message: `更新できませんでした: ${message}`, key: 'update' })
            }
          },
        }),
      )
    },
    [showToast, terminals],
  )

  /**
   * ダウンロードの進捗をトーストで流す。**`key: 'update'` で置き換わる**ので
   * 積み上がらない（`pushToast` が同じ key を差し替える）。更新まわりの通知は
   * チェックの失敗も「最新です」も同じ key なので、常に1本に保たれる
   */
  useEffect(() => {
    if (updateState.kind !== 'installing') {
      // 次の更新（次の installing）で1件目のトーストが出なくなるのを防ぐ
      lastProgressMessage.current = null
      return
    }
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1)
    const message =
      updateState.total === null
        ? `更新をダウンロード中… ${mb(updateState.downloaded)} MB`
        : `更新をダウンロード中… ${mb(updateState.downloaded)} / ${mb(updateState.total)} MB`
    // 組み立てた文字列が前回と同じなら push しない（上の lastProgressMessage
    // のコメント参照。理由は id の採番と role="status" の読み上げ直し）
    if (message === lastProgressMessage.current) return
    lastProgressMessage.current = message
    showToast({ message, key: 'update' })
  }, [updateState, showToast])

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
      // 履歴を保ったまま積む（クリップボード取り込みの上書き）。
      // エディタの onChange と同じ形——mergeKey に null を渡すのは「独立した履歴」の意味
      recordEdit: (data) =>
        setHistory((h) => (h === null ? h : record(h, data, null, Date.now()))),
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

  /**
   * エディタからの「画面に出ている行」の報告をコントローラへ渡す。
   * **`useCallback` で参照を固定すること**——エディタ側は依存配列に入れており、
   * 毎レンダー新しい関数を渡すと報告の `useEffect` が毎レンダー走る
   */
  const onVisibleIds = useCallback(
    (ids: ReadonlySet<string> | null, total: number) => controller.setVisibleIds(ids, total),
    [controller],
  )

  const editingData = history === null ? null : history.present

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    // アプリ本体の面・文字を切り替える。**端末（TerminalTab）は追従しない**
    // ——常にダーク固定にしている（端末は facet の面
    // ではなく「端末の面」）
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
    // 保存できなくても次回単に復元されないだけで、このセッションの作業には
    // 影響しない。読み方ガイドの配置失敗（下）とは違いトーストは出さない
    try {
      await saveLastProjectDir(dir)
    } catch (err: unknown) {
      console.error('最後に開いたフォルダの保存に失敗しました', err)
    }
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

  // **StrictMode 対策の一回性ガード。** 素朴に `cancelled` フラグだけで
  // 後片付けを実装すると（1回目のマウントの cleanup が `cancelled` を立てて
  // からでないと2回目のマウントの effect が走らない、という前提のコードは）
  // 逆に壊れる: StrictMode は1回目の mount → cleanup → 2回目の mount を
  // 同一タスク内で同期的に行うため、`cancelled` は非同期処理（最初の
  // `await`）が終わるより前に立つ。ここで「試みたかどうか」自体を ref に
  // 固定して2回目の実行を弾く一方、1回目の非同期処理は `cancelled` チェックを
  // 挟まずに最後まで走らせる——2回目に丸ごと引き継がせるのではなく、1回目を
  // 完走させることで「復元は正確に1回」を保証する
  const hasAttemptedRestoreRef = useRef(false)

  /**
   * 起動時に前回開いていたフォルダを自動で復元する。ダイアログを
   * 経由しないため、`fileExists` の前に `allowProjectDir` で fs の実行時 scope
   * を明示的に取り直す必要がある（`allow_project_dir` 参照。ダイアログ由来の
   * scope はセッション限りで次回起動には引き継がれない）。
   *
   * あらゆる失敗（設定の読み込み・scope の再付与・存在確認）は「フォルダ
   * 未選択」の通常起動として握りつぶす——ユーザーに通知するほどの障害ではない。
   *
   * **アンマウント時に中断しない。** App はアプリの生存期間そのままマウント
   * され続ける唯一のトップレベルであり、実際に unmount されるのは
   * StrictMode の合成的な二重起動のときだけ（本番でも `App.dom.test.tsx`
   * の `cleanup()` でも、実 unmount 後に状態更新が意味を持つ場面は無い）。
   * `cancelled` フラグを持たせると、まさにその合成的 unmount が1回目の
   * 試み自体を壊してしまう（上の一回性ガードのコメント参照）
   */
  useEffect(() => {
    if (hasAttemptedRestoreRef.current) return
    hasAttemptedRestoreRef.current = true
    void (async () => {
      try {
        const dir = await readLastProjectDir()
        if (dir === null) return
        await allowProjectDir(dir)
        if (!(await fileExists(dir))) return
        await openProject(dir)
      } catch (err: unknown) {
        console.error('起動時のフォルダ復元に失敗しました', err)
      }
    })()
    // openProject は毎レンダー再生成されるが、上の一回性ガード
    // （hasAttemptedRestoreRef）で実行は起動時の1回に固定されている。
    // 依存に加えても実行回数は変わらないまま警告だけが消える
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
   *
   * **フォルダ切替の唯一の経路。** 実行中のタブが1本も無い場合もここを通る
   *（確認ダイアログを挟むかどうかだけが `openFolder` 側の判断）。終了済み
   * （exited / failed）のタブは殺す PTY を持たないが、旧フォルダの残骸なので
   * 画面からも消す。**帰結として、端末を使っていなくてもフォルダを切り替えると
   * ペインは畳まれる**——旧フォルダのために開いていたペインを新フォルダで
   * そのまま開いたままにする理由が無い。
   *
   * **`killAllPtys()` が `setTerminals(closeAll)` より先なので、`await` の
   * 最中に解決した spawn が一瞬 `running` になる窓がある**（溜まった打鍵を
   * 既に死んだ PTY へ流しうる）。無害である——`closeAll` が同じバッチで
   * 着地し、遅れて届く `onFailed` は `patch` が「その id はもう無い」で
   * 同じ state を返す（`src/core/terminal/sessions.ts`）。待ち行列
   *（`pendingRef`）とアンマウント時 kill の両方がこの窓へ流れ込むので、
   * 順序を入れ替えるときはここを読むこと
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
    // **実行中のタブが無くても switchFolder を通す。** `hasRunning` は
    // starting / running しか見ないので、ここで素通りさせると exited /
    // failed のタブが旧フォルダの残骸として画面に残る。`hasRunning` は
    // **確認ダイアログの要否だけ**に使い、後始末は1本の経路に寄せる
    if (!hasRunning(terminals)) {
      await switchFolder(dir)
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

  // 外部ツールとのクリップボード交換（規約7）。**額縁はツールを
  // 名指ししない**——活性の判断はすべて選択中モジュールが宣言しているかどうかで決める
  const exchange = selectedModule?.clipboardExchanges?.[0]
  const [clipboardHasImport, setClipboardHasImport] = useState(false)

  /**
   * ウィンドウがアクティブになったらクリップボードを1回だけ見る。
   *
   * **ポーリングはしない。** Miro のデータが載る瞬間は「Miro でコピーして facet に
   * 戻ってくる瞬間」なので、フォーカスを得たときに読めば足りる。常時ポーリングは
   * CPU を食うわりに得るものがない。
   *
   * Tauri の window イベントではなく DOM の focus を使うのは、**コアを Tauri に
   * 近づけないため**と、DOM のテストでそのまま発火させられるため。
   *
   * **`src/fs/clipboard.ts` を直接呼ぶ**（`appIo.readClipboardHtml` ではない）。
   * ここはボタンの活性を決めるためだけの読み取りで、コントローラの判断には
   * 関わらない。額縁は元々 `AppIo` を組み立てる側なので fs を知っている——
   * コントローラ（押された時点で読み直す方）が `io.readClipboardHtml` を呼ぶのとは
   * 役割が違うので、片方に寄せない
   */
  useEffect(() => {
    if (exchange === undefined) {
      setClipboardHasImport(false)
      return
    }
    let alive = true
    const check = (): void => {
      void readClipboardHtml().then((html) => {
        if (alive) setClipboardHasImport(exchange.canImport(html))
      })
    }
    check()
    window.addEventListener('focus', check)
    return () => {
      alive = false
      window.removeEventListener('focus', check)
    }
  }, [exchange])

  /**
   * 表形式でコピー・Miro 交換2本の「押せない理由」。
   * 「どのボタンが今のツールで使えるのか、なぜ押せないのか」を画面で答える。
   * **ファイル未選択を先に見る**——
   * それが利用者にとって次に取れる、動ける一手だから（`UNSUPPORTED_REASON` を
   * 先に見せても何もできない）。**活性の判断にモジュールの `type` を使わない**のは
   * 元の規約のままで、ここでも `tableExport` / `exchange` の宣言の有無だけで決める。
   * 文言はツールを名指ししない（「Miro」だけは、クリップボードの形式の名前として
   * 元々の規約が名指しを許している）。
   *
   * **`ExportMenu`（Markdown をコピー／書き出す）の理由はここには無い。**
   * `outputs` が空＝Markdown 出力を持たない、の判定は `outputs` を実際に持つ
   * `ExportMenu.tsx` 側の仕事——ここで渡すのは「ファイルを選んでいるか」
   * （`exportMenuUnusable`）だけで足りる
   */
  const NO_FILE_REASON = 'ファイルを選んでください'
  const exportMenuUnusable = !canExport ? NO_FILE_REASON : null
  const tableCopyUnusable = !canExport
    ? NO_FILE_REASON
    : selectedModule?.tableExport === undefined
      ? UNSUPPORTED_REASON
      : null
  const miroCopyUnusable = !canExport
    ? NO_FILE_REASON
    : exchange === undefined
      ? UNSUPPORTED_REASON
      : null
  // **`canExport` を見ない。** 取り込みはファイルを選んでいなくても、ロジック
  // ツリーの新規作成前でも意味を持ちうる操作で、元から `canExport` に依存して
  // いなかった（既存の設計をそのまま保つ）
  const miroImportUnusable =
    exchange === undefined
      ? UNSUPPORTED_REASON
      : !clipboardHasImport
        ? 'クリップボードに Miro のデータがありません'
        : null

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

  /**
   * エクスプローラからのドロップ。
   *
   * **HTML5 の D&D は使わない。** Tauri の `dragDropEnabled` は既定で `true` で、
   * その状態では Windows の HTML5 D&D が効かない（両立しない）。facet は HTML5
   * D&D を1箇所も使っていない（仕切りもキャンバスもポインタイベント）ので、
   * 既定のまま Tauri のイベントを受ける方が得（設計 §6.1）。
   *
   * **イベントはウィンドウ全体で発火する**ので、位置がペインの矩形の中に
   * あるときだけ受ける。**畳んでいるペインは `display:none` で矩形が 0 になり、
   * 必ず「外」と判定される**——見えていない場所へは落とせない、という結果に
   * なるが、狙いどおりである（落とし先が見えないドロップは成立しない）
   */
  useEffect(() => {
    const inPane = (position: { x: number; y: number }): boolean => {
      const pane = terminalPaneRef.current
      if (pane === null) return false
      // position は**物理ピクセル**。CSS ピクセルへ直してから矩形と比べる
      const ratio = window.devicePixelRatio || 1
      const x = position.x / ratio
      const y = position.y / ratio
      const rect = pane.getBoundingClientRect()
      // **矩形が潰れていたら「外」。** 畳んだペインは display:none で全部 0 になり、
      // 両端を含む比較だと (0,0) の1点だけが一致してしまう（ウィンドウ左上隅への
      // ドロップでペインが開く）。「見えていないペインはドロップ先になれない」を
      // 創発的な性質ではなく明示の規則として書く
      if (rect.width === 0 || rect.height === 0) return false
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    }

    let unlisten: (() => void) | null = null
    let disposed = false
    void onDragDrop((payload) => {
      if (payload.type === 'leave') {
        setDropActive(false)
        return
      }
      const inside = inPane(payload.position)
      if (payload.type !== 'drop') {
        // enter / over。**`over` に paths は無い**ので触らない
        setDropActive(inside)
        return
      }
      setDropActive(false)
      if (!inside) return
      const dir = projectDirRef.current
      if (dir === null) return
      if (payload.paths.length === 0) return
      handoffRef.current(fileReferences(dir, payload.paths))
    })
      .then((fn) => {
        // 解決までにアンマウントされていたら、その場で外す
        if (disposed) {
          fn()
          return
        }
        unlisten = fn
      })
      .catch(() => {
        // ドロップを受けられなくても他の動線（@ ボタン）は生きている。
        // ここで画面を汚さない
      })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  /**
   * 同梱 Skill の配置（設計 決定10）。**フォルダ1つにつき1回**——Skill は
   * プロジェクトに属するもので、端末セッションの数とは関係が無い。
   * `projectDir` をキーにした effect にすることで、`openFolder` /
   * `switchFolder`、そして起動時の自動復元まで、**フォルダが変わる
   * すべての経路が自動的に1本にまとまる**（経路を足すたびに同期の呼び出しを
   * 書き足して回る必要が無い）。
   *
   * 同期に失敗しても起動は続ける（Skill が無くても端末は使える。設計 決定13）。
   *
   * **後片付けは「トーストを出さない」だけ。** 書き込み先のパスは捕まえた `dir`
   * から作るので、同期中にフォルダを切り替えても新しいフォルダには一切書かない
   *（走り切って古いフォルダを置き直して終わるだけで、実害が無い）。
   * 一方、そのとき失敗のトーストを出すと、ユーザーには**いま開いている**
   * フォルダの話に読める。だから切り替え後は黙って捨てる
   */
  useEffect(() => {
    const dir = projectDir
    if (dir === null) return
    let current = true
    void (async () => {
      try {
        await syncSkillsOnce(dir)
      } catch (err: unknown) {
        if (!current) return
        showToast({
          message: `Skill をプロジェクトへ配置できませんでした（Skill 無しで起動します）: ${
            err instanceof Error ? err.message : String(err)
          }`,
          key: 'skill-sync',
        })
      }
    })()
    return () => {
      current = false
    }
  }, [projectDir, showToast])

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
    // 区別できなくなる
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
      {/* 額縁の帯（rev 9章）。中身はすべて幅の決まった操作なので、伸縮は
          `ml-auto` の余白だけが引き受ける（右端の保証は下の div のコメント） */}
      <header className="flex items-center gap-3 border-b border-rule bg-surface px-6 py-3">
        {/* 見出しはサイドメニューと同じ幅（w-64）を占め、操作の始まりを
            エディタの左端に揃える。**`-ml-6 pl-6` は帯の `px-6` を打ち消して
            いる**——打ち消さないと見出しの箱が 24px ぶん右へずれ、幅を
            サイドメニューに合わせた意味が無くなる。帯の `gap-3` があるので
            ボタンは実際には 12px ほど右から始まるが、表エディタ自身が
            `p-4` を持つのでちょうど本文の始まりの上に来る。
            **サイドメニューを畳んだときのずれは許容する**（畳んだ状態に
            合わせると、開いているときの方がずれる） */}
        {/* 版番号は見出しの**外**に置く（h1 の中に入れると、見出しの
            accessible name が「facet v1.0.1」になる——文書の見出しは
            あくまで `facet`）。`w-64` を包む div に入っているので、
            サイドメニューと幅を揃える意味は変わらない */}
        <div className="-ml-6 flex w-64 shrink-0 items-baseline gap-2 pl-6">
          <h1 className="text-xl font-medium text-ink">facet</h1>
          {appVersion !== null && (
            <span className="text-sm text-ink-muted">v{appVersion}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => void openFolder()}>フォルダを開く</Button>
          {/* Undo/Redo はアイコンのみ。accessible name は aria-label で保つ
              （キーボードが本筋の操作なので、帯では幅を使わない） */}
          <Button
            variant="outline"
            size="icon"
            aria-label="元に戻す"
            title="元に戻す"
            disabled={history === null || !canUndo(history)}
            onClick={() => runHistory('undo')}
          >
            <Undo2 aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="やり直す"
            title="やり直す"
            disabled={history === null || !canRedo(history)}
            onClick={() => runHistory('redo')}
          >
            <Redo2 aria-hidden />
          </Button>
          <ExportMenu
            outputs={selectedModule?.outputs ?? []}
            unusable={exportMenuUnusable}
            onCopy={(profile) => void controller.copyMarkdown(profile)}
            onExport={(profile) => void controller.exportMarkdown(profile)}
          />
          {/* 表形式でコピー（規約8）。**常に出す**——ExportMenu・Miro と
              同じ原則で、押せる／押せないだけを切り替える。活性の判断に
              モジュールの type を使わない（`tableExport` の有無だけで決める）。
              押せない理由は `tableCopyUnusable`（ToolbarButton の title で読める） */}
          <ToolbarButton unusable={tableCopyUnusable} onClick={() => controller.copyTable()}>
            表形式でコピー
          </ToolbarButton>
          {/* Miro 交換（規約7）。**常に出す**——ExportMenu と同じ
              原則で、押せる／押せないだけを切り替え、ボタン自体は消えたり
              出たりしない。文言に「Miro」と書いてよいが、活性の判断には
              モジュールの type を使わない（`exchange` の有無だけで決める） */}
          <ToolbarButton
            unusable={miroCopyUnusable}
            onClick={() => exchange !== undefined && void controller.copyToExternal(exchange)}
          >
            Miro へコピー
          </ToolbarButton>
          <ToolbarButton
            unusable={miroImportUnusable}
            onClick={() => exchange !== undefined && void controller.importFromExternal(exchange)}
          >
            Miro から取り込む
          </ToolbarButton>
        </div>
        {/* **右端の3つを絶対に押し出さないこと。** 余白を食って右端へ寄せるのは
            `ml-auto` の仕事で、`shrink-0` がそれ以上の圧縮を止める。 */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label={sidebarOpen ? 'ファイル一覧を畳む' : 'ファイル一覧を開く'}
            aria-pressed={sidebarOpen}
            className={`${buttonBase} p-1 text-ink-muted`}
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
            <SquareTerminal aria-hidden className="size-4" />
          </button>
          {/* 自動アップデート。**mac では出さない**——latest.json に
              darwin-* を載せないので、押せば必ず「最新版です」と言う
              嘘をつくボタンになる。**`currentPlatform()` は描画のたびに呼ぶ**
              （モジュールスコープの定数にすると、テストが UA を差し替えても
              効かない）。強調は TerminalPane の選択中タブと同じ
              bg-surface-muted（一段沈んだ面） */}
          {currentPlatform() !== 'mac' && (
            <button
              type="button"
              aria-label={buttonLabel(updateState)}
              title={buttonLabel(updateState)}
              disabled={!canCheck(updateState)}
              className={
                isEmphasized(updateState)
                  ? `${buttonBase} gap-1 bg-surface-muted px-2 py-1 text-ink`
                  : `${buttonBase} p-1 text-ink-muted`
              }
              onClick={() => {
                if (updateState.kind === 'available') requestInstall(updateState.version)
                else void runUpdateCheck(true)
              }}
            >
              {isEmphasized(updateState) ? (
                <>
                  <Download aria-hidden className="size-4" />
                  <span className="text-sm">{buttonLabel(updateState)}</span>
                </>
              ) : (
                <RefreshCw aria-hidden className="size-4" />
              )}
            </button>
          )}
          {/* 名前は「今どちらか」でなく「押すとどうなるか」。アイコンだけの
              ボタンは押す前に結果が読めないと意味が取れない */}
          <button
            type="button"
            aria-label={dark ? 'ライトにする' : 'ダークにする'}
            title={dark ? 'ライトにする' : 'ダークにする'}
            className={`${buttonBase} p-1 text-ink-muted`}
            onClick={toggleTheme}
          >
            {dark ? (
              <Sun aria-hidden className="size-4" />
            ) : (
              <Moon aria-hidden className="size-4" />
            )}
          </button>
        </div>
      </header>

      {BANNER_ORDER.map((kind) =>
        banners[kind] === null ? null : (
          <p key={kind} className="px-6 py-2 text-base text-invalid">
            {banners[kind]}
          </p>
        ),
      )}

      <div className="flex min-h-0 flex-1">
        {/* スクロールは FileList の中（一覧の領域だけ）が持つ。ここを
            overflow-y-auto にすると新規作成ボタンの帯ごと流れてしまう。
            エディタ側の section と同じ形（帯は固定・中身だけスクロール） */}
        {sidebarOpen && (
          <aside className="w-64 shrink-0 overflow-hidden border-r border-rule bg-surface">
            <FileList
              groups={groups}
              selectedPath={selectedPath}
              modules={modules}
              existingTypes={existingTypes}
              projectOpen={projectDir !== null}
              projectDir={projectDir}
              onSelect={(file) => void controller.selectFile(file.path)}
              onCreate={(module) => void controller.createNewFile(module)}
              onDelete={(file) => controller.requestDelete(file)}
              onHandoff={(file) => {
                if (projectDir === null) return
                handoffToTerminal(fileReference(projectDir, file.path))
              }}
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
            {/* **指摘の一覧は額縁が出す（rev 6章）。** エディタの中に置くと、
                キャンバス系では絶対配置の帯に載せることになり図を覆う。ここに
                出して縦フレックスの兄弟にすると、指摘が増えたぶんだけ下の
                領域が縮む＝図や表が押し下げられて重ならない。
                **編集できないファイルでも同じ部品で出す** */}
            {selected !== null && (
              // key でファイルを跨いだ「展開したまま」を持ち越さない
              <IssueBanner key={selected.path} issues={selected.issues} className="shrink-0" />
            )}
            <div className="min-h-0 flex-1 overflow-auto">
              {selected === null && (
                <div className="p-6">
                  <p className="text-base text-ink-muted">ファイルを選ぶとここで編集できます。</p>
                  {projectDir !== null && canCreateGlossary && glossaryModule !== undefined && (
                    <div className="mt-4">
                      <p className="text-base leading-normal text-ink-muted">
                        このプロジェクトにはまだ用語集がありません（新規プロジェクトでは正常な状態です）。
                      </p>
                      <button
                        type="button"
                        className={`${buttonBase} mt-2 border border-rule px-3 py-1 text-base text-ink hover:bg-surface`}
                        onClick={() => void controller.ensureFileOfType(glossaryModule)}
                      >
                        用語集を作る
                      </button>
                    </div>
                  )}
                </div>
              )}
              {selected?.result.status === 'rejected' && (
                <div className="p-6">
                  <h2 className="mb-2 font-semibold text-invalid">
                    このファイルは開けません（{selected.result.reason}）
                  </h2>
                  <ul className="list-disc pl-5 text-base leading-normal text-ink">
                    {selected.result.errors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-base leading-normal text-ink-muted">
                    外部エディタで修正してからフォルダを開き直してください。
                  </p>
                </div>
              )}
              {selected?.result.status === 'listOnly' && (
                <p className="p-6 text-base text-ink-muted">{selected.result.reason}</p>
              )}
              {selected?.result.status === 'editable' && selectedModule && editingData !== null && (
                <selectedModule.Editor
                  key={selected.path}
                  data={editingData}
                  issues={selected.issues}
                  modalOpen={modalOpen}
                  onVisibleIds={onVisibleIds}
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
              //（store の意図を直接基準にすると、狭めた状態で
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
              className={`${paneOpen ? 'flex' : 'hidden'} shrink-0 flex-col border-l ${
                dropActive ? 'border-ink' : 'border-rule'
              }`}
              style={{ width: displayPaneWidth }}
            >
              <TerminalPane
                state={terminals}
                cwd={projectDir}
                ptyIo={tauriPtyIo}
                paneVisible={paneOpen}
                insertion={insertion}
                clipboardIo={tauriClipboardIo}
                onError={(message) => showToast({ message })}
                onOpen={() => openTerminal()}
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
          // 表示中の要求を先に片付けてから起動する
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
        cancelLabel={head?.kind === 'choice' ? head.cancelLabel : undefined}
        // **`cancelLabel` を持つ要求のときだけ渡す。** 常に渡すと、外部変更の
        // 二択（`cancelLabel` を持たない）でも Esc が効くようになり、「決めるまで
        // 閉じない」という決着が壊れる（取り込みの二択だけが
        // `cancelLabel` を持つ）
        onCancel={
          head?.kind === 'choice' && head.cancelLabel !== undefined
            ? () => setModals((prev) => shiftModal(prev))
            : undefined
        }
      />
      <TableCopyDialog
        open={head?.kind === 'tableCopy'}
        warning={head?.kind === 'tableCopy' ? head.warning : null}
        options={head?.kind === 'tableCopy' ? head.options : []}
        variants={head?.kind === 'tableCopy' ? head.variants : []}
        onCopy={(variantId, options) => {
          const request = head
          setModals(shiftModal)
          if (request?.kind === 'tableCopy') void request.onCopy(variantId, options)
        }}
        onCancel={() => setModals(shiftModal)}
      />
    </main>
  )
}

export default App
