import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UNRESOLVED_ACTOR_LABEL } from './output-labels'

export interface ActorRefCellProps {
  value: string | undefined
  actors: readonly { id: string; name: string }[]
  invalid: boolean
  'aria-label': string
  'data-cell': string
  onSelect: (actorId: string) => void
  /** メニューが開いているか。**省略可**——渡さなければ Radix は非制御モードで動く
      （セル単体の DOM テストが親を介さず素で描画できるのはこのため） */
  open?: boolean
  /** メニューの開閉。同時に1つだけ開くように親が制御するために使う */
  onOpenChange?: (open: boolean) => void
  onFieldKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void
}

/**
 * from / to の参加者参照セル（sequence M3 で選択専用にした）。
 *
 * **マウスはメニュー、キーボードは ↑↓ の即時切替。** M1 の「頭文字の
 * インクリメンタル一致＋未登録名の確定でその場で `actors` に追加」は、
 * 実使用の観察（補完の出番が少なく、その場で参加者を作る必要も無かった）を
 * 受けて外した。M1 の実機確認チェックリスト自体が「『決』＋Enter で参加者
 *『決』ができる挙動」を危険として見に行っていたのと整合する。
 *
 * 参加者の追加は、ヘッダの `Enter` とツールバーの「参加者を追加」の2本になった。
 *
 * 参照切れを空表示にしない——ボタンなので、空だと押す場所が見えなくなる。
 * 出力と同じ「（未解決）」の語を使う
 */
export function ActorRefCell(props: ActorRefCellProps) {
  const resolved = props.actors.find((a) => a.id === props.value)
  const cycle = (delta: -1 | 1): void => {
    if (props.actors.length === 0) return
    const at = props.actors.findIndex((a) => a.id === props.value)
    const next = (at + delta + props.actors.length) % props.actors.length
    props.onSelect(props.actors[next].id)
  }
  const face = props.invalid ? 'border-warning bg-warning/20' : 'border-rule bg-surface'
  return (
    <DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
      <DropdownMenuTrigger
        type="button"
        className={`w-full truncate rounded-sm border px-1.5 py-0.5 text-left text-sm text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-ring ${face}`}
        aria-label={props['aria-label']}
        data-cell={props['data-cell']}
        onKeyDown={(e) => {
          if (
            (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
            !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
          ) {
            // preventDefault が Radix の「↓ で開く」を止めている（StepShapeCell と同じ理由）
            e.preventDefault()
            cycle(e.key === 'ArrowUp' ? -1 : 1)
            return
          }
          // Enter / Space でもメニューを開かない。**トリガーはポインタでだけ開く**
          if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
          props.onFieldKeyDown?.(e)
        }}
      >
        {resolved === undefined ? UNRESOLVED_ACTOR_LABEL : resolved.name}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {props.actors.map((actor) => (
          <DropdownMenuItem key={actor.id} onSelect={() => props.onSelect(actor.id)}>
            {actor.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
