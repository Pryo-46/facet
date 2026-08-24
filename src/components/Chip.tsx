import type { ReactNode } from 'react'
import { buttonBase } from './button-styles'

/**
 * 選択トグル（フィルタのチップ）。**選択は黒塗りではなく、一段沈んだ面と
 * 濃い枠で示す**（rev 9章 M21「押すものと状態を同じ見た目にしない」）。
 * 用語集の種別フィルタ・エラーカタログの表示プロファイルと解決レベルが使う
 */
export function Chip(props: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={props.selected}
      className={`${buttonBase} border px-2 py-1 text-sm ${
        props.selected
          ? 'border-ink bg-surface-muted text-ink'
          : 'border-rule bg-canvas text-ink hover:bg-surface'
      }`}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}
