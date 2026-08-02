/**
 * 配列の構造操作（コア・純関数）。すべて新しい配列を返す。
 * 範囲外の指定では「何も起きない」——先頭行で Alt+↑ を押しても壊れないこと
 */
export function insertAt<T>(items: readonly T[], index: number, item: T): T[] {
  const next = [...items]
  next.splice(index, 0, item)
  return next
}

export function removeAt<T>(items: readonly T[], index: number): T[] {
  if (index < 0 || index >= items.length) return [...items]
  const next = [...items]
  next.splice(index, 1)
  return next
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return [...items]
  if (to < 0 || to >= items.length || from === to) return [...items]
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
