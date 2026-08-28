import { invoke } from '@tauri-apps/api/core'
import { writeHtml, writeText } from '@tauri-apps/plugin-clipboard-manager'

/**
 * クリップボードへ書く（Markdown 出力の「会議直後に議事録へ貼る」最短動線。rev 8章）。
 * コアは Tauri を知らないので、額縁がこの関数を `AppIo.copyText` として注入する。
 *
 * `navigator.clipboard` を使わないのは、動かないときに黙って失敗する経路になりうるため。
 * プラグイン側なら `clipboard-manager:allow-write-text` の欠落が capabilities で確認できる。
 */
export async function copyToClipboard(text: string): Promise<void> {
  await writeText(text)
}

/**
 * HTML としてクリップボードへ書く（Miro のマインドマップ。logic-tree M2）。
 *
 * `altText` を渡すのは、**HTML だけを載せると他アプリに貼れなくなる**ため。
 * Miro 自身も両方を載せている
 */
export async function copyHtmlToClipboard(html: string, altText: string): Promise<void> {
  await writeHtml(html, altText)
}

/**
 * クリップボードの HTML を読む（logic-tree M2）。
 *
 * **プラグインには読み取り API が無い**ので、Rust の自前コマンドを通す
 *（`src-tauri/src/lib.rs` の `read_clipboard_html`）。HTML が載っていないときは
 * Rust 側がエラーを返すので、**空文字に潰して呼び出し側を単純にする**——
 * 「HTML が無い」は異常ではなく日常的な状態である
 */
export async function readClipboardHtml(): Promise<string> {
  try {
    return await invoke<string>('read_clipboard_html')
  } catch {
    return ''
  }
}
