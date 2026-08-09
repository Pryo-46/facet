/**
 * 重複の検出（全ツール共通・コア）。
 *
 * **正規化規則はここで決めず、呼び出し側が `keyOf` に入れる。** ID の重複は
 * 正規化なしの完全一致（ID は機械的識別子）、名称・別名の重複は
 * `normalizeForMatch` 経由——同じ関数から呼び分けられなければならない。
 * コアが正規化を強制すると、ID の重複判定が NFKC 正規化の影響を受けるという
 * 意味不明な挙動になる。
 *
 * **返すのは配列位置であって ID ではない。** ID 重複ファイルを「受け入れて
 * 赤表示」する以上、ID では行を一意に指せない（rev 5章）
 */

/** 鍵ごとの配列位置。キーは初出順、値は昇順。要素1個のグループも含む */
export function groupByKey<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): Map<string, number[]> {
  const out = new Map<string, number[]>()
  items.forEach((item, index) => {
    const key = keyOf(item)
    const group = out.get(key)
    if (group === undefined) out.set(key, [index])
    else group.push(index)
  })
  return out
}

/** `groupByKey` のうち、要素が2個以上のものだけ。順序は `groupByKey` に従う */
export function findDuplicates<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const [key, indices] of groupByKey(items, keyOf)) {
    if (indices.length > 1) out.set(key, indices)
  }
  return out
}
