import { Funnel, FunnelX } from 'lucide-react'
import { buttonBase } from '@/components/button-styles'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UNFILLED_LABEL } from './labels'

export interface FilterMenuProps {
  /** 列の名前。ボタンのアクセシブル名に使う */
  name: string
  /** 出しうるラベルの全体。結果列は先頭に空文字を入れて渡す */
  all: readonly string[]
  /** いま出しているラベル。**undefined は絞り込みなし**（＝全部出す） */
  picked: readonly string[] | undefined
  onToggle: (label: string) => void
  onClear: () => void
}

/** 空文字は画面では未記入と書く。データに無い語をセルへ書かないので、ここだけの読み替えである */
const show = (label: string): string => (label === '' ? UNFILLED_LABEL : label)

/**
 * 列見出しの絞り込み。**チェックを押してもメニューを閉じない**——複数の値を
 * 続けて入り切りする操作なので、1つ押すたびに閉じると開き直しが要る。
 *
 * **絞り込み中かどうかをアイコンで出す。** 列が多い表では、どの列で絞ったかを
 * 見出しから読めないと、行が出ない理由を追えない
 */
export function FilterMenu({ name, all, picked, onToggle, onClear }: FilterMenuProps) {
  const filtered = picked !== undefined
  const Icon = filtered ? FunnelX : Funnel
  return (
    // modal={false}: Radix の既定（モーダル）は開いている間、表本体を
    // aria-hidden で覆う。この列は開いたまま複数の値を入り切りする作りなので、
    // 開いている間も表の行数の変化が見える必要がある
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${name} の絞り込み`}
          className={`${buttonBase} size-5 ${filtered ? 'text-ink' : 'text-ink-faint hover:text-ink'}`}
        >
          <Icon aria-hidden className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {all.map((label, at) => (
          // key に生のラベルを使わない。同じラベルが2件あるファイルは
          // duplicate-value / duplicate-choice が赤で出す正規の状態で、key が衝突する
          <DropdownMenuCheckboxItem
            key={`${at}`}
            checked={picked === undefined || picked.includes(label)}
            // 押しても閉じない。Radix の既定は選ぶと閉じる
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onToggle(label)}
          >
            {show(label)}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!filtered} onSelect={() => onClear()}>
          この列の絞り込みを外す
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
