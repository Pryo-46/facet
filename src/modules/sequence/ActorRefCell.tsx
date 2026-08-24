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
 * 出力と同じ「（未解決）」の語を使う（無効軸の表示であって、無いデータの
 * 捏造ではない）。
 *
 * **参照は引けているが名前が空**の場合は、本文を空のままにして
 * 欠落の面（破線＋淡い `missing` の面）で示す（M22 決定1）。かつては
 * 「（未定義）」と書いていたが、それはデータに無い文字列を画面が作り出す
 * ことであり、コピーすれば仕様のように読めてしまう。押す場所が見えない
 * 問題は語ではなく面が引き受ける——メニュー項目も同じ理由で、空白の行では
 * なく欠落のマークを出す
 */
export function ActorRefCell(props: ActorRefCellProps) {
  const resolved = props.actors.find((a) => a.id === props.value)
  const cycle = (delta: -1 | 1): void => {
    if (props.actors.length === 0) return
    const at = props.actors.findIndex((a) => a.id === props.value)
    const next = (at + delta + props.actors.length) % props.actors.length
    props.onSelect(props.actors[next].id)
  }
  // 名前が空の参加者を指している＝欠落（M22）。プロップでは受けない——
  // 判定に要る材料（actors と value）がすでに手元にあり、渡す側が
  // 間違える余地を作らないため
  const missing = resolved !== undefined && resolved.name === ''
  // 無効は `invalid` の枠＋淡い面、欠落は破線＋淡い面（rev 9章 規約2）。
  // **面と枠のクラスは片方だけ出す**（SequenceEditor の参加者ヘッダと同じ理由）
  const face = props.invalid
    ? 'border-invalid bg-invalid-face'
    : missing
      ? 'border-dashed border-missing bg-missing-face'
      : 'border-rule bg-surface'
  return (
    <DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
      <DropdownMenuTrigger
        type="button"
        // **`min-h-6.5` を外さないこと。** 名前が空の参加者を指しているときは
        // 本文が空になり、子が無いボタンは行ボックスを作らないので内容高 0＋
        // 余白だけの帯に潰れる（親は height を渡さない）。押す面積が消え、
        // 同じ railTop に並ぶ種別セルとも段が揃わなくなる。
        // 26px の内訳: `<button>` には index.css の @layer base が
        // `--tw-leading: 1.2` を当てるため行箱は 16×1.2=19.2 ＋ `py-0.5` 4 ＋
        // 枠 2 ＝ 25.2 を切り上げた値。空名トリガーと文字入りの実高が同値に
        // なり、M22 の申し送りに記録された空名トリガーと文字入りの約2pxの
        // 段差が解消する
        className={`min-h-6.5 w-full truncate rounded-sm border px-1.5 py-0.5 text-left text-base text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-ring ${face}`}
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
          <DropdownMenuItem
            key={actor.id}
            onSelect={() => props.onSelect(actor.id)}
            // **名前は項目そのものに付ける。** 素の span（generic ロール）への
            // aria-label は accname 仕様で無視されうる命名禁止ロールで、
            // 実ブラウザでは「空白の項目」として支援技術に届く。menuitem は
            // 命名できるロールなので、名前はこちら、面は aria-hidden の飾りにする
            aria-label={actor.name === '' ? '名前が空の参加者' : undefined}
          >
            {actor.name === '' ? (
              <span
                aria-hidden="true"
                className="inline-block h-4 w-16 rounded-sm border border-dashed border-missing bg-missing-face"
              />
            ) : (
              actor.name
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
