import { buildTree, type FlatTreeNode } from '@/core/canvas/flat-tree'
import { layoutTree, type Size } from '@/core/canvas/tree-layout'
import type { Rect } from '@/core/canvas/viewport'
import { wrapWithin, type MeasureWidth } from '@/core/canvas/wrap'
import type { IssueTreeSchemaVersion3 } from '@/types/issue-tree'
import {
  badgeGroupOf,
  BADGE_LABELS,
  EVENT_KIND_LABELS,
  hypothesisStatus,
  ISSUE_EVENT_LABELS,
  QUESTION_LABELS,
  type PosedQuestions,
} from './derive'
import {
  ACTION_HEIGHT,
  BADGE_BORDER,
  BADGE_GAP,
  BADGE_HEIGHT,
  BADGE_PADDING_X,
  BOX_CONTENT_WIDTH,
  BOX_WIDTH,
  CHEVRON_GAP,
  CHEVRON_SIZE,
  EXPANDED_BOX_WIDTH,
  ISSUE_INSET_X,
  ISSUE_INSET_Y,
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
  /**
   * 課題のタイトル（`TITLE_FONT_CLASS` = text-sm leading-normal font-semibold）。
   * 太字は幅が変わるので独立に測る。
   *
   * **展開パネルの中のソリューション仮説のタイトルもこれで測る。**
   * 描くのは `HYPO_TITLE_FONT_CLASS`（同じ 14px・同じ行間 1.5 で、太さだけ
   * 500）なので、**測る側の方が太い＝広い**——測定は実際より早く折り返す側に
   * 倒れ、描画が測定からはみ出すことはない（`badgeWidth` が枠線ぶんを常に
   * 足しているのと同じ「広い方で空けておく」判断）。太さごとに見本を増やすより、
   * 安全側の再利用を選んでいる
   */
  title: IssueTreeFont
  /**
   * 展開中の課題のタイトル（`EXPANDED_TITLE_FONT_CLASS` = text-base leading-normal
   * font-semibold）。**畳んだ箱の 14px とはサイズが違うので独立に測る**
   *——1本で兼ねると、開いた瞬間にタイトルが測定より広く描かれて末尾の行が
   * 高さ固定の textarea から切れる（measure.ts の解説）
   */
  expandedTitle: IssueTreeFont
  /** 仮説の詳細・価値仮説・根拠・FB（text-sm leading-normal） */
  body: IssueTreeFont
  /** 節の見出し・見送りの理由・バッジ（text-sm） */
  small: IssueTreeFont
}

export interface IssuePlacement {
  /** 箱の外枠（世界座標）。エッジはここから引く */
  rect: Rect
  /**
   * この課題が開いているか。**「開いているか」の唯一の出所はここである**
   *——描く側（`IssueBox` の `aria-expanded`）とパネルの有無
   *（`HypothesisPlacement.expanded`）が別々の情報源を見ると、片方だけが
   * 「開いている」と言う状態が作れてしまう（シェブロンは下向きなのに
   * 何も開かない、など）。**エディタの `expandedIssueKey` を直接見ないこと。**
   *
   * 仮説を1本も持たない課題は、鍵が自分を指していても**開かない**（下の
   * `expandable` を見よ）
   */
  expanded: boolean
  /**
   * 開けるか＝**仮説を1本以上持つか**。開くものが無い課題は開かない。
   *
   * **これが無いと m4 からの退行が起きる。** m4 まで展開の鍵は仮説を指していた
   * ので、仮説が消えれば鍵が宙に浮いて自動的に畳まれた。鍵が課題を指す m5 では
   * 消えても鍵が残るため、**行が1本も無い 780 幅の箱**が残り、トグルは
   * 隠れている（押せない）ので二度と畳めない。ビュー状態の側で消しに行くのでは
   * なく、**レイアウトが「開かない」と決める**ことで塞ぐ
   */
  expandable: boolean
  /**
   * 開閉トグル（シェブロン）の正方形。タイトルの左に `CHEVRON_GAP` 空けて座る。
   *
   * **仮説を持たない課題でも矩形は出る。** 出さないと `IssueBox` が
   * 「場所を空けたまま隠す」を実現できず、同じ列の中でタイトルの左端が
   * 箱ごとにずれる（描く側は `invisible` にするだけで場所は残す）
   */
  chevron: Rect
  /** タイトルの入力欄（箱の中。トグルのぶん左が、バッジがあればその幅だけ右が空く） */
  title: Rect
  /**
   * 最新の旗（見送り／解決）。バッジはタイトル行の右端、理由はその下の1行
   *（最新だけ編集できる）。**種別はここに持たない**——描く側は
   * `node.events` の最新から引く（データを2箇所に写さない）
   */
  event: { badge: Rect; reason: Rect } | null
}

/**
 * 展開パネルの中身。畳まれている行は持たない。
 *
 * **節の見出しは「1行の帯」1つで表す**（`label`）。見出しの右にはバッジ・
 * 日付・トリガー・ゴミ箱が並ぶが、**それぞれの矩形を測らない**——帯の中で
 * flex に並べる（デザインキャンバスの `.label { display:flex; gap:8px }` そのもの）。
 * 見出しの文字幅を測って隣を置く形にすると、節見出しの書体（`text-sm
 * font-semibold`）専用の測定器がもう1本要る一方で、得られるのは
 * 「絶対配置で置ける」だけである
 */
export interface HypothesisPanel {
  panel: Rect
  /** 「ソリューション仮説」節。見出しの帯／仮説の文言／詳細（どちらも複数行） */
  solution: { label: Rect; title: Rect; detail: Rect }
  /** 「価値仮説」節。見出しの帯／価値仮説（複数行） */
  value: { label: Rect; field: Rect }
  /**
   * 「検証結果」節。`label` の帯に最新イベントのバッジ・日付・種別を選ぶ
   * トリガーが並び、その下が根拠（編集可）。
   * **イベント0件でもトリガーのために節は出る**——出さないと、マウスで
   * 判断を付ける動線が展開した仮説から消える
   */
  judgement: { label: Rect; note: Rect }
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
  /** FB（`feedbacks`）。`cells` は同じ添字。`add` は「＋ FB」のボタン行 */
  notes: { label: Rect; cells: Rect[]; add: Rect }
}

/**
 * 畳まれた1行の中身。
 *
 * - `text`: 文言（`body.lineHeight` ちょうどの1行。溢れは CSS で省略）
 * - `badge`: 状態のバッジ（行末。高さ `BADGE_HEIGHT`）
 * - `feedbackBadge`: 「FB待ち」が立っていれば、状態のバッジの左に
 *   `BADGE_GAP` 空けて並ぶ。立っていなければ null
 */
export interface HypothesisRowRects {
  text: Rect
  badge: Rect
  feedbackBadge: Rect | null
}

/**
 * 仮説1本の置き場所。**畳まれた行（`row`）と展開パネル（`expanded`）は
 * 判別子つきの合併で排他にしてある**——`row` を持つ枝の `expanded` は
 * `null` 型そのものなので、**両方を埋めた値は型が通らない。**
 *
 * 独立した2つの `| null` にしていると、将来レイアウトが両方を埋めたときに
 * 描く側の `if` の順で**行が勝ってパネルが静かに消える**（型は通ったまま）。
 * `row !== null` / `expanded !== null` のどちらで絞っても、もう片方が
 * 確定するのはこの形のおかげである。
 *
 * **開いた仮説に「点・文言・バッジ」の頭部は無い**——パネルが全部を負う
 *（計画「閉じた行と展開パネルは責務が違い、同時に描かれることがない」）。
 * 頭部を残すと、パネルの「ソリューション仮説」節と**同じ文言が2箇所に出る**
 */
export type HypothesisPlacement =
  | {
      /** 行の全体（畳まれた1行） */
      rect: Rect
      row: HypothesisRowRects
      expanded: null
    }
  | {
      /** 行の全体（展開していればパネルそのもの） */
      rect: Rect
      row: null
      expanded: HypothesisPanel
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
 * 「検証結果」節のトリガーの文言。**画面だけの言葉を節見出しと同じ場所に置く**
 *——エディタが別の文字列を打ち直すと、同じボタンの呼び名が2箇所に散る。
 * m5 Task 4 でトリガーは見出しの帯の中に flex で並ぶようになったので、
 * **レイアウトはもうこの幅を測っていない**（測っているのは帯の高さだけ）
 */
export const JUDGEMENT_TRIGGER_LABELS = {
  /** イベント0件（まだ何も判断していない） */
  empty: '判断を追加',
  /** 1件以上（最新を上書きせず、次のイベントを追記する） */
  latest: '判断を変える',
} as const

/**
 * 「検証結果」節でイベントが1件も無いときに根拠の場所へ出す文言
 *（デザインキャンバスの `.field.ph`）。**空欄を警告にしない**——判断を
 * 選ぶまで根拠は書けない、という手順の案内であって欠落の印ではない
 */
export const NO_JUDGEMENT_TEXT = '理由（判断を選ぶと書ける）'

/**
 * 節の見出し。**`derive.ts` には置かない**——Skill の報告には出ない画面だけの言葉。
 * **並びは描く順**（キャンバスの「仮説の展開」アートボード）: ソリューション仮説 →
 * 価値仮説 → 検証結果 →（以前の判断）→ FB
 */
export const SECTION_LABELS = {
  solution: 'ソリューション仮説',
  value: '価値仮説',
  judgement: '検証結果',
  previous: '以前の判断',
  notes: 'FB',
} as const

/**
 * 空の欄に出す案内。**プレースホルダは高さに効かない**（測るのは値の側）ので
 * レイアウトは使わないが、**節見出しと同じ「画面だけの言葉」なので隣に置く**
 *——部品ごとに打ち直すと、同じ欄の呼び名が節見出しとずれる
 */
export const FIELD_PLACEHOLDERS = {
  detail: 'どう作るか',
  value: 'なぜ効くか',
} as const

/**
 * 検証結果の見出しに出す日付（キャンバスの `.date` ＝「2/13 更新」）。
 * **`YYYY-MM-DD` をそのまま出さない**——見出しの帯は1行で、年は判断の
 * 読み比べに要らない。
 *
 * **形の違う日付は考えない。** スキーマが `date` のすべてに
 * `^\d{4}-\d{2}-\d{2}$` を課しており（`schemas/issue-tree.schema.json`）、
 * 違う形のファイルはレベル1検証で弾かれて**そもそも開けない**。
 * 到達しない分岐を書くと、テストの当たらないコードが1本増えるだけである
 */
export function judgementDateText(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))} 更新`
}

/** 「＋ FB」のボタンの文言 */
export const ADD_NOTE_LABEL = '＋ FB'

/**
 * 折り返した文章の高さ（余白は箱が1度だけ持つので、ここでは 0）。
 */
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
 * **展開の単位は課題ノードである**（m5。M3〜m4 は仮説1本だった）。開いた課題は
 * 幅が `EXPANDED_BOX_WIDTH` に広がり、**その課題にぶら下がる仮説がすべて**
 * パネル（判断・以前の判断・FB）を開く。1本だけ開く形をやめたのは、仮説どうしを
 * 見比べる場面——どれを先に検証するか、どれが同じ問いに答えているか——で、
 * 開くたびに隣が畳まれると比較そのものができないため。
 *
 * 押し広げは**列の側が引き受ける**——`tree-layout.ts` の `columnXs` は深さごとの
 * 最大幅で列の x を決めるので、`Size.width` に 780 を渡せば右の列がそのぶん
 * 送られる。**`tree-layout.ts` は触らない。**
 *
 * `expandedIssueIndex` は**ビュー状態であり `data` には無い**——座標と同じく、
 * 「いまどれを開いているか」をファイルに書かない（rev 3章）。
 *
 * **ここに「前回どこにあったか」の状態を混ぜないこと**——同じデータと同じ
 * 展開状態から違う図が出るようになった時点で「図は導出」が崩れる
 */
export function layoutIssueTree(
  data: IssueTreeSchemaVersion3,
  posed: PosedQuestions,
  fonts: IssueTreeFonts,
  /** 展開している**課題**の添字。無ければ -1 */
  expandedIssueIndex: number,
): IssueTreeLayout {
  /**
   * 課題 ID → 添字。仮説の行が「持ち主の課題が開いているか」を引くのに要る
   *（開閉が仮説ごとではなく課題ごとになったため）
   */
  const issueIndexOf = new Map<string, number>()
  data.issues.forEach((node, i) => {
    // **ID 重複は先に現れた方を採る**（`commands.ts` の規約、実体は
    // `core/canvas/flat-tree-core.ts` の `firstIndexById`）。ID 重複のファイルは
    // 受け入れて赤表示する仕様（`consistency.ts` の `duplicate-id`）なので、
    // ここは到達可能な入力である。**後勝ちにすると木の側（先勝ち）とずれ**、
    // 先頭側のトグルを押しても行が開かず箱だけが 780 に広がる
    if (!issueIndexOf.has(node.id)) issueIndexOf.set(node.id, i)
  })
  /** 展開している課題の中身が使える幅（箱が広がったぶんだけ広い） */
  const EXPANDED_CONTENT_WIDTH = EXPANDED_BOX_WIDTH - ISSUE_INSET_X * 2
  // --- 1. 仮説行の計画（高さと組み立て） ---
  // **`null` を混ぜない。** 「図に出ない仮説」は `hypotheses[hi]` が `null` の
  // ままであることで表される——`walkPlace` は根から到達できる課題しか歩かない
  // ので、到達しない課題にぶら下がる行は組み立て自体が呼ばれない
  const plans: RowPlan[] = data.hypotheses.map((h, hi) => {
    // **開いているかは持ち主の課題で決まる。** ぶら下がり先が図に無い仮説
    //（参照切れ）はどの課題の子にもならないので、開くこともない
    const owner = issueIndexOf.get(h.issueId)
    const open = owner !== undefined && owner === expandedIssueIndex
    /**
     * この行が使える幅。**開いた課題の中では箱が広がっているので、行も
     * パネルも広い方の幅で測る**——`BOX_CONTENT_WIDTH` のまま測ると、
     * ブラウザに与えられる幅より狭い前提で折り返しを数えることになり、
     * パネルの下に隙間が空く（measure.ts の「定数と Tailwind クラスは対」と
     * 同じ約束の、幅の側）
     */
    const contentWidth = open ? EXPANDED_CONTENT_WIDTH : BOX_CONTENT_WIDTH
    const panelContentWidth = contentWidth - PANEL_INDENT - PANEL_INSET_X * 2

    // --- 畳まれた1行 ---
    // **バッジと文言の幅の式はこの枝にしか無い。** 開いた仮説に頭部は無く
    //（`HypothesisPlacement` の解説）、パネルの中身は下でパネルの幅から組む
    if (!open) {
      const group = badgeGroupOf(hypothesisStatus(h))
      const badgeW = badgeWidth(BADGE_LABELS[group], fonts.small)
      /**
       * 「FB待ち」の行バッジ（M22。M4 で `pendingNotes` から `asks`/`feedbacks` へ
       * 移った）。帯の集計（`tallyQuestions`）と行の表示を一対一にする——数だけが
       * 増えて、どの行かが図から読めないのを防ぐ。
       *
       * **ここで `suppressed` を見る必要は無い**——抑制された仮説には
       * `poseQuestions` が `feedback` を立てない（`derive.ts`）。
       * **展開中は出ない**——問いブロックの側に出す（m5 Task 5）
       */
      const q = posed.hypothesisQuestions[hi]
      const feedbackW =
        q !== undefined && q.feedback > 0 ? badgeWidth(QUESTION_LABELS.feedback, fonts.small) : 0
      /** 行末に並ぶバッジ全体の幅（2つ並ぶときは間の `BADGE_GAP` も含む） */
      const badgesW = feedbackW === 0 ? badgeW : badgeW + BADGE_GAP + feedbackW
      const textW = contentWidth - ROW_INDENT - BADGE_GAP - badgesW
      // 畳まれた行は**必ず1行**（溢れは CSS の truncate が省略記号にする）
      const textH = fonts.body.lineHeight
      // バッジは行の中で縦中央に座るので、文言より高ければ行がその高さになる
      const rowH = Math.max(textH, BADGE_HEIGHT)

      return {
        height: rowH,
        build: (x, y) => {
          const badge: Rect = {
            x: x + contentWidth - badgeW,
            y: y + Math.floor((rowH - BADGE_HEIGHT) / 2),
            width: badgeW,
            height: BADGE_HEIGHT,
          }
          return {
            rect: { x, y, width: contentWidth, height: rowH },
            row: {
              text: {
                x: x + ROW_INDENT,
                y: y + Math.floor((rowH - textH) / 2),
                width: textW,
                height: textH,
              },
              badge,
              // FB待ちバッジは**状態のバッジから逆算する**（右端から左へ並ぶ）
              feedbackBadge:
                feedbackW === 0
                  ? null
                  : {
                      x: badge.x - BADGE_GAP - feedbackW,
                      y: badge.y,
                      width: feedbackW,
                      height: BADGE_HEIGHT,
                    },
            },
            expanded: null,
          }
        },
      }
    }

    // --- 展開パネルの中身を測る ---
    const labelH = fonts.small.lineHeight
    const latest = h.events.length === 0 ? null : h.events[h.events.length - 1]

    /**
     * ソリューション仮説の節。**タイトルは `fonts.title` で測る**（描くのは
     * `HYPO_TITLE_FONT_CLASS`。`IssueTreeFonts.title` の解説＝安全側の再利用）。
     * 詳細は本文と同じ書体で、**空でも1行ぶんの高さを取る**——空欄には
     * プレースホルダが出るので、潰すと押せる場所が消える
     */
    const hypoTitleH = textHeight(h.title, fonts.title, panelContentWidth)
    const detailH = textHeight(h.detail, fonts.body, panelContentWidth)
    const solutionH = labelH + SECTION_GAP + hypoTitleH + SECTION_GAP + detailH

    /** 価値仮説の節（見出し＋1つの欄） */
    const valueH = textHeight(h.value, fonts.body, panelContentWidth)
    const valueSectionH = labelH + SECTION_GAP + valueH

    /**
     * 検証結果の節。**見出しの帯にバッジ・日付・トリガーが同居する**ので、
     * 帯の高さはその3つの一番高いものに合わせる（幅は測らない。
     * `HypothesisPanel` の解説）。根拠はその下に**パネルの全幅**で座る
     */
    const judgeLabelH = Math.max(labelH, BADGE_HEIGHT, ACTION_HEIGHT)
    const judgeNoteH = textHeight(
      latest === null ? NO_JUDGEMENT_TEXT : latest.note,
      fonts.body,
      panelContentWidth,
    )
    const judgementH = judgeLabelH + SECTION_GAP + judgeNoteH

    // 以前の判断は追記専用の記録。**最新1件を除いた全部**を古い順に出す
    const previous = h.events.slice(0, -1).map((e) => {
      const w = badgeWidth(EVENT_KIND_LABELS[e.kind], fonts.small)
      const noteW = panelContentWidth - w - BADGE_GAP
      return { badgeW: w, noteW, height: Math.max(BADGE_HEIGHT, textHeight(e.note, fonts.body, noteW)) }
    })
    const previousH =
      previous.length === 0
        ? 0
        : labelH +
          SECTION_GAP +
          previous.reduce((sum, p) => sum + p.height, 0) +
          ROW_GAP * (previous.length - 1)

    const noteHs = h.feedbacks.map((f) => textHeight(f.text, fonts.body, panelContentWidth))
    const notesSectionH =
      labelH +
      SECTION_GAP +
      noteHs.reduce((sum, nh) => sum + nh + ROW_GAP, 0) +
      ACTION_HEIGHT

    const sectionHs = [solutionH, valueSectionH, judgementH, previousH, notesSectionH].filter(
      (s) => s > 0,
    )
    const panelH =
      PANEL_INSET_Y * 2 +
      sectionHs.reduce((sum, s) => sum + s, 0) +
      PANEL_GAP * (sectionHs.length - 1)
    // **開いた仮説に頭部は無い**（`HypothesisPlacement.row` の解説）。行の高さは
    // パネルそのもの
    const height = panelH

    return {
      height,
      build: (x, y) => {
        // **パネルの左端は畳まれた行の文言の左端と揃う**（`PANEL_INDENT` と
        // `ROW_INDENT` は同じ原点から測った同じ値。measure.ts の解説）
        const panel: Rect = {
          x: x + PANEL_INDENT,
          y,
          width: contentWidth - PANEL_INDENT,
          height: panelH,
        }
        const cx = panel.x + PANEL_INSET_X
        let cursor = panel.y + PANEL_INSET_Y
        /** パネルの全幅を使う1行を置いて、次の行の上端まで進める */
        const fullRow = (rowHeight: number, gap: number): Rect => {
          const r: Rect = { x: cx, y: cursor, width: panelContentWidth, height: rowHeight }
          cursor += rowHeight + gap
          return r
        }
        /** 節の見出しの帯を置いて本文の上端まで進める */
        const sectionLabel = (bandHeight = labelH): Rect => fullRow(bandHeight, SECTION_GAP)

        const solutionLabel = sectionLabel()
        // 節の中の空きは見出しと同じ `SECTION_GAP`（キャンバスの `.sec` の gap）
        const hypoTitle = fullRow(hypoTitleH, SECTION_GAP)
        const detail = fullRow(detailH, PANEL_GAP)

        const valueLabel = sectionLabel()
        const valueField = fullRow(valueH, PANEL_GAP)

        const judgeLabel = sectionLabel(judgeLabelH)
        const judgeNote = fullRow(judgeNoteH, 0)

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
        const notesLabel = sectionLabel()
        const noteCells = noteHs.map((nh) => {
          const r: Rect = { x: cx, y: cursor, width: panelContentWidth, height: nh }
          cursor += nh + ROW_GAP
          return r
        })
        const addRect: Rect = { x: cx, y: cursor, width: panelContentWidth, height: ACTION_HEIGHT }

        return {
          rect: { x, y, width: contentWidth, height },
          row: null,
          expanded: {
            panel,
            solution: { label: solutionLabel, title: hypoTitle, detail },
            value: { label: valueLabel, field: valueField },
            judgement: { label: judgeLabel, note: judgeNote },
            previousLabel,
            previous: previousRects,
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
    /** 開いているか（＝鍵が自分を指していて、かつ仮説を1本以上持つ） */
    open: boolean
    /** 開けるか（仮説を1本以上持つ）。描く側はトグルの出し分けにこれを見る */
    expandable: boolean
    width: number
    /** 箱の中の文章が使える幅（`width - ISSUE_INSET_X * 2`）。展開すると広がる */
    contentWidth: number
    titleWidth: number
    titleHeight: number
    /**
     * タイトルの行高。**開いた課題は `EXPANDED_TITLE_FONT_CLASS`（16px）で
     * 描かれる**ので、シェブロンを1行目の中央に置く計算もその行高で行う
     *——14px の行高で割ると、開いた瞬間にシェブロンだけが上にずれる
     */
    titleLineHeight: number
    /** 見送りバッジ（無ければ 0）。タイトルの右に空ける幅は `BADGE_GAP + これ` */
    badgeWidth: number
    reasonHeight: number | null
    height: number
    rows: number[]
  }
  const boxes: BoxPlan[] = data.issues.map((node, i) => {
    const rows = rowsOf.get(node.id) ?? []
    // **開くものが無ければ開かない。** 鍵が自分を指していても仮説が0本なら
    // 畳んだまま——展開中の課題から最後の仮説を消したときに、行の無い 780 幅の
    // 箱が残らないようにする（`IssuePlacement.expandable` の解説）
    const expandable = rows.length > 0
    // **行の側と同じ判定を通す。** 仮説行は `issueIndexOf`（先勝ち）で持ち主を
    // 引くので、ID が重複しているとき開けるのは**先に現れた方だけ**である。
    // ここで後ろ側も開けてしまうと、320 前提で測った行を 780 の箱に置くこと
    // （またはその逆）になり、行とパネルが箱からはみ出す
    const open = i === expandedIssueIndex && expandable && issueIndexOf.get(node.id) === i
    const latestFlag = node.events[node.events.length - 1]
    const flagged = latestFlag !== undefined
    // 「仮説なし」と旗は**排他**（旗を掲げた課題は抑制されるので問いが立たない）。
    // 同じ場所に置いてよい
    const warn = posed.issueNeedsHypothesis[i]
    const badgeW = flagged
      ? badgeWidth(ISSUE_EVENT_LABELS[latestFlag.kind], fonts.small)
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
    // まだ見送っていない箱のトリガーは `IssueTreeEditor` の `DEFER_TRIGGER_FACE`
    // ＝バッジと同じ幾何（`px-1.5` ＋ 枠 1px）を描くので、幅も `actionWidth`
    // （`px-1` 前提）ではなく `badgeWidth` で測る。**描く面が変わったら測る式も
    // 対で直すこと**——片方だけ変えると、予約した枠より描画が広くなってはみ出す
    const slotW = flagged
      ? badgeW
      : Math.max(badgeW, badgeWidth(ISSUE_EVENT_LABELS.deferred, fonts.small))
    const reserve = BADGE_GAP + slotW

    // **箱の幅は導出しない**（`measure.ts` の `BOX_WIDTH` の解説）。
    // M24 より前は「仮説も見送りも無い箱だけタイトルの自然幅」という分岐が
    // あり、そこで `minWidth <= maxWidth`（逆転するとタイトルが黙って下限を
    // 割る）に依存していた。**幅が固定になったので、その依存ごと消えている**
    // ——枠は常に固定幅の中から取られ、枠が文章を食って下限を割る経路が無い。
    //
    // 残っている不変条件は「一番広い枠を引いてもタイトルが痩せすぎない」だけで、
    // これは `layout.test.ts` が測定器から導いた下限で見ている。**`BOX_WIDTH` を
    // 縮めるか、バッジの語を伸ばすと、そのテストが赤くなる**
    //
    // **展開している課題だけが `EXPANDED_BOX_WIDTH`**（m5）。これも固定値であって
    // 内容から導出しない——導出にすると、開いた瞬間に幅が文言の長さで変わる
    const width = open ? EXPANDED_BOX_WIDTH : BOX_WIDTH
    const contentWidth = width - ISSUE_INSET_X * 2
    /**
     * **タイトルの左には開閉トグルのぶんを必ず空ける。** 仮説を持たない課題でも
     * 空けるのは、同じ列の中でタイトルの左端を揃えるため（`IssueBox` は
     * トグルを `invisible` にするだけで場所は残す）。右上の枠を常に1枠空けて
     * いるのと同じ判断で、理由も同じ——出たり消えたりする要素で文章の幅が
     * 動くと、列のスキャン性（UI ノート D3 rev.3）が落ちる
     */
    const titleInset = CHEVRON_SIZE + CHEVRON_GAP
    const titleWidth = contentWidth - titleInset - reserve

    /**
     * **展開中の課題タイトルは一段大きい**（`EXPANDED_TITLE_FONT_CLASS` ＝
     * text-base 16px）。**測る側と描く側（`IssueBox`）が同じ条件で切り替わること。**
     * 片方だけだと、測定より広く描いて折り返しが1行増え、高さ固定＋
     * `overflow-hidden` の textarea で末尾の行が黙って見えなくなる
     */
    const titleFont = open ? fonts.expandedTitle : fonts.title
    const titleHeight = textHeight(node.text, titleFont, titleWidth)
    const reasonHeight = flagged
      ? textHeight(latestFlag.note, fonts.small, contentWidth - ROW_INDENT)
      : null

    let height = ISSUE_INSET_Y * 2 + titleHeight
    if (reasonHeight !== null) height += TITLE_GAP + reasonHeight
    if (rows.length > 0) {
      height += TITLE_GAP + ROW_GAP * (rows.length - 1)
      for (const hi of rows) height += plans[hi].height
    }
    return {
      open,
      expandable,
      width,
      contentWidth,
      titleWidth,
      titleHeight,
      titleLineHeight: titleFont.lineHeight,
      badgeWidth: badgeW,
      reasonHeight,
      height,
      rows,
    }
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
      // 開閉トグルはタイトルの1行目に対して縦中央。**行の中央ではない**
      //（タイトルが折り返すと、中央ではシェブロンだけが下がる。仮説行の
      // 行頭の点をバッジに揃えているのと同じ理屈）
      const chevron: Rect = {
        x: left,
        y: cursor + Math.floor((box.titleLineHeight - CHEVRON_SIZE) / 2),
        width: CHEVRON_SIZE,
        height: CHEVRON_SIZE,
      }
      const title: Rect = {
        x: left + CHEVRON_SIZE + CHEVRON_GAP,
        y: cursor,
        width: box.titleWidth,
        height: box.titleHeight,
      }
      cursor += box.titleHeight
      let event: { badge: Rect; reason: Rect } | null = null
      if (box.reasonHeight !== null) {
        cursor += TITLE_GAP
        event = {
          badge: {
            x: left + box.width - ISSUE_INSET_X * 2 - box.badgeWidth,
            y: title.y,
            width: box.badgeWidth,
            height: BADGE_HEIGHT,
          },
          reason: {
            x: left + ROW_INDENT,
            y: cursor,
            width: box.contentWidth - ROW_INDENT,
            height: box.reasonHeight,
          },
        }
        cursor += box.reasonHeight
      }
      issues[i] = {
        rect: { x: point.x, y: point.y, width: box.width, height: box.height },
        expanded: box.open,
        expandable: box.expandable,
        chevron,
        title,
        event,
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
