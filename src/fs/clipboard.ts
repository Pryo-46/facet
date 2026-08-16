import { writeImage, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { Image } from '@tauri-apps/api/image'

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

/**
 * PNGバイト列をクリップボードへ画像として書く（M18）。
 *
 * **`writeImage` に生のPNGバイト列をそのまま渡さない。** プラグインの
 * `writeImage` は生RGBAの `number[]`（例: `[255,0,0,255, ...]`）を渡す使い方が
 * 例示されており、エンコード済みPNGをそのまま渡した場合の解釈は未定義。
 * `@tauri-apps/api/image` の `Image.fromBytes` は「png/icoのバイト列を
 * フォーマット推測してデコードする」ことがドキュメントに明記されているので、
 * 必ずこちらを経由する（`src-tauri/Cargo.toml` の `image-png` feature が要る。Task 1）
 */
export async function copyImageToClipboard(pngBytes: Uint8Array): Promise<void> {
  const image = await Image.fromBytes(pngBytes)
  await writeImage(image)
}
