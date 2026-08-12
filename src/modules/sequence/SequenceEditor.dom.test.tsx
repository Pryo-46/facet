// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { DIAGRAM_MARGIN, RAIL_WIDTH } from './layout'
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

describe('参加者を追加ボタン', () => {
  it('参加者がいるとき「参加者を追加」ボタンが出て、末尾に1人増える', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: '参加者を追加' }))
    expect(last(onChange).actors).toHaveLength(4)
    expect(last(onChange).actors[3].name).toBe('')
  })

  it('「参加者を追加」ボタンは既存の参加者を1人も動かさない', () => {
    // **末尾に足す**（途中に差し込まない）。配列順＝横の並びの正本なので、
    // 差し込むと既存のステップの見え方が動く
    const before = doc().actors
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: '参加者を追加' }))
    expect(last(onChange).actors.slice(0, 3).map((a) => a.id)).toEqual(before.map((a) => a.id))
  })

  it('「参加者を追加」ボタンで新しい参加者の名前欄にフォーカスが移る', () => {
    // ボタン経路のフォーカスを固定する（M2 の最終レビューが「ステップを追加」
    // ボタンで同じ穴を見つけている——キー経路だけ固定してボタン経路を放置しない）
    render(<Harness initial={doc()} />)
    fireEvent.click(screen.getByRole('button', { name: '参加者を追加' }))
    expect(document.activeElement?.getAttribute('aria-label')).toBe('参加者4の名前')
  })

  it('参加者が0人のときは「参加者を追加」ボタンを出さない（「クリックして開始」が入口）', () => {
    setup({ ...doc(), actors: [], steps: [] })
    expect(screen.queryByRole('button', { name: '参加者を追加' })).toBeNull()
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

  it('Enter でステップを追加すると新ステップの from にフォーカスが移る', () => {
    const onChange = vi.fn()
    render(<Harness initial={doc()} onChange={onChange} />)
    fireEvent.keyDown(screen.getByLabelText('ステップ1の文言'), { key: 'Enter' })
    expect(document.activeElement?.getAttribute('aria-label')).toBe('ステップ2の送り手')
  })

  it('「ステップを追加」ボタンで新ステップの from にフォーカスが移る', () => {
    const onChange = vi.fn()
    render(<Harness initial={doc()} onChange={onChange} />)
    fireEvent.click(screen.getByText('ステップを追加'))
    expect(document.activeElement?.getAttribute('aria-label')).toBe('ステップ4の送り手')
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

  it('送り手セルからの Alt+↓ でもステップが並び替わる', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('ステップ2の送り手'), { key: 'ArrowDown', altKey: true })
    expect(last(onChange).steps.map((s) => s.label)).toEqual(['注文を確定', '在庫を引当', '注文番号'])
  })

  it('形セルからの Alt+↓ でもステップが並び替わる', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('ステップ2の形'), { key: 'ArrowDown', altKey: true })
    expect(last(onChange).steps.map((s) => s.label)).toEqual(['注文を確定', '在庫を引当', '注文番号'])
  })

  it('from セルからの Alt+↓ の後、フォーカスは動かした行の from に残る', () => {
    render(<Harness initial={doc()} />)
    fireEvent.keyDown(screen.getByLabelText('ステップ2の送り手'), { key: 'ArrowDown', altKey: true })
    expect(document.activeElement?.getAttribute('aria-label')).toBe('ステップ3の送り手')
  })

  it('形セルからの Alt+↓ の後、フォーカスは動かした行の形に残る', () => {
    render(<Harness initial={doc()} />)
    fireEvent.keyDown(screen.getByLabelText('ステップ2の形'), { key: 'ArrowDown', altKey: true })
    expect(document.activeElement?.getAttribute('aria-label')).toBe('ステップ3の形')
  })

  it('答えスロットからの Alt+↓ ではステップが並び替わらない', () => {
    // doc() のステップ2は reply で答えスロットが無い（0件）ので、
    // 答えスロットを持つステップ1のスロットで検査する
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('ステップ1の答え: 失敗が確定したら？'), {
      key: 'ArrowDown',
      altKey: true,
    })
    expect(onChange).not.toHaveBeenCalled()
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

describe('セルのドロップダウンは同時に1つだけ（Task 11b）', () => {
  // from/to/種別 の3セルは SequenceEditor が持つ単一の `openCell` で
  // 制御される（各セルの `open` prop に `openCell === 自分の鍵` を渡す）。
  // これにより2つ目を開いた瞬間に1つ目が閉じる——複数同時オープン自体を
  // 構造的に禁止する（investigation-multi-menu.md 修正案B。Task 11a の
  // カウンタ化はこのタスクで巻き戻した）。
  //
  // **退化ケースを避ける**（docs/lessons-for-planning.md）——from と種別のような
  // 別種の部品を組ませる。同じ部品同士（例: from と to）だと、部品をまたぐ
  // 制御が効いていない実装でも「たまたま」通ってしまう可能性がある
  //
  // **Radix の DropdownMenuContent は Portal で document.body 直下に出る**
  // （render() が返す container の外）。だから生DOM数は container ではなく
  // document から数える
  function rawMenus(): NodeListOf<Element> {
    return document.querySelectorAll('[data-slot="dropdown-menu-content"]')
  }

  it('2つ目のセル（種別）のメニューを開くと、1つ目のセル（送り手）が閉じる', () => {
    setup()
    const from = screen.getByLabelText('ステップ1の送り手')
    const shape = screen.getByLabelText('ステップ1の形')

    fireEvent.pointerDown(from, { button: 0 })
    expect(rawMenus()).toHaveLength(1)

    fireEvent.pointerDown(shape, { button: 0 })
    // 常に「同時に開いているメニューは1つ以下」——2つ目を開いても3つにも
    // 2つにもならず、常に1つのまま
    expect(rawMenus()).toHaveLength(1)
    // 開いているのは種別のメニューであって、送り手のメニューではない
    // （STEP_SHAPE_LABEL の項目が見えているはず。送り手のメニューなら参加者名が出る）
    expect(screen.getByRole('menuitem', { name: '呼出' })).toBeDefined()
    expect(screen.queryByRole('menuitem', { name: '画面' })).toBeNull()
  })

  it('1つ目が2つ目に押し出されて閉じたあと、別のセル（受け手）をまた開ける', () => {
    // openCell が null に戻らず固まる実装（例: 2つ目を開いたときに前の鍵を
    // クリアし忘れる）を弾く
    setup()
    const from = screen.getByLabelText('ステップ1の送り手')
    const shape = screen.getByLabelText('ステップ1の形')
    const to = screen.getByLabelText('ステップ1の受け手')

    fireEvent.pointerDown(from, { button: 0 })
    fireEvent.pointerDown(shape, { button: 0 })
    expect(rawMenus()).toHaveLength(1)

    fireEvent.pointerDown(to, { button: 0 })
    expect(rawMenus()).toHaveLength(1)
    // 受け手のメニュー（参加者名の項目）が開いているはず
    expect(screen.getByRole('menuitem', { name: '画面' })).toBeDefined()
  })

  it('メニューが1つ開いている状態では、ラベル欄へ実際にフォーカスが移らず、Enter もステップを増やさない（Radix の focus trap の確認）', () => {
    // Task 11a を巻き戻すと anyModalOpen はメニューの開閉に反応しなくなる。
    // それでも実ブラウザでは Radix の FocusScope（modal 既定）がメニュー内に
    // キーボードフォーカスを閉じ込めるので、ラベル欄へ Enter が届く経路自体が
    // 生じないはず。**実ブラウザのキーボードイベントは常に
    // document.activeElement へ届く**——`fireEvent.keyDown(label, ...)` の
    // ように任意の要素へ直接送るのは、実際にはユーザーが起こせない操作になる
    // （target を選べるのは合成イベントだけ）。そこで、まず label.focus() で
    // 「メニュー外へ逃げようとする」動きを模し、それが Radix の focus trap に
    // 押し戻されて失敗すること（= activeElement が label にならないこと）を
    // 確認したうえで、実際に focus が残っている要素（トラップ内）へ Enter を
    // 送ってもステップが増えないことを見る。もし label.focus() が成功して
    // しまう（トラップが効かない）なら、それは Task 11b で作り込んだ穴なので
    // 報告すべき懸念になる
    const { onChange } = setup()
    const from = screen.getByLabelText('ステップ1の送り手')
    const label = screen.getByLabelText('ステップ1の文言')

    fireEvent.pointerDown(from, { button: 0 })
    expect(rawMenus()).toHaveLength(1)

    label.focus()
    expect(document.activeElement).not.toBe(label)

    if (document.activeElement !== null) {
      fireEvent.keyDown(document.activeElement, { key: 'Enter' })
    }
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
    expect(
      screen.getByText('─ 応答が返らないケースは、呼び出した側の「結果不明だったら？」に書く'),
    ).toBeDefined()
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

describe('ガターの行見出し（ブレスト決定9）', () => {
  it('ガターに行見出し #N 文言 が出る', () => {
    const d = doc()
    d.steps = [
      { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Aaaaaaaaa2', label: '与信依頼', awaitsReply: true },
      { id: 'step_Aaaaaaaaa2', kind: 'reply', from: 'actor_Aaaaaaaaa2', to: 'actor_Aaaaaaaaa1', label: '与信結果' },
    ]
    setup(d)
    expect(screen.getByText('#1 与信依頼')).toBeDefined()
    expect(screen.getByText('#2 与信結果')).toBeDefined()
  })

  it('文言が空のステップの行見出しは #N だけ', () => {
    const d = doc()
    d.steps[0] = { ...d.steps[0], label: '' }
    setup(d)
    // レールの通し番号も「#1」を出すので、単数 getByText は複数ヒットで throw する。
    // レール1つ＋ガター見出し1つ＝ちょうど2つであることを固定する
    expect(screen.getAllByText('#1')).toHaveLength(2)
  })
})

describe('ステップ0件のとき末尾アクターの Tab', () => {
  /** アクター2人・ステップ0件のフィクスチャ（doc() は常にステップ有りなので別建て） */
  function twoActorsNoSteps(): SequenceSchemaVersion1 {
    return {
      schemaVersion: 1,
      type: 'sequence',
      title: 't',
      actors: [
        { id: 'actor_Aaaaaaaaa1', name: '画面', domain: '自社' },
        { id: 'actor_Aaaaaaaaa2', name: 'API', domain: '自社' },
      ],
      steps: [],
    }
  }

  /** アクター2人・ステップ1件のフィクスチャ */
  function twoActorsOneStep(): SequenceSchemaVersion1 {
    return {
      ...twoActorsNoSteps(),
      steps: [
        {
          id: 'step_Aaaaaaaaa1',
          kind: 'call',
          from: 'actor_Aaaaaaaaa1',
          to: 'actor_Aaaaaaaaa2',
          label: '注文を確定',
          awaitsReply: true,
        },
      ],
    }
  }

  it('ステップ 0 件のとき、末尾アクターの Tab で最初のステップが生えて from にフォーカスする', () => {
    const onChange = vi.fn()
    render(<Harness initial={twoActorsNoSteps()} onChange={onChange} />)
    fireEvent.keyDown(screen.getByLabelText('参加者2の名前'), { key: 'Tab' })
    expect(last(onChange).steps).toHaveLength(1)
    expect(document.activeElement?.getAttribute('aria-label')).toBe('ステップ1の送り手')
  })

  it('ステップ 0 件でも、末尾でないアクターの Tab では生えない', () => {
    const { onChange } = setup(twoActorsNoSteps())
    fireEvent.keyDown(screen.getByLabelText('参加者1の名前'), { key: 'Tab' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ステップが 1 件でもあれば、末尾アクターの Tab では生えない（既定動作のまま）', () => {
    const { onChange } = setup(twoActorsOneStep())
    fireEvent.keyDown(screen.getByLabelText('参加者2の名前'), { key: 'Tab' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Shift+Tab では生えない', () => {
    const { onChange } = setup(twoActorsNoSteps())
    fireEvent.keyDown(screen.getByLabelText('参加者2の名前'), { key: 'Tab', shiftKey: true })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('レール（行の左端の編集セル列）', () => {
  /** 絶対配置のセルの矩形を style から読む（jsdom はレイアウトを計算しない） */
  function box(el: HTMLElement): { left: number; right: number } {
    const left = Number.parseFloat(el.style.left)
    return { left, right: left + Number.parseFloat(el.style.width) }
  }
  /** ラベル・参照セルは w-full の中身なので、位置を持つのは親 */
  const cellBox = (labelText: string) => box(screen.getByLabelText(labelText).parentElement!)
  /** ガターのスロットは「ラベル列＋答え」を包む2つ上の div が位置を持つ */
  const gutterLeft = (labelText: string): number =>
    Number.parseFloat(
      (screen.getByLabelText(labelText).parentElement!.parentElement as HTMLElement).style.left,
    )

  it('編集セルはレールの中に収まり、図にもガターにも侵入しない', () => {
    const { container } = setup()
    const from = cellBox('ステップ1の送り手')
    const shape = cellBox('ステップ1の形')
    expect(from.left).toBeGreaterThanOrEqual(DIAGRAM_MARGIN)
    expect(from.right).toBeLessThan(DIAGRAM_MARGIN + RAIL_WIDTH)
    // レールの最後のセル（種別）まで含めてレールの中で終わる
    expect(shape.right).toBeLessThanOrEqual(DIAGRAM_MARGIN + RAIL_WIDTH)
    // ガター: 問いラベル列の左端より手前で終わる（ここが崩れると重なる）
    expect(shape.right).toBeLessThanOrEqual(gutterLeft('ステップ1の答え: 失敗が確定したら？'))
    // 図: 先頭のライフラインより手前で終わる
    const life = container.querySelector<HTMLElement>('[data-layer="background"] .border-l')
    expect(shape.right).toBeLessThanOrEqual(Number.parseFloat(life!.style.left))
  })

  it('参加者1人・ステップ1本（図が最も細い形）でもガターと重ならない', () => {
    // **この形が実機で崩れた**——編集セルを矢印の脇に置いていたため、
    // 図が細いとガターの問いラベル列と横方向で衝突した
    setup({
      ...doc(),
      actors: [{ id: 'actor_Aaaaaaaaa1', name: '画面', domain: '自社' }],
      steps: [
        {
          id: 'step_Aaaaaaaaa1',
          kind: 'self',
          from: 'actor_Aaaaaaaaa1',
          label: '在庫を引当',
        },
      ],
    })
    const shape = cellBox('ステップ1の形')
    expect(shape.right).toBeLessThanOrEqual(gutterLeft('ステップ1の答え: 処理失敗したら？'))
  })

  it('DOM 順（＝Tab 順）はレールの視覚順: from → to → 種別 → ラベル → 答え', () => {
    // 実機フィードバックによる仕様変更: from/to は既定値が入っているため
    // 最初に打つのはラベルだが、Tab で最初に止まるのはレールの左端であってほしい
    const { container } = setup()
    // computeRowKeys が付ける行キーは `id#出現番号`（row-keys.ts）
    const cells = Array.from(
      container.querySelectorAll<HTMLElement>('[data-cell^="step_Aaaaaaaaa1#0:"]'),
    ).map((el) => el.getAttribute('data-cell')?.split(':')[1])
    expect(cells).toEqual(['from', 'to', 'shape', 'label', 'failed', 'unknown', 'ifExecuted'])
  })

  it('行が違っても同じ列に並ぶ（self の行・矢印の無い呼出でも定位置）', () => {
    const d = doc()
    // from === to の呼出は矢印が引けない（線を描かない契約）。それでもセルは出る
    d.steps[1] = {
      id: 'step_Aaaaaaaaa2',
      kind: 'call',
      from: 'actor_Aaaaaaaaa2',
      to: 'actor_Aaaaaaaaa2',
      label: '注文番号',
      awaitsReply: true,
    }
    setup(d)
    const shapes = [1, 2, 3].map((n) => cellBox(`ステップ${n}の形`))
    expect(shapes[1].left).toBe(shapes[0].left)
    // ステップ3は self（受け手セルが無い）だが、種別セルの x は動かない
    expect(shapes[2].left).toBe(shapes[0].left)
    expect(screen.getByLabelText('ステップ2の送り手')).toBeDefined()
    expect(cellBox('ステップ2の送り手').left).toBe(cellBox('ステップ1の送り手').left)
    expect(screen.queryByLabelText('ステップ3の受け手')).toBeNull()
  })
})

describe('操作ヒントとラベルの面', () => {
  it('操作ヒントが常時表示される', () => {
    // getByText の既定ノーマライザは textContent 側の空白（全角スペース含む）を
    // 単一の半角スペースへ畳むが、matcher 文字列そのものは畳まない
    // （testing-library/dom の matches()）。畳んだ形で問い合わせる
    setup()
    expect(
      screen.getByText('Enter: ステップ追加 Tab: セル移動 Ctrl+Enter: 考慮不要 Alt+↑↓: 並び替え'),
    ).toBeDefined()
  })

  it('通常時のラベルセルは不透明の面（bg-surface）を持つ（入力できる見た目のため）', () => {
    setup()
    expect(screen.getByLabelText('ステップ1の文言').className).toContain('bg-surface')
  })
})

describe('立っていない答えのグレースロット', () => {
  /**
   * call-sync（awaitsReply: true）で failed に「再試行する」を回答済みのまま
   * 投げっぱなし（awaitsReply: false）へ切替、のフィクスチャ。
   * 投げっぱなしは unknown だけが立つ（poseQuestions）ので、failed は
   * 立っていない答え（ghost）になる
   */
  function ghostDoc(): SequenceSchemaVersion1 {
    return {
      schemaVersion: 1,
      type: 'sequence',
      title: 't',
      actors: [
        { id: 'actor_Bbbbbbbbb1', name: '画面' },
        { id: 'actor_Bbbbbbbbb2', name: 'API' },
      ],
      steps: [
        {
          id: 'step_Bbbbbbbbb1',
          kind: 'call',
          from: 'actor_Bbbbbbbbb1',
          to: 'actor_Bbbbbbbbb2',
          label: '通知',
          awaitsReply: false,
          failures: { failed: { decision: 'handled', text: '再試行する' } },
        },
      ],
    }
  }

  it('立っていない答えがグレースロットとして描画される', () => {
    setup(ghostDoc())
    expect(screen.getByText('再試行する')).toBeDefined()
    expect(screen.getByText('失敗が確定したら？')).toBeDefined() // 打ち消し線付きの問いラベル
  })

  it('✕ を押すと確認ダイアログが出て、削除で failures から消える', () => {
    const onChange = vi.fn()
    render(<Harness initial={ghostDoc()} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText(/この答えを削除/))
    fireEvent.click(screen.getByText('削除する'))
    expect(last(onChange).steps[0].failures?.failed).toBeUndefined()
  })

  it('確認ダイアログでキャンセルすると何も変わらない', () => {
    const onChange = vi.fn()
    render(<Harness initial={ghostDoc()} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText(/この答えを削除/))
    fireEvent.click(screen.getByText('キャンセル'))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('再試行する')).toBeDefined()
  })

  it('notApplicable の立っていない答えは「─ 考慮不要」で見える', () => {
    const d = ghostDoc()
    d.steps[0] = {
      ...d.steps[0],
      failures: { failed: { decision: 'notApplicable' } },
    }
    setup(d)
    expect(screen.getByText('─ 考慮不要')).toBeDefined()
  })

  it('reply 行でも立っていない答えがグレースロットで出る（行内表示＝ブレスト決定7）', () => {
    const d = ghostDoc()
    d.steps[0] = {
      id: 'step_Bbbbbbbbb1',
      kind: 'reply',
      from: 'actor_Bbbbbbbbb1',
      to: 'actor_Bbbbbbbbb2',
      label: '通知結果',
      failures: { failed: { decision: 'handled', text: '再試行する' } },
    }
    setup(d)
    // reply の一般文言は、ghost があるこの行では省略する（brief (c) の選択。報告に記載）
    expect(screen.queryByText(/^─ 応答が返らない/)).toBeNull()
    expect(screen.getByText('再試行する')).toBeDefined()
    expect(screen.getByLabelText(/この答えを削除/)).toBeDefined()
  })

  it('種別を元に戻すと答えは通常スロットに復活する', () => {
    // 投げっぱなし→（形セルで）call-sync に戻す → 「再試行する」が編集可能なスロットに居る。
    // 既存の setStepShape が failures を消さないことの画面側の固定
    render(<Harness initial={ghostDoc()} />)
    // STEP_SHAPE_ORDER は [call-sync, call-async, reply, self]。
    // 投げっぱなし（call-async）から ArrowUp 1回で call-sync に戻る
    fireEvent.keyDown(screen.getByLabelText('ステップ1の形'), { key: 'ArrowUp' })
    const slot = screen.getByLabelText('ステップ1の答え: 失敗が確定したら？') as HTMLInputElement
    expect(slot.value).toBe('再試行する')
    expect(screen.queryByLabelText(/この答えを削除/)).toBeNull()
  })
})

describe('self の to-mismatch は行の帯になる', () => {
  it('self なのに to があるステップは行の帯（row）扱いになる', () => {
    const d = doc()
    d.steps[2] = { ...d.steps[2], to: 'actor_Aaaaaaaaa1' }
    const { container } = setup(d, [
      {
        rule: 'to-mismatch',
        message: 'x',
        locations: [{ entityId: 'step_Aaaaaaaaa3', entityIndex: 2, field: 'to' }],
      },
    ])
    const bands = container.querySelectorAll<HTMLElement>('[data-layer="background"] .bg-warning\\/20')
    expect(bands).toHaveLength(1)
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
