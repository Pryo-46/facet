import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { isPrimaryModifier, currentPlatform } from '@/core/keyboard/platform'

/** 実行環境のプラットフォーム。主修飾キー＋Enter の判定に使う（rev 10章の判定を再実装しない） */
const PLATFORM = currentPlatform()

export interface CellSelectProps {
  value: string
  options: readonly string[]
  /** 値 → 表示ラベル（用語集の kindLabel / エラーカタログの resolutionLabel をそのまま渡す） */
  labelOf: (value: string) => string
  /**
   * 開いたメニューの項目の文字。既定は `labelOf`。
   *
   * **閉じたセルの文字と分けるための口である。** 空を選べるセルでは
   * 項目に `空にする` のような操作の名前を出す一方、閉じたセルには空を
   * そのまま描く必要がある（データに無い語をセルに書かない）
   */
  itemLabelOf?: (value: string) => string
  onPick: (value: string) => void
  'aria-label': string
  'data-cell': string
  /** トリガーの面。呼び出し側の `cellInput` を渡す（足すのではなく差し替える） */
  className: string
  /**
   * セルの操作言語（Tab・Alt+↑↓ 等）。**素の ↑↓ はこの部品が消費し、
   * ここへは渡らない**——部品が意味を与えた打鍵は親へ渡さない
   */
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void
  /**
   * 閉じたまま素の `↑↓` で値を切り替えるか（既定 `true`）。
   *
   * **表では偽にする。** 真のままだと、行を移ろうとした `↓` が値を書き換え、
   * カーソルを動かしただけでセルが埋まる
   */
  changeOnArrows?: boolean
  /**
   * `Enter` でメニューを開くか（既定 `false`）。
   *
   * 偽のときは `Enter` をセルの操作言語へ渡す（ネイティブの select は
   * Windows では `Enter` で開かない）。表では真にして、値の変更を
   * 明示的に開いたときだけに限る
   */
  openOnEnter?: boolean
}

/**
 * テーブルセルの選択肢（ネイティブ `<select>` の置換。rev 9章）。
 *
 * ネイティブをやめたのは**開いたときのリストが OS 描画で styled にできない**ため
 * （閉じた見た目は appearance-none で既にカスタムだった）。開閉は `KindMenu`
 * （IssueTreeEditor.tsx）と同じ Radix の DropdownMenu。あちらは「同時に1つ」を
 * 親の開閉 state で保証するが、こちらはメニューがモーダル（Radix の既定）なので
 * 2つ同時には開けず、state は部品が自分で持てば足りる。
 *
 * **キーボード契約（既定はネイティブ select の挙動を維持する）:**
 * - **閉じたまま素の ↑↓ ＝ 値切り替え**（端で止まる——循環しない）。
 *   `preventDefault` が Radix の「ArrowDown で開く」既定とページスクロールの
 *   両方を抑える（Radix はユーザーの onKeyDown を先に呼び、defaultPrevented を
 *   尊重する）。**`changeOnArrows={false}` のときは値の切り替えをせず
 *   `onKeyDown` へそのまま渡す**——表の行移動に矢印を返すための口。
 *   この場合も preventDefault は要る。外すと Radix の「ArrowDown で開く」
 *   既定が働き、行移動のつもりの ↓ でメニューが開いてしまう
 * - **Space / クリック ＝ 開く**（Space はネイティブ select が開く打鍵。
 *   クリックともども Radix の既定に任せる）
 * - **Enter ＝ 開かない。セルの操作言語へ渡す**——ネイティブ select は
 *   Windows では Enter で開かず、Enter は現状 `onCellKeyDown` へ流れている。
 *   Radix の「Enter で開く」既定は preventDefault で降ろす。**`openOnEnter`
 *   が真なら逆に preventDefault せず Radix の既定（開く）へ渡す**——
 *   `composeEventHandlers` はこの部品の handler が先に走り、
 *   `defaultPrevented` でなければ Radix 自身の handler が続けて
 *   `onOpenToggle` を呼ぶので、何もしないだけで開く。**主修飾キーを伴う
 *   Enter は `openOnEnter` の真偽に関わらず必ずセルの操作言語へ渡し、
 *   preventDefault もする**——奪わないと `toggle-item-state`
 *   （起こりえないの入り切り）の写像が消え、preventDefault しないと
 *   Radix の「Enter で開く」既定がそのまま働いてしまう
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
      if (props.changeOnArrows === false) {
        // Radix のトリガーは合成した onKeyDown の中で「ArrowDown で開く」を
        // 自前で持つ（composeEventHandlers が defaultPrevented でなければ
        // 続けて呼ぶ）。ここで preventDefault しないと、行移動のつもりの
        // ↓ でメニューが開いてしまう
        e.preventDefault()
        props.onKeyDown?.(e)
        return
      }
      e.preventDefault()
      const at = props.options.indexOf(props.value)
      const next = props.options[at + (e.key === 'ArrowDown' ? 1 : -1)]
      if (next !== undefined) props.onPick(next)
      return
    }
    if (e.key === 'Enter') {
      // 主修飾キー＋Enter は toggle-item-state 用の打鍵なので、openOnEnter の
      // 真偽に関わらず必ずセルの操作言語へ渡す。ここで奪うと
      // 「起こりえない」の入り切りが消える
      if (isPrimaryModifier(e, PLATFORM)) {
        props.onKeyDown?.(e)
        // preventDefault しないと、Radix 自身の handler が Enter で開く既定を
        // 続けて実行してしまう（openOnEnter の有無に関わらず開かせない）
        if (!e.defaultPrevented) e.preventDefault()
        return
      }
      if (props.openOnEnter) {
        // preventDefault しない。composeEventHandlers はこの handler の後に
        // Radix 自身の handler を続けて呼ぶので、defaultPrevented のままなら
        // Radix の既定（開く）が働く
        return
      }
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
              {(props.itemLabelOf ?? props.labelOf)(option)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
