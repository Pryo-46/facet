import { writeText } from '@tauri-apps/plugin-clipboard-manager'

/**
 * クリップボードへ書く（Markdown 出力の「会議直後に議事録へ貼る」最短動線。rev 8章）。
 * コアは Tauri を知らないので、額縁がこの関数を `AppIo.copyText` として注入する。
 *
 * `navigator.clipboard` を使わないのは、動かないときに黙って失敗する経路になりうるため。
 * プラグイン側なら `clipboard-manager:allow-write-text` の欠落が capabilities で確認できる
 *（**読み取り権限は与えない**——このアプリにクリップボードを読む用途は無い）
 */
export async function copyToClipboard(text: string): Promise<void> {
  await writeText(text)
}
