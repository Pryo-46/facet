/**
 * 貼り付けテキストを別名に割る。区切りは改行とタブだけ——
 * 別名パネルは1行＝1別名なので区切り文字を打つ必要が無く、
 * 読点や全角カンマで割ると別名そのものに含まれる読点を壊す
 */
export function splitPastedAliases(text: string): string[] {
  return text
    .split(/[\r\n\t]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
}
