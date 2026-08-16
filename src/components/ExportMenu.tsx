import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * 出力の実行口（rev 8章。コピーと書き出しの両方）。M18 でジェネリック化し、
 * Markdown（`OutputProfile`）と画像（`ImageOutputProfile`）の両方に使い回す
 *（両者とも `id`/`label` は持つが `fileSuffix` 以降の形が違うため、
 * このコンポーネントが実際に読むのは `id`/`label` だけに絞ってある）。
 *
 * **プロファイルが1本のときはドロップダウンを出さない。** 選択肢が1つしかない
 * メニューは操作を1手増やすだけで何も選ばせない
 */
export interface ExportMenuProps<P extends { id: string; label: string }> {
  outputs: readonly P[]
  /** 出力できる状態にないとき（ファイル未選択・編集中データなし） */
  disabled: boolean
  copyLabel: string
  exportLabel: string
  onCopy: (profile: P) => void
  onExport: (profile: P) => void
}

function ProfileMenu<P extends { id: string; label: string }>(props: {
  label: string
  outputs: readonly P[]
  disabled: boolean
  onPick: (profile: P) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={props.disabled}>
          {props.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {props.outputs.map((profile) => (
          <DropdownMenuItem key={profile.id} onSelect={() => props.onPick(profile)}>
            {profile.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ExportMenu<P extends { id: string; label: string }>({
  outputs,
  disabled,
  copyLabel,
  exportLabel,
  onCopy,
  onExport,
}: ExportMenuProps<P>) {
  if (outputs.length > 1) {
    return (
      <>
        <ProfileMenu label={copyLabel} outputs={outputs} disabled={disabled} onPick={onCopy} />
        <ProfileMenu label={exportLabel} outputs={outputs} disabled={disabled} onPick={onExport} />
      </>
    )
  }
  // プロファイルが無い＝出力できるファイルを選んでいない。ボタンは出したまま
  // 押せなくする（M8 までと同じ見た目を保ち、額縁のボタンが消えたり出たりしない）
  const only = outputs[0]
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled || only === undefined}
        onClick={() => only !== undefined && onCopy(only)}
      >
        {copyLabel}
      </Button>
      <Button
        variant="outline"
        disabled={disabled || only === undefined}
        onClick={() => only !== undefined && onExport(only)}
      >
        {exportLabel}
      </Button>
    </>
  )
}
