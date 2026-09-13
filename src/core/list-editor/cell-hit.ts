/**
 * セルの余白を押したとき、中の欄へフォーカスを移す。**`<td>` の `onMouseDown` に置く。**
 *
 * 欄は中身の分しか高さを持たないので、背の高い行ではセルの上下に、押しても
 * 何も起きない面が残る。ここで欄へ渡すと、当たり判定がセルの矩形と一致する。
 *
 * **欄そのもの（とその子）を押したときは何もしない。** 横取りすると、
 * 押した位置のキャレットが文末へ飛ぶ。判定は `e.target !== e.currentTarget`
 * ——`<td>` 自身が押されたときだけ両者が一致する。
 *
 * **欄が複数並ぶセルには置かないこと**（デシジョンテーブルの値、開いた別名）。
 * どの欄へ移すかを決められず、先頭が黙って選ばれる
 */
export function focusCellField(e: React.MouseEvent<HTMLElement>): void {
  if (e.target !== e.currentTarget) return
  const field = e.currentTarget.querySelector<HTMLElement>('[data-cell]')
  if (field === null) return
  // 押した要素（`<td>`）へフォーカスを移す既定の挙動を止める。止めないと、
  // focus() の直後にフォーカスが `<td>` へ移って欄から外れる
  e.preventDefault()
  field.focus()
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    // キャレットは文末に置く。押した位置は使えない——欄の外を押しているので、
    // 対応する文字の位置が無い
    const at = field.value.length
    field.setSelectionRange(at, at)
  }
}
