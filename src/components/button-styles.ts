/**
 * 生の `<button>` の土台（rev 9章の共通コンポーネント方針）。
 *
 * shadcn の `Button` を使うほどでない小さなボタン（フィルタのチップ、
 * 一覧の行、トーストの操作）はこの土台を敷いてから用途ごとの差分を足す。
 * **新しいボタンを作るときもここを通すこと**——揃っていないと
 * 「押せるものの見た目が場所ごとに違う」が積み上がる。
 * ラベルの縦位置は src/index.css の `@layer base` の `button { --tw-leading: 1.2; }`
 * が要素セレクタで揃えているので、ここには書かない（二重に持たない）。
 * `line-height` を直接指定していないのは意図的——Tailwind の text-sm / text-xs が
 * utilities レイヤーで `line-height: var(--tw-leading, ...)` を生成し、クラス
 * セレクタが要素セレクタに勝ってしまうため（`--tw-leading` という変数側で
 * 揃えることで、この特異性の競合を避けている）
 *
 * ただし**自前のレイアウトを持つボタンは対象外**（一覧の行のように
 * ブロックを縦積みするもの、別名セルのようにチップを flex-wrap するもの）。
 * 土台の `inline-flex items-center justify-center` がそれらの積み方を壊す。
 * ラベルの縦位置は src/index.css の `@layer base` が要素セレクタで
 * 全ボタンに当てているので、土台を敷かなくても揃う
 */
export const buttonBase =
  'inline-flex items-center justify-center rounded-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50'
