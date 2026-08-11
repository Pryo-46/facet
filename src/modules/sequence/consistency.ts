import type { ConsistencyIssue, ConsistencyLocation } from '@/core/consistency'
import type { SequenceSchemaVersion1, SequenceStep } from '@/types/sequence'
import { poseQuestions, presentAnswers, type AnswerPath } from './questions'

const KIND_LABEL: Record<SequenceStep['kind'], string> = {
  call: '呼出',
  reply: '応答',
  self: '内部処理',
}

const PATH_LABEL: Record<AnswerPath, string> = {
  failed: '失敗確定',
  unknown: '結果不明',
  ifExecuted: '実行済みだったら',
}

/** ステップを人が特定できる呼び名（#位置 ＋ 文言があれば文言） */
function stepName(step: SequenceStep, index: number): string {
  return step.label === '' ? `#${index + 1}` : `#${index + 1}（${step.label}）`
}

function dupLocations(items: readonly { id: string }[], field: string): Map<string, ConsistencyLocation[]> {
  const byId = new Map<string, ConsistencyLocation[]>()
  items.forEach((item, index) => {
    const list = byId.get(item.id) ?? []
    list.push({ entityId: item.id, entityIndex: index, field })
    byId.set(item.id, list)
  })
  return byId
}

/**
 * 整合性検証（レベル2＝受け入れて赤表示。design-notes 論点10）。
 * エラー文言は「どの属性のせいか」まで言う——「ID が重複しています」だけでは
 * 直し方が読めない、という logic-tree M1 の教訓（ID 重複と木の形の項）の適用。
 *
 * location の entityId はプレフィクス（actor_ / step_）でどの配列の話かを
 * 見分ける——ConsistencyLocation は配列を1つしか想定していないため、
 * 2配列を持つ本モジュールはこの規約でエディタと通じ合う
 */
export function checkSequenceConsistency(data: SequenceSchemaVersion1): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []

  // ID 重複（actor / step それぞれ。1つの id につき1指摘・全行を指す）
  for (const [label, items] of [
    ['参加者', data.actors],
    ['ステップ', data.steps],
  ] as const) {
    for (const [id, locations] of dupLocations(items, 'id')) {
      if (locations.length > 1) {
        issues.push({
          rule: 'duplicate-id',
          message: `${label}の ID が重複しています: ${id}`,
          locations,
        })
      }
    }
  }

  const actorIds = new Set(data.actors.map((a) => a.id))

  data.steps.forEach((step, index) => {
    // 参照切れ（from / to）
    for (const field of ['from', 'to'] as const) {
      const ref = step[field]
      if (ref !== undefined && !actorIds.has(ref)) {
        issues.push({
          rule: 'missing-actor',
          message: `${stepName(step, index)} の ${field} が指す参加者が存在しません: ${ref}`,
          locations: [{ entityId: step.id, entityIndex: index, field }],
        })
      }
    }

    // to の有無と kind の食い違い
    if (step.kind === 'self' && step.to !== undefined) {
      issues.push({
        rule: 'to-mismatch',
        message: `${stepName(step, index)} は内部処理（self）なのに to を持っています。内部処理は from だけで表します`,
        locations: [{ entityId: step.id, entityIndex: index, field: 'to' }],
      })
    }
    if (step.kind !== 'self' && step.to === undefined) {
      issues.push({
        rule: 'to-mismatch',
        message: `${stepName(step, index)} は${KIND_LABEL[step.kind]}なのに to（受け手）がありません`,
        locations: [{ entityId: step.id, entityIndex: index, field: 'to' }],
      })
    }

    // from == to の呼出／応答は矢印が引けず、ラベルだけが宙に浮く。
    // self への変更を促す（ブレスト決定8）。参照切れのときは出さない
    //（まず missing-actor を直すべきで、重ねると三重指摘のノイズになる）
    if (step.kind !== 'self' && step.to !== undefined && step.to === step.from && actorIds.has(step.from)) {
      issues.push({
        rule: 'self-call',
        message: `${stepName(step, index)} の from と to が同じ参加者を指しています。自分への処理は形を「内部処理」（self）に変えて表します`,
        locations: [{ entityId: step.id, entityIndex: index, field: 'shape' }],
      })
    }

    // 立っていない問いへの答え
    if (step.failures !== undefined) {
      const posed = poseQuestions(step)
      const present = presentAnswers(step)
      for (const path of present) {
        if (posed[path]) continue
        const reason =
          step.kind === 'reply'
            ? '応答には問いが立ちません（応答の失敗は対の呼出側の「結果不明」が扱います）'
            : step.kind === 'self'
              ? '内部処理に立つ問いは「失敗確定」だけです'
              : `awaitsReply: false（投げっぱなし）の呼出に立つ問いは「結果不明」だけです`
        issues.push({
          rule: 'unposed-answer',
          message: `${stepName(step, index)} に「${PATH_LABEL[path]}」の答えがありますが、${reason}`,
          locations: [{ entityId: step.id, entityIndex: index, field: 'failures' }],
        })
      }
    }
  })

  return issues
}
