/**
 * 新規ファイルの名前解決（コア・純関数）。
 * ファイル名は識別子ではない（rev 5章。判別は中身の type で行う）ため、
 * ここでの目的は「意味を持たせること」ではなく「既存と衝突しないこと」だけ。
 * 人間が後からエクスプローラで自由にリネームしてよい。
 */

/** Windows で使えない文字。macOS/Linux でも避けて構わないので一律で落とす */
const ILLEGAL = /[\\/:*?"<>|]/g

export function resolveNewFileName(baseName: string, existing: readonly string[]): string {
  const base = baseName.replace(ILLEGAL, '_')
  // Windows のファイル名は大文字小文字を区別しないので、比較も区別しない
  const taken = new Set(existing.map((n) => n.toLowerCase()))
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${base}.json` : `${base}-${n}.json`
    if (!taken.has(name.toLowerCase())) return name
  }
}
