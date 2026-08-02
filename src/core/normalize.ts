/**
 * 照合用の文字正規化（rev 5章）: NFKC ＋ 英字大文字小文字同一視のみ。
 * カナ同一視・送り仮名吸収はしない——恣意性が入るため、必要な表現は
 * alias に登録する運用に倒す（判断をアルゴリズムでなくデータに置く）。
 * name 重複判定と alias 照合はこの同じ規則を使うこと（規則を分けない）。
 */
export function normalizeForMatch(s: string): string {
  return s.normalize('NFKC').toLowerCase()
}
