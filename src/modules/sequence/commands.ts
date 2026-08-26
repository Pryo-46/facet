import { insertAt, moveItem, removeAt } from '@/core/list-ops'
import { newId } from '@/core/new-id'
import type { SequenceActor, SequenceSchemaVersion1, SequenceStep } from '@/types/sequence'
import { readSlot, type AnswerPath } from './questions'

export interface SeqFocus {
  kind: 'actor' | 'step'
  index: number
}

export interface SeqEditResult {
  data: SequenceSchemaVersion1
  focus: SeqFocus | null
}

function withActors(d: SequenceSchemaVersion1, actors: SequenceActor[]): SequenceSchemaVersion1 {
  return { ...d, actors }
}

function withSteps(d: SequenceSchemaVersion1, steps: SequenceStep[]): SequenceSchemaVersion1 {
  return { ...d, steps }
}

function replaceStep(
  d: SequenceSchemaVersion1,
  index: number,
  step: SequenceStep,
): SequenceSchemaVersion1 {
  const steps = [...d.steps]
  steps[index] = step
  return withSteps(d, steps)
}

// ---- 参加者 ----

export function addFirstActor(d: SequenceSchemaVersion1): SeqEditResult {
  const actors = [...d.actors, { id: newId('actor'), name: '' }]
  return { data: withActors(d, actors), focus: { kind: 'actor', index: actors.length - 1 } }
}

export function addActorAfter(d: SequenceSchemaVersion1, index: number): SeqEditResult {
  if (d.actors[index] === undefined) return { data: d, focus: null }
  const actors = insertAt(d.actors, index + 1, { id: newId('actor'), name: '' })
  return { data: withActors(d, actors), focus: { kind: 'actor', index: index + 1 } }
}

/**
 * 参加者だけ消す。参照しているステップは触らない——参照切れは整合性検証が
 * 赤表示する（「問題は防ぐものではなく赤く見せるもの」。rev 5章の用語削除と同じ）
 */
export function removeActor(d: SequenceSchemaVersion1, index: number): SeqEditResult {
  if (d.actors[index] === undefined) return { data: d, focus: null }
  const actors = removeAt(d.actors, index)
  // 行き先は削除前の位置で決める: 前の項目 → （先頭なら）次の項目 → 無し（removeStep と同じ規則）
  const at = Math.min(Math.max(index - 1, 0), actors.length - 1)
  return {
    data: withActors(d, actors),
    focus: at < 0 ? null : { kind: 'actor', index: at },
  }
}

export function moveActor(d: SequenceSchemaVersion1, index: number, delta: -1 | 1): SeqEditResult {
  const to = index + delta
  const moved = moveItem(d.actors, index, to)
  const changed = moved.some((a, i) => a !== d.actors[i])
  return changed
    ? { data: withActors(d, moved), focus: { kind: 'actor', index: to } }
    : { data: d, focus: null }
}

export function setActorName(
  d: SequenceSchemaVersion1,
  index: number,
  name: string,
): SequenceSchemaVersion1 {
  if (d.actors[index] === undefined) return d
  const actors = [...d.actors]
  actors[index] = { ...actors[index], name }
  return withActors(d, actors)
}

// ---- ステップ ----

function newStep(from: string, to: string | undefined): SequenceStep {
  const step: SequenceStep = {
    id: newId('step'),
    kind: 'call',
    from,
    label: '',
    awaitsReply: true,
  }
  return to === undefined ? step : { ...step, to }
}

/**
 * Enter＝直後にステップ追加。既定値は「会話の往復」——from は前の to、
 * to は前の from。self（to 無し）の後は from を両方に使う。
 * kind: call ／ awaitsReply: true は最頻値（design-notes 論点9）
 */
export function addStepAfter(d: SequenceSchemaVersion1, index: number): SeqEditResult {
  const prev = d.steps[index]
  if (prev === undefined) return { data: d, focus: null }
  const from = prev.to ?? prev.from
  const to = prev.from
  const steps = insertAt(d.steps, index + 1, newStep(from, to))
  return { data: withSteps(d, steps), focus: { kind: 'step', index: index + 1 } }
}

/** ツールバーの「ステップを追加」。最初の1本の入口でもある */
export function addStepLast(d: SequenceSchemaVersion1): SeqEditResult {
  if (d.steps.length > 0) return addStepAfter(d, d.steps.length - 1)
  const first = d.actors[0]
  if (first === undefined) return { data: d, focus: null }
  const second = d.actors[1] ?? first
  const steps = [...d.steps, newStep(first.id, second.id)]
  return { data: withSteps(d, steps), focus: { kind: 'step', index: 0 } }
}

export function removeStep(d: SequenceSchemaVersion1, index: number): SeqEditResult {
  if (d.steps[index] === undefined) return { data: d, focus: null }
  const steps = removeAt(d.steps, index)
  // 行き先は削除前の位置で決める: 前の行 → （先頭なら）次の行 → 無し
  const at = Math.min(Math.max(index - 1, 0), steps.length - 1)
  return {
    data: withSteps(d, steps),
    focus: steps.length === 0 ? null : { kind: 'step', index: at },
  }
}

export function moveStep(d: SequenceSchemaVersion1, index: number, delta: -1 | 1): SeqEditResult {
  const to = index + delta
  const moved = moveItem(d.steps, index, to)
  const changed = moved.some((s, i) => s !== d.steps[i])
  return changed
    ? { data: withSteps(d, moved), focus: { kind: 'step', index: to } }
    : { data: d, focus: null }
}

export function setStepLabel(
  d: SequenceSchemaVersion1,
  index: number,
  label: string,
): SequenceSchemaVersion1 {
  if (d.steps[index] === undefined) return d
  return replaceStep(d, index, { ...d.steps[index], label })
}

export function setStepActor(
  d: SequenceSchemaVersion1,
  index: number,
  field: 'from' | 'to',
  actorId: string,
): SequenceSchemaVersion1 {
  if (d.steps[index] === undefined) return d
  return replaceStep(d, index, { ...d.steps[index], [field]: actorId })
}

// ---- kind × awaitsReply（画面は1トグル、データは2フィールド） ----

export type StepShapeValue = 'call-sync' | 'call-async' | 'reply' | 'self'

export const STEP_SHAPE_ORDER: readonly StepShapeValue[] = [
  'call-sync',
  'call-async',
  'reply',
  'self',
]

export const STEP_SHAPE_LABEL: Record<StepShapeValue, string> = {
  'call-sync': '呼出',
  'call-async': '呼出（応答なし）',
  reply: '応答',
  self: '内部処理',
}

export function stepShapeOf(step: SequenceStep): StepShapeValue {
  if (step.kind === 'reply') return 'reply'
  if (step.kind === 'self') return 'self'
  return step.awaitsReply === false ? 'call-async' : 'call-sync'
}

/**
 * 形を変える。**failures は消さない**——立たなくなった問いへの答えは
 * unposed-answer の赤表示で残る（ファイルにあるものが黙って減るのが
 * 一番たちが悪い。logic-tree の orderNodes と同じ原則）
 */
export function setStepShape(
  d: SequenceSchemaVersion1,
  index: number,
  shape: StepShapeValue,
): SequenceSchemaVersion1 {
  if (d.steps[index] === undefined) return d
  const { awaitsReply: _aw, to, ...rest } = d.steps[index]
  switch (shape) {
    case 'call-sync':
      return replaceStep(d, index, { ...rest, ...(to === undefined ? {} : { to }), kind: 'call', awaitsReply: true })
    case 'call-async':
      return replaceStep(d, index, { ...rest, ...(to === undefined ? {} : { to }), kind: 'call', awaitsReply: false })
    case 'reply':
      return replaceStep(d, index, { ...rest, ...(to === undefined ? {} : { to }), kind: 'reply' })
    case 'self':
      return replaceStep(d, index, { ...rest, kind: 'self' })
  }
}

// ---- 答えスロット ----

type Failures = NonNullable<SequenceStep['failures']>

/**
 * failures / unknown の空オブジェクトを残さない後片付け。
 * decision も ifExecuted も無くても text だけの unknown はスキーマが許す部分状態
 * （外部/Skill 作成ファイルで到達しうる）——空オブジェクトと誤判定して消さない
 */
function cleanupFailures(step: SequenceStep, failures: Failures): SequenceStep {
  const unknown = failures.unknown
  const cleanedUnknown =
    unknown !== undefined &&
    unknown.decision === undefined &&
    unknown.ifExecuted === undefined &&
    unknown.text === undefined
      ? undefined
      : unknown
  const next: Failures = {}
  if (failures.failed !== undefined) next.failed = failures.failed
  if (cleanedUnknown !== undefined) next.unknown = cleanedUnknown
  const { failures: _old, ...rest } = step
  return Object.keys(next).length === 0 ? rest : { ...rest, failures: next }
}

/**
 * decision/text の緩い形を AnswerSlot（handled は text 必須／notApplicable は
 * text 任意）へ確定させる。notApplicable に text ':'' を持たせない——`??
 * ''` を無条件適用すると空文字の text キーが残り、「キー欠落＝未定義」の
 * 正規表現が崩れる（元ブリーフのコードにあった不具合。テストで検出した）
 */
function buildAnswerSlot(slot: {
  decision: 'handled' | 'notApplicable'
  text?: string
}): { decision: 'handled'; text: string } | { decision: 'notApplicable'; text?: string } {
  if (slot.decision === 'handled') return { decision: 'handled', text: slot.text ?? '' }
  return slot.text === undefined
    ? { decision: 'notApplicable' }
    : { decision: 'notApplicable', text: slot.text }
}

function writeSlot(
  step: SequenceStep,
  path: AnswerPath,
  slot: { decision?: 'handled' | 'notApplicable'; text?: string } | undefined,
): SequenceStep {
  const failures: Failures = { ...(step.failures ?? {}) }
  if (path === 'failed') {
    if (slot === undefined || slot.decision === undefined) delete failures.failed
    else
      failures.failed = buildAnswerSlot({ decision: slot.decision, text: slot.text }) as Failures['failed']
  } else if (path === 'unknown') {
    const prev = failures.unknown ?? {}
    const next = { ...prev }
    if (slot === undefined || slot.decision === undefined) {
      delete next.decision
      delete next.text
    } else {
      next.decision = slot.decision
      if (slot.text === undefined) delete next.text
      else next.text = slot.text
    }
    failures.unknown = next
  } else {
    const prev = failures.unknown ?? {}
    const next = { ...prev }
    if (slot === undefined || slot.decision === undefined) delete next.ifExecuted
    else
      next.ifExecuted = buildAnswerSlot({ decision: slot.decision, text: slot.text }) as NonNullable<
        Failures['unknown']
      >['ifExecuted']
    failures.unknown = next
  }
  return cleanupFailures(step, failures)
}

/**
 * 答えの入力。空でない text ＝ handled（notApplicable の上から打てば handled に
 * 戻る）。空文字＝スロットを未定義へ戻す。**handled で text 空の状態を
 * 作らない**——それはスキーマ（レベル1）違反であり、自動保存が壊れた
 * ファイルを書くことになる
 */
export function setAnswerText(
  d: SequenceSchemaVersion1,
  index: number,
  path: AnswerPath,
  text: string,
): SequenceSchemaVersion1 {
  const step = d.steps[index]
  if (step === undefined) return d
  const slot = text === '' ? undefined : { decision: 'handled' as const, text }
  return replaceStep(d, index, writeSlot(step, path, slot))
}

/**
 * 答えスロットを未定義へ戻す（decision も text もキーごと消す）。
 * setAnswerText(d, i, path, '') と結果は同じだが、「立っていない答えの削除」
 * という操作の意味を名前で残す（ghost スロットの ✕ が呼ぶ）
 */
export function removeAnswer(
  d: SequenceSchemaVersion1,
  index: number,
  path: AnswerPath,
): SequenceSchemaVersion1 {
  const step = d.steps[index]
  if (step === undefined) return d
  return replaceStep(d, index, writeSlot(step, path, undefined))
}

/**
 * Ctrl+Enter のトグル（design-notes 論点9）。
 * 未定義 → notApplicable ／ notApplicable → text があれば handled・無ければ未定義
 * ／ handled → notApplicable（text は理由メモとして温存）
 */
export function toggleNotApplicable(
  d: SequenceSchemaVersion1,
  index: number,
  path: AnswerPath,
): SequenceSchemaVersion1 {
  const step = d.steps[index]
  if (step === undefined) return d
  const current = readSlot(step, path)
  let next: { decision?: 'handled' | 'notApplicable'; text?: string } | undefined
  if (current.decision === 'notApplicable') {
    next =
      current.text !== undefined && current.text !== ''
        ? { decision: 'handled', text: current.text }
        : undefined
  } else {
    next = { decision: 'notApplicable', ...(current.text ? { text: current.text } : {}) }
  }
  return replaceStep(d, index, writeSlot(step, path, next))
}
