import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createAutoSaver, type AutoSaver } from '@/core/autosave'
import { serialize } from '@/core/canonical'
import { classifyFile, type LoadResult } from '@/core/load'
import {
  listJsonFiles,
  pickProjectFolder,
  readProjectFile,
  writeProjectFile,
} from '@/fs/project-fs'
import { appRegistry } from '@/modules'

const AUTOSAVE_DELAY_MS = 500

interface ProjectFile {
  path: string
  name: string
  result: LoadResult
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function App() {
  const [dark, setDark] = useState(false)
  const [projectDir, setProjectDir] = useState<string | null>(null)
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  // 編集中データ。selected が editable のときだけ非 null
  const [editingData, setEditingData] = useState<unknown>(null)
  const [ioError, setIoError] = useState<string | null>(null)
  const saverRef = useRef<AutoSaver | null>(null)
  // selectFile の連続呼び出しを直列化するためのトークン。
  // 後続の選択（または openFolder）が始まったら、先行呼び出しの結果は破棄する。
  const selectSeq = useRef(0)

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

  const closeCurrentFile = async () => {
    await saverRef.current?.flush()
    saverRef.current?.dispose()
    saverRef.current = null
    setSelectedPath(null)
    setEditingData(null)
  }

  const openFolder = async () => {
    const dir = await pickProjectFolder()
    if (dir === null) return
    // 進行中の selectFile を無効化する（フォルダ切替中に古い選択結果が紛れ込まないように）
    selectSeq.current++
    await closeCurrentFile()
    try {
      const paths = await listJsonFiles(dir)
      const loaded: ProjectFile[] = []
      for (const path of paths) {
        const text = await readProjectFile(path)
        loaded.push({ path, name: fileName(path), result: classifyFile(text, appRegistry) })
      }
      setProjectDir(dir)
      setFiles(loaded)
      setIoError(null)
    } catch (err) {
      setIoError(`ファイルの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const selectFile = async (file: ProjectFile) => {
    const token = ++selectSeq.current
    await closeCurrentFile()
    try {
      // 選択時に必ずディスクから読み直す（走査時キャッシュを編集の起点にすると、
      // 直前の自動保存分を古い内容で上書きするデータ喪失経路になる）
      const text = await readProjectFile(file.path)
      if (token !== selectSeq.current) return // 後続の選択が始まっていたら破棄
      const result = classifyFile(text, appRegistry)
      setFiles((prev) => prev.map((f) => (f.path === file.path ? { ...f, result } : f)))
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
      })
      setEditingData(result.data)
    } catch (err) {
      if (token !== selectSeq.current) return
      setIoError(`ファイルの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const selected = files.find((f) => f.path === selectedPath) ?? null
  const selectedModule =
    selected && selected.result.status === 'editable'
      ? appRegistry.get(selected.result.type)
      : undefined

  return (
    <main className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="flex items-center gap-4 border-b border-rule px-6 py-3">
        <h1 className="text-lg font-bold text-ink">facet</h1>
        <Button onClick={() => void openFolder()}>フォルダを開く</Button>
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

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 border-r border-rule">
          {files.length === 0 ? (
            <p className="p-4 text-sm text-ink-muted">
              プロジェクトフォルダを開くと JSON ファイルの一覧が出ます。
            </p>
          ) : (
            <ul>
              {files.map((file) => (
                <li key={file.path}>
                  <button
                    type="button"
                    className={`block w-full px-4 py-2 text-left text-sm hover:bg-surface ${
                      file.path === selectedPath ? 'bg-surface' : ''
                    }`}
                    onClick={() => void selectFile(file)}
                  >
                    <span className="block text-ink">{file.name}</span>
                    <span className="block text-xs text-ink-muted">
                      {file.result.status === 'editable' && file.result.title}
                      {file.result.status === 'rejected' && (
                        <span className="text-warning">開けない</span>
                      )}
                      {file.result.status === 'listOnly' && '編集不可'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="min-w-0 flex-1 overflow-auto">
          {selected === null && (
            <p className="p-6 text-sm text-ink-muted">ファイルを選ぶとここで編集できます。</p>
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
                onChange={(next: unknown) => {
                  setEditingData(next)
                  saverRef.current?.update(serialize(next, selectedModule.schema))
                }}
              />
            )}
        </section>
      </div>
    </main>
  )
}

export default App
