// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { EditorProps } from '@/core/registry'
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
  onToast?: (message: string) => void
  onVisibleIds?: EditorProps<DecisionTableSchemaVersion1>['onVisibleIds']
}) {
  const [data, setData] = useState(props.initial)
  return (
    <DecisionTableEditor
      data={data}
      issues={[]}
      modalOpen={props.modalOpen ?? false}
      onToast={props.onToast}
      onVisibleIds={props.onVisibleIds}
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

  it('定義部のヒントが Tab の振る舞いを「値へ移動・末尾で追加」と説明する', () => {
    renderEditor(oneCondition)
    expect(screen.getByText(/値へ移動・末尾で追加/)).toBeDefined()
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

  it('条件セルの境界が弱い罫線である', () => {
    renderEditor(twoConditions)
    const rows = gridRows()
    const cells = within(rows[0]).getAllByRole('cell')
    // No・条件A・条件B・結果A の順。条件A・条件B（添字1・2）が条件セル
    expect(cells[1]?.className).toContain('border-l-rule-muted')
    expect(cells[2]?.className).toContain('border-l-rule-muted')
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

  it('読み取り専用の列（No・条件）の面が、行の面と別の弱い面である', () => {
    renderEditor(twoConditions)
    const rows = gridRows()
    // フォーカスも開いたメニューも無い状態
    for (const cell of [rows[0].cells[0], rows[0].cells[1]]) {
      expect(cell.className).toContain('bg-surface-subtle')
      // 行の面と同じ面を敷くと、選択中の行がこれらの列の上で見分けられなくなる
      expect(cell.className).not.toContain('bg-surface-muted')
    }
    // 結果セルは地のまま
    expect(screen.getByLabelText('結果A（1行目）').closest('td')?.className).not.toContain(
      'bg-surface-subtle',
    )
  })

  it('フォーカスのある行では、読み取り専用の列も行の面で塗られる', () => {
    renderEditor(twoConditions)
    const rows = gridRows()
    fireEvent.focus(screen.getByLabelText('結果A（2行目）'))
    // 行の面が読み取り専用の列の面より強い。弱いほうが勝つと行の帯が途切れる
    for (const cell of [rows[1].cells[0], rows[1].cells[1]]) {
      expect(cell.className).toContain('bg-surface-muted')
      expect(cell.className).not.toContain('bg-surface-subtle')
    }
  })

  it('1つのセルに面のクラスを2つ載せない', () => {
    renderEditor(twoOutcomes)
    // 2つ載せると、どちらが出るかはクラスを書いた順ではなく生成 CSS の並び順で決まる。
    // 起こりえないと行の面が重なるこのセルが、いちばん踏みやすい
    const button = screen.getByLabelText(`結果A（1行目）: ${IMPOSSIBLE_LABEL}`)
    fireEvent.focus(button)
    const faces = button.closest('td')?.className.split(' ').filter((c) => c.startsWith('bg-'))
    expect(faces).toHaveLength(1)
  })

  it('起こりえない行の結果セルが、沈んだ面と非アクティブの文字になる', () => {
    renderEditor(twoOutcomes)
    const button = screen.getByLabelText(`結果A（1行目）: ${IMPOSSIBLE_LABEL}`)
    expect(button.closest('td')?.className).toContain('bg-surface-muted')
    expect(button.className).toContain('text-ink-faint')
    // フォーカスの無い普通の行は地のまま
    expect(screen.getByLabelText('結果A（2行目）').closest('td')?.className).not.toContain(
      'bg-surface-muted',
    )
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

describe('DecisionTableEditor: セルのフォーカス枠', () => {
  it('条件の定義欄では入力欄ではなくセルが描く', () => {
    // 入力欄はセルより小さいので、入力欄が枠を描くとセルの中に箱が浮く
    renderEditor(oneCondition)
    const cell = screen.getByLabelText('条件名（1行目）')
    expect(cell.className).not.toMatch(/ring/)
    expect(cell.closest('td')?.className).toContain('focus-within:ring-2')
  })

  it('値の欄では欄を囲む span が描く', () => {
    // 1つのセルに値が複数並ぶので、セルが描くとどの値にいるか分からない
    renderEditor(oneCondition)
    const cell = screen.getByLabelText('値（1行目の1つ目）')
    expect(cell.className).not.toMatch(/ring/)
    expect(cell.closest('td')?.className).not.toContain('focus-within:ring-2')
    expect(cell.parentElement?.className).toContain('focus-within:ring-2')
  })

  it('結果セルでは入力欄ではなくセルが描く', () => {
    // 未記入の結果セルは中身の高さが 0 なので、トリガーが枠を描くと細い線に潰れる
    renderEditor(emptyResults)
    const cell = screen.getByLabelText('結果A（1行目）')
    expect(cell.className).not.toMatch(/ring/)
    expect(cell.closest('td')?.className).toContain('focus-within:ring-2')
  })
})

describe('DecisionTableEditor: セルの当たり判定', () => {
  it('条件の定義欄では余白を押しても欄へフォーカスが移る', () => {
    renderEditor(oneCondition)
    const cell = screen.getByLabelText('条件名（1行目）')
    const td = cell.closest('td')
    if (td === null) throw new Error('セルが見つからない')
    fireEvent.mouseDown(td)
    expect(document.activeElement).toBe(cell)
  })

  it('結果セルでは余白を押してもトリガーへフォーカスが移る', () => {
    renderEditor(emptyResults)
    const cell = screen.getByLabelText('結果A（1行目）')
    const td = cell.closest('td')
    if (td === null) throw new Error('セルが見つからない')
    fireEvent.mouseDown(td)
    expect(document.activeElement).toBe(cell)
  })
})

describe('DecisionTableEditor: 選択肢セルの高さ', () => {
  it('結果のトリガーはセルの高さいっぱいに広がる', () => {
    renderEditor(emptyResults)
    expect(screen.getByLabelText('結果A（1行目）').className).toContain('h-full')
  })

  it('起こりえないのセルのボタンもセルの高さいっぱいに広がる', () => {
    const withImpossible = table({
      conditions: [condition({ id: 'cond_a', name: '条件A' })],
      outcomes: [outcome({ id: 'out_a', name: '結果A', choices: ['X', 'Y'] })],
      rows: [{ values: ['はい'], impossible: true, results: [''] }],
    })
    renderEditor(withImpossible)
    const cell = screen.getByLabelText(`結果A（1行目）: ${IMPOSSIBLE_LABEL}`)
    expect(cell.className).toContain('h-full')
  })
})

describe('DecisionTableEditor: 選択肢セルの <td>', () => {
  it('結果セルは高さを指定する（指定しないと中の h-full が解決しない）', () => {
    renderEditor(emptyResults)
    const td = screen.getByLabelText('結果A（1行目）').closest('td')
    expect(td?.className).toContain('h-px')
  })
})

/** 条件2本・結果1本。絞り込みの組み合わせを見るための土台 */
const filterable = table({
  conditions: [
    condition({ id: 'cond_a', name: '会員か' }),
    condition({ id: 'cond_b', name: '5000円以上か' }),
  ],
  outcomes: [outcome({ id: 'out_a', name: '送料', choices: ['無料', '500円'] })],
  rows: [
    { values: ['はい', 'はい'], impossible: false, results: ['無料'] },
    { values: ['はい', 'いいえ'], impossible: false, results: [''] },
    { values: ['いいえ', 'はい'], impossible: true, results: ['無料'] },
    { values: ['いいえ', 'いいえ'], impossible: false, results: ['500円'] },
  ],
})

/**
 * 表本体の行（見出しを除く）の No セルの文字を並べる。
 *
 * **表は3つある**（条件の定義部・結果の定義部・表本体）ので、`getByRole('table')` では
 * 引けない。表本体は最後に描かれる
 */
function gridRowNumbers(): string[] {
  const grid = screen.getAllByRole('table').at(-1)
  return [...(grid?.querySelectorAll('tbody tr') ?? [])].map(
    (tr) => tr.querySelector('td')?.textContent ?? '',
  )
}

/** 条件1本・結果1本で、2行とも既に「無料」。まとめて入力を押しても値が動かない土台にする */
const allAlreadyMuryo = table({
  conditions: [condition({ id: 'cond_a', name: '条件A' })],
  outcomes: [outcome({ id: 'out_a', name: '送料', choices: ['無料', '500円'] })],
  rows: [
    { values: ['はい'], impossible: false, results: ['無料'] },
    { values: ['いいえ'], impossible: false, results: ['無料'] },
  ],
})

/**
 * 条件1本・結果2本。2本目（送料）を適用先に選んだ状態で1本目（旧）を消し、
 * 「選んでいた添字が指す先が無くなる」筋を作る土台にする。
 * **1本目（旧）の結果は空にしておく**——記入済みのまま消すと確認ダイアログが
 * 挟まり、この土台が見たい筋（添字がずれた直後にボタンを押す）から逸れる
 */
const bulkFillTwoOutcomes = table({
  conditions: [condition({ id: 'cond_a', name: '条件A' })],
  outcomes: [
    outcome({ id: 'out_old', name: '旧', choices: ['A', 'B'] }),
    outcome({ id: 'out_a', name: '送料', choices: ['無料', '500円'] }),
  ],
  rows: [
    { values: ['はい'], impossible: false, results: ['', '無料'] },
    { values: ['いいえ'], impossible: true, results: ['', '500円'] },
  ],
})

describe('絞り込み', () => {
  it('列の値を外すと、その値の行が表から消える', () => {
    renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'いいえ' }))
    expect(gridRowNumbers()).toEqual(['1', '2'])
  })

  it('列をまたいだ絞り込みは重なって効く', () => {
    renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'いいえ' }))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.keyDown(screen.getByLabelText('5000円以上か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'いいえ' }))
    expect(gridRowNumbers()).toEqual(['1'])
  })

  it('絞り込んでも No は振り直さない', () => {
    // No は行の呼び名（#N）であり、絞り込みで変わると会話の中で行を指せない
    renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'はい' }))
    expect(gridRowNumbers()).toEqual(['3', '4'])
  })

  it('起こりえない行の表示を切ると、その行だけが消える', () => {
    renderEditor(filterable)
    fireEvent.click(screen.getByLabelText('起こりえない行を表示'))
    expect(gridRowNumbers()).toEqual(['1', '2', '4'])
  })

  it('隠れている行を飛ばして上下に移る', () => {
    // 添字で隣を引くと、隠れた行の data-cell が見つからず移動が止まる
    renderEditor(filterable)
    fireEvent.click(screen.getByLabelText('起こりえない行を表示'))
    const cell = screen.getByLabelText('送料（2行目）')
    cell.focus()
    fireEvent.keyDown(cell, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByLabelText('送料（4行目）'))
  })

  it('表示中と全体の行数を出す', () => {
    renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'いいえ' }))
    expect(screen.getByText('2 / 4 行')).toBeTruthy()
  })
})

describe('まとめて入力', () => {
  it('表示中の行だけに書き込む', () => {
    const { latest } = renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'いいえ' }))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.keyDown(screen.getByLabelText('書き込む値'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: '500円' }))
    fireEvent.click(screen.getByRole('button', { name: '表示中の 2 行に適用' }))
    expect(latest()?.rows.map((r) => r.results[0])).toEqual(['500円', '500円', '無料', '500円'])
  })

  it('対象の行数をボタンに出す', () => {
    renderEditor(filterable)
    expect(screen.getByRole('button', { name: '表示中の 4 行に適用' })).toBeTruthy()
  })

  it('1手で戻せるよう、まとめ鍵を渡さない', () => {
    // 構造操作と同じ履歴の粒度にする。まとめ鍵を渡すと直前の打鍵と1手にまとまる
    const { onChange } = renderEditor(filterable)
    fireEvent.click(screen.getByRole('button', { name: '表示中の 4 行に適用' }))
    expect(onChange.mock.calls.at(-1)?.[1]).toBeNull()
  })

  it('変更した行数を通知する', () => {
    // ボタンの対象行数とは分母が違う。4行のうち、送料が既に無料でない行は2行
    // （#2 が空欄、#4 が 500円。#1 と #3 は既に無料なので数えない）
    const onToast = vi.fn()
    render(<Harness initial={filterable} onChange={vi.fn()} onToast={onToast} />)
    fireEvent.click(screen.getByRole('button', { name: '表示中の 4 行に適用' }))
    expect(onToast).toHaveBeenCalledWith('送料を「無料」にしました（2 行）')
  })

  it('起こりえないの入り切りも適用先に並ぶ', () => {
    const { latest } = renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('適用先'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: IMPOSSIBLE_LABEL }))
    fireEvent.click(screen.getByRole('button', { name: '表示中の 4 行に適用' }))
    expect(latest()?.rows.map((r) => r.impossible)).toEqual([true, true, true, true])
  })

  it('変更が無いときは onChange を呼ばず、通知だけ出す', () => {
    const onChange = vi.fn()
    const onToast = vi.fn()
    render(<Harness initial={allAlreadyMuryo} onChange={onChange} onToast={onToast} />)
    // 既定の適用先は1本目の結果、既定の値は1つ目の選択肢（無料）。
    // 2行とも既に無料なので、押しても値は動かない
    fireEvent.click(screen.getByRole('button', { name: '表示中の 2 行に適用' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(onToast).toHaveBeenCalledWith('値の変わる行はありません')
  })

  it('適用先の結果列が消えても、起こりえないへ黙って切り替わらない', () => {
    // 再現: 2本目の結果を適用先に選び値も選んだ状態で、1本目の結果を消す。
    // 位置で結果を指しているので、消した直後は選んでいた添字（1）が指す先が無くなる。
    // このとき適用先が黙って「起こりえない」へ落ちて、選んでいた値（500円）が
    // on/off の枠に居座ると、意図しない起こりえないの一括解除が起きる
    const { latest } = renderEditor(bulkFillTwoOutcomes)
    fireEvent.keyDown(screen.getByLabelText('適用先'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: '送料' }))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.keyDown(screen.getByLabelText('書き込む値'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: '500円' }))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: '結果を消す（1行目）' }))
    fireEvent.click(screen.getByRole('button', { name: '表示中の 2 行に適用' }))
    expect(latest()?.rows.map((r) => r.impossible)).toEqual([false, true])
  })
})

describe('欠落へのジャンプ', () => {
  it('隠れているセルへ飛ぶときは絞り込みを外す', () => {
    // 帯は全行を数えるので、飛び先が隠れていると数とジャンプ先が食い違う
    renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'はい' }))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(gridRowNumbers()).toEqual(['3', '4'])
    fireEvent.click(screen.getByLabelText('次の未記入へ'))
    expect(gridRowNumbers()).toEqual(['1', '2', '3', '4'])
    expect(document.activeElement).toBe(screen.getByLabelText('送料（2行目）'))
  })

  it('見えているセルへ飛ぶときは絞り込みを保つ', () => {
    renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'いいえ' }))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(gridRowNumbers()).toEqual(['1', '2'])
    fireEvent.click(screen.getByLabelText('次の未記入へ'))
    expect(gridRowNumbers()).toEqual(['1', '2'])
    expect(document.activeElement).toBe(screen.getByLabelText('送料（2行目）'))
  })
})

describe('絞り込みの報告', () => {
  it('絞り込んでいない間は全件として知らせる', () => {
    const onVisibleIds = vi.fn()
    render(
      <DecisionTableEditor
        data={filterable}
        issues={[]}
        modalOpen={false}
        onChange={vi.fn()}
        onVisibleIds={onVisibleIds}
      />,
    )
    expect(onVisibleIds).toHaveBeenLastCalledWith(null, 4)
  })

  it('絞り込むと、出ている行の鍵だけを知らせる', () => {
    const onVisibleIds = vi.fn()
    render(
      <DecisionTableEditor
        data={filterable}
        issues={[]}
        modalOpen={false}
        onChange={vi.fn()}
        onVisibleIds={onVisibleIds}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'いいえ' }))
    const [ids, total] = onVisibleIds.mock.calls.at(-1)!
    expect(total).toBe(4)
    expect(ids).toEqual(new Set([JSON.stringify(['はい', 'はい']), JSON.stringify(['はい', 'いいえ'])]))
  })
})

/** 条件2本・結果1本で、結果は全行未記入。条件を消しても確認ダイアログが挟まらない */
const filterableEmptyResults = table({
  conditions: [
    condition({ id: 'cond_a', name: '会員か' }),
    condition({ id: 'cond_b', name: '5000円以上か' }),
  ],
  outcomes: [outcome({ id: 'out_a', name: '送料', choices: ['無料', '500円'] })],
  rows: [
    { values: ['はい', 'はい'], impossible: false, results: [''] },
    { values: ['はい', 'いいえ'], impossible: false, results: [''] },
    { values: ['いいえ', 'はい'], impossible: false, results: [''] },
    { values: ['いいえ', 'いいえ'], impossible: false, results: [''] },
  ],
})

describe('絞り込みと定義部の編集', () => {
  it('絞り込んでいる値のラベルを打ち直しても行が残る', () => {
    // 絞り込みはラベルで選択を持つ。打鍵ごとに行のラベルだけが変わると、
    // 選んだラベルがどの行とも一致せず、表が黙って空になる
    renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'いいえ' }))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.change(screen.getByLabelText('値（1行目の1つ目）'), { target: { value: 'は' } })
    expect(gridRowNumbers()).toEqual(['1', '2'])
  })

  it('絞り込んでいる選択肢のラベルを打ち直しても行が残る', () => {
    renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('送料 の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '未記入' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '500円' }))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(gridRowNumbers()).toEqual(['1', '3'])
    fireEvent.change(screen.getByLabelText('選択肢（1行目の1つ目）'), { target: { value: '無' } })
    expect(gridRowNumbers()).toEqual(['1', '3'])
  })

  it('絞り込んだ列を消すと、額縁への報告も絞り込みなしへ戻る', () => {
    // 消えた列の鍵は行を隠さないので画面は全行に戻る。鍵だけが残ると、
    // 報告の側だけが絞り込み中を指したままになる
    const onVisibleIds = vi.fn()
    render(
      <Harness initial={filterableEmptyResults} onChange={vi.fn()} onVisibleIds={onVisibleIds} />,
    )
    fireEvent.keyDown(screen.getByLabelText('5000円以上か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'いいえ' }))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onVisibleIds.mock.calls.at(-1)?.[0]).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '条件を消す（2行目）' }))
    expect(gridRowNumbers()).toEqual(['1', '2'])
    expect(onVisibleIds).toHaveBeenLastCalledWith(null, 2)
  })
})
