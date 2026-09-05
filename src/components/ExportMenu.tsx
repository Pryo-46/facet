import { ToolbarButton, UNSUPPORTED_REASON } from '@/components/ToolbarButton'
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
 * 2つのボタンがそのまま出る
 */
export interface ExportMenuProps {
  outputs: readonly OutputProfile<unknown>[]
  /**
   * 出力できる状態にないとき（ファイル未選択・編集中データなし）の理由。
   * **null なら押せる。** `outputs` が空のとき（＝この出力口を持たないツール）は
   * `unusable` が null でもここで自前の理由に差し替える——**ファイル未選択を
   * 先に見る**ため、呼び出し側は「選んでいるか」だけを渡せばよい
   */
  unusable: string | null
  onCopy: (profile: OutputProfile<unknown>) => void
  onExport: (profile: OutputProfile<unknown>) => void
}

const COPY_LABEL = 'Markdown をコピー'
const EXPORT_LABEL = 'Markdown を書き出す'

function ProfileMenu(props: {
  label: string
  outputs: readonly OutputProfile<unknown>[]
  unusable: string | null
  onPick: (profile: OutputProfile<unknown>) => void
}) {
  // **押せないときはメニューを出さない。** 開いても選択肢を選べないメニューには
  // 存在理由が無い——ToolbarButton の通常ボタンにして、理由をツールチップで読めるようにする
  if (props.unusable !== null) {
    return (
      <ToolbarButton unusable={props.unusable} onClick={() => {}}>
        {props.label}
      </ToolbarButton>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">{props.label}</Button>
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

export function ExportMenu({ outputs, unusable, onCopy, onExport }: ExportMenuProps) {
  if (outputs.length > 1) {
    return (
      <>
        <ProfileMenu label={COPY_LABEL} outputs={outputs} unusable={unusable} onPick={onCopy} />
        <ProfileMenu label={EXPORT_LABEL} outputs={outputs} unusable={unusable} onPick={onExport} />
      </>
    )
  }
  // プロファイルが無い＝出力できるファイルを選んでいない、またはこのツールが
  // Markdown 出力を持たない。ボタンは出したまま押せなくする（見た目を保ち、
  // 額縁のボタンが消えたり出たりしない）。**押せない理由は
  // ToolbarButton の title で読める**。「Markdown 出力を持たない」の
  // 判定は `outputs` を持つこのコンポーネントだけができる——`App.tsx` はここへは
  // 踏み込まず、`!canExport` の判定だけを `unusable` として渡す
  const only = outputs[0]
  const reason = unusable ?? (only === undefined ? UNSUPPORTED_REASON : null)
  return (
    <>
      <ToolbarButton unusable={reason} onClick={() => only !== undefined && onCopy(only)}>
        {COPY_LABEL}
      </ToolbarButton>
      <ToolbarButton unusable={reason} onClick={() => only !== undefined && onExport(only)}>
        {EXPORT_LABEL}
      </ToolbarButton>
    </>
  )
}
