// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { badgeClass } from '@/components/badge-styles'
import { createEstimateMeasurer } from '@/core/canvas/wrap'
import type { IssueTreeSchemaVersion3 } from '@/types/issue-tree'
import { badgeVariantOf } from './badge-variant'
import { BADGE_LABELS, EVENT_KIND_LABELS } from './derive'
import { HypothesisRow } from './HypothesisRow'
import { poseQuestions } from './derive'
import {
  JUDGEMENT_TRIGGER_LABELS,
  layoutIssueTree,
  NO_JUDGEMENT_TEXT,
  SECTION_LABELS,
  type IssueTreeFonts,
} from './layout'

afterEach(cleanup)

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

/** 測定は決定的な概算器で行う（jsdom はレイアウトを持たない） */
const fonts: IssueTreeFonts = {
  title: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  body: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  small: { measure: createEstimateMeasurer(14), lineHeight: 18 },
}

/**
 * **「まだ出していない」ことを番人で押さえる。** 暫定の見た目を置くと、
 * m5 がそれを剥がす手間と、剥がし忘れの両方が生まれる。
 *
 * **目印の文字列を使う。** 「出していない」を空の値で見ると、
 * 何もしなくても緑になる（退化ケース）——フィクスチャに実在する
 * 文字列を入れ、それが画面に無いことを見る。だからフィクスチャ
 * （下の `data`）にも実在させる
 */
const DETAIL_SENTINEL = '受信を待たずに画面を返す（DETAIL）'
const VALUE_SENTINEL = '応募者を待たせない（VALUE）'
const ASK_SENTINEL = '待ち画面で離脱しないか（ASK）'

/**
 * 課題2件・仮説3件のファイル。**退化した形（仮説1件・イベント1件）を避ける**
 * ——「最新だけ編集できる」は要素が1つだと「全部編集できる」と区別が付かない
 */
const data: IssueTreeSchemaVersion3 = {
  schemaVersion: 3,
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
        { kind: 'supported', note: '前回の実測値がそのまま使える', date: '2026-08-01' },
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
        { askId: null, text: '再送の窓は何分か', by: '', sentiment: 'note', date: '2026-08-01' },
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
      feedbacks: [{ askId: null, text: '画面側の待ち表示は別課題', by: '', sentiment: 'note', date: '2026-08-01' }],
      events: [{ kind: 'supported', note: '', date: '2026-08-01' }],
    },
  ],
}

const posed = poseQuestions(data)

function renderRow(index: number, opts: { expanded?: boolean; suppressed?: boolean } = {}) {
  const expanded = opts.expanded === true
  const h = data.hypotheses[index]
  const ownerIndex = data.issues.findIndex((n) => n.id === h.issueId)
  // **`layoutIssueTree` の第4引数は「展開している課題の添字」**（m5 で仮説の
  // 添字から変わった）。行を開くには、その行がぶら下がる課題を開く
  const layout = layoutIssueTree(data, posed, fonts, expanded ? ownerIndex : -1)
  const placement = layout.hypotheses[index]
  if (placement === null) throw new Error(`仮説${index + 1}が図に位置を持たない`)
  const owner = layout.issues[ownerIndex]
  if (owner === null) throw new Error('持ち主の課題が図に位置を持たない')
  const onExpand = vi.fn()
  const onAddFeedback = vi.fn()
  render(
    <HypothesisRow
      hypothesisKey={`row${index}`}
      label={`仮説${index + 1}`}
      placement={placement}
      origin={owner.rect}
      title={h.title}
      notes={h.feedbacks.map((f) => f.text)}
      events={h.events}
      invalid={false}
      suppressed={opts.suppressed === true}
      expanded={expanded}
      onExpand={onExpand}
      onTitleChange={vi.fn()}
      onFeedbackTextChange={vi.fn()}
      onEventNoteChange={vi.fn()}
      onAddFeedback={onAddFeedback}
      // 判断のドロップダウンはエディタが組む（行は置き場所だけを持つ）。
      // **トリガーの文言はレイアウトが持つ定数**——測った幅と描く幅を同じ
      // 文字列から出すので、ここでも打ち直さない
      judgementMenu={
        <button type="button">
          {JUDGEMENT_TRIGGER_LABELS[h.events.length === 0 ? 'empty' : 'latest']}
        </button>
      }
    />,
  )
  return { onExpand, onAddFeedback }
}

describe('HypothesisRow: 畳まれた行', () => {
  it('行はボタンで、文言と5語のバッジを出す', () => {
    renderRow(0)
    const row = screen.getByRole('button', { name: '仮説1を開く' })
    expect(row.textContent).toContain('同期取得で間に合う')
    // 行末に出るのは俯瞰の5語のバッジ（最新の判断＝棄却）
    expect(row.textContent).toContain(BADGE_LABELS.no)
    // 畳まれている行に詳細は無い（FB・以前の判断は出さない）
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
})

describe('HypothesisRow: 展開した行', () => {
  it('文言が textarea になり、判断・以前の判断・FB の節が出る（由来抜き）', () => {
    renderRow(0, { expanded: true })
    expect(screen.getByRole('textbox', { name: '仮説1' })).toBeInstanceOf(HTMLTextAreaElement)
    // **畳まれた行のボタンは消えている。** 同じ `data-cell` を名乗る2つが
    // DOM に並ぶと、エディタのフォーカス予約が先頭を掴んで静かに外れる
    expect(screen.queryByRole('button', { name: '仮説1を開く' })).toBeNull()
    for (const label of Object.values(SECTION_LABELS)) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('展開しても「由来」の欄は無い（v3 で廃止）', () => {
    renderRow(0, { expanded: true })
    expect(screen.queryByRole('textbox', { name: /の由来$/ })).toBeNull()
  })

  /**
   * **「まだ出していない」ことの番人。** `detail` / `value` / `asks` は
   * `HypothesisRowProps` に存在しないので、実は一番強い番人は型そのものである
   *（型が通らないので渡しようがない）。この `it` は「props を増やして
   * 描き始めたら赤くなる」ための番人で、型の番人が外された後に効く
   */
  it('detail / value / asks は画面に出さない（m5 が設計する）', () => {
    renderRow(0, { expanded: true })
    expect(screen.queryByText(DETAIL_SENTINEL)).toBeNull()
    expect(screen.queryByText(VALUE_SENTINEL)).toBeNull()
    expect(screen.queryByText(ASK_SENTINEL)).toBeNull()
  })

  /**
   * これが壊れると「追記専用」がデータの上（`setEventNote`）だけの約束になり、
   * 画面からは静かに破れる——過去の根拠が編集できると、
   * 「そのとき何を根拠に決めたか」が後から書き換わる
   */
  it('根拠を編集できるのは最新のイベントだけ', () => {
    renderRow(0, { expanded: true })
    expect(screen.getAllByRole('textbox', { name: /の根拠$/ })).toHaveLength(1)
    expect(
      screen.getByRole('textbox', { name: `仮説1 の${EVENT_KIND_LABELS.rejected}の根拠` }),
    ).toBeInstanceOf(HTMLTextAreaElement)
    // 「引けない」だけでは消えていても緑になる。読めることまで見る
    expect(screen.getByText('前回の実測値がそのまま使える')).toBeTruthy()
  })

  /**
   * **かつてここは「以前の判断は俯瞰の5語ではなく正確な種別で出る」を見ていた**
   *（1つ前が `supportedWithoutTest` なら「支持」ではなく「自明に成立」と出る）。
   * 判断を5語に畳んだいま、語では現在と過去を区別できない——**区別するのは面**
   * である。覆される前の判断が「いま決まっていること」に見えないのは薄い枠のおかげで、
   * それが崩れると履歴が現役の判断の顔をする
   */
  it('以前の判断は薄い面で出る（現在の判断と語では区別できない）', () => {
    renderRow(0, { expanded: true })
    // 最新（rejected）ではなく1つ前（supported）の話
    const badge = screen.getByText(EVENT_KIND_LABELS.supported)
    expect(badge.className).toBe(badgeClass(badgeVariantOf('yes', true)))
    // 現在の判断（棄却）の面は塗られたまま——薄いのは過去だけ。
    // **「棄却」は2つ出る**（行末のバッジと、判断の節のバッジ）。`[0]` だけを見ると
    // どちらを掴んでも通ってしまい、節のバッジだけが薄れる退行を見逃す
    const filled = screen.getAllByText(EVENT_KIND_LABELS.rejected)
    expect(filled).toHaveLength(2)
    for (const b of filled) expect(b.className).toBe(badgeClass(badgeVariantOf('no', false)))
  })

  it('イベントが無い仮説の判断の節は「未決」のバッジと「判断を追加」のトリガーを持つ', () => {
    renderRow(1, { expanded: true })
    // 「未決」は2つ出る——行末のバッジ（俯瞰の5語）と、判断の節のバッジ。
    // **どちらも同じ面**（破線の枠）で、面を塗らない
    const badges = screen.getAllByText(BADGE_LABELS.open)
    expect(badges).toHaveLength(2)
    for (const badge of badges) expect(badge.className).toBe(badgeClass(badgeVariantOf('open', false)))
    expect(screen.getByText(NO_JUDGEMENT_TEXT)).toBeTruthy()
    expect(screen.getByRole('button', { name: JUDGEMENT_TRIGGER_LABELS.empty })).toBeTruthy()
    // 以前の判断の節は出ない（1件も無い）
    expect(screen.queryByText(SECTION_LABELS.previous)).toBeNull()
  })

  it('FB は1件ずつ欄になり、末尾に「＋ FB」がある', () => {
    const { onAddFeedback } = renderRow(1, { expanded: true })
    expect(screen.getByRole('textbox', { name: '仮説2 のFB1' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '仮説2 のFB2' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '仮説2 にFBを足す' }))
    expect(onAddFeedback).toHaveBeenCalled()
  })
})
