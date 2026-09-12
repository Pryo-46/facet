/**
 * スクロールに追従する表の見出しセル。**表を持つモジュールはここを通すこと**
 * ——揃っていないと、同じ見出しなのにツールごとに罫線の有無が食い違う。
 *
 * **下罫線を `border-b` で持たない。** `border-collapse` の表では罫線が
 * セルではなく表の格子に属するので、`sticky` で浮いた見出しは罫線を
 * 置き去りにし、スクロール中だけ線が消える。影は要素が自分で塗るので
 * 見出しについてくる。色は `--rule` を直に引く——`@theme inline` は
 * `--color-rule` を実行時の変数として残さないため、影の中からは辿れない。
 *
 * 呼び出し側に残すのは用途ごとの差分だけ（`text-right`、列の縦罫、
 * ポップオーバーの土台になる `relative`）
 */
export const headCell =
  'sticky top-0 z-10 shadow-[inset_0_-1px_0_var(--rule)] bg-surface-muted px-2 py-1 text-base font-medium tracking-wide text-ink-muted'

/**
 * 表のセルの入力欄の土台。**幅と文字色を持たない。** 幅はラベル欄のように
 * 固定で並べる欄があり、文字色は起こりえないのセルだけ非アクティブになる
 * ——同じ要素に文字色を2つ載せると、どちらが出るかは生成 CSS の並び順で決まる。
 *
 * **枠を自分で描かない。** 入力欄は中身の分しか高さを持たないので、
 * 入力欄がフォーカス枠を描くとセルの中に小さい箱が浮き、空のセルでは
 * その箱が細い線に潰れる。枠はセルの側（`cellFocus`）が描く
 */
export const cellField =
  'resize-none overflow-y-auto bg-transparent px-2 py-1 outline-none align-middle'

/** 表のセルの入力欄。セルの幅いっぱいに広がる */
export const cellInput = `w-full ${cellField} text-ink`

/**
 * 選択肢セル・ボタンセルの面。**セルの高さいっぱいに広がる**ので、
 * メニューを開くのに欄の帯を狙わずに済む。`block` を外さないこと——
 * ボタンの既定はインラインで、行ボックスの下端に隙間が残って高さが揃わない。
 *
 * **`<textarea>` には使わないこと。** `CellInput` は `scrollHeight` から
 * 折り返しの行数を測るので、高さを固定すると測定値がセルの高さになり、
 * 1行のセルが行いっぱいの行数を返す
 */
export const cellButton = `block h-full ${cellInput}`

/**
 * `cellButton` を入れる `<td>`。**高さを指定する**——`<td>` の高さが `auto` の
 * ままだと、中の `h-full` は解決できず `auto` に落ちる（Chrome 実測: 高さ
 * 99.4px のセルの中でボタンは 26.2px のまま）。
 *
 * 1px は下限であって固定ではない。表のセルは中身と行の高さまで伸びるので、
 * 選択肢セルしか無い行でも潰れない。**`absolute inset-0` で埋めないこと**
 * ——欄が行の高さを決める側から抜けるので、そういう行はセルごと潰れる
 */
export const buttonCell = 'h-px'

/**
 * フォーカス中のセルの枠。**`<td>` に載せる**ので、枠の矩形がセルの矩形と
 * 一致する。角丸を足さないこと——`<td>` は角丸を持たず、罫線とずれた
 * 「浮いた箱」に戻る。
 *
 * リングを選ぶ理由は面（`focus:bg-*`）と競合しないため。欠落・無効のセルは
 * 淡い面（`CELL_FACE_CLASS`）で警告を出しており、面を塗り替えるとそれが消える
 */
export const cellFocus = 'focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring'
