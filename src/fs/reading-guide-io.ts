import { join } from '@tauri-apps/api/path'
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import type { ReadingGuideIo } from '@/core/reading-guide'

/**
 * 読み方ガイドの読み書き（Tauri 境界）。
 * 判断はすべて src/core/reading-guide.ts（純ロジック）側にあり、ここは配線だけ。
 * exists→read の間にファイルが消える競合は、直後の書き込みが原本で埋めるので実害がない
 */
export const tauriReadingGuideIo: ReadingGuideIo = {
  async readText(path) {
    if (!(await exists(path))) return null
    return readTextFile(path)
  },
  writeText: (path, text) => writeTextFile(path, text),
  join: (...parts) => join(...parts),
}
