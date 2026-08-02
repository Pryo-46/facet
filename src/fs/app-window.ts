import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * ウィンドウの close 要求を横取りする（Tauri は close 時に React の unmount を
 * 経ずに webview を落とすため、デバウンス中の編集はここで書き切るしかない）。
 * beforeClose が true を返したら destroy で実際に閉じる（destroy は
 * onCloseRequested を再発火させない）。false なら閉じない——書けていない
 * 編集がある状態で黙って捨てないため。エラー表示は呼び出し側の責務。
 */
export function interceptClose(beforeClose: () => Promise<boolean>): Promise<() => void> {
  const win = getCurrentWindow()
  return win.onCloseRequested(async (event) => {
    event.preventDefault()
    if (await beforeClose()) {
      await win.destroy()
    }
  })
}
