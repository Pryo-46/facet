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
        // 未実行こそがリスクなので ifExecuted（既に実行されていたら）は立たない
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

/**
 * 答えが「在る」パスの列挙（順序は QUESTION_ORDER と同じ failed → unknown → ifExecuted）。
 * text だけの unknown は数えない（decision があって初めて「答えた」）——
 * consistency.ts の unposed 判定と同一の規則で、判定の正はここ1箇所に置く
 */
export function presentAnswers(step: Pick<SequenceStep, 'failures'>): AnswerPath[] {
  const f = step.failures
  if (f === undefined) return []
  const present: AnswerPath[] = []
  if (f.failed !== undefined) present.push('failed')
  if (f.unknown?.decision !== undefined) present.push('unknown')
  if (f.unknown?.ifExecuted !== undefined) present.push('ifExecuted')
  return present
}

/** 在るのに問いが立っていない答え（種別切替の残骸）。ガターのグレースロットと整合性検証が使う */
export function unposedAnswers(step: SequenceStep): AnswerPath[] {
  const posed = poseQuestions(step)
  return presentAnswers(step).filter((path) => !posed[path])
}

/**
 * ガターに出す問いの文言。キーは共通・文言だけ種別で変える。
 *
 * **主語はステップの種別が務める**——内部処理なら「処理が」、呼出なら「呼出が」。
 * 主語の無いステータスラベルを疑問文にしただけの文言（`処理失敗したら？`
 * `失敗が確定したら？`）は日本語として不自然で、何を書けばよいかも伝わらない
 * ため、M28 で言い直した。抽象度は変えていない——具体の場面は
 * `questionHints` が title 属性で添える。
 *
 * **短く保つこと。** ガターの問いラベル列は `QUESTION_LABEL_WIDTH` 固定で、
 * 収まらない問いは折り返してその行だけ行高を押し上げる（読みにくさの実測）。
 * 列幅は「いま立つ問いが1行に収まる」ように採ってあるので、伸ばすなら
 * layout.ts の側も一緒に見ること（`questions.test.ts` が下限を検算している）
 */
export function questionLabels(step: StepShape): QuestionLabels {
  if (step.kind === 'self') {
    return { failed: '処理が失敗したら？', unknown: '', ifExecuted: '' }
  }
  if (step.kind === 'reply') {
    // reply に問いは立たない（poseQuestions と対応）。空文字は「表示するラベルが無い」の意
    return { failed: '', unknown: '', ifExecuted: '' }
  }
  if (step.kind === 'call' && step.awaitsReply === false) {
    return { failed: '', unknown: '応答が届かなくてもよいか？', ifExecuted: '' }
  }
  return {
    // 「確定」を落としても、直下に「結果がわからなかったら？」が並ぶことで
    // 対比的に「わかっている失敗」と読める
    failed: '呼出が失敗したら？',
    unknown: '結果がわからなかったら？',
    // `└ ` の接頭とインデントが下位問いであることを示すので主語は要らない
    ifExecuted: '既に実行されていたら？',
  }
}

/**
 * 問いのツールチップ（`title` 属性で出す具体例）。**キーは questionLabels と同じ**で、
 * 立つ問いにだけ文面があり、立たない問いは空文字である（`questions.test.ts` が
 * `poseQuestions` との一致を検算している）。
 *
 * ラベル本体を抽象のまま保てるのはこの関数があるからである——問いは「原因」ではなく
 * 知識状態に立てる（上の導出の注記）ので、ラベルに原因を書くと類型が壊れる。
 * **原因の例示はここでだけ行い、ラベルには持ち込まない。**
 *
 * 戻り値を questionLabels に混ぜず別関数にしているのは、ラベルの型を変えると
 * 呼び出し側（描画・測定・ゴーストスロット）が全部動くため。ヒントは画面専用で、
 * 出力（Markdown / Mermaid）には現れない
 */
export function questionHints(step: StepShape): QuestionLabels {
  if (step.kind === 'self') {
    return {
      failed: '処理中の例外やバリデーション失敗など、処理が正常に完了しなかったケース',
      unknown: '',
      ifExecuted: '',
    }
  }
  if (step.kind === 'reply') {
    return { failed: '', unknown: '', ifExecuted: '' }
  }
  if (step.kind === 'call' && step.awaitsReply === false) {
    return {
      failed: '',
      unknown: '投げっぱなしの呼出で、メッセージが届かなくても業務が成り立つか',
      ifExecuted: '',
    }
  }
  return {
    failed: 'エラー応答、バリデーション失敗、接続拒否など、失敗したことがはっきりわかるケース',
    unknown: 'タイムアウト、応答が返ってこないなど、成功したか失敗したかわからないケース',
    ifExecuted: '相手側では処理が済んでいるかもしれないケース。リトライで二重実行にならないか',
  }
}

/**
 * 答えスロット1つの読み出し。`unknown` は下位の `ifExecuted` を内包する形なので
 * 素直なプロパティアクセスにならない——その差を吸収するのがこの関数の仕事。
 *
 * **読み方の正はここ1箇所。** かつては commands.ts に置き、SequenceEditor.tsx が
 * ローカルに複製していた（M2 の申し送りの既知の負債）。`npm run gen:skills` が
 * このファイルを `.mjs` へ変換して sequence-register へ同梱するため、
 * 値 import を持たないこのファイルへ集約した
 */
export function readSlot(
  step: Pick<SequenceStep, 'failures'>,
  path: AnswerPath,
): { decision?: 'handled' | 'notApplicable'; text?: string } {
  if (path === 'failed') return step.failures?.failed ?? {}
  if (path === 'unknown') {
    const u = step.failures?.unknown
    return u === undefined ? {} : { decision: u.decision, text: u.text }
  }
  return step.failures?.unknown?.ifExecuted ?? {}
}
