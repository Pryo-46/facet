/**
 * 開いているセルのドロップダウンメニュー数の更新（Task 11a）。
 *
 * `SequenceEditor` の from/to/種別 の3セルは同じ `onOpenChange` ハンドラを
 * 共有しており、これが `anyModalOpen` 経由でキャンバスのズーム・パン
 * （`useViewport`）とキーボードの操作言語（`resolveCommand` の `modalOpen`
 * ゲート）の両方を止める。**複数のメニューを同時に開いた状態になりうる**
 * （from を開いたまま to を開く等）ため、単一の boolean で「開いているか」を
 * 持つと、「2つ以上開いている状態から1つだけ閉じる」ときに誤って `false` へ
 * 落ちてしまう——まだ開いているメニューがあるのに、キャンバスと操作言語が
 * 復活してしまう（2026-08-12 investigation-multi-menu.md で実証済み）。
 *
 * `open` が `true` なら +1、`false` なら -1。**`false` が余分に来ても
 * 0 未満にしない**——Radix 側の呼び出し回数の前提が崩れても、開いている
 * メニューが無い状態を「負」にせず「0」に留める安全弁
 * （0 未満のままだと、次に1つ開いてもカウントが 0 に戻るだけで
 * 「開いている」判定にならず、操作言語が止まらなくなる）。
 */
export function nextMenuOpenCount(count: number, open: boolean): number {
  return open ? count + 1 : Math.max(0, count - 1)
}
