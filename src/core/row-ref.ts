/** 行の呼び名（rev 9章 D4）。配列位置＋1 ＝ No 列の値。メッセージが行を指すときはこれを使う */
export function rowRef(index: number): string {
  return `#${index + 1}`
}
