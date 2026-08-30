// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { badgeClass } from '@/components/badge-styles'
import { createEstimateMeasurer } from '@/core/canvas/wrap'
import type { IssueTreeSchemaVersion4 } from '@/types/issue-tree'
import { badgeVariantOf } from './badge-variant'
import { BADGE_LABELS, poseQuestions } from './derive'
import { HypothesisRow } from './HypothesisRow'
import { layoutIssueTree, type IssueTreeFonts } from './layout'

afterEach(cleanup)

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

/** 測定は決定的な概算器で行う（jsdom はレイアウトを持たない） */
const fonts: IssueTreeFonts = {
  title: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  expandedTitle: { measure: createEstimateMeasurer(18), lineHeight: 27 },
  body: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  small: { measure: createEstimateMeasurer(14), lineHeight: 18 },
}

/**
 * **「畳まれた行には出さない」ことを目印の文字列で押さえる。** 「出していない」を
 * 空の値で見ると、何もしなくても緑になる（退化ケース）——フィクスチャに実在する
 * 文字列を入れ、それが画面に無いことを見る
 */
const DETAIL_SENTINEL = '受信を待たずに画面を返す（DETAIL）'
const VALUE_SENTINEL = '応募者を待たせない（VALUE）'
const ASK_SENTINEL = '待ち画面で離脱しないか（ASK）'

/**
 * 課題2件・仮説3件のファイル。**退化した形（仮説1件・イベント1件）を避ける**
 */
const data: IssueTreeSchemaVersion4 = {
  schemaVersion: 4,
  type: 'issueTree',
  title: 'テスト',
  issues: [
    { id: I(0), parentId: null, text: '結果取得を画面遷移の中で待てるか', events: [] },
    { id: I(1), parentId: I(0), text: '待てないなら何を先に返すか', events: [] },
  ],
  hypotheses: [
    {
      id: H(1),
      issueId: I(1),
      title: '同期取得で間に合う',
      detail: DETAIL_SENTINEL,
      value: VALUE_SENTINEL,
      asks: [{ id: 'ask_AAAAAAAAAA', text: ASK_SENTINEL }],
      feedbacks: [],
      events: [
        { kind: 'rejected', note: '実機では3秒を超えた', date: '2026-08-02' },
      ],
    },
    {
      id: H(2),
      issueId: I(1),
      title: 'webhook受信に切り替える',
      detail: '',
      value: '',
      asks: [],
      feedbacks: [
        { askId: null, text: '受信の重複をどう畳むか', by: '', sentiment: 'note', date: '2026-08-01' },
      ],
      events: [],
    },
    {
      id: H(3),
      issueId: I(0),
      title: '先に受付IDだけ返す',
      detail: '',
      value: '',
      asks: [],
      feedbacks: [],
      events: [{ kind: 'supported', note: '', date: '2026-08-01' }],
    },
  ],
}

const posed = poseQuestions(data)

function renderRow(index: number, opts: { suppressed?: boolean } = {}) {
  const h = data.hypotheses[index]
  const ownerIndex = data.issues.findIndex((n) => n.id === h.issueId)
  // **どの課題も開かない**（第4引数 -1）。開いた課題の仮説は行ではなく
  // `HypothesisPanel` が描くので、この部品のテストに展開の枝は無い
  const layout = layoutIssueTree(data, posed, fonts, -1)
  const placement = layout.hypotheses[index]
  if (placement === null) throw new Error(`仮説${index + 1}が図に位置を持たない`)
  if (placement.row === null) throw new Error(`仮説${index + 1}が畳まれていない`)
  const owner = layout.issues[ownerIndex]
  if (owner === null) throw new Error('持ち主の課題が図に位置を持たない')
  const onExpand = vi.fn()
  render(
    <HypothesisRow
      hypothesisKey={`row${index}`}
      label={`仮説${index + 1}`}
      rect={placement.rect}
      row={placement.row}
      origin={owner.rect}
      title={h.title}
      events={h.events}
      suppressed={opts.suppressed === true}
      onExpand={onExpand}
    />,
  )
  return { onExpand }
}

/** クラスは**トークンで**見る（`text-ink` は `text-ink-muted` の部分文字列） */
function hasClass(el: Element, token: string): boolean {
  return el.className.split(/\s+/).includes(token)
}

describe('HypothesisRow: 畳まれた行', () => {
  it('行はボタンで、文言と5語のバッジを出す', () => {
    renderRow(0)
    const row = screen.getByRole('button', { name: '仮説1を開く' })
    expect(row.textContent).toContain('同期取得で間に合う')
    // 行末に出るのは俯瞰の5語のバッジ（最新の判断＝棄却）
    expect(row.textContent).toContain(BADGE_LABELS.no)
    // 畳まれている行に欄は無い（詳細・FB・以前の判断は展開パネルの担当）
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  /**
   * **押したときだけ開く。** m5 より前は `onFocus` でも開いており、`Tab` で行に
   * 着いた瞬間に textarea へ移っていた——1回の `Tab` でフォーカスが2回動くので、
   * キーで木を歩くときに行き先が読めない（`open-issues.md` に上がっていた欠陥）
   */
  it('押すと開く。フォーカスが入っただけでは開かない', () => {
    const { onExpand } = renderRow(0)
    const row = screen.getByRole('button', { name: '仮説1を開く' })
    fireEvent.focus(row)
    expect(onExpand).not.toHaveBeenCalled()
    fireEvent.click(row)
    expect(onExpand).toHaveBeenCalled()
  })

  it('抑制された行のバッジは群を問わず薄い枠になる', () => {
    renderRow(0, { suppressed: true })
    // **クラス名を打ち直さない**——`badgeClass` の戻り値と照合する
    expect(screen.getByText(BADGE_LABELS.no).className).toBe(badgeClass(badgeVariantOf('no', true)))
  })

  /**
   * **棄却は文字を一段落とすだけで表す**（計画の前提7）。灰色の面を敷くと
   * 「見送りの箱」（`surface-muted`）と同じ見え方になり、**抑制（祖先が
   * 見送った枝）と見分けが付かなくなる**。棄却の理由は本開発から遡って
   * 読む対象なので、読めなくはしない
   */
  it('棄却された仮説の文言は一段落ちる（面は敷かない）', () => {
    renderRow(0)
    const rejected = screen.getByText('同期取得で間に合う')
    expect(hasClass(rejected, 'text-ink-muted')).toBe(true)
    // 面を敷いていない（行のボタンにも文言にも背景のクラスが無い）
    const row = screen.getByRole('button', { name: '仮説1を開く' })
    expect(/(^|\s)bg-/.test(row.className)).toBe(false)
    expect(/(^|\s)bg-/.test(rejected.className)).toBe(false)
    cleanup()
    // 棄却でない行は落とさない（「常に muted」でも緑になるのを防ぐ）
    renderRow(2)
    expect(hasClass(screen.getByText('先に受付IDだけ返す'), 'text-ink')).toBe(true)
  })

  it('detail / value / asks は畳まれた行に出さない（展開パネルの担当）', () => {
    renderRow(0)
    expect(screen.queryByText(DETAIL_SENTINEL)).toBeNull()
    expect(screen.queryByText(VALUE_SENTINEL)).toBeNull()
    expect(screen.queryByText(ASK_SENTINEL)).toBeNull()
  })
})
