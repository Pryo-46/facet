import type { SequenceStep } from '@/types/sequence'

/**
 * 問いの導出（design-notes 論点3。このツールの心臓部）。
 *
 * 問いは「原因」ではなく「呼び手の知識状態」に立てる。知識状態は
 * 成功（＝図が担当）／失敗確定（failed）／結果不明（unknown、内に
 * ifExecuted）の3つで閉じており、原因（エラー応答・接続不能・
 * タイムアウト等）は答えの text に書き分ける。
 *
 * **この導出をユーザー・ツール設定・ステップ側の宣言で変えられるように
 * してはならない**——類型が可変になった瞬間、「問いのセットが完成して
 * いるか」をツールが判定できなくなり、網羅の担保が消える。
 */
export type AnswerPath = 'failed' | 'unknown' | 'ifExecuted'

export interface PosedQuestions {
  failed: boolean
  unknown: boolean
  ifExecuted: boolean
}

type StepShape = Pick<SequenceStep, 'kind' | 'awaitsReply'>

export function poseQuestions(step: StepShape): PosedQuestions {
  switch (step.kind) {
    case 'self':
      // 実行者自身に「結果不明」は無い（自分の失敗は直接観測できる）
      return { failed: true, unknown: false, ifExecuted: false }
    case 'reply':
      // 応答の失敗は対の呼出側の unknown / failed が既に問うている。
      // ここにも立てると同じ考慮を2箇所に書かせる（二重計上）
      return { failed: false, unknown: false, ifExecuted: false }
    case 'call':
      // awaitsReply はスキーマ上 call で必須だが、外部データでは欠けうる。
      // 欠けていたら true 扱い＝問いを多く立てる安全側に倒す
      if (step.awaitsReply === false) {
        // 投げっぱなし: 応答を観測しないので知識状態は常に「不明」一色。
        // 未実行こそがリスクなので ifExecuted（実行済みだったら）は立たない
        return { failed: false, unknown: true, ifExecuted: false }
      }
      return { failed: true, unknown: true, ifExecuted: true }
  }
}

export interface QuestionLabels {
  failed: string
  unknown: string
  ifExecuted: string
}

/** ガターに出す問いの文言。キーは共通・文言だけ種別で変える */
export function questionLabels(step: StepShape): QuestionLabels {
  if (step.kind === 'self') {
    return { failed: '処理失敗したら？', unknown: '', ifExecuted: '' }
  }
  if (step.kind === 'reply') {
    // reply に問いは立たない（poseQuestions と対応）。空文字は「表示するラベルが無い」の意
    return { failed: '', unknown: '', ifExecuted: '' }
  }
  if (step.kind === 'call' && step.awaitsReply === false) {
    return { failed: '', unknown: '届かなかったかもしれない。それでよいか？', ifExecuted: '' }
  }
  return {
    failed: '失敗が確定したら？',
    unknown: '結果不明だったら？',
    ifExecuted: '実行済みだったら？',
  }
}
