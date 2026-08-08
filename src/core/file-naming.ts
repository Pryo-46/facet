/**
 * 新規ファイルの名前解決（コア・純ロジック）。
 * ファイル名は識別子ではない（rev 5章。判別は中身の type で行う）ため、
 * ここでの目的は「意味を持たせること」ではなく「既存と衝突しないこと」だけ。
 * 人間が後からエクスプローラで自由にリネームしてよい。
 */

/** Windows で使えない文字。macOS/Linux でも避けて構わないので一律で落とす */
const ILLEGAL = /[\\/:*?"<>|]/g

/** 打ち切り回数。ディスクへの問い合わせを含むので無限には試さない */
export const MAX_NAME_CANDIDATES = 100

/** n 番目の候補名（1件目は連番なし）。連番の付け方をここ1箇所に閉じる */
export function fileNameCandidate(baseName: string, n: number): string {
  const base = baseName.replace(ILLEGAL, '_')
  return n === 1 ? `${base}.json` : `${base}-${n}.json`
}

/**
 * 空いているファイル名を1つ返す。
 *
 * **`isTaken` にはディスクへの問い合わせを含めること。** 走査時のスナップショット
 * だけで決めると、走査後に外部で増えたファイル（Skill が書いた用語集など）を
 * 黙って上書きする——確認もエラーも出さずに他人のファイルを消す経路になる
 * （申し送り10節のデータ喪失）。判定が非同期なので、この関数自体も非同期
 */
export async function resolveAvailableFileName(
  baseName: string,
  isTaken: (name: string) => boolean | Promise<boolean>,
): Promise<string> {
  for (let n = 1; n <= MAX_NAME_CANDIDATES; n++) {
    const name = fileNameCandidate(baseName, n)
    if (!(await isTaken(name))) return name
  }
  throw new Error(
    `ファイル名の候補が尽きました（${MAX_NAME_CANDIDATES} 件試行）: ${baseName}`,
  )
}
