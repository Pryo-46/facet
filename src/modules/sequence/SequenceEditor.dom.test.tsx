// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { SequenceEditor } from './SequenceEditor'

afterEach(cleanup)

function doc(): SequenceSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'sequence',
    title: 't',
    actors: [
      { id: 'actor_Aaaaaaaaa1', name: '画面', domain: '自社' },
      { id: 'actor_Aaaaaaaaa2', name: 'API', domain: '自社' },
      { id: 'actor_Aaaaaaaaa3', name: '決済', domain: '決済会社' },
    ],
    steps: [
      { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Aaaaaaaaa2', label: '注文を確定', awaitsReply: true },
      { id: 'step_Aaaaaaaaa2', kind: 'reply', from: 'actor_Aaaaaaaaa2', to: 'actor_Aaaaaaaaa1', label: '注文番号' },
      { id: 'step_Aaaaaaaaa3', kind: 'self', from: 'actor_Aaaaaaaaa2', label: '在庫を引当' },
    ],
  }
}

function setup(data = doc(), issues: never[] | Parameters<typeof SequenceEditor>[0]['issues'] = []) {
  const onChange = vi.fn()
  const { container } = render(
    <SequenceEditor data={data} onChange={onChange} issues={issues} modalOpen={false} />,
  )
  return { onChange, container }
}

/**
 * 額縁と同じく onChange を state に反映する殻（logic-tree の DOM テストと同じ作法）。
 * **1打鍵で2回 onChange が起きる経路**の検査に要る——素の setup は data が
 * 固定なので、2回目が1回目の結果の上に載っているかを見られない
 */
function Harness({
  initial,
  onChange,
}: {
  initial: SequenceSchemaVersion1
  onChange?: (next: SequenceSchemaVersion1, mergeKey?: string | null) => void
}) {
  const [data, setData] = useState(initial)
  return (
    <SequenceEditor
      data={data}
      onChange={(next, mergeKey) => {
        onChange?.(next, mergeKey)
        setData(next)
      }}
      issues={[]}
      modalOpen={false}
    />
  )
}

/** onChange の最後の呼び出しのデータを取り出す */
function last(onChange: ReturnType<typeof vi.fn>): SequenceSchemaVersion1 {
  return onChange.mock.calls[onChange.mock.calls.length - 1][0] as SequenceSchemaVersion1
}

describe('空状態', () => {
  it('「クリックして開始」で最初の参加者ができる', () => {
    const { onChange } = setup({ ...doc(), actors: [], steps: [] })
    fireEvent.click(screen.getByRole('button', { name: 'クリックして開始' }))
    expect(last(onChange).actors).toHaveLength(1)
  })

  it('参加者がいてステップ0件なら「ステップを追加」ボタンが出る', () => {
    const { onChange } = setup({ ...doc(), steps: [] })
    fireEvent.click(screen.getByRole('button', { name: 'ステップを追加' }))
    expect(last(onChange).steps).toHaveLength(1)
  })
})

describe('参加者ヘッダ', () => {
  it('Enter で直後に参加者が増える', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('参加者1の名前'), { key: 'Enter' })
    expect(last(onChange).actors).toHaveLength(4)
    expect(last(onChange).actors[1].name).toBe('')
  })

  it('IME 変換確定の Enter では増えない（最重要）', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('参加者1の名前'), { key: 'Enter', isComposing: true })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Alt+→ で並び替え（3人の真ん中から）', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('参加者2の名前'), { key: 'ArrowRight', altKey: true })
    expect(last(onChange).actors.map((a) => a.name)).toEqual(['画面', '決済', 'API'])
  })

  it('空欄 Backspace で消える', () => {
    const d = doc()
    d.actors[1] = { ...d.actors[1], name: '' }
    const { onChange } = setup(d)
    fireEvent.keyDown(screen.getByLabelText('参加者2の名前'), { key: 'Backspace' })
    expect(last(onChange).actors).toHaveLength(2)
  })
})

describe('ステップ行', () => {
  it('ラベルで Enter → 直後にステップが増える（from/to は往復の既定値）', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('ステップ1の文言'), { key: 'Enter' })
    const steps = last(onChange).steps
    expect(steps).toHaveLength(4)
    expect(steps[1].from).toBe('actor_Aaaaaaaaa2')
    expect(steps[1].to).toBe('actor_Aaaaaaaaa1')
  })

  it('IME 変換確定の Enter ではステップが増えない（最重要）', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('ステップ1の文言'), { key: 'Enter', isComposing: true })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Alt+↓ で並び替え（3行の真ん中から）', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('ステップ2の文言'), { key: 'ArrowDown', altKey: true })
    expect(last(onChange).steps.map((s) => s.label)).toEqual(['注文を確定', '在庫を引当', '注文番号'])
  })

  it('空欄 Backspace でステップが消える', () => {
    const d = doc()
    d.steps[1] = { ...d.steps[1], label: '' }
    const { onChange } = setup(d)
    fireEvent.keyDown(screen.getByLabelText('ステップ2の文言'), { key: 'Backspace' })
    expect(last(onChange).steps).toHaveLength(2)
  })

  it('Ctrl+Z は消費しない（額縁のグローバル層に届く）', () => {
    const { onChange } = setup()
    const result = fireEvent.keyDown(screen.getByLabelText('ステップ1の文言'), {
      key: 'z',
      ctrlKey: true,
    })
    expect(result).toBe(true) // preventDefault されていない
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('問いスロット（ガター）', () => {
  it('応答待ちの呼出には3スロット、reply には0、self には1つ立つ', () => {
    setup()
    // このリポジトリは jest-dom を入れていないので、存在の確認は getBy* が
    // 投げること＋toBeDefined で行う（logic-tree / 用語集の DOM テストと同じ作法）
    expect(screen.getByLabelText('ステップ1の答え: 失敗が確定したら？')).toBeDefined()
    expect(screen.getByLabelText('ステップ1の答え: 結果不明だったら？')).toBeDefined()
    expect(screen.getByLabelText('ステップ1の答え: 実行済みだったら？')).toBeDefined()
    expect(screen.queryByLabelText(/ステップ2の答え/)).toBeNull()
    expect(screen.getByLabelText('ステップ3の答え: 処理失敗したら？')).toBeDefined()
  })

  it('reply の行には「問いは呼出側」の説明が出る（空白にしない）', () => {
    setup()
    expect(screen.getByText('─ 応答の失敗は呼出側の「結果不明」が扱う')).toBeDefined()
  })

  it('答えを打つと handled で書かれる', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByLabelText('ステップ1の答え: 失敗が確定したら？'), {
      target: { value: 'エラー表示' },
    })
    expect(last(onChange).steps[0].failures?.failed).toEqual({
      decision: 'handled',
      text: 'エラー表示',
    })
  })

  it('Ctrl+Enter で考慮不要トグル', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('ステップ1の答え: 失敗が確定したら？'), {
      key: 'Enter',
      ctrlKey: true,
    })
    expect(last(onChange).steps[0].failures?.failed).toEqual({ decision: 'notApplicable' })
  })

  it('未回答の集計が出る（doc() は failed/unknown/ifExecuted ＋ self の failed の計4問が未回答）', () => {
    setup()
    expect(screen.getByText(/未定義 4/)).toBeDefined()
  })
})

describe('参照セルの確定', () => {
  it('未登録名を打っての Enter は参加者を足すだけ（ステップは増えない）', () => {
    // **1打鍵で確定と行追加が両方走ると、後から届いた行追加が
    // 古い data から作られていて確定を消す**（インライン作成した参加者ごと）
    const onChange = vi.fn()
    render(<Harness initial={doc()} onChange={onChange} />)
    const cell = screen.getByLabelText('ステップ1の受け手')
    fireEvent.change(cell, { target: { value: 'メール基盤' } })
    fireEvent.keyDown(cell, { key: 'Enter' })
    const afterCommit = last(onChange)
    expect(afterCommit.actors).toHaveLength(4)
    expect(afterCommit.actors[3].name).toBe('メール基盤')
    expect(afterCommit.steps).toHaveLength(3)
    expect(afterCommit.steps[0].to).toBe(afterCommit.actors[3].id)

    // 確定済み（ドラフト無し）のセルで押せば、従来どおりステップが増える
    fireEvent.keyDown(screen.getByLabelText('ステップ1の受け手'), { key: 'Enter' })
    const afterInsert = last(onChange)
    expect(afterInsert.steps).toHaveLength(4)
    expect(afterInsert.actors).toHaveLength(4)
  })
})

describe('赤表示', () => {
  it('行全体の赤は warning の面を2枚重ねない（M8「面は片方だけ」）', () => {
    const { container } = setup(doc(), [
      {
        rule: 'duplicate-id',
        message: 'x',
        locations: [{ entityId: 'step_Aaaaaaaaa1', entityIndex: 0, field: 'id' }],
      },
    ])
    const band = container.querySelector<HTMLElement>('[data-layer="background"] .bg-warning\\/20')
    expect(band).not.toBe(null)
    // 図の側: 文言セルは自分の面を持たない（帯を透かす）
    expect(screen.getByLabelText('ステップ1の文言').className).toContain('bg-transparent')
    expect(screen.getByLabelText('ステップ1の文言').className).not.toContain('bg-warning')
    // ガターの側: 帯はスロット（未定義の bg-warning/10）の手前で止まる
    const slot = screen.getByLabelText('ステップ1の答え: 失敗が確定したら？')
    const slotBox = slot.parentElement?.parentElement as HTMLElement
    const bandRight =
      Number.parseFloat(band?.style.left ?? '0') + Number.parseFloat(band?.style.width ?? '0')
    expect(bandRight).toBeLessThanOrEqual(Number.parseFloat(slotBox.style.left))
  })

  it('missing-actor の issue が from セルに赤を付ける', () => {
    const d = doc()
    d.steps[0] = { ...d.steps[0], from: 'actor_Zzzzzzzzz9' }
    setup(d, [
      {
        rule: 'missing-actor',
        message: 'x',
        locations: [{ entityId: 'step_Aaaaaaaaa1', entityIndex: 0, field: 'from' }],
      },
    ])
    const cell = screen.getByLabelText('ステップ1の送り手') as HTMLInputElement
    expect(cell.className).toContain('bg-warning/20')
  })
})
