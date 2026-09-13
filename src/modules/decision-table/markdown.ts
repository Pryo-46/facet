import type { ConsistencyIssue } from '@/core/consistency'
import { dividerRow, documentHeading, escapeCell, row } from '@/core/markdown-table'
import { UNDEFINED_TEXT } from '@/core/output-labels'
import { DEFAULT_TABLE_OPTIONS, type TableOptions, type VisibleRows } from '@/core/table-export'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import {
  CHOICE_LABEL,
  CONDITION_NAME_LABEL,
  NO_COLUMN_LABEL,
  OUTCOME_NAME_LABEL,
  VALUE_LABEL,
} from './labels'
import { decisionTableToTable } from './table'

/**
 * デシジョンテーブルの Markdown 出力（モジュール規約5）。
 *
 * - **h1 は使わない**（NotePM のページタイトルと階層が衝突する）。`title` が h2、
 *   `条件`・`結果`・`判定表` の3節が h3
 * - 3節は空でも見出しと列見出しを出す。節の有無が中身で変わると、Git 上で無意味な差分になる
 * - 空欄は `（未定義）`、起こりえない行の結果列は `起こりえない` と書く（rev 8章。
 *   負債を出力にも残す）
 * - **絞り込みは判定表にだけ効く。** 条件と結果の節は定義で、No も定義部の行の番号である
 */

/**
 * 判定表の設定。**No と（未定義）を必ず出す**——Markdown 出力には設定のダイアログが
 * 無く、他ツールの Markdown も No と（未定義）を常に書く
 */
const MARKDOWN_TABLE_OPTIONS: TableOptions = {
  ...DEFAULT_TABLE_OPTIONS,
  numbering: true,
  showUndefined: true,
}

/** 見出しとセルをエスケープして表に組む。エスケープは全セルに一律に掛ける */
function markdownTable(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    row(header.map(escapeCell)),
    dividerRow(header.length),
    ...rows.map((cells) => row(cells.map(escapeCell))),
  ].join('\n')
}

const filled = (text: string): string => (text === '' ? UNDEFINED_TEXT : text)

/**
 * 値ラベル・選択肢ラベルを1セルに収める。用語集の別名と同じく読点で連ねる。
 * **ラベルを1つも持たない条件は空のセルにする**——空の配列は決定1の欠落に無い
 */
const labelList = (labels: readonly string[]): string => labels.map(filled).join('、')

export function decisionTableToMarkdown(
  data: DecisionTableSchemaVersion1,
  visible?: VisibleRows,
): string {
  const conditions = markdownTable(
    [NO_COLUMN_LABEL, CONDITION_NAME_LABEL, VALUE_LABEL],
    data.conditions.map((c, i) => [String(i + 1), filled(c.name), labelList(c.values)]),
  )
  const outcomes = markdownTable(
    [NO_COLUMN_LABEL, OUTCOME_NAME_LABEL, CHOICE_LABEL],
    data.outcomes.map((o, i) => [String(i + 1), filled(o.name), labelList(o.choices)]),
  )
  const judgement = decisionTableToTable(data, MARKDOWN_TABLE_OPTIONS, visible)
  const blocks = [
    documentHeading(data.title),
    '### 条件',
    conditions,
    '### 結果',
    outcomes,
    '### 判定表',
    markdownTable(judgement.header, judgement.rows),
  ]
  return `${blocks.join('\n\n')}\n`
}

/**
 * 整合性エラーがあるまま出力したとき、出力に何が起きるかの文
 *（`OutputProfile.describeIssueEffect`）。額縁の確認ダイアログが出す。
 *
 * **行の形を壊す2つの指摘にだけ固有の文を返す。** `row-set` は欠け・余り・順序違いが
 * そのまま出力に出る。直積から抜けた組み合わせは判定表から消える。`row-length` は
 * 足りない欄を埋め、余った欄を落として出す。重複や未知の値は表の形を壊さないので、
 * 触れると読み手に空振りをさせる
 */
export function describeDecisionTableIssueEffect(issues: readonly ConsistencyIssue[]): string {
  const effects: string[] = []
  if (issues.some((i) => i.rule === 'row-set')) {
    effects.push('判定表にはファイルにある行をその順のまま並べ、直積から欠けた組み合わせは現れません。')
  }
  if (issues.some((i) => i.rule === 'row-length')) {
    effects.push(
      `列数の合わない行は、足りない欄を${UNDEFINED_TEXT}で埋め、余った欄を落として出します。`,
    )
  }
  if (effects.length === 0) return 'このまま出力すると、指摘のある箇所もそのまま表に出ます。'
  return `このまま出力すると、${effects.join('')}`
}
