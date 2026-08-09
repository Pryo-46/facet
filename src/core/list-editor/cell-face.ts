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

/** セルの面。'error' が最も強く、'warn' がそれに次ぐ。'none' は面を塗らない */
export type CellFace = 'error' | 'warn' | 'none'

/**
 * セルの面を決める。**エラーは warning より強いので優先する。**
 * 定義セル・種別セルも見る——見ていないと、これらを指す検証ルールが
 * 増えた時点で「issue 一覧には出るのにセルが赤くならない」になる
 * （M8 でつぶした残件2）。いまは該当ルールが無いので到達しない。
 *
 * **行全体がエラー（field 'id'）のときはセルの面を塗らない。** 同じ半透明を
 * 二重に重ねると検証済みの濃さ（warning/20）より濃くなり、コントラストが
 * palette.test.ts の検証範囲の外へ出る。ID 重複と名称重複が同時に
 * 起きた行で実際に発生する組み合わせである
 */
export function cellFace(
  marks: ErrorMarks,
  index: number,
  field: string,
  warn = false,
): CellFace {
  if (hasError(marks, index, 'id')) return 'none'
  if (hasError(marks, index, field)) return 'error'
  return warn ? 'warn' : 'none'
}
