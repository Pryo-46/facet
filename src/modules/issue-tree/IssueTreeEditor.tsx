import { ChevronDown, Plus, StickyNoteOff } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FieldState } from '@/components/CellInput'
import { KeyHints } from '@/components/KeyHints'
import { MissingTally } from '@/components/MissingTally'
import { badgeClass, type BadgeVariant } from '@/components/badge-styles'
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
import type { Hypothesis, IssueTreeSchemaVersion3 } from '@/types/issue-tree'
import { badgeVariantOf, FLAG_BADGE_GROUPS } from './badge-variant'
import { cellKey, hypothesisCellKey, issueCellKey, issueEventCellKey } from './cell-keys'
import {
  addAsk,
  addChildIssue,
  addFeedback,
  addHypothesis,
  addRootIssue,
  addSiblingIssueAfter,
  clearJudgement,
  deleteHypothesis,
  deleteIssueSubtree,
  moveIssueSibling,
  removeAsk,
  removeFeedback,
  setAskText,
  setEventNote,
  setFeedbackSentiment,
  setFeedbackText,
  setHypothesisDetail,
  setHypothesisTitle,
  setHypothesisValue,
  setIssueEventNote,
  setIssueText,
  setJudgement,
  toggleIssueEvent,
  type EditResult,
  type FocusTarget,
} from './commands'
import {
  badgeGroupOf,
  BADGE_LABELS,
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
import { HypothesisPanel } from './HypothesisPanel'
import { HypothesisRow } from './HypothesisRow'
import { IssueBox } from './IssueBox'
import { IssueTreeEdges } from './IssueTreeEdges'
import { layoutIssueTree, type IssueTreeFonts } from './layout'
import {
  ACTION_HEIGHT_CLASS,
  ACTION_ICON_SIZE_CLASS,
  EXPANDED_TITLE_FONT_CLASS,
  TITLE_FONT_CLASS,
} from './measure'
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

/**
 * 木の操作ヒント。`$mod` / `$alt` は KeyHints が解決する。
 *
 * **キーで操作するのは課題の追加・削除・移動だけ**（m5）——仮説の追加・削除・
 * 判断の変更はマウスのボタンへ移った（Task 6・7）ので、`$mod+Enter` の行は無い。
 * `src/modules/logic-tree/LogicTreeEditor.tsx` の `TREE_HINTS` と同じ4つ
 */
const ISSUE_TREE_HINTS: readonly KeyHint[] = [
  { keys: 'Enter', label: '兄弟を追加' },
  { keys: 'Tab', label: '子課題を追加' },
  { keys: '←→', label: '親子移動' },
  { keys: '$alt+↑↓', label: '並び替え' },
]

/** 別枠のチップ。**見送りと解決を同じ形で並べる**——実効は同じ「配下を止める」で、
    意味だけが逆（追わない／答えが出た）なので、**帯のチップとまだ押していない
    トグルは**見た目の系統を分けない。**立った旗のバッジと箱の面は種別で分かれる**
    ——実機確認で改めた（`FLAG_BADGE_GROUPS` と設計ノート D8）。
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
 * 粒度は「課題の箱」「仮説の行」、そして**問いなら行の中の席まで**である。
 * 行の中のどの欄かを持たないままだと、`listOpenTargets` が出す問いの行き先
 *（m5 Task 8）と突き合わせられず、**FB待ちのチップが何度押しても1件目へ返る**
 *——起点が「仮説の行」に潰れているので、列の中に自分が見つからない。
 * 逆に言えば、**席まで持つのは列に出る行き先の種類と同じところまで**でよい
 */
type LastCell =
  | { cell: 'issue' | 'hypothesis'; key: string }
  | { cell: 'ask'; key: string; askIndex: number }

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
 * `buttonBase` は `rounded-sm` を持つが、**いまはどちらのトリガーも面がバッジ**
 *（判断は `badgeClass`、旗は `FLAG_TRIGGER_FACE`）で、バッジが `rounded-sm` を
 * 持っている——**角丸を2つ並べると勝つのは生成 CSS の順序であってクラス名の
 * 順序**なので、**角丸は面が決める**ことにして口を1つにする。
 * 失うのは `justify-center` と `disabled:*` だけで、このトリガーは無効化しない。
 *
 * **`TRIGGER_FACE`（小さなボタンの面）は m5 Task 6 で消えた**——判断の
 * トリガーがバッジになり、この面を使う呼び出し側が1つも無くなったため
 */
const TRIGGER_BASE =
  'pointer-events-auto inline-flex items-center justify-center transition-colors outline-none focus:ring-2 focus:ring-inset focus:ring-ring'

/**
 * 旗トグルの未入力面。**バッジの箱と同じ幾何**（`src/components/badge-styles.ts`
 * の base と対——`h-[20px]`・`px-1.5`・枠 1px・`rounded-sm`・`leading-none font-medium`。
 * `BADGE_BOX_HEIGHT` を変えるときは片方だけ変えないこと。DOM テストが対を見る）。
 * このトグルは押すと同じ場所が旗のバッジ（`FLAG_BADGE_GROUPS` の群）になるので、
 * 2つの面で箱の形が揃っていないと押した瞬間に跳ねる。色だけが「押せる面」
 * （surface＋rule＋ink-muted、ホバーで canvas）で、幾何はバッジが決める。
 * **まだ押していない面は見送りと解決で分けない**——どちらも「押せる空きの枠」
 * であって、まだ何も表明していないからである。**立ったあとの面は種別で分かれる**
 *（解決＝判断の緑。実機確認で改めた。設計ノート D8）。
 * 幅も同じ理由で `layout.ts` の `slotW` が `badgeWidth`（`actionWidth` ではない）
 * で測っている。**旗の無い箱にはこの面のボタンが2つ並ぶ**ので、あちらは
 * `flagTriggersW` が2つぶん＋`BADGE_GAP` を予約している——片方だけ変えないこと（対で直す）。
 * **`DEFER_TRIGGER_LABEL` は Task 7 で削除された**——描くのも測るのも
 * `ISSUE_EVENT_LABELS` の1つで、幅を測る文字列と描く文字列が同じ定数から出ている
 */
const FLAG_TRIGGER_FACE =
  'h-[20px] rounded-sm border border-rule bg-surface px-1.5 text-sm leading-none font-medium whitespace-nowrap text-ink-muted hover:bg-canvas'

interface KindMenuProps {
  /** アクセシブル名（トリガーのボタン） */
  label: string
  /**
   * トリガーが名乗るバッジの意味。**トリガー自身がバッジの箱になる**
   *（`badgeClass` を面として敷く。旗のトグルと同じやり方で、共通部品には
   * 手を入れずに「押せるバッジ」を作る口である）
   */
  badgeVariant: BadgeVariant
  /** バッジの中の語（`BADGE_LABELS` ／ `EVENT_KIND_LABELS` から来る） */
  badgeText: string
  kinds: readonly JudgementKind[]
  onPick: (kind: JudgementKind) => void
  /**
   * 判断を取り消して未決へ戻す（v4）。**`null` なら項目そのものを出さない**
   *——未決のときに「取り消す」は意味を持たない。
   *
   * **`kinds` に混ぜず別の口にしてある。** 取り消しは種別の1つではなく
   * 「いま立っているものを外す」操作で、`JudgementKind` に席が無い
   *（`derive.ts` の `undecided` が保存される種別でないのと同じ理由）。
   * 混ぜると `EVENT_KIND_LABELS`（`Record<JudgementKind, string>` で
   * 網羅が型に守られている表）に嘘の1語を足すことになる
   */
  onClear: (() => void) | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 「取り消す」の文言。**`EVENT_KIND_LABELS` に混ぜない**（保存される種別ではない） */
export const CLEAR_JUDGEMENT_LABEL = '取り消す'

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
      {/* **トリガーは状態のバッジそのもの**（キャンバスの `.badge.pick`）。
          見る場所と変える場所を1つにする＝「判断を追加」「判断を変える」という
          文言のボタンは m5 Task 6 で消えた。`gap-1` / `pr-1` はキャンバスの
          `.pick { gap: 4px; padding-right: 4px }`——山形を抱えるぶん、右の
          余白だけをバッジの 6px から 4px へ詰める（`cursor: pointer` は
          `src/index.css` の `@layer base` が全ボタンに与えている） */}
      <DropdownMenuTrigger
        type="button"
        aria-label={props.label}
        className={`${TRIGGER_BASE} ${badgeClass(props.badgeVariant)} gap-1 pr-1`}
      >
        {props.badgeText}
        {/* 押せることを示す山形。**12px はキャンバスの `.pick > svg`**。
            レイアウトはこの帯の幅を測らない（帯は flex で、根拠の欄はその下に
            パネルの全幅で座る）ので、対で直す測定側は無い——ここは
            `measure.ts` に定数を置かず、キャンバスの値をそのまま当てている */}
        <ChevronDown aria-hidden="true" className="size-3" />
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
        {/* **判断があるときだけ出す**（未決に「取り消す」は無い）。種別の下に
            置くのは、これが5つ目の種別ではなく「立っているものを外す」操作だから
            である——並びの正は `JUDGEMENT_MENU_ORDER` が持ち、そこに席は無い。
            **閉じるのを先に済ませるのは種別と同じ**（`onSelect` の解説）——
            取り消した後は仮説の文言へフォーカスを予約するので、`FocusScope` と
            取り合うと打てなくなる */}
        {props.onClear !== null && (
          <DropdownMenuItem
            onSelect={() => {
              picked.current = true
              props.onOpenChange(false)
              props.onClear?.()
            }}
          >
            {CLEAR_JUDGEMENT_LABEL}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 仮説がぶら下がる課題の行鍵。ぶら下がり先が図に無ければ null。
 *
 * **展開の単位が課題ノードになった（m5）ので、「この仮説を見せたい」から
 * 「どの課題を開くか」を引く口が要る。** `source` を引数に取るのは、構造を
 * 変えた直後は差し替え後のデータで引かねばならないため（`goTo` の約束）
 */
function ownerIssueKey(
  source: IssueTreeSchemaVersion3,
  issueKeys: readonly string[],
  hypothesisIndex: number,
): string | null {
  const issueId = source.hypotheses[hypothesisIndex]?.issueId
  if (issueId === undefined) return null
  const at = source.issues.findIndex((n) => n.id === issueId)
  return at < 0 ? null : (issueKeys[at] ?? null)
}

/**
 * 仮説の行の中でフォーカスが入った先を `LastCell` に直す。**問いの欄なら
 * その席（`askIndex`）まで、それ以外の欄はまとめて「仮説の行」**とする
 *——列に出る行き先の種類（`listOpenTargets`）と同じところまで持てば足りる。
 *
 * **`data-cell` の文字列をここで解かない。** 席を数えて `cell-keys.ts` に
 * 組ませ、返ってきた文字列と突き合わせる——接頭辞の書式を2箇所に持つと、
 * 片方だけ変えたときに「起点が見つからず、チップが毎回先頭へ返る」が
 * 静かに起きる（`cell-keys.ts` を作った理由そのもの）
 */
function lastCellIn(rowKey: string, h: Hypothesis, target: EventTarget | null): LastCell {
  const cell = target instanceof Element ? target.getAttribute('data-cell') : null
  const askIndex = h.asks.findIndex(
    (_ask, index) => hypothesisCellKey(rowKey, { cell: 'ask', askIndex: index }) === cell,
  )
  return askIndex < 0 ? { cell: 'hypothesis', key: rowKey } : { cell: 'ask', key: rowKey, askIndex }
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
  const expandedTitleProbeRef = useRef<HTMLSpanElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const smallProbeRef = useRef<HTMLSpanElement>(null)
  // **課題のタイトルは太字**（`TITLE_FONT_CLASS`）で、同じ 14px でも細字より
  // 広い。1本の測定器を使い回すと、タイトルが測定より早く折り返して字が切れる
  const [titleFont, setTitleFont] = useState<CanvasFont>(FALLBACK_CANVAS_FONT)
  // **開いた課題のタイトルは 16px**（`EXPANDED_TITLE_FONT_CLASS`）。サイズが
  // 違うので畳んだときの見本では測れない——1本で兼ねると、開いた瞬間に
  // タイトルが測定より広く描かれて末尾の行が切れる
  const [expandedTitleFont, setExpandedTitleFont] = useState<CanvasFont>(FALLBACK_CANVAS_FONT)
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

  // 選択中の**課題**の行鍵。**同時に1件だけ**（選ぶと箱が `BOX_WIDTH` →
  // `EXPANDED_BOX_WIDTH` に広がるので、複数開くと図が読めなくなる）。
  //
  // **選択は箱のクリックで入り、もう一度クリックすると外れる**（m5 の実機確認後。
  // それまではタイトルの左のシェブロンで開閉していた）。**フォーカスでは選択しない**
  // ——`Tab` でキャンバスを歩くたびに次々と箱が開いて図が動く（設計ノート D8）。
  //
  // **開くのは課題ノードであって仮説1本ではない**（m5。M3〜m4 は仮説単位だった）
  // ——開いた課題にぶら下がる仮説はまとめてパネルを持つ。仮説どうしを見比べる
  // 場面で、開くたびに隣が畳まれると比較そのものができないため。
  //
  // **これはビュー状態であり、データには書かない**——座標と同じく、
  // 「いまどれを選んでいたか」をファイルへ持ち込まない（rev 3章）。
  // 配列位置ではなく鍵で持つのも `lastCell` と同じ理由
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null)

  const readFont = (): void => {
    setTitleFont((prev) => {
      const next = readCanvasFont(titleProbeRef.current)
      return sameFont(prev, next) ? prev : next
    })
    setExpandedTitleFont((prev) => {
      const next = readCanvasFont(expandedTitleProbeRef.current)
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
  const measurerKey = `${titleFont.font}|${titleFont.lineHeight}|${expandedTitleFont.font}|${expandedTitleFont.lineHeight}|${font.font}|${font.lineHeight}|${smallFont.font}|${smallFont.lineHeight}|${fontGeneration}`
  const measurerRef = useRef<{ key: string; fonts: IssueTreeFonts } | null>(null)
  if (measurerRef.current === null || measurerRef.current.key !== measurerKey) {
    measurerRef.current = {
      key: measurerKey,
      fonts: {
        title: cachedMeasurer(titleFont),
        expandedTitle: cachedMeasurer(expandedTitleFont),
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
    if (at < 0) return null
    return lastCell.cell === 'ask'
      ? { cell: 'ask', index: at, askIndex: lastCell.askIndex }
      : { cell: 'hypothesis', index: at }
  })()
  const selectedIssueIndex =
    selectedIssueKey === null ? -1 : issueKeys.indexOf(selectedIssueKey)
  const layout = layoutIssueTree(data, posed, fonts, selectedIssueIndex)
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
    // 詳細・価値仮説は展開パネルの中にしか無いが、**鍵は畳んでいても登録する**
    //（`goTo` は先に持ち主の課題を開いてから予約を当てるので、寄せる先は
    // 開いた後の矩形になる）
    rects.set(hypothesisCellKey(key, { cell: 'detail' }), placement.rect)
    rects.set(hypothesisCellKey(key, { cell: 'value' }), placement.rect)
    // 問いの欄も同じ（帯の「FB待ち」はここへ飛ぶ）。**畳んでいても登録する**
    //——`goTo` が持ち主の課題を開いてから当てるので、寄せる先は開いた後の矩形
    h.asks.forEach((_a, askIndex) => {
      rects.set(hypothesisCellKey(key, { cell: 'ask', askIndex }), placement.rect)
    })
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
    // **行き先が仮説の欄なら、先にその仮説の持ち主の課題を展開する。** 畳まれた行に
    // 判断の根拠・FB の欄は無いので、展開しないまま予約しても当たらない
    //（同じ更新の中でよい——予約を当てる effect は描画後に querySelector する）。
    // 仮説の文言そのものは、畳まれた行の `<button>` と展開後の `<textarea>` が
    // 同じ `data-cell` を名乗るのでどちらでも当たる。
    // **開くのは課題**なので、`source`（＝差し替えた後のデータ）で持ち主を引く
    if (focus.cell !== 'issue' && focus.cell !== 'issueEvent') {
      setSelectedIssueKey(ownerIssueKey(source, nextIssueKeys, focus.index))
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
   * 仮説の行を押したときの動き: **持ち主の課題を開き**、その仮説の文言の欄へ
   * フォーカスを予約する。
   *
   * **畳まれた行の `<button>` と展開後の `<textarea>` は同じ `data-cell` を
   * 名乗る**ので、この予約は「開いた後の textarea」に当たる（`HypothesisRow`
   * が両方を同時に描かないことで成立している継ぎ目）。
   *
   * **フォーカスが入っただけでは開かない**（m5）——`HypothesisRow` から
   * `onFocus` を外した。畳まれた行に `Tab` で入ると開いて textarea へ移る形は、
   * 1回の `Tab` でフォーカスが2回動くのと同じことで、キーで木を歩くときに
   * 行き先が読めなくなっていた（`open-issues.md`）
   */
  const expandRowFor = (hypothesisIndex: number): void => {
    const key = hypothesisKeys[hypothesisIndex]
    if (key === undefined) return
    setSelectedIssueKey(ownerIssueKey(data, issueKeys, hypothesisIndex))
    setPendingFocus(hypothesisCellKey(key, { cell: 'hypothesis' }))
  }

  /**
   * 課題の選択。**同じ課題をもう一度クリックすると外れる**（＝畳まれる）。
   * 撤去したシェブロンのトグルと同じ手触りを、箱そのもので受ける。
   *
   * **`toggle` が偽なら選ぶだけで外さない**——文章の欄の上のクリックが
   * これで来る（`IssueBox` の `onBoxClick`）。打ちに来た人から選択を奪わない
   */
  const selectIssue = (key: string, toggle: boolean): void => {
    setSelectedIssueKey((prev) => (prev === key && toggle ? null : key))
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

  /** 仮説の持ち主の課題。「仮説を追加」の帯ボタンが、最後に触っていた仮説から辿る戻り先 */
  const ownerIssueFocus = (index: number): FocusTarget | null => {
    const issueId = data.hypotheses[index]?.issueId
    const at = issueId === undefined ? -1 : data.issues.findIndex((n) => n.id === issueId)
    return at < 0 ? null : { cell: 'issue', index: at }
  }

  /** ドロップダウンの鍵。**`data-cell` と同じ文字列にしないこと**——フォーカスの
      予約は `data-cell` で引くので、衝突するとトリガーを掴んでしまう */
  const judgementMenuKey = (hypothesisKey: string): string => `menu:judge:${hypothesisKey}`
  /**
   * FB の調子のドロップダウンの鍵（m5 の追加作業）。**判断と同じ `openCell` に
   * 載る**ので、判断のメニューと調子のメニューが同時に開くことはない。
   * 接頭辞を分けているのは、同じ仮説の判断と FB1 が同じ鍵にならないようにするため
   */
  const sentimentMenuKey = (hypothesisKey: string, feedbackIndex: number): string =>
    `menu:sentiment:${hypothesisKey}:${feedbackIndex}`

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
      // **主修飾キー＋Enter はここでは使わない（m5）。** かつては課題セルの
      // 副操作として仮説を追加していたが、仮説の追加はマウスのボタンへ移った
      // （Task 6）——空いた `Ctrl+Enter` に別の意味を割り当てない
      case 'toggle-item-state':
        return false
      case 'cancel':
        blurActive()
        return true
      default:
        // undo / redo は額縁のグローバル層が取る
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
          あるため。見本が4本あるのは、フォント階級が4つあるため:

          - `TITLE_FONT_CLASS`（畳んだ課題のタイトル。14px 太字）——同じ 14px でも
            太字は幅が違い、細字で測るとタイトルが切れる。**展開パネルの中の
            ソリューション仮説のタイトルもこの見本で測る**（`IssueTreeFonts.title`）
          - `EXPANDED_TITLE_FONT_CLASS`（開いた課題のタイトル。16px 太字）——
            サイズが違うので上では測れない（m5 Task 4 で追加）
          - `BODY_FONT_CLASS`（仮説の詳細・価値仮説・根拠・FB。14px / 行間 1.5）
          - `SMALL_FONT_CLASS`（節見出し・バッジ。14px / 行間 1.3）

          M26 で `BODY` と `SMALL` はサイズが 14px に並んだが行間が違う（1.5 と 1.3）
          ので、1本を両方に使い回すと片方の高さを見誤る */}
      <span
        ref={titleProbeRef}
        aria-hidden="true"
        className={`${TITLE_FONT_CLASS} pointer-events-none absolute top-0 left-0 select-none opacity-0`}
      >
        あ
      </span>
      <span
        ref={expandedTitleProbeRef}
        aria-hidden="true"
        className={`${EXPANDED_TITLE_FONT_CLASS} pointer-events-none absolute top-0 left-0 select-none opacity-0`}
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
              0件なら描かない。

              **面は箱のバッジと同じ写像（`FLAG_BADGE_GROUPS`）から引く**
              ——見送り＝`surface-muted` の面・`rule` の枠・`ink-muted` の文字、
              解決＝判断の緑。**写像を2箇所に書かないこと**——ここを
              `badgeClass('deferred')` の決め打ちに戻すと、**同じ「解決」の語が
              帯では灰・箱では緑**になる（m5 の実機確認まで実際にそうだった）。
              `IssueTreeEditor.dom.test.tsx` の「帯の別枠チップと箱のバッジは
              同じ面を出す」が両側から見ている。

              **`badgeVariantOf` を通さないのは、帯に抑制が無いから**——
              チップは木全体の集計であって、どの枝の下にも居ない。
              `false` を渡す形にすると「抑制されうる」と読めてしまう */}
          {FLAG_KINDS.map((kind) => {
            const count = issueEventCount(data.issues, kind)
            if (count === 0) return null
            return (
              <button
                key={kind}
                type="button"
                className={`shrink-0 transition-colors ${badgeClass(FLAG_BADGE_GROUPS[kind])}`}
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
                // 選択は**課題ノード単位**（m5 実機確認後）。選ばれているか・
                // 開いているかは `placement` が運ぶので、ここでは押されたことだけを渡す
                //（`IssuePlacement.expanded` ＝「開いているか」の唯一の出所）
                onSelect={(toggle) => selectIssue(key, toggle)}
                // 末尾の「＋ 仮説を追加」（m5 Task 7。キャンバスの `.addhypo`）。
                // **帯のボタンとは別経路**——あちらは「最後に触った課題」に足すが、
                // これは**この課題**に足す（`index` を直に渡している）。
                // 仮説を足す動線はキーから消えたので、開いた箱の中に必ず1つ要る。
                // 場所（開いているときだけ・パネルと揃う左端）はレイアウトが決める
                addHypothesis={
                  <button
                    type="button"
                    className={`${buttonBase} ${ACTION_HEIGHT_CLASS} gap-1 border border-rule bg-surface px-1.5 text-sm text-ink hover:bg-canvas`}
                    // **前半（`課題{N}`）は動かさない**——テストが前方一致で引く
                    aria-label={`課題${index + 1}に仮説を追加`}
                    onClick={() => apply(addHypothesis(data, index))}
                  >
                    <Plus aria-hidden className={ACTION_ICON_SIZE_CLASS} />
                    仮説を追加
                  </button>
                }
                eventToggle={
                  /**
                   * **旗が立っていなければボタンを2つ並べる**（見送り／解決）。
                   * 押した方の旗が立つ——`FLAG_KINDS` を回すので、**並びも文言も
                   * 帯のチップと同じ1つの出所**（`ISSUE_EVENT_LABELS`）から出る。
                   * 帯と同じ理由で**2つは同じ形**にする（実効は同じ「配下を止める」で
                   * 意味だけが逆なので、見た目の系統を分けない）。
                   *
                   * **キーボード経路は割り当てない**——旗は2つあってキーは1つなので、
                   * `$mod+Enter` は未割り当てのまま（`ISSUE_TREE_HINTS` に行が無い）。
                   *
                   * **レイアウトはこの2つぶんの枠を空けている**（`layout.ts` の
                   * `flagTriggersW`）。**描く数を変えたら測る式も対で直すこと**
                   */
                  flagKind === null ? (
                    FLAG_KINDS.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        // **アクセシブル名は「何を入り切りするボタンか」で決める。**
                        // 押されているかは `aria-pressed` が運ぶ（名前と二重に述べない）。
                        // **前半（`課題{N}`）は動かさない**——テストが前方一致で引く
                        aria-label={`課題${index + 1}の${ISSUE_EVENT_LABELS[kind]}`}
                        aria-pressed={false}
                        // ホバーと focus-within のときだけ出す小さなボタン。
                        // **面は種別で分けない**（`FLAG_TRIGGER_FACE` の註）
                        className={`${TRIGGER_BASE} ${FLAG_TRIGGER_FACE} invisible group-hover/issue:visible group-focus-within/issue:visible`}
                        onClick={() => apply(toggleIssueEvent(data, index, kind))}
                      >
                        {ISSUE_EVENT_LABELS[kind]}
                      </button>
                    ))
                  ) : (
                    <button
                      type="button"
                      // 旗が立っている箱の名前は**立っている旗の語**で決まる
                      //（既存のテストがこの名前で引く）
                      aria-label={`課題${index + 1}の${ISSUE_EVENT_LABELS[flagKind]}`}
                      aria-pressed
                      // 旗が立っていれば、**このトグルが旗のバッジを兼ねる**
                      //（同じ場所に2つ置かない）。**バッジの群は旗の種別から引く**
                      //（`FLAG_BADGE_GROUPS`。解決＝判断の緑 `yes`／見送り＝`deferred`）
                      //——ここを `'deferred'` の決め打ちに戻すと、解決の旗が
                      // 見送りの見た目で描かれる（実機確認で見つかった欠陥）。
                      // **抑制された配下では種別によらず `faint` へ落ちる**
                      //（`badgeVariantOf` の第2引数。種別より「いま作業する面ではない」が勝つ）。
                      // 幅はレイアウトが `badgeWidth(ISSUE_EVENT_LABELS[kind])` で空けている
                      className={`${TRIGGER_BASE} ${badgeClass(badgeVariantOf(FLAG_BADGE_GROUPS[flagKind], suppressed))}`}
                      // **立っている旗を押すと、その旗が外れる**（差し替えではない）。
                      // **見送り→解決へ直に変える動線は作らない**——2回押す
                      //（外す→立てる）で足りる。`toggleIssueEvent` は別種別を
                      // 渡せば入れ替える機械を持つが、ここでは使わない
                      onClick={() => apply(toggleIssueEvent(data, index, flagKind))}
                    >
                      {ISSUE_EVENT_LABELS[flagKind]}
                    </button>
                  )
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
                  /** 最新の判断。**無ければ「未決」**（導出の語）。バッジが運ぶ */
                  const latestJudgement = h.events.at(-1)
                  return (
                    // **包みは位置を持たない**（`position: static`）ので、行の中の
                    // 絶対配置は箱を基準にしたまま。中身が全て絶対配置なので高さも 0
                    <div
                      key={rowKey}
                      // **問いの欄に入ったら席まで覚える**（m5 Task 8）——帯の
                      // 「FB待ち」の列は問いごとなので、起点が「仮説の行」に
                      // 潰れていると自分が列の中に見つからず、何度押しても
                      // 先頭へ返る（一巡できない＝見落としの有無が分からない）
                      onFocusCapture={(e) => setLastCell(lastCellIn(rowKey, h, e.target))}
                    >
                      {/* **畳まれた行と展開パネルは排他**——レイアウトの
                          `HypothesisPlacement` が判別子つきの合併なので、
                          `row` を見た時点で `expanded` の有無も型として確定する
                          （両方を埋めた値は作れない）。2つが同時に描かれると、
                          同じ `data-cell`（`hyp:`）を名乗る要素が DOM に並び、
                          フォーカスの予約が先頭を掴んで静かに外れる */}
                      {row.row !== null ? (
                        <HypothesisRow
                          hypothesisKey={rowKey}
                          label={`仮説${hi + 1}`}
                          rect={row.rect}
                          row={row.row}
                          origin={placement.rect}
                          title={h.title}
                          events={h.events}
                          suppressed={issueSuppressed[index]}
                          onExpand={() => expandRowFor(hi)}
                        />
                      ) : (
                        <HypothesisPanel
                          hypothesisKey={rowKey}
                          label={`仮説${hi + 1}`}
                          panel={row.expanded}
                          origin={placement.rect}
                          hypothesis={h}
                          invalid={invalidHypotheses.has(hi)}
                          suppressed={issueSuppressed[index]}
                          onTitleChange={(next) =>
                            onChange(setHypothesisTitle(data, hi, next), `${rowKey}:title`)
                          }
                          onDetailChange={(next) =>
                            onChange(setHypothesisDetail(data, hi, next), `${rowKey}:detail`)
                          }
                          onValueChange={(next) =>
                            onChange(setHypothesisValue(data, hi, next), `${rowKey}:value`)
                          }
                          onAskTextChange={(askIndex, next) =>
                            onChange(
                              setAskText(data, hi, askIndex, next),
                              `${rowKey}:ask:${askIndex}`,
                            )
                          }
                          onFeedbackTextChange={(feedbackIndex, next) =>
                            onChange(
                              setFeedbackText(data, hi, feedbackIndex, next),
                              `${rowKey}:feedback:${feedbackIndex}`,
                            )
                          }
                          // **調子の差し替えは履歴をまとめない**（第2引数は `null`）
                          // ——打鍵ではなく1回の選択なので、まとめる相手が無い。
                          // 文言（`onFeedbackTextChange`）が鍵でまとめているのは
                          // 連続した打鍵を1つの取り消しにするためである。
                          // **同じ調子を選び直したら何もしない**（`apply` が
                          // `result.data === data` を落としているのと同じ理由——
                          // 中身の同じコミットが積まれると Undo が空振りする）
                          onFeedbackSentimentChange={(feedbackIndex, next) => {
                            const updated = setFeedbackSentiment(data, hi, feedbackIndex, next)
                            if (updated !== data) onChange(updated, null)
                          }}
                          sentimentMenuProps={(feedbackIndex) =>
                            menuPropsFor(sentimentMenuKey(rowKey, feedbackIndex))
                          }
                          onEventNoteChange={(eventIndex, next) =>
                            onChange(
                              setEventNote(data, hi, eventIndex, next),
                              `${rowKey}:event:${eventIndex}`,
                            )
                          }
                          onAddAsk={() => apply(addAsk(data, hi))}
                          // **`askIndex` は押されたブロックが持つ**（`onAddFeedback`
                          // の `askId` と同じ規律）。消した問いを指していた FB の
                          // 付け替えは `removeAsk` の担当
                          onRemoveAsk={(askIndex) => apply(removeAsk(data, hi, askIndex))}
                          // **`askId` は押されたブロックが持つ**（`addFeedback` は
                          // 既定値を与えず必須にしてある）。節の末尾の
                          // 「＋ FBを追加」だけが `null` を渡す
                          onAddFeedback={(askId) => apply(addFeedback(data, hi, askId))}
                          onRemoveFeedback={(feedbackIndex) =>
                            apply(removeFeedback(data, hi, feedbackIndex))
                          }
                          // **行き先の代わりを渡す**（`apply` の `fallback`）。
                          // `deleteHypothesis` は前の仮説が無いとき `null` を返すので、
                          // そのままだとフォーカスが宙に浮き、続けて打ったキーが
                          // どこにも入らない——持ち主の課題へ返す。
                          // **確認は出さない**（Undo は額縁のグローバル層）
                          onDelete={() => apply(deleteHypothesis(data, hi), ownerIssueFocus(hi))}
                          judgementMenu={
                            <KindMenu
                              // **アクセシブル名の前半は動かさない**（テストが
                              // 前方一致で引く規約）。判断があってもこの名前の
                              // まま——押して開く面は常に同じで、いまの状態は
                              // バッジの語が運ぶ（v4 で中身に「取り消す」が
                              // 増えたが、名前は動かさない）
                              label={`仮説${hi + 1}に判断を追加`}
                              // **バッジはトリガーの中身**（m5 Task 6）。
                              // イベントが無ければ導出の「未決」、あれば
                              // 保存された種別の語。**畳まれた行（`HypothesisRow`）
                              // と同じ規則**で、語の出所は `derive.ts` の1組だけ
                              badgeVariant={badgeVariantOf(
                                latestJudgement === undefined
                                  ? 'open'
                                  : badgeGroupOf(latestJudgement.kind),
                                // **`issueSuppressed`（自分の見送りを含む）で薄くする**
                                // ——箱の面に使う `suppressed`（祖先由来だけ）ではない。
                                // パネルの中身と同じ規則（`HypothesisPanel` の
                                // `suppressed` prop と同じ値を渡している）
                                issueSuppressed[index],
                              )}
                              badgeText={
                                latestJudgement === undefined
                                  ? BADGE_LABELS.open
                                  : EVENT_KIND_LABELS[latestJudgement.kind]
                              }
                              kinds={JUDGEMENT_KINDS}
                              onPick={(kind) => apply(setJudgement(data, hi, kind))}
                              // **判断があるときだけ「取り消す」を渡す**
                              //（未決のときは項目ごと出ない）。**同じ条件を
                              // `KindMenu` の中でもう一度書かない**——出す・出さないの
                              // 判断が2箇所に生えると、片方だけが古びる
                              onClear={
                                latestJudgement === undefined
                                  ? null
                                  : () => apply(clearJudgement(data, hi))
                              }
                              {...menuPropsFor(judgementMenuKey(rowKey))}
                            />
                          }
                        />
                      )}
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
