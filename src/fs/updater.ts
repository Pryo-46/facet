import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'

/**
 * 自動アップデート。**Tauri の updater API をここに隔離する。**
 * コアは Tauri を知らない（他の src/fs/* と同じ役割）。
 *
 * 進捗イベントの累計をここで取らないのは、Tauri のイベント型をコアへ漏らさない
 * ため。コア側（core/update-check.ts）が受け取るのは「今回届いたバイト数」と
 * 「総量（分かっていれば）」の2つの数だけ
 */
export interface AvailableUpdate {
  version: string
  /**
   * ダウンロードしてインストールする。**成功しても戻ってこない**——
   * Windows ではインストールの実行時に OS がプロセスを落とす
   */
  install: (onProgress: (downloaded: number, total: number | null) => void) => Promise<void>
}

/**
 * 新版があれば返す。無ければ null。
 *
 * **例外はそのまま投げる。** 握り潰すか見せるかは呼び出し側が決める——
 * 起動時のチェックは静かに諦め、利用者が押したときだけ見せる（M19 の設計）
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  const update = await check()
  if (update === null) return null
  return {
    version: update.version,
    install: async (onProgress) => {
      let total: number | null = null
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? null
          onProgress(0, total)
        } else if (event.event === 'Progress') {
          onProgress(event.data.chunkLength, total)
        }
      })
      // **Windows ではここへ到達しない見込み**——インストールの実行時に OS が
      // プロセスを落とすため。到達したときのために呼んでおく（害は無い）
      await relaunch()
    },
  }
}
