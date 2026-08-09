import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { OutputProfile } from '@/core/registry'

/**
 * 出力の実行口（rev 8章。コピーと .md 書き出しの両方）。
 *
 * **プロファイルが1本のときはドロップダウンを出さない。** 選択肢が1つしかない
 * メニューは操作を1手増やすだけで何も選ばせない。用語集は1本なので、
 * M8 までと同じ2つのボタンがそのまま出る
 */
export interface ExportMenuProps {
  outputs: readonly OutputProfile<unknown>[]
  /** 出力できる状態にないとき（ファイル未選択・編集中データなし） */
  disabled: boolean
  onCopy: (profile: OutputProfile<unknown>) => void
  onExport: (profile: OutputProfile<unknown>) => void
}

const COPY_LABEL = 'Markdown をコピー'
const EXPORT_LABEL = 'Markdown を書き出す'

function ProfileMenu(props: {
  label: string
  outputs: readonly OutputProfile<unknown>[]
  disabled: boolean
  onPick: (profile: OutputProfile<unknown>) => void
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

export function ExportMenu({ outputs, disabled, onCopy, onExport }: ExportMenuProps) {
  if (outputs.length > 1) {
    return (
      <>
        <ProfileMenu label={COPY_LABEL} outputs={outputs} disabled={disabled} onPick={onCopy} />
        <ProfileMenu label={EXPORT_LABEL} outputs={outputs} disabled={disabled} onPick={onExport} />
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
        {COPY_LABEL}
      </Button>
      <Button
        variant="outline"
        disabled={disabled || only === undefined}
        onClick={() => only !== undefined && onExport(only)}
      >
        {EXPORT_LABEL}
      </Button>
    </>
  )
}
