import { appConfigDir, join } from '@tauri-apps/api/path'
import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

const SETTINGS_FILE_NAME = 'settings.json'

interface Settings {
  lastProjectDir?: string
}

async function settingsFilePath(): Promise<string> {
  return join(await appConfigDir(), SETTINGS_FILE_NAME)
}

/**
 * 直近に開いていたフォルダのパスを読む。ファイル不在・読み込み失敗・JSON が
 * 壊れている・`lastProjectDir` が無い、のいずれでも例外を投げず `null` を
 * 返す（起動時復元は「無ければ通常起動」で扱う。spec スコープ節）
 */
export async function readLastProjectDir(): Promise<string | null> {
  try {
    const text = await readTextFile(await settingsFilePath())
    const parsed = JSON.parse(text) as Settings
    return typeof parsed.lastProjectDir === 'string' ? parsed.lastProjectDir : null
  } catch {
    return null
  }
}

/** 直近に開いていたフォルダのパスを保存する。設定ディレクトリが無ければ作る */
export async function saveLastProjectDir(dir: string): Promise<void> {
  const configDir = await appConfigDir()
  if (!(await exists(configDir))) {
    await mkdir(configDir, { recursive: true })
  }
  const settings: Settings = { lastProjectDir: dir }
  await writeTextFile(await join(configDir, SETTINGS_FILE_NAME), JSON.stringify(settings))
}
