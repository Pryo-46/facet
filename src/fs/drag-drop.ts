import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { DragDropEvent } from '@tauri-apps/api/webview'

/**
 * ウィンドウへのファイルのドラッグ＆ドロップを購読する（M28。エクスプローラから
 * ペインへ放り込む動線）。
 *
 * **`async` にしてあるのは、`getCurrentWebview()` が同期で throw しうるため。**
 * Tauri の外（jsdom・素のブラウザ）では `window.__TAURI_INTERNALS__` が無く、
 * 呼んだ瞬間に例外になる。`async` 関数の中で throw させれば、それは拒否された
 * Promise になり、呼び出し側の `.catch()` が普通に受けられる。
 *
 * イベントは**ウィンドウ全体**で発火する。どこへ落ちたかの判定は呼び出し側の
 * 仕事（ペインの矩形を知っているのは額縁だけ）なので、ここでは `payload` を
 * ほどいて渡すだけにする
 */
export async function onDragDrop(
  handler: (event: DragDropEvent) => void,
): Promise<() => void> {
  return getCurrentWebview().onDragDropEvent((event) => handler(event.payload))
}
