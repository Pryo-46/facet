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
