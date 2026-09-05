import { useEffect } from 'react'
import type { VisibleRows } from '@/core/table-export'

/**
 * 画面に出ている行を額縁へ知らせる（用語集とエラーカタログが使う）。
 *
 * **依存にプリミティブな文字列を置く。** 表示中の index 配列は毎レンダー
 * 新しい配列なので、そのまま依存にすると毎レンダー報告が走る。ID を連ねた
 * 文字列なら、絞り込みの結果が実際に変わったときだけ再実行される。
 *
 * **ID を渡すのが要点である。** この報告は `useEffect` を経由するので1フレーム
 * 古くなりうる。index（添字）を渡すと、行を削除した直後の古い添字が別の行を
 * 指し、間違った内容が黙って出る。ID なら、消えた ID は一致せず落ちるだけで、
 * **間違った行の内容が出ることは原理的にない**。
 *
 * **2ツールで同じ実装を持たない**（rev 10章の実装規約）。片方だけ直したときに
 * 黙ってずれる経路を作らないため、`useListRows` / `useColumnResize` と同じく
 * 共通フックとして1本に保つ
 */
export function useVisibleIdsReport(
  /** 表示中の行の ID。**絞り込みが無い状態では null**（額縁は全件として扱う） */
  ids: readonly string[] | null,
  /** ファイル内の全行数。トーストの「42 件中 3 件」に使う */
  total: number,
  onVisibleIds: ((ids: VisibleRows, total: number) => void) | undefined,
): void {
  const key = ids === null ? null : ids.join('\u0000')
  useEffect(() => {
    onVisibleIds?.(
      // **0件は空集合であって「絞り込みなし」ではない。** `''.split()` は
      // 空文字1個の配列になるので、ここで分けないと存在しない ID を1件持つ集合になる
      key === null ? null : new Set(key === '' ? [] : key.split('\u0000')),
      total,
    )
  }, [onVisibleIds, key, total])
}
