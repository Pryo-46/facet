import { invoke } from '@tauri-apps/api/core'
import { readText, writeHtml, writeText } from '@tauri-apps/plugin-clipboard-manager'
import type { ClipboardIo } from '@/core/terminal/clipboard-io'

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
 * HTML としてクリップボードへ書く（Miro のマインドマップ。logic-tree M3）。
 *
 * `altText` を渡すのは、**HTML だけを載せると他アプリに貼れなくなる**ため。
 * Miro 自身も両方を載せている
 */
export async function copyHtmlToClipboard(html: string, altText: string): Promise<void> {
  await writeHtml(html, altText)
}

/**
 * クリップボードの HTML を読む（logic-tree M3）。
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

/**
 * クリップボードのテキストを読む（端末の右クリック貼り付け。M28）。
 *
 * **`clipboard-manager:allow-read-text` が要る**（`src-tauri/capabilities/default.json`）。
 * テキストが載っていないときプラグインはエラーを返すので、**空文字に潰して
 * 呼び出し側を単純にする**——「テキストが無い」は異常ではなく日常的な状態である
 *（`readClipboardHtml` と同じ扱い）
 *
 * **「空」と「失敗」を区別していない。** プラグインはどちらでも例外を投げ、
 * メッセージ文字列を解析しないと見分けられない（非公開の文言に依存する分岐は
 * 作らない）。その代償として、`clipboard-manager:allow-read-text` が外れると
 * **右クリック貼り付けは無反応になり、画面には何も出ない**——`TerminalTab` の
 * 貼り付け失敗の経路（`onError`）はここを通らないため到達しない。
 * 無反応を見たらまず capabilities の権限を疑うこと（`docs/open-issues.md`）
 */
export async function readClipboardText(): Promise<string> {
  try {
    return await readText()
  } catch {
    return ''
  }
}

/**
 * 端末へ注入するクリップボードの口（M28）。`tauriPtyIo` と同じく、
 * **額縁がここで組み立ててコンポーネントへ props で渡す**
 */
export const tauriClipboardIo: ClipboardIo = {
  readText: readClipboardText,
  writeText: copyToClipboard,
}
