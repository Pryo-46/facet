import type { ConsistencyIssue } from '../consistency'

/** 配列位置 → 赤表示するフィールド集合 */
export type ErrorMarks = Map<number, Set<string>>

/**
 * issues の locations から「配列位置 → 赤表示するフィールド集合」を組み立てる。
 *
 * **entityIndex で引き、entityId では引かない。** ID 重複ファイルを受け入れる
 * 以上 entityId は行を一意に指せない。entityId で引くと、同じ ID を持つ
 * 全行へマークが波及してしまう（M2 の申し送り）。
 * field 'id' は ID 列が UI に無いため行全体の赤表示として扱う
 */
export function buildErrorMarks(issues: readonly ConsistencyIssue[]): ErrorMarks {
  const marks: ErrorMarks = new Map()
  for (const issue of issues) {
    for (const loc of issue.locations) {
      if (loc.entityIndex === null) continue
      const set = marks.get(loc.entityIndex) ?? new Set<string>()
      if (loc.field !== null) set.add(loc.field)
      marks.set(loc.entityIndex, set)
    }
  }
  return marks
}

/** 指定した行・フィールドがエラーとしてマークされているか。field 'id' は行全体を指す */
export function hasError(marks: ErrorMarks, index: number, field: string): boolean {
  return marks.get(index)?.has(field) ?? false
}

/** セルの面。'error' が最も強く、'warn' がそれに次ぐ。'none' は輪郭を引かない */
export type CellFace = 'error' | 'warn' | 'none'

/**
 * セルの面のクラス名（M21）。**淡い面だけ**——無効は `invalid-face`、欠落は
 * `missing-face`（rev 9章 規約2の例外）。
 *
 * 淡い面は M21 の実機確認で足した——1px の輪郭だけでは、テーブルのセルが
 * 方眼と罫線に埋もれて拾えなかった。そのうえで**輪郭は外した**（2026-08-24 の
 * 実機確認）——表の中では輪郭がテーブルの罫線（`border-b border-grid`）と
 * 競合し、情報ではなくノイズになる。欠落と無効の区別は面の色相（黄／赤）が
 * 運ぶ。バッジ（`badge-styles.ts`）は線種が「まだ見ていない／保留」を運ぶので
 * 線を残しており、セルとは扱いが違う。
 *
 * 当てる要素は `<td>`（中の入力欄は `bg-transparent`）
 */
export const CELL_FACE_CLASS: Record<CellFace, string> = {
  error: 'bg-invalid-face',
  warn: 'bg-missing-face',
  none: '',
}

/**
 * セルの面を決める。**エラーは warn より強いので優先する。**
 * 定義セル・種別セルも見る——見ていないと、これらを指す検証ルールが
 * 増えた時点で「issue 一覧には出るのにセルが赤くならない」になる
 * （M8 でつぶした残件2）。いまは該当ルールが無いので到達しない。
 *
 * **行全体の指摘（field 'id'。ID 重複など欄を特定できない指摘）は、行の
 * 先頭セル（`rowAnchor`）に出す。** 行を染めると「この行は全部ダメ」に見え、
 * 問題箇所が特定できない（UI ノート D5）。M8 の「行がエラーならセルは none」
 * は半透明の二重塗りを避けるための規則で、いまは要らない——`CellFace` は
 * 1セルにつき1つしか返せず、淡い面も不透明なので重ね塗りが起きない
 */
export function cellFace(
  marks: ErrorMarks,
  index: number,
  field: string,
  warn = false,
  rowAnchor = false,
): CellFace {
  if (hasError(marks, index, field)) return 'error'
  if (rowAnchor && hasError(marks, index, 'id')) return 'error'
  return warn ? 'warn' : 'none'
}
