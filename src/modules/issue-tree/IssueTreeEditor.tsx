import { Plus } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FieldState } from '@/components/CellInput'
import { KeyHints } from '@/components/KeyHints'
import { buttonBase } from '@/components/button-styles'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  createCanvasMeasurer,
  FALLBACK_CANVAS_FONT,
  FALLBACK_SMALL_FONT,
  readCanvasFont,
  sameFont,
  type CanvasFont,
} from '@/core/canvas/canvas-font'
import { buildTree, siblingsOf } from '@/core/canvas/flat-tree'
import { useViewport } from '@/core/canvas/use-viewport'
import { cssTransform, type Rect } from '@/core/canvas/viewport'
import type { MeasureWidth } from '@/core/canvas/wrap'
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
import type { IssueTreeSchemaVersion1 } from '@/types/issue-tree'
import { cellKey, hypothesisCellKey, issueCellKey, type HypothesisCell } from './cell-keys'
import {
  addChildIssue,
  addHypothesis,
  addHypothesisAfter,
  addPendingNote,
  addPendingNoteAfter,
  addRootIssue,
  addSiblingIssueAfter,
  appendDeferral,
  appendJudgement,
  deleteHypothesis,
  deleteIssueSubtree,
  moveHypothesis,
  moveIssueSibling,
  movePendingNote,
  promoteNote,
  removePendingNote,
  setEventNote,
  setHypothesisText,
  setIssueText,
  setPendingNote,
  setRationale,
  type EditResult,
  type FocusTarget,
} from './commands'
import {
  EVENT_KIND_LABELS,
  poseQuestions,
  SUPPRESSED_NOTE,
  suppressedIssueIds,
  tallyLine,
  tallyQuestions,
  type DeferralKind,
  type JudgementKind,
} from './derive'
import { HypothesisCard } from './HypothesisCard'
import { IssueBox } from './IssueBox'
import { IssueTreeEdges } from './IssueTreeEdges'
import { layoutIssueTree, type IssueTreeFonts } from './layout'
import { BADGE_HEIGHT, ROW_GAP } from './measure'

/** 測定結果のキャッシュ。会議1回分の打鍵で無限に増えないよう頭を押さえる */
const MEASURE_CACHE_LIMIT = 2000

/** カード・ノードの文言に当たるクラスのうち、フォントを決めている部分 */
const BODY_FONT_CLASS = 'text-sm'
/** 由来・メモ・イベントの根拠に当たるクラス */
const SMALL_FONT_CLASS = 'text-xs'

/** 木の操作ヒント。`$mod` / `$alt` は KeyHints が解決する */
const ISSUE_TREE_HINTS: readonly KeyHint[] = [
  { keys: 'Enter', label: '兄弟を追加' },
  { keys: 'Tab', label: '子課題を追加' },
  { keys: '$mod+Enter', label: '仮説／判断を追加' },
  { keys: '←→', label: '親子移動' },
  { keys: '$alt+↑↓', label: '並び替え' },
]

/**
 * ドロップダウンに出す種別の並び。**文言は `EVENT_KIND_LABELS` から引く**
 *（打ち直すと、アプリの画面と Skill の報告が食い違う）。
 * 並びは意味の近いものを隣に置く——検証した2つ、検証せず決めた2つ、見送り2つ
 */
const JUDGEMENT_KINDS: readonly JudgementKind[] = [
  'supported',
  'rejected',
  'supportedWithoutTest',
  'rejectedWithoutTest',
  'deferred',
  'deferredToMainDev',
]
/** 課題ノードに付けられるのは見送り系2種だけ（スキーマの制約） */
const DEFERRAL_KINDS: readonly DeferralKind[] = ['deferred', 'deferredToMainDev']

const PLATFORM = currentPlatform()

/**
 * 幅の測定器（キャッシュ付き）。**キャッシュはフォントに紐づく**ので、
 * 測定器と同じ入れ物で作って一緒に捨てる（別々に持つと片方だけ古くなる）
 */
function cachedMeasurer(font: CanvasFont): { measure: MeasureWidth; lineHeight: number } {
  // createCanvasMeasurer は canvas を取れない環境（jsdom）で自ら概算器に落ちる
  const base = createCanvasMeasurer(font)
  const cache = new Map<string, number>()
  return {
    lineHeight: font.lineHeight,
    measure: (text) => {
      let width = cache.get(text)
      if (width === undefined) {
        width = base(text)
        if (cache.size >= MEASURE_CACHE_LIMIT) cache.clear()
        cache.set(text, width)
      }
      return width
    },
  }
}

interface KindMenuProps<K extends JudgementKind> {
  /** アクセシブル名（トリガーのボタン） */
  label: string
  /** ボタンに出す短い文言 */
  triggerText: string
  kinds: readonly K[]
  onPick: (kind: K) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * 種別を1つ選ぶドロップダウン（見送り／判断）。**開閉は親が持つ制御コンポーネント**
 *——同時に1つしか開かないことを、開いているセルの鍵1つで構造的に保証する
 *（`SequenceEditor` の `openCell` / `menuPropsFor` と同じ形）。
 *
 * ネイティブの `select` にしないのは、ブラウザ既定のドロップダウンがキャンバスの
 * transform を無視して出るため（`StepShapeCell` と同じ理由）
 */
function KindMenu<K extends JudgementKind>(props: KindMenuProps<K>) {
  // 選んだときだけ Radix の「トリガーへフォーカスを戻す」を降ろす。
  // 追記した直後は根拠の欄へフォーカスを予約してあり、取り合うと打てなくなる
  const picked = useRef(false)
  return (
    <DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
      <DropdownMenuTrigger
        type="button"
        aria-label={props.label}
        className={`${buttonBase} pointer-events-auto border border-rule bg-surface px-1 text-xs text-ink-muted outline-none hover:bg-canvas focus:ring-2 focus:ring-inset focus:ring-ring`}
      >
        {props.triggerText}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(e) => {
          if (!picked.current) return
          picked.current = false
          e.preventDefault()
        }}
      >
        {props.kinds.map((kind) => (
          <DropdownMenuItem
            key={kind}
            onSelect={() => {
              picked.current = true
              // **閉じるのを Radix に任せず、ここで先に閉じる。** あちらの
              // 「選んだら閉じる」は選択イベントの後に走るので、それまでは
              // `FocusScope` が focusin を捕まえてメニューの中へ引き戻す
              // ——予約したフォーカスが当たった直後に奪われ、メニューが
              // 消えると行き場を失う（`activeElement` が body に落ちる）。
              // 同じ更新の中で閉じれば、レイヤの撤去と `FocusScope` の後始末が
              // 先に済み、パッシブ効果のフォーカス予約が最後に当たる
              props.onOpenChange(false)
              props.onPick(kind)
            }}
          >
            {EVENT_KIND_LABELS[kind]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 課題ツリーのエディタ（規約3）。
 *
 * 土台は `src/modules/logic-tree/LogicTreeEditor.tsx`——フォントの世代管理・
 * 測定器のキャッシュ・`pendingFocus` の予約・3レイヤの transform は写しで、
 * **測定するフォントが2種類（`text-sm` / `text-xs`）に増えた**ぶんだけ広げてある。
 * ドロップダウンの制御は `src/modules/sequence/SequenceEditor.tsx` の
 * `openCell` / `menuPropsFor` の写し。
 */
export function IssueTreeEditor({
  data,
  onChange,
  issues,
  modalOpen,
}: EditorProps<IssueTreeSchemaVersion1>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const smallProbeRef = useRef<HTMLSpanElement>(null)
  const [font, setFont] = useState<CanvasFont>(FALLBACK_CANVAS_FONT)
  const [smallFont, setSmallFont] = useState<CanvasFont>(FALLBACK_SMALL_FONT)

  // 見送り／判断のドロップダウンは同時に1つだけ開く。**開いているセルの鍵を
  // 1つだけ持つ**ことで構造的に複数オープンを禁止する（sequence M3 Task 11b）。
  // **キャンバスのズーム・パンは止めない**——止めると「複数開いたまま1つ閉じると
  // キャンバスが復活する」に戻る。Radix の FocusScope（modal 既定）が
  // メニュー内にキーを閉じ込めるので、操作言語への漏れは起きない
  const [openCell, setOpenCell] = useState<string | null>(null)
  /** セル鍵ごとの open props。**`data-cell` とは別の名前空間**（下の menuKey） */
  const menuPropsFor = (cell: string): { open: boolean; onOpenChange: (open: boolean) => void } => ({
    open: openCell === cell,
    onOpenChange: (open) => setOpenCell(open ? cell : null),
  })

  // ズーム・パン（Ctrl+ホイール／Space・中ボタンのドラッグ）と新しい課題への追従。
  // モーダルが開いている間は止める（キーはモーダルが取る。rev 10章 境界規則）
  const { transform, spaceHeld, ensureVisible } = useViewport(containerRef, !modalOpen)

  // 構造操作の後、新しい DOM が出てからフォーカスを移すための予約
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)

  // 帯の「仮説を追加」がどの課題に足すか。最後にフォーカスがあった課題の鍵
  //（配列位置ではなく鍵で持つ——構造操作で位置は動くが鍵は動かない）
  const [lastIssueKey, setLastIssueKey] = useState<string | null>(null)

  // Web フォントの読み込みで canvas の measureText の結果は変わるが、
  // getComputedStyle が返す値は変わらない（宣言されたファミリ列を返すだけで、
  // どのフェイスに解決されたかは映らない）。だからフォントの同一性では
  // 判定できず、読み込み完了を世代として数えて測り直す
  const [fontGeneration, setFontGeneration] = useState(0)

  const readFont = (): void => {
    setFont((prev) => {
      const next = readCanvasFont(probeRef.current)
      return sameFont(prev, next) ? prev : next
    })
    setSmallFont((prev) => {
      const next = readCanvasFont(smallProbeRef.current)
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

  // 測定器はフォントが変わったときだけ作り直す。
  //
  // 鍵に lineHeight と世代を混ぜる。**`font.font` の文字列には行間が入っていない**
  // のに折り返しの高さは lineHeight に依存するので、書体が同じまま行間だけ
  // 変わるとキャッシュが古い高さを返し続ける。世代は上の document.fonts.ready が
  // 進めるカウンタで、「読み込み後に測り直す」を成立させるのはこちらである。
  // **2種類のフォントを1つの入れ物に持つ**——鍵は文字列だけで、どちらの
  // フォントで測ったかを持っていないので、混ぜると片方が他方の幅を返す
  const measurerKey = `${font.font}|${font.lineHeight}|${smallFont.font}|${smallFont.lineHeight}|${fontGeneration}`
  const measurerRef = useRef<{ key: string; fonts: IssueTreeFonts } | null>(null)
  if (measurerRef.current === null || measurerRef.current.key !== measurerKey) {
    measurerRef.current = {
      key: measurerKey,
      fonts: { body: cachedMeasurer(font), small: cachedMeasurer(smallFont) },
    }
  }
  const fonts = measurerRef.current.fonts

  const issueKeys = computeRowKeys(data.issues)
  const hypothesisKeys = computeRowKeys(data.hypotheses)
  const posed = poseQuestions(data)
  const layout = layoutIssueTree(data, posed, fonts)
  const built = buildTree(data.issues)
  const suppressedIds = suppressedIssueIds(data.issues)
  const issueSuppressed = data.issues.map((node) => suppressedIds.has(node.id))

  /** フォーカス移動のときに「見えるところまで寄せる」ための矩形。data-cell 鍵で引く */
  const rects = new Map<string, Rect>()
  layout.issues.forEach((placement, index) => {
    if (placement !== null) rects.set(issueCellKey(issueKeys[index]), placement.rect)
  })
  layout.hypotheses.forEach((placement, index) => {
    if (placement === null) return
    const key = hypothesisKeys[index]
    // カードの中の欄はどれもカード全体を見せる（由来だけ見えても文脈が無い）
    rects.set(hypothesisCellKey(key, { cell: 'hypothesis' }), placement.rect)
    rects.set(hypothesisCellKey(key, { cell: 'rationale' }), placement.rect)
    placement.notes.forEach((_r, noteIndex) => {
      rects.set(hypothesisCellKey(key, { cell: 'note', noteIndex }), placement.rect)
    })
    placement.events.forEach((_r, eventIndex) => {
      rects.set(hypothesisCellKey(key, { cell: 'event', eventIndex }), placement.rect)
    })
  })

  useEffect(() => {
    if (pendingFocus === null) return
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-cell="${pendingFocus}"]`)
    // **スクロールはさせない。** 画面外の要素にフォーカスするとブラウザが
    // 祖先の scrollLeft/scrollTop を動かすが、位置は transform で持っており
    // panIntoView はスクロール量を勘定に入れていない（二重に動いて狂う）
    el?.focus({ preventScroll: true })
    const rect = rects.get(pendingFocus)
    // 打った直後の課題が画面外だと、何を打っているか見えない
    if (rect !== undefined) ensureVisible(rect)
    setPendingFocus(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rects は毎レンダー作り直される導出値。予約が入ったときだけ走らせる
  }, [pendingFocus])

  // 赤表示の対象。entityId のプレフィクスでどちらの配列の話かを見分ける
  //（ConsistencyLocation は配列を1つしか想定していないため。consistency.ts の規約）
  const invalidIssues = new Set<number>()
  const invalidHypotheses = new Set<number>()
  for (const issue of issues) {
    for (const location of issue.locations) {
      if (location.entityIndex === null) continue
      if (location.entityId.startsWith('hypothesis_')) invalidHypotheses.add(location.entityIndex)
      else if (location.entityId.startsWith('issue_')) invalidIssues.add(location.entityIndex)
    }
  }

  /**
   * 編集結果を額縁へ渡し、次に編集させたい欄へフォーカスを予約する。
   * `fallback` は結果が行き先を持たなかったときの代わり（`deleteHypothesis` が使う）
   */
  const apply = (result: EditResult, fallback: FocusTarget | null = null): void => {
    // 動かなかった編集は同じ参照を返す（commands.ts の契約）。ここで落とさないと
    // 内容が同じコミットが積まれ、Undo が空振りする
    if (result.data === data) return
    // 構造操作は mergeKey に null を渡す（1操作1コミット。rev 10章）
    onChange(result.data, null)
    const focus = result.focus ?? fallback
    setPendingFocus(
      focus === null
        ? null
        : cellKey(focus, computeRowKeys(result.data.issues), computeRowKeys(result.data.hypotheses)),
    )
  }

  /** data-cell 鍵のセルへ移る。戻り値 true＝移った（＝キーを消費した） */
  const focusCell = (cell: string | undefined): boolean => {
    if (cell === undefined) return false
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)
    if (!el) return false
    // pendingFocus の effect（上）と同じ理由: 画面外の要素に focus するとブラウザが
    // 祖先の scrollLeft/scrollTop を動かすが、位置は transform で持っており
    // panIntoView はスクロール量を見ていない（追従と二重に動いて以後ずれ続ける）。
    // overflow-hidden にはスクロールバーが無いので、一度ずれると UI から戻す手段が無い
    el.focus({ preventScroll: true })
    const rect = rects.get(cell)
    if (rect !== undefined) ensureVisible(rect)
    return true
  }

  const focusIssueAt = (index: number | null | undefined): boolean => {
    if (index === null || index === undefined) return false
    const key = issueKeys[index]
    return key === undefined ? false : focusCell(issueCellKey(key))
  }

  /** 兄弟の並びの中で delta だけ動いた位置の課題へ移る */
  const focusIssueSibling = (index: number, delta: -1 | 1): boolean => {
    const siblings = siblingsOf(built, index)
    const pos = siblings.indexOf(index)
    return pos < 0 ? false : focusIssueAt(siblings[pos + delta])
  }

  /**
   * 同じ課題にぶら下がる仮説の中で1つ動く。**課題をまたがない**
   *——またぐと図の別の枝へ飛び、いま見ている課題の文脈が外れる
   */
  const focusHypothesisSibling = (index: number, delta: -1 | 1): boolean => {
    const ref = data.hypotheses[index]
    const to = data.hypotheses[index + delta]
    if (ref === undefined || to === undefined || to.issueId !== ref.issueId) return false
    const key = hypothesisKeys[index + delta]
    return key === undefined ? false : focusCell(hypothesisCellKey(key, { cell: 'hypothesis' }))
  }

  /** 仮説の持ち主の課題（`deleteHypothesis` が行き先を持たなかったときの戻り先） */
  const ownerIssueFocus = (index: number): FocusTarget | null => {
    const issueId = data.hypotheses[index]?.issueId
    const at = issueId === undefined ? -1 : data.issues.findIndex((n) => n.id === issueId)
    return at < 0 ? null : { cell: 'issue', index: at }
  }

  /** ドロップダウンの鍵。**`data-cell` と同じ文字列にしないこと**——フォーカスの
      予約は `data-cell` で引くので、衝突するとトリガーを掴んでしまう */
  const deferralMenuKey = (issueKey: string): string => `menu:defer:${issueKey}`
  const judgementMenuKey = (hypothesisKey: string): string => `menu:judge:${hypothesisKey}`

  /** 編集の打ち切り。フォーカスを外すと CellInput が確定値に戻す */
  const blurActive = (): void => {
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  /**
   * コマンドを課題の構造へ写像する。戻り値 true＝消費した（既定動作を止める）。
   *
   * **キーの判定はコアの `resolveCommand` が済ませている。** ここで
   * `e.key` を見ないこと（rev 10章 実装規約）
   */
  const runIssueCommand = (cmd: Command, index: number): boolean => {
    switch (cmd) {
      case 'insert-item-after':
        apply(addSiblingIssueAfter(data, index))
        return true
      case 'insert-child':
        apply(addChildIssue(data, index))
        return true
      case 'delete-item':
        apply(deleteIssueSubtree(data, index))
        return true
      case 'move-item-up':
        apply(moveIssueSibling(data, index, -1))
        return true
      case 'move-item-down':
        apply(moveIssueSibling(data, index, 1))
        return true
      case 'focus-prev':
        return focusIssueSibling(index, -1)
      case 'focus-next':
        return focusIssueSibling(index, 1)
      case 'focus-parent':
        return focusIssueAt(built.parents[index])
      case 'focus-child':
        return focusIssueAt(built.children[index]?.[0])
      // **主修飾キー＋Enter を「そのセルの主たる副操作」に写像する**（rev 10章
      // 「意味の解決はコアのまま、写像だけツール側」。sequence M2 と同じ層の適用）。
      // 課題セルでは仮説の追加——発散フェーズで最も打鍵数が多い操作であり、
      // `Tab`（子課題）と `Enter`（兄弟課題）は家族標準に押さえられている
      case 'toggle-item-state':
        apply(addHypothesis(data, index))
        return true
      case 'cancel':
        blurActive()
        return true
      default:
        // undo / redo は額縁のグローバル層が取る
        return false
    }
  }

  /** コマンドを仮説カードの構造へ写像する。戻り値 true＝消費した */
  const runCardCommand = (cmd: Command, index: number, cell: HypothesisCell): boolean => {
    switch (cmd) {
      case 'insert-item-after':
        if (cell.cell === 'hypothesis') {
          apply(addHypothesisAfter(data, index))
          return true
        }
        // 由来の Enter は「メモを1件足す」（移動先が無ければ生やす。sequence M2 の前例）。
        // **末尾に足すのはこちらだけ**——由来は間に差し込む欄ではない
        if (cell.cell === 'rationale') {
          apply(addPendingNote(data, index))
          return true
        }
        // メモの Enter は**押した位置の次**（コアのコマンド名どおり insert-item-after）。
        // 末尾に足すと、3件の1件目で押したときに生まれるのは4件目になり、
        // フォーカスがカードの一番下へ飛ぶ
        if (cell.cell === 'note') {
          apply(addPendingNoteAfter(data, index, cell.noteIndex))
          return true
        }
        // イベントの根拠から次を生やさない（イベントは追記操作でしか増えない）
        return false
      case 'delete-item':
        // deletableField を立てている欄（仮説の文言・メモ）からしか来ない
        if (cell.cell === 'hypothesis') {
          // **前の仮説が無いときは持ち主の課題へ返す**——`deleteHypothesis` は
          // 行き先に null を返すので、そのままだとフォーカスが宙に浮き、
          // 続けて打とうとしたキーがどこにも入らない
          apply(deleteHypothesis(data, index), ownerIssueFocus(index))
          return true
        }
        if (cell.cell === 'note') {
          apply(removePendingNote(data, index, cell.noteIndex))
          return true
        }
        return false
      case 'move-item-up':
      case 'move-item-down': {
        const delta = cmd === 'move-item-up' ? -1 : 1
        if (cell.cell === 'hypothesis') {
          apply(moveHypothesis(data, index, delta))
          return true
        }
        if (cell.cell === 'note') {
          apply(movePendingNote(data, index, cell.noteIndex, delta))
          return true
        }
        // 由来とイベントは1件ずつ／追記専用なので並び替えの意味が無い
        return false
      }
      case 'focus-prev':
        return cell.cell === 'hypothesis' ? focusHypothesisSibling(index, -1) : false
      case 'focus-next':
        return cell.cell === 'hypothesis' ? focusHypothesisSibling(index, 1) : false
      case 'toggle-item-state':
        // 仮説の文言では判断イベントのドロップダウンを開く（追記する種別を選ばせる）
        if (cell.cell === 'hypothesis') {
          setOpenCell(judgementMenuKey(hypothesisKeys[index]))
          return true
        }
        // メモは最新イベントの根拠へ移す。**イベント0件なら何も起きない**
        //（promoteNote が同じデータを返し、apply が落とす）
        if (cell.cell === 'note') {
          apply(promoteNote(data, index, cell.noteIndex))
          return true
        }
        return false
      case 'cancel':
        blurActive()
        return true
      default:
        // undo / redo は額縁のグローバル層が、Tab の欄移動は DOM の順序が取る
        return false
    }
  }

  /** 課題セルのキー入力。キーの判定はコアの resolveCommand に委ねる（rev 10章） */
  const onIssueKeyDown = (e: React.KeyboardEvent, index: number, state: FieldState): void => {
    const context: KeyContext = {
      platform: PLATFORM,
      modalOpen,
      editing: true,
      fieldEmpty: state.empty,
      // 課題の文言は1つしかないので、空欄 Backspace の削除を認める欄でもある
      deletableField: true,
      caretAtStart: state.caretAtStart,
      caretAtEnd: state.caretAtEnd,
      arrowsOwnedByField: false,
      // M1 には導出表示（検索・フィルタ）が無いので並び替えは常に有効
      reorderEnabled: true,
      // 子を持てる構造。Tab＝子課題、←→＝親子移動になる
      hierarchical: true,
      horizontal: false,
    }
    const cmd = resolveCommand(toKeyEventLike(e), context)
    if (cmd === null) return
    if (runIssueCommand(cmd, index)) e.preventDefault()
  }

  /** 仮説カードの中のセルのキー入力 */
  const onCardKeyDown = (
    e: React.KeyboardEvent,
    index: number,
    state: FieldState,
    cell: HypothesisCell,
  ): void => {
    const context: KeyContext = {
      platform: PLATFORM,
      modalOpen,
      editing: true,
      fieldEmpty: state.empty,
      // **「その欄が空になったら要素ごと消してよいか」で決める。**
      // 由来とイベントの根拠は false——空にしただけで仮説やイベントが消えると、
      // 書き直すたびに消えることになる
      deletableField: cell.cell === 'hypothesis' || cell.cell === 'note',
      caretAtStart: state.caretAtStart,
      caretAtEnd: state.caretAtEnd,
      arrowsOwnedByField: false,
      reorderEnabled: true,
      // 仮説の側に「子」という意味は無い。Tab は欄移動（DOM 順）に委ねる
      hierarchical: false,
      horizontal: false,
    }
    const cmd = resolveCommand(toKeyEventLike(e), context)
    if (cmd === null) return
    if (runCardCommand(cmd, index, cell)) e.preventDefault()
  }

  /** 帯の「課題を追加」。0件なら根を作り、あれば末尾の課題の隣（根の上では子）に足す */
  const addIssueFromBanner = (): void => {
    apply(
      data.issues.length === 0
        ? addRootIssue(data)
        : addSiblingIssueAfter(data, data.issues.length - 1),
    )
  }

  /** 帯の「仮説を追加」。最後に触っていた課題（無ければ末尾の課題）に足す */
  const addHypothesisFromBanner = (): void => {
    const at = lastIssueKey === null ? -1 : issueKeys.indexOf(lastIssueKey)
    apply(addHypothesis(data, at < 0 ? data.issues.length - 1 : at))
  }

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden bg-canvas bg-grid-paper ${
        spaceHeld ? 'cursor-grab' : ''
      }`}
    >
      {/* 測定用の見本。**描画されるセルと同じフォントのクラスを持たせる**ことで、
          測定と描画が同一の情報源を見る（rev 9章）。opacity-0 で見せないだけに
          するのは、display:none だと getComputedStyle がフォントを返さない環境が
          あるため。見本が2本あるのは、課題ノード・仮説の文言（text-sm）と
          由来・メモ・根拠（text-xs）でフォント階級が違うため——1本を両方に
          使い回すと、片方の高さを見誤る */}
      <span
        ref={probeRef}
        aria-hidden="true"
        className={`${BODY_FONT_CLASS} pointer-events-none absolute top-0 left-0 select-none opacity-0`}
      >
        あ
      </span>
      <span
        ref={smallProbeRef}
        aria-hidden="true"
        className={`${SMALL_FONT_CLASS} pointer-events-none absolute top-0 left-0 select-none opacity-0`}
      >
        あ
      </span>

      {/* 見出し・操作・集計・ヒントの帯。**面は透過させる**——下のキャンバスの
          パンとヒットテストを、帯の外側で奪わないため。
          **指摘の一覧はここに置かない**（rev 6章。額縁の IssueBanner が出す）
          ——ここに置くと件数が増えるほど木の上部を覆う */}
      <div className="pointer-events-none absolute top-0 right-0 left-0 z-10 flex flex-col items-stretch">
        <div className="pointer-events-none m-2 flex items-center gap-3">
          {/* **ファイル名（title）はここに出さない。** 額縁の `FileHeader` が
              共通で出しており、ここに置くと二重になる（rev 6章）。
              ボタンは常設する——**キーでしか到達できない意味を残さない**
              （rev 10章）ので、マウスだけの人にも構造を増やす手段が要る */}
          <button
            type="button"
            className={`${buttonBase} pointer-events-auto shrink-0 gap-1 border border-rule bg-surface px-3 py-1 text-sm text-ink hover:bg-canvas`}
            onClick={addIssueFromBanner}
          >
            <Plus aria-hidden className="size-4" />
            課題を追加
          </button>
          <button
            type="button"
            className={`${buttonBase} pointer-events-auto shrink-0 gap-1 border border-rule bg-surface px-3 py-1 text-sm text-ink hover:bg-canvas`}
            disabled={data.issues.length === 0}
            onClick={addHypothesisFromBanner}
          >
            <Plus aria-hidden className="size-4" />
            仮説を追加
          </button>
          {/* 未決の集計。**`whitespace-nowrap` を外さないこと**——折り返すと
              帯の高さが変わり、下の図に重なる（SequenceEditor が同じ理由で付けている） */}
          <div className="pointer-events-none whitespace-nowrap text-sm text-ink-muted">
            {tallyLine(tallyQuestions(posed))}
          </div>
          <KeyHints hints={ISSUE_TREE_HINTS} className="ml-auto shrink-0 bg-surface/80 px-2 py-1" />
        </div>
      </div>

      {/* 背景レイヤ（M1 は空。3レイヤが同一の transform を共有することを保つ枠） */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 origin-top-left"
        style={{ transform: cssTransform(transform) }}
        data-layer="background"
      />

      <IssueTreeEdges
        roots={built.roots}
        placements={layout.issues}
        suppressed={issueSuppressed}
        transform={transform}
      />

      {/* **レイヤ自体は操作を取らない。** ここは inset-0 の透明な面。
          pointer-events を切らないと、この面がキャンバス全体を覆う単一の
          ヒット領域になり、useViewport がコンテナに付けた背景パン／ズームの
          ハンドラまで mousedown が届かなくなる。操作を受けるのは箱・カードの
          矩形だけでよいので、部品の側で auto に戻す */}
      <div
        className="pointer-events-none absolute inset-0 origin-top-left"
        style={{ transform: cssTransform(transform) }}
        data-layer="nodes"
      >
        {data.issues.map((node, index) => {
          const placement = layout.issues[index]
          // 循環して根から到達できない課題は図に位置を持たない
          //（存在は整合性検証の指摘として額縁に出ている）
          if (placement === null) return null
          const key = issueKeys[index]
          return (
            <div key={key} onFocusCapture={() => setLastIssueKey(key)}>
              <IssueBox
                nodeKey={issueCellKey(key)}
                // **アクセシブル名の接頭辞であって、ノードの文言ではない。**
                // 「課題{N}」で始まる約束をテストが前方一致で引く
                label={`課題${index + 1}`}
                text={node.text}
                rect={placement.rect}
                invalid={invalidIssues.has(index)}
                suppressed={issueSuppressed[index]}
                warn={posed.issueNeedsHypothesis[index]}
                onTextChange={(next) => onChange(setIssueText(data, index, next), `${key}:text`)}
                onFieldKeyDown={(e, state) => onIssueKeyDown(e, index, state)}
                deferralMenu={
                  <KindMenu
                    label={`課題${index + 1}を見送る`}
                    triggerText="見送り"
                    kinds={DEFERRAL_KINDS}
                    onPick={(kind) => apply(appendDeferral(data, index, kind))}
                    {...menuPropsFor(deferralMenuKey(key))}
                  />
                }
              />

              {/* 見送りイベントの行。**レイアウトが縦の場所を空けているのはここ**
                  ——描かないと、見送った課題は「箱の下に理由の分だけ空白が空いた
                  ノード」になり、なぜ抑制されているのかが画面から消える。
                  追記専用の記録なので読み取り専用で出す */}
              {placement.deferrals.map((rect, eventIndex) => {
                const event = node.events[eventIndex]
                if (event === undefined) return null
                return (
                  <div
                    key={`defer:${key}:${eventIndex}`}
                    // **`overflow-hidden` を外さないこと。** 中身の高さは測定層が
                    // 決めた値であり、ブラウザが測定より1行多く折り返したときに
                    // ここが伸びると、レイアウトが予約したブロックを越えて
                    // 下の仮説カードに重なる（HypothesisCard が各行の測定高さを
                    // きっちり当てているのと同じ規律）
                    className="absolute overflow-hidden text-xs text-ink-muted"
                    style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
                  >
                    {/* **`BADGE_HEIGHT` ちょうどで描く。** レイアウトはこの高さで
                        場所を空けており、縦の余白を足すと下の行がはみ出す */}
                    <div
                      className="overflow-hidden leading-5 font-medium select-none"
                      style={{ height: BADGE_HEIGHT }}
                    >
                      {EVENT_KIND_LABELS[event.kind]}
                    </div>
                    {/* 理由の行も測定した高さで固定する（`layout.ts` は
                        `BADGE_HEIGHT + ROW_GAP + 理由の高さ` で矩形を作っている）。
                        自動の高さのままだと、外側の `overflow-hidden` が無ければ
                        ブロックを越えて伸びる欄になる */}
                    <div
                      className="overflow-hidden break-all whitespace-pre-wrap"
                      style={{ marginTop: ROW_GAP, height: rect.height - BADGE_HEIGHT - ROW_GAP }}
                    >
                      {event.note}
                    </div>
                  </div>
                )
              })}

              {/* 「なぜここには問いが無いのか」の1文（`derive.ts` の導出の説明）。
                  **文字列は import する**——打ち直すと Skill の報告と食い違う */}
              {placement.suppressedNote !== null && (
                <div
                  className="absolute overflow-hidden text-xs break-all whitespace-pre-wrap text-ink-muted"
                  style={{
                    left: placement.suppressedNote.x,
                    top: placement.suppressedNote.y,
                    width: placement.suppressedNote.width,
                    height: placement.suppressedNote.height,
                  }}
                >
                  {SUPPRESSED_NOTE}
                </div>
              )}
            </div>
          )
        })}

        {data.hypotheses.map((h, index) => {
          const placement = layout.hypotheses[index]
          // ぶら下がり先の課題が図に無い仮説は置き場所を持たない
          //（参照切れは整合性検証が赤くする）
          if (placement === null) return null
          const key = hypothesisKeys[index]
          return (
            <HypothesisCard
              key={key}
              hypothesisKey={key}
              label={`仮説${index + 1}`}
              placement={placement}
              text={h.text}
              rationale={h.rationale}
              notes={h.pendingNotes}
              events={h.events}
              questions={posed.hypothesisQuestions[index]}
              invalid={invalidHypotheses.has(index)}
              suppressed={suppressedIds.has(h.issueId)}
              onTextChange={(next) => onChange(setHypothesisText(data, index, next), `${key}:text`)}
              onRationaleChange={(next) =>
                onChange(setRationale(data, index, next), `${key}:rationale`)
              }
              onNoteChange={(noteIndex, next) =>
                onChange(setPendingNote(data, index, noteIndex, next), `${key}:note:${noteIndex}`)
              }
              onEventNoteChange={(eventIndex, next) =>
                onChange(setEventNote(data, index, eventIndex, next), `${key}:event:${eventIndex}`)
              }
              onPromoteNote={(noteIndex) => apply(promoteNote(data, index, noteIndex))}
              onFieldKeyDown={(e, state, cell) => onCardKeyDown(e, index, state, cell)}
              judgementMenu={
                <KindMenu
                  label={`仮説${index + 1}に判断を追加`}
                  triggerText="判断"
                  kinds={JUDGEMENT_KINDS}
                  onPick={(kind) => apply(appendJudgement(data, index, kind))}
                  {...menuPropsFor(judgementMenuKey(key))}
                />
              }
            />
          )
        })}
      </div>
    </div>
  )
}
