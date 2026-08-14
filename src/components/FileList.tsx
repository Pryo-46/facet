import { useId } from 'react'
import { Folder, Plus, Trash2 } from 'lucide-react'
import { buttonBase } from '@/components/button-styles'
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
  /** 開いているプロジェクトフォルダ。一覧の直上に出す（額縁の帯から移設） */
  projectDir: string | null
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
          強いることになる（rev 5章「拒否は最小限に」のファイル操作への適用）。
          赤は warning（facet のパレットに destructive 役割は無い） */}
      <button
        type="button"
        aria-label={`${file.name} を削除`}
        title={`${file.name} を削除`}
        className={`${buttonBase} shrink-0 px-3 text-ink-muted hover:bg-canvas hover:text-warning`}
        onClick={props.onDelete}
      >
        <Trash2 aria-hidden className="size-4" />
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
      {/* 作成ボタンは縦積みで幅をそろえる。**flex-wrap で横に流さない**——
          ツール名の長さで折り返し位置が変わり、行ごとに端が揃わなくなる */}
      <div className="flex flex-col gap-1 border-b border-rule p-2">
        {props.modules.map((module) => {
          const creatable = canCreateFileOfType(module, props.existingTypes)
          const Icon = module.icon
          return (
            <button
              key={module.type}
              type="button"
              disabled={!creatable}
              title={creatable ? undefined : `${module.displayName}はプロジェクトに1つまでです`}
              className={`${buttonBase} w-full justify-start gap-2 border border-rule px-2 py-1 text-xs text-ink hover:bg-canvas disabled:hover:bg-transparent`}
              onClick={() => props.onCreate(module)}
            >
              <Plus aria-hidden className="size-3.5 shrink-0" />
              <Icon aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{module.displayName}を新規作成</span>
            </button>
          )
        })}
      </div>
      {/* パスは一覧の直上。長さが青天井なので truncate で受け、全文は title */}
      {props.projectDir !== null && (
        <div
          className="flex items-center gap-1.5 border-b border-rule px-2 py-1.5 text-xs text-ink-muted"
          title={props.projectDir}
        >
          <Folder aria-hidden className="size-3.5 shrink-0" />
          {/* 末尾（フォルダ名）の方が手がかりになるので、頭を省く */}
          <span className="min-w-0 flex-1 truncate text-left" dir="rtl">
            {props.projectDir}
          </span>
        </div>
      )}
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
