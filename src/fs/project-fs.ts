import { invoke } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

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
 * ファイルを OS のゴミ箱へ移す（完全削除はしない。rev 6章）。
 * fs プラグインにゴミ箱 API が無いため、ここだけ自前の Tauri コマンドを呼ぶ。
 * 自前コマンドは ACL の対象外なので capabilities への追記は要らない
 */
export async function moveFileToTrash(path: string): Promise<void> {
  await invoke('move_to_trash', { path })
}
