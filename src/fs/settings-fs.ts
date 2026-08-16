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
 * 壊れている・`lastProjectDir` が無い・`lastProjectDir` が空文字列、の
 * いずれでも例外を投げず `null` を返す（起動時復元は「無ければ通常起動」で
 * 扱う。spec スコープ節）。
 *
 * **空文字列を素通ししないこと（最終レビューで見つかった欠陥）。** `""` を
 * そのまま返すと `allowProjectDir("")` → Rust 側 `scope.allow_directory(Path::new(""), true)`
 * に届き、tauri-2.11.5 の scope 実装は空パスに `MAIN_SEPARATOR + "**"` を
 * 足すため、unix では `/**`——fs の実行時 scope をファイルシステム全体へ
 * 広げてしまう。詳細は `docs/history/m18-restore-last-folder.md` 追記分
 */
export async function readLastProjectDir(): Promise<string | null> {
  try {
    const text = await readTextFile(await settingsFilePath())
    const parsed = JSON.parse(text) as Settings
    return typeof parsed.lastProjectDir === 'string' && parsed.lastProjectDir !== ''
      ? parsed.lastProjectDir
      : null
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
  await writeTextFile(await settingsFilePath(), JSON.stringify(settings))
}
