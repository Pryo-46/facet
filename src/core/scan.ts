import { classifyFile, type LoadResult } from './load'
import { fileName, type ProjectFile } from './project-file'
import type { ModuleRegistry } from './registry'

/** 走査で読んだファイル1件（コア。Tauri を知らない） */
export interface ScanEntry {
  path: string
  name: string
  /**
   * 読み込んだ生テキスト（BOM も含む素のバイト列のまま）。
   * 外部変更の判定は「この生テキスト ≠ 台帳の内容」で行うので、
   * 正規化やパースを通した値で置き換えてはいけない
   */
  text: string
  result: LoadResult
}

export interface ScanResult {
  entries: ScanEntry[]
  /**
   * 読めなかったパス。**「消えた」と混ぜてはいけない**——読み取り失敗を
   * 外部削除として扱うと、一時的なロック（他プロセスが開いている等）で
   * 開いているファイルを勝手に閉じてしまう
   */
  unreadable: string[]
}

/** 走査の I/O 注入口（実体は src/fs/project-fs.ts の listJsonFiles / readProjectFile） */
export interface ScanIo {
  list: (dir: string) => Promise<string[]>
  read: (path: string) => Promise<string>
}

/**
 * フォルダ直下の JSON を全部読んで分類する。
 * 「フォルダを開いたとき」と「外部変更の検知後の再走査」が同じ経路を通るための1本化
 * （issues は付けない。呼び出し側が computeIssues を通す）
 */
export async function scanFolder(
  dir: string,
  io: ScanIo,
  registry: ModuleRegistry,
): Promise<ScanResult> {
  const paths = await io.list(dir)
  const entries: ScanEntry[] = []
  const unreadable: string[] = []
  for (const path of paths) {
    let text: string
    try {
      text = await io.read(path)
    } catch {
      // 一覧取得と読み取りの間に消えた／ロックされている。次のイベントで拾い直す
      unreadable.push(path)
      continue
    }
    entries.push({ path, name: fileName(path), text, result: classifyFile(text, registry) })
  }
  return { entries, unreadable }
}

/** 走査結果を一覧の1件へ。issues は computeIssues が埋める */
export function toProjectFile(entry: ScanEntry): ProjectFile {
  return { path: entry.path, name: entry.name, result: entry.result, issues: [] }
}
