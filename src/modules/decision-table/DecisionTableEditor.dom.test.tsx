// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Condition, DecisionTableSchemaVersion1, Outcome } from '@/types/decision-table'
import { DecisionTableEditor } from './DecisionTableEditor'
import { tallyMissing } from './missing'

afterEach(cleanup)

function condition(over: Partial<Condition> & { id: string }): Condition {
  return { name: '', values: ['はい', 'いいえ'], ...over }
}

function outcome(over: Partial<Outcome> & { id: string }): Outcome {
  return { name: '', choices: [], ...over }
}

function table(over: Partial<DecisionTableSchemaVersion1>): DecisionTableSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'decisionTable',
    title: 'テスト表',
    conditions: [],
    outcomes: [],
    rows: [],
    ...over,
  }
}

/** 額縁の代わり。onChange を受けて data を差し替える最小の親 */
function Harness(props: {
  initial: DecisionTableSchemaVersion1
  onChange: (next: DecisionTableSchemaVersion1, mergeKey?: string | null) => void
  modalOpen?: boolean
}) {
  const [data, setData] = useState(props.initial)
  return (
    <DecisionTableEditor
      data={data}
      issues={[]}
      modalOpen={props.modalOpen ?? false}
      onChange={(next, mergeKey) => {
        setData(next)
        props.onChange(next, mergeKey)
      }}
    />
  )
}

function renderEditor(initial: DecisionTableSchemaVersion1, modalOpen = false) {
  const onChange = vi.fn()
  render(<Harness initial={initial} onChange={onChange} modalOpen={modalOpen} />)
  const latest = () => onChange.mock.calls.at(-1)?.[0] as DecisionTableSchemaVersion1 | undefined
  return { onChange, latest }
}

/** 条件1本（値2つ）だけの表。値・名前の編集や行の増減を見る土台にする */
const oneCondition = table({
  conditions: [condition({ id: 'cond_a', name: '条件A' })],
  rows: [
    { values: ['はい'], impossible: false, results: [] },
    { values: ['いいえ'], impossible: false, results: [] },
  ],
})

/** 値が1本しかない条件。「値を消す」ボタンが押せないことを見る */
const singleValueCondition = table({
  conditions: [condition({ id: 'cond_a', name: '条件A', values: ['はい'] })],
  rows: [{ values: ['はい'], impossible: false, results: [] }],
})

/** 条件1本・結果1本で、両方の行に結果が記入済みの表。条件を消すと記入済みの結果が失われる */
const filledResults = table({
  conditions: [condition({ id: 'cond_a', name: '条件A' })],
  outcomes: [outcome({ id: 'out_a', name: '結果A', choices: ['X', 'Y'] })],
  rows: [
    { values: ['はい'], impossible: false, results: ['X'] },
    { values: ['いいえ'], impossible: false, results: ['Y'] },
  ],
})

/** 条件1本・結果1本だが、結果セルはどちらも未記入。条件を消しても失うものが無い */
const emptyResults = table({
  conditions: [condition({ id: 'cond_a', name: '条件A' })],
  outcomes: [outcome({ id: 'out_a', name: '結果A', choices: ['X', 'Y'] })],
  rows: [
    { values: ['はい'], impossible: false, results: [''] },
    { values: ['いいえ'], impossible: false, results: [''] },
  ],
})

describe('DecisionTableEditor: 条件の追加・削除', () => {
  it('空の表で「条件を追加」を押すと条件が1本増える', () => {
    const { latest } = renderEditor(table({}))
    fireEvent.click(screen.getByRole('button', { name: '条件を追加' }))
    expect(latest()?.conditions).toHaveLength(1)
  })

  it('条件名セルの Enter で条件が1本増える', () => {
    const { latest } = renderEditor(oneCondition)
    fireEvent.keyDown(screen.getByLabelText('条件名（1行目）'), { key: 'Enter' })
    expect(latest()?.conditions).toHaveLength(2)
  })

  it('空の条件名セルの Backspace で条件が消える', () => {
    const { latest } = renderEditor(oneCondition)
    const cell = screen.getByLabelText('条件名（1行目）')
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(latest()?.conditions).toHaveLength(0)
  })
})

describe('DecisionTableEditor: 値の追加・削除', () => {
  it('「値を追加」を押すとその条件の値が1つ増える', () => {
    const { latest } = renderEditor(oneCondition)
    fireEvent.click(screen.getByRole('button', { name: '値を追加（1行目）' }))
    expect(latest()?.conditions[0].values).toHaveLength(3)
  })

  it('値が1つしかない条件では「値を消す」ボタンが押せない', () => {
    renderEditor(singleValueCondition)
    const button = screen.getByRole('button', { name: '値を消す（1行目の1つ目）' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('DecisionTableEditor: 名前とラベルの編集', () => {
  it('条件名の変更は rows を変えない', () => {
    const { onChange, latest } = renderEditor(oneCondition)
    fireEvent.change(screen.getByLabelText('条件名（1行目）'), { target: { value: '天気' } })
    expect(onChange).toHaveBeenCalled()
    expect(latest()?.rows).toEqual(oneCondition.rows)
  })

  it('値のラベルを変更すると全行の対応する列が書き変わる', () => {
    const { latest } = renderEditor(oneCondition)
    fireEvent.change(screen.getByLabelText('値（1行目の1つ目）'), { target: { value: '晴れ' } })
    expect(latest()?.rows.map((r) => r.values[0])).toEqual(['晴れ', 'いいえ'])
  })
})

describe('DecisionTableEditor: 要素を減らす操作の確認ダイアログ', () => {
  it('記入済みの結果がある表で条件を1本消すと確認ダイアログが出る', () => {
    const { onChange } = renderEditor(filledResults)
    fireEvent.click(screen.getByRole('button', { name: '条件を消す（1行目）' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('記入済みの結果が失われます')).toBeDefined()
  })

  it('確認ダイアログの「続ける」で確定し、「キャンセル」では確定しない', () => {
    const { onChange, latest } = renderEditor(filledResults)
    fireEvent.click(screen.getByRole('button', { name: '条件を消す（1行目）' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '条件を消す（1行目）' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '条件を消す（1行目）' }))
    fireEvent.click(screen.getByRole('button', { name: '続ける' }))
    expect(onChange).toHaveBeenCalled()
    expect(latest()?.conditions).toHaveLength(0)
  })

  it('記入済みの結果が無い表で条件を消しても確認ダイアログは出ず、即座に反映される', () => {
    const { onChange, latest } = renderEditor(emptyResults)
    fireEvent.click(screen.getByRole('button', { name: '条件を消す（1行目）' }))
    expect(onChange).toHaveBeenCalled()
    expect(latest()?.conditions).toHaveLength(0)
    expect(screen.queryByText('記入済みの結果が失われます')).toBeNull()
  })

  it('確認ダイアログが開いている間、フォーカスは背景の表へ移らない', () => {
    renderEditor(filledResults)
    // 保留せず適用していたら、条件が0本になった経路で「条件を追加」ボタンへ
    // フォーカスの予約が積まれる（useListRows の 0件用フォールバック）。
    // Radix のフォーカストラップが背景への漏れを引き戻しうるので、
    // document.activeElement ではなく focus() の呼び出し自体を見張る
    const addButton = screen.getByRole('button', { name: '条件を追加' })
    const focusSpy = vi.spyOn(addButton, 'focus')
    fireEvent.click(screen.getByRole('button', { name: '条件を消す（1行目）' }))
    expect(screen.getByText('記入済みの結果が失われます')).toBeDefined()
    expect(focusSpy).not.toHaveBeenCalled()
  })
})

describe('DecisionTableEditor: 欠落の帯', () => {
  it('帯の要対応件数と内訳が tallyMissing と一致する', () => {
    // 条件名が空欄（名前なし）、結果が1件未記入（未記入）
    const withMissing = table({
      conditions: [condition({ id: 'cond_a', name: '' })],
      outcomes: [outcome({ id: 'out_a', name: '結果A', choices: ['X', 'Y'] })],
      rows: [
        { values: ['はい'], impossible: false, results: ['X'] },
        { values: ['いいえ'], impossible: false, results: [''] },
      ],
    })
    const tally = tallyMissing(withMissing)
    renderEditor(withMissing)
    expect(screen.getByText(`要対応 ${tally.total}`)).toBeDefined()
    for (const part of tally.parts) {
      expect(screen.getByText(`${part.label} ${part.count}`)).toBeDefined()
    }
  })
})
