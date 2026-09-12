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
