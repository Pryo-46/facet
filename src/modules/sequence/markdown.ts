import type { ConsistencyIssue } from '@/core/consistency'
import { dividerRow, documentHeading, escapeCell, row } from '@/core/markdown-table'
import type { SequenceSchemaVersion1, SequenceStep } from '@/types/sequence'
import { sequenceToMermaid } from './mermaid'
import {
  NOT_APPLICABLE_LABEL,
  TABLE_HEADERS,
  UNDEFINED_VALUE,
  UNRESOLVED_ACTOR_LABEL,
} from './output-labels'
import { poseQuestions, readSlot, type AnswerPath } from './questions'

/**
 * シーケンスの Markdown 出力（モジュール規約5。design-notes 論点11）。
 *
 * **プロファイルは1本で、図と表を縦に並べる。** rev 6章のプロファイルは
 * 「読み手による出し分け」の軸であり、形式（図／表）の軸を混ぜると、
 * 後から読み手の軸が要るときに掛け算になる。1本にまとめることで、
 * `No` で図と表を突き合わせられる利点もある。
 *
 * - **h1 は使わない**（NotePM のページタイトルと階層が衝突する）。`title` が h2
 * - 空フィールドは `（未定義）`。**仕様書に貼った瞬間に未定義が見えなくなるのは
 *   文章仕様書の悪癖の再生産である**（rev 5章。用語集・エラーカタログと同じ規約）
 */

/** 表の列（No を除く）の並び。TABLE_HEADERS の 3番目以降と1対1で対応する */
const ANSWER_COLUMNS: readonly AnswerPath[] = ['failed', 'unknown', 'ifExecuted']

/** アクターの表示名。引けなければ（未解決）、名前が空なら（未定義） */
function actorLabel(data: SequenceSchemaVersion1, ref: string | undefined): string {
  const actor = ref === undefined ? undefined : data.actors.find((a) => a.id === ref)
  if (actor === undefined) return UNRESOLVED_ACTOR_LABEL
  return actor.name === '' ? UNDEFINED_VALUE : escapeCell(actor.name)
}

/** from → to 列。self は宛先を持たないので「名前（内部処理）」と書く */
function routeCell(data: SequenceSchemaVersion1, step: SequenceStep): string {
  if (step.kind === 'self') return `${actorLabel(data, step.from)}（内部処理）`
  return `${actorLabel(data, step.from)} → ${actorLabel(data, step.to)}`
}

/**
 * 答えの1セル。**4状態を書き分ける**:
 * 問いが立っていない＝空セル／未回答＝（未定義）／notApplicable＝考慮不要／
 * handled＝本文。
 *
 * 空セルにするのは、人が判断したセルには必ず何かが入るからで、空白が自動的に
 * 「ここは問われていない」の意になる。**人が決めた**（`考慮不要`）と
 * **ツールが問わない**（空セル）の境は、語そのものが分ける——記号1つでは
 * 境が伝わらない
 */
function answerCell(step: SequenceStep, path: AnswerPath): string {
  if (!poseQuestions(step)[path]) return ''
  const slot = readSlot(step, path)
  if (slot.decision === undefined) return UNDEFINED_VALUE
  if (slot.decision === 'notApplicable') {
    return slot.text === undefined || slot.text === ''
      ? NOT_APPLICABLE_LABEL
      : `${NOT_APPLICABLE_LABEL}（${escapeCell(slot.text)}）`
  }
  return slot.text === undefined || slot.text === '' ? UNDEFINED_VALUE : escapeCell(slot.text)
}

export function sequenceToMarkdown(data: SequenceSchemaVersion1): string {
  const rows = data.steps.map((step, index) =>
    row([
      // **No はデータ配列の位置（index + 1）。** 画面のガターの行見出し `#N` と
      // 一致させる——会議で「3番の結果不明が空だ」と口頭で指すための目印
      `${index + 1}`,
      routeCell(data, step),
      step.label === '' ? UNDEFINED_VALUE : escapeCell(step.label),
      ...ANSWER_COLUMNS.map((path) => answerCell(step, path)),
    ]),
  )
  const table = [row(TABLE_HEADERS), dividerRow(TABLE_HEADERS.length), ...rows].join('\n')
  const diagram = ['```mermaid', sequenceToMermaid(data), '```'].join('\n')
  return `${documentHeading(data.title)}\n\n${diagram}\n\n${table}\n`
}

/**
 * 整合性エラーがあるまま出力したとき、出力に何が起きるかの1文
 *（`OutputProfile.describeIssueEffect`）。額縁の確認ダイアログが出す。
 *
 * **参照に関わる指摘があるときだけ（未解決）に触れる。** ID 重複や
 * unposed-answer は図の宛先を壊さないので、触れると読み手に空振りをさせる
 */
export function describeSequenceIssueEffect(issues: readonly ConsistencyIssue[]): string {
  const breaksRoute = issues.some((i) => i.rule === 'missing-actor' || i.rule === 'to-mismatch')
  if (!breaksRoute) {
    return 'このまま出力すると、指摘のある箇所もそのまま図と表に出ます。'
  }
  return 'このまま出力すると、図には「（未解決）」というアクターが立ち、宛先を引けない矢印はそこへ向きます。表には全行がそのまま出ます。'
}
