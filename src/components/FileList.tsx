import type { ProjectFile } from '@/core/project-file'
import type { AnyToolModule } from '@/core/registry'

export interface FileListProps {
  files: ProjectFile[]
  selectedPath: string | null
  /** 新規作成の選択肢。レジストリの登録順（rev 6章。ツールは増える前提） */
  modules: AnyToolModule[]
  /** プロジェクトフォルダを開いているか。未選択なら操作を一切出さない */
  projectOpen: boolean
  onSelect: (file: ProjectFile) => void
  onCreate: (module: AnyToolModule) => void
}

/**
 * ファイル一覧の額縁（rev 6章）。新規作成・赤バッジを持つ（削除は Task 6）。
 * 表示だけを担い、状態も I/O も持たない（配線は App）
 */
export function FileList(props: FileListProps) {
  if (!props.projectOpen) {
    return (
      <p className="p-4 text-sm text-ink-muted">
        プロジェクトフォルダを開くと JSON ファイルの一覧が出ます。
      </p>
    )
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-rule p-2">
        {props.modules.map((module) => (
          <button
            key={module.type}
            type="button"
            className="rounded-sm border border-rule px-2 py-1 text-xs text-ink hover:bg-surface"
            onClick={() => props.onCreate(module)}
          >
            ＋ {module.displayName}を新規作成
          </button>
        ))}
      </div>
      {props.files.length === 0 ? (
        <p className="p-4 text-sm text-ink-muted">
          このフォルダに JSON ファイルがありません。上のボタンで作成できます。
        </p>
      ) : (
        <ul>
          {props.files.map((file) => (
            <li key={file.path} className="flex items-start">
              <button
                type="button"
                aria-label={`${file.name} を開く`}
                className={`min-w-0 flex-1 px-4 py-2 text-left text-sm hover:bg-surface ${
                  file.path === props.selectedPath ? 'bg-surface' : ''
                }`}
                onClick={() => props.onSelect(file)}
              >
                <span className="block truncate text-ink">{file.name}</span>
                <span className="block text-xs text-ink-muted">
                  {file.result.status === 'editable' && file.result.title}
                  {file.result.status === 'rejected' && <span className="text-warning">開けない</span>}
                  {file.result.status === 'listOnly' && '編集不可'}
                  {file.issues.length > 0 && (
                    <span className="ml-1 rounded-sm bg-warning px-1 text-xs text-warning-fg">
                      {file.issues.length}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
