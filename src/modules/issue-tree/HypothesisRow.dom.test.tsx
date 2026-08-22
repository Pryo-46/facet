// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createEstimateMeasurer } from '@/core/canvas/wrap'
import type { IssueTreeSchemaVersion2 } from '@/types/issue-tree'
import { badgeClass } from './badge-styles'
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
  title: { measure: createEstimateMeasurer(14), lineHeight: 23 },
  body: { measure: createEstimateMeasurer(14), lineHeight: 23 },
  small: { measure: createEstimateMeasurer(12), lineHeight: 18 },
}

/**
 * 課題2件・仮説3件のファイル。**退化した形（仮説1件・イベント1件）を避ける**
 * ——「最新だけ編集できる」は要素が1つだと「全部編集できる」と区別が付かない
 */
const data: IssueTreeSchemaVersion2 = {
  schemaVersion: 2,
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
      text: '同期取得で間に合う',
      rationale: '先行プロジェクトの実測',
      events: [
        { kind: 'supportedWithoutTest', note: '前回の実測値がそのまま使える' },
        { kind: 'rejected', note: '実機では3秒を超えた' },
      ],
      pendingNotes: [],
    },
    {
      id: H(2),
      issueId: I(1),
      text: 'webhook受信に切り替える',
      rationale: '',
      events: [],
      pendingNotes: ['受信の重複をどう畳むか', '再送の窓は何分か'],
    },
    {
      id: H(3),
      issueId: I(0),
      text: '先に受付IDだけ返す',
      rationale: '既存APIの前例',
      events: [{ kind: 'supported', note: '' }],
      pendingNotes: ['画面側の待ち表示は別課題'],
    },
  ],
}

const posed = poseQuestions(data)

function renderRow(index: number, opts: { expanded?: boolean; suppressed?: boolean } = {}) {
  const expanded = opts.expanded === true
  const layout = layoutIssueTree(data, posed, fonts, expanded ? index : -1)
  const placement = layout.hypotheses[index]
  if (placement === null) throw new Error(`仮説${index + 1}が図に位置を持たない`)
  const h = data.hypotheses[index]
  const ownerIndex = data.issues.findIndex((n) => n.id === h.issueId)
  const owner = layout.issues[ownerIndex]
  if (owner === null) throw new Error('持ち主の課題が図に位置を持たない')
  const onExpand = vi.fn()
  const onPromoteNote = vi.fn()
  const onAddNote = vi.fn()
  render(
    <HypothesisRow
      hypothesisKey={`row${index}`}
      label={`仮説${index + 1}`}
      placement={placement}
      origin={owner.rect}
      text={h.text}
      rationale={h.rationale}
      notes={h.pendingNotes}
      events={h.events}
      invalid={false}
      suppressed={opts.suppressed === true}
      expanded={expanded}
      onExpand={onExpand}
      onTextChange={vi.fn()}
      onRationaleChange={vi.fn()}
      onNoteChange={vi.fn()}
      onEventNoteChange={vi.fn()}
      onPromoteNote={onPromoteNote}
      onAddNote={onAddNote}
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
  return { onExpand, onPromoteNote, onAddNote }
}

describe('HypothesisRow: 畳まれた行', () => {
  it('行はボタンで、文言と5語のバッジを出す', () => {
    renderRow(0)
    const row = screen.getByRole('button', { name: '仮説1を開く' })
    expect(row.textContent).toContain('同期取得で間に合う')
    // 俯瞰は5語。**正確な種別（棄却／検証せず棄却）は展開で出す**
    expect(row.textContent).toContain(BADGE_LABELS.no)
    // 畳まれている行に詳細は無い（由来・FB・以前の判断は出さない）
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByText(SECTION_LABELS.rationale)).toBeNull()
  })

  it('フォーカスが入ると開く（Tab で行に着いた瞬間に文言を打てる継ぎ目）', () => {
    const { onExpand } = renderRow(0)
    fireEvent.focus(screen.getByRole('button', { name: '仮説1を開く' }))
    expect(onExpand).toHaveBeenCalled()
  })

  it('抑制された行のバッジは群を問わず薄い枠になる', () => {
    renderRow(0, { suppressed: true })
    // **クラス名を打ち直さない**——`badgeClass` の戻り値と照合する
    expect(screen.getByText(BADGE_LABELS.no).className).toBe(badgeClass('no', true))
  })
})

describe('HypothesisRow: 展開した行', () => {
  it('文言が textarea になり、判断・以前の判断・由来・FB の節が出る', () => {
    renderRow(0, { expanded: true })
    expect(screen.getByRole('textbox', { name: '仮説1' })).toBeInstanceOf(HTMLTextAreaElement)
    // **畳まれた行のボタンは消えている。** 同じ `data-cell` を名乗る2つが
    // DOM に並ぶと、エディタのフォーカス予約が先頭を掴んで静かに外れる
    expect(screen.queryByRole('button', { name: '仮説1を開く' })).toBeNull()
    for (const label of Object.values(SECTION_LABELS)) {
      expect(screen.getByText(label)).toBeTruthy()
    }
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

  it('以前の判断は正確な種別で出る（俯瞰の5語ではない）', () => {
    renderRow(0, { expanded: true })
    // 最新（rejected）ではなく1つ前（supportedWithoutTest）の話。
    // 5語なら「支持」になるところが「自明に成立」で出る
    const badge = screen.getByText(EVENT_KIND_LABELS.supportedWithoutTest)
    expect(badge.className).toBe(badgeClass('yes', true))
    expect(screen.queryByText(BADGE_LABELS.yes)).toBeNull()
  })

  it('イベントが無い仮説の判断の節は「未決」のバッジと「判断を追加」のトリガーを持つ', () => {
    renderRow(1, { expanded: true })
    // 「未決」は2つ出る——行末のバッジ（俯瞰の5語）と、判断の節のバッジ。
    // **どちらも同じ面**（破線の枠）で、面を塗らない
    const badges = screen.getAllByText(BADGE_LABELS.open)
    expect(badges).toHaveLength(2)
    for (const badge of badges) expect(badge.className).toBe(badgeClass('open', false))
    expect(screen.getByText(NO_JUDGEMENT_TEXT)).toBeTruthy()
    expect(screen.getByRole('button', { name: JUDGEMENT_TRIGGER_LABELS.empty })).toBeTruthy()
    // 以前の判断の節は出ない（1件も無い）
    expect(screen.queryByText(SECTION_LABELS.previous)).toBeNull()
  })

  it('FB は1件ずつ欄になり、末尾に「＋ FB」がある', () => {
    const { onAddNote } = renderRow(1, { expanded: true })
    expect(screen.getByRole('textbox', { name: '仮説2 のFB1' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '仮説2 のFB2' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '仮説2 にFBを足す' }))
    expect(onAddNote).toHaveBeenCalled()
  })

  it('FB の「根拠へ」はイベントが1件以上あるときだけ出る', () => {
    renderRow(1, { expanded: true })
    // イベント0件では移動先が無い＝押しても何も起きないボタンを作らない
    expect(screen.queryByRole('button', { name: '仮説2 のFB1 を根拠へ移す' })).toBeNull()
    cleanup()

    const { onPromoteNote } = renderRow(2, { expanded: true })
    fireEvent.click(screen.getByRole('button', { name: '仮説3 のFB1 を根拠へ移す' }))
    expect(onPromoteNote).toHaveBeenCalledWith(0)
  })
})
