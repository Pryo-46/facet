/**
 * 解決レベル enum の日本語ラベル（UI 層だけの対応表）。
 * データ・スキーマは英語 enum のまま——JSON は AI との交換形式であり、
 * 表示名は人間向けの都合だから（rev 3章・4章）。
 * 画面のフィルタボタンと Markdown の h3 見出しで同じラベルを使う。
 * enum を拡張したらここにも足す。足し忘れはテストが検出する。
 */
export const RESOLUTION_LABELS: Record<string, string> = {
  user: 'ユーザー対応',
  support: 'サポート対応',
  engineer: 'エンジニア対応',
  // 検討した上で誰にも解決できない（外部サービス障害・仕様上の制約）。
  // 「復旧不可」とは別物で、案内文は存在する（session-notes 2-3）
  none: '解決不可',
  // 用語集の Markdown 出力の見出し「### 未分類」と表記を揃える
  undecided: '未分類',
}

/** ラベルの無い値（将来の enum 拡張）は生値をそのまま返す */
export function resolutionLabel(level: string): string {
  return RESOLUTION_LABELS[level] ?? level
}
