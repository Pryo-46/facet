/**
 * 種別 enum の日本語ラベル（UI 層だけの対応表）。
 * データ・スキーマは英語 enum のまま——JSON は AI との交換形式であり、
 * 表示名は人間向けの都合だから（rev 3章・4章）。
 * enum を拡張したらここにも足す。足し忘れはテストが検出する。
 */
export const KIND_LABELS: Record<string, string> = {
  actor: 'アクター',
  state: '状態',
  event: 'イベント',
  screen: '画面',
  data: 'データ',
  other: 'その他',
  // Markdown 出力の見出し「### 未分類」と表記を揃える
  undecided: '未分類',
}

/** ラベルの無い値（将来の enum 拡張）は生値をそのまま返す */
export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}
