import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChoiceDialog } from '@/components/ChoiceDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FileList } from '@/components/FileList'
import { ToastStack } from '@/components/Toast'
import { Button } from '@/components/ui/button'
import { createAutoSaver, type AutoSaver } from '@/core/autosave'
import { serialize } from '@/core/canonical'
import { createCoalescer } from '@/core/coalesce'
import { planExternalChange } from '@/core/external-change'
import {
  canCreateFileOfType,
  createFile,
  ensureFileOfType,
  trashFile,
  type CreatedFile,
} from '@/core/file-ops'
import {
  canRedo,
  canUndo,
  createHistory,
  record,
  redo as redoHistory,
  undo as undoHistory,
  type HistoryState,
} from '@/core/history'
import { resolveCommand, toKeyEventLike, type KeyContext } from '@/core/keyboard/keymap'
import { currentPlatform } from '@/core/keyboard/platform'
import { createKnownDisk } from '@/core/known-disk'
import { classifyFile } from '@/core/load'
import { pushModal, shiftModal, type ModalRequest } from '@/core/modal-queue'
import { computeIssues, type ProjectFile } from '@/core/project-file'
import type { AnyToolModule } from '@/core/registry'
import { scanFolder, toProjectFile, type ScanResult } from '@/core/scan'
import { dismissToast, pushToast, type ToastItem } from '@/core/toasts'
import { forceClose, interceptClose } from '@/fs/app-window'
import {
  fileExists,
  joinPath,
  listJsonFiles,
  moveFileToTrash,
  pickProjectFolder,
  readProjectFile,
  watchFolder,
  writeProjectFile,
} from '@/fs/project-fs'
import { appRegistry } from '@/modules'

const AUTOSAVE_DELAY_MS = 500

/** 走査に渡す I/O。フォルダを開くときと再走査（M5）で同じ経路を通す */
const scanIo = { list: listJsonFiles, read: readProjectFile }

/**
 * 監視イベントを束ねる窓。fs プラグイン側のデバウンス（300ms）とは別に、
 * 1回の保存が複数イベントを送ってくるのを1回の再走査にまとめる
 */
const WATCH_COALESCE_MS = 150

/**
 * 額縁が取るグローバル層のキー文脈（rev 10章）。Undo/Redo だけを扱うため
 * 構造依存層の文脈は固定値でよい。modalOpen は確認ダイアログが開いている間 true
 *（M5 の二択ダイアログもここへ合流させる）
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
  }
}

/**
 * 編集後の共通処理: 自動保存へ渡し、整合性検証をやり直す。
 * 通る経路は編集・Undo・Redo・**外部変更の「自分の編集で上書き」**（M5）の4本。
 * 外部変更の「取り込み」はここを通らない——ディスクを正として履歴を作り直す
 * 操作なので selectFile 側に合流させている（M5 で確定）
 */
function applyEdit(
  setFiles: Dispatch<SetStateAction<ProjectFile[]>>,
  saver: AutoSaver | null,
  path: string,
  module: AnyToolModule,
  next: unknown,
): void {
  saver?.update(serialize(next, module.schema))
  setFiles((prev) =>
    computeIssues(
      prev.map((f) =>
        f.path === path && f.result.status === 'editable'
          ? { ...f, result: { ...f.result, data: next } }
          : f,
      ),
      appRegistry,
    ),
  )
}

function App() {
  const [dark, setDark] = useState(false)
  const [projectDir, setProjectDir] = useState<string | null>(null)
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  // 確認ダイアログの onConfirm は、ダイアログを開いたレンダのクロージャを持ったまま
  // 人間の操作を待つ。その間に in-flight の selectFile が解決して選択が変わりうるので、
  // 削除の確定時点の選択は必ず ref から読む（クロージャ値だと、消していないファイルの
  // saver を dispose して選択を落とす）
  const selectedPathRef = useRef<string | null>(null)
  selectedPathRef.current = selectedPath
  // 編集中データは履歴の present が正（Undo/Redo で入れ替わる。
  // ファイル単位・メモリ内。それ以前への復帰は Git の担当。rev 5章）
  const [history, setHistory] = useState<HistoryState<unknown> | null>(null)
  const historyRef = useRef<HistoryState<unknown> | null>(null)
  historyRef.current = history
  const [ioError, setIoError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saverRef = useRef<AutoSaver | null>(null)
  // selectFile の連続呼び出しを直列化するためのトークン。
  // 後続の選択（または openFolder）が始まったら、先行呼び出しの結果は破棄する。
  const selectSeq = useRef(0)
  /**
   * ディスクの既知内容の台帳（自己書き込み除外の要）。**state にしないこと**——
   * 記録が再レンダリングを待つと、その隙の再走査が自分の書き込みを
   * 外部変更と誤検知する
   */
  const knownDisk = useRef(createKnownDisk())
  // 再走査の直列化トークン（後続の再走査・フォルダ切替が始まったら先行の結果は捨てる）
  const scanSeq = useRef(0)
  // 判断の材料は「いま」の値でなければならない（監視イベントは任意のタイミングで来る）。
  // 確認ダイアログを挟む操作と同じ理由・同じ形で ref に写す（M4 で確定）
  const filesRef = useRef<ProjectFile[]>([])
  const projectDirRef = useRef<string | null>(null)
  // フォルダ切替中は再走査を止める（古いフォルダの監視イベントが、切替後の
  // 一覧を古いフォルダの内容で上書きしうる）。scanSeq は「その瞬間に進行中の
  // 再走査」しか無効化できないので、切替中に始まる再走査はこちらで止める
  const switchingFolderRef = useRef(false)
  // 二択ダイアログの回答待ち。ask の分岐で saver を dispose して null にするので、
  // hasUnsaved() だけでは「未保存編集あり」の信号が消える。モジュールも一緒に
  // 持つ——2度目の検知では filesRef が既に1度目の適用後（rejected になって
  // いるかもしれない）を指すので、再導出すると undefined になる
  const pendingAskRef = useRef<{ path: string; module: AnyToolModule | undefined } | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastSeq = useRef(0)

  // モーダルの要求キュー。生産者は「ファイル削除の確認」「破棄して閉じる」
  //「外部変更の二択」の3つ（申し送り10節。スロット1つでは要求が無言で落ちる）。
  // 開いている間は操作言語を止める（rev 10章の境界規則）
  const [modals, setModals] = useState<ModalRequest[]>([])
  const head = modals[0] ?? null
  const modalOpen = modals.length > 0
  // window リスナーはマウント時の1回しか張らないので、最新値は ref から読む
  //（**state 直読みに「簡潔化」しないこと**。常に初期値 false になる）
  const modalOpenRef = useRef(modalOpen)
  modalOpenRef.current = modalOpen
  const showModal = (request: ModalRequest) => setModals((prev) => pushModal(prev, request))
  const closeModal = () => setModals((prev) => shiftModal(prev))
  const showToast = (toast: Omit<ToastItem, 'id'>) => {
    // updater は純粋でなければならない（StrictMode の二重実行で id を余分に
    // 消費しないよう、id は先に計算する）
    const id = ++toastSeq.current
    setToasts((prev) => pushToast(prev, { ...toast, id }))
  }

  // 参照を安定させる（トーストは閉じるまで残るので、毎レンダで新しい関数を
  // 渡しても実害は無いが、ToastRow に副作用を足したときに毎レンダで
  // 張り直される罠を作らないため）
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => dismissToast(prev, id))
  }, [])

  filesRef.current = files
  projectDirRef.current = projectDir

  const editingData = history === null ? null : history.present

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }

  // アンマウント時に保留中の保存を流す
  useEffect(() => {
    return () => {
      void saverRef.current?.flush()
      saverRef.current?.dispose()
    }
  }, [])

  // ウィンドウ close を横取りして保留中の編集を書き切る。
  // flush が失敗したら閉じず、代わりに脱出口を出す——書けていない編集を
  // 黙って捨てないが、閉じられなくなる状態も作らない
  useEffect(() => {
    const unlisten = interceptClose(async () => {
      // 外部変更の二択に回答待ちの間は、未保存編集が history にしか無い
      //（検知時点で saver を dispose している）。saver が null なので
      // そのまま通すと、二択で守るはずの編集を黙って捨てて閉じることになる
      if (pendingAskRef.current !== null) {
        showToast({
          key: 'close-blocked',
          message: '外部変更の扱いを選ぶまで閉じられません（ダイアログで選んでください）',
        })
        return false
      }
      const saver = saverRef.current
      if (saver === null) return true
      if (await saver.flush()) return true
      showModal({
        kind: 'confirm',
        // 閉じる操作を繰り返しても要求が積み上がらないように置き換える
        key: 'close',
        title: '保存できないため閉じられません',
        description:
          '保存していない編集があります。もう一度閉じる操作をすると保存を再試行します。破棄して閉じると、この編集は失われます（ファイルの内容は最後に保存できた状態のままです）。',
        confirmLabel: '破棄して閉じる',
        onConfirm: async () => {
          saverRef.current?.dispose()
          try {
            await forceClose()
          } catch (err) {
            // ここが無音だと「押したのに何も起きない（編集は失われている）」に見える
            setIoError(
              `ウィンドウを閉じられませんでした: ${
                err instanceof Error ? err.message : String(err)
              }`,
            )
          }
        },
      })
      return false
    })
    return () => {
      void unlisten.then((f) => f())
    }
  }, [])

  /**
   * アプリからの書き込みは必ずここを通す。**書けた内容を即座に台帳へ記録する**
   * ことが自己書き込み除外の唯一の前提条件で、記録が遅れると自分の書き込みを
   * 外部変更として検知してしまう。失敗時は記録しない（ディスクは変わっていない）
   */
  const writeAndRecord = async (path: string, text: string): Promise<void> => {
    await writeProjectFile(path, text)
    knownDisk.current.set(path, text)
  }

  /**
   * 自動保存を張る。baseline は「そのファイルをアプリが正とみなす内容の正規形」で、
   * 無編集ならバイト一致で書き込みが起きない（非正規ファイルを開いただけでは
   * 書き戻さない。rev 5章）。外部変更の上書き（M5）では baseline に
   * 取り込んだディスクの内容を渡して張り直す
   */
  const attachSaver = (path: string, baseline: string) => {
    saverRef.current = createAutoSaver({
      delayMs: AUTOSAVE_DELAY_MS,
      baseline,
      write: (text) => writeAndRecord(path, text),
      onError: (err) =>
        setSaveError(
          `自動保存に失敗しました（編集を続けるか、もう一度閉じる操作で再試行されます）: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      onSuccess: () => setSaveError(null),
    })
  }

  /** 現在のファイルを閉じる。false＝保留編集を書き切れず中断（saver は生かしたまま） */
  const closeCurrentFile = async (): Promise<boolean> => {
    const saver = saverRef.current
    if (saver) {
      const ok = await saver.flush()
      // flush 失敗時に dispose すると、catch が復元した pending を破棄してしまう
      //（M1 レビューの二重失敗エッジ）。dispose せず中断する
      if (!ok) return false
      saver.dispose()
      saverRef.current = null
    }
    setSelectedPath(null)
    setHistory(null)
    // 「このファイルが書けていない」というバナーは、そのファイルを離れたら消す
    //（onSuccess でしかクリアされないと、書き込みが起きないままファイルを
    //  切り替えたときに前のファイルのバナーが残る。申し送り8節）
    setSaveError(null)
    return true
  }

  const openFolder = async () => {
    const dir = await pickProjectFolder()
    if (dir === null) return
    const token = ++selectSeq.current
    // 進行中の再走査の結果を捨てさせる（別フォルダの走査結果を新しい一覧へ混ぜない）
    scanSeq.current++
    switchingFolderRef.current = true
    try {
      // 先に現在のファイルを閉じる（flush 後の内容で走査するため）。
      // flush が失敗したらフォルダ切替を中断する（書けていない編集を捨てない）
      if (!(await closeCurrentFile())) return
      const scan = await scanFolder(dir, scanIo, appRegistry)
      // 後続の openFolder / selectFile が始まっていたら、この結果は破棄する
      if (token !== selectSeq.current) return
      // 一部でも読めなければ入れ替えない（途中失敗で新旧が混ざった状態を作らない。M1 で確定）
      if (scan.unreadable.length > 0) {
        setIoError(
          `読み込めないファイルがあるため開けませんでした: ${scan.unreadable.join(' / ')}`,
        )
        return
      }
      setProjectDir(dir)
      // ref も同期で更新する——再走査の突き合わせ（projectDirRef.current !== dir）が
      // 再レンダを待つと、その隙に古いフォルダのイベントが通ってしまう
      projectDirRef.current = dir
      setFiles(computeIssues(scan.entries.map(toProjectFile), appRegistry))
      // 台帳は別フォルダの分を持ち越さない
      knownDisk.current.clear()
      for (const entry of scan.entries) knownDisk.current.set(entry.path, entry.text)
      setIoError(null)
    } catch (err) {
      if (token !== selectSeq.current) return
      // 旧フォルダの一覧はそのまま残す。選択は closeCurrentFile 済みなので選び直せる
      setIoError(
        `フォルダの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      switchingFolderRef.current = false
    }
  }

  const selectFile = async (path: string) => {
    const token = ++selectSeq.current
    if (!(await closeCurrentFile())) return
    try {
      // 選択時に必ずディスクから読み直す（走査時キャッシュを編集の起点にすると、
      // 直前の自動保存分を古い内容で上書きするデータ喪失経路になる。M1 で確定）
      const text = await readProjectFile(path)
      if (token !== selectSeq.current) return // 後続の選択が始まっていたら破棄
      // 読んだ内容は「アプリが知っているディスクの内容」
      knownDisk.current.set(path, text)
      const result = classifyFile(text, appRegistry)
      setFiles((prev) =>
        computeIssues(
          prev.map((f) => (f.path === path ? { ...f, result } : f)),
          appRegistry,
        ),
      )
      setSelectedPath(path)
      setIoError(null)
      if (result.status !== 'editable') return
      const module = appRegistry.get(result.type)
      if (!module) return
      attachSaver(path, serialize(result.data, module.schema))
      setHistory(createHistory(result.data))
    } catch (err) {
      if (token !== selectSeq.current) return
      setIoError(
        `ファイルの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /**
   * 作成したファイルを一覧へ登録して開く。新規作成と用語集の自動生成が
   * 同じ後処理を通るための単一経路（M5 の外部変更の取り込みも
   * ここへ合流させられる）。書いたテキストをそのまま分類するのは、
   * editable にならないなら雛形かシリアライザが壊れているため——
   * 一覧に出す前に気付けるようにする
   */
  const addCreatedFile = async (created: CreatedFile): Promise<void> => {
    const entry: ProjectFile = {
      path: created.path,
      name: created.name,
      result: classifyFile(created.text, appRegistry),
      issues: [],
    }
    setFiles((prev) =>
      // ダブルクリックや遅い IPC で同じパスが2回来ても1件に保つ
      prev.some((f) => f.path === created.path) ? prev : computeIssues([...prev, entry], appRegistry),
    )
    setIoError(null)
    await selectFile(created.path)
  }

  /** 新規作成（額縁のファイル操作。rev 6章）。作ったファイルはそのまま開く */
  const createNewFile = async (module: AnyToolModule) => {
    if (projectDir === null) return
    try {
      const created = await createFile({
        dir: projectDir,
        module,
        existingNames: files.map((f) => f.name),
        join: joinPath,
        write: writeAndRecord,
        exists: fileExists,
      })
      await addCreatedFile(created)
    } catch (err) {
      setIoError(
        `ファイルを作成できませんでした: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /**
   * ファイルを OS のゴミ箱へ移す（rev 6章。完全削除はしない）。
   * 開いているファイルなら closeCurrentFile を通さない——あれは保留編集を書き切る
   * 経路で、消したファイルを書き戻して復活させる。代わりに trashFile が
   *「書かせない（dispose）」と「進行中の write を待つ（settle）」を担う。
   *
   * **切り離しは trash の前に行う。** trashFile が write の着地を待つ間、
   * エディタが同じ saver を掴んだままだと、その間の打鍵で再武装したタイマーが
   * 生きた write を残せる（申し送り10節の残余の窓）。選択と saver を先に
   * 落としてエディタを畳めば、この窓は構造的に消える
   */
  const deleteFile = async (file: ProjectFile) => {
    // 確認ダイアログを挟むので、選択状態は「押された時点」を ref から読む
    //（このクロージャが作られた時点の selectedPath は既に古いことがある）
    const wasSelected = file.path === selectedPathRef.current
    const saver = wasSelected ? saverRef.current : null
    if (wasSelected) {
      // 進行中の selectFile / openFolder があれば、その結果を捨てさせる
      selectSeq.current++
      saverRef.current = null
      setSelectedPath(null)
      setHistory(null)
      setSaveError(null)
    }
    try {
      await trashFile({ path: file.path, saver, trash: moveFileToTrash })
      knownDisk.current.delete(file.path)
      // 単一性違反はここで解消されうるので、必ず検証をやり直す
      setFiles((prev) => computeIssues(prev.filter((f) => f.path !== file.path), appRegistry))
      setIoError(null)
    } catch (err) {
      // ゴミ箱への移動が失敗した場合、ファイルは残るが選択は外れている
      //（保留編集は trashFile が捨てている。「消す」と決めた操作の副作用として許容）
      setIoError(
        `ファイルを削除できませんでした: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /** 削除は Undo で戻せないので確認を挟む（用語の削除に確認を挟まないのとは別。rev 5章） */
  const requestDelete = (file: ProjectFile) => {
    showModal({
      kind: 'confirm',
      key: `delete:${file.path}`,
      title: 'ファイルを削除しますか？',
      description: `${file.name} を OS のゴミ箱へ移動します。完全には削除しないので、ゴミ箱から戻せます。`,
      confirmLabel: 'ゴミ箱へ移動',
      onConfirm: () => deleteFile(file),
    })
  }

  /**
   * 用語集を1つ確保して開く。用語集0個は正常な状態（新規プロジェクト）で、
   * 本来の発火点は用語のインライン登録（rev 5章。呼び出す側の他ツールが
   * まだ無いため M4 では額縁の空状態から呼ぶ）。生成の条件と正規形は
   * コアの ensureFileOfType が持つので、将来の発火点はそちらを呼べばよい。
   * **押下時に再走査する**（M5）——空フォルダを開いた後に外部（Skill 等）が
   * 用語集を書いた状態で押されうるボタンなので、押下時点のスナップショットで
   * 判断すると見落として2つ目を作る
   */
  const ensureGlossary = async () => {
    const module = appRegistry.get('glossary')
    if (projectDirRef.current === null || module === undefined) return
    // 走査時のスナップショットで判断すると、走査後に外部で増えた用語集
    //（Skill が書いたもの）を見落として2つ目を作る。まず再走査する
    const scanned = await handleExternalChange()
    // 再走査できなかったときは作らない——古いスナップショットで判断すると、
    // 外部で増えた用語集を見落として単一性違反を自分で作る
    //（失敗理由は handleExternalChange が ioError に出している）
    if (scanned === null) return
    const dir = projectDirRef.current
    if (dir === null) return
    try {
      const { path, created } = await ensureFileOfType({
        dir,
        module,
        files: scanned.map((f) => ({ path: f.path, name: f.name, type: f.result.type })),
        join: joinPath,
        write: writeAndRecord,
        exists: fileExists,
      })
      if (created === null) {
        // 既にあった。開くだけ（ディスクから読み直す）
        await selectFile(path)
        return
      }
      await addCreatedFile(created)
    } catch (err) {
      setIoError(
        `用語集を作成できませんでした: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /**
   * 取り込み前の内容へ戻す（rev 3章。Undo 履歴を破棄した後に残す唯一の復元手段）。
   * **退避しておいた生バイトをそのまま書く**——編集データを再シリアライズすると、
   * 非正規形のまま開いていたファイルで全行 diff が出て、「変更履歴を仕様の
   * 変更履歴として読める」（rev 5章）が壊れる。生バイトなら git diff が空に戻る。
   * 取り込みでファイルが開けなくなった（rejected）場合もこの経路で戻せる
   */
  const revertImport = async (path: string, stashText: string) => {
    // このトーストは action 付きなので自動では消えない（rev 3章。退避の復元手段を
    // 時間切れで失わないため）。つまり別のファイルを開いて編集した後や、
    // フォルダを切り替えた後に押されうる
    if (!filesRef.current.some((f) => f.path === path)) {
      // 別フォルダのファイルへ書き戻して選択を移すと、一覧に無いファイルを
      // 選択した行き止まり（エディタが描画されないまま saver が張られる）になる
      showToast({
        message: '取り込み前の内容に戻せませんでした（このファイルは今のプロジェクトにありません）',
      })
      return
    }
    if (selectedPathRef.current === path) {
      // 取り込み後の内容を書きに行かせない（この経路の本来の意図）
      saverRef.current?.dispose()
      saverRef.current = null
    } else if (!(await closeCurrentFile())) {
      // 別のファイルを開いていて、その編集を書き切れないなら中断する——
      // 無条件に dispose すると、そのファイルの未保存編集を黙って捨てる
      return
    }
    try {
      await writeAndRecord(path, stashText)
      await selectFile(path)
      showToast({ key: `external:${path}`, message: '取り込み前の内容に戻しました' })
    } catch (err) {
      setIoError(
        `取り込み前の内容に戻せませんでした: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /**
   * 外部変更を取り込む。ディスクを正として `selectFile` で張り直す——
   * 「必ずディスクから読み直す」「検証をやり直す」「saver を張り直す」
   * 「履歴を作り直す」が既存の1本道で揃う（M1 で確定した原則）。
   * **履歴の作り直しが Undo 履歴の破棄そのもの**である——履歴の中身は
   * 取り込み前のファイルを指しており、残すと Ctrl+Z がディスクの内容を
   * 無言で巻き戻す（rev 3章）。
   *
   * 申し送り9節は「取り込みは applyEdit の4本目の経路になる」と予告していたが、
   * applyEdit は「自動保存へ渡す」＋「履歴に record」なので取り込みには合わない
   *（ディスクから読んだ内容を書き戻すことになり、履歴も破棄でなく追加になる）。
   * **applyEdit を通るのは下の overwriteWithMine（上書き）側**
   */
  const importExternalChange = async (path: string, stashText: string | undefined) => {
    // reload 経由でも呼ばれるが、その場合は既に null なので無害
    pendingAskRef.current = null
    await selectFile(path)
    showToast({
      key: `external:${path}`,
      message: '外部の変更を読み込みました（元に戻す操作の履歴は破棄しました）',
      action:
        stashText === undefined
          ? undefined
          : { label: '取り込み前に戻す', run: () => revertImport(path, stashText) },
    })
  }

  /**
   * 自分の編集でディスクを上書きする（二択ダイアログの片側）。
   * **baseline は検知したディスクの内容にする**——古い baseline のままだと
   * 「同じ内容だから書かない」に落ちて、外部の内容が残ったまま画面と食い違う。
   * ここが applyEdit の4本目の経路になる。
   * **module は呼び出し側（handleExternalChange）が「変更前の」一覧から引いて
   * 渡す**——ref に写す方式だと、ダイアログが見える前に `setFiles` が反映されて
   * 「変更後」を指してしまい、外部変更でスキーマ違反や別ツールへの type 変更が
   * 起きたケースで壊れる（レビューで発覚）
   */
  const overwriteWithMine = (path: string, diskText: string, module: AnyToolModule | undefined) => {
    pendingAskRef.current = null
    // 確認を挟む操作なので、確定時点の状態は ref から読む（M4 で確定）。
    // 待っている間に選択が変わっていたら何もしない
    if (selectedPathRef.current !== path) return
    const history = historyRef.current
    if (history === null || module === undefined) {
      // 無言で終わると「上書きを押したのに何も起きず、編集も失われた」に見える
      setIoError(
        '編集内容を書き戻せませんでした（このファイルを扱うモジュールが見つかりません）。外部エディタで内容を確認してください。',
      )
      return
    }
    attachSaver(path, diskText)
    applyEdit(setFiles, saverRef.current, path, module, history.present)
    // 外部変更で rejected / listOnly に落ちたエントリは applyEdit では戻らない
    //（あれは editable のエントリだけを差し替える）。書き込む内容をそのまま
    // 分類し直して一覧へ戻す——さもないと、ディスクは自分の内容に直っているのに
    //「このファイルは開けません」の表示が残り、しかも台帳が一致するので
    // 再走査でも直らない（次にそのファイルを選び直すまで行き止まりになる）。
    // 書いたテキストを分類し直すのは addCreatedFile と同じ考え方
    const repaired = classifyFile(serialize(history.present, module.schema), appRegistry)
    setFiles((prev) =>
      computeIssues(
        prev.map((f) =>
          f.path === path && f.result.status !== 'editable' ? { ...f, result: repaired } : f,
        ),
        appRegistry,
      ),
    )
  }

  /** 未保存編集がある状態の外部変更（rev 3章。マージ UI は作らない） */
  const askExternalChange = (
    selected: { path: string; name: string; diskText: string },
    moduleBeforeChange: AnyToolModule | undefined,
  ) => {
    showModal({
      kind: 'choice',
      // 同じファイルの二択が積み上がらないよう、新しい要求で置き換える
      key: `external:${selected.path}`,
      title: '外部でファイルが変更されました',
      description: `${selected.name} が別のプログラム（AI・エディタ・Git など）によって変更されました。保存していない編集があるため、どちらを残すか選んでください。両方を混ぜることはできません。`,
      primaryLabel: '自分の編集で上書き',
      secondaryLabel: '外部変更を取り込む（自分の編集は破棄）',
      onPrimary: () => overwriteWithMine(selected.path, selected.diskText, moduleBeforeChange),
      // 取り込み側に「取り込み前に戻す」は出さない——退避できるのは
      // 取り込み前に**ディスクにあった**内容で、破棄される未保存編集ではないため
      onSecondary: () => importExternalChange(selected.path, undefined),
    })
  }

  /**
   * 開いていたファイルが外部で消えたときの後始末（M4 の deleteFile と同じ形）。
   * **flush しない**——消えたファイルへ書き戻すと、削除されたはずのファイルが
   * 復活する（M4 の削除で踏んだ事故と同じ。申し送り10節）
   */
  const handleSelectedGone = (path: string, name: string) => {
    // 進行中の selectFile / openFolder の結果を捨てさせる
    selectSeq.current++
    // 回答待ちのファイルが外部で消えた場合、二択ダイアログの回答待ち信号も落とす
    pendingAskRef.current = null
    saverRef.current?.dispose()
    saverRef.current = null
    setSelectedPath(null)
    setHistory(null)
    setSaveError(null)
    knownDisk.current.delete(path)
    showToast({
      key: `external:${path}`,
      message: `開いていたファイルが外部で削除されました: ${name}`,
    })
  }

  /**
   * 外部変更の取り込み口（rev 3章）。監視イベントを契機にフォルダを再走査し、
   * 「ディスクの生テキスト ≠ 台帳」だけを外部変更として扱う。
   * **自己書き込みの除外はこの突き合わせで構造的に成立する**——アプリの
   * 自動保存・新規作成は書いた内容を台帳へ同時記録し（writeAndRecord）、
   * 削除は一覧と台帳の両方から落とすので、跳ね返ってきたイベントは差分ゼロになる。
   * 戻り値は適用後の一覧（続けて使う呼び出し側のため。null＝適用しなかった）
   */
  const handleExternalChange = async (): Promise<ProjectFile[] | null> => {
    // フォルダ切替中の再走査は捨てる（switchingFolderRef の理由は宣言部を参照）
    if (switchingFolderRef.current) return null
    const dir = projectDirRef.current
    if (dir === null) return null
    const token = ++scanSeq.current
    let scan: ScanResult
    try {
      scan = await scanFolder(dir, scanIo, appRegistry)
    } catch (err) {
      setIoError(
        `フォルダの再走査に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      )
      return null
    }
    // 後続の再走査・フォルダ切替が始まっていたら、この結果は捨てる
    if (token !== scanSeq.current || projectDirRef.current !== dir) return null

    const plan = planExternalChange({
      prev: filesRef.current,
      scan,
      knownText: (path) => knownDisk.current.get(path),
      selectedPath: selectedPathRef.current,
      hasUnsavedEdits:
        (saverRef.current?.hasUnsaved() ?? false) ||
        (pendingAskRef.current !== null &&
          pendingAskRef.current.path === selectedPathRef.current),
    })
    // 上書きに使うモジュールは「変更前の」一覧から引く——外部変更でスキーマ違反に
    // なったファイルは result が rejected になって type からモジュールを引けず、
    // type が別のツールに書き換えられた場合は別のモジュールを引いてしまう
    //（古いデータを新しいスキーマでシリアライズすると壊れたファイルを書く）。
    // レンダごとに代入される ref では「変更前」を保持できない——setFiles は
    // ダイアログの回答を待たずに反映されるため。
    // 回答待ちの二択があるなら、そのとき捕まえたモジュールを使い続ける——
    // 2度目の検知では filesRef が既に1度目の適用後（rejected になっているかも
    // しれない）を指すので、ここで再導出すると undefined になってしまう
    const pendingAsk = pendingAskRef.current
    const before = filesRef.current.find((f) => f.path === selectedPathRef.current)
    const moduleBeforeChange =
      pendingAsk !== null && pendingAsk.path === selectedPathRef.current
        ? pendingAsk.module
        : before !== undefined && before.result.status === 'editable'
          ? appRegistry.get(before.result.type)
          : undefined
    // 台帳をディスクの現状へ合わせる。**plan を作った後**でなければ差分が消える。
    // 読めなかったパスは台帳に残す（消えた扱いにしないため）
    for (const entry of scan.entries) knownDisk.current.set(entry.path, entry.text)
    knownDisk.current.retain([...scan.entries.map((e) => e.path), ...scan.unreadable])
    if (!plan.hasChanges) return plan.next

    // 検証は「フォルダ走査時」「ファイル選択時」「編集時」「作成時」「削除時」に続く6本目の経路
    setFiles(computeIssues(plan.next, appRegistry))
    for (const notice of plan.notices) showToast(notice)

    const selected = plan.selected
    if (selected.kind === 'reload' || selected.kind === 'ask') {
      // 検知した時点でこのファイルへの自動保存を止める——取り込むか上書きするかを
      // 決める前にディスクが動くと判断の前提が壊れる。再開は確定時（取り込み＝
      // selectFile が張り直す／上書き＝新しい baseline で張り直す）
      saverRef.current?.dispose()
      saverRef.current = null
    }
    switch (selected.kind) {
      case 'none':
        break
      case 'reload':
        await importExternalChange(selected.path, selected.stashText)
        break
      case 'ask':
        pendingAskRef.current = { path: selected.path, module: moduleBeforeChange }
        askExternalChange(selected, moduleBeforeChange)
        break
      case 'gone':
        handleSelectedGone(selected.path, selected.name)
        break
    }
    return plan.next
  }

  // 監視イベントからは常に最新の handleExternalChange を呼ぶ（購読はフォルダごとに1回）
  const handleExternalChangeRef = useRef(handleExternalChange)
  handleExternalChangeRef.current = handleExternalChange

  const selected = files.find((f) => f.path === selectedPath) ?? null
  const selectedModule =
    selected && selected.result.status === 'editable'
      ? appRegistry.get(selected.result.type)
      : undefined
  // 走査済み全ファイルの type（読めなかったファイルは null）。singleton 判定は
  // 型でなく物理条件（type が2件以上）なので、rejected/listOnly の type も含める
  const existingTypes = files.map((f) => f.result.type)
  const glossaryModule = appRegistry.get('glossary')
  // 用語集0個は正常な状態（新規プロジェクト）。押せば作れることを空状態で示す。
  // サイドバーの新規作成ボタンと同じ canCreateFileOfType を通すことで、
  // 「作れる」の判定を1箇所に保つ（ここだけ別ルールにすると再び矛盾を作る）
  const canCreateGlossary =
    glossaryModule !== undefined && canCreateFileOfType(glossaryModule, existingTypes)

  const runHistory = (kind: 'undo' | 'redo') => {
    const h = historyRef.current
    if (h === null || selectedPath === null || selectedModule === undefined) return
    const next = kind === 'undo' ? undoHistory(h) : redoHistory(h)
    // 戻れない／進めないときは同一参照が返る
    if (next === h) return
    setHistory(next)
    applyEdit(setFiles, saverRef.current, selectedPath, selectedModule, next.present)
  }

  // window リスナーからは常に最新の runHistory を呼ぶ（購読はマウント時の1回だけ）
  const runHistoryRef = useRef(runHistory)
  runHistoryRef.current = runHistory

  // グローバル層（rev 10章）: Undo/Redo は全ツール共通で額縁が取る。
  // 制御入力ではブラウザ標準の Undo が React の再レンダリングと食い違うため、
  // テキスト編集中もアプリの履歴に一本化する（境界規則への明示的な例外）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
      void handleExternalChangeRef.current()
    })
    let unwatch: (() => void) | null = null
    let stopped = false
    void watchFolder(projectDir, () => coalescer.notify())
      .then((fn) => {
        // effect の後片付けが先に走っていたら、掴んだ監視をその場で止める
        if (stopped) fn()
        else unwatch = fn
      })
      .catch((err: unknown) => {
        setIoError(
          `フォルダの監視を開始できませんでした（外部の変更は自動で反映されません）: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      })
    return () => {
      stopped = true
      // 先に監視を止めてから coalescer を捨てる——逆順だと、その間に届いた
      // イベントが notify() で無条件にタイマーを張り直し、切替/アンマウントの
      // 約 WATCH_COALESCE_MS 後に迷子の再走査が1回走る
      unwatch?.()
      coalescer.dispose()
    }
  }, [projectDir])

  return (
    <main className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="flex items-center gap-4 border-b border-rule px-6 py-3">
        <h1 className="text-lg font-bold text-ink">facet</h1>
        <Button onClick={() => void openFolder()}>フォルダを開く</Button>
        <Button disabled={history === null || !canUndo(history)} onClick={() => runHistory('undo')}>
          元に戻す
        </Button>
        <Button disabled={history === null || !canRedo(history)} onClick={() => runHistory('redo')}>
          やり直す
        </Button>
        {projectDir && <span className="text-sm text-ink-muted">{projectDir}</span>}
        <button
          type="button"
          className="ml-auto text-sm text-ink-muted underline"
          onClick={toggleTheme}
        >
          {dark ? 'ライト' : 'ダーク'}
        </button>
      </header>

      {ioError && <p className="px-6 py-2 text-sm text-warning">{ioError}</p>}
      {saveError && <p className="px-6 py-2 text-sm text-warning">{saveError}</p>}

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 border-r border-rule">
          <FileList
            files={files}
            selectedPath={selectedPath}
            modules={appRegistry.list()}
            existingTypes={existingTypes}
            projectOpen={projectDir !== null}
            onSelect={(file) => void selectFile(file.path)}
            onCreate={(module) => void createNewFile(module)}
            onDelete={requestDelete}
          />
        </aside>

        <section className="min-w-0 flex-1 overflow-auto">
          {selected === null && (
            <div className="p-6">
              <p className="text-sm text-ink-muted">ファイルを選ぶとここで編集できます。</p>
              {projectDir !== null && canCreateGlossary && (
                <div className="mt-4">
                  <p className="text-sm text-ink-muted">
                    このプロジェクトにはまだ用語集がありません（新規プロジェクトでは正常な状態です）。
                  </p>
                  <button
                    type="button"
                    className="mt-2 rounded-sm border border-rule px-3 py-1 text-sm text-ink hover:bg-surface"
                    onClick={() => void ensureGlossary()}
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
          {selected?.result.status === 'editable' &&
            selectedModule &&
            editingData !== null && (
              <selectedModule.Editor
                key={selected.path}
                data={editingData}
                issues={selected.issues}
                modalOpen={modalOpen}
                onChange={(next: unknown, mergeKey?: string | null) => {
                  setHistory((h) => (h === null ? h : record(h, next, mergeKey ?? null, Date.now())))
                  applyEdit(setFiles, saverRef.current, selected.path, selectedModule, next)
                }}
              />
            )}
        </section>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <ConfirmDialog
        open={head?.kind === 'confirm'}
        title={head?.kind === 'confirm' ? head.title : ''}
        description={head?.kind === 'confirm' ? head.description : ''}
        confirmLabel={head?.kind === 'confirm' ? head.confirmLabel : ''}
        onConfirm={() => {
          // 表示中の要求を先に片付けてから起動する（M4 で確定した形）
          const request = head
          closeModal()
          if (request?.kind === 'confirm') void request.onConfirm()
        }}
        onCancel={closeModal}
      />
      <ChoiceDialog
        open={head?.kind === 'choice'}
        title={head?.kind === 'choice' ? head.title : ''}
        description={head?.kind === 'choice' ? head.description : ''}
        primaryLabel={head?.kind === 'choice' ? head.primaryLabel : ''}
        secondaryLabel={head?.kind === 'choice' ? head.secondaryLabel : ''}
        onPrimary={() => {
          const request = head
          closeModal()
          if (request?.kind === 'choice') void request.onPrimary()
        }}
        onSecondary={() => {
          const request = head
          closeModal()
          if (request?.kind === 'choice') void request.onSecondary()
        }}
      />
    </main>
  )
}

export default App
