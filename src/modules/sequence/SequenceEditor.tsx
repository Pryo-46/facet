import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FieldState } from '@/components/CellInput'
import { CellInput } from '@/components/CellInput'
import { buttonBase } from '@/components/button-styles'
import {
  resolveCommand,
  toKeyEventLike,
  type Command,
  type KeyContext,
} from '@/core/keyboard/keymap'
import { currentPlatform } from '@/core/keyboard/platform'
import type { EditorProps } from '@/core/registry'
import { computeRowKeys } from '@/core/row-keys'
import type { SequenceSchemaVersion1, SequenceStep } from '@/types/sequence'
import { ActorRefCell } from './ActorRefCell'
import {
  addActorAfter,
  addFirstActor,
  addStepAfter,
  addStepLast,
  createActorAndAssign,
  moveActor,
  moveStep,
  removeActor,
  removeStep,
  setActorName,
  setAnswerText,
  setStepActor,
  setStepLabel,
  setStepShape,
  stepShapeOf,
  toggleNotApplicable,
  type SeqEditResult,
} from './commands'
import { GutterSlot, type SlotState } from './GutterSlot'
import {
  ARROW_GAP,
  DIAGRAM_MARGIN,
  layoutSequence,
  QUESTION_LABEL_WIDTH,
  RAIL_WIDTH,
  type SeqLayoutInput,
} from './layout'
import {
  ACTOR_BOX_CLASS,
  ACTOR_INSET_X,
  ACTOR_MAX_WIDTH,
  ACTOR_MIN_WIDTH,
  ANSWER_CONTENT_WIDTH,
  ANSWER_INSET_X,
  ANSWER_INSET_Y,
  LABEL_BOX_CLASS,
  LABEL_INSET_X,
  LABEL_INSET_Y,
  LABEL_MAX_WIDTH,
  LABEL_MIN_WIDTH,
  SELF_BOX_CLASS,
  SELF_INSET_X,
  SELF_INSET_Y,
  SELF_MIN_WIDTH,
  wrapWithin,
  type MeasureWidth,
  type WrappedBlock,
  type WrapOptions,
} from './measure'
import { poseQuestions, questionLabels, type AnswerPath } from './questions'
import { createSeqMeasurer, FALLBACK_SEQ_FONT, readSeqFont, sameFont, type SeqFont } from './seq-font'
import { SequenceEdges, type EdgeStep } from './SequenceEdges'
import { StepShapeCell } from './StepShapeCell'
import { useViewport } from './useViewport'
import { cssTransform, type Rect } from './viewport'

/** 測定結果のキャッシュ。会議1回分の打鍵で無限に増えないよう頭を押さえる */
const MEASURE_CACHE_LIMIT = 2000

/** 図の文字に当たるクラスのうち、フォントを決めている部分。見本要素と共有する */
const SEQ_FONT_CLASS = 'text-sm'

const PLATFORM = currentPlatform()

/**
 * 問いの並び（ガターの上から下）。**この順序は poseQuestions の型どおりで、
 * ifExecuted は unknown の下位問い**なので入れ替えないこと
 */
const QUESTION_ORDER: readonly AnswerPath[] = ['failed', 'unknown', 'ifExecuted']

/** 答えセルの外形幅（内容幅＋左右の inset）。ガターの幅も layout がこれで導出する */
const ANSWER_BOX_WIDTH = ANSWER_CONTENT_WIDTH + ANSWER_INSET_X * 2

const CELL_GAP = 4

/**
 * レール（行の左端の編集セル列。編集の足場であって図の一部ではない）の内訳。
 *
 * **編集セルは矢印の脇に置かない。** 脇に置くと、図が細いとき（参加者1人など）に
 * ガターの問いラベル列と横方向で衝突する（実機確認の第一報。「呼出」チップが
 * 「結果不明だったら？」に重なった）。行の左端に固定幅の列を切り、
 * 横の帯域を [レール][図][ガター] に分けることで衝突を構造ごと無くす。
 *
 * x は行に依らず固定なので、モジュールの定数として1回だけ積む。
 * 合計が layout の `RAIL_WIDTH` と一致していることは下の RAIL_SPAN で押さえる
 */
const RAIL_PAD_X = 8
const RAIL_NUM_WIDTH = 24
const RAIL_CELL_GAP = 4
const RAIL_REF_WIDTH = 100
const RAIL_ARROW_WIDTH = 12
const RAIL_SHAPE_WIDTH = 88
const RAIL_NUM_X = DIAGRAM_MARGIN + RAIL_PAD_X
const RAIL_FROM_X = RAIL_NUM_X + RAIL_NUM_WIDTH + RAIL_CELL_GAP
const RAIL_ARROW_X = RAIL_FROM_X + RAIL_REF_WIDTH
const RAIL_TO_X = RAIL_ARROW_X + RAIL_ARROW_WIDTH
const RAIL_SHAPE_X = RAIL_TO_X + RAIL_REF_WIDTH + RAIL_CELL_GAP
/**
 * レールのセルを行の上端からどれだけ下げるか。
 * 行の帯は `max(ラベル高, ガタースロット群)` で決まりレールのぶんを含まないので、
 * 上端寄りに置いて `MIN_ROW_HEIGHT` 44 の中に収める（下端から置くと次の行へ食い込む）
 */
const RAIL_TOP_INSET = 4

const ACTOR_WRAP: WrapOptions = {
  maxWidth: ACTOR_MAX_WIDTH,
  minWidth: ACTOR_MIN_WIDTH,
  insetX: ACTOR_INSET_X,
  // ヘッダの高さは layout の HEADER_HEIGHT 固定なので、縦は測らない
  insetY: 0,
}
const LABEL_WRAP: WrapOptions = {
  maxWidth: LABEL_MAX_WIDTH,
  minWidth: LABEL_MIN_WIDTH,
  insetX: LABEL_INSET_X,
  insetY: LABEL_INSET_Y,
}
const SELF_WRAP: WrapOptions = {
  maxWidth: LABEL_MAX_WIDTH,
  minWidth: SELF_MIN_WIDTH,
  insetX: SELF_INSET_X,
  insetY: SELF_INSET_Y,
}
/** 答えセルは幅を導出しない（design-notes 論点7）。max と min を同じにして固定する */
const ANSWER_WRAP: WrapOptions = {
  maxWidth: ANSWER_BOX_WIDTH,
  minWidth: ANSWER_BOX_WIDTH,
  insetX: ANSWER_INSET_X,
  insetY: ANSWER_INSET_Y,
}

/**
 * スロットの現在値を読む（commands.ts の writeSlot と対になる読み手）。
 * ifExecuted だけの部分回答では unknown 自体は未回答である、という
 * consistency.ts と同じ読み方をする
 */
function readAnswer(
  step: SequenceStep,
  path: AnswerPath,
): { decision?: 'handled' | 'notApplicable'; text?: string } {
  if (path === 'failed') return step.failures?.failed ?? {}
  if (path === 'unknown') {
    const u = step.failures?.unknown
    return u === undefined ? {} : { decision: u.decision, text: u.text }
  }
  return step.failures?.unknown?.ifExecuted ?? {}
}

function slotStateOf(decision: 'handled' | 'notApplicable' | undefined): SlotState {
  if (decision === 'handled') return 'handled'
  if (decision === 'notApplicable') return 'notApplicable'
  return 'unanswered'
}

/** キー処理の宛先。resolveCommand が返した意味をどの構造へ写すかを決める */
type CellTarget =
  | { kind: 'actor'; index: number }
  | { kind: 'label'; index: number }
  | { kind: 'ref'; index: number }
  | { kind: 'shape'; index: number }
  | { kind: 'answer'; index: number; path: AnswerPath }

export function SequenceEditor({
  data,
  onChange,
  issues,
  modalOpen,
}: EditorProps<SequenceSchemaVersion1>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const [font, setFont] = useState<SeqFont>(FALLBACK_SEQ_FONT)
  // ズーム・パン（Ctrl+ホイール／Space・中ボタンのドラッグ）と新しい行への追従。
  // モーダルが開いている間は止める（キーはモーダルが取る。rev 10章 境界規則）
  const { transform, spaceHeld, ensureVisible } = useViewport(containerRef, !modalOpen)

  // 構造操作の後、新しい DOM が出てからフォーカスを移すための予約
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)

  // Web フォントの読み込みで canvas の measureText の結果は変わるが、
  // getComputedStyle が返す値は変わらない（宣言されたファミリ列を返すだけで、
  // どのフェイスに解決されたかは映らない）。だからフォントの同一性では
  // 判定できず、読み込み完了を世代として数えて測り直す
  const [fontGeneration, setFontGeneration] = useState(0)

  const readFont = (): void => {
    setFont((prev) => {
      const next = readSeqFont(probeRef.current)
      return sameFont(prev, next) ? prev : next
    })
  }

  useLayoutEffect(readFont, [])

  // **Web フォントの読み込み前に測るとフォールバック書体の幅になる。**
  // Geist は日本語グリフを持たず和文はフォールバックに落ちるが、
  // 欧文の幅は読み込みの前後で変わる。読み込み完了で測り直す
  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return
    let alive = true
    void document.fonts.ready.then(() => {
      if (!alive) return
      readFont()
      setFontGeneration((n) => n + 1)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readFont は毎レンダー再生成される安定した処理。購読はマウント時の1回でよい
  }, [])

  useEffect(() => {
    if (pendingFocus === null) return
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-cell="${pendingFocus}"]`)
    // **スクロールはさせない。** 画面外の要素にフォーカスするとブラウザが
    // 祖先の scrollLeft/scrollTop を動かすが、位置は transform で持っており
    // panIntoView はスクロール量を勘定に入れていない（二重に動いて狂う）
    el?.focus({ preventScroll: true })
    const rect = rects.get(pendingFocus)
    // 打った直後の行が画面外だと、何を打っているか見えない
    if (rect !== undefined) ensureVisible(rect)
    setPendingFocus(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rects は毎レンダー作り直される導出値。予約が入ったときだけ走らせる
  }, [pendingFocus])

  // 測定器はフォントが変わったときだけ作り直す。**キャッシュはフォントに
  // 紐づく**ので、同じ入れ物の中で持つ（別々に持つと片方だけ古くなる）。
  //
  // 鍵に lineHeight と世代を混ぜる。**`font.font` の文字列には行間が
  // 入っていない**のに wrapWithin の height は lineHeight に依存するので、
  // 書体が同じまま行間だけ変わるとキャッシュが古い高さを返し続ける。
  // 世代は上の document.fonts.ready が進めるカウンタで、
  // 「読み込み後に測り直す」を成立させるのはこちらである
  const measurerKey = `${font.font}|${font.lineHeight}|${fontGeneration}`
  const measurerRef = useRef<{
    key: string
    measure: MeasureWidth
    cache: Map<string, WrappedBlock>
  } | null>(null)
  if (measurerRef.current === null || measurerRef.current.key !== measurerKey) {
    // createSeqMeasurer は canvas を取れない環境（jsdom）で自ら概算器に落ちる
    // ——logic-tree がテストで通っているのと同じ経路（seq-font.ts）
    measurerRef.current = { key: measurerKey, measure: createSeqMeasurer(font), cache: new Map() }
  }
  const measurer = measurerRef.current

  /** 測定は1パス。同じ文字列でも当てる箱が違えば結果が違うので、鍵に箱の種別を混ぜる */
  const wrap = (box: string, text: string, opts: WrapOptions): WrappedBlock => {
    const key = `${box}:${text}`
    let block = measurer.cache.get(key)
    if (block === undefined) {
      block = wrapWithin(text, measurer.measure, font.lineHeight, opts)
      if (measurer.cache.size >= MEASURE_CACHE_LIMIT) measurer.cache.clear()
      measurer.cache.set(key, block)
    }
    return block
  }

  const actorKeys = computeRowKeys(data.actors)
  const stepKeys = computeRowKeys(data.steps)

  const actorWidths = data.actors.map((actor) => wrap('actor', actor.name, ACTOR_WRAP).width)

  const stepViews = data.steps.map((step) => {
    const shape = stepShapeOf(step)
    const posed = poseQuestions(step)
    const labels = questionLabels(step)
    const label = wrap(shape === 'self' ? 'self' : 'label', step.label, shape === 'self' ? SELF_WRAP : LABEL_WRAP)
    const answers = QUESTION_ORDER.filter((path) => posed[path]).map((path) => {
      const slot = readAnswer(step, path)
      const text = slot.text ?? ''
      // 未回答の枠は placeholder の「未定義」が入る高さを確保する（空だと潰れる）
      const block = wrap('answer', text === '' ? '未定義' : text, ANSWER_WRAP)
      return { path, question: labels[path], state: slotStateOf(slot.decision), text, height: block.height }
    })
    // 参照切れは -1 のまま layout へ渡す（layout は範囲外を読み飛ばす契約）
    const fromIndex = data.actors.findIndex((a) => a.id === step.from)
    const toIndex = step.to === undefined ? null : data.actors.findIndex((a) => a.id === step.to)
    return { shape, label, answers, fromIndex, toIndex }
  })

  const layoutInput: SeqLayoutInput = {
    actorWidths,
    domains: data.actors.map((actor) => actor.domain),
    steps: stepViews.map((view) => ({
      fromIndex: view.fromIndex,
      toIndex: view.toIndex,
      metrics: {
        labelWidth: view.label.width,
        labelHeight: view.label.height,
        slotHeights: view.answers.map((answer) => answer.height),
      },
    })),
  }
  const layout = layoutSequence(layoutInput)

  const edgeSteps: EdgeStep[] = stepViews.map((view, index) => ({
    key: stepKeys[index],
    shape: view.shape,
    fromIndex: view.fromIndex < 0 ? null : view.fromIndex,
    toIndex: view.toIndex === null || view.toIndex < 0 ? null : view.toIndex,
  }))

  /** フォーカス移動のときに「見えるところまで寄せる」ための矩形。data-cell 鍵で引く */
  const rects = new Map<string, Rect>()
  data.actors.forEach((_actor, index) => {
    rects.set(`${actorKeys[index]}:name`, {
      x: layout.actorX[index] - actorWidths[index] / 2,
      y: layout.headerTop,
      width: actorWidths[index],
      height: layout.headerHeight,
    })
  })
  /** ガターの順に並べたスロットの data-cell 鍵（↑↓ の移動が使う） */
  const slotCells: string[] = []
  data.steps.forEach((_step, index) => {
    const row = layout.rows[index]
    // 行はガターまで含めて1つの帯として扱う（答えを打つときも図の側が見えていてほしい）
    const rect: Rect = {
      x: DIAGRAM_MARGIN,
      y: row.top,
      width: layout.totalWidth,
      height: row.height,
    }
    for (const suffix of ['label', 'from', 'to', 'shape']) {
      rects.set(`${stepKeys[index]}:${suffix}`, rect)
    }
    for (const answer of stepViews[index].answers) {
      const cell = `${stepKeys[index]}:${answer.path}`
      rects.set(cell, rect)
      slotCells.push(cell)
    }
  })

  // 赤表示の対象。entityId のプレフィクスでどちらの配列の話かを見分ける
  //（ConsistencyLocation は配列を1つしか想定していないため。consistency.ts の規約）
  const invalidActors = new Set<number>()
  /** ステップ位置 → 赤くする欄。'row'＝行全体（id や欄を特定できない指摘） */
  const invalidStepFields = new Map<number, Set<string>>()
  for (const issue of issues) {
    for (const location of issue.locations) {
      if (location.entityIndex === null) continue
      if (location.entityId.startsWith('actor_')) {
        invalidActors.add(location.entityIndex)
        continue
      }
      if (!location.entityId.startsWith('step_')) continue
      const field =
        location.field === 'from' || location.field === 'to' || location.field === 'failures'
          ? location.field
          : 'row'
      const fields = invalidStepFields.get(location.entityIndex) ?? new Set<string>()
      fields.add(field)
      invalidStepFields.set(location.entityIndex, fields)
    }
  }
  const stepHas = (index: number, field: string): boolean =>
    invalidStepFields.get(index)?.has(field) ?? false

  // ガターの集計。数えるのは**立っている問い**だけ（立たない問いへの答えは
  // 整合性検証が unposed-answer として別に指摘する）
  const tally = { unanswered: 0, handled: 0, notApplicable: 0 }
  for (const view of stepViews) {
    for (const answer of view.answers) tally[answer.state] += 1
  }

  /** 編集結果を額縁へ渡し、次に編集させたいセルへフォーカスを予約する */
  const apply = (result: SeqEditResult): void => {
    // 動かなかった編集は同じ参照を返す（commands.ts の契約）。
    // ここで落とさないと内容が同じコミットが積まれ、Undo が空振りする
    if (result.data === data) return
    // 構造操作は mergeKey に null を渡す（1操作1コミット。rev 10章）
    onChange(result.data, null)
    const focus = result.focus
    if (focus === null) {
      setPendingFocus(null)
      return
    }
    const keys = computeRowKeys(focus.kind === 'actor' ? result.data.actors : result.data.steps)
    const key = keys[focus.index]
    setPendingFocus(key === undefined ? null : `${key}:${focus.kind === 'actor' ? 'name' : 'label'}`)
  }

  /** data-cell 鍵のセルへ移る。戻り値 true＝移った（＝キーを消費した） */
  const focusCell = (cell: string | undefined): boolean => {
    if (cell === undefined) return false
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)
    if (!el) return false
    // pendingFocus の effect（上）と同じ理由: 画面外の要素に focus すると
    // ブラウザが祖先の scrollLeft/scrollTop を動かすが、位置は transform で
    // 持っており panIntoView はスクロール量を見ていない（二重に動いてずれ続ける）
    el.focus({ preventScroll: true })
    const rect = rects.get(cell)
    if (rect !== undefined) ensureVisible(rect)
    return true
  }

  const focusActorAt = (index: number): boolean => {
    const key = actorKeys[index]
    return key === undefined ? false : focusCell(`${key}:name`)
  }

  const focusStepLabelAt = (index: number): boolean => {
    const key = stepKeys[index]
    return key === undefined ? false : focusCell(`${key}:label`)
  }

  /** ガターのスロットを上下に辿る（行をまたいで1本の列として動く） */
  const focusSlot = (cell: string, delta: -1 | 1): boolean => {
    const at = slotCells.indexOf(cell)
    return at < 0 ? false : focusCell(slotCells[at + delta])
  }

  /** コマンドをシーケンスの構造へ写像する。戻り値 true＝消費した（既定動作を止める） */
  const runCommand = (cmd: Command, target: CellTarget): boolean => {
    const index = target.index
    switch (cmd) {
      case 'insert-item-after':
        // 答えを打った後の Enter も「次のステップへ進む」＝会議の流れ
        apply(target.kind === 'actor' ? addActorAfter(data, index) : addStepAfter(data, index))
        return true
      case 'delete-item':
        // deletableField を立てている欄（参加者名・ステップ文言）からしか来ない
        apply(target.kind === 'actor' ? removeActor(data, index) : removeStep(data, index))
        return true
      case 'move-item-up':
        apply(target.kind === 'actor' ? moveActor(data, index, -1) : moveStep(data, index, -1))
        return true
      case 'move-item-down':
        apply(target.kind === 'actor' ? moveActor(data, index, 1) : moveStep(data, index, 1))
        return true
      case 'focus-prev':
        if (target.kind === 'actor') return focusActorAt(index - 1)
        if (target.kind === 'answer') return focusSlot(`${stepKeys[index]}:${target.path}`, -1)
        return focusStepLabelAt(index - 1)
      case 'focus-next':
        if (target.kind === 'actor') return focusActorAt(index + 1)
        if (target.kind === 'answer') return focusSlot(`${stepKeys[index]}:${target.path}`, 1)
        return focusStepLabelAt(index + 1)
      case 'toggle-item-state':
        // 「考慮不要」のトグルは答えスロットだけの意味（他の欄では無視する）
        if (target.kind !== 'answer') return false
        onChange(toggleNotApplicable(data, index, target.path), null)
        return true
      case 'cancel':
        // 編集の打ち切り。フォーカスを外すと CellInput が確定値に戻す
        ;(document.activeElement as HTMLElement | null)?.blur()
        return true
      default:
        // undo / redo は額縁（App）のグローバル層が取る。Tab のセル間移動は
        // DOM の順序（＝ラベル→from→to→形→答え）に委ねる。どちらも消費しない
        return false
    }
  }

  /** キーの判定はコアの resolveCommand に一元化する（rev 10章）。ここでキーを見ない */
  const handleKey = (
    e: React.KeyboardEvent,
    target: CellTarget,
    context: Omit<KeyContext, 'platform' | 'modalOpen' | 'reorderEnabled'>,
  ): void => {
    const cmd = resolveCommand(toKeyEventLike(e), {
      platform: PLATFORM,
      modalOpen,
      // M1 には導出表示（検索・フィルタ）が無いので並び替えは常に有効
      reorderEnabled: true,
      ...context,
    })
    if (cmd === null) return
    if (runCommand(cmd, target)) e.preventDefault()
  }

  const onActorKeyDown = (e: React.KeyboardEvent, index: number, state: FieldState): void => {
    handleKey(e, { kind: 'actor', index }, {
      editing: true,
      fieldEmpty: state.empty,
      // 参加者名は1つしかない欄なので、空欄 Backspace の削除を認める
      deletableField: true,
      caretAtStart: state.caretAtStart,
      caretAtEnd: state.caretAtEnd,
      arrowsOwnedByField: false,
      hierarchical: false,
      // ヘッダは横並びのリスト。Alt+←→ が並び替えになる（design-notes 論点9）
      horizontal: true,
    })
  }

  const onLabelKeyDown = (e: React.KeyboardEvent, index: number, state: FieldState): void => {
    handleKey(e, { kind: 'label', index }, {
      editing: true,
      fieldEmpty: state.empty,
      deletableField: true,
      caretAtStart: state.caretAtStart,
      caretAtEnd: state.caretAtEnd,
      arrowsOwnedByField: false,
      hierarchical: false,
      horizontal: false,
    })
  }

  const onRefKeyDown = (e: React.KeyboardEvent, index: number, state: FieldState): void => {
    handleKey(e, { kind: 'ref', index }, {
      editing: true,
      fieldEmpty: state.empty,
      // **参照セルの空欄 Backspace で行を消さない。** 参照欄の空は
      // 「入力中」であって「消したい」ではない
      deletableField: false,
      caretAtStart: state.caretAtStart,
      caretAtEnd: state.caretAtEnd,
      // ↑↓ は候補の切替に使う（ActorRefCell が自前で処理する）
      arrowsOwnedByField: true,
      hierarchical: false,
      horizontal: false,
    })
  }

  const onShapeKeyDown = (e: React.KeyboardEvent, index: number): void => {
    handleKey(e, { kind: 'shape', index }, {
      // button であって文字を編集する欄ではない
      editing: false,
      fieldEmpty: false,
      deletableField: false,
      caretAtStart: false,
      caretAtEnd: false,
      // ↑↓ は4値の循環に使う（StepShapeCell が自前で処理する）
      arrowsOwnedByField: true,
      hierarchical: false,
      horizontal: false,
    })
  }

  const onAnswerKeyDown = (
    e: React.KeyboardEvent,
    index: number,
    path: AnswerPath,
    state: FieldState,
  ): void => {
    handleKey(e, { kind: 'answer', index, path }, {
      editing: true,
      fieldEmpty: state.empty,
      // 答えを消してもステップは消さない（空＝未定義に戻すの意）
      deletableField: false,
      caretAtStart: state.caretAtStart,
      caretAtEnd: state.caretAtEnd,
      arrowsOwnedByField: false,
      hierarchical: false,
      horizontal: false,
    })
  }

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden bg-canvas bg-grid-paper ${
        spaceHeld ? 'cursor-grab' : ''
      }`}
    >
      {/* 測定用の見本。**描画される文字と同じフォントのクラスを持たせる**ことで、
          測定と描画が同一の情報源を見る（rev 9章）。opacity-0 で見せないだけに
          するのは、display:none だと getComputedStyle がフォントを返さない環境があるため */}
      <span
        ref={probeRef}
        aria-hidden="true"
        className={`${SEQ_FONT_CLASS} pointer-events-none absolute left-0 top-0 select-none opacity-0`}
      >
        あ
      </span>

      {/* 額縁の帯（指摘一覧と常設のボタン）。**面は透過させる**——下にある
          キャンバスのパンとヒットテストを、帯の外側で奪わないため */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-start">
        {issues.length > 0 && (
          <ul className="pointer-events-auto w-full list-disc bg-surface px-6 py-2 pl-10 text-sm text-warning">
            {issues.map((issue, i) => (
              <li key={`${issue.rule}-${i}`}>{issue.message}</li>
            ))}
          </ul>
        )}
        {data.actors.length > 0 && (
          <button
            type="button"
            className={`${buttonBase} pointer-events-auto m-2 border border-rule bg-surface px-3 py-1 text-sm text-ink hover:bg-canvas`}
            onClick={() => apply(addStepLast(data))}
          >
            ステップを追加
          </button>
        )}
      </div>

      {data.actors.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            className={`${buttonBase} border border-rule bg-surface px-4 py-2 text-sm text-ink hover:bg-canvas`}
            onClick={() => apply(addFirstActor(data))}
          >
            クリックして開始
          </button>
        </div>
      )}

      {/* 背景レイヤ: ライフライン・責任境界の縦線・行全体の赤表示
          （M2 のゾーンの帯もこの層に載る） */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 origin-top-left"
        style={{ transform: cssTransform(transform) }}
        data-layer="background"
      >
        {/* 行全体の赤（id 重複など、欄を特定できない指摘）。
            **同じピクセルに warning の面を2枚重ねない**（M8 の「面は片方だけ」）。
            そのため帯はガターの手前で止める——ガターのセルは未定義の
            `bg-warning/10` を自分で持っており、重ねると未検算の濃さになる。
            図の側では文言セルが面を降りる（下の labelFace） */}
        {data.steps.map((_step, index) =>
          stepHas(index, 'row') ? (
            <div
              key={`row-${stepKeys[index]}`}
              className="absolute bg-warning/20"
              style={{
                left: DIAGRAM_MARGIN,
                top: layout.rows[index].top,
                width: Math.max(0, layout.gutterX - DIAGRAM_MARGIN - CELL_GAP * 2),
                height: layout.rows[index].height,
              }}
            />
          ) : null,
        )}
        {data.actors.map((_actor, index) => (
          <div
            key={`life-${actorKeys[index]}`}
            className="absolute border-l border-rule"
            style={{
              left: layout.actorX[index],
              top: layout.headerTop + layout.headerHeight,
              height: Math.max(0, layout.totalHeight - layout.headerHeight),
            }}
          />
        ))}
        {layout.boundaries.map((x) => (
          <div
            key={`boundary-${x}`}
            className="absolute border-l border-dashed border-rule"
            style={{ left: x, top: 0, height: layout.totalHeight }}
          />
        ))}
      </div>

      <SequenceEdges steps={edgeSteps} layout={layout} transform={transform} />

      {/* **レイヤ自体は操作を取らない。** ここは inset-0 の透明な面で、
          ツリー順では空状態のボタンより後ろ（＝上）に来る。z-index はどちらも
          auto なので、pointer-events を切らないと中央のヒットテストを
          この面が奪い、「クリックして開始」が押せなくなる。操作を受けるのは
          セルの矩形だけでよいので、各セル側で auto に戻す */}
      <div
        className="pointer-events-none absolute inset-0 origin-top-left"
        style={{ transform: cssTransform(transform) }}
        data-layer="nodes"
      >
        {/* 参加者ヘッダ */}
        {data.actors.map((actor, index) => {
          const key = actorKeys[index]
          const width = actorWidths[index]
          // **面と枠のクラスは片方だけ出す。** 両方並べると勝つのは生成 CSS の
          // 順序であってクラス名の順序ではない（M8 が cascade layers で踏んだ形）
          const face = invalidActors.has(index)
            ? 'border-warning bg-warning/20'
            : 'border-rule bg-surface'
          return (
            <div
              key={key}
              className="pointer-events-auto absolute"
              style={{
                left: layout.actorX[index] - width / 2,
                top: layout.headerTop,
                width,
                height: layout.headerHeight,
              }}
            >
              <CellInput
                className={`h-full w-full rounded-sm text-center ${ACTOR_BOX_CLASS} ${face} text-sm text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-ring`}
                aria-label={`参加者${index + 1}の名前`}
                data-cell={`${key}:name`}
                value={actor.name}
                onValueChange={(next) => onChange(setActorName(data, index, next), `${key}:name`)}
                onFieldKeyDown={(e, state) => onActorKeyDown(e, index, state)}
              />
            </div>
          )
        })}

        {/* ガターの集計（design-notes 論点7）。数えるのは立っている問いだけ */}
        <div
          className="absolute text-sm text-ink-muted"
          style={{ left: layout.gutterX, top: layout.headerTop, height: layout.headerHeight }}
        >
          {`⚠ 未定義 ${tally.unanswered} ／ ✓ 回答済 ${tally.handled} ／ ─ 考慮不要 ${tally.notApplicable}`}
        </div>

        {/* ステップ行 */}
        {data.steps.map((step, index) => {
          const key = stepKeys[index]
          const view = stepViews[index]
          const row = layout.rows[index]
          const isSelf = view.shape === 'self'
          // 行全体が赤い行では、文言セルは面を持たない（背景の帯を透かす）。
          // bg-warning/20 を重ねると同じ色を2枚敷くことになり、
          // bg-canvas で塗ると帯に穴が開く（どちらも「面は片方だけ」に反する）
          const labelFace = stepHas(index, 'row') ? 'bg-transparent' : 'bg-canvas'
          // 文言は矢印の真上に置く（layout の arrowY は文言の高さから決まっている）
          const labelTop = row.arrowY - ARROW_GAP - view.label.height
          // 参照が引けない行の逃げ場は「図の左端」＝レールの右。
          // DIAGRAM_MARGIN に置くとレールのセルの上に文言が乗る
          const diagramLeft = DIAGRAM_MARGIN + RAIL_WIDTH
          const anchorX = view.fromIndex < 0 ? diagramLeft : layout.actorX[view.fromIndex]
          const labelLeft = isSelf
            ? anchorX
            : view.toIndex === null || view.toIndex < 0 || view.fromIndex < 0
              ? diagramLeft
              : (layout.actorX[view.fromIndex] + layout.actorX[view.toIndex]) / 2 -
                view.label.width / 2
          // 編集の足場（#番号 / from / to / 形）はレールの中の固定 x に置く。
          // **矢印の位置も参加者の数も見ない**——だから from==to の呼出（線が引けない）でも
          // 定位置に出るし、細い図でガターに被ることもない
          const railTop = row.top + RAIL_TOP_INSET
          return (
            <div key={key}>
              {/* レールの通し番号。aria-hidden にするのは、各セルの aria-label が
                  すでに「ステップN の…」と名乗っており、二重に読ませないため */}
              <div
                aria-hidden="true"
                className="absolute select-none text-right text-xs text-ink-muted"
                style={{ left: RAIL_NUM_X, top: railTop + 4, width: RAIL_NUM_WIDTH }}
              >
                {`#${index + 1}`}
              </div>

              <div
                className="pointer-events-auto absolute"
                style={{
                  left: labelLeft,
                  top: labelTop,
                  width: view.label.width,
                  height: view.label.height,
                }}
              >
                <CellInput
                  multiline
                  autoSize={false}
                  className={`h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-all rounded-sm ${
                    isSelf ? `${SELF_BOX_CLASS} border-rule` : LABEL_BOX_CLASS
                  } ${labelFace} text-center text-sm text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-ring`}
                  aria-label={`ステップ${index + 1}の文言`}
                  data-cell={`${key}:label`}
                  value={step.label}
                  onValueChange={(next) => onChange(setStepLabel(data, index, next), `${key}:label`)}
                  onFieldKeyDown={(e, state) => onLabelKeyDown(e, index, state)}
                />
              </div>

              <div
                className="pointer-events-auto absolute"
                style={{ left: RAIL_FROM_X, top: railTop, width: RAIL_REF_WIDTH }}
              >
                <ActorRefCell
                  value={step.from}
                  actors={data.actors}
                  invalid={stepHas(index, 'from')}
                  aria-label={`ステップ${index + 1}の送り手`}
                  data-cell={`${key}:from`}
                  onSelect={(actorId) => onChange(setStepActor(data, index, 'from', actorId), null)}
                  onCreate={(name) => onChange(createActorAndAssign(data, index, 'from', name), null)}
                  onFieldKeyDown={(e, state) => onRefKeyDown(e, index, state)}
                />
              </div>
              {/* 向きのグリフと受け手は self では出さない（宛先が無い）。
                  空けたぶんだけ種別セルの x は動かない——**列が揃っていることが
                  レールの値打ち**なので、詰めない */}
              {!isSelf && (
                <>
                  <div
                    aria-hidden="true"
                    className="absolute select-none text-center text-xs text-ink-muted"
                    style={{ left: RAIL_ARROW_X, top: railTop + 4, width: RAIL_ARROW_WIDTH }}
                  >
                    →
                  </div>
                  <div
                    className="pointer-events-auto absolute"
                    style={{ left: RAIL_TO_X, top: railTop, width: RAIL_REF_WIDTH }}
                  >
                    <ActorRefCell
                      value={step.to}
                      actors={data.actors}
                      invalid={stepHas(index, 'to')}
                      aria-label={`ステップ${index + 1}の受け手`}
                      data-cell={`${key}:to`}
                      onSelect={(actorId) => onChange(setStepActor(data, index, 'to', actorId), null)}
                      onCreate={(name) => onChange(createActorAndAssign(data, index, 'to', name), null)}
                      onFieldKeyDown={(e, state) => onRefKeyDown(e, index, state)}
                    />
                  </div>
                </>
              )}
              <div
                className="pointer-events-auto absolute"
                style={{ left: RAIL_SHAPE_X, top: railTop, width: RAIL_SHAPE_WIDTH }}
              >
                <StepShapeCell
                  value={view.shape}
                  aria-label={`ステップ${index + 1}の形`}
                  data-cell={`${key}:shape`}
                  onChange={(next) => onChange(setStepShape(data, index, next), null)}
                  onFieldKeyDown={(e) => onShapeKeyDown(e, index)}
                />
              </div>

              {/* ガター: 立っている問いのスロット群。reply は問いが無いので、
                  空白にせず「呼出側が扱う」ことを言う（design-notes 論点3） */}
              {view.answers.length === 0 ? (
                <div
                  className="absolute text-xs text-ink-muted"
                  style={{ left: layout.gutterX, top: row.top, width: layout.gutterWidth }}
                >
                  {view.shape === 'reply' ? '─ 応答の失敗は呼出側の「結果不明」が扱う' : '─ 問いは立たない'}
                </div>
              ) : (
                view.answers.map((answer, slotIndex) => (
                  <GutterSlot
                    key={`${key}:${answer.path}`}
                    question={answer.question}
                    indent={answer.path === 'ifExecuted'}
                    state={answer.state}
                    text={answer.text}
                    aria-label={`ステップ${index + 1}の答え: ${answer.question}`}
                    data-cell={`${key}:${answer.path}`}
                    x={layout.gutterX}
                    y={row.slotTops[slotIndex]}
                    labelWidth={QUESTION_LABEL_WIDTH}
                    answerWidth={ANSWER_BOX_WIDTH}
                    height={answer.height}
                    onTextChange={(next) =>
                      onChange(
                        setAnswerText(data, index, answer.path, next),
                        `${key}:${answer.path}`,
                      )
                    }
                    onFieldKeyDown={(e, state) => onAnswerKeyDown(e, index, answer.path, state)}
                  />
                ))
              )}

              {/* 答えの欄そのものは3状態の面を持つので、赤は枠を重ねて見せる
                  （GutterSlot の状態表示と食い合わせない） */}
              {stepHas(index, 'failures') && view.answers.length > 0 && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute rounded-sm border border-warning"
                  style={{
                    left: layout.gutterX - 2,
                    top: row.top - 2,
                    width: layout.gutterWidth + 4,
                    height:
                      row.slotTops[row.slotTops.length - 1] +
                      view.answers[view.answers.length - 1].height -
                      row.top +
                      4,
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
