import { useId } from 'react'
import { canCreateFileOfType } from '@/core/file-ops'
import type { ProjectFile } from '@/core/project-file'
import type { AnyToolModule } from '@/core/registry'

export interface FileListProps {
  files: ProjectFile[]
  selectedPath: string | null
  /** 新規作成の選択肢。レジストリの登録順（rev 6章。ツールは増える前提） */
  modules: AnyToolModule[]
  /**
   * 走査済み全ファイルの type（読めなかったファイルは null）。
   * singleton モジュールの新規作成ボタンを、既に1つあるかどうかで
   * disabled にするために canCreateFileOfType へそのまま渡す
   */
  existingTypes: readonly (string | null)[]
  /** プロジェクトフォルダを開いているか。未選択なら操作を一切出さない */
  projectOpen: boolean
  onSelect: (file: ProjectFile) => void
  onCreate: (module: AnyToolModule) => void
  onDelete: (file: ProjectFile) => void
}

/**
 * ファイル1行。**`useId` を使うために切り出している**——
 * `aria-describedby` は id で結ぶ必要があり、map の中では id を作れない
 */
function FileRow(props: {
  file: ProjectFile
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const { file } = props
  const descId = useId()
  return (
    // items-stretch で削除ボタンが行の高さいっぱいになる（要望8）。
    // 行の区切りは grid（薄い装飾の罫。要望9）
    <li className="flex items-stretch border-b border-grid">
      <button
        type="button"
        aria-label={`${file.name} を開く`}
        aria-describedby={descId}
        className={`min-w-0 flex-1 border-l-2 px-4 py-2 text-left text-sm ${
          props.selected ? 'border-ink bg-canvas' : 'border-transparent hover:bg-canvas'
        }`}
        onClick={props.onSelect}
      >
        <span className="block truncate text-ink">{file.name}</span>
        <span id={descId} className="block text-xs text-ink-muted">
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
      {/* 開けない・編集不可のファイルにも削除を出す——単一性違反の解消には
          「壊れている方の用語集を消す」が必要で、そこを塞ぐと外部エディタを
          強いることになる（rev 5章「拒否は最小限に」のファイル操作への適用） */}
      <button
        type="button"
        aria-label={`${file.name} を削除`}
        className="flex shrink-0 items-center px-2 text-xs text-ink-muted hover:bg-canvas hover:text-warning"
        onClick={props.onDelete}
      >
        削除
      </button>
    </li>
  )
}

/**
 * ファイル一覧の額縁（rev 6章）。新規作成・削除・赤バッジを持つ。
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
        {props.modules.map((module) => {
          const creatable = canCreateFileOfType(module, props.existingTypes)
          return (
            <button
              key={module.type}
              type="button"
              disabled={!creatable}
              title={creatable ? undefined : `${module.displayName}はプロジェクトに1つまでです`}
              className="rounded-sm border border-rule px-2 py-1 text-xs text-ink hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
              onClick={() => props.onCreate(module)}
            >
              ＋ {module.displayName}を新規作成
            </button>
          )
        })}
      </div>
      {props.files.length === 0 ? (
        <p className="p-4 text-sm text-ink-muted">
          このフォルダに JSON ファイルがありません。上のボタンで作成できます。
        </p>
      ) : (
        <ul>
          {props.files.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              selected={file.path === props.selectedPath}
              onSelect={() => props.onSelect(file)}
              onDelete={() => props.onDelete(file)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
