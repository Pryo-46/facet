import { buildTree, type FlatTreeNode } from '@/core/canvas/flat-tree'
import { layoutTree, type Size } from '@/core/canvas/tree-layout'
import type { Rect } from '@/core/canvas/viewport'
import { wrapWithin, type MeasureWidth } from '@/core/canvas/wrap'
import type { IssueTreeSchemaVersion1 } from '@/types/issue-tree'
import { SUPPRESSED_NOTE, suppressedIssueIds, type PosedQuestions } from './derive'
import {
  BADGE_HEIGHT,
  CARD_CONTENT_WIDTH,
  CARD_GAP,
  CARD_INDENT,
  CARD_INSET_X,
  CARD_INSET_Y,
  CARD_WIDTH,
  ISSUE_INSET_X,
  ISSUE_INSET_Y,
  ISSUE_MAX_WIDTH,
  ISSUE_MIN_WIDTH,
  ROW_GAP,
  ROW_INDENT,
} from './measure'

/** 本文（text-sm）と小さい文字（text-xs）の測定器。エディタが DOM から作る */
export interface IssueTreeFonts {
  body: { measure: MeasureWidth; lineHeight: number }
  small: { measure: MeasureWidth; lineHeight: number }
}

export interface IssuePlacement {
  /** 課題ノードの矩形（世界座標） */
  rect: Rect
  /** 見送りイベントの行（世界座標。読み取り専用の表示） */
  deferrals: Rect[]
  /** 「祖先の見送りにより問いは立たない」の1行。抑制されていなければ null */
  suppressedNote: Rect | null
}

export interface HypothesisPlacement {
  /** カードの外枠 */
  rect: Rect
  text: Rect
  /** 立っている問いのバッジ。立っていなければ null */
  badge: Rect | null
  rationale: Rect
  notes: Rect[]
  events: { label: Rect; note: Rect }[]
}

export interface IssueTreeLayout {
  /** issues と同じ添字。循環して根から到達できないものは null */
  issues: (IssuePlacement | null)[]
  /** hypotheses と同じ添字。ぶら下がり先が図に無いものは null */
  hypotheses: (HypothesisPlacement | null)[]
  width: number
  height: number
}

/** カード内の1行を測る（余白はカードが1度だけ持つので、ここでは 0） */
function rowHeight(text: string, font: { measure: MeasureWidth; lineHeight: number }, width: number): number {
  return wrapWithin(text, font.measure, font.lineHeight, {
    maxWidth: width,
    minWidth: 0,
    insetX: 0,
    insetY: 0,
  }).height
}

/**
 * 課題ツリーのレイアウト（**完全な純関数**）。
 *
 * 課題ノードと、そこにぶら下がる仮説カードを縦に積んだものを1つのブロックと
 * して畳み、ブロックのサイズをコアの `layoutTree` へ渡す。木の畳み方
 *（親を最初の子と最後の子の中心に置く／兄弟の衝突を全深さで見る）は
 * ロジックツリーと同じ関数がやる。
 *
 * **ここに「前回どこにあったか」の状態を混ぜないこと**——同じデータから
 * 違う図が出るようになった時点で「図は導出」（rev 3章）が崩れる
 */
export function layoutIssueTree(
  data: IssueTreeSchemaVersion1,
  posed: PosedQuestions,
  fonts: IssueTreeFonts,
): IssueTreeLayout {
  const suppressed = suppressedIssueIds(data.issues)

  // --- 1. 仮説カードの中身を測る（課題ごとにまとめる） ---
  interface CardPlan { height: number; build: (x: number, y: number) => HypothesisPlacement }
  const plans: (CardPlan | null)[] = data.hypotheses.map((h, hi) => {
    const q = posed.hypothesisQuestions[hi]
    const hasBadge = q.result || q.judgement
    const textH = rowHeight(h.text, fonts.body, CARD_CONTENT_WIDTH)
    const rationaleH = rowHeight(h.rationale, fonts.small, CARD_CONTENT_WIDTH)
    const noteHs = h.pendingNotes.map((n) => rowHeight(n, fonts.small, CARD_CONTENT_WIDTH - ROW_INDENT))
    const eventHs = h.events.map((e) => rowHeight(e.note, fonts.small, CARD_CONTENT_WIDTH - ROW_INDENT))
    let height = CARD_INSET_Y * 2 + textH
    if (hasBadge) height += ROW_GAP + BADGE_HEIGHT
    height += ROW_GAP + rationaleH
    for (const nh of noteHs) height += ROW_GAP + nh
    for (const eh of eventHs) height += ROW_GAP + BADGE_HEIGHT + ROW_GAP + eh
    return {
      height,
      build: (x, y) => {
        let cursor = y + CARD_INSET_Y
        const left = x + CARD_INSET_X
        const text: Rect = { x: left, y: cursor, width: CARD_CONTENT_WIDTH, height: textH }
        cursor += textH
        let badge: Rect | null = null
        if (hasBadge) {
          cursor += ROW_GAP
          badge = { x: left, y: cursor, width: CARD_CONTENT_WIDTH, height: BADGE_HEIGHT }
          cursor += BADGE_HEIGHT
        }
        cursor += ROW_GAP
        const rationale: Rect = { x: left, y: cursor, width: CARD_CONTENT_WIDTH, height: rationaleH }
        cursor += rationaleH
        const notes = noteHs.map((nh) => {
          cursor += ROW_GAP
          const r: Rect = { x: left + ROW_INDENT, y: cursor, width: CARD_CONTENT_WIDTH - ROW_INDENT, height: nh }
          cursor += nh
          return r
        })
        const events = eventHs.map((eh) => {
          cursor += ROW_GAP
          const labelRect: Rect = { x: left, y: cursor, width: CARD_CONTENT_WIDTH, height: BADGE_HEIGHT }
          cursor += BADGE_HEIGHT + ROW_GAP
          const noteRect: Rect = { x: left + ROW_INDENT, y: cursor, width: CARD_CONTENT_WIDTH - ROW_INDENT, height: eh }
          cursor += eh
          return { label: labelRect, note: noteRect }
        })
        return { rect: { x, y, width: CARD_WIDTH, height }, text, badge, rationale, notes, events }
      },
    }
  })

  const cardsOf = new Map<string, number[]>()
  data.hypotheses.forEach((h, i) => {
    cardsOf.set(h.issueId, [...(cardsOf.get(h.issueId) ?? []), i])
  })

  // --- 2. 課題ノードとブロックの寸法を測る ---
  const built = buildTree(data.issues)
  const nodeSizes: Size[] = data.issues.map((node) => {
    const w = wrapWithin(node.text, fonts.body.measure, fonts.body.lineHeight, {
      maxWidth: ISSUE_MAX_WIDTH,
      minWidth: ISSUE_MIN_WIDTH,
      insetX: ISSUE_INSET_X,
      insetY: ISSUE_INSET_Y,
    })
    return { width: w.width, height: w.height }
  })
  const deferralHs: number[][] = data.issues.map((node) =>
    node.events.map((e) => BADGE_HEIGHT + ROW_GAP + rowHeight(e.note, fonts.small, CARD_WIDTH - ROW_INDENT)),
  )
  const suppressedNoteH: (number | null)[] = data.issues.map((node) =>
    suppressed.has(node.id) && node.events.length === 0
      ? rowHeight(SUPPRESSED_NOTE, fonts.small, CARD_WIDTH)
      : null,
  )

  const blockSizes = new Map<string, Size>()
  const blockSizeOf = (index: number): Size => {
    let height = nodeSizes[index].height
    for (const dh of deferralHs[index]) height += ROW_GAP + dh
    const note = suppressedNoteH[index]
    if (note !== null) height += ROW_GAP + note
    let width = nodeSizes[index].width
    const cards = cardsOf.get(data.issues[index].id) ?? []
    for (const ci of cards) {
      const plan = plans[ci]
      if (plan === null) continue
      height += CARD_GAP + plan.height
      width = Math.max(width, CARD_INDENT + CARD_WIDTH)
    }
    if (deferralHs[index].length > 0 || note !== null) width = Math.max(width, CARD_WIDTH)
    return { width, height }
  }
  const walkSizes = (node: FlatTreeNode): void => {
    blockSizes.set(node.key, blockSizeOf(node.index))
    for (const child of node.children) walkSizes(child)
  }
  for (const root of built.roots) walkSizes(root)

  // --- 3. コアの木レイアウトへ渡す ---
  const { positions, width, height } = layoutTree(built.roots, blockSizes)

  // --- 4. 世界座標へ展開する ---
  const issues: (IssuePlacement | null)[] = data.issues.map(() => null)
  const hypotheses: (HypothesisPlacement | null)[] = data.hypotheses.map(() => null)
  const walkPlace = (node: FlatTreeNode): void => {
    const point = positions.get(node.key)
    if (point !== undefined) {
      const i = node.index
      let cursor = point.y + nodeSizes[i].height
      const deferrals = deferralHs[i].map((dh) => {
        cursor += ROW_GAP
        const r: Rect = { x: point.x + ROW_INDENT, y: cursor, width: CARD_WIDTH - ROW_INDENT, height: dh }
        cursor += dh
        return r
      })
      const noteH = suppressedNoteH[i]
      let suppressedNote: Rect | null = null
      if (noteH !== null) {
        cursor += ROW_GAP
        suppressedNote = { x: point.x, y: cursor, width: CARD_WIDTH, height: noteH }
        cursor += noteH
      }
      issues[i] = {
        rect: { x: point.x, y: point.y, width: nodeSizes[i].width, height: nodeSizes[i].height },
        deferrals,
        suppressedNote,
      }
      for (const ci of cardsOf.get(data.issues[i].id) ?? []) {
        const plan = plans[ci]
        if (plan === null) continue
        cursor += CARD_GAP
        hypotheses[ci] = plan.build(point.x + CARD_INDENT, cursor)
        cursor += plan.height
      }
    }
    for (const child of node.children) walkPlace(child)
  }
  for (const root of built.roots) walkPlace(root)

  return { issues, hypotheses, width, height }
}
