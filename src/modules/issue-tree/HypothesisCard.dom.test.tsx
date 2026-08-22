// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createEstimateMeasurer } from '@/core/canvas/wrap'
import type { IssueTreeSchemaVersion2 } from '@/types/issue-tree'
import { EVENT_KIND_LABELS, poseQuestions, QUESTION_LABELS } from './derive'
import { HypothesisCard } from './HypothesisCard'
import { layoutIssueTree } from './layout'

afterEach(cleanup)

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

/** 測定は決定的な概算器で行う（jsdom はレイアウトを持たない） */
const fonts = {
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
const layout = layoutIssueTree(data, posed, fonts)

function renderCard(index: number) {
  const placement = layout.hypotheses[index]
  if (placement === null) throw new Error(`仮説${index + 1}が図に位置を持たない`)
  const h = data.hypotheses[index]
  const onPromoteNote = vi.fn()
  render(
    <HypothesisCard
      hypothesisKey={`row${index}`}
      label={`仮説${index + 1}`}
      placement={placement}
      text={h.text}
      rationale={h.rationale}
      notes={h.pendingNotes}
      events={h.events}
      questions={posed.hypothesisQuestions[index]}
      invalid={false}
      suppressed={false}
      onTextChange={vi.fn()}
      onRationaleChange={vi.fn()}
      onNoteChange={vi.fn()}
      onEventNoteChange={vi.fn()}
      onPromoteNote={onPromoteNote}
      // 判断のドロップダウンはエディタが組む（ここは置き場所だけを持つ）。
      // 必須プロパティなので、部品単体のテストでは空を渡す
      judgementMenu={null}
    />,
  )
  return { onPromoteNote }
}

describe('HypothesisCard: 追記専用の列', () => {
  /**
   * これが壊れると「追記専用」がデータの上（`setEventNote`）だけの約束になり、
   * 画面からは静かに破れる——過去の根拠が編集できると、
   * 「そのとき何を根拠に決めたか」が後から書き換わる
   */
  it('過去のイベントの根拠は編集できない（最新だけが textbox）', () => {
    renderCard(0)
    const past = `仮説1 の${EVENT_KIND_LABELS.supportedWithoutTest}の根拠`
    const latest = `仮説1 の${EVENT_KIND_LABELS.rejected}の根拠`
    expect(screen.queryByRole('textbox', { name: past })).toBeNull()
    expect(screen.getByRole('textbox', { name: latest })).toBeInstanceOf(HTMLTextAreaElement)
    // 「引けない」だけでは消えていても緑になる。読めることまで見る
    expect(screen.getByText('前回の実測値がそのまま使える')).toBeTruthy()
  })
})

describe('HypothesisCard: メモの「根拠へ」', () => {
  it('イベントが0件の仮説では出さない（押しても何も起きないボタンを作らない）', () => {
    renderCard(1)
    // メモ自体は2件とも出ている（ボタンだけが無い）
    expect(screen.getByRole('textbox', { name: '仮説2 のメモ1' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '仮説2 のメモ2' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '仮説2 のメモ1 を根拠へ移す' })).toBeNull()
    expect(screen.queryByRole('button', { name: '仮説2 のメモ2 を根拠へ移す' })).toBeNull()
  })

  it('イベントがある仮説では出て、押すと移動を呼ぶ', () => {
    const { onPromoteNote } = renderCard(2)
    fireEvent.click(screen.getByRole('button', { name: '仮説3 のメモ1 を根拠へ移す' }))
    expect(onPromoteNote).toHaveBeenCalledWith(0)
  })
})

describe('HypothesisCard: 未決のバッジ', () => {
  /**
   * 文言を直書きすると、アプリの画面と Skill の報告（`derive.ts` を
   * バイト一致でコピーする）が食い違う。**期待値は import で作る**
   */
  it('立っている問いを derive.ts の文言のまま並べる', () => {
    renderCard(1)
    expect(
      screen.getByText(`${QUESTION_LABELS.result}・${QUESTION_LABELS.judgement}`),
    ).toBeTruthy()
  })

  it('問いが立っていない仮説にはバッジを出さない', () => {
    renderCard(0)
    expect(screen.queryByText(QUESTION_LABELS.result)).toBeNull()
    expect(screen.queryByText(QUESTION_LABELS.judgement)).toBeNull()
  })
})
