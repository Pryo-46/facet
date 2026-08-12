/**
 * グローバル層（rev 10章）がキーを見送るべきかの判定。
 *
 * **端末ペインは操作言語の管轄外**（設計 決定11）。額縁のグローバル keydown は
 * window の bubble 段階で Ctrl+Z を横取りするので、これが無いと**端末で
 * Ctrl+Z を押したときに facet が Undo する**——Claude Code には届かず、
 * 編集中の図が勝手に巻き戻る。モーダル中に操作言語を止めるのと同じ扱い
 */
export function isOutsideGlobalLayer(
  target: EventTarget | null,
  terminalPane: HTMLElement | null,
): boolean {
  if (terminalPane === null) return false
  return target instanceof Node && terminalPane.contains(target)
}
