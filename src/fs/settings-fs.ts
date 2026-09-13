import { appConfigDir, join } from '@tauri-apps/api/path'
import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { normalizeSettings, type AppSettings } from '@/core/settings'
import { normalizeProjects, folderName, type RegisteredProject } from '@/core/projects'

const SETTINGS_FILE_NAME = 'settings.json'

async function settingsFilePath(): Promise<string> {
  return join(await appConfigDir(), SETTINGS_FILE_NAME)
}

/** ファイル全体を読む。無い・読めない・壊れているのいずれでも空のオブジェクト */
async function readFile(): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readTextFile(await settingsFilePath()))
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/**
 * 読んでから重ねて書く。**丸ごと上書きしないこと。**
 * 登録済みプロジェクトと設定は書き手が別なので、片方が全体を
 * 書くと他方が毎回消える
 */
async function writeMerged(patch: Record<string, unknown>): Promise<void> {
  const current = await readFile()
  const configDir = await appConfigDir()
  if (!(await exists(configDir))) {
    await mkdir(configDir, { recursive: true })
  }
  await writeTextFile(await settingsFilePath(), JSON.stringify({ ...current, ...patch }))
}

/**
 * 直近に開いていたフォルダのパスを読む。ファイル不在・読み込み失敗・JSON が
 * 壊れている・`lastProjectDir` が無い・`lastProjectDir` が空文字列、の
 * いずれでも例外を投げず `null` を返す（起動時復元は「無ければ通常起動」で
 * 扱う。spec スコープ節）。
 *
 * **空文字列を素通ししないこと。** `""` を
 * そのまま返すと `allowProjectDir("")` → Rust 側 `scope.allow_directory(Path::new(""), true)`
 * に届き、tauri-2.11.5 の scope 実装は空パスに `MAIN_SEPARATOR + "**"` を
 * 足すため、unix では `/**`——fs の実行時 scope をファイルシステム全体へ
 * 広げてしまう。
 */
export async function readLastProjectDir(): Promise<string | null> {
  const parsed = await readFile()
  return typeof parsed.lastProjectDir === 'string' && parsed.lastProjectDir !== ''
    ? parsed.lastProjectDir
    : null
}

/** 設定を読む。読めない・壊れているのいずれでも既定を返し、例外を投げない */
export async function readSettings(): Promise<AppSettings> {
  return normalizeSettings(await readFile())
}

/** 設定を保存する。`lastProjectDir` は触らない */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeMerged({ theme: settings.theme, canvas: settings.canvas })
}

/**
 * 登録済みプロジェクトを読む。読めない・壊れているのいずれでも空配列を返し、
 * 例外を投げない。
 *
 * **`projects` キーが無いときだけ `lastProjectDir` を取り込む。**
 * 空配列を「まだ移行していない」と読むと、全部を一覧から外した利用者に
 * 消したはずの1件が毎回戻る
 */
export async function readProjects(): Promise<RegisteredProject[]> {
  const parsed = await readFile()
  if (parsed.projects !== undefined) return normalizeProjects(parsed.projects)
  const dir = parsed.lastProjectDir
  if (typeof dir !== 'string' || dir === '') return []
  return normalizeProjects([{ path: dir, name: folderName(dir) }])
}

/** 登録済みプロジェクトを保存する。`theme` と `canvas` は触らない */
export async function saveProjects(projects: readonly RegisteredProject[]): Promise<void> {
  await writeMerged({ projects: [...projects] })
}
