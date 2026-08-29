/**
 * 端末へ差し込むファイル参照を組み立てる（コア・純関数。React も Tauri も知らない）。
 *
 * **プロジェクト配下は `@相対パス`、外は素の絶対パス。** `@` は cwd 相対の
 * ファイル参照として作られており、Windows の絶対パス（ドライブレターのコロンと
 * バックスラッシュを含む）が `@` の後ろで解決する保証がない。`@` を付けずに素の
 * 絶対パスを本文へ置けば、Claude が自分で読みに行く（設計 §3.1）
 */

/**
 * 比較のための正規化。**戻り値の組み立てには使わない**——`toLowerCase()` は
 * 文字数を変えうる（例: `İ` → `i̇`）ので、ここで得た文字列の長さで元のパスを
 * 切ってはいけない
 */
function normalize(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}

/** `filePath` が `dir` の配下か。**前方一致だけでは足りない**——`C:\proj` が
 * `C:\project\a.json` に一致してしまうので、区切りまで含めて見る */
function isInside(dir: string, filePath: string): boolean {
  return normalize(filePath).startsWith(`${normalize(dir)}/`)
}

/**
 * ファイル1件の参照文字列。**末尾にスペースを付ける**——続けて文が打てるように
 */
export function fileReference(projectDir: string, filePath: string): string {
  // 末尾の区切りを落とす。**元の綴りのまま**落とす（下で length を使うため）
  const dir = projectDir.replace(/[\\/]+$/, '')
  if (!isInside(dir, filePath)) return `${filePath} `
  const relative = filePath
    .slice(dir.length)
    .replace(/^[\\/]+/, '')
    .replace(/\\/g, '/')
  return `@${relative} `
}

/**
 * 複数ファイルを1つの文字列にする（エクスプローラは複数選択のまま落とせる）。
 * **上限は設けない**——落とした人が落としたぶんだけ渡す（設計 §3.3）
 */
export function fileReferences(projectDir: string, filePaths: readonly string[]): string {
  return filePaths.map((path) => fileReference(projectDir, path)).join('')
}
