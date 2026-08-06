import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FileList } from '@/components/FileList'
import { Button } from '@/components/ui/button'
import { createAutoSaver, type AutoSaver } from '@/core/autosave'
import { serialize } from '@/core/canonical'
import { createFile, ensureFileOfType, trashFile, type CreatedFile } from '@/core/file-ops'
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
import { classifyFile } from '@/core/load'
import { computeIssues, fileName, type ProjectFile } from '@/core/project-file'
import type { AnyToolModule } from '@/core/registry'
import { forceClose, interceptClose } from '@/fs/app-window'
import {
  joinPath,
  listJsonFiles,
  moveFileToTrash,
  pickProjectFolder,
  readProjectFile,
  writeProjectFile,
} from '@/fs/project-fs'
import { appRegistry } from '@/modules'

const AUTOSAVE_DELAY_MS = 500

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
 * 編集・Undo・Redo の3経路から同じ処理を通す（外部変更の取り込みが
 * 4本目の経路になる。M5）
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

  // 確認ダイアログ。開いている間は操作言語を止める（rev 10章の境界規則）
  const [confirm, setConfirm] = useState<{
    title: string
    description: string
    confirmLabel: string
    onConfirm: () => void | Promise<void>
  } | null>(null)
  const modalOpen = confirm !== null
  // window リスナーはマウント時の1回しか張らないので、最新値は ref から読む
  const modalOpenRef = useRef(modalOpen)
  modalOpenRef.current = modalOpen

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
      const saver = saverRef.current
      if (saver === null) return true
      if (await saver.flush()) return true
      setConfirm({
        title: '保存できないため閉じられません',
        description:
          '保存していない編集があります。もう一度閉じる操作をすると保存を再試行します。破棄して閉じると、この編集は失われます（ファイルの内容は最後に保存できた状態のままです）。',
        confirmLabel: '破棄して閉じる',
        onConfirm: async () => {
          saverRef.current?.dispose()
          await forceClose()
        },
      })
      return false
    })
    return () => {
      void unlisten.then((f) => f())
    }
  }, [])

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
    return true
  }

  const openFolder = async () => {
    const dir = await pickProjectFolder()
    if (dir === null) return
    const token = ++selectSeq.current
    // 先に現在のファイルを閉じる（flush 後の内容で走査するため）。
    // flush が失敗したらフォルダ切替を中断する（書けていない編集を捨てない）
    if (!(await closeCurrentFile())) return
    try {
      const paths = await listJsonFiles(dir)
      const loaded: ProjectFile[] = []
      for (const path of paths) {
        const text = await readProjectFile(path)
        loaded.push({ path, name: fileName(path), result: classifyFile(text, appRegistry), issues: [] })
      }
      // 後続の openFolder / selectFile が始まっていたら、この結果は破棄する
      if (token !== selectSeq.current) return
      // 全部読めてから一括で入れ替える（途中失敗で新旧が混ざった状態を作らない）
      setProjectDir(dir)
      setFiles(computeIssues(loaded, appRegistry))
      setIoError(null)
    } catch (err) {
      if (token !== selectSeq.current) return
      // 旧フォルダの一覧はそのまま残す。選択は closeCurrentFile 済みなので選び直せる
      setIoError(
        `フォルダの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  const selectFile = async (file: ProjectFile) => {
    const token = ++selectSeq.current
    if (!(await closeCurrentFile())) return
    try {
      // 選択時に必ずディスクから読み直す（走査時キャッシュを編集の起点にすると、
      // 直前の自動保存分を古い内容で上書きするデータ喪失経路になる）
      const text = await readProjectFile(file.path)
      if (token !== selectSeq.current) return // 後続の選択が始まっていたら破棄
      const result = classifyFile(text, appRegistry)
      setFiles((prev) =>
        computeIssues(
          prev.map((f) => (f.path === file.path ? { ...f, result } : f)),
          appRegistry,
        ),
      )
      setSelectedPath(file.path)
      setIoError(null)
      if (result.status !== 'editable') return
      const module = appRegistry.get(result.type)
      if (!module) return
      // baseline は「読み込んだ内容の正規形」。無編集ならバイト一致で書き込みが起きず、
      // 非正規ファイルでも最初の編集まで書き戻さない（rev 5章）
      saverRef.current = createAutoSaver({
        delayMs: AUTOSAVE_DELAY_MS,
        baseline: serialize(result.data, module.schema),
        write: (text) => writeProjectFile(file.path, text),
        onError: (err) =>
          setSaveError(
            `自動保存に失敗しました（編集を続けるか、もう一度閉じる操作で再試行されます）: ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        onSuccess: () => setSaveError(null),
      })
      setHistory(createHistory(result.data))
    } catch (err) {
      if (token !== selectSeq.current) return
      setIoError(`ファイルの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`)
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
    setFiles((prev) => computeIssues([...prev, entry], appRegistry))
    setIoError(null)
    await selectFile(entry)
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
        write: writeProjectFile,
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
   * 開いているファイルなら closeCurrentFile を通さない——あれは flush する経路で、
   * 消したファイルを書き戻して復活させる。trashFile が dispose だけを行う
   */
  const deleteFile = async (file: ProjectFile) => {
    const wasSelected = file.path === selectedPath
    try {
      // 進行中の selectFile / openFolder があれば、その結果を捨てさせる
      if (wasSelected) selectSeq.current++
      await trashFile({
        path: file.path,
        saver: wasSelected ? saverRef.current : null,
        trash: moveFileToTrash,
      })
      if (wasSelected) {
        saverRef.current = null
        setSelectedPath(null)
        setHistory(null)
        setSaveError(null)
      }
      // 単一性違反はここで解消されうるので、必ず検証をやり直す
      setFiles((prev) => computeIssues(prev.filter((f) => f.path !== file.path), appRegistry))
      setIoError(null)
    } catch (err) {
      setIoError(
        `ファイルを削除できませんでした: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /** 削除は Undo で戻せないので確認を挟む（用語の削除に確認を挟まないのとは別。rev 5章） */
  const requestDelete = (file: ProjectFile) => {
    setConfirm({
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
   * コアの ensureFileOfType が持つので、将来の発火点はそちらを呼べばよい
   */
  const ensureGlossary = async () => {
    const module = appRegistry.get('glossary')
    if (projectDir === null || module === undefined) return
    try {
      const { path, created } = await ensureFileOfType({
        dir: projectDir,
        module,
        files: files.map((f) => ({ path: f.path, name: f.name, type: f.result.type })),
        join: joinPath,
        write: writeProjectFile,
      })
      if (created === null) {
        // 既にあった。走査済みの一覧から引いて開くだけ
        const existing = files.find((f) => f.path === path)
        if (existing) await selectFile(existing)
        return
      }
      await addCreatedFile(created)
    } catch (err) {
      setIoError(
        `用語集を作成できませんでした: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  const selected = files.find((f) => f.path === selectedPath) ?? null
  const selectedModule =
    selected && selected.result.status === 'editable'
      ? appRegistry.get(selected.result.type)
      : undefined
  // 用語集0個は正常な状態（新規プロジェクト）。押せば作れることを空状態で示す
  const hasGlossary = files.some((f) => f.result.type === 'glossary')

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
            projectOpen={projectDir !== null}
            onSelect={(file) => void selectFile(file)}
            onCreate={(module) => void createNewFile(module)}
            onDelete={requestDelete}
          />
        </aside>

        <section className="min-w-0 flex-1 overflow-auto">
          {selected === null && (
            <div className="p-6">
              <p className="text-sm text-ink-muted">ファイルを選ぶとここで編集できます。</p>
              {projectDir !== null && !hasGlossary && (
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

      <ConfirmDialog
        open={modalOpen}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        confirmLabel={confirm?.confirmLabel ?? ''}
        onConfirm={() => {
          const pending = confirm
          setConfirm(null)
          void pending?.onConfirm()
        }}
        onCancel={() => setConfirm(null)}
      />
    </main>
  )
}

export default App
