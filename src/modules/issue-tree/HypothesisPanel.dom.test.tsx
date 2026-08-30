// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { badgeClass } from '@/components/badge-styles'
import { createEstimateMeasurer } from '@/core/canvas/wrap'
import type { IssueTreeSchemaVersion3 } from '@/types/issue-tree'
import { badgeVariantOf } from './badge-variant'
import { BADGE_LABELS, EVENT_KIND_LABELS, poseQuestions } from './derive'
import { HypothesisPanel } from './HypothesisPanel'
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
  expandedTitle: { measure: createEstimateMeasurer(18), lineHeight: 27 },
  body: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  small: { measure: createEstimateMeasurer(14), lineHeight: 18 },
}

/**
 * **目印の文字列を使う**（`HypothesisRow.dom.test.tsx` と同じ流儀）——「出ている」を
 * 空でない値で見ると、フィクスチャを変えただけで意味が変わる
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
        { kind: 'rejected', note: '実機では3秒を超えた', date: '2026-08-13' },
      ],
    },
    {
      // **詳細も価値仮説も判断も空の仮説**（D7 の番人と「日付は判断があるときだけ」の裏）
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
      feedbacks: [
        { askId: null, text: '画面側の待ち表示は別課題', by: '', sentiment: 'note', date: '2026-08-01' },
      ],
      events: [{ kind: 'supported', note: '', date: '2026-08-01' }],
    },
  ],
}

const posed = poseQuestions(data)

function renderPanel(index: number, opts: { suppressed?: boolean } = {}) {
  const h = data.hypotheses[index]
  const ownerIndex = data.issues.findIndex((n) => n.id === h.issueId)
  // **第4引数は「展開している課題の添字」**（m5）。パネルはその課題の全仮説に出る
  const layout = layoutIssueTree(data, posed, fonts, ownerIndex)
  const placement = layout.hypotheses[index]
  if (placement === null) throw new Error(`仮説${index + 1}が図に位置を持たない`)
  if (placement.expanded === null) throw new Error(`仮説${index + 1}のパネルが無い`)
  const owner = layout.issues[ownerIndex]
  if (owner === null) throw new Error('持ち主の課題が図に位置を持たない')
  const onAddFeedback = vi.fn()
  const onDetailChange = vi.fn()
  const onValueChange = vi.fn()
  render(
    <HypothesisPanel
      hypothesisKey={`row${index}`}
      label={`仮説${index + 1}`}
      panel={placement.expanded}
      origin={owner.rect}
      hypothesis={h}
      invalid={false}
      suppressed={opts.suppressed === true}
      onTitleChange={vi.fn()}
      onDetailChange={onDetailChange}
      onValueChange={onValueChange}
      onFeedbackTextChange={vi.fn()}
      onEventNoteChange={vi.fn()}
      onAddFeedback={onAddFeedback}
      // 判断のドロップダウンはエディタが組む（パネルは置き場所だけを持つ）。
      // **トリガーの文言はレイアウトが持つ定数**——測った幅と描く幅を同じ
      // 文字列から出すので、ここでも打ち直さない
      judgementMenu={
        <button type="button">
          {JUDGEMENT_TRIGGER_LABELS[h.events.length === 0 ? 'empty' : 'latest']}
        </button>
      }
    />,
  )
  return { onAddFeedback, onDetailChange, onValueChange }
}

/** DOM 順（＝描画順）で a が b より前にあるか */
function precedes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

describe('HypothesisPanel: 節の構成', () => {
  it('節が「ソリューション仮説」「価値仮説」「検証結果」「FB」の順に並ぶ', () => {
    renderPanel(0)
    const labels = [
      SECTION_LABELS.solution,
      SECTION_LABELS.value,
      SECTION_LABELS.judgement,
      SECTION_LABELS.notes,
    ].map((text) => screen.getByText(text))
    for (let i = 1; i < labels.length; i += 1) {
      expect(precedes(labels[i - 1], labels[i])).toBe(true)
    }
  })

  /**
   * **「以前の判断」はキャンバスに描かれていないが消さない**——追記専用の列
   *（覆される前の判断とその根拠）を読める唯一の場所である。判断が2件以上の
   * ときだけ出るので、同じテストで有り／無しの両方を見る
   */
  it('「以前の判断」の節は判断が2件以上のときだけ、検証結果とFBの間に出る', () => {
    renderPanel(0)
    const previous = screen.getByText(SECTION_LABELS.previous)
    expect(precedes(screen.getByText(SECTION_LABELS.judgement), previous)).toBe(true)
    expect(precedes(previous, screen.getByText(SECTION_LABELS.notes))).toBe(true)
    cleanup()
    renderPanel(1)
    expect(screen.queryByText(SECTION_LABELS.previous)).toBeNull()
  })
})

describe('HypothesisPanel: ソリューション仮説と価値仮説', () => {
  it('タイトル・詳細・価値仮説がそれぞれ欄になる', () => {
    const { onDetailChange, onValueChange } = renderPanel(0)
    // タイトルは閉じた行と同じ鍵（`hyp:`）を名乗る欄。名前は接頭のまま
    expect(screen.getByRole('textbox', { name: '仮説1' })).toBeInstanceOf(HTMLTextAreaElement)
    const detail = screen.getByRole('textbox', { name: '仮説1 の詳細' })
    const value = screen.getByRole('textbox', { name: '仮説1 の価値仮説' })
    expect((detail as HTMLTextAreaElement).value).toBe(DETAIL_SENTINEL)
    expect((value as HTMLTextAreaElement).value).toBe(VALUE_SENTINEL)
    fireEvent.change(detail, { target: { value: '書き換えた詳細' } })
    expect(onDetailChange).toHaveBeenCalledWith('書き換えた詳細')
    fireEvent.change(value, { target: { value: '書き換えた価値' } })
    expect(onValueChange).toHaveBeenCalledWith('書き換えた価値')
  })

  /**
   * **設計ノート D7 の規律。** `detail` / `value` は空でも問いを立てない
   *（スキーマにも「空でも warning にしない」と書いてある）。欠落の面
   *（`missing-face`）や欠落の枠が付き始めたら、空の仮説が図の大半で
   * 警告色になり、地の色が意味を失う
   */
  it('詳細と価値仮説が空でも問いは立たない（欠落の印を付けない）', () => {
    renderPanel(1)
    for (const name of ['仮説2 の詳細', '仮説2 の価値仮説']) {
      const field = screen.getByRole('textbox', { name })
      expect((field as HTMLTextAreaElement).value).toBe('')
      // 欄にも、欄を包む枠にも欠落・無効の面や線を付けない
      expect(/missing|invalid/.test(field.className)).toBe(false)
      expect(/missing|invalid/.test((field.parentElement as HTMLElement).className)).toBe(false)
    }
    // **欠落の語彙を使っている要素は「未決」のバッジだけ**（判断がまだ無い、は
    // 導出で立つ正当な問い）。空の欄のために増えた印があればここで増える
    expect(
      Array.from(document.querySelectorAll('[class*="missing"]')).map((e) => e.textContent),
    ).toEqual([BADGE_LABELS.open])
  })

  /**
   * **`layout.test.ts` の `SECTION_LABELS` の鍵の並びテストと対の番人**
   *（m4 から引き継ぎ、m5 Task 4 で行からパネルへ移した）。`Hypothesis` 型に
   * `rationale` が無いので型も番人ではあるが、**画面の側にも置いておく**
   *——v3 で廃止した欄が「詳細」や「価値仮説」の顔で復活するのを、
   * 節を増やすときに気づける場所はここしかない
   */
  it('展開しても「由来」の欄は無い（v3 で廃止）', () => {
    renderPanel(0)
    expect(screen.queryByRole('textbox', { name: /の由来$/ })).toBeNull()
    expect(screen.queryByText('由来')).toBeNull()
  })

  it('問い（asks）はまだ出さない（Task 5 が設計する）', () => {
    renderPanel(0)
    expect(screen.queryByText(ASK_SENTINEL)).toBeNull()
  })
})

describe('HypothesisPanel: 検証結果', () => {
  it('判断があれば種別のバッジと日付が見出しの行に出る', () => {
    renderPanel(0)
    const badge = screen.getByText(EVENT_KIND_LABELS.rejected)
    expect(badge.className).toBe(badgeClass(badgeVariantOf('no', false)))
    // 日付は `YYYY-MM-DD` をそのまま出さない（画面は月日だけ）
    expect(screen.getByText('8/13 更新')).toBeTruthy()
  })

  it('検証結果の日付は判断があるときだけ出る', () => {
    renderPanel(1)
    expect(screen.queryByText(/更新$/)).toBeNull()
    // 未決のバッジとプレースホルダは出る（判断を付ける動線を消さない）
    expect(screen.getByText(BADGE_LABELS.open).className).toBe(
      badgeClass(badgeVariantOf('open', false)),
    )
    expect(screen.getByText(NO_JUDGEMENT_TEXT)).toBeTruthy()
    expect(screen.getByRole('button', { name: JUDGEMENT_TRIGGER_LABELS.empty })).toBeTruthy()
  })

  /**
   * これが壊れると「追記専用」がデータの上（`setEventNote`）だけの約束になり、
   * 画面からは静かに破れる——過去の根拠が編集できると、
   * 「そのとき何を根拠に決めたか」が後から書き換わる
   */
  it('根拠を編集できるのは最新のイベントだけ', () => {
    renderPanel(0)
    expect(screen.getAllByRole('textbox', { name: /の根拠$/ })).toHaveLength(1)
    expect(
      screen.getByRole('textbox', { name: `仮説1 の${EVENT_KIND_LABELS.rejected}の根拠` }),
    ).toBeInstanceOf(HTMLTextAreaElement)
    // 「引けない」だけでは消えていても緑になる。読めることまで見る
    expect(screen.getByText('前回の実測値がそのまま使える')).toBeTruthy()
  })

  /**
   * 覆される前の判断が「いま決まっていること」に見えないのは薄い枠のおかげで、
   * それが崩れると履歴が現役の判断の顔をする（語では区別できない）
   */
  it('以前の判断は薄い面で出る', () => {
    renderPanel(0)
    expect(screen.getByText(EVENT_KIND_LABELS.supported).className).toBe(
      badgeClass(badgeVariantOf('yes', true)),
    )
  })
})

describe('HypothesisPanel: FB', () => {
  it('FB は1件ずつ欄になり、末尾に「＋ FB」がある', () => {
    const { onAddFeedback } = renderPanel(1)
    expect(screen.getByRole('textbox', { name: '仮説2 のFB1' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '仮説2 のFB2' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '仮説2 にFBを足す' }))
    expect(onAddFeedback).toHaveBeenCalled()
  })
})
