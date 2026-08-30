import { Plus, StickyNoteOff } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FieldState } from '@/components/CellInput'
import { KeyHints } from '@/components/KeyHints'
import { MissingTally } from '@/components/MissingTally'
import { badgeClass } from '@/components/badge-styles'
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
import { useFontGeneration } from '@/core/canvas/use-font-generation'
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
import type { IssueTreeSchemaVersion3 } from '@/types/issue-tree'
import { badgeVariantOf } from './badge-variant'
import {
  cellKey,
  hypothesisCellKey,
  issueCellKey,
  issueEventCellKey,
  type HypothesisCell,
} from './cell-keys'
import {
  addChildIssue,
  addFeedback,
  addFeedbackAfter,
  addHypothesis,
  addHypothesisAfter,
  addRootIssue,
  addSiblingIssueAfter,
  appendJudgement,
  deleteHypothesis,
  deleteIssueSubtree,
  moveFeedback,
  moveHypothesis,
  moveIssueSibling,
  removeFeedback,
  setEventNote,
  setFeedbackText,
  setHypothesisTitle,
  setIssueEventNote,
  setIssueText,
  toggleIssueEvent,
  type EditResult,
  type FocusTarget,
} from './commands'
import {
  EVENT_KIND_LABELS,
  ISSUE_EVENT_LABELS,
  ISSUE_EVENT_NOTES,
  issueEventCount,
  issueEventLine,
  poseQuestions,
  suppressedIssueIds,
  tallyQuestions,
  toMissingTally,
  type IssueEventKind,
  type JudgementKind,
} from './derive'
import { HypothesisRow } from './HypothesisRow'
import { IssueBox } from './IssueBox'
import { IssueTreeEdges } from './IssueTreeEdges'
import { JUDGEMENT_TRIGGER_LABELS, layoutIssueTree, type IssueTreeFonts } from './layout'
import { ACTION_HEIGHT_CLASS, TITLE_FONT_CLASS } from './measure'
import {
  listFlaggedTargets,
  listOpenTargets,
  nextFlaggedTarget,
  nextOpenTarget,
  type OpenKind,
} from './open-targets'

/** 測定結果のキャッシュ。会議1回分の打鍵で無限に増えないよう頭を押さえる */
const MEASURE_CACHE_LIMIT = 2000

/** 仮説の文言・判断の根拠・FB に当たるクラスのうち、フォントを決めている部分 */
const BODY_FONT_CLASS = 'text-sm leading-normal'
/** 節の見出し・見送りの理由・バッジに当たるクラス */
const SMALL_FONT_CLASS = 'text-sm'

/** 木の操作ヒント。`$mod` / `$alt` は KeyHints が解決する */
const ISSUE_TREE_HINTS: readonly KeyHint[] = [
  { keys: 'Enter', label: '兄弟を追加' },
  { keys: 'Tab', label: '子課題を追加' },
  { keys: '$mod+Enter', label: '仮説／判断を追加' },
  { keys: '←→', label: '親子移動' },
  { keys: '$alt+↑↓', label: '並び替え' },
]

/** 別枠のチップ。**見送りと解決を同じ形で並べる**——実効は同じ「配下を止める」で、
    意味だけが逆（追わない／答えが出た）なので、見た目の系統は分けない。
    データにも props にも依存しないのでモジュール直下に置く（毎レンダ作り直さない） */
const FLAG_KINDS: readonly IssueEventKind[] = ['deferred', 'resolved']

/**
 * ドロップダウンに出す種別の並び。**文言は `EVENT_KIND_LABELS` から引く**
 *（打ち直すと、アプリの画面と Skill の報告が食い違う）。
 * 並びは決着の強い順——支持・棄却（決めた）、保留（決められなかった）、
 * 見送り（今回は決めない）。
 *
 * **並びの表を `Record<JudgementKind, number>` にしてあるのは、種別が増えたときに
 * tsc をここで落とすためである。** 以前は `readonly JudgementKind[]` の手書きで、
 * `onHold` をスキーマへ足しても配列は6件のまま何も言わずに通った——
 * **スキーマが受け入れる判断を、アプリからは選べない**状態が静かに残る。
 * `EVENT_KIND_LABELS` が `Record<JudgementKind, string>` だから落ちたのと同じ形にする
 */
const JUDGEMENT_MENU_ORDER: Record<JudgementKind, number> = {
  supported: 1,
  rejected: 2,
  onHold: 3,
  deferred: 4,
}
const JUDGEMENT_KINDS: readonly JudgementKind[] = (
  Object.keys(JUDGEMENT_MENU_ORDER) as JudgementKind[]
).sort((a, b) => JUDGEMENT_MENU_ORDER[a] - JUDGEMENT_MENU_ORDER[b])

const PLATFORM = currentPlatform()

/**
 * 最後にフォーカスがあったセル。**行の鍵で持つ**（配列位置ではない）
 *——構造操作や取り消しで位置は動くが鍵は動かない。
 *
 * 粒度は「課題の箱」か「仮説の行」までで、行の中のどの欄かは持たない
 *（帯が要るのは行き先の起点だけで、`listOpenTargets` が出す行き先も
 * この2種しかない）
 */
type LastCell = { cell: 'issue' | 'hypothesis'; key: string }

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

/**
 * ドロップダウンのトリガーと**旗のトグル**（見送り／解決）に共通の土台。
 * **`buttonBase` を敷かないのは角丸のため。**
 * `buttonBase` は `rounded-sm` を持つが、旗が立っている課題ではトグル自身が
 * 旗のバッジ（`rounded-sm`）を兼ねる——**角丸を2つ並べると勝つのは生成 CSS の
 * 順序であってクラス名の順序**であり、`TRIGGER_FACE` を切り出した理由（M8）が
 * 角丸について残ってしまう。**角丸は面が決める**ことにして口を1つにする。
 * 失うのは `justify-center` と `disabled:*` だけで、このトリガーは無効化しない
 */
const TRIGGER_BASE =
  'pointer-events-auto inline-flex items-center justify-center transition-colors outline-none focus:ring-2 focus:ring-inset focus:ring-ring'

/**
 * 小さなボタンの面。**呼び出し側が必ず渡す**（足すのではなく差し替える）
 *——判断ドロップダウンと「＋ FB」が使う。旗のトグルは `DEFER_TRIGGER_FACE` を使う
 *（旗が立っている課題ではトグル自身が旗のバッジを兼ねるため、幾何をバッジに揃えてある）。
 * **幅を測っているのは `layout.ts` の `actionWidth`**（`ACTION_INSET_X` は
 * ここの `px-1` ＋ 枠線 1px）なので、余白のクラスは対で直すこと
 */
const TRIGGER_FACE =
  'rounded-sm border border-rule bg-surface px-1 text-sm text-ink-muted hover:bg-canvas'

/**
 * 旗トグルの未入力面。**バッジの箱と同じ幾何**（`src/components/badge-styles.ts`
 * の base と対——`h-[20px]`・`px-1.5`・枠 1px・`rounded-sm`・`leading-none font-medium`。
 * `BADGE_BOX_HEIGHT` を変えるときは片方だけ変えないこと。DOM テストが対を見る）。
 * このトグルは押すと同じ要素が旗のバッジ（`badgeClass('deferred')`）になるので、
 * 2つの面で箱の形が揃っていないと押した瞬間に跳ねる。色だけが「押せる面」
 * （surface＋rule＋ink-muted、ホバーで canvas）で、幾何はバッジが決める。
 * 幅も同じ理由で `layout.ts` の `slotW` が `badgeWidth(ISSUE_EVENT_LABELS.deferred, …)`
 * （`actionWidth` ではない）で測っている——片方だけ変えないこと（対で直す）。
 * **`DEFER_TRIGGER_LABEL` は Task 7 で削除された**——描くのも測るのも
 * `ISSUE_EVENT_LABELS.deferred` の1つで、幅を測る文字列と描く文字列が
 * 同じ定数から出ている
 */
const DEFER_TRIGGER_FACE =
  'h-[20px] rounded-sm border border-rule bg-surface px-1.5 text-sm leading-none font-medium whitespace-nowrap text-ink-muted hover:bg-canvas'

interface KindMenuProps {
  /** アクセシブル名（トリガーのボタン） */
  label: string
  /** ボタンに出す短い文言 */
  triggerText: string
  /** トリガーの面。**足すのではなく差し替える** */
  triggerClassName: string
  kinds: readonly JudgementKind[]
  onPick: (kind: JudgementKind) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * 判断の種別を1つ選ぶドロップダウン。**開閉は親が持つ制御コンポーネント**
 *——同時に1つしか開かないことを、開いているセルの鍵1つで構造的に保証する
 *（`SequenceEditor` の `openCell` / `menuPropsFor` と同じ形）。
 *
 * ネイティブの `select` にしないのは、ブラウザ既定のドロップダウンがキャンバスの
 * transform を無視して出るため（`StepShapeCell` と同じ理由）。
 *
 * **かつては課題の見送りも同じ部品で出していた**（`K extends JudgementKind` の
 * 型引数はそのためにあった）。見送りが `deferred` の1語に畳まれてトグルに
 * なったので、いま使うのは仮説の判断だけである
 */
function KindMenu(props: KindMenuProps) {
  // 選んだときだけ Radix の「トリガーへフォーカスを戻す」を降ろす。
  // 追記した直後は根拠の欄へフォーカスを予約してあり、取り合うと打てなくなる
  const picked = useRef(false)
  return (
    <DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
      <DropdownMenuTrigger
        type="button"
        aria-label={props.label}
        className={`${TRIGGER_BASE} ${props.triggerClassName}`}
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
 * **測定するフォントが2種類（`BODY_FONT_CLASS` / `SMALL_FONT_CLASS`）に増えた**ぶんだけ広げてある。
 * ドロップダウンの制御は `src/modules/sequence/SequenceEditor.tsx` の
 * `openCell` / `menuPropsFor` の写し。
 */
export function IssueTreeEditor({
  data,
  onChange,
  issues,
  modalOpen,
}: EditorProps<IssueTreeSchemaVersion3>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const titleProbeRef = useRef<HTMLSpanElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const smallProbeRef = useRef<HTMLSpanElement>(null)
  // **課題のタイトルは太字**（`TITLE_FONT_CLASS`）で、同じ 14px でも細字より
  // 広い。1本の測定器を使い回すと、タイトルが測定より早く折り返して字が切れる
  const [titleFont, setTitleFont] = useState<CanvasFont>(FALLBACK_CANVAS_FONT)
  const [font, setFont] = useState<CanvasFont>(FALLBACK_CANVAS_FONT)
  const [smallFont, setSmallFont] = useState<CanvasFont>(FALLBACK_SMALL_FONT)

  // 判断のドロップダウンは同時に1つだけ開く。**開いているセルの鍵を
  // 1つだけ持つ**ことで構造的に複数オープンを禁止する（sequence M3 Task 11b）。
  // **見送りはここに載らない**——1択のドロップダウンをやめてトグルにしたので、
  // 開閉という状態そのものが無くなった。

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

  /**
   * 最後にフォーカスがあったセル。**帯の2つの動線がここ1つから出る**
   *——「仮説を追加」がどの課題に足すか（＝下の `lastIssueFocus`）と、
   * チップが「次の要対応」をどこから数えるか（＝下の `lastFocus`）。
   *
   * **課題の鍵と行き先を別々に持たないこと。** 2つ持つと片方だけが古くなり、
   * 帯の「仮説を追加」が、直前に触った課題とは別の課題へ足す——画面には
   * 何も出ないので、気づくのは足した仮説が思わぬ場所に現れたときになる。
   * 鍵で持つ理由は上の `LastCell` の解説
   */
  const [lastCell, setLastCell] = useState<LastCell | null>(null)

  // 詳細（判断・以前の判断・FB）を出している仮説の行鍵。**同時に1本だけ。**
  // **これはビュー状態であり、データには書かない**——座標と同じく、
  // 「いまどれを開いていたか」をファイルへ持ち込まない（rev 3章）。
  // 配列位置ではなく鍵で持つのも `lastCell` と同じ理由
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const readFont = (): void => {
    setTitleFont((prev) => {
      const next = readCanvasFont(titleProbeRef.current)
      return sameFont(prev, next) ? prev : next
    })
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

  // 読み込みの世代。進んだら実効フォントも読み直す。
  // **最初の1フレームはフォールバック書体のメトリクスで測っている**し、
  // 同梱フォントは unicode-range 分割なので、珍しい字のスライスは
  // 初入力のとき後から届く（M26）——どちらも世代が進んだ時点で測り直す
  const fontGeneration = useFontGeneration()
  useEffect(() => {
    readFont()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readFont は毎レンダー再生成される安定した処理。世代が進んだときだけ走らせる
  }, [fontGeneration])

  // 測定器はフォントが変わったときだけ作り直す。
  //
  // 鍵に lineHeight と世代を混ぜる。**`font.font` の文字列には行間が入っていない**
  // のに折り返しの高さは lineHeight に依存するので、書体が同じまま行間だけ
  // 変わるとキャッシュが古い高さを返し続ける。世代は useFontGeneration
  // （ready＋loadingdone）が進めるカウンタで、「読み込み後に測り直す」を
  // 成立させるのはこちらである。
  // **2種類のフォントを1つの入れ物に持つ**——鍵は文字列だけで、どちらの
  // フォントで測ったかを持っていないので、混ぜると片方が他方の幅を返す
  const measurerKey = `${titleFont.font}|${titleFont.lineHeight}|${font.font}|${font.lineHeight}|${smallFont.font}|${smallFont.lineHeight}|${fontGeneration}`
  const measurerRef = useRef<{ key: string; fonts: IssueTreeFonts } | null>(null)
  if (measurerRef.current === null || measurerRef.current.key !== measurerKey) {
    measurerRef.current = {
      key: measurerKey,
      fonts: {
        title: cachedMeasurer(titleFont),
        body: cachedMeasurer(font),
        small: cachedMeasurer(smallFont),
      },
    }
  }
  const fonts = measurerRef.current.fonts

  const issueKeys = computeRowKeys(data.issues)
  const hypothesisKeys = computeRowKeys(data.hypotheses)
  const posed = poseQuestions(data)
  const tally = tallyQuestions(posed)
  /**
   * `lastCell` を**いまのデータでの行き先**に直す。鍵が消えていれば null
   *（＝チップは列の先頭から、「仮説を追加」は末尾の課題へ）
   */
  const lastFocus = ((): FocusTarget | null => {
    if (lastCell === null) return null
    if (lastCell.cell === 'issue') {
      const at = issueKeys.indexOf(lastCell.key)
      return at < 0 ? null : { cell: 'issue', index: at }
    }
    const at = hypothesisKeys.indexOf(lastCell.key)
    return at < 0 ? null : { cell: 'hypothesis', index: at }
  })()
  const expandedIndex = expandedKey === null ? -1 : hypothesisKeys.indexOf(expandedKey)
  const layout = layoutIssueTree(data, posed, fonts, expandedIndex)
  /** 課題 ID → ぶら下がる仮説の添字（配列順）。行は箱の中に描く */
  const rowsOf = new Map<string, number[]>()
  data.hypotheses.forEach((h, i) => {
    rowsOf.set(h.issueId, [...(rowsOf.get(h.issueId) ?? []), i])
  })
  const built = buildTree(data.issues)
  const suppressedIds = suppressedIssueIds(data.issues)
  /** 自分自身の見送りを含む抑制（`derive.ts` の導出そのまま）。**箱の中の仮説行はこちら** */
  const issueSuppressed = data.issues.map((node) => suppressedIds.has(node.id))
  /**
   * **祖先のいずれかが見送っている課題**（自分が見送っているかは問わない）。
   * 箱の面とエッジはこちら。
   *
   * 俯瞰モックの規則は「**見送りを掲げている当の課題は通常どおり描く。薄くなるのは
   * 配下だけ**」である（`俯瞰.html` の見送り箱は `class="issue"` で `faint` を持たず、
   * 入る線も実線。`faint` と破線はその配下から始まる）。見送りは**そこで下した判断の
   * 表明**であって「もう見なくてよい枝」ではない——薄くすると、誰が何を落としたのかが
   * 図から読めなくなる。
   *
   * **「自分が見送っていない」（`node.events.length === 0`）で代用してはならない。**
   * それは「祖先由来」ではない。見送りが入れ子になったとき——A（通常）→ B（見送り）
   * → C（見送り）→ D——C は B の配下なのに「自分も見送っている」というだけで通常の面に
   * 戻り、**薄い D の上に濃い C が挟まる**（B→C の線も実線になる）。実際に一度そう書いて
   * 退行させた。
   *
   * `suppressedIssueIds` は既に「自分または祖先が見送り」を畳んでいるので、
   * **親がその集合に居るか**を見れば「祖先のいずれかが見送り」になる。親が図に
   * 実在しない課題（参照切れ）は抑制されない——`suppressedIssueIds` が親を辿れずに
   * 打ち切るのと同じ扱いで、赤表示は整合性検証が別に出す。
   *
   * **`suppressedIssueIds` と `poseQuestions` は触らない。** あちらの自己包含は
   * 「見送った課題自身に『仮説なし』を立てない」ために必要で、集計もそれに乗っている
   */
  const inheritedSuppressed = data.issues.map(
    (node) => node.parentId !== null && suppressedIds.has(node.parentId),
  )

  /** フォーカス移動のときに「見えるところまで寄せる」ための矩形。data-cell 鍵で引く */
  const rects = new Map<string, Rect>()
  layout.issues.forEach((placement, index) => {
    if (placement === null) return
    // 旗の理由も箱ごと見せる（理由だけ見えても、どの課題の話か分からない）
    rects.set(issueCellKey(issueKeys[index]), placement.rect)
    rects.set(issueEventCellKey(issueKeys[index]), placement.rect)
  })
  layout.hypotheses.forEach((placement, index) => {
    if (placement === null) return
    const key = hypothesisKeys[index]
    const h = data.hypotheses[index]
    // 行の中の欄はどれも行全体（＝展開パネルを含む矩形）を見せる
    rects.set(hypothesisCellKey(key, { cell: 'hypothesis' }), placement.rect)
    h.feedbacks.forEach((_f, feedbackIndex) => {
      rects.set(hypothesisCellKey(key, { cell: 'feedback', feedbackIndex }), placement.rect)
    })
    h.events.forEach((_e, eventIndex) => {
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
   * 行き先の欄へ視点を移す。**データは変えない**——`apply` の後半そのもので、
   * 帯のチップ（「次の要対応へ」）はこちらだけを使う。
   *
   * `source` は行き先の添字を読むデータ。**`apply` は差し替えた後のものを渡す**
   *——構造が変わった後の配列で鍵を作らないと、予約が別の行に当たる
   */
  const goTo = (focus: FocusTarget, source: IssueTreeSchemaVersion3 = data): void => {
    const nextIssueKeys = computeRowKeys(source.issues)
    const nextHypothesisKeys = computeRowKeys(source.hypotheses)
    // **行き先が仮説の欄なら、先にその仮説を展開する。** 畳まれた行に
    // 判断の根拠・FB の欄は無いので、展開しないまま予約しても当たらない
    //（同じ更新の中でよい——予約を当てる effect は描画後に querySelector する）。
    // 仮説の文言そのものは、畳まれた行の `<button>` と展開後の `<textarea>` が
    // 同じ `data-cell` を名乗るのでどちらでも当たる
    if (focus.cell !== 'issue' && focus.cell !== 'issueEvent') {
      setExpandedKey(nextHypothesisKeys[focus.index] ?? null)
    }
    // 画面の外なら寄せるのは、予約を当てる effect の仕事（`ensureVisible`）
    setPendingFocus(cellKey(focus, nextIssueKeys, nextHypothesisKeys))
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
    if (focus === null) {
      setPendingFocus(null)
      return
    }
    goTo(focus, result.data)
  }

  /**
   * 仮説の行を開き、文言の欄へフォーカスを予約する。
   *
   * **畳まれた行の `<button>` と展開後の `<textarea>` は同じ `data-cell` を
   * 名乗る**ので、この予約は「開いた後の textarea」に当たる（`HypothesisRow`
   * が両方を同時に描かないことで成立している継ぎ目）
   */
  const expandRow = (key: string): void => {
    setExpandedKey(key)
    setPendingFocus(hypothesisCellKey(key, { cell: 'hypothesis' }))
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

  /** コマンドを仮説の行の構造へ写像する。戻り値 true＝消費した */
  const runRowCommand = (cmd: Command, index: number, cell: HypothesisCell): boolean => {
    switch (cmd) {
      case 'insert-item-after':
        if (cell.cell === 'hypothesis') {
          apply(addHypothesisAfter(data, index))
          return true
        }
        // FB の Enter は**押した位置の次**（コアのコマンド名どおり insert-item-after）。
        // 末尾に足すと、3件の1件目で押したときに生まれるのは4件目になり、
        // フォーカスが展開パネルの一番下へ飛ぶ。末尾に足すのは、展開パネルの
        // 「＋ FB」ボタン（`HypothesisRow.tsx` の `panel.notes.add`）だけである
        //（帯にあるのは「課題を追加」「仮説を追加」の2つで、こちらは末尾専用ではない）
        if (cell.cell === 'feedback') {
          apply(addFeedbackAfter(data, index, cell.feedbackIndex))
          return true
        }
        // イベントの根拠から次を生やさない（イベントは追記操作でしか増えない）
        return false
      case 'delete-item':
        // deletableField を立てている欄（仮説の文言・FB）からしか来ない
        if (cell.cell === 'hypothesis') {
          // **前の仮説が無いときは持ち主の課題へ返す**——`deleteHypothesis` は
          // 行き先に null を返すので、そのままだとフォーカスが宙に浮き、
          // 続けて打とうとしたキーがどこにも入らない
          apply(deleteHypothesis(data, index), ownerIssueFocus(index))
          return true
        }
        if (cell.cell === 'feedback') {
          apply(removeFeedback(data, index, cell.feedbackIndex))
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
        if (cell.cell === 'feedback') {
          apply(moveFeedback(data, index, cell.feedbackIndex, delta))
          return true
        }
        // イベントは1件ずつ／追記専用なので並び替えの意味が無い
        return false
      }
      case 'focus-prev':
        return cell.cell === 'hypothesis' ? focusHypothesisSibling(index, -1) : false
      case 'focus-next':
        return cell.cell === 'hypothesis' ? focusHypothesisSibling(index, 1) : false
      case 'toggle-item-state':
        // 仮説の文言では判断イベントのドロップダウンを開く（追記する種別を選ばせる）。
        // FB は判断へ移さない——判断の理由は人が書く。FB セルでは何もしない
        //（＝キーを消費しない）
        if (cell.cell === 'hypothesis') {
          setOpenCell(judgementMenuKey(hypothesisKeys[index]))
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

  /** 仮説の行（と展開パネル）の中のセルのキー入力 */
  const onRowKeyDown = (
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
      // イベントの根拠は false——空にしただけでイベントが消えると、
      // 書き直すたびに消えることになる
      deletableField: cell.cell === 'hypothesis' || cell.cell === 'feedback',
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
    if (runRowCommand(cmd, index, cell)) e.preventDefault()
  }

  /** 帯の「課題を追加」。0件なら根を作り、あれば末尾の課題の隣（根の上では子）に足す */
  const addIssueFromBanner = (): void => {
    apply(
      data.issues.length === 0
        ? addRootIssue(data)
        : addSiblingIssueAfter(data, data.issues.length - 1),
    )
  }

  /**
   * 最後に触っていた課題。**`lastCell` から導く**（別に持たない）——仮説の行に
   * 居たなら、その仮説がぶら下がっている課題を指す
   */
  const lastIssueFocus = (): FocusTarget | null => {
    if (lastFocus === null) return null
    return lastFocus.cell === 'issue' ? lastFocus : ownerIssueFocus(lastFocus.index)
  }

  /** 帯の「仮説を追加」。最後に触っていた課題（無ければ末尾の課題）に足す */
  const addHypothesisFromBanner = (): void => {
    const at = lastIssueFocus()?.index ?? -1
    apply(addHypothesis(data, at < 0 ? data.issues.length - 1 : at))
  }

  /**
   * 帯のチップ。押すと**その種類の次の要対応へ視点が飛ぶ**（末尾なら先頭へ）。
   *
   * キャンバスはアウトラインと違って上から順に舐められない——開いている問いは
   * 平面に散らばっている。集計が数えるだけで終わると、数は読み上げにしかならない。
   * **数える根と飛ぶ先の根は同じ**（`posed`）にしてあるので、帯が「未決 2」と
   * 言いながら1件にしか飛べない、が起きない
   */
  const goToNextOpen = (kind: OpenKind): void => {
    const next = nextOpenTarget(listOpenTargets(data, posed), kind, lastFocus)
    // 0 件のチップは描かれていないので null は届かないはず。**それでも黙って返す**
    //（参照切れの仮説だけが数に入っているファイルでは、列が空になりうる）
    if (next !== null) goTo(next.focus)
  }

  const goToNextFlagged = (kind: IssueEventKind): void => {
    const next = nextFlaggedTarget(listFlaggedTargets(data, kind), lastFocus)
    if (next !== null) goTo(next)
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
          あるため。見本が2本あるのは、課題ノード・仮説の文言（`BODY_FONT_CLASS`
          = text-sm + leading-normal）と節見出し・バッジ（`SMALL_FONT_CLASS` = text-sm）で
          フォント階級が違うため——M26 でサイズは 14px に並んだが行間が違う（1.5 と 1.3）
          ので、1本を両方に使い回すと片方の高さを見誤る。
          **課題のタイトル（太字）も別に測る**——同じ 14px でも太字は幅が違い、
          細字で測るとタイトルが切れる */}
      <span
        ref={titleProbeRef}
        aria-hidden="true"
        className={`${TITLE_FONT_CLASS} pointer-events-none absolute top-0 left-0 select-none opacity-0`}
      >
        あ
      </span>
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
            className={`${buttonBase} pointer-events-auto shrink-0 gap-1 border border-rule bg-surface px-3 py-1 text-base text-ink hover:bg-canvas`}
            onClick={addIssueFromBanner}
          >
            <Plus aria-hidden className="size-4" />
            課題を追加
          </button>
          <button
            type="button"
            className={`${buttonBase} pointer-events-auto shrink-0 gap-1 border border-rule bg-surface px-3 py-1 text-base text-ink hover:bg-canvas`}
            disabled={data.issues.length === 0}
            onClick={addHypothesisFromBanner}
          >
            <Plus aria-hidden className="size-4" />
            仮説を追加
          </button>
          {/* 要対応の集計。**数えるだけでなく、そこへ飛べる。**
              キャンバスでは開いている問いが平面に散らばるので、合計と内訳を
              読み上げるだけでは「次に何をするか」に繋がらない——内訳を押せる
              チップにして、押すたびにその種類の次の1件へ視点を移す。
              **文言は `tallyLine` と同じ言葉**（`toMissingTally` が
              `QUESTION_LABELS` から組み立てる）を出す。`tallyLine` 自体は
              消していない（Skill の報告が使う）。
              帯そのものは共通部品 `MissingTally`（M22）——合計・0件チップ非表示・
              `whitespace-nowrap` は部品側が担う。**`as OpenKind` は
              `toMissingTally` の kind が `OpenKind` の4語（'hypothesis' |
              'result' | 'hold' | 'feedback'）と同じであることに依る** */}
          <MissingTally
            tally={toMissingTally(tally)}
            onJump={(kind) => goToNextOpen(kind as OpenKind)}
          />
          {/* 旗の別枠（UI ノート D17。v3 で見送り／解決の2種になった）。**要対応の外**
              ——`MissingTally` の parts は「total の内訳」という契約なので、
              そこへ混ぜると合計と内訳が合わない帯になる。旗を**掲げた課題の数**
              だけを種別ごとに出し（配下の凍結中の問いは数えない。人間の裁定）、
              0件なら描かない。面は rev 9章の見送りの描き方そのもの
              （badgeClass('deferred')＝surface-muted の面・rule の枠・
              ink-muted の文字）を**解決にも使い回す**——「解決」に別の色や
              アイコンを当てるのは見え方の設計であり m5 の担当 */}
          {FLAG_KINDS.map((kind) => {
            const count = issueEventCount(data.issues, kind)
            if (count === 0) return null
            return (
              <button
                key={kind}
                type="button"
                className={`shrink-0 transition-colors ${badgeClass('deferred')}`}
                aria-label={`次の${ISSUE_EVENT_LABELS[kind]}へ`}
                title={ISSUE_EVENT_NOTES[kind]}
                onClick={() => goToNextFlagged(kind)}
              >
                <StickyNoteOff aria-hidden="true" className="mr-1 size-3.5 shrink-0" />
                {issueEventLine(count, kind)}
              </button>
            )
          })}
          <KeyHints hints={ISSUE_TREE_HINTS} className="ml-auto shrink-0 bg-surface px-2 py-1" />
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
        // 破線になるのは**配下へ入る線だけ**（見送り箱へ入る線は実線のまま）
        suppressed={inheritedSuppressed}
        transform={transform}
      />

      {/* **レイヤ自体は操作を取らない。** ここは inset-0 の透明な面。
          pointer-events を切らないと、この面がキャンバス全体を覆う単一の
          ヒット領域になり、useViewport がコンテナに付けた背景パン／ズームの
          ハンドラまで mousedown が届かなくなる。操作を受けるのは箱と
          その中の行の矩形だけでよいので、部品の側で auto に戻す */}
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
          // 箱の面と見送りバッジは**祖先由来の抑制だけ**で薄くする。
          // 箱の中の仮説行は `issueSuppressed`（自分の見送りを含む）で薄くする
          // ——「その課題はもう追わない」は配下の仮説にも及ぶ
          const suppressed = inheritedSuppressed[index]
          // 課題ノードのイベントは旗（見送り／解決）だけで、**理由を書けるのは最新1件**
          const latestFlag = node.events[node.events.length - 1]
          const flagKind = latestFlag === undefined ? null : latestFlag.kind
          return (
            // **フォーカスの捕捉は外から内へ走る。** 仮説の行の中の欄に入ると、
            // まずここが課題を、続いて行の側（下の包み）が仮説を記録する
            // ——同じ更新の中で後に呼ばれた方が残るので、行に居るときは仮説になる
            //（課題の箱そのものに居るときはここだけが走る）
            <div key={key} onFocusCapture={() => setLastCell({ cell: 'issue', key })}>
              <IssueBox
                nodeKey={issueCellKey(key)}
                // **アクセシブル名の接頭辞であって、ノードの文言ではない。**
                // 「課題{N}」で始まる約束をテストが前方一致で引く
                label={`課題${index + 1}`}
                text={node.text}
                placement={placement}
                invalid={invalidIssues.has(index)}
                suppressed={suppressed}
                warn={posed.issueNeedsHypothesis[index]}
                eventKind={flagKind}
                eventNote={latestFlag === undefined ? null : latestFlag.note}
                eventCellKey={issueEventCellKey(key)}
                onTextChange={(next) => onChange(setIssueText(data, index, next), `${key}:text`)}
                onEventNoteChange={(next) =>
                  onChange(setIssueEventNote(data, index, next), `${key}:event`)
                }
                onFieldKeyDown={(e, state) => onIssueKeyDown(e, index, state)}
                eventToggle={
                  <button
                    type="button"
                    // **アクセシブル名は「何を入り切りするボタンか」で決める。**
                    // 押されているかは `aria-pressed` が運ぶ（名前と二重に述べない）。
                    // 旗が立っていない箱では、押すと付くのは見送りなので「見送り」
                    aria-label={`課題${index + 1}の${ISSUE_EVENT_LABELS[flagKind ?? 'deferred']}`}
                    aria-pressed={flagKind !== null}
                    // 旗が立っていれば、**このトグルが旗のバッジを兼ねる**
                    //（同じ場所に2つ置かない）。まだなら、ホバーと
                    // focus-within のときだけ出す小さなボタンにする。
                    // **どちらの面もレイアウトが枠を空けている**——`layout.ts` の
                    // `slotW` が、旗が立っていればバッジ幅、まだならボタン幅
                    //（`ISSUE_EVENT_LABELS.deferred`）で測る（幾何がバッジと
                    // 同じになったので、いまはどちらの状態も `badgeWidth` の式で測っている）
                    className={`${TRIGGER_BASE} ${
                      flagKind === null
                        ? `${DEFER_TRIGGER_FACE} invisible group-hover/issue:visible group-focus-within/issue:visible`
                        : badgeClass(badgeVariantOf('deferred', suppressed))
                    }`}
                    // **立っている旗を押すと、その旗が外れる**（差し替えではない）。
                    // 解決を新規に付ける動線は m4 では足さない（m5 の担当）
                    onClick={() => apply(toggleIssueEvent(data, index, flagKind ?? 'deferred'))}
                  >
                    {ISSUE_EVENT_LABELS[flagKind ?? 'deferred']}
                  </button>
                }
              >
                {/* 仮説は**この箱の中の行**。ぶら下がり先の課題が図に無い仮説は
                    どの箱の子にもならないので、そのまま描かれない
                    （参照切れは整合性検証が赤くする） */}
                {(rowsOf.get(node.id) ?? []).map((hi) => {
                  const row = layout.hypotheses[hi]
                  if (row === null) return null
                  const h = data.hypotheses[hi]
                  const rowKey = hypothesisKeys[hi]
                  return (
                    // **包みは位置を持たない**（`position: static`）ので、行の中の
                    // 絶対配置は箱を基準にしたまま。中身が全て絶対配置なので高さも 0
                    <div
                      key={rowKey}
                      onFocusCapture={() => setLastCell({ cell: 'hypothesis', key: rowKey })}
                    >
                      <HypothesisRow
                        hypothesisKey={rowKey}
                        label={`仮説${hi + 1}`}
                        placement={row}
                        origin={placement.rect}
                        title={h.title}
                        notes={h.feedbacks.map((f) => f.text)}
                        events={h.events}
                        invalid={invalidHypotheses.has(hi)}
                        suppressed={issueSuppressed[index]}
                        expanded={expandedKey === rowKey}
                        onExpand={() => expandRow(rowKey)}
                        onTitleChange={(next) =>
                          onChange(setHypothesisTitle(data, hi, next), `${rowKey}:title`)
                        }
                        onFeedbackTextChange={(feedbackIndex, next) =>
                          onChange(
                            setFeedbackText(data, hi, feedbackIndex, next),
                            `${rowKey}:feedback:${feedbackIndex}`,
                          )
                        }
                        onEventNoteChange={(eventIndex, next) =>
                          onChange(
                            setEventNote(data, hi, eventIndex, next),
                            `${rowKey}:event:${eventIndex}`,
                          )
                        }
                        onAddFeedback={() => apply(addFeedback(data, hi))}
                        onFieldKeyDown={(e, state, cell) => onRowKeyDown(e, hi, state, cell)}
                        judgementMenu={
                          <KindMenu
                            label={`仮説${hi + 1}に判断を追加`}
                            // **文言はレイアウトが持つ**——空けた幅と描く幅を
                            // 同じ文字列から出す（`layout.ts` が測っている）
                            triggerText={
                              JUDGEMENT_TRIGGER_LABELS[h.events.length === 0 ? 'empty' : 'latest']
                            }
                            // 高さは `ACTION_HEIGHT` で場所を空けてある（対のクラス）
                            triggerClassName={`${TRIGGER_FACE} ${ACTION_HEIGHT_CLASS}`}
                            kinds={JUDGEMENT_KINDS}
                            onPick={(kind) => apply(appendJudgement(data, hi, kind))}
                            {...menuPropsFor(judgementMenuKey(rowKey))}
                          />
                        }
                      />
                    </div>
                  )
                })}
              </IssueBox>
            </div>
          )
        })}
      </div>
    </div>
  )
}
