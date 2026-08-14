/**
 * AI 向け読み方ガイドをプロジェクトフォルダへ配る（コア・I/O 注入）。
 *
 * **これが無いと、素の JSON を読む AI がドメイン規約を知る手段が無い。**
 * スキーマの自己記述性（rev 5章）は構造を説明するが、「空欄・undecided は
 * 未決の意思表示であり埋めてはいけない」「単一性フラグを持つツールは
 * 1ファイルずつ」といった読み方の規約は facet 開発リポジトリの docs にしか
 * 無く、ユーザーのプロジェクトフォルダには入っていない。
 *
 * Skill 同期（skill-sync.ts）と違い、ガイドは単一の静的テキストなので
 * 原本は Vite の `?raw` import でバンドルへ取り込む（tauri.conf.json の
 * bundle.resources と定数の二重管理を増やさない）。
 *
 * **内容が原本と一致するときは書かない**——mtime を無駄に更新すると、
 * フォルダ watcher の再走査と Git のノイズを毎回の起動で増やすため。
 * なお書いた場合も、アプリの走査は `.json` しか一覧しない
 * （src/fs/project-fs.ts）ので、ガイドがファイル一覧や外部変更検知に
 * 現れることはない
 */
import guideText from './reading-guide.md?raw'

/** プロジェクトフォルダ直下に置くガイドのファイル名（スペック設計1で確定） */
export const READING_GUIDE_FILENAME = 'README-for-AI.md'

/** ガイド原本の全文 */
export const READING_GUIDE_TEXT: string = guideText

export interface ReadingGuideIo {
  /** ファイルが無ければ null を返す */
  readText(path: string): Promise<string | null>
  writeText(path: string, text: string): Promise<void>
  join(...parts: string[]): Promise<string>
}

/** ガイドを配る。無ければ書く／一致なら触らない／不一致（旧版・ユーザー編集）なら原本で上書き */
export async function syncReadingGuide(projectDir: string, io: ReadingGuideIo): Promise<void> {
  const path = await io.join(projectDir, READING_GUIDE_FILENAME)
  if ((await io.readText(path)) === READING_GUIDE_TEXT) return
  await io.writeText(path, READING_GUIDE_TEXT)
}
