import { invoke } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { open, save } from '@tauri-apps/plugin-dialog'
import { exists, readDir, readTextFile, watch, writeTextFile } from '@tauri-apps/plugin-fs'

/**
 * Tauri のファイルアクセスをここに隔離する（コアは Tauri を知らない）。
 * scope はダイアログ選択で実行時に付与されるため、recursive: true が必須
 * （これがないとフォルダ配下のファイルが scope に入らない）。
 */
export async function pickProjectFolder(): Promise<string | null> {
  const selected = await open({ directory: true, recursive: true })
  return typeof selected === 'string' ? selected : null
}

/** フォルダ直下の .json ファイルの絶対パス一覧（サブフォルダは見ない） */
export async function listJsonFiles(dir: string): Promise<string[]> {
  const entries = await readDir(dir)
  const files: string[] = []
  for (const entry of entries) {
    if (entry.isFile && entry.name.toLowerCase().endsWith('.json')) {
      files.push(await join(dir, entry.name))
    }
  }
  return files
}

export async function readProjectFile(path: string): Promise<string> {
  return readTextFile(path)
}

export async function writeProjectFile(path: string, text: string): Promise<void> {
  await writeTextFile(path, text)
}

/** コアが Tauri の path API を直接触らないための薄い口 */
export async function joinPath(dir: string, name: string): Promise<string> {
  return join(dir, name)
}

/**
 * そのパスにファイル（またはフォルダ）があるか。
 * 新規作成の名前解決をディスクに問い合わせるために使う（コアの FileIo.exists）。
 * `fs:default` に `exists` は入っていないので capabilities に
 * `fs:allow-exists` の追記が要る
 */
export async function fileExists(path: string): Promise<boolean> {
  return exists(path)
}

/**
 * ファイルを OS のゴミ箱へ移す（完全削除はしない。rev 6章）。
 * fs プラグインにゴミ箱 API が無いため、ここだけ自前の Tauri コマンドを呼ぶ。
 * 自前コマンドは ACL の対象外なので capabilities への追記は要らない
 */
export async function moveFileToTrash(path: string): Promise<void> {
  await invoke('move_to_trash', { path })
}

/**
 * 監視イベントの送出間隔（fs プラグイン側のデバウンス）。
 * 既定は 2000ms で体感が鈍いため短くする。0 にはしない——
 * 1回の保存で大量のイベントが来る
 */
export const WATCH_DEBOUNCE_MS = 300

/**
 * プロジェクトフォルダを監視する。**ファイル単位ではなくフォルダ単位**
 *（rev 3章。外部リネームはファイル監視では取れないため）。
 *
 * **イベントの種類もパスも見ない。** notify のイベント表現は OS ごとに違い、
 * リネームは2イベントに割れる。「何か起きた」だけを呼び出し側へ伝え、
 * 何が変わったかは再走査と台帳の突き合わせが決める（自己書き込みの構造的除外）。
 *
 * `recursive: false`——走査（listJsonFiles）も直下だけなので範囲を合わせる。
 * 戻り値は監視を止める関数。
 *
 * **`watch` は fs プラグインの Cargo feature `watch` と `fs:allow-watch` の
 * 両方が要る**（片方でも欠けると実行時に失敗する。M2 の
 * `core:window:allow-destroy` と同じ罠）
 */
export async function watchFolder(dir: string, onEvent: () => void): Promise<() => void> {
  return watch(dir, () => onEvent(), { recursive: false, delayMs: WATCH_DEBOUNCE_MS })
}

/**
 * Markdown の書き出し先を尋ねる。null＝キャンセル（失敗ではない）。
 *
 * `dialog:default` に `allow-save` が含まれるので capabilities への追記は要らない。
 * **選ばれたパスは dialog プラグインが fs の実行時 scope へ許可を入れる**ので、
 * プロジェクトフォルダの外を選んでも `writeProjectFile` が通る
 */
export async function askSaveMarkdownPath(defaultPath: string): Promise<string | null> {
  const selected = await save({
    defaultPath,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  return typeof selected === 'string' ? selected : null
}
