import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface CellSelectProps {
  value: string
  options: readonly string[]
  /** 値 → 表示ラベル（用語集の kindLabel / エラーカタログの resolutionLabel をそのまま渡す） */
  labelOf: (value: string) => string
  onPick: (value: string) => void
  'aria-label': string
  'data-cell': string
  /** トリガーの面。呼び出し側の `cellInput` を渡す（足すのではなく差し替える） */
  className: string
  /**
   * セルの操作言語（Tab・Alt+↑↓ 等）。**素の ↑↓ はこの部品が消費し、
   * ここへは渡らない**——部品が意味を与えた打鍵は親へ渡さない（sequence M1 の教訓）
   */
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void
}

/**
 * テーブルセルの選択肢（ネイティブ `<select>` の置換。M25 決定4・rev 9章）。
 *
 * ネイティブをやめたのは**開いたときのリストが OS 描画で styled にできない**ため
 * （閉じた見た目は appearance-none で既にカスタムだった）。開閉は `KindMenu`
 * （IssueTreeEditor.tsx）と同じ Radix の DropdownMenu。あちらは「同時に1つ」を
 * 親の開閉 state で保証するが、こちらはメニューがモーダル（Radix の既定）なので
 * 2つ同時には開けず、state は部品が自分で持てば足りる。
 *
 * **キーボード契約（ネイティブ select の挙動を維持する）:**
 * - **閉じたまま素の ↑↓ ＝ 値切り替え**（端で止まる——循環しない）。
 *   `preventDefault` が Radix の「ArrowDown で開く」既定とページスクロールの
 *   両方を抑える（Radix はユーザーの onKeyDown を先に呼び、defaultPrevented を
 *   尊重する）
 * - **Space / クリック ＝ 開く**（Space はネイティブ select が開く打鍵。
 *   クリックともども Radix の既定に任せる）
 * - **Enter ＝ 開かない。セルの操作言語へ渡す**——ネイティブ select は
 *   Windows では Enter で開かず、Enter は現状 `onCellKeyDown` へ流れている。
 *   Radix の「Enter で開く」既定は preventDefault で降ろす
 * - Alt+↑↓・Tab ほかは `onKeyDown`（セルの操作言語）へそのまま渡す
 *
 * 現在値の印（`menuitemradio` のチェック）を出すのは、これが**値を選び直す**
 * 部品だからである。判断ピッカー（KindMenu）が印を出さないのは、あちらが
 * イベントの追記であって値の選択ではないため——流儀の差は意図
 */
export function CellSelect(props: CellSelectProps) {
  const [open, setOpen] = useState(false)

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey) {
      e.preventDefault()
      const at = props.options.indexOf(props.value)
      const next = props.options[at + (e.key === 'ArrowDown' ? 1 : -1)]
      if (next !== undefined) props.onPick(next)
      return
    }
    if (e.key === 'Enter') {
      // ネイティブ select は Enter で開かない。セルの操作言語（行の追加等）に
      // 使われている打鍵なので親へ渡し、Radix の「Enter で開く」既定は降ろす
      props.onKeyDown?.(e)
      if (!e.defaultPrevented) e.preventDefault()
      return
    }
    props.onKeyDown?.(e)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        type="button"
        aria-label={props['aria-label']}
        data-cell={props['data-cell']}
        className={`${props.className} text-left`}
        onKeyDown={onTriggerKeyDown}
      >
        {props.labelOf(props.value)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={props.value}
          onValueChange={(value) => {
            setOpen(false)
            props.onPick(value)
          }}
        >
          {props.options.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {props.labelOf(option)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
