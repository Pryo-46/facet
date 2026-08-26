import type { MissingTally } from '@/core/missing-tally'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { poseQuestions, readSlot, type AnswerPath } from './questions'

/** 数える順（QUESTION_ORDER と同じ failed → unknown → ifExecuted） */
const PATHS: readonly AnswerPath[] = ['failed', 'unknown', 'ifExecuted']

/**
 * シーケンスの欠落（M22。docs/missing-semantics.md 決定1）。
 *
 * 未回答＝**立っている問い**に decision が無い（reading-guide:「未回答」）。
 * 立っていない問いへの答え（種別切替の残骸）は数えない——整合性検証が
 * unposed-answer として別に指摘する軸であり、欠落ではない。
 * 未記入＝アクターの name／ステップの label が空（出力が（未定義）と書く2箇所。
 * reading-guide には M22 で追記した）。
 *
 * handled / notApplicable は欠落ではないが総量の把握に要るので添えて返す
 * （notApplicable は「考慮しなくてよいと**決めた**」＝確定。未回答とは別物）
 */
export function tallySequenceMissing(data: SequenceSchemaVersion1): {
  missing: MissingTally
  handled: number
  notApplicable: number
} {
  let unanswered = 0
  let handled = 0
  let notApplicable = 0
  for (const step of data.steps) {
    const posed = poseQuestions(step)
    for (const path of PATHS) {
      if (!posed[path]) continue
      const decision = readSlot(step, path).decision
      if (decision === 'handled') handled += 1
      else if (decision === 'notApplicable') notApplicable += 1
      else unanswered += 1
    }
  }
  const blank =
    data.actors.filter((a) => a.name === '').length +
    data.steps.filter((s) => s.label === '').length
  const parts = [
    { kind: 'unanswered', label: '未回答', count: unanswered, variant: 'open' as const },
    { kind: 'blank', label: '未記入', count: blank, variant: 'open' as const },
  ].filter((p) => p.count > 0)
  return { missing: { total: unanswered + blank, parts }, handled, notApplicable }
}
