import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { folderName, type RegisteredProject } from '@/core/projects'

export interface RenameProjectDialogProps {
  /** 対象。null の間は閉じている */
  project: RegisteredProject | null
  /** 確定した表示名を返す。空で確定したときはフォルダ名が入って届く */
  onSubmit: (project: RegisteredProject, name: string) => void
  onClose: () => void
}

function RenameProjectForm({
  project,
  onSubmit,
  onClose,
}: {
  project: RegisteredProject
  onSubmit: (project: RegisteredProject, name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(project.name)

  function submit() {
    const trimmed = name.trim()
    onSubmit(project, trimmed === '' ? folderName(project.path) : trimmed)
  }

  return (
    <DialogContent aria-describedby={undefined}>
      <DialogHeader>
        <DialogTitle>プロジェクト名を変更</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">{project.path}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          aria-label="プロジェクト名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 w-full rounded-sm border border-border bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <div className="mt-4 flex justify-end gap-1.5">
          <Button type="button" variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" variant="outline">
            変更する
          </Button>
        </div>
      </form>
    </DialogContent>
  )
}

/**
 * プロジェクトの表示名を変えるダイアログ。切り替えメニューの省略記号から開く。
 *
 * 入力欄は `project.path` を鍵にした `key` で作り直す。`useState` の初期値だけに
 * 頼ると、閉じずに別の行の改名を開いたとき前の行の名前が残る。
 *
 * 空白だけの入力はフォルダ名へ戻す。名前の無い行を作れないようにするためで、
 * エラーを出すより手数が少ない。
 *
 * `Esc` とオーバーレイのクリックは `onOpenChange(false)` を経由して `onClose` に落ちる。
 * 確定の経路と合流させず、閉じる経路を1本に保つ。
 */
export function RenameProjectDialog({ project, onSubmit, onClose }: RenameProjectDialogProps) {
  return (
    <Dialog
      open={project !== null}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      {project !== null && (
        <RenameProjectForm key={project.path} project={project} onSubmit={onSubmit} onClose={onClose} />
      )}
    </Dialog>
  )
}
