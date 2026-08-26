import { Plus } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FieldState } from '@/components/CellInput'
import { CellInput } from '@/components/CellInput'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { KeyHints } from '@/components/KeyHints'
import { MissingTally } from '@/components/MissingTally'
import { buttonBase } from '@/components/button-styles'
import type { KeyHint } from '@/core/keyboard/hint-text'
import {
  resolveCommand,
  toKeyEventLike,
  type Command,
  type KeyContext,
} from '@/core/keyboard/keymap'
import { currentPlatform } from '@/core/keyboard/platform'
import type { EditorProps } from '@/core/registry'
import { computeRowKeys } from '@/core/row-keys'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { ActorRefCell } from './ActorRefCell'
import {
  addActorAfter,
  addFirstActor,
  addStepAfter,
  addStepLast,
  moveActor,
  moveStep,
  removeActor,
  removeAnswer,
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
import { GhostSlot } from './GhostSlot'
import { GutterSlot, GUTTER_INDENT, type SlotState } from './GutterSlot'
import {
  ARROW_GAP,
  DIAGRAM_MARGIN,
  GUTTER_HEADING_HEIGHT,
  layoutSequence,
  QUESTION_LABEL_WIDTH,
  ROW_GAP,
  type SeqLayoutInput,
} from './layout'
import {
  ACTOR_BOX_CLASS,
  ACTOR_INSET_X,
  ACTOR_MAX_WIDTH,
  ACTOR_MIN_WIDTH,
  ANSWER_BORDER,
  ANSWER_CONTENT_WIDTH,
  ANSWER_INSET_X,
  ANSWER_INSET_Y,
  ANSWER_NOT_APPLICABLE_PREFIX_PAD_X,
  gutterLabelText,
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
import { tallySequenceMissing } from './missing'
import {
  poseQuestions,
  questionHints,
  questionLabels,
  readSlot,
  unposedAnswers,
  type AnswerPath,
} from './questions'
import { NOT_APPLICABLE_LABEL } from './output-labels'
import {
  createCanvasMeasurer,
  FALLBACK_CANVAS_FONT,
  FALLBACK_SMALL_FONT,
  readCanvasFont,
  sameFont,
  type CanvasFont,
} from '@/core/canvas/canvas-font'
import { useFontGeneration } from '@/core/canvas/use-font-generation'
import { cssTransform, type Rect } from '@/core/canvas/viewport'
import { useViewport } from '@/core/canvas/use-viewport'
import { SequenceEdges, type EdgeStep } from './SequenceEdges'
import { StepShapeCell } from './StepShapeCell'

/** 測定結果のキャッシュ。会議1回分の打鍵で無限に増えないよう頭を押さえる */
const MEASURE_CACHE_LIMIT = 2000

/** 図の文字に当たるクラスのうち、フォントを決めている部分。見本要素と共有する */
const SEQ_FONT_CLASS = 'text-sm leading-normal'

/**
 * 問いラベルのフォント階級（GutterSlot のラベル列と同じ）。
 * **`SEQ_FONT_CLASS` で代用しないこと**——M26 で入力値が 14px へ下がって
 * サイズは並んだが、**行間が違う**（答えセルは `leading-normal` = 1.5、
 * ラベルは text-sm 既定の 1.3。src/index.css の --text-sm--line-height）。
 * 代用すると 21px の行高でラベルを測ることになり、高さを過大に見積もって
 * 行が無駄に伸びる
 */
const LABEL_FONT_CLASS = 'text-sm'

/** ガターと図の操作ヒント。`$mod` / `$alt` は KeyHints が解決する */
const SEQ_HINTS: readonly KeyHint[] = [
  { keys: 'Enter', label: 'ステップ追加' },
  { keys: 'Tab', label: 'セル移動' },
  { keys: '$mod+Enter', label: '考慮不要' },
  { keys: '$alt+↑↓', label: '並び替え' },
]

const PLATFORM = currentPlatform()

/**
 * 問いの並び（ガターの上から下）。**この順序は poseQuestions の型どおりで、
 * ifExecuted は unknown の下位問い**なので入れ替えないこと
 */
const QUESTION_ORDER: readonly AnswerPath[] = ['failed', 'unknown', 'ifExecuted']

/**
 * ガターのグレースロット（ブレスト決定4）が使う、問いの汎用文言。
 * 種別切替後は元の種別が分からない（answer は残っているが、どの類型で
 * 立っていた問いかは失われている）ので、call-sync（応答待ちの呼出）の
 * 文言を汎用として使う。GhostSlot は文字列を受け取るだけで意味を知らない
 */
const GHOST_SHAPE = { kind: 'call', awaitsReply: true } as const
const GHOST_QUESTION_LABEL: Record<AnswerPath, string> = questionLabels(GHOST_SHAPE)
/** 同上のツールチップ。ラベルと同じ理由で call-sync のものを汎用に使う */
const GHOST_QUESTION_HINT: Record<AnswerPath, string> = questionHints(GHOST_SHAPE)

/** 答えセルの外形幅（内容幅＋左右の inset）。ガターの幅も layout がこれで導出する */
const ANSWER_BOX_WIDTH = ANSWER_CONTENT_WIDTH + ANSWER_INSET_X * 2

/**
 * レール（行の左端の編集セル列。編集の足場であって図の一部ではない）の内訳。
 *
 * **編集セルは矢印の脇に置かない。** 脇に置くと、図が細いとき（参加者1人など）に
 * ガターの問いラベル列と横方向で衝突する（実機確認の第一報。「呼出」チップが
 * 「結果がわからなかったら？」に重なった）。行の左端に固定幅の列を切り、
 * 横の帯域を [レール][図][ガター] に分けることで衝突を構造ごと無くす。
 *
 * x は行に依らず固定なので、モジュールの定数として1回だけ積む。
 * 合計が layout の `RAIL_WIDTH` と一致していることは下の RAIL_SPAN で押さえる（実検算は DOM テスト）
 */
const RAIL_PAD_X = 8
const RAIL_NUM_WIDTH = 24
const RAIL_CELL_GAP = 4
const RAIL_REF_WIDTH = 100
const RAIL_ARROW_WIDTH = 12
/**
 * 種別セルの幅。**4値の中で一番長い「呼出（応答なし）」が1行に収まること。**
 * `text-sm`（14px）で 8文字＝112 ＋ `px-1.5` 12 ＋ 枠 2 ＝ 126。余裕を見て 136。
 * 折り返すとセルが2行になり、`RAIL_TOP_INSET` で上端寄せしているぶん
 * `MIN_ROW_HEIGHT` 44 から食み出す
 */
const RAIL_SHAPE_WIDTH = 136
const RAIL_NUM_X = DIAGRAM_MARGIN + RAIL_PAD_X
const RAIL_FROM_X = RAIL_NUM_X + RAIL_NUM_WIDTH + RAIL_CELL_GAP
const RAIL_ARROW_X = RAIL_FROM_X + RAIL_REF_WIDTH
const RAIL_TO_X = RAIL_ARROW_X + RAIL_ARROW_WIDTH
const RAIL_SHAPE_X = RAIL_TO_X + RAIL_REF_WIDTH + RAIL_CELL_GAP
/**
 * 内訳を積み上げたレールの実幅。**`layout.RAIL_WIDTH` と一致すること**を
 * `SequenceEditor.dom.test.tsx` が検算する——レールの内訳は描画側（このファイル）が
 * 持ち、図の左端は測定側（layout）が `RAIL_WIDTH` で決めるので、片方だけ動かすと
 * セルが図に侵入するか、レールの右に隙間が空く。
 * **セルの幅を足す／伸ばすときはここと `RAIL_WIDTH` を一緒に見ること**
 */
export const RAIL_SPAN = RAIL_SHAPE_X + RAIL_SHAPE_WIDTH + RAIL_PAD_X - DIAGRAM_MARGIN
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
 * notApplicable の答え用（M22）。GutterSlot は「考慮不要」の接頭ぶん左だけ
 * 広く空ける（`ANSWER_NOT_APPLICABLE_PREFIX_PAD_X`）ので、右は変わらないまま
 * 左右非対称になる。`wrapWithin` は `insetX * 2`（左右の合計）しか見ないので、
 * 左右それぞれの実際の inset を足して2で割った値を渡せば、合計は実物と合う
 */
const ANSWER_NOT_APPLICABLE_LEFT_INSET = ANSWER_NOT_APPLICABLE_PREFIX_PAD_X + ANSWER_BORDER
const NOT_APPLICABLE_ANSWER_WRAP: WrapOptions = {
  ...ANSWER_WRAP,
  insetX: (ANSWER_NOT_APPLICABLE_LEFT_INSET + ANSWER_INSET_X) / 2,
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
  | { kind: 'ref'; index: number; field: 'from' | 'to' }
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
  const [font, setFont] = useState<CanvasFont>(FALLBACK_CANVAS_FONT)
  const labelProbeRef = useRef<HTMLSpanElement>(null)
  const [labelFont, setLabelFont] = useState<CanvasFont>(FALLBACK_SMALL_FONT)

  // ガターのグレースロットの削除確認（Undo で戻せるとはいえ、削除は確認を挟む）
  const [confirmTarget, setConfirmTarget] = useState<{ index: number; path: AnswerPath } | null>(
    null,
  )
  // from/to/種別のセルのドロップダウンは同時に1つだけ開く。**開いている
  // セルの鍵（data-cell の値）を1つだけ持つ**ことで構造的に複数オープンを
  // 禁止する（2026-08-12 実機確認で見つかった欠陥の修正。経緯は
  // docs/history/sequence-m3-mouse-and-output.md の「Task 11b」）。あるセルを
  // 開くと他のセルの `open` が自動的に false になり、Radix が閉じる。
  // （非表示のセルの `open` は常に false なので DropdownMenuContent が
  // マウントされず、そのセルから onOpenChange(false) が飛んでくることは
  // 無い——false は常に「いま開いている当のセルが閉じた」ことを意味する）
  const [openCell, setOpenCell] = useState<string | null>(null)
  /** セル鍵ごとの open props。data-cell の値をそのまま鍵に使う */
  const menuPropsFor = (cell: string): { open: boolean; onOpenChange: (open: boolean) => void } => ({
    open: openCell === cell,
    onOpenChange: (open) => setOpenCell(open ? cell : null),
  })
  // エディタ内ダイアログが開いている間も操作言語を止める（rev 10章 境界規則）。
  // 額縁由来の modalOpen と OR を取る——どれか一つが開いていれば止まる。
  // **セルのドロップダウンはここに含めない**（Task 11b でカウンタごと
  // 巻き戻した）。同時に1つしか開かなくなり、Radix の FocusScope
  // （modal 既定）がメニュー内にキーを閉じ込めるため、操作言語への漏れは
  // 起きない（SequenceEditor.dom.test.tsx で検証済み）
  const anyModalOpen = modalOpen || confirmTarget !== null

  // ズーム・パン（Ctrl+ホイール／Space・中ボタンのドラッグ）と新しい行への追従。
  // モーダルが開いている間は止める（キーはモーダルが取る。rev 10章 境界規則）
  const { transform, spaceHeld, ensureVisible } = useViewport(containerRef, !anyModalOpen)

  // 構造操作の後、新しい DOM が出てからフォーカスを移すための予約
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)

  // ガターのブラケット強調用。どの行のセルにフォーカスがあるか（ガター外は null）
  const [focusedRow, setFocusedRow] = useState<number | null>(null)

  const readFont = (): void => {
    setFont((prev) => {
      const next = readCanvasFont(probeRef.current)
      return sameFont(prev, next) ? prev : next
    })
    setLabelFont((prev) => {
      const next = readCanvasFont(labelProbeRef.current)
      return sameFont(prev, next) ? prev : next
    })
  }

  useLayoutEffect(readFont, [])

  // 読み込みの世代。進んだら実効フォントも読み直す。
  // **最初の1フレームはフォールバック書体のメトリクスで測っている**し、
  // 同梱フォントは unicode-range 分割なので、珍しい字のスライスは
  // 初入力のとき後から届く（M26）——どちらも世代が進んだ時点で測り直す
  const fontGeneration = useFontGeneration()
  useEffect(() => {
    readFont()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readFont は毎レンダー再生成される安定した処理。世代が進んだときだけ走らせる
  }, [fontGeneration])

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
  // 世代は useFontGeneration（ready＋loadingdone）が進めるカウンタで、
  // 「読み込み後に測り直す」を成立させるのはこちらである
  const measurerKey = `${font.font}|${font.lineHeight}|${fontGeneration}`
  const measurerRef = useRef<{
    key: string
    measure: MeasureWidth
    cache: Map<string, WrappedBlock>
  } | null>(null)
  if (measurerRef.current === null || measurerRef.current.key !== measurerKey) {
    // createCanvasMeasurer は canvas を取れない環境（jsdom）で自ら概算器に落ちる
    // ——logic-tree がテストで通っているのと同じ経路（canvas-font.ts）
    measurerRef.current = { key: measurerKey, measure: createCanvasMeasurer(font), cache: new Map() }
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

  // 問いラベル用（text-sm）。**同じ入れ物に混ぜないこと**——キャッシュの鍵は
  // 文字列と箱の種別だけで、どのフォントで測ったかを持っていない
  const labelMeasurerKey = `${labelFont.font}|${labelFont.lineHeight}|${fontGeneration}`
  const labelMeasurerRef = useRef<{
    key: string
    measure: MeasureWidth
    cache: Map<string, WrappedBlock>
  } | null>(null)
  if (labelMeasurerRef.current === null || labelMeasurerRef.current.key !== labelMeasurerKey) {
    labelMeasurerRef.current = {
      key: labelMeasurerKey,
      measure: createCanvasMeasurer(labelFont),
      cache: new Map(),
    }
  }
  const labelMeasurer = labelMeasurerRef.current

  /**
   * 問いラベルの高さ。**ガターの行高はこれを勘定に入れる**——入れないと、
   * 長い問い（投げっぱなしの unknown）が次の行へ食い込む。
   * indent（ifExecuted）はラベル列を 16px 削るぶん折り返しが増える
   */
  const questionHeight = (text: string, indent: boolean): number => {
    if (text === '') return 0
    const key = `${indent ? 'q-indent' : 'q'}:${text}`
    let block = labelMeasurer.cache.get(key)
    if (block === undefined) {
      // **描画される文字列を測る。** GutterSlot は indent 時に「└ 」を前置して
      // 出すので、その接頭辞込みの文字列を測らないと折り返し回数がずれる
      // （素の question で測ると実測より短く出て行が食い込む）
      block = wrapWithin(gutterLabelText(text, indent), labelMeasurer.measure, labelFont.lineHeight, {
        maxWidth: QUESTION_LABEL_WIDTH - (indent ? GUTTER_INDENT : 0),
        minWidth: 0,
        insetX: 0,
        // GutterSlot のラベル列は py-1（上下 4px ずつ）
        insetY: 4,
      })
      if (labelMeasurer.cache.size >= MEASURE_CACHE_LIMIT) labelMeasurer.cache.clear()
      labelMeasurer.cache.set(key, block)
    }
    return block.height
  }

  const actorKeys = computeRowKeys(data.actors)
  const stepKeys = computeRowKeys(data.steps)

  const actorWidths = data.actors.map((actor) => wrap('actor', actor.name, ACTOR_WRAP).width)

  const stepViews = data.steps.map((step) => {
    const shape = stepShapeOf(step)
    const posed = poseQuestions(step)
    const labels = questionLabels(step)
    const hints = questionHints(step)
    const label = wrap(shape === 'self' ? 'self' : 'label', step.label, shape === 'self' ? SELF_WRAP : LABEL_WRAP)
    const answers = QUESTION_ORDER.filter((path) => posed[path]).map((path) => {
      const slot = readSlot(step, path)
      const text = slot.text ?? ''
      const state = slotStateOf(slot.decision)
      // 空スロットは全角1文字で1行ぶんの高さを測る（placeholder の語に
      // 依存させない。M22 で placeholder の「未定義」自体を消した）。
      // notApplicable は「考慮不要」の接頭ぶん実効幅が狭いので専用の WrapOptions で測る。
      // **箱名も 'answer-na' に分ける。** wrap のキャッシュ鍵は `${box}:${text}` で
      // WrapOptions を含まないので、同じ 'answer' のまま options だけ変えると、
      // 同一文字列が先に測られた側（handled/ghosts の ANSWER_WRAP）の結果を誤って
      // 引いてしまう（M22 レビューで発覚。ghosts（下の wrap 呼び出し）は常に
      // ANSWER_WRAP なので 'answer' のままでよい）
      const block = wrap(
        state === 'notApplicable' ? 'answer-na' : 'answer',
        text === '' ? 'あ' : text,
        state === 'notApplicable' ? NOT_APPLICABLE_ANSWER_WRAP : ANSWER_WRAP,
      )
      return {
        path,
        question: labels[path],
        hint: hints[path],
        state,
        text,
        // **問いラベルの方が高いことがある。** 高い方を採らないと行から食み出す
        height: Math.max(block.height, questionHeight(labels[path], path === 'ifExecuted')),
      }
    })
    // 立っていない問いへの答え（種別切替の残骸）。ガターにグレースロットで見せる
    const ghosts = unposedAnswers(step).map((path) => {
      const slot = readSlot(step, path)
      const text =
        slot.decision === 'notApplicable' && (slot.text === undefined || slot.text === '')
          ? NOT_APPLICABLE_LABEL
          : (slot.text ?? '')
      const block = wrap('answer', text === '' ? 'あ' : text, ANSWER_WRAP)
      // GhostSlot もラベル列を持つ（インデントは無い）
      return {
        path,
        text,
        height: Math.max(block.height, questionHeight(GHOST_QUESTION_LABEL[path], false)),
      }
    })
    // 参照切れは -1 のまま layout へ渡す（layout は範囲外を読み飛ばす契約）
    const fromIndex = data.actors.findIndex((a) => a.id === step.from)
    const toIndex = step.to === undefined ? null : data.actors.findIndex((a) => a.id === step.to)
    return { shape, label, answers, ghosts, fromIndex, toIndex }
  })

  const layoutInput: SeqLayoutInput = {
    actorWidths,
    steps: stepViews.map((view) => ({
      fromIndex: view.fromIndex,
      toIndex: view.toIndex,
      isSelf: view.shape === 'self',
      metrics: {
        labelWidth: view.label.width,
        labelHeight: view.label.height,
        slotHeights: [...view.answers.map((a) => a.height), ...view.ghosts.map((g) => g.height)],
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
  /** そのうち未回答のものだけ（帯のチップのジャンプ先。M22） */
  const unansweredCells: string[] = []
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
      if (answer.state === 'unanswered') unansweredCells.push(cell)
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
      const rawField =
        location.field === 'from' || location.field === 'to' || location.field === 'failures'
          ? location.field
          : 'row'
      // self は to セルを描画しないので、to への指摘は行全体（'row'）に回す（ブレスト決定7）。
      // 出し先は #N セル（上の rail number。UI ノート D5）
      const field =
        rawField === 'to' && data.steps[location.entityIndex]?.kind === 'self' ? 'row' : rawField
      const fields = invalidStepFields.get(location.entityIndex) ?? new Set<string>()
      fields.add(field)
      invalidStepFields.set(location.entityIndex, fields)
    }
  }
  const stepHas = (index: number, field: string): boolean =>
    invalidStepFields.get(index)?.has(field) ?? false

  // 帯の集計（M22。docs/missing-semantics.md 決定1）。**数え方の正は missing.ts**——
  // ここで stepViews から数え直さない（stepViews の `answer.state` は描画用に残る）。
  // 数えるのは立っている問いだけで、立たない問いへの答えは整合性検証が
  // unposed-answer として別に指摘する——その規則も missing.ts が持つ
  const seq = tallySequenceMissing(data)

  /** 編集結果を額縁へ渡し、次に編集させたいセルへフォーカスを予約する。
      focusField は data-cell の接尾辞。省略時は actor→name / step→label */
  const apply = (result: SeqEditResult, focusField?: string): void => {
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
    const fallback = focus.kind === 'actor' ? 'name' : 'label'
    setPendingFocus(key === undefined ? null : `${key}:${focusField ?? fallback}`)
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

  /** 帯のチップごとに巡る位置。kind → 直前に飛んだ順番 */
  const jumpAt = useRef<Record<string, number>>({})

  /**
   * 帯のチップから次の欠落へ飛ぶ（M22）。**フォーカス位置は起点にせず巡回 ref で数える**
   * （用語集と同じ。課題ツリーの nextOpenTarget とは違う——物足りなければ open-issues 行き）。
   * 未回答はガターの並び順、未記入は参加者 → ステップの順に巡る
   */
  const jumpToMissing = (kind: string): void => {
    const targets: (() => boolean)[] =
      kind === 'unanswered'
        ? unansweredCells.map((cell) => () => focusCell(cell))
        : [
            ...data.actors.flatMap((actor, index) =>
              actor.name === '' ? [() => focusActorAt(index)] : [],
            ),
            ...data.steps.flatMap((step, index) =>
              step.label === '' ? [() => focusStepLabelAt(index)] : [],
            ),
          ]
    if (targets.length === 0) return
    const next = ((jumpAt.current[kind] ?? -1) + 1) % targets.length
    jumpAt.current[kind] = next
    targets[next]()
  }

  /** コマンドをシーケンスの構造へ写像する。戻り値 true＝消費した（既定動作を止める） */
  const runCommand = (cmd: Command, target: CellTarget): boolean => {
    const index = target.index
    /** 並び替えの後もフォーカスを同じ欄に残すための接尾辞 */
    const fieldOf = (t: CellTarget): string | undefined => {
      if (t.kind === 'ref') return t.field
      if (t.kind === 'shape') return 'shape'
      return undefined // actor→name / label→label は apply の既定に任せる
    }
    switch (cmd) {
      case 'insert-item-after':
        // 答えを打った後の Enter も「次のステップへ進む」＝会議の流れ。
        // 新ステップの初期フォーカスは from（Tab 順の先頭＝レール左端。ブレスト決定1）
        apply(
          target.kind === 'actor' ? addActorAfter(data, index) : addStepAfter(data, index),
          target.kind === 'actor' ? undefined : 'from',
        )
        return true
      case 'delete-item':
        // deletableField を立てている欄（参加者名・ステップ文言）からしか来ない
        apply(target.kind === 'actor' ? removeActor(data, index) : removeStep(data, index))
        return true
      case 'move-item-up':
        apply(target.kind === 'actor' ? moveActor(data, index, -1) : moveStep(data, index, -1), fieldOf(target))
        return true
      case 'move-item-down':
        apply(target.kind === 'actor' ? moveActor(data, index, 1) : moveStep(data, index, 1), fieldOf(target))
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
      case 'focus-next-field':
        // ステップ 0 件のとき、末尾アクターの Tab には「次の欄」が無く額縁の外へ
        // 抜けてしまう。移動先を生やして from へ置く（ブレスト決定2）。
        // 1件以上あるときは従来どおり DOM 順の Tab に任せる（消費しない）
        if (target.kind === 'actor' && index === data.actors.length - 1 && data.steps.length === 0) {
          apply(addStepLast(data), 'from')
          return true
        }
        return false
      case 'cancel':
        // 編集の打ち切り。フォーカスを外すと CellInput が確定値に戻す
        ;(document.activeElement as HTMLElement | null)?.blur()
        return true
      default:
        // undo / redo は額縁（App）のグローバル層が取る。Tab のセル間移動は
        // DOM の順序（＝from→to→形→ラベル→答え）に委ねる。どちらも消費しない
        return false
    }
  }

  /** キーの判定はコアの resolveCommand に一元化する（rev 10章）。ここでキーを見ない */
  const handleKey = (
    e: React.KeyboardEvent,
    target: CellTarget,
    context: Omit<KeyContext, 'platform' | 'modalOpen'>,
  ): void => {
    const cmd = resolveCommand(toKeyEventLike(e), {
      platform: PLATFORM,
      modalOpen: anyModalOpen,
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
      // M1 には導出表示（検索・フィルタ）が無いので並び替えは常に有効
      reorderEnabled: true,
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
      reorderEnabled: true,
      hierarchical: false,
      horizontal: false,
    })
  }

  const onRefKeyDown = (e: React.KeyboardEvent, index: number, field: 'from' | 'to'): void => {
    handleKey(e, { kind: 'ref', index, field }, {
      // 選択専用のボタンであって文字を編集する欄ではない（sequence M3）
      editing: false,
      fieldEmpty: false,
      // **参照セルの Backspace で行を消さない。** M2 までと同じ判断
      deletableField: false,
      caretAtStart: false,
      caretAtEnd: false,
      // ↑↓ は候補の切替に使う（ActorRefCell が自前で処理する）。
      // Alt+↑↓ は resolveCommand が arrowsOwnedByField より先に判定するため、
      // これが true でも並び替えは通る（部品側が修飾キー付き矢印を委譲する）
      arrowsOwnedByField: true,
      reorderEnabled: true,
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
      // ↑↓ は4値の循環に使う（StepShapeCell が自前で処理する）。
      // Alt+↑↓ は resolveCommand が arrowsOwnedByField より先に判定するため、
      // これが true でも並び替えは通る（部品側が修飾キー付き矢印を委譲する）
      arrowsOwnedByField: true,
      reorderEnabled: true,
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
      // 答えを見比べている最中に図の時系列を動かさない。ガターは図と別の列
      reorderEnabled: false,
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
      onBlurCapture={(e) => {
        // フォーカスがエディタ外へ出たときだけ消す。行内・行間の移動は
        // 次の onFocusCapture が上書きするので、ここでは早まって消さない
        if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) {
          setFocusedRow(null)
        }
      }}
    >
      {/* 測定用の見本。**描画される文字と同じフォントのクラスを持たせる**ことで、
          測定と描画が同一の情報源を見る（rev 9章）。opacity-0 で見せないだけに
          するのは、display:none だと getComputedStyle がフォントを返さない環境があるため。
          見本が2本あるのは、答えセル（`SEQ_FONT_CLASS` = text-sm + leading-normal）と
          問いラベル列（`LABEL_FONT_CLASS` = text-sm）でフォント階級が違うため
          ——M26 でサイズは 14px に並んだが行間が違う（1.5 と 1.3）ので、
          1本を両方に使い回すと片方の高さを見誤る */}
      <span
        ref={probeRef}
        aria-hidden="true"
        className={`${SEQ_FONT_CLASS} pointer-events-none absolute left-0 top-0 select-none opacity-0`}
      >
        あ
      </span>
      <span
        ref={labelProbeRef}
        aria-hidden="true"
        className={`${LABEL_FONT_CLASS} pointer-events-none absolute left-0 top-0 select-none opacity-0`}
      >
        あ
      </span>

      {/* 見出し・操作・ヒントの帯。**面は透過させる**——下にあるキャンバスの
          パンとヒットテストを、帯の外側で奪わないため。
          **指摘の一覧はここに置かない**（rev 6章。額縁がキャンバスの外に出す）
          ——ここに置くと件数が増えるほど図を覆う */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-stretch">
        {/* 見出し・操作・ヒントを1行に畳む。**ヒントをボタンの下段に置かない**
            ——キャンバスは縦を図に使いたいので、帯が2段になるぶんだけ図が下がる */}
        <div className="pointer-events-none m-2 flex items-center gap-3">
          {/* **ファイル名（title）はここに出さない。** 額縁の `FileHeader` が
              4ツール共通で出しており、ここに置くと二重になる（rev 6章。
              指摘の一覧を額縁へ寄せたのと同じ理由） */}
          <button
            type="button"
            className={`${buttonBase} pointer-events-auto shrink-0 gap-1 border border-rule bg-surface px-3 py-1 text-base text-ink hover:bg-canvas`}
            onClick={() => apply(addStepLast(data), 'from')}
          >
            <Plus aria-hidden className="size-4" />
            ステップを追加
          </button>
          {/* マウスだけの人の唯一の参加者追加手段（sequence M3 で from/to のインライン作成を外したため） */}
          <button
            type="button"
            className={`${buttonBase} pointer-events-auto shrink-0 gap-1 border border-rule bg-surface px-3 py-1 text-base text-ink hover:bg-canvas`}
            onClick={() =>
              apply(
                data.actors.length === 0
                  ? addFirstActor(data)
                  : addActorAfter(data, data.actors.length - 1),
              )
            }
          >
            <Plus aria-hidden className="size-4" />
            参加者を追加
          </button>
          {/* 要対応の集計。**ガター上部（キャンバスの transform 層）からこの帯へ
              移した**（M25 の計画外修正）——実機で「破線チップが参加者ボックスと
              同じ高さ・同じ角丸・同じ破線黄で並び、図の要素に見える」と出たため。
              論点7 の「ガター上部に集計」はこの点だけ反転した（ガターのスロット列
              そのものはキャンバス内のまま。design-notes 論点7 の追記を見よ）。
              回答済・考慮不要は欠落ではないのでチップにしない（押す先が無い）。
              チップの pointer-events-auto は MissingTally 部品が持つ */}
          <MissingTally tally={seq.missing} onJump={jumpToMissing} className="shrink-0" />
          <span className="shrink-0 whitespace-nowrap text-base text-ink-muted">
            {`回答済 ${seq.handled} ／ 考慮不要 ${seq.notApplicable}`}
          </span>
          <KeyHints hints={SEQ_HINTS} className="ml-auto shrink-0 bg-surface px-2 py-1" />
        </div>
      </div>

      {/* 背景レイヤ: ライフラインの縦線
          （ゾーン導入時はその帯もこの層に載る） */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 origin-top-left"
        style={{ transform: cssTransform(transform) }}
        data-layer="background"
      >
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
      </div>

      <SequenceEdges steps={edgeSteps} layout={layout} transform={transform} />

      {/* **レイヤ自体は操作を取らない。** ここは inset-0 の透明な面。
          pointer-events を切らないと、この面がキャンバス全体を覆う単一の
          ヒット領域になり、useViewport がコンテナに付けた背景パン／ズームの
          ハンドラまで mousedown が届かなくなる。操作を受けるのはセルの矩形
          だけでよいので、各セル側で auto に戻す */}
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
            ? 'border-invalid bg-invalid-face'
            : actor.name === ''
              ? // 名前が空＝未記入（M22 決定1）。語で埋めず面で示す
                'border-dashed border-missing bg-missing-face'
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
                className={`h-full w-full rounded-sm text-center ${ACTOR_BOX_CLASS} ${face} text-sm leading-normal text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-ring`}
                aria-label={`参加者${index + 1}の名前`}
                data-cell={`${key}:name`}
                value={actor.name}
                onValueChange={(next) => onChange(setActorName(data, index, next), `${key}:name`)}
                onFieldKeyDown={(e, state) => onActorKeyDown(e, index, state)}
              />
            </div>
          )
        })}

        {/* ステップ行 */}
        {data.steps.map((step, index) => {
          const key = stepKeys[index]
          const view = stepViews[index]
          const row = layout.rows[index]
          const isSelf = view.shape === 'self'
          // 通常時は不透明の bg-surface を敷く——枠線の無いラベルセルが
          // 入力可能に見えないという実機フィードバックへの対応。
          // 文言が空＝未記入（M22 決定1）は破線＋淡い面で示す。**枠のクラスを
          // ここで自前に持つ**のは、通常時の枠が self（SELF_BOX_CLASS ＋
          // border-rule）と通常（枠なしの LABEL_BOX_CLASS）で持ち方が違うため。
          // 面と枠のクラスは片方だけ出す（:871 のコメントと同じ理由）
          const labelMissing = step.label === ''
          const labelFace = labelMissing
            ? 'border border-dashed border-missing bg-missing-face'
            : 'bg-surface'
          // 文言は矢印の真上に置く（layout の arrowY は文言の高さから決まっている）
          const labelTop = row.arrowY - ARROW_GAP - view.label.height
          // 文言の置き方はレイアウトが決める（`labelLeft`）。**ここで
          // 計算し直さないこと**——ガターの左端は文言の右端から導いており、
          // 置き方が2箇所にあると図が静かに重なる（実機確認で踏んだ）
          const labelLeft = row.labelLeft
          // 編集の足場（#番号 / from / to / 形）はレールの中の固定 x に置く。
          // **矢印の位置も参加者の数も見ない**——だから from==to の呼出（線が引けない）でも
          // 定位置に出るし、細い図でガターに被ることもない
          const railTop = row.top + RAIL_TOP_INSET
          return (
            <div key={key} onFocusCapture={() => setFocusedRow(index)}>
              {/* レールの通し番号。aria-hidden にするのは、各セルの aria-label が
                  すでに「ステップN の…」と名乗っており、二重に読ませないため。
                  **行全体の指摘（id 重複・self の to など欄を特定できない指摘）は
                  ここに出す**——行を帯で染めると問題箇所が特定できない（UI ノート D5） */}
              <div
                aria-hidden="true"
                className={`absolute select-none rounded-sm text-center text-sm ${
                  stepHas(index, 'row')
                    ? 'text-invalid bg-invalid-face outline-1 -outline-offset-1 outline-invalid'
                    : 'text-ink-muted'
                }`}
                style={{ left: RAIL_NUM_X, top: railTop + 4, width: RAIL_NUM_WIDTH }}
              >
                {`#${index + 1}`}
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
                  {...menuPropsFor(`${key}:from`)}
                  onFieldKeyDown={(e) => onRefKeyDown(e, index, 'from')}
                />
              </div>
              {/* 向きのグリフと受け手は self では出さない（宛先が無い）。
                  空けたぶんだけ種別セルの x は動かない——**列が揃っていることが
                  レールの値打ち**なので、詰めない */}
              {!isSelf && (
                <>
                  <div
                    aria-hidden="true"
                    className="absolute select-none text-center text-sm text-ink-muted"
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
                      {...menuPropsFor(`${key}:to`)}
                      onFieldKeyDown={(e) => onRefKeyDown(e, index, 'to')}
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
                  {...menuPropsFor(`${key}:shape`)}
                  onFieldKeyDown={(e) => onShapeKeyDown(e, index)}
                />
              </div>

              {/* Tab 順は視覚順（レール→図→ガター）に合わせ、from/to/種別のあとに置く。
                  実機フィードバックによる確定事項——実機確認前は文言が先頭で、
                  from/to は既定値が入っているため打つ必要が薄いにもかかわらず
                  最初に Tab が止まっていた */}
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
                    isSelf
                      ? `${SELF_BOX_CLASS}${labelMissing ? '' : ' border-rule'}`
                      : LABEL_BOX_CLASS
                  } ${labelFace} text-center text-sm leading-normal text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-ring`}
                  aria-label={`ステップ${index + 1}の文言`}
                  data-cell={`${key}:label`}
                  value={step.label}
                  onValueChange={(next) => onChange(setStepLabel(data, index, next), `${key}:label`)}
                  onFieldKeyDown={(e, state) => onLabelKeyDown(e, index, state)}
                />
              </div>

              {/* ガターの行ブラケット＋行見出し（ブレスト決定9）。答えスロットが
                  どのステップの行かを、図の番号と縦線で括って見せる。
                  M2: ghost スロットも同じ列に積むので、末尾は答え・ghost の
                  どちらが最後に来ても正しく括れるよう ghost 込みで計算し直す */}
              {(() => {
                const lastIndex = view.answers.length + view.ghosts.length - 1
                const lastHeight =
                  view.ghosts.length > 0
                    ? view.ghosts[view.ghosts.length - 1].height
                    : view.answers.length > 0
                      ? view.answers[view.answers.length - 1].height
                      : 0
                const slotsBottom =
                  lastIndex < 0
                    ? // 答え・ghost が無い行は「問いは立たない」の1行ぶんを見積もる。
                      // 小さい字のもう1行ぶん——GUTTER_HEADING_HEIGHT と同じもの
                      row.top + GUTTER_HEADING_HEIGHT + GUTTER_HEADING_HEIGHT
                    : row.slotTops[lastIndex] + lastHeight
                return (
                  <>
                    <div
                      aria-hidden="true"
                      className={`absolute border-l-2 ${focusedRow === index ? 'border-ink-muted' : 'border-rule'}`}
                      style={{ left: layout.gutterX - 8, top: row.top, height: slotsBottom - row.top }}
                    />
                    <div
                      aria-hidden="true"
                      className="absolute truncate text-sm text-ink-muted"
                      style={{ left: layout.gutterX, top: row.top, width: layout.gutterWidth }}
                    >
                      {step.label === '' ? `#${index + 1}` : `#${index + 1} ${step.label}`}
                    </div>
                  </>
                )
              })()}

              {/* ガター: 立っている問いのスロット群。reply は問いが無いので、
                  空白にせず「呼出側が扱う」ことを言う（design-notes 論点3）。
                  **一般文言は answers も ghosts も無いときだけ出す。** ghosts が
                  あるときに一般文言まで出すと、どちらもガターの同じ先頭位置
                  （row.top + GUTTER_HEADING_HEIGHT）を取り合って重なる
                  （layout.ts は一般文言の分の高さを知らない）。ghost は
                  残骸そのものを見せる情報量が上位なので、一般文言側を省く */}
              {view.answers.length === 0 && view.ghosts.length === 0 ? (
                <div
                  className="absolute text-sm text-ink-muted"
                  style={{ left: layout.gutterX, top: row.top + GUTTER_HEADING_HEIGHT, width: layout.gutterWidth }}
                >
                  {view.shape === 'reply'
                    ? '─ 応答が返らないときは呼出側の「結果がわからなかったら？」に書く'
                    : '─ 問いは立たない'}
                </div>
              ) : (
                view.answers.map((answer, slotIndex) => (
                  <GutterSlot
                    key={`${key}:${answer.path}`}
                    question={answer.question}
                    hint={answer.hint}
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

              {/* ガター: 立っていない答え（種別切替の残骸）のグレースロット
                  （ブレスト決定4）。通常スロットの後、ghosts の順で積む */}
              {view.ghosts.map((ghost, ghostIndex) => (
                <GhostSlot
                  key={`${key}:ghost:${ghost.path}`}
                  question={GHOST_QUESTION_LABEL[ghost.path]}
                  hint={GHOST_QUESTION_HINT[ghost.path]}
                  text={ghost.text}
                  aria-label={`ステップ${index + 1}の立っていない答え「${GHOST_QUESTION_LABEL[ghost.path]}」: この答えを削除`}
                  x={layout.gutterX}
                  y={row.slotTops[view.answers.length + ghostIndex]}
                  labelWidth={QUESTION_LABEL_WIDTH}
                  answerWidth={ANSWER_BOX_WIDTH}
                  height={ghost.height}
                  onDelete={() => setConfirmTarget({ index, path: ghost.path })}
                />
              ))}
            </div>
          )
        })}

        {/* 末尾のステップの下にも1つ。帯のボタンは図をスクロールしても
            消えない動線として残す（こちらは「続きを足す」位置の手がかり） */}
        <div
          className="pointer-events-auto absolute"
          style={{
            left: DIAGRAM_MARGIN,
            top: layout.totalHeight + ROW_GAP,
          }}
        >
          <button
            type="button"
            aria-label="末尾にステップを追加"
            // **破線にしないこと。** rev 9章の欠落軸は「破線＝まだ見ていない」を
            // 意味づけており、破線のボタンは図の欠落要素に見える（M25 で破線チップを
            // ガターから帯へ移したのと同じ理由）。副次であることは文字色で示す
            className={`${buttonBase} gap-1 border border-rule bg-surface px-3 py-1 text-base text-ink-muted hover:bg-canvas hover:text-ink`}
            onClick={() => apply(addStepLast(data), 'from')}
          >
            <Plus aria-hidden className="size-4" />
            ステップを追加
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmTarget !== null}
        title="答えを削除しますか？"
        description={
          confirmTarget === null
            ? ''
            : `「${GHOST_QUESTION_LABEL[confirmTarget.path]}」への答えを削除します。削除後は Undo で戻せます。削除せず種別を元に戻せば、答えはそのまま復活します。`
        }
        confirmLabel="削除する"
        onConfirm={() => {
          if (confirmTarget !== null) onChange(removeAnswer(data, confirmTarget.index, confirmTarget.path), null)
          setConfirmTarget(null)
        }}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  )
}
