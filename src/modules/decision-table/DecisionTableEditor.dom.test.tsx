// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { Condition, DecisionTableSchemaVersion1, Outcome } from '@/types/decision-table'
import { checkDecisionTableConsistency } from './consistency'
import { DecisionTableEditor } from './DecisionTableEditor'
import { IMPOSSIBLE_LABEL } from './labels'
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

/**
 * 条件2本・結果1本で、結果が全行埋まっている。2本目を消すと4行が2行へまとまり、
 * 値が食い違うので確認が出る。確定後に残る行が1本あるので、行き先を見られる
 */
const twoFilledConditions = table({
  conditions: [
    condition({ id: 'cond_a', name: '条件A' }),
    condition({ id: 'cond_b', name: '条件B' }),
  ],
  outcomes: [outcome({ id: 'out_a', name: '結果A', choices: ['X', 'Y'] })],
  rows: [
    { values: ['はい', 'はい'], impossible: false, results: ['X'] },
    { values: ['はい', 'いいえ'], impossible: false, results: ['Y'] },
    { values: ['いいえ', 'はい'], impossible: false, results: ['X'] },
    { values: ['いいえ', 'いいえ'], impossible: false, results: ['Y'] },
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

  it('「値を追加」ボタンをクリックすると、増えた値の欄へフォーカスが移る', () => {
    renderEditor(oneCondition)
    fireEvent.click(screen.getByRole('button', { name: '値を追加（1行目）' }))
    expect(document.activeElement).toBe(screen.getByLabelText('値（1行目の3つ目）'))
  })

  it('「選択肢を追加」ボタンをクリックすると、増えた選択肢の欄へフォーカスが移る', () => {
    renderEditor(oneOutcome)
    fireEvent.click(screen.getByRole('button', { name: '選択肢を追加（1行目）' }))
    expect(document.activeElement).toBe(screen.getByLabelText('選択肢（1行目の3つ目）'))
  })

  it('値が1つしかない条件では「値を消す」ボタンが押せない', () => {
    renderEditor(singleValueCondition)
    const button = screen.getByRole('button', { name: '値を消す（1行目の1つ目）' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })
})

/** 値を3つ持つ条件。1つ目・真ん中・末尾で移動先が変わることを見分けるのに使う */
const threeValues = table({
  conditions: [condition({ id: 'cond_a', name: '条件A', values: ['A', 'B', 'C'] })],
  rows: [
    { values: ['A'], impossible: false, results: [] },
    { values: ['B'], impossible: false, results: [] },
    { values: ['C'], impossible: false, results: [] },
  ],
})

/** 選択肢を2つ持つ結果だけの表。結果の一覧は条件の本数と関係なく描けるので条件は0本でよい */
const oneOutcome = table({
  outcomes: [outcome({ id: 'out_a', name: '結果A', choices: ['X', 'Y'] })],
})

/** 選択肢を1つも持たない結果。`newOutcome()` の既定と同じ形で、`label:0` が存在しない */
const noChoiceOutcome = table({
  outcomes: [outcome({ id: 'out_a', name: '結果A' })],
})

/**
 * 直積がちょうど上限（1024）の表。これ以上値を足すと上限を超える。
 *
 * **条件10本×2値にする**——1本×1024値だと `DefinitionList` が1024個の
 * `CellInput` を描くことになり重い。10本に分ければラベルは20個で済む。
 * **`rows` は空でよい。** 上限の判定（`canAddValue`）は `conditions` の直積だけを
 * 見て、`rows` を読まない。`rows.length` が直積と一致することをアプリは不変条件に
 * していない——一致しない行は整合性検証が赤で示すだけで、画面はそのまま描く
 */
const atMaxRows = table({
  conditions: Array.from({ length: 10 }, (_, i) =>
    condition({ id: `cond_${i}`, name: `条件${i}`, values: ['a', 'b'] }),
  ),
})

/**
 * 直積が768（上限1024の下）で、条件ごとに値を足せるかが分かれる表。
 *
 * 値1本の条件Aは足すと2本になり直積が2倍（1536）になるので足せない。
 * 値3本の条件Bは足すと4本になるだけで直積は1024（上限ちょうど）に収まるので足せる。
 * **どの条件にも足せないわけではない**ので、上限の案内はまだ出ない
 */
const oneConditionAtLimit = table({
  conditions: [
    condition({ id: 'cond_a', name: '条件A', values: ['x'] }),
    condition({ id: 'cond_b', name: '条件B', values: ['p', 'q', 'r'] }),
    ...Array.from({ length: 8 }, (_, i) => condition({ id: `cond_f${i}`, name: `条件F${i}` })),
  ],
})

describe('DecisionTableEditor: 定義部のキー操作（木の家族）', () => {
  it('条件名セルで Tab を押すと、1つ目の値の欄へ移り、値は増えない', () => {
    const { onChange } = renderEditor(oneCondition)
    fireEvent.keyDown(screen.getByLabelText('条件名（1行目）'), { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByLabelText('値（1行目の1つ目）'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('値が1つしかない条件でも、名前セルの Tab はその値の欄へ移るだけで増えない', () => {
    const { onChange } = renderEditor(singleValueCondition)
    fireEvent.keyDown(screen.getByLabelText('条件名（1行目）'), { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByLabelText('値（1行目の1つ目）'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('途中の値の欄で Tab を押すと、次の値の欄へ移り、値は増えない', () => {
    const { onChange } = renderEditor(threeValues)
    fireEvent.keyDown(screen.getByLabelText('値（1行目の2つ目）'), { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByLabelText('値（1行目の3つ目）'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('末尾の値の欄で Tab を押すと、値が1つ増えてその欄へ移る', () => {
    const { latest } = renderEditor(oneCondition)
    fireEvent.keyDown(screen.getByLabelText('値（1行目の2つ目）'), { key: 'Tab' })
    expect(latest()?.conditions[0].values).toHaveLength(3)
    expect(document.activeElement).toBe(screen.getByLabelText('値（1行目の3つ目）'))
  })

  it('行数の上限に達していると、末尾の値の欄で Tab を押しても増えない', () => {
    const { onChange } = renderEditor(atMaxRows)
    fireEvent.keyDown(screen.getByLabelText('値（1行目の2つ目）'), { key: 'Tab' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('値の欄で空欄 Backspace を押すと、一つ手前の値の欄へフォーカスが移る', () => {
    renderEditor(threeValues)
    const cell = screen.getByLabelText('値（1行目の2つ目）')
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(document.activeElement).toBe(screen.getByLabelText('値（1行目の1つ目）'))
  })

  it('1つ目の値の欄で空欄 Backspace を押すと、名前セルへフォーカスが移る', () => {
    renderEditor(threeValues)
    const cell = screen.getByLabelText('値（1行目の1つ目）')
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(document.activeElement).toBe(screen.getByLabelText('条件名（1行目）'))
  })

  it('値の欄で ←（キャレット先頭）を押すと、その行の名前セルへ移る', () => {
    renderEditor(threeValues)
    const cell = screen.getByLabelText('値（1行目の2つ目）') as HTMLInputElement
    cell.focus()
    cell.setSelectionRange(0, 0)
    fireEvent.keyDown(cell, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(screen.getByLabelText('条件名（1行目）'))
  })

  it('名前セルで →（キャレット末尾）を押すと、1つ目の値の欄へ移る', () => {
    renderEditor(threeValues)
    const cell = screen.getByLabelText('条件名（1行目）') as HTMLInputElement
    cell.focus()
    cell.setSelectionRange(cell.value.length, cell.value.length)
    fireEvent.keyDown(cell, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByLabelText('値（1行目の1つ目）'))
  })

  it('結果名セルで Tab を押すと、1つ目の選択肢の欄へ移り、選択肢は増えない', () => {
    const { onChange } = renderEditor(oneOutcome)
    fireEvent.keyDown(screen.getByLabelText('結果名（1行目）'), { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByLabelText('選択肢（1行目の1つ目）'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('選択肢が0本の結果の名前セルで Tab を押すと、選択肢が1つ増えてその欄へ移る', () => {
    const { latest } = renderEditor(noChoiceOutcome)
    fireEvent.keyDown(screen.getByLabelText('結果名（1行目）'), { key: 'Tab' })
    expect(latest()?.outcomes[0].choices).toHaveLength(1)
    expect(document.activeElement).toBe(screen.getByLabelText('選択肢（1行目の1つ目）'))
  })

  it('選択肢の欄で Tab を押すと、次の選択肢の欄へ移り、選択肢は増えない', () => {
    const { onChange } = renderEditor(oneOutcome)
    fireEvent.keyDown(screen.getByLabelText('選択肢（1行目の1つ目）'), { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByLabelText('選択肢（1行目の2つ目）'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('末尾の選択肢の欄で Tab を押すと、選択肢が1つ増えてその欄へ移る', () => {
    const { latest } = renderEditor(oneOutcome)
    fireEvent.keyDown(screen.getByLabelText('選択肢（1行目の2つ目）'), { key: 'Tab' })
    expect(latest()?.outcomes[0].choices).toHaveLength(3)
    expect(document.activeElement).toBe(screen.getByLabelText('選択肢（1行目の3つ目）'))
  })

  it('値の ✕ ボタンが Tab の順に入っていない', () => {
    renderEditor(oneCondition)
    const button = screen.getByRole('button', { name: '値を消す（1行目の1つ目）' })
    expect((button as HTMLButtonElement).tabIndex).toBe(-1)
  })

  it('条件名セルで Enter を押すと、条件が1本増える（木にしても兄弟の追加は変わらない）', () => {
    const { latest } = renderEditor(oneCondition)
    fireEvent.keyDown(screen.getByLabelText('条件名（1行目）'), { key: 'Enter' })
    expect(latest()?.conditions).toHaveLength(2)
  })

  it('選択肢を1つも持たない結果の名前セルで →（キャレット末尾）を押しても落ちない', () => {
    renderEditor(noChoiceOutcome)
    const cell = screen.getByLabelText('結果名（1行目）') as HTMLInputElement
    cell.focus()
    cell.setSelectionRange(cell.value.length, cell.value.length)
    // label:0 が無いので focusCell は false を返し、既定に落ちる
    // （フォーカスはこの名前セルに留まる）
    expect(() => fireEvent.keyDown(cell, { key: 'ArrowRight' })).not.toThrow()
    expect(document.activeElement).toBe(cell)
  })
})

describe('DecisionTableEditor: 行数の上限の案内', () => {
  it('行数の上限に達していると、案内の一文が出る', () => {
    renderEditor(atMaxRows)
    expect(
      screen.getByText('行数の上限（1024行）に達しているので、値をこれ以上足せません。'),
    ).toBeDefined()
  })

  it('値を足せない条件が1本あっても、他の条件がまだ足せるなら案内は出ない', () => {
    renderEditor(oneConditionAtLimit)
    expect(
      screen.queryByText('行数の上限（1024行）に達しているので、値をこれ以上足せません。'),
    ).toBeNull()
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

  it('確定すると、0件になった一覧の追加ボタンへフォーカスが移る', () => {
    renderEditor(filledResults)
    const addButton = screen.getByRole('button', { name: '条件を追加' })
    const focusSpy = vi.spyOn(addButton, 'focus')
    fireEvent.click(screen.getByRole('button', { name: '条件を消す（1行目）' }))
    fireEvent.click(screen.getByRole('button', { name: '続ける' }))
    expect(focusSpy).toHaveBeenCalled()
  })

  it('ラベルを消す確認を確定すると、一つ手前の値の欄へフォーカスが移る', () => {
    const { latest } = renderEditor(filledResults)
    fireEvent.click(screen.getByRole('button', { name: '値を消す（1行目の2つ目）' }))
    fireEvent.click(screen.getByRole('button', { name: '続ける' }))
    expect(latest()?.conditions[0].values).toEqual(['はい'])
    expect(document.activeElement).toBe(screen.getByLabelText('値（1行目の1つ目）'))
  })

  it('先頭の値を消す確認を確定すると、名前セルへフォーカスが移る', () => {
    const { latest } = renderEditor(filledResults)
    fireEvent.click(screen.getByRole('button', { name: '値を消す（1行目の1つ目）' }))
    fireEvent.click(screen.getByRole('button', { name: '続ける' }))
    expect(latest()?.conditions[0].values).toEqual(['いいえ'])
    expect(document.activeElement).toBe(screen.getByLabelText('条件名（1行目）'))
  })

  it('確定すると、行が残っていれば繰り上がった行の名前セルへフォーカスが移る', () => {
    const { latest } = renderEditor(twoFilledConditions)
    fireEvent.click(screen.getByRole('button', { name: '条件を消す（2行目）' }))
    fireEvent.click(screen.getByRole('button', { name: '続ける' }))
    expect(latest()?.conditions).toHaveLength(1)
    expect(document.activeElement).toBe(screen.getByLabelText('条件名（1行目）'))
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

/** 条件2本（2値ずつ）・結果1本の表。4行（2×2）を描く土台にする */
const twoConditions = table({
  conditions: [condition({ id: 'cond_a', name: '天気' }), condition({ id: 'cond_b', name: '気温' })],
  outcomes: [outcome({ id: 'out_a', name: '結果A', choices: ['X', 'Y'] })],
  rows: [
    { values: ['はい', 'はい'], impossible: false, results: [''] },
    { values: ['はい', 'いいえ'], impossible: false, results: ['X'] },
    { values: ['いいえ', 'はい'], impossible: true, results: [''] },
    { values: ['いいえ', 'いいえ'], impossible: false, results: [''] },
  ],
})

/**
 * 条件1本・結果2本の表。起こりえない行でも結果セルの本数が変わらないことと、
 * 隣の結果列への移動を見る土台にする
 */
const twoOutcomes = table({
  conditions: [condition({ id: 'cond_a', name: '条件A' })],
  outcomes: [
    outcome({ id: 'out_a', name: '結果A', choices: ['X', 'Y'] }),
    outcome({ id: 'out_b', name: '結果B', choices: ['P', 'Q'] }),
  ],
  rows: [
    { values: ['はい'], impossible: true, results: ['', ''] },
    { values: ['いいえ'], impossible: false, results: ['', ''] },
  ],
})

/**
 * 表本体（`GridBody`）のデータ行。**見出し「表」の section に絞る**——条件・結果の
 * `DefinitionList` も同じ page に「No」列を持つ table を出すので、絞らずに
 * `getAllByRole('row')` を呼ぶと3つの table の行が混ざる
 */
function gridRows(): HTMLTableRowElement[] {
  const heading = screen.getByRole('heading', { name: '表' })
  const section = heading.closest('section')
  if (section === null) throw new Error('表本体の section が見つからない')
  return within(section).getAllByRole('row').slice(1) as HTMLTableRowElement[]
}

describe('DecisionTableEditor: 表本体', () => {
  it('条件2本・結果1本の表で、行が4本（#1〜#4）描かれる', () => {
    renderEditor(twoConditions)
    const rows = gridRows()
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => r.cells[0].textContent)).toEqual(['1', '2', '3', '4'])
  })

  it('条件セルが読み取り専用で、入力欄になっていない', () => {
    renderEditor(twoConditions)
    const cell = gridRows()[0].cells[1]
    expect(cell.tagName).toBe('TD')
    expect(cell.textContent).toBe('はい')
    expect(cell.querySelector('input, textarea, button, select')).toBeNull()
  })

  it('結果セルを選ぶと onChange が渡す rows[i].results[j] が変わる', () => {
    const { latest } = renderEditor(twoConditions)
    fireEvent.keyDown(screen.getByLabelText('結果A（1行目）'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Y' }))
    expect(latest()?.rows[0].results[0]).toBe('Y')
  })

  it('結果セルを開くと、選択肢に加えて「空にする」が並ぶ', () => {
    renderEditor(twoConditions)
    fireEvent.keyDown(screen.getByLabelText('結果A（2行目）'), { key: ' ' })
    expect(screen.getByRole('menuitemradio', { name: 'X' })).toBeDefined()
    expect(screen.getByRole('menuitemradio', { name: 'Y' })).toBeDefined()
    expect(screen.getByRole('menuitemradio', { name: '空にする' })).toBeDefined()
  })

  it('結果セルで主修飾キー＋Enter を押すと impossible が真になり、セルの文字が「起こりえない」になる', () => {
    const { latest } = renderEditor(twoConditions)
    fireEvent.keyDown(screen.getByLabelText('結果A（2行目）'), { key: 'Enter', ctrlKey: true })
    expect(latest()?.rows[1].impossible).toBe(true)
    const cell = screen.getByLabelText(`結果A（2行目）: ${IMPOSSIBLE_LABEL}`)
    expect(cell.textContent).toBe(IMPOSSIBLE_LABEL)
  })

  it('起こりえない行のセルを押すと impossible が偽に戻る', () => {
    const { latest } = renderEditor(twoConditions)
    fireEvent.click(screen.getByLabelText(`結果A（3行目）: ${IMPOSSIBLE_LABEL}`))
    expect(latest()?.rows[2].impossible).toBe(false)
  })

  it('起こりえない行の結果セルの本数が、普通の行と同じである', () => {
    renderEditor(twoOutcomes)
    const rows = gridRows()
    // No・条件A・結果A・結果B・起こりえないボタンの5セル。起こりえない行（1行目）も同じ本数
    expect(rows[0].cells).toHaveLength(5)
    expect(rows[1].cells).toHaveLength(5)
  })

  it('条件と結果の境界が強い罫線である（結果どうしの境界は弱いまま）', () => {
    renderEditor(twoOutcomes)
    const rows = gridRows()
    const cells = within(rows[1]).getAllByRole('cell')
    // No・条件A・結果A・結果B の順。結果A が条件との境界、結果B が結果どうしの境界
    expect(cells[2]?.className).toContain('border-l-rule')
    expect(cells[2]?.className).not.toContain('border-l-rule-muted')
    expect(cells[3]?.className).toContain('border-l-rule-muted')
  })

  it('結果セルで ↓ を押すと下の行の同じ列へフォーカスが移り、値は変わらない', () => {
    const { latest } = renderEditor(twoConditions)
    const first = screen.getByLabelText('結果A（1行目）')
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByLabelText('結果A（2行目）'))
    // 値が書き換わっていれば onChange が呼ばれる。カーソル移動だけなら呼ばれない
    expect(latest()).toBeUndefined()
  })

  it('結果セルで ↑ を押すと上の行の同じ列へフォーカスが移り、値は変わらない', () => {
    const { latest } = renderEditor(twoConditions)
    const second = screen.getByLabelText('結果A（2行目）')
    second.focus()
    fireEvent.keyDown(second, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(screen.getByLabelText('結果A（1行目）'))
    expect(latest()).toBeUndefined()
  })

  it('結果セルで Enter を押すとメニューが開き、行は移らない（値の変更は開いたときだけ）', () => {
    renderEditor(twoConditions)
    const first = screen.getByLabelText('結果A（1行目）')
    first.focus()
    fireEvent.keyDown(first, { key: 'Enter' })
    expect(screen.getByRole('menuitemradio', { name: 'X' })).toBeDefined()
    expect(screen.getByRole('menuitemradio', { name: 'Y' })).toBeDefined()
    // 行が移っていれば下の行の結果セルへフォーカスが移る
    // （メニューが開いている間は Radix が背景を aria-hidden にするので
    // gridRows() の getByRole は使わず、labelText で直接引く）
    expect(document.activeElement).not.toBe(screen.getByLabelText('結果A（2行目）'))
  })

  it('結果セルで → を押すと隣の結果列へフォーカスが移る', () => {
    renderEditor(twoOutcomes)
    const first = screen.getByLabelText('結果A（2行目）')
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByLabelText('結果B（2行目）'))
  })

  it('空の結果セルに欠落の面が付き、起こりえない行のセルには付かない', () => {
    renderEditor(twoOutcomes)
    const rows = gridRows()
    const impossibleRowCells = within(rows[0]).getAllByRole('cell')
    const normalRowCells = within(rows[1]).getAllByRole('cell')
    // No・条件A・結果A・結果B の順。結果A は添字2
    expect(normalRowCells[2]?.className).toContain('bg-missing-face')
    expect(impossibleRowCells[2]?.className).not.toContain('bg-missing-face')
  })

  it('条件が0本のとき、表本体の代わりに案内の一文が出る', () => {
    renderEditor(table({}))
    expect(
      screen.getByText('条件を1つ以上足すと、値の組み合わせの行が出ます。'),
    ).toBeDefined()
    // DefinitionList（条件・結果）の2本だけで、表本体の3本目は出ない
    expect(screen.getAllByRole('table')).toHaveLength(2)
  })
})

describe('DecisionTableEditor: 起こりえないの表右端ボタン', () => {
  it('各行に起こりえないのボタンが1つ出る', () => {
    renderEditor(twoConditions)
    const rows = gridRows()
    rows.forEach((row, i) => {
      expect(
        within(row).getByRole('button', { name: `#${i + 1} を${IMPOSSIBLE_LABEL}にする` }),
      ).toBeDefined()
    })
  })

  it('起こりえないのボタンにフォーカスすると、その行のセルに面が付く', () => {
    renderEditor(twoConditions)
    const rows = gridRows()
    expect(rows[1].cells[0].className).not.toContain('bg-surface-muted')
    fireEvent.focus(screen.getByRole('button', { name: `#2 を${IMPOSSIBLE_LABEL}にする` }))
    expect(rows[1].cells[0].className).toContain('bg-surface-muted')
  })

  it('ボタンを押すと impossible が真になり、aria-pressed が真になる', () => {
    const { latest } = renderEditor(twoConditions)
    const button = screen.getByRole('button', { name: `#1 を${IMPOSSIBLE_LABEL}にする` })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)
    expect(latest()?.rows[0].impossible).toBe(true)
    expect(
      screen.getByRole('button', { name: `#1 を${IMPOSSIBLE_LABEL}にする` }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('もう一度押すと impossible が偽に戻る', () => {
    const { latest } = renderEditor(twoConditions)
    const button = screen.getByRole('button', { name: `#1 を${IMPOSSIBLE_LABEL}にする` })
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: `#1 を${IMPOSSIBLE_LABEL}にする` }))
    expect(latest()?.rows[0].impossible).toBe(false)
  })

  it('結果が0本の表でもボタンが出て、押すと impossible が入る', () => {
    const { latest } = renderEditor(oneCondition)
    const button = screen.getByRole('button', { name: `#1 を${IMPOSSIBLE_LABEL}にする` })
    fireEvent.click(button)
    expect(latest()?.rows[0].impossible).toBe(true)
  })

  it('結果が0本の表で No セルをクリックすると、起こりえないボタンへフォーカスが移る', () => {
    renderEditor(oneCondition)
    const rows = gridRows()
    fireEvent.click(rows[0].cells[0])
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: `#1 を${IMPOSSIBLE_LABEL}にする` }),
    )
  })

  it('結果が0本の表で条件セルをクリックしても、同じことが起きる', () => {
    renderEditor(oneCondition)
    const rows = gridRows()
    // No・条件A の順。条件A は添字1
    fireEvent.click(rows[0].cells[1])
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: `#1 を${IMPOSSIBLE_LABEL}にする` }),
    )
  })

  it('主修飾キー＋Enter の入口も引き続き効く', () => {
    const { latest } = renderEditor(twoConditions)
    fireEvent.keyDown(screen.getByLabelText('結果A（2行目）'), { key: 'Enter', ctrlKey: true })
    expect(latest()?.rows[1].impossible).toBe(true)
    const cell = screen.getByLabelText(`結果A（2行目）: ${IMPOSSIBLE_LABEL}`)
    expect(cell.textContent).toBe(IMPOSSIBLE_LABEL)
  })
})

/**
 * 条件1本・結果2本で、1行目だけ結果Aが記入済み・結果Bが未記入の表。
 * 記入済みの結果セルへフォーカスしても、未記入の結果セルの欠落の面が
 * 行の面に塗り潰されないことを見る土台にする
 */
const mixedResults = table({
  conditions: [condition({ id: 'cond_a', name: '条件A' })],
  outcomes: [
    outcome({ id: 'out_a', name: '結果A', choices: ['X', 'Y'] }),
    outcome({ id: 'out_b', name: '結果B', choices: ['P', 'Q'] }),
  ],
  rows: [
    { values: ['はい'], impossible: false, results: ['X', ''] },
    { values: ['いいえ'], impossible: false, results: ['X', ''] },
  ],
})

describe('DecisionTableEditor: 表本体のフォーカスと面', () => {
  it('表本体のヒントに Enter を「下の行へ」と説明する文字が出ない', () => {
    renderEditor(twoConditions)
    expect(screen.queryByText(/下の行へ/)).toBeNull()
  })

  it('結果セルにフォーカスすると、その行のセルに面が付く', () => {
    renderEditor(twoConditions)
    const rows = gridRows()
    // フォーカス前は No セルに面が付いていない
    expect(rows[1].cells[0].className).not.toContain('bg-surface-muted')
    fireEvent.focus(screen.getByLabelText('結果A（2行目）'))
    expect(rows[1].cells[0].className).toContain('bg-surface-muted')
  })

  it('別の行のセルへ移ると、面も移る', () => {
    renderEditor(twoConditions)
    const rows = gridRows()
    const first = screen.getByLabelText('結果A（2行目）')
    const second = screen.getByLabelText('結果A（4行目）')
    fireEvent.focus(first)
    expect(rows[1].cells[0].className).toContain('bg-surface-muted')
    // 表の中で別のセルへ移る blur。relatedTarget が表の中にあるので、
    // まだ次のセルの focus が届いていないこの時点でも面は消えない
    fireEvent.blur(first, { relatedTarget: second })
    expect(rows[1].cells[0].className).toContain('bg-surface-muted')
    fireEvent.focus(second)
    expect(rows[1].cells[0].className).not.toContain('bg-surface-muted')
    expect(rows[3].cells[0].className).toContain('bg-surface-muted')
  })

  it('表の外へフォーカスが出ると、面が消える', () => {
    renderEditor(twoConditions)
    const rows = gridRows()
    const cell = screen.getByLabelText('結果A（2行目）')
    fireEvent.focus(cell)
    expect(rows[1].cells[0].className).toContain('bg-surface-muted')
    const outside = screen.getByRole('button', { name: '条件を追加' })
    fireEvent.blur(cell, { relatedTarget: outside })
    expect(rows[1].cells[0].className).not.toContain('bg-surface-muted')
  })

  it('条件セルをクリックすると、その行の結果セルへフォーカスが移る', () => {
    renderEditor(twoConditions)
    const rows = gridRows()
    // No・条件A・条件B・結果A の順。条件A は添字1
    fireEvent.click(rows[1].cells[1])
    expect(document.activeElement).toBe(screen.getByLabelText('結果A（2行目）'))
  })

  it('No セルをクリックしても同じことが起きる', () => {
    renderEditor(twoConditions)
    const rows = gridRows()
    fireEvent.click(rows[1].cells[0])
    expect(document.activeElement).toBe(screen.getByLabelText('結果A（2行目）'))
  })

  it('条件セルをクリックしても、条件セルは入力欄にならない', () => {
    renderEditor(twoConditions)
    const rows = gridRows()
    const cell = rows[1].cells[1]
    fireEvent.click(cell)
    expect(cell.tagName).toBe('TD')
    expect(cell.querySelector('input, textarea, button, select')).toBeNull()
    expect(document.activeElement).not.toBe(cell)
  })

  it('空の結果セルでは、欠落の面が行の面より強い（行にフォーカスがあっても黄のまま）', () => {
    renderEditor(mixedResults)
    const emptyCell = screen.getByLabelText('結果B（1行目）').closest('td')
    expect(emptyCell?.className).toContain('bg-missing-face')
    fireEvent.focus(screen.getByLabelText('結果A（1行目）'))
    expect(emptyCell?.className).toContain('bg-missing-face')
    expect(emptyCell?.className).not.toContain('bg-surface-muted')
  })

  it('メニューを閉じたあとは、面がフォーカスの行に従う', () => {
    renderEditor(twoConditions)
    const rows = gridRows()
    fireEvent.keyDown(screen.getByLabelText('結果A（2行目）'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'X' }))
    // 閉じたときに menuRow を null へ戻さないと、開いた行の面が張り付いたままになり、
    // 別の行へ移っても2行に面が付く
    fireEvent.focus(screen.getByLabelText('結果A（4行目）'))
    expect(rows[3].cells[0].className).toContain('bg-surface-muted')
    expect(rows[1].cells[0].className).not.toContain('bg-surface-muted')
  })
})

describe('整合性の赤', () => {
  /** 指摘を実物から作って渡す。Harness は issues を空で渡すので、ここは直接描く */
  function renderWithIssues(data: DecisionTableSchemaVersion1) {
    render(
      <DecisionTableEditor
        data={data}
        issues={checkDecisionTableConsistency(data)}
        modalOpen={false}
        onChange={() => {}}
      />,
    )
  }

  it('値ラベルが重なるとラベル列のセルに無効の面が付く', () => {
    renderWithIssues(
      table({
        conditions: [condition({ id: 'cond_Aaaaaaaaa1', name: '会員か', values: ['はい', 'はい'] })],
        outcomes: [],
        rows: [
          { values: ['はい'], impossible: false, results: [] },
          { values: ['はい'], impossible: false, results: [] },
        ],
      }),
    )
    // 条件の一覧は1本目の表。No・条件名・値・削除の順で、値は添字2
    const cells = within(within(screen.getAllByRole('table')[0]).getAllByRole('row')[1]).getAllByRole('cell')
    expect(cells[2]?.className).toContain('bg-invalid-face')
  })

  it('選択肢ラベルが重なると選択肢列のセルに無効の面が付く', () => {
    renderWithIssues(
      table({
        conditions: [],
        outcomes: [outcome({ id: 'out_Aaaaaaaaa1', name: '送料', choices: ['無料', '無料'] })],
        rows: [],
      }),
    )
    // 結果の一覧は2本目の表
    const cells = within(within(screen.getAllByRole('table')[1]).getAllByRole('row')[1]).getAllByRole('cell')
    expect(cells[2]?.className).toContain('bg-invalid-face')
  })
})
