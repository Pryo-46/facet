/**
 * 行の同一性キー。React の key と、赤表示・フォーカス移動の対応づけに使う。
 *
 * ID 重複ファイルを「受け入れて赤表示」する以上 id 単体では一意にならず、
 * 配列 index は並び替えで行の同一性が保てない。出現順で曖昧さだけを解消する
 *（ID が一意なら常に同じキーになる）。データから毎回導出できるので、
 * 履歴・外部変更と食い違う内部状態を持たない
 */
export function computeRowKeys(items: readonly { id: string }[]): string[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const n = seen.get(item.id) ?? 0
    seen.set(item.id, n + 1)
    return `${item.id}#${n}`
  })
}
