// @vitest-environment jsdom
import { useState } from 'react'
import { MessageSquare, ThumbsUp, TriangleAlert, CircleHelp } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { badgeClass } from '@/components/badge-styles'
import { createEstimateMeasurer } from '@/core/canvas/wrap'
import type { Feedback, IssueTreeSchemaVersion3 } from '@/types/issue-tree'
import {
  addAsk,
  addFeedback,
  removeFeedback,
  setAskText,
  setFeedbackText,
} from './commands'
import { poseQuestions, QUESTION_LABELS } from './derive'
import { HypothesisPanel } from './HypothesisPanel'
import {
  ADD_ASK_LABEL,
  ADD_NOTE_LABEL,
  layoutIssueTree,
  NO_ASK_TEXT,
  type IssueTreeFonts,
} from './layout'

afterEach(cleanup)

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`
const A = (n: number): string => `ask_${String(n).padStart(10, 'A')}`

/** 測定は決定的な概算器で行う（jsdom はレイアウトを持たない） */
const fonts: IssueTreeFonts = {
  title: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  expandedTitle: { measure: createEstimateMeasurer(18), lineHeight: 27 },
  body: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  small: { measure: createEstimateMeasurer(14), lineHeight: 18 },
}

/**
 * **目印の文字列を使う**（`HypothesisPanel.dom.test.tsx` と同じ流儀）。
 * 「出ている」を空でない値で見ると、フィクスチャを変えただけで意味が変わる
 */
const ASK_ANSWERED = '3時間で十分か（ASK1）'
const ASK_AWAITING = '受け損ねをどう防ぐか（ASK2）'
const FB_LIKE = '朝夕の2回で十分（LIKE）'
const FB_CONCERN = '応募直後に見たいので遅い（CONCERN）'
const FB_LOOSE = '媒体ごとに仕様が違うのでは（LOOSE）'
const FB_GHOST = '消えた問いへの答え（GHOST）'

const feedback = (over: Partial<Feedback>): Feedback => ({
  askId: null,
  text: '',
  by: '',
  sentiment: 'note',
  date: '2026-08-12',
  ...over,
})

/**
 * 課題2件・仮説2件。仮説1は**問い2件（答えのある問い／FB待ちの問い）と、
 * 紐づかない FB・宙に浮いた `askId` の FB** を持つ。調子は4種そろえてある
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
      detail: '',
      value: '',
      asks: [
        { id: A(1), text: ASK_ANSWERED },
        { id: A(2), text: ASK_AWAITING },
      ],
      feedbacks: [
        feedback({ askId: A(1), text: FB_LIKE, by: '佐藤さん', sentiment: 'like' }),
        feedback({ askId: null, text: FB_LOOSE, sentiment: 'note', date: '2026-08-13' }),
        feedback({
          askId: A(1),
          text: FB_CONCERN,
          by: '田中さん',
          sentiment: 'concern',
          date: '2026-08-14',
        }),
        // **実在しない問いを指す FB。** スキーマは「存在しない ask を指していても
        // ファイルは開ける」と明記している（手書き・AI が書いたファイル）
        feedback({ askId: A(9), text: FB_GHOST, sentiment: 'question', date: '2026-08-15' }),
      ],
      events: [],
    },
    {
      // **FB 3件の仮説**（削除の番人。2件だと「常に末尾を消す」実装と区別が付かない）
      id: H(2),
      issueId: I(1),
      title: 'webhook受信に切り替える',
      detail: '',
      value: '',
      asks: [],
      feedbacks: [
        feedback({ text: 'FB1' }),
        feedback({ text: 'FB2' }),
        feedback({ text: 'FB3' }),
      ],
      events: [],
    },
  ],
}

/** 祖先が見送っている木（抑制の番人）。仮説と問いはそのまま */
const deferredData: IssueTreeSchemaVersion3 = {
  ...data,
  issues: [
    {
      ...data.issues[0],
      events: [{ kind: 'deferred', note: '今回は追わない', date: '2026-08-01' }],
    },
    data.issues[1],
  ],
}

/**
 * パネル1枚を状態つきで描く。**コマンド（`commands.ts`）を通して書き戻す**
 *——「押すと何が起きるか」はボタンとコマンドの継ぎ目に宿るので、
 * spy だけで受けると配線の間違い（渡す `askId` や添字）が緑のまま通る
 */
function Harness(props: {
  index: number
  initial?: IssueTreeSchemaVersion3
  onAdd?: (askId: string | null) => void
}) {
  const [file, setFile] = useState(props.initial ?? data)
  const index = props.index
  const h = file.hypotheses[index]
  const ownerIndex = file.issues.findIndex((n) => n.id === h.issueId)
  const posed = poseQuestions(file)
  const layout = layoutIssueTree(file, posed, fonts, ownerIndex)
  const placement = layout.hypotheses[index]
  const owner = layout.issues[ownerIndex]
  if (placement === null || placement.expanded === null || owner === null) {
    throw new Error(`仮説${index + 1}のパネルが無い`)
  }
  const suppressed = file.issues.some((n) => n.events.length > 0)
  return (
    <HypothesisPanel
      hypothesisKey={`row${index}`}
      label={`仮説${index + 1}`}
      panel={placement.expanded}
      origin={owner.rect}
      hypothesis={h}
      invalid={false}
      suppressed={suppressed}
      onTitleChange={vi.fn()}
      onDetailChange={vi.fn()}
      onValueChange={vi.fn()}
      onAskTextChange={(askIndex, next) => setFile(setAskText(file, index, askIndex, next))}
      onAddAsk={() => setFile(addAsk(file, index).data)}
      onFeedbackTextChange={(fi, next) => setFile(setFeedbackText(file, index, fi, next))}
      onEventNoteChange={vi.fn()}
      onAddFeedback={(askId) => {
        props.onAdd?.(askId)
        setFile(addFeedback(file, index, askId, '2026-08-30').data)
      }}
      onRemoveFeedback={(fi) => setFile(removeFeedback(file, index, fi).data)}
      judgementMenu={<button type="button">判断を追加</button>}
    />
  )
}

/** 問いブロック（`role="group"`）を名前で引く */
const block = (name: string): HTMLElement => screen.getByRole('group', { name })
const looseBlock = (label = '仮説1'): HTMLElement => block(`${label} の${NO_ASK_TEXT}`)

/** DOM 順（＝描画順）で a が b より前にあるか */
function precedes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

/** アイコンの「形」＝ svg の中身。**クラス名に依らずに図形そのものを見る** */
function shapeOf(icon: React.ReactElement): string {
  const host = document.createElement('div')
  const view = render(icon, { container: host })
  const svg = host.querySelector('svg')
  const shape = svg === null ? '' : svg.innerHTML
  view.unmount()
  return shape
}

describe('AskBlock: 問いと FB の入れ子', () => {
  it('FB は答えた問いのブロックの中に、データの順で並ぶ', () => {
    render(<Harness index={0} />)
    const answered = block('仮説1 の聞きたいこと1')
    expect(within(answered).getByRole('textbox', { name: '仮説1 のFB1' })).toBeTruthy()
    expect(within(answered).getByRole('textbox', { name: '仮説1 のFB3' })).toBeTruthy()
    // 別の問いの FB も、紐づかない FB もこのブロックには入らない
    expect(within(answered).queryByRole('textbox', { name: '仮説1 のFB2' })).toBeNull()
    expect(
      within(answered).getAllByRole('textbox', { name: /^仮説1 のFB/ }).map((e) => e.textContent),
    ).toHaveLength(2)
    // ブロックは asks の順。**FB待ちの問いも中身が空のまま出る**
    expect(precedes(answered, block('仮説1 の聞きたいこと2'))).toBe(true)
  })

  it('FB が0件の問いには FB待ち が立ち、答えのある問いには立たない', () => {
    render(<Harness index={0} />)
    const awaiting = within(block('仮説1 の聞きたいこと2')).getByText(QUESTION_LABELS.feedback)
    // **畳まれた行の「FB待ち」と同じ語彙**（着信＝返事を待っている。derive.ts）
    expect(awaiting.className).toBe(badgeClass('pending'))
    expect(
      within(block('仮説1 の聞きたいこと1')).queryByText(QUESTION_LABELS.feedback),
    ).toBeNull()
  })

  /**
   * **数え直していないことの番人。** 抑制（祖先の見送り・解決）で問いが立たない
   * ことを決めているのは `derive.ts` だけで、ここはその結果（`posed`）を読む。
   * 自前で「FB が0件か」を数え始めると、見送った枝の中で FB待ちが復活する
   */
  it('祖先が見送っている仮説には FB待ち が立たない', () => {
    render(<Harness index={0} initial={deferredData} />)
    expect(screen.queryByText(QUESTION_LABELS.feedback)).toBeNull()
  })

  it('どの問いにも紐づかない FB は最後のブロックに出る', () => {
    render(<Harness index={0} />)
    const loose = looseBlock()
    expect(within(loose).getByRole('textbox', { name: '仮説1 のFB2' })).toBeTruthy()
    // 末尾＝どの問いのブロックよりも後ろ
    expect(precedes(block('仮説1 の聞きたいこと2'), loose)).toBe(true)
    // 見出しは固定文で、編集できない（問いではないので `ask` の欄を持たない）
    expect(within(loose).getByText(NO_ASK_TEXT)).toBeTruthy()
    expect(within(loose).queryByRole('textbox', { name: /聞きたいこと/ })).toBeNull()
  })

  /**
   * **裁定A。** スキーマは「存在しない ask を指していてもファイルは開ける」と
   * 言っているので、手書き・AI が書いたファイルには宙に浮いた `askId` がありうる。
   * 素朴に「問いごとに絞る＋`askId === null` を集める」と、それらはどの
   * ブロックにも入らず**画面から黙って消える**（ファイルにあるものが黙って
   * 減るのが一番たちが悪い＝`normalizeOrder` の註）
   */
  it('実在しない askId を持つ FB も末尾のブロックに出る（黙って消えない）', () => {
    render(<Harness index={0} />)
    const ghost = screen.getByRole('textbox', { name: '仮説1 のFB4' })
    expect((ghost as HTMLTextAreaElement).value).toBe(FB_GHOST)
    expect(looseBlock().contains(ghost)).toBe(true)
    // ファイルの FB は1件も減っていない
    expect(screen.getAllByRole('textbox', { name: /^仮説1 のFB\d+$/ })).toHaveLength(4)
  })

  it('問いブロックの「＋FB」は、その問いの askId を渡す', () => {
    const onAdd = vi.fn()
    render(<Harness index={0} onAdd={onAdd} />)
    fireEvent.click(
      within(block('仮説1 の聞きたいこと2')).getByRole('button', {
        name: '仮説1 の聞きたいこと2にFBを足す',
      }),
    )
    // **`null` を渡す実装でも「FB が1件増える」は緑になる**ので、渡した値を見る
    expect(onAdd).toHaveBeenCalledWith(A(2))
    // 足した FB はその問いのブロックに入り、FB待ちは解ける
    const awaiting = block('仮説1 の聞きたいこと2')
    expect(within(awaiting).getByRole('textbox', { name: '仮説1 のFB5' })).toBeTruthy()
    expect(within(awaiting).queryByText(QUESTION_LABELS.feedback)).toBeNull()
  })

  it('末尾のブロックの「＋FB」は、どの問いにも紐づかない FB を作る', () => {
    const onAdd = vi.fn()
    render(<Harness index={0} onAdd={onAdd} />)
    fireEvent.click(
      within(looseBlock()).getByRole('button', {
        name: `仮説1 に${NO_ASK_TEXT}を足す`,
      }),
    )
    expect(onAdd).toHaveBeenCalledWith(null)
    expect(within(looseBlock()).getByRole('textbox', { name: '仮説1 のFB5' })).toBeTruthy()
  })
})

describe('AskBlock: FB の行', () => {
  it('削除ボタンを押すとその1件だけが消える', () => {
    render(<Harness index={1} />)
    fireEvent.click(screen.getByRole('button', { name: '仮説2 のFB2を消す' }))
    // **件数だけを見ない**（常に末尾を消す実装でも 3 → 2 は合う）。残った本文を見る
    const rest = screen
      .getAllByRole('textbox', { name: /^仮説2 のFB\d+$/ })
      .map((e) => (e as HTMLTextAreaElement).value)
    expect(rest).toEqual(['FB1', 'FB3'])
  })

  it('発言者と日付が行の右に出る（日付の入力欄は作らない）', () => {
    render(<Harness index={0} />)
    const row = block('仮説1 の聞きたいこと1')
    expect(within(row).getByText('佐藤さん · 8/12')).toBeTruthy()
    expect(within(row).getByText('田中さん · 8/14')).toBeTruthy()
    // 発言者が空なら日付だけ（中黒が浮かない）
    expect(within(looseBlock()).getByText('8/13')).toBeTruthy()
    // 日付は**アプリが追記時に入れる**。打たせる欄を作らない
    expect(screen.queryByRole('textbox', { name: /日付/ })).toBeNull()
  })

  it('sentiment ごとにアイコンの形が変わり、色は付かない', () => {
    render(<Harness index={0} />)
    const iconOf = (sentiment: string): HTMLElement => {
      const found = document.querySelector(`[data-sentiment="${sentiment}"] svg`)
      if (found === null) throw new Error(`${sentiment} のアイコンが無い`)
      return found as unknown as HTMLElement
    }
    // **形そのもの（svg の中身）で見る**——クラス名の付け方はライブラリの都合
    expect(iconOf('like').innerHTML).toBe(shapeOf(<ThumbsUp />))
    expect(iconOf('concern').innerHTML).toBe(shapeOf(<TriangleAlert />))
    expect(iconOf('question').innerHTML).toBe(shapeOf(<CircleHelp />))
    expect(iconOf('note').innerHTML).toBe(shapeOf(<MessageSquare />))
    // 4種が互いに違う形であること（同じ形に潰れていたら区別が付かない）
    const shapes = ['like', 'concern', 'question', 'note'].map((s) => iconOf(s).innerHTML)
    expect(new Set(shapes).size).toBe(4)
    // **意味軸の色（欠落・無効・着信・判断）を使わない**——sentiment は判断ではない
    for (const s of ['like', 'concern', 'question', 'note']) {
      const wrapper = document.querySelector(`[data-sentiment="${s}"]`)
      expect(wrapper?.className).not.toMatch(/missing|invalid|pending|judge/)
    }
  })
})

describe('AskBlock: 節の末尾のボタン', () => {
  it('「聞きたいことを追加」で問いのブロックが増える', () => {
    render(<Harness index={1} />)
    // 仮説2 は問いを持たない（ブロックは「紐づかないFB」の1つだけ）
    expect(screen.getAllByRole('group')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '仮説2 に聞きたいことを足す' }))
    const added = screen.getByRole('textbox', { name: '仮説2 の聞きたいこと1の文言' })
    expect((added as HTMLTextAreaElement).value).toBe('')
    fireEvent.change(added, { target: { value: '何回設定できれば足りるか' } })
    expect(
      (screen.getByRole('textbox', { name: '仮説2 の聞きたいこと1の文言' }) as HTMLTextAreaElement)
        .value,
    ).toBe('何回設定できれば足りるか')
  })

  it('2つのボタンの文言はキャンバスの逐語', () => {
    render(<Harness index={0} />)
    expect(screen.getByRole('button', { name: '仮説1 に聞きたいことを足す' }).textContent).toBe(
      ADD_ASK_LABEL,
    )
    expect(screen.getByRole('button', { name: '仮説1 にFBを足す' }).textContent).toBe(
      ADD_NOTE_LABEL,
    )
  })

  it('紐づかない FB が1件も無ければ、末尾のブロックは出ない', () => {
    const clean: IssueTreeSchemaVersion3 = {
      ...data,
      hypotheses: [
        {
          ...data.hypotheses[0],
          feedbacks: [data.hypotheses[0].feedbacks[0]],
        },
        data.hypotheses[1],
      ],
    }
    render(<Harness index={0} initial={clean} />)
    expect(screen.queryByText(NO_ASK_TEXT)).toBeNull()
    expect(screen.getAllByRole('group')).toHaveLength(2)
  })
})
