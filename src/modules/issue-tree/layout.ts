import { buildTree, type FlatTreeNode } from '@/core/canvas/flat-tree'
import { layoutTree, type Size } from '@/core/canvas/tree-layout'
import type { Rect } from '@/core/canvas/viewport'
import { wrapWithin, type MeasureWidth } from '@/core/canvas/wrap'
import type { IssueTreeSchemaVersion2 } from '@/types/issue-tree'
import {
  badgeGroupOf,
  BADGE_LABELS,
  EVENT_KIND_LABELS,
  hypothesisStatus,
  ISSUE_DEFERRED_LABEL,
  QUESTION_LABELS,
  type PosedQuestions,
} from './derive'
import {
  ACTION_HEIGHT,
  ACTION_INSET_X,
  BADGE_BORDER,
  BADGE_GAP,
  BADGE_HEIGHT,
  BADGE_PADDING_X,
  BOX_CONTENT_WIDTH,
  BOX_WIDTH,
  ISSUE_INSET_X,
  ISSUE_INSET_Y,
  ISSUE_MAX_WIDTH,
  ISSUE_TITLE_MIN_WIDTH,
  PANEL_CONTENT_WIDTH,
  PANEL_GAP,
  PANEL_INDENT,
  PANEL_INSET_X,
  PANEL_INSET_Y,
  ROW_GAP,
  ROW_INDENT,
  SECTION_GAP,
  TITLE_GAP,
} from './measure'

/** 1つのフォント階級の測定器。エディタが DOM の見本から作る */
export interface IssueTreeFont {
  measure: MeasureWidth
  lineHeight: number
}

export interface IssueTreeFonts {
  /** 課題のタイトル（text-sm font-semibold）。太字は幅が変わるので独立に測る */
  title: IssueTreeFont
  /** 仮説の文言・根拠・由来・FB（text-sm） */
  body: IssueTreeFont
  /** 節の見出し・見送りの理由・バッジ（text-xs） */
  small: IssueTreeFont
}

export interface IssuePlacement {
  /** 箱の外枠（世界座標）。エッジはここから引く */
  rect: Rect
  /** タイトルの入力欄（箱の中。バッジがあればその幅だけ右が空く） */
  title: Rect
  /** 最新の見送り。バッジはタイトル行の右端、理由はその下の1行（最新だけ編集できる） */
  deferral: { badge: Rect; reason: Rect } | null
}

/** 展開パネルの中身。畳まれている行は持たない */
export interface HypothesisPanel {
  panel: Rect
  /**
   * 「判断」節。最新イベントのバッジ＋根拠（編集可）＋種別を選ぶトリガー。
   * **イベント0件でもトリガーのために節は出る**——出さないと、マウスで
   * 判断を付ける動線が展開した仮説から消える
   */
  judgement: { label: Rect; badge: Rect; note: Rect; trigger: Rect }
  /**
   * 「以前の判断」の見出し。1件も無ければ null（節ごと出ない）。
   *
   * **`previous` の配列とは別に持つ。** 見出しの場所を部品が
   * 「先頭行の上」から逆算すると、節の組み方（`SECTION_GAP`）が
   * レイアウトと部品の2箇所に散る
   */
  previousLabel: Rect | null
  /** 「以前の判断」。`events[0 .. length-2]` の順。読み取り専用 */
  previous: { badge: Rect; note: Rect }[]
  rationale: { label: Rect; cell: Rect }
  /** FB（`pendingNotes`）。`cells` は同じ添字。`add` は「＋ FB」のボタン行 */
  notes: { label: Rect; cells: Rect[]; add: Rect }
}

export interface HypothesisPlacement {
  /** 行（畳まれていれば1行。展開していれば文言＋パネルの全体） */
  rect: Rect
  /** 文言。畳まれていれば `body.lineHeight` ちょうどの1行（CSS で省略）。展開していれば折り返した高さ */
  text: Rect
  /** 状態のバッジ（行末。高さ `BADGE_HEIGHT`） */
  badge: Rect
  /**
   * 「未判断」（`pendingNotes` あり）のバッジ。立っていなければ null。
   * 状態のバッジの左に `BADGE_GAP` 空けて並ぶ
   */
  judgementBadge: Rect | null
  /** 展開パネル。畳まれていれば null */
  expanded: HypothesisPanel | null
}

export interface IssueTreeLayout {
  /** issues と同じ添字。循環して根から到達できないものは null */
  issues: (IssuePlacement | null)[]
  /** hypotheses と同じ添字。ぶら下がり先が図に無いものは null */
  hypotheses: (HypothesisPlacement | null)[]
  width: number
  height: number
}

/**
 * 「判断」節のトリガーの文言。**幅を測るのはレイアウトなので、文言もここに置く**
 *——エディタが別の文字列を渡すと、空けた幅と描く幅がずれて根拠に被る
 */
export const JUDGEMENT_TRIGGER_LABELS = {
  /** イベント0件（まだ何も判断していない） */
  empty: '判断を追加',
  /** 1件以上（最新を上書きせず、次のイベントを追記する） */
  latest: '判断を変える',
} as const

/**
 * 課題を見送るトリガーの文言（まだ見送っていない箱でホバー中に出る小さなボタン）。
 * **`JUDGEMENT_TRIGGER_LABELS` と同じ理由でここに置く**——右上の枠を空けるのは
 * レイアウトなので、幅を測る文字列と描く文字列を1つにする
 */
export const DEFER_TRIGGER_LABEL = '見送り'

/** 「判断」節でイベントが1件も無いときに根拠の場所へ出す文言 */
export const NO_JUDGEMENT_TEXT = '判断はまだ無い'

/** 節の見出し。**`derive.ts` には置かない**——Skill の報告には出ない画面だけの言葉 */
export const SECTION_LABELS = {
  judgement: '判断',
  previous: '以前の判断',
  rationale: '由来',
  notes: 'FB',
} as const

/** 「＋ FB」のボタンの文言 */
export const ADD_NOTE_LABEL = '＋ FB'

/** 折り返した文章の高さ（余白は箱が1度だけ持つので、ここでは 0） */
function textHeight(text: string, font: IssueTreeFont, width: number): number {
  return wrapWithin(text, font.measure, font.lineHeight, {
    maxWidth: width,
    minWidth: 0,
    insetX: 0,
    insetY: 0,
  }).height
}

/**
 * バッジの幅。**枠線ぶんを常に足す**——枠を持つ群（保留・未決・見送り・抑制）は
 * 面を塗る群より 2px 広い。広い方で空けておけば、狭い群は右寄せの中で
 * 2px 余るだけで済む（足りない方に倒すと文字が切れる）
 */
function badgeWidth(label: string, font: IssueTreeFont): number {
  return Math.ceil(font.measure(label)) + BADGE_PADDING_X * 2 + BADGE_BORDER * 2
}

/** 小さなボタン（`buttonBase` ＋ `px-1` ＋ 枠線）の幅 */
function actionWidth(label: string, font: IssueTreeFont): number {
  return Math.ceil(font.measure(label)) + ACTION_INSET_X * 2
}

/** 仮説行1本の計画。高さを先に確定させ、置く場所が決まってから矩形を組む */
interface RowPlan {
  height: number
  /** `x` は箱の内容の左端、`y` は行の上端（どちらも世界座標） */
  build: (x: number, y: number) => HypothesisPlacement
}

/**
 * 課題ツリーのレイアウト（**完全な純関数**）。
 *
 * 新しい文法（M3）は「**箱は課題だけ／仮説は箱の中の1行**」である。仮説は
 * 独立した矩形を持たなくなったので、ブロック＝箱そのものになり、コアの
 * `layoutTree` へはその寸法だけを渡す。木の畳み方（親を最初の子と最後の子の
 * 中心に置く／兄弟の衝突を全深さで見る）はロジックツリーと同じ関数がやる。
 *
 * 詳細（由来・根拠・FB・以前の判断）は**展開している1本の仮説にだけ**出る。
 * `expandedIndex` は**ビュー状態であり `data` には無い**——座標と同じく、
 * 「いまどれを開いているか」をファイルに書かない（rev 3章）。
 *
 * **ここに「前回どこにあったか」の状態を混ぜないこと**——同じデータと同じ
 * 展開状態から違う図が出るようになった時点で「図は導出」が崩れる
 */
export function layoutIssueTree(
  data: IssueTreeSchemaVersion2,
  posed: PosedQuestions,
  fonts: IssueTreeFonts,
  /** 展開している仮説の添字。無ければ -1 */
  expandedIndex: number,
): IssueTreeLayout {
  // --- 1. 仮説行の計画（高さと組み立て） ---
  // **`null` を混ぜない。** 「図に出ない仮説」は `hypotheses[hi]` が `null` の
  // ままであることで表される——`walkPlace` は根から到達できる課題しか歩かない
  // ので、到達しない課題にぶら下がる行は組み立て自体が呼ばれない
  const plans: RowPlan[] = data.hypotheses.map((h, hi) => {
    const open = hi === expandedIndex
    const group = badgeGroupOf(hypothesisStatus(h))
    const badgeW = badgeWidth(BADGE_LABELS[group], fonts.small)
    /**
     * 「未判断」の行バッジ（M22）。帯の集計（`tallyQuestions`）と行の表示を
     * 一対一にする——数だけが増えて、どの行かが図から読めないのを防ぐ。
     *
     * **ここで `suppressed` を見る必要は無い**——抑制された仮説には
     * `poseQuestions` が `judgement` を立てない（`derive.ts`）
     */
    const q = posed.hypothesisQuestions[hi]
    const judgeW =
      q !== undefined && q.judgement ? badgeWidth(QUESTION_LABELS.judgement, fonts.small) : 0
    /** 行末に並ぶバッジ全体の幅（2つ並ぶときは間の `BADGE_GAP` も含む） */
    const badgesW = judgeW === 0 ? badgeW : badgeW + BADGE_GAP + judgeW
    const textW = BOX_CONTENT_WIDTH - ROW_INDENT - BADGE_GAP - badgesW
    /**
     * 未判断バッジは**状態のバッジから逆算する**（閉じた行と展開頭部で
     * バッジの `y` の作り方が違うので、同じ位置に置くには受け取るしかない）
     */
    const judgementBadgeLeftOf = (badge: Rect): Rect | null =>
      judgeW === 0
        ? null
        : { x: badge.x - BADGE_GAP - judgeW, y: badge.y, width: judgeW, height: BADGE_HEIGHT }
    // 畳まれた行は**必ず1行**（溢れは CSS の truncate が省略記号にする）。
    // 展開している行だけが折り返して縦に伸びる
    const textH = open ? textHeight(h.text, fonts.body, textW) : fonts.body.lineHeight
    // バッジは行の中で縦中央に座るので、文言より高ければ行がその高さになる
    const headH = Math.max(textH, BADGE_HEIGHT)

    if (!open) {
      return {
        height: headH,
        build: (x, y) => {
          const badge: Rect = {
            x: x + BOX_CONTENT_WIDTH - badgeW,
            y: y + Math.floor((headH - BADGE_HEIGHT) / 2),
            width: badgeW,
            height: BADGE_HEIGHT,
          }
          return {
            rect: { x, y, width: BOX_CONTENT_WIDTH, height: headH },
            text: {
              x: x + ROW_INDENT,
              y: y + Math.floor((headH - textH) / 2),
              width: textW,
              height: textH,
            },
            badge,
            judgementBadge: judgementBadgeLeftOf(badge),
            expanded: null,
          }
        },
      }
    }

    // --- 展開パネルの中身を測る ---
    const labelH = fonts.small.lineHeight
    const latest = h.events.length === 0 ? null : h.events[h.events.length - 1]
    // 最新の判断は保存された種別の文言（`EVENT_KIND_LABELS`）で出す。判断を5語に
    // 畳んだいまは俯瞰のバッジと同じ語になるが、引く先は分けたまま（derive.ts の註）。
    // イベントが無いときだけ、導出の「未決」を出す
    const latestLabel = latest === null ? BADGE_LABELS.open : EVENT_KIND_LABELS[latest.kind]
    const latestBadgeW = badgeWidth(latestLabel, fonts.small)
    const triggerW = actionWidth(
      JUDGEMENT_TRIGGER_LABELS[latest === null ? 'empty' : 'latest'],
      fonts.small,
    )
    const judgeNoteW = PANEL_CONTENT_WIDTH - latestBadgeW - BADGE_GAP - triggerW - BADGE_GAP
    const judgeNoteH = textHeight(latest === null ? NO_JUDGEMENT_TEXT : latest.note, fonts.body, judgeNoteW)
    const judgeRowH = Math.max(BADGE_HEIGHT, ACTION_HEIGHT, judgeNoteH)
    const judgementH = labelH + SECTION_GAP + judgeRowH

    // 以前の判断は追記専用の記録。**最新1件を除いた全部**を古い順に出す
    const previous = h.events.slice(0, -1).map((e) => {
      const w = badgeWidth(EVENT_KIND_LABELS[e.kind], fonts.small)
      const noteW = PANEL_CONTENT_WIDTH - w - BADGE_GAP
      return { badgeW: w, noteW, height: Math.max(BADGE_HEIGHT, textHeight(e.note, fonts.body, noteW)) }
    })
    const previousH =
      previous.length === 0
        ? 0
        : labelH +
          SECTION_GAP +
          previous.reduce((sum, p) => sum + p.height, 0) +
          ROW_GAP * (previous.length - 1)

    const rationaleH = textHeight(h.rationale, fonts.body, PANEL_CONTENT_WIDTH)
    const rationaleSectionH = labelH + SECTION_GAP + rationaleH

    const noteHs = h.pendingNotes.map((n) => textHeight(n, fonts.body, PANEL_CONTENT_WIDTH))
    const notesSectionH =
      labelH +
      SECTION_GAP +
      noteHs.reduce((sum, nh) => sum + nh + ROW_GAP, 0) +
      ACTION_HEIGHT

    const sectionHs = [judgementH, previousH, rationaleSectionH, notesSectionH].filter((s) => s > 0)
    const panelH =
      PANEL_INSET_Y * 2 +
      sectionHs.reduce((sum, s) => sum + s, 0) +
      PANEL_GAP * (sectionHs.length - 1)
    const height = headH + ROW_GAP + panelH

    return {
      height,
      build: (x, y) => {
        // **パネルの左端は行の文言の左端と揃う**（`PANEL_INDENT` と
        // `ROW_INDENT` は同じ原点から測った同じ値。measure.ts の解説）
        const panel: Rect = {
          x: x + PANEL_INDENT,
          y: y + headH + ROW_GAP,
          width: BOX_CONTENT_WIDTH - PANEL_INDENT,
          height: panelH,
        }
        const cx = panel.x + PANEL_INSET_X
        let cursor = panel.y + PANEL_INSET_Y
        /** 節の見出しを置いて本文の上端まで進める */
        const sectionLabel = (): Rect => {
          const r: Rect = { x: cx, y: cursor, width: PANEL_CONTENT_WIDTH, height: labelH }
          cursor += labelH + SECTION_GAP
          return r
        }

        const judgeLabel = sectionLabel()
        const judgeBadge: Rect = { x: cx, y: cursor, width: latestBadgeW, height: BADGE_HEIGHT }
        const judgeNote: Rect = {
          x: cx + latestBadgeW + BADGE_GAP,
          y: cursor,
          width: judgeNoteW,
          height: judgeNoteH,
        }
        const judgeTrigger: Rect = {
          x: cx + PANEL_CONTENT_WIDTH - triggerW,
          y: cursor,
          width: triggerW,
          height: ACTION_HEIGHT,
        }
        cursor += judgeRowH

        const previousRects: { badge: Rect; note: Rect }[] = []
        let previousLabel: Rect | null = null
        if (previous.length > 0) {
          cursor += PANEL_GAP
          previousLabel = sectionLabel()
          previous.forEach((p, j) => {
            if (j > 0) cursor += ROW_GAP
            previousRects.push({
              badge: { x: cx, y: cursor, width: p.badgeW, height: BADGE_HEIGHT },
              note: { x: cx + p.badgeW + BADGE_GAP, y: cursor, width: p.noteW, height: p.height },
            })
            cursor += p.height
          })
        }

        cursor += PANEL_GAP
        const rationaleLabel = sectionLabel()
        const rationaleCell: Rect = { x: cx, y: cursor, width: PANEL_CONTENT_WIDTH, height: rationaleH }
        cursor += rationaleH

        cursor += PANEL_GAP
        const notesLabel = sectionLabel()
        const noteCells = noteHs.map((nh) => {
          const r: Rect = { x: cx, y: cursor, width: PANEL_CONTENT_WIDTH, height: nh }
          cursor += nh + ROW_GAP
          return r
        })
        const addRect: Rect = { x: cx, y: cursor, width: PANEL_CONTENT_WIDTH, height: ACTION_HEIGHT }

        const badge: Rect = {
          x: x + BOX_CONTENT_WIDTH - badgeW,
          y: y + Math.floor((fonts.body.lineHeight - BADGE_HEIGHT) / 2),
          width: badgeW,
          height: BADGE_HEIGHT,
        }

        return {
          rect: { x, y, width: BOX_CONTENT_WIDTH, height },
          text: { x: x + ROW_INDENT, y, width: textW, height: textH },
          badge,
          judgementBadge: judgementBadgeLeftOf(badge),
          expanded: {
            panel,
            judgement: {
              label: judgeLabel,
              badge: judgeBadge,
              note: judgeNote,
              trigger: judgeTrigger,
            },
            previousLabel,
            previous: previousRects,
            rationale: { label: rationaleLabel, cell: rationaleCell },
            notes: { label: notesLabel, cells: noteCells, add: addRect },
          },
        }
      },
    }
  })

  const rowsOf = new Map<string, number[]>()
  data.hypotheses.forEach((h, i) => {
    rowsOf.set(h.issueId, [...(rowsOf.get(h.issueId) ?? []), i])
  })

  // --- 2. 課題の箱を測る ---
  const built = buildTree(data.issues)
  interface BoxPlan {
    width: number
    titleWidth: number
    titleHeight: number
    /** 見送りバッジ（無ければ 0）。タイトルの右に空ける幅は `BADGE_GAP + これ` */
    badgeWidth: number
    reasonHeight: number | null
    height: number
    rows: number[]
  }
  const boxes: BoxPlan[] = data.issues.map((node, i) => {
    const rows = rowsOf.get(node.id) ?? []
    const deferred = node.events.length > 0
    // 「仮説なし」と「見送り」は**排他**（見送った課題は抑制されるので問いが
    // 立たない。`poseQuestions` がそう導出する）。同じ場所に置いてよい
    const warn = posed.issueNeedsHypothesis[i]
    const badgeW = deferred
      ? badgeWidth(ISSUE_DEFERRED_LABEL, fonts.small)
      : warn
        ? badgeWidth(QUESTION_LABELS.hypothesis, fonts.small)
        : 0
    /**
     * タイトル行の右上は**常に1枠空ける**。ここに出るのは3つで、
     * いずれも同じ場所に右寄せで置かれる:
     *
     * - 見送りバッジ（見送り済み。これ自身が見送りのトグルを兼ねる）
     * - 「仮説なし」バッジ（問いが立っている）
     * - 見送りのトグル（まだ見送っていない。ホバー・フォーカス中だけ出る小さなボタン）
     *
     * **バッジがあるときだけ空ける形にしない。** そうすると普通の箱では
     * ホバー中に不透明なボタンがタイトルの1行目の末尾に被り、読めなくなる
     *（M1 が `left-full` で箱の外へ逃がしていたのはこれを避けるためだった）。
     * 箱の外へ出す道は採らない——列の間隔に置くと隣の枝と重なる。
     * 「仮説なし」の箱ではバッジとトリガーが同じ枠を奪い合うので、
     * **ホバー中はバッジを隠してトグルと入れ替える**（IssueBox）。
     * 見送り済みの箱では2つが同じ要素なので、広い方＝バッジの幅でよい
     */
    const slotW = deferred
      ? badgeW
      : Math.max(badgeW, actionWidth(DEFER_TRIGGER_LABEL, fonts.small))
    const reserve = BADGE_GAP + slotW

    // 仮説の行も見送りの理由も無い箱は、ロジックツリーのノードと同じ
    // 「タイトルの自然幅」。**バッジのぶんは先に取り置く**——取り置かないと、
    // 短いタイトルの箱でバッジが文言に重なる
    let width: number
    let titleWidth: number
    if (rows.length > 0 || deferred) {
      // 固定幅（320）から取り置く側。一番広い枠（「仮説なし」バッジ）でも
      // 残りは `ISSUE_TITLE_MIN_WIDTH` を大きく上回る（layout.test.ts が固定している）
      width = BOX_WIDTH
      titleWidth = BOX_CONTENT_WIDTH - reserve
    } else {
      // **下限を持つのはタイトルであって箱ではない**（measure.ts の解説）。
      // 箱の下限から枠のぶんを引くと、空けた枠が文章を食って入力欄が数 px になる。
      // ここでは逆に、タイトルの下限＋枠のぶんまで**箱の方を広げる**
      //
      // **この2行は `minWidth <= maxWidth` に依存している。** `wrapWithin` は
      // 食い違ったとき `maxWidth` の側を採るので、逆転すると**タイトルが黙って
      // 下限を割る**（例外も赤いテストも出ない）。いまの余裕は大きい——
      // `minWidth` は 150（`ISSUE_TITLE_MIN_WIDTH` 128 ＋ `ISSUE_INSET_X` 11 × 2）で
      // 固定なのに対し、`maxWidth` は 242 以上（320 − 一番広い枠 78）ある。
      // 一番広い枠は「仮説なし」バッジ（`fonts.small` 14px で4字 ≒ 56px ＋
      // `BADGE_PADDING_X` 6 × 2 ＋ `BADGE_BORDER` 1 × 2 ＝ 70）に `BADGE_GAP` 8 を
      // 足した 78——「見送り」のトリガー（3字 ≒ 42px ＋ `ACTION_INSET_X` 5 × 2 ＝
      // 52）より広い。ただし `reserve` はバッジ文言の**実測**で決まるので、
      // 語を長くしたりフォントを大きくしたりすれば縮む。**`ISSUE_MAX_WIDTH -
      // reserve` が 150 を割るほどバッジの語が伸びたら、ここで下限を
      // 切り上げるか語を短くすること**
      const wrapped = wrapWithin(node.text, fonts.title.measure, fonts.title.lineHeight, {
        maxWidth: ISSUE_MAX_WIDTH - reserve,
        minWidth: ISSUE_TITLE_MIN_WIDTH + ISSUE_INSET_X * 2,
        insetX: ISSUE_INSET_X,
        insetY: 0,
      })
      width = Math.min(ISSUE_MAX_WIDTH, wrapped.width + reserve)
      titleWidth = width - ISSUE_INSET_X * 2 - reserve
    }
    const titleHeight = textHeight(node.text, fonts.title, titleWidth)
    const reasonHeight = deferred
      ? textHeight(node.events[node.events.length - 1].note, fonts.small, BOX_CONTENT_WIDTH - ROW_INDENT)
      : null

    let height = ISSUE_INSET_Y * 2 + titleHeight
    if (reasonHeight !== null) height += TITLE_GAP + reasonHeight
    if (rows.length > 0) {
      height += TITLE_GAP + ROW_GAP * (rows.length - 1)
      for (const hi of rows) height += plans[hi].height
    }
    return { width, titleWidth, titleHeight, badgeWidth: badgeW, reasonHeight, height, rows }
  })

  // --- 3. コアの木レイアウトへ渡す（ブロック＝箱。仮説は箱の中なので別途足さない） ---
  const blockSizes = new Map<string, Size>()
  const walkSizes = (node: FlatTreeNode): void => {
    blockSizes.set(node.key, { width: boxes[node.index].width, height: boxes[node.index].height })
    for (const child of node.children) walkSizes(child)
  }
  for (const root of built.roots) walkSizes(root)

  const { positions, width, height } = layoutTree(built.roots, blockSizes)

  // --- 4. 世界座標へ展開する ---
  const issues: (IssuePlacement | null)[] = data.issues.map(() => null)
  const hypotheses: (HypothesisPlacement | null)[] = data.hypotheses.map(() => null)
  const walkPlace = (node: FlatTreeNode): void => {
    const point = positions.get(node.key)
    if (point !== undefined) {
      const i = node.index
      const box = boxes[i]
      const left = point.x + ISSUE_INSET_X
      let cursor = point.y + ISSUE_INSET_Y
      const title: Rect = { x: left, y: cursor, width: box.titleWidth, height: box.titleHeight }
      cursor += box.titleHeight
      let deferral: { badge: Rect; reason: Rect } | null = null
      if (box.reasonHeight !== null) {
        cursor += TITLE_GAP
        deferral = {
          badge: {
            x: left + box.width - ISSUE_INSET_X * 2 - box.badgeWidth,
            y: title.y,
            width: box.badgeWidth,
            height: BADGE_HEIGHT,
          },
          reason: {
            x: left + ROW_INDENT,
            y: cursor,
            width: BOX_CONTENT_WIDTH - ROW_INDENT,
            height: box.reasonHeight,
          },
        }
        cursor += box.reasonHeight
      }
      issues[i] = {
        rect: { x: point.x, y: point.y, width: box.width, height: box.height },
        title,
        deferral,
      }
      if (box.rows.length > 0) cursor += TITLE_GAP
      box.rows.forEach((hi, j) => {
        if (j > 0) cursor += ROW_GAP
        hypotheses[hi] = plans[hi].build(left, cursor)
        cursor += plans[hi].height
      })
    }
    for (const child of node.children) walkPlace(child)
  }
  for (const root of built.roots) walkPlace(root)

  return { issues, hypotheses, width, height }
}
